"""
In-memory session store — replaces Redis entirely.
All state lives in this module-level dict for the lifetime of the process.
"""
from __future__ import annotations

import copy
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.models.session import SessionMeta, SessionStatus, SessionSummary

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# The single in-memory store
# ---------------------------------------------------------------------------

STORE: dict[str, Any] = {
    "sessions":      {},   # session_id -> dict (session meta fields)
    "data":          {},   # session_id -> {key: value}  (arbitrary JSON blobs)
    "iterations":    {},   # session_id -> {iter_idx: dict}
    "iter_idx":      {},   # session_id -> int  (current max index, -1 = none yet)
    "notebook_jobs": {},   # session_id -> dict
}


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

def create_session(session_id: str, name: str) -> SessionMeta:
    now = _now()
    meta = {
        "session_id": session_id,
        "name": name,
        "status": SessionStatus.uploading.value,
        "created_at": now,
        "updated_at": now,
        "last_iter_idx": -1,
        "error_msg": "",
        "source_sql_files": [],
        "table_count": 0,
    }
    STORE["sessions"][session_id] = meta
    STORE["data"][session_id] = {}
    STORE["iterations"][session_id] = {}
    STORE["iter_idx"][session_id] = -1
    return _meta_from_dict(meta)


def get_session(session_id: str) -> SessionMeta | None:
    meta = STORE["sessions"].get(session_id)
    if not meta:
        return None
    return _meta_from_dict(meta)


def update_session_status(session_id: str, status: SessionStatus, error_msg: str = "") -> None:
    if session_id not in STORE["sessions"]:
        return
    STORE["sessions"][session_id]["status"] = status.value
    STORE["sessions"][session_id]["updated_at"] = _now()
    STORE["sessions"][session_id]["error_msg"] = error_msg


def set_session_field(session_id: str, **fields) -> None:
    if session_id not in STORE["sessions"]:
        return
    for k, v in fields.items():
        STORE["sessions"][session_id][k] = v
    STORE["sessions"][session_id]["updated_at"] = _now()


def list_sessions() -> list[SessionSummary]:
    summaries = []
    for meta in STORE["sessions"].values():
        summaries.append(_summary_from_dict(meta))
    return sorted(summaries, key=lambda s: s.updated_at, reverse=True)


def delete_session(session_id: str) -> None:
    for store in STORE.values():
        store.pop(session_id, None)


# ---------------------------------------------------------------------------
# Arbitrary JSON blobs (parsed schema, classifications, etc.)
# ---------------------------------------------------------------------------

def store_json(session_id: str, key: str, value: Any) -> None:
    if session_id not in STORE["data"]:
        STORE["data"][session_id] = {}
    STORE["data"][session_id][key] = copy.deepcopy(value)


def get_json(session_id: str, key: str) -> Any:
    return copy.deepcopy(STORE["data"].get(session_id, {}).get(key))


# ---------------------------------------------------------------------------
# Iteration state
# ---------------------------------------------------------------------------

def get_current_iter_idx(session_id: str) -> int:
    return STORE["iter_idx"].get(session_id, -1)


def create_iteration(session_id: str, trigger: str, user_comment: str | None = None) -> int:
    current = STORE["iter_idx"].get(session_id, -1)
    idx = current + 1
    STORE["iter_idx"][session_id] = idx
    STORE["sessions"][session_id]["last_iter_idx"] = idx
    STORE["sessions"][session_id]["updated_at"] = _now()

    if session_id not in STORE["iterations"]:
        STORE["iterations"][session_id] = {}

    STORE["iterations"][session_id][idx] = {
        "iter_idx": idx,
        "status": "running",
        "stage": "waiting",
        "trigger": trigger,
        "user_comment": user_comment or "",
        "created_at": _now(),
        "error_msg": "",
        "agent4_input_snapshot": None,
        "agent4_output": None,
        "agent4_reasoning": "",
        "agent4_duration_ms": 0,
        "agent4_token_usage": None,
        "agent4_required_retry": False,
        "agent5_input_snapshot": None,
        "agent5_output_mermaid": "",
        "agent5_output_dict": None,
        "agent5_reasoning": "",
        "agent5_duration_ms": 0,
        "agent5_token_usage": None,
        "agent5_required_retry": False,
    }
    return idx


def write_agent4_result(
    session_id: str, iter_idx: int,
    input_snapshot: Any, output: Any, reasoning: str,
    duration_ms: int, token_usage: dict, required_retry: bool = False,
) -> None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if not it:
        return
    it.update({
        "agent4_input_snapshot": input_snapshot,
        "agent4_output": copy.deepcopy(output),
        "agent4_reasoning": reasoning,
        "agent4_duration_ms": duration_ms,
        "agent4_token_usage": token_usage,
        "agent4_required_retry": required_retry,
    })


def write_agent5_result(
    session_id: str, iter_idx: int,
    input_snapshot: Any, mermaid_source: str, data_dict: Any,
    reasoning: str, duration_ms: int, token_usage: dict, required_retry: bool = False,
) -> None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if not it:
        return
    it.update({
        "agent5_input_snapshot": input_snapshot,
        "agent5_output_mermaid": mermaid_source,
        "agent5_output_dict": copy.deepcopy(data_dict),
        "agent5_reasoning": reasoning,
        "agent5_duration_ms": duration_ms,
        "agent5_token_usage": token_usage,
        "agent5_required_retry": required_retry,
    })


def set_iteration_stage(session_id: str, iter_idx: int, stage: str) -> None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if it:
        it["stage"] = stage


def mark_iteration_complete(session_id: str, iter_idx: int) -> None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if it:
        it["status"] = "complete"


def mark_iteration_error(session_id: str, iter_idx: int, error_msg: str) -> None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if it:
        it["status"] = "error"
        it["error_msg"] = error_msg


def get_iteration_summary(session_id: str, iter_idx: int) -> dict | None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if not it:
        return None
    return {
        "iter_idx": it["iter_idx"],
        "trigger": it["trigger"],
        "user_comment": it.get("user_comment") or None,
        "status": it["status"],
        "stage": it.get("stage", "waiting"),
        "created_at": it["created_at"],
    }


def get_iteration_detail(session_id: str, iter_idx: int) -> dict | None:
    it = STORE["iterations"].get(session_id, {}).get(iter_idx)
    if not it:
        return None
    return {
        "iter_idx": it["iter_idx"],
        "trigger": it["trigger"],
        "user_comment": it.get("user_comment") or None,
        "status": it["status"],
        "created_at": it["created_at"],
        "error_msg": it.get("error_msg") or None,
        "stage": it.get("stage", "waiting"),
        "agent4": {
            "input_snapshot": it.get("agent4_input_snapshot"),
            "output": it.get("agent4_output"),
            "reasoning": it.get("agent4_reasoning", ""),
            "duration_ms": it.get("agent4_duration_ms", 0),
            "token_usage": it.get("agent4_token_usage"),
            "required_retry": it.get("agent4_required_retry", False),
        },
        "agent5": {
            "input_snapshot": it.get("agent5_input_snapshot"),
            "output_mermaid": it.get("agent5_output_mermaid", ""),
            "output_dict": it.get("agent5_output_dict"),
            "reasoning": it.get("agent5_reasoning", ""),
            "duration_ms": it.get("agent5_duration_ms", 0),
            "token_usage": it.get("agent5_token_usage"),
            "required_retry": it.get("agent5_required_retry", False),
        },
    }


def list_iteration_summaries(session_id: str) -> list[dict]:
    iters = STORE["iterations"].get(session_id, {})
    result = []
    for idx in sorted(iters.keys()):
        s = get_iteration_summary(session_id, idx)
        if s:
            result.append(s)
    return result


def get_running_iteration_idx(session_id: str) -> int | None:
    for idx, it in STORE["iterations"].get(session_id, {}).items():
        if it.get("status") == "running":
            return idx
    return None


def reset_iterations(session_id: str) -> None:
    STORE["iterations"][session_id] = {}
    STORE["iter_idx"][session_id] = -1
    if session_id in STORE["sessions"]:
        STORE["sessions"][session_id]["last_iter_idx"] = -1


# ---------------------------------------------------------------------------
# Notebook job state
# ---------------------------------------------------------------------------

def create_notebook_job(session_id: str, job_id: str, domains_total: int) -> None:
    STORE["notebook_jobs"][session_id] = {
        "job_id": job_id,
        "status": "running",
        "domains_total": domains_total,
        "domains_completed": 0,
        "current_domain": "",
        "manifest": [],
        "error_msg": None,
    }


def update_notebook_progress(session_id: str, domains_completed: int, current_domain: str, manifest: list) -> None:
    job = STORE["notebook_jobs"].get(session_id)
    if job:
        job.update({
            "domains_completed": domains_completed,
            "current_domain": current_domain,
            "manifest": manifest,
        })


def complete_notebook_job(session_id: str, manifest: list) -> None:
    job = STORE["notebook_jobs"].get(session_id)
    if job:
        job["status"] = "complete"
        job["manifest"] = manifest
        job["current_domain"] = ""
    update_session_status(session_id, SessionStatus.complete)


def fail_notebook_job(session_id: str, error_msg: str) -> None:
    job = STORE["notebook_jobs"].get(session_id)
    if job:
        job["status"] = "error"
        job["error_msg"] = error_msg
    update_session_status(session_id, SessionStatus.error, error_msg)


def get_notebook_job(session_id: str) -> dict | None:
    return copy.deepcopy(STORE["notebook_jobs"].get(session_id))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _meta_from_dict(d: dict) -> SessionMeta:
    return SessionMeta(
        session_id=d["session_id"],
        name=d.get("name", "Untitled"),
        status=SessionStatus(d.get("status", "uploading")),
        created_at=d.get("created_at", _now()),
        updated_at=d.get("updated_at", _now()),
        last_iter_idx=int(d.get("last_iter_idx", -1)),
        error_msg=d.get("error_msg") or None,
        source_sql_files=d.get("source_sql_files") or [],
    )


def _summary_from_dict(d: dict) -> SessionSummary:
    return SessionSummary(
        session_id=d["session_id"],
        name=d.get("name", "Untitled"),
        status=SessionStatus(d.get("status", "uploading")),
        created_at=d.get("created_at", _now()),
        updated_at=d.get("updated_at", _now()),
        table_count=int(d.get("table_count", 0)),
        last_iter_idx=int(d.get("last_iter_idx", -1)),
    )
