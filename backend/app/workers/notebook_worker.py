"""
Background task that runs the full notebook generation pipeline.
"""
from __future__ import annotations

import logging

from app.core.redis_client import get_redis
from app.services.notebook_service import generate_notebooks
from app.services import session_state as state

logger = logging.getLogger(__name__)


async def run_notebook_generation(session_id: str, from_iter_idx: int) -> None:
    r = await get_redis()
    try:
        await generate_notebooks(r, session_id, from_iter_idx)
    except Exception as exc:
        logger.exception(f"[{session_id}] notebook generation failed: {exc}")
        await state.fail_notebook_job(r, session_id, str(exc)[:500])
