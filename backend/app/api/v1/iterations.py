"""
Refinement loop endpoints.
GET /iterations           — summary list for version switcher
GET /iterations/{N}       — full detail for ER panel + debug panel
POST /iterations          — submit comment → create new iteration (202)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import session_state as state
from app.workers.refinement_worker import run_refinement_iteration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}/iterations", tags=["iterations"])


def ok(data):
    return {"success": True, "data": data, "error": None}


class SubmitCommentRequest(BaseModel):
    user_comment: str


@router.get("")
async def list_iterations(session_id: str):
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    summaries = state.list_iteration_summaries(session_id)
    latest_idx = state.get_current_iter_idx(session_id)

    return ok({
        "session_id": session_id,
        "current_iter_idx": latest_idx,
        "latest_iter_idx": latest_idx,
        "iterations": summaries,
    })


@router.get("/{iter_idx}")
async def get_iteration(session_id: str, iter_idx: int):
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    detail = state.get_iteration_detail(session_id, iter_idx)
    if not detail:
        raise HTTPException(404, f"Iteration {iter_idx} not found")

    return ok(detail)


@router.post("")
async def submit_comment(
    session_id: str,
    body: SubmitCommentRequest,
    background_tasks: BackgroundTasks,
):
    """
    Submit a refinement comment. Creates a new iteration and runs Agent 4 + 5.
    Returns 202 with iter_idx immediately; frontend should poll GET /iterations/{N}.
    Returns 409 if an iteration is currently running.
    """
    if not body.user_comment or not body.user_comment.strip():
        raise HTTPException(400, "user_comment must not be empty")

    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    # Guard against double-submit
    running = state.get_running_iteration_idx(session_id)
    if running is not None:
        raise HTTPException(409, detail={
            "error": "iteration_already_running",
            "running_iter_idx": running,
        })

    iter_idx = state.create_iteration(
        session_id, trigger="user_comment", user_comment=body.user_comment.strip()
    )

    background_tasks.add_task(
        run_refinement_iteration,
        session_id=session_id,
        iter_idx=iter_idx,
        user_comment=body.user_comment.strip(),
    )

    return JSONResponse(
        status_code=202,
        content={
            "success": True,
            "data": {
                "iter_idx": iter_idx,
                "status": "running",
                "poll_url": f"/api/v1/sessions/{session_id}/iterations/{iter_idx}",
            },
            "error": None,
        },
    )
