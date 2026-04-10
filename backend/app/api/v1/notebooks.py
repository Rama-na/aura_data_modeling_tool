from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.services import session_state as state
from app.services.file_storage import build_zip, get_notebook_content, get_manifest
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
