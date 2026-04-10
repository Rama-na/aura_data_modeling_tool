"""
Checkpoint approval/rejection endpoints.
Checkpoint 1: domain classification review
Checkpoint 2: schema design review (triggers iter 0)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.agents.domain_classifier import domain_classifier
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
):
    """Run Agent 3 (Domain Classifier) and return classification for review."""
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    relationship_graph = state.get_json(session_id, "relationship_graph")
    if not relationship_graph:
        raise HTTPException(400, "Schema not parsed yet")

    # Store pre-run context
    state.store_json(session_id, "pre_run_context", body.user_context)

    result = domain_classifier.run(
        enriched_schema=relationship_graph,
        user_context=body.user_context,
        hard_overrides=body.hard_overrides,
    )

    state.store_json(session_id, "classification_result", result["result"])
    state.update_session_status(session_id, state.SessionStatus.checkpoint1_pending)

    return ok(result["result"])


@router.post("/1/approve")
async def approve_checkpoint1(
    session_id: str,
    body: Checkpoint1Override,
):
    """User approves (possibly with overrides) — saves approved classifications."""
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    state.store_json(session_id, "approved_classifications", {"classifications": body.classifications})
    state.update_session_status(session_id, state.SessionStatus.checkpoint1_approved)
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
):
    """
    Approves checkpoint 2 (schema design intent) and kicks off iteration 0
    (Agent 4 + Agent 5 first run).
    """
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    # Check no iteration is already running
    running = state.get_running_iteration_idx(session_id)
    if running is not None:
        raise HTTPException(409, f"Iteration {running} is already running")

    # Store the pre-design comment
    if body.user_comment:
        state.store_json(session_id, "pre_design_comment", body.user_comment)

    # Create iteration 0
    iter_idx = state.create_iteration(session_id, trigger="initial", user_comment=None)

    state.update_session_status(session_id, state.SessionStatus.refining)

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
