from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.services import session_state as state
from app.services.file_storage import build_zip, get_notebook_content, get_manifest
from app.services.notebook_combiner import (
    COMBINED_FILENAME,
    combine_notebooks,
    load_combined_notebook,
    replace_combined_notebook,
)
from app.workers.notebook_worker import run_notebook_generation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}/notebooks", tags=["notebooks"])


def ok(data):
    return {"success": True, "data": data, "error": None}


class GenerateRequest(BaseModel):
    from_iter_idx: int | None = None  # None → use latest complete iteration


@router.post("")
async def generate_notebooks(
    session_id: str,
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
):
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    # Determine which iteration to use
    from_iter = body.from_iter_idx
    if from_iter is None:
        from_iter = state.get_current_iter_idx(session_id)

    if from_iter < 0:
        raise HTTPException(400, "No iterations available — run schema design first")

    # Validate it's complete
    detail = state.get_iteration_detail(session_id, from_iter)
    if not detail or detail["status"] != "complete":
        raise HTTPException(400, f"Iteration {from_iter} is not complete")

    background_tasks.add_task(
        run_notebook_generation,
        session_id=session_id,
        from_iter_idx=from_iter,
    )

    return JSONResponse(
        status_code=202,
        content=ok({
            "status": "running",
            "from_iter_idx": from_iter,
            "poll_url": f"/api/v1/sessions/{session_id}/notebooks/status",
        }),
    )


@router.get("/status")
async def get_notebook_status(session_id: str):
    job = state.get_notebook_job(session_id)
    if not job:
        raise HTTPException(404, "No notebook job found for this session")
    return ok(job)


@router.get("/download")
async def download_notebooks_zip(session_id: str):
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    zip_bytes = build_zip(session_id)
    if not zip_bytes:
        raise HTTPException(404, "No notebooks generated yet")

    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="notebooks_{session_id}.zip"'
        },
    )


@router.get("/manifest")
async def get_notebook_manifest(session_id: str):
    manifest = get_manifest(session_id)
    return ok(manifest)


@router.get("/{filename}")
async def get_notebook(session_id: str, filename: str):
    nb = get_notebook_content(session_id, filename)
    if nb is None:
        raise HTTPException(404, f"Notebook '{filename}' not found")
    return ok(nb)


# ---------------------------------------------------------------------------
# Combined notebook endpoints
# ---------------------------------------------------------------------------

class PolishRequest(BaseModel):
    with_polish: bool = False  # True → run LLM supervisor pass after deterministic merge


def _run_supervisor_job(session_id: str) -> None:
    """Background task: run LLM polish on an already-combined notebook."""
    try:
        from app.agents.notebook_supervisor import notebook_supervisor
        nb = load_combined_notebook(session_id)
        if not nb:
            state.fail_combine_job(session_id, "Combined notebook not found for polish pass.")
            return

        state.update_combine_progress(session_id, stage="polishing")
        result = notebook_supervisor.run(nb)

        replace_combined_notebook(session_id, result["notebook_json"])
        state.complete_combine_job(
            session_id,
            filename=COMBINED_FILENAME,
            polish_skipped=result["skipped"],
            polish_skip_reason=result.get("skip_reason"),
            supervisor_notes=result.get("notes", ""),
        )
    except Exception as exc:
        logger.exception(f"[{session_id}] supervisor pass error: {exc}")
        state.fail_combine_job(session_id, str(exc)[:500])


def _run_combine_job(session_id: str, with_polish: bool) -> None:
    """Background task: deterministic merge + optional LLM polish."""
    try:
        state.create_combine_job(session_id, with_polish)
        summary = combine_notebooks(session_id)
        state.update_combine_progress(
            session_id,
            stage="polishing" if with_polish else "complete",
            filename=summary["filename"],
            char_count=summary["char_count"],
            domain_count=len(summary["domains"]),
        )

        if with_polish:
            _run_supervisor_job(session_id)
        else:
            state.complete_combine_job(
                session_id,
                filename=summary["filename"],
                char_count=summary["char_count"],
                domain_count=len(summary["domains"]),
                polish_skipped=True,
                polish_skip_reason="not_requested",
                supervisor_notes="",
            )
    except Exception as exc:
        logger.exception(f"[{session_id}] combine job error: {exc}")
        state.fail_combine_job(session_id, str(exc)[:500])


@router.post("/combine")
async def combine(
    session_id: str,
    body: PolishRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger (re)generation of the combined notebook.
    If with_polish=true, runs the LLM supervisor pass afterward.
    Returns 202 immediately; poll /combine/status for progress.
    """
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    # Require at least one per-domain notebook to exist first
    if not get_manifest(session_id):
        raise HTTPException(400, "No notebooks found — generate per-domain notebooks first")

    background_tasks.add_task(_run_combine_job, session_id, body.with_polish)

    return JSONResponse(
        status_code=202,
        content=ok({
            "status": "running",
            "with_polish": body.with_polish,
            "poll_url": f"/api/v1/sessions/{session_id}/notebooks/combine/status",
            "download_url": f"/api/v1/sessions/{session_id}/notebooks/combined.ipynb/download",
        }),
    )


@router.get("/combine/status")
async def get_combine_status(session_id: str):
    """Poll for combined-notebook job progress."""
    job = state.get_combine_job(session_id)
    if not job:
        raise HTTPException(404, "No combine job found for this session")
    return ok(job)


@router.get("/combined.ipynb/download")
async def download_combined_notebook(session_id: str):
    """Download the combined .ipynb file as an attachment."""
    import json
    nb = load_combined_notebook(session_id)
    if nb is None:
        raise HTTPException(404, "Combined notebook not generated yet — trigger POST /combine first")

    content = json.dumps(nb, indent=2).encode("utf-8")
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="combined_notebooks_{session_id}.ipynb"'
        },
    )
