"""
Background task that runs one refinement iteration (Agent 4 → Agent 5).
Used with FastAPI BackgroundTasks.
"""
from __future__ import annotations

import logging

from app.services.iteration_service import run_iteration

logger = logging.getLogger(__name__)


async def run_refinement_iteration(
    session_id: str,
    iter_idx: int,
    user_comment: str | None,
) -> None:
    await run_iteration(session_id, iter_idx, user_comment)
