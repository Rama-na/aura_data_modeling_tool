from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class SessionStatus(str, Enum):
    uploading = "uploading"
    parsing = "parsing"
    checkpoint1_pending = "checkpoint1_pending"
    checkpoint1_approved = "checkpoint1_approved"
    schema_designing = "schema_designing"
    checkpoint2_pending = "checkpoint2_pending"
    checkpoint2_approved = "checkpoint2_approved"
    refining = "refining"
    generating_notebooks = "generating_notebooks"
    complete = "complete"
    error = "error"


class SessionMeta(BaseModel):
    session_id: str
    name: str
    status: SessionStatus
    created_at: datetime
    updated_at: datetime
    last_iter_idx: int = -1
    error_msg: Optional[str] = None
    source_columns_file: Optional[str] = None
    source_fk_file: Optional[str] = None


class SessionSummary(BaseModel):
    """Lightweight version for the sidebar list."""
    session_id: str
    name: str
    status: SessionStatus
    created_at: datetime
    updated_at: datetime
    table_count: int = 0
    last_iter_idx: int = -1
