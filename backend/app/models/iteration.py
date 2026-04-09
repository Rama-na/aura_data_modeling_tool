from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel


class IterationStatus(str, Enum):
    running = "running"
    complete = "complete"
    error = "error"


class IterationTrigger(str, Enum):
    initial = "initial"
    user_comment = "user_comment"


class TokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class AgentRunMeta(BaseModel):
    duration_ms: int
    token_usage: TokenUsage
    required_retry: bool = False
    reasoning: str = ""


class IterationSummary(BaseModel):
    iter_idx: int
    trigger: IterationTrigger
    user_comment: Optional[str]
    status: IterationStatus
    created_at: datetime


class IterationDetail(IterationSummary):
    agent4_input_snapshot: Optional[Any] = None
    agent4_output: Optional[Any] = None
    agent4_meta: Optional[AgentRunMeta] = None
    agent5_output_mermaid: Optional[str] = None
    agent5_output_dict: Optional[Any] = None
    agent5_meta: Optional[AgentRunMeta] = None
    error_msg: Optional[str] = None


class IterationsListResponse(BaseModel):
    session_id: str
    current_iter_idx: int
    latest_iter_idx: int
    iterations: list[IterationSummary]
