"""
All Redis read/write operations for session and iteration state.
Single source of truth for field names — both API layer and workers import from here.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings
from app.models.session import SessionMeta, SessionStatus, SessionSummary

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def _meta_key(sid: str) -> str:
    return f"session:{sid}:meta"

def _iter_key(sid: str, idx: int) -> str:
    return f"session:{sid}:iter:{idx}"

def _idx_key(sid: str) -> str:
    return f"session:{sid}:iteration_idx"

def _notebook_key(sid: str) -> str:
    return f"session:{sid}:notebook_job"


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

async def create_session(r: aioredis.Redis, session_id: str, name: str) -> SessionMeta:
    now = _now()
    meta = {
        "session_id": session_id,
        "name": name,
        "status": SessionStatus.uploading.value,
        "created_at": now,
        "updated_at": now,
        "last_iter_idx": "-1",
        "error_msg": "",
        "source_columns_file": "",
        "source_fk_file": "",
        "table_count": "0",
    }
    await r.hset(_meta_key(session_id), mapping=meta)
    await r.expire(_meta_key(session_id), settings.SESSION_TTL_SECONDS)
    return _meta_from_hash(meta)


async def get_session(r: aioredis.Redis, session_id: str) -> SessionMeta | None:
    data = await r.hgetall(_meta_key(session_id))
    if not data:
        return None
    await r.expire(_meta_key(session_id), settings.SESSION_TTL_SECONDS)
    return _meta_from_hash(data)


async def update_session_status(
    r: aioredis.Redis, session_id: str, status: SessionStatus, error_msg: str = ""
) -> None:
    await r.hset(
        _meta_key(session_id),
        mapping={"status": status.value, "updated_at": _now(), "error_msg": error_msg},
    )
    await r.expire(_meta_key(session_id), settings.SESSION_TTL_SECONDS)


async def set_session_field(r: aioredis.Redis, session_id: str, **fields) -> None:
    mapping = {k: str(v) for k, v in fields.items()}
    mapping["updated_at"] = _now()
    await r.hset(_meta_key(session_id), mapping=mapping)
    await r.expire(_meta_key(session_id), settings.SESSION_TTL_SECONDS)


async def list_sessions(r: aioredis.Redis) -> list[SessionSummary]:
    keys = await r.keys("session:*:meta")
    summaries = []
    for key in keys:
        data = await r.hgetall(key)
        if data:
            summaries.append(_summary_from_hash(data))
    return sorted(summaries, key=lambda s: s.updated_at, reverse=True)


async def delete_session(r: aioredis.Redis, session_id: str) -> None:
    keys = await r.keys(f"session:{session_id}:*")
    if keys:
        await r.delete(*keys)


# ---------------------------------------------------------------------------
# Schema / relationship / classification state (stored as JSON strings)
# ---------------------------------------------------------------------------

async def store_json(r: aioredis.Redis, session_id: str, field: str, value: dict | list) -> None:
    await r.hset(_meta_key(session_id), mapping={field: json.dumps(value, default=str)})
    await r.expire(_meta_key(session_id), settings.SESSION_TTL_SECONDS)


async def get_json(r: aioredis.Redis, session_id: str, field: str) -> dict | list | None:
    raw = await r.hget(_meta_key(session_id), field)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# Iteration state
# ---------------------------------------------------------------------------

async def get_current_iter_idx(r: aioredis.Redis, session_id: str) -> int:
    val = await r.get(_idx_key(session_id))
    return int(val) if val is not None else -1


async def create_iteration(
    r: aioredis.Redis,
    session_id: str,
    trigger: str,
    user_comment: str | None = None,
) -> int:
    """Atomically increments iteration index and initialises the new iteration hash."""
    idx = await r.incr(_idx_key(session_id))
    await r.expire(_idx_key(session_id), settings.SESSION_TTL_SECONDS)

    now = _now()
    await r.hset(
        _iter_key(session_id, idx),
        mapping={
            "iter_idx": str(idx),
            "status": "running",
            "trigger": trigger,
            "user_comment": user_comment or "",
            "created_at": now,
        },
    )
    await r.expire(_iter_key(session_id, idx), settings.SESSION_TTL_SECONDS)
    await r.hset(_meta_key(session_id), mapping={"last_iter_idx": str(idx), "updated_at": now})
    return idx


async def write_agent4_result(
    r: aioredis.Redis,
    session_id: str,
    iter_idx: int,
    input_snapshot: dict,
    output: dict,
    reasoning: str,
    duration_ms: int,
    token_usage: dict,
    required_retry: bool = False,
) -> None:
    await r.hset(
        _iter_key(session_id, iter_idx),
        mapping={
            "agent4_input_snapshot": json.dumps(input_snapshot, default=str),
            "agent4_output": json.dumps(output, default=str),
            "agent4_reasoning": reasoning,
            "agent4_duration_ms": str(duration_ms),
            "agent4_token_usage": json.dumps(token_usage),
            "agent4_required_retry": "1" if required_retry else "0",
        },
    )
    await r.expire(_iter_key(session_id, iter_idx), settings.SESSION_TTL_SECONDS)


async def write_agent5_result(
    r: aioredis.Redis,
    session_id: str,
    iter_idx: int,
    input_snapshot: dict,
    mermaid_source: str,
    data_dict: dict,
    reasoning: str,
    duration_ms: int,
    token_usage: dict,
    required_retry: bool = False,
) -> None:
    await r.hset(
        _iter_key(session_id, iter_idx),
        mapping={
            "agent5_input_snapshot": json.dumps(input_snapshot, default=str),
            "agent5_output_mermaid": mermaid_source,
            "agent5_output_dict": json.dumps(data_dict, default=str),
            "agent5_reasoning": reasoning,
            "agent5_duration_ms": str(duration_ms),
            "agent5_token_usage": json.dumps(token_usage),
            "agent5_required_retry": "1" if required_retry else "0",
        },
    )
    await r.expire(_iter_key(session_id, iter_idx), settings.SESSION_TTL_SECONDS)


async def mark_iteration_complete(
    r: aioredis.Redis, session_id: str, iter_idx: int
) -> None:
    await r.hset(
        _iter_key(session_id, iter_idx),
        mapping={"status": "complete"},
    )


async def mark_iteration_error(
    r: aioredis.Redis, session_id: str, iter_idx: int, error_msg: str
) -> None:
    await r.hset(
        _iter_key(session_id, iter_idx),
        mapping={"status": "error", "error_msg": error_msg},
    )


async def get_iteration_summary(
    r: aioredis.Redis, session_id: str, iter_idx: int
) -> dict | None:
    data = await r.hgetall(_iter_key(session_id, iter_idx))
    if not data:
        return None
    return {
        "iter_idx": int(data.get("iter_idx", iter_idx)),
        "trigger": data.get("trigger", "initial"),
        "user_comment": data.get("user_comment") or None,
        "status": data.get("status", "running"),
        "created_at": data.get("created_at", ""),
    }


async def get_iteration_detail(
    r: aioredis.Redis, session_id: str, iter_idx: int
) -> dict | None:
    data = await r.hgetall(_iter_key(session_id, iter_idx))
    if not data:
        return None

    def _json(field: str):
        raw = data.get(field, "")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return raw

    def _bool(field: str) -> bool:
        return data.get(field, "0") == "1"

    def _int(field: str) -> int:
        try:
            return int(data.get(field, 0))
        except Exception:
            return 0

    return {
        "iter_idx": int(data.get("iter_idx", iter_idx)),
        "trigger": data.get("trigger", "initial"),
        "user_comment": data.get("user_comment") or None,
        "status": data.get("status", "running"),
        "created_at": data.get("created_at", ""),
        "error_msg": data.get("error_msg") or None,
        "agent4": {
            "input_snapshot": _json("agent4_input_snapshot"),
            "output": _json("agent4_output"),
            "reasoning": data.get("agent4_reasoning", ""),
            "duration_ms": _int("agent4_duration_ms"),
            "token_usage": _json("agent4_token_usage"),
            "required_retry": _bool("agent4_required_retry"),
        },
        "agent5": {
            "input_snapshot": _json("agent5_input_snapshot"),
            "output_mermaid": data.get("agent5_output_mermaid", ""),
            "output_dict": _json("agent5_output_dict"),
            "reasoning": data.get("agent5_reasoning", ""),
            "duration_ms": _int("agent5_duration_ms"),
            "token_usage": _json("agent5_token_usage"),
            "required_retry": _bool("agent5_required_retry"),
        },
    }


async def list_iteration_summaries(
    r: aioredis.Redis, session_id: str
) -> list[dict]:
    last_idx = await get_current_iter_idx(r, session_id)
    summaries = []
    for i in range(last_idx + 1):
        s = await get_iteration_summary(r, session_id, i)
        if s:
            summaries.append(s)
    return summaries


async def get_running_iteration_idx(
    r: aioredis.Redis, session_id: str
) -> int | None:
    last_idx = await get_current_iter_idx(r, session_id)
    for i in range(last_idx + 1):
        data = await r.hget(_iter_key(session_id, i), "status")
        if data == "running":
            return i
    return None


async def reset_iterations(r: aioredis.Redis, session_id: str) -> None:
    """Delete all iteration keys — called when user resets to a prior checkpoint."""
    last_idx = await get_current_iter_idx(r, session_id)
    for i in range(last_idx + 1):
        await r.delete(_iter_key(session_id, i))
    await r.delete(_idx_key(session_id))
    await r.hset(_meta_key(session_id), mapping={"last_iter_idx": "-1"})


# ---------------------------------------------------------------------------
# Notebook job state
# ---------------------------------------------------------------------------

async def create_notebook_job(
    r: aioredis.Redis, session_id: str, job_id: str, domains_total: int
) -> None:
    await r.hset(
        _notebook_key(session_id),
        mapping={
            "job_id": job_id,
            "status": "running",
            "domains_total": str(domains_total),
            "domains_completed": "0",
            "current_domain": "",
            "manifest": "[]",
            "error_msg": "",
        },
    )
    await r.expire(_notebook_key(session_id), settings.SESSION_TTL_SECONDS)


async def update_notebook_progress(
    r: aioredis.Redis,
    session_id: str,
    domains_completed: int,
    current_domain: str,
    manifest: list,
) -> None:
    await r.hset(
        _notebook_key(session_id),
        mapping={
            "domains_completed": str(domains_completed),
            "current_domain": current_domain,
            "manifest": json.dumps(manifest),
        },
    )


async def complete_notebook_job(
    r: aioredis.Redis, session_id: str, manifest: list
) -> None:
    await r.hset(
        _notebook_key(session_id),
        mapping={
            "status": "complete",
            "manifest": json.dumps(manifest),
            "current_domain": "",
        },
    )
    await update_session_status(r, session_id, SessionStatus.complete)


async def fail_notebook_job(
    r: aioredis.Redis, session_id: str, error_msg: str
) -> None:
    await r.hset(
        _notebook_key(session_id),
        mapping={"status": "error", "error_msg": error_msg},
    )
    await update_session_status(r, session_id, SessionStatus.error, error_msg)


async def get_notebook_job(r: aioredis.Redis, session_id: str) -> dict | None:
    data = await r.hgetall(_notebook_key(session_id))
    if not data:
        return None
    try:
        manifest = json.loads(data.get("manifest", "[]"))
    except Exception:
        manifest = []
    return {
        "job_id": data.get("job_id", ""),
        "status": data.get("status", "running"),
        "domains_total": int(data.get("domains_total", 0)),
        "domains_completed": int(data.get("domains_completed", 0)),
        "current_domain": data.get("current_domain", ""),
        "manifest": manifest,
        "error_msg": data.get("error_msg", "") or None,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _meta_from_hash(data: dict) -> SessionMeta:
    return SessionMeta(
        session_id=data["session_id"],
        name=data.get("name", "Untitled"),
        status=SessionStatus(data.get("status", "uploading")),
        created_at=data.get("created_at", _now()),
        updated_at=data.get("updated_at", _now()),
        last_iter_idx=int(data.get("last_iter_idx", -1)),
        error_msg=data.get("error_msg") or None,
        source_columns_file=data.get("source_columns_file") or None,
        source_fk_file=data.get("source_fk_file") or None,
    )


def _summary_from_hash(data: dict) -> SessionSummary:
    return SessionSummary(
        session_id=data["session_id"],
        name=data.get("name", "Untitled"),
        status=SessionStatus(data.get("status", "uploading")),
        created_at=data.get("created_at", _now()),
        updated_at=data.get("updated_at", _now()),
        table_count=int(data.get("table_count", 0)),
        last_iter_idx=int(data.get("last_iter_idx", -1)),
    )
