from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from typing import List

from app.agents.schema_parser import schema_parser
from app.agents.relation_mapper import relation_mapper
from app.services import session_state as state
from app.services.file_storage import get_upload_dir, save_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}/uploads", tags=["uploads"])


def ok(data):
    return {"success": True, "data": data, "error": None}


@router.post("/sql")
async def upload_sql_files(
    session_id: str,
    files: List[UploadFile] = File(...),
):
    """
    Upload one or more .sql DDL files. Accepts any .sql file(s) containing
    CREATE TABLE and FOREIGN KEY statements.
    """
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    if not files:
        raise HTTPException(400, "No files provided")

    saved = []
    for file in files:
        if not file.filename:
            continue
        content = await file.read()
        if not content:
            continue
        # Sanitise filename to prevent path traversal
        safe_name = Path(file.filename).name
        save_upload(session_id, safe_name, content)
        saved.append({"filename": safe_name, "size": len(content)})

    if not saved:
        raise HTTPException(400, "No valid files were uploaded")

    state.set_session_field(session_id, source_sql_files=[f["filename"] for f in saved])

    return ok({"uploaded": saved})


@router.post("/er-diagram")
async def upload_er_diagram(
    session_id: str,
    file: UploadFile = File(...),
):
    content = await file.read()
    filename = f"er_diagram{_ext(file.filename)}"
    save_upload(session_id, filename, content)
    return ok({"filename": filename, "size": len(content)})


@router.post("/parse")
async def parse_schema(session_id: str):
    """
    Runs Agent 1 (DDL Parser) + Agent 2 (Relation Mapper).
    SQL files must be uploaded first via POST /uploads/sql.
    """
    meta = state.get_session(session_id)
    if not meta:
        raise HTTPException(404, "Session not found")

    upload_dir = get_upload_dir(session_id)
    sql_files = list(upload_dir.glob("*.sql"))

    if not sql_files:
        raise HTTPException(400, "No .sql files uploaded yet. Upload DDL files first.")

    state.update_session_status(session_id, state.SessionStatus.parsing)

    try:
        # Agent 1 — LLM-based DDL parser
        parsed = schema_parser.parse(sql_files)
        state.store_json(session_id, "parsed_schema", parsed.model_dump())
        state.set_session_field(session_id, table_count=parsed.table_count)

        # Agent 2 — relation mapper
        mapper_result = relation_mapper.run(parsed)
        state.store_json(session_id, "relationship_graph", mapper_result["result"])

        state.update_session_status(session_id, state.SessionStatus.checkpoint1_pending)

        return ok({
            "table_count": parsed.table_count,
            "relationship_count": parsed.relationship_count,
            "parsed_schema": parsed.model_dump(),
            "relationship_graph": mapper_result["result"],
        })

    except Exception as exc:
        logger.exception(f"[{session_id}] parse error: {exc}")
        state.update_session_status(session_id, state.SessionStatus.error, str(exc)[:300])
        raise HTTPException(500, f"Parse failed: {str(exc)[:200]}")


def _ext(filename: str | None) -> str:
    if not filename:
        return ".png"
    idx = filename.rfind(".")
    return filename[idx:] if idx >= 0 else ".png"
