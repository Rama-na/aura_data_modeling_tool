"""
Debug endpoint — only active when DEBUG_MODE=true.
Dumps full Redis state for a session as JSON.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.redis_client import get_redis

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/sessions/{session_id}")
async def dump_session(session_id: str, r=Depends(get_redis)):
    if not settings.DEBUG_MODE:
        raise HTTPException(403, "Debug mode is disabled")

    keys = await r.keys(f"session:{session_id}:*")
    result = {}
    for key in sorted(keys):
        key_type = await r.type(key)
        if key_type == "hash":
            result[key] = await r.hgetall(key)
        elif key_type == "string":
            result[key] = await r.get(key)
        else:
            result[key] = f"<type: {key_type}>"

    return {"success": True, "data": result, "error": None}
