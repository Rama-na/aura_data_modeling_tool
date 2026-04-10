"""
Debug endpoint — only active when DEBUG_MODE=true.
Dumps in-memory session state as JSON.
"""
from __future__ import annotations

import copy

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.services.session_state import STORE

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/sessions/{session_id}")
async def dump_session(session_id: str):
    if not settings.DEBUG_MODE:
        raise HTTPException(403, "Debug mode is disabled")

    result = {
        "session_meta": copy.deepcopy(STORE["sessions"].get(session_id)),
        "data_keys": list(STORE["data"].get(session_id, {}).keys()),
        "iter_idx": STORE["iter_idx"].get(session_id),
        "iterations": copy.deepcopy(STORE["iterations"].get(session_id, {})),
        "notebook_job": copy.deepcopy(STORE["notebook_jobs"].get(session_id)),
    }

    return {"success": True, "data": result, "error": None}


@router.get("/store")
async def dump_store():
    """Dump all session IDs and their statuses."""
    if not settings.DEBUG_MODE:
        raise HTTPException(403, "Debug mode is disabled")

    summary = {
        sid: {
            "status": meta.get("status"),
            "name": meta.get("name"),
            "last_iter_idx": meta.get("last_iter_idx"),
        }
        for sid, meta in STORE["sessions"].items()
    }
    return {"success": True, "data": summary, "error": None}
