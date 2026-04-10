"""
Core orchestrator for one refinement iteration: Agent 4 → Agent 5.
Called by the refinement background worker.
"""
from __future__ import annotations

import logging

from app.agents.er_generator import er_generator
from app.agents.schema_designer import schema_designer
from app.services import session_state as state

logger = logging.getLogger(__name__)


async def run_iteration(
    session_id: str,
    iter_idx: int,
    user_comment: str | None,
) -> None:
    """
    Runs Agent 4 (Schema Designer) → Agent 5 (ER Generator) for one iteration.
    Writes all results to in-memory store. Sets iteration status to complete or error.
    """
    try:
        # --- Load context ---
        parsed_schema = state.get_json(session_id, "parsed_schema")
        classifications = state.get_json(session_id, "approved_classifications")
        relationships = state.get_json(session_id, "relationship_graph")
        pre_run_context = state.get_json(session_id, "pre_run_context") or ""

        # Prior plan: previous iteration's Agent 4 output (or None for iter 0)
        prior_plan = None
        if iter_idx > 0:
            prev_detail = state.get_iteration_detail(session_id, iter_idx - 1)
            if prev_detail:
                prior_plan = prev_detail["agent4"]["output"]

        # --- Agent 4 — Schema Designer ---
        logger.info(f"[{session_id}] iter {iter_idx}: running Schema Designer")

        agent4_input = {
            "schema": parsed_schema,
            "classifications": classifications,
            "relationships": relationships,
            "user_comment": user_comment or (pre_run_context if iter_idx == 0 else ""),
            "prior_plan": prior_plan,
        }

        a4 = schema_designer.run(
            schema_json=parsed_schema or {},
            classifications=classifications or {},
            relationships=relationships or {},
            user_comment=user_comment or (str(pre_run_context) if iter_idx == 0 else ""),
            prior_plan=prior_plan,
        )

        schema_plan = a4["result"]
        a4_resp = a4["llm_response"]

        state.write_agent4_result(
            session_id=session_id,
            iter_idx=iter_idx,
            input_snapshot=agent4_input,
            output=schema_plan,
            reasoning="",
            duration_ms=a4_resp.duration_ms,
            token_usage={
                "prompt_tokens": a4_resp.prompt_tokens,
                "completion_tokens": a4_resp.completion_tokens,
                "total_tokens": a4_resp.total_tokens,
            },
        )

        # --- Agent 5 — ER Generator ---
        logger.info(f"[{session_id}] iter {iter_idx}: running ER Generator")

        agent5_input = {"schema_plan": schema_plan}

        a5 = er_generator.run(schema_plan=schema_plan)
        a5_resp = a5["llm_response"]

        state.write_agent5_result(
            session_id=session_id,
            iter_idx=iter_idx,
            input_snapshot=agent5_input,
            mermaid_source=a5["mermaid_source"],
            data_dict=a5["data_dictionary"],
            reasoning=a5["reasoning"],
            duration_ms=a5_resp.duration_ms,
            token_usage={
                "prompt_tokens": a5_resp.prompt_tokens,
                "completion_tokens": a5_resp.completion_tokens,
                "total_tokens": a5_resp.total_tokens,
            },
            required_retry=a5["required_retry"],
        )

        state.mark_iteration_complete(session_id, iter_idx)
        logger.info(f"[{session_id}] iter {iter_idx}: complete")

    except Exception as exc:
        logger.exception(f"[{session_id}] iter {iter_idx}: error — {exc}")
        state.mark_iteration_error(session_id, iter_idx, str(exc)[:500])
        raise
