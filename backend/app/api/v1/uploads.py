from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.agents.schema_parser import schema_parser
from app.agents.relation_mapper import relation_mapper
from app.core.redis_client import get_redis
from app.services import session_state as state
from app.services.file_storage import get_upload_path, save_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}/uploads", tags=["uploads"])


def ok(data):
    return {"success": True, "data": data, "error": None}


@router.post("/columns")
async def upload_columns(
    session_id: str,
    file: UploadFile = File(...),
    r=Depends(get_redis),
):
    content = await file.read()
    path = save_upload(session_id, "columns.csv", content)
    await state.set_session_field(r, session_id, source_columns_file="columns.csv")
    return ok({"filename": "columns.csv", "size": len(content)})


@router.post("/foreignkeys")
async def upload_foreign_keys(
    session_id: str,
    file: UploadFile = File(...),
    r=Depends(get_redis),
):
    content = await file.read()
    path = save_upload(session_id, "foreign_keys.csv", content)
    await state.set_session_field(r, session_id, source_fk_file="foreign_keys.csv")
    return ok({"filename": "foreign_keys.csv", "size": len(content)})


@router.post("/er-diagram")
async def upload_er_diagram(
    session_id: str,
    file: UploadFile = File(...),
    r=Depends(get_redis),
):
    content = await file.read()
    filename = f"er_diagram{_ext(file.filename)}"
    save_upload(session_id, filename, content)
    return ok({"filename": filename, "size": len(content)})


@router.post("/parse")
async def parse_schema(session_id: str, r=Depends(get_redis)):
    """
    Runs Agent 1 (Schema Parser) + Agent 2 (Relation Mapper).
    Both files must be uploaded first.
    """
    meta = await state.get_session(r, session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    col_path = get_upload_path(session_id, "columns.csv")
    fk_path = get_upload_path(session_id, "foreign_keys.csv")

    if not col_path.exists():
        raise HTTPException(400, "Columns file not uploaded yet")
    if not fk_path.exists():
        raise HTTPException(400, "Foreign keys file not uploaded yet")

    await state.update_session_status(r, session_id, state.SessionStatus.parsing)

    try:
        # Agent 1 — deterministic parser
        parsed = schema_parser.parse(col_path, fk_path)
        await state.store_json(r, session_id, "parsed_schema", parsed.model_dump())
        await state.set_session_field(r, session_id, table_count=str(parsed.table_count))

        # Agent 2 — relation mapper
        mapper_result = relation_mapper.run(parsed)
        await state.store_json(r, session_id, "relationship_graph", mapper_result["result"])

        await state.update_session_status(r, session_id, state.SessionStatus.checkpoint1_pending)

        return ok({
            "table_count": parsed.table_count,
            "relationship_count": parsed.relationship_count,
            "parsed_schema": parsed.model_dump(),
            "relationship_graph": mapper_result["result"],
        })

    except Exception as exc:
        logger.exception(f"[{session_id}] parse error: {exc}")
        await state.update_session_status(r, session_id, state.SessionStatus.error, str(exc)[:300])
        raise HTTPException(500, f"Parse failed: {str(exc)[:200]}")


def _ext(filename: str | None) -> str:
    if not filename:
        return ".png"
    idx = filename.rfind(".")
    return filename[idx:] if idx >= 0 else ".png"
