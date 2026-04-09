"""
Checkpoint approval/rejection endpoints.
Checkpoint 1: domain classification review
Checkpoint 2: schema design review (triggers iter 0)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.agents.domain_classifier import domain_classifier
from app.core.redis_client import get_redis
from app.services import session_state as state
from app.workers.refinement_worker import run_refinement_iteration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}/checkpoints", tags=["checkpoints"])


def ok(data):
    return {"success": True, "data": data, "error": None}


# ---------------------------------------------------------------------------
# Checkpoint 1 — Classification approval
# ---------------------------------------------------------------------------

class Checkpoint1Context(BaseModel):
    user_context: str = ""
    hard_overrides: dict = {}  # {table_name: 'fact'|'dimension'|'ignore'}


class Checkpoint1Override(BaseModel):
    classifications: list[dict]  # full corrected classification list


@router.post("/1/classify")
async def run_classification(
    session_id: str,
    body: Checkpoint1Context,
    r=Depends(get_redis),
):
    """Run Agent 3 (Domain Classifier) and return classification for review."""
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    relationship_graph = await state.get_json(r, session_id, "relationship_graph")
    if not relationship_graph:
        raise HTTPException(400, "Schema not parsed yet")

    # Store pre-run context
    await state.store_json(r, session_id, "pre_run_context", body.user_context)

    result = domain_classifier.run(
        enriched_schema=relationship_graph,
        user_context=body.user_context,
        hard_overrides=body.hard_overrides,
    )

    await state.store_json(r, session_id, "classification_result", result["result"])
    await state.update_session_status(r, session_id, state.SessionStatus.checkpoint1_pending)

    return ok(result["result"])


@router.post("/1/approve")
async def approve_checkpoint1(
    session_id: str,
    body: Checkpoint1Override,
    r=Depends(get_redis),
):
    """User approves (possibly with overrides) — saves approved classifications."""
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    await state.store_json(r, session_id, "approved_classifications", {"classifications": body.classifications})
    await state.update_session_status(r, session_id, state.SessionStatus.checkpoint1_approved)
    return ok({"approved": True})


# ---------------------------------------------------------------------------
# Checkpoint 2 — Schema design (triggers iter 0)
# ---------------------------------------------------------------------------

class Checkpoint2Request(BaseModel):
    user_comment: str = ""


@router.post("/2/approve")
async def approve_checkpoint2(
    session_id: str,
    body: Checkpoint2Request,
    background_tasks: BackgroundTasks,
    r=Depends(get_redis),
):
    """
    Approves checkpoint 2 (schema design intent) and kicks off iteration 0
    (Agent 4 + Agent 5 first run).
    """
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    # Check no iteration is already running
    running = await state.get_running_iteration_idx(r, session_id)
    if running is not None:
        raise HTTPException(409, f"Iteration {running} is already running")

    # Store the pre-design comment
    if body.user_comment:
        await state.store_json(r, session_id, "pre_design_comment", body.user_comment)

    # Create iteration 0
    iter_idx = await state.create_iteration(r, session_id, trigger="initial", user_comment=None)

    await state.update_session_status(r, session_id, state.SessionStatus.refining)

    # Launch background task
    background_tasks.add_task(
        run_refinement_iteration,
        session_id=session_id,
        iter_idx=iter_idx,
        user_comment=body.user_comment or None,
    )

    return ok({
        "iter_idx": iter_idx,
        "status": "running",
        "poll_url": f"/api/v1/sessions/{session_id}/iterations/{iter_idx}",
    })
