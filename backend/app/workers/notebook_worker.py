"""
Background task that runs the full notebook generation pipeline.
"""
from __future__ import annotations

import logging

from app.services.notebook_service import generate_notebooks
from app.services import session_state as state

logger = logging.getLogger(__name__)


async def run_notebook_generation(session_id: str, from_iter_idx: int) -> None:
    try:
        await generate_notebooks(session_id, from_iter_idx)
    except Exception as exc:
        logger.exception(f"[{session_id}] notebook generation failed: {exc}")
        state.fail_notebook_job(session_id, str(exc)[:500])
