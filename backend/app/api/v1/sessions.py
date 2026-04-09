from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.redis_client import get_redis
from app.services import session_state as state

router = APIRouter(prefix="/sessions", tags=["sessions"])


def ok(data):
    return {"success": True, "data": data, "error": None}


def err(msg: str):
    return {"success": False, "data": None, "error": msg}


class CreateSessionRequest(BaseModel):
    name: str | None = None


class RenameSessionRequest(BaseModel):
    name: str


@router.post("")
async def create_session(body: CreateSessionRequest, r=Depends(get_redis)):
    session_id = str(uuid.uuid4())
    name = body.name or f"Session {datetime.utcnow().strftime('%b %d %H:%M')}"
    meta = await state.create_session(r, session_id, name)
    return ok(meta.model_dump())


@router.get("")
async def list_sessions(r=Depends(get_redis)):
    sessions = await state.list_sessions(r)
    return ok([s.model_dump() for s in sessions])


@router.get("/{session_id}")
async def get_session(session_id: str, r=Depends(get_redis)):
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")
    return ok(meta.model_dump())


@router.patch("/{session_id}/name")
async def rename_session(session_id: str, body: RenameSessionRequest, r=Depends(get_redis)):
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")
    await state.set_session_field(r, session_id, name=body.name)
    return ok({"session_id": session_id, "name": body.name})


@router.delete("/{session_id}")
async def delete_session(session_id: str, r=Depends(get_redis)):
    await state.delete_session(r, session_id)
    return ok({"deleted": session_id})


@router.post("/{session_id}/reset")
async def reset_session(session_id: str, r=Depends(get_redis)):
    """Reset iteration state — returns to checkpoint 2 approval state."""
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found")
    await state.reset_iterations(r, session_id)
    await state.update_session_status(r, session_id, state.SessionStatus.checkpoint2_approved)
    return ok({"reset": True, "session_id": session_id})
