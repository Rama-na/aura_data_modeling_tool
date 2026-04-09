"""
Agent 4 — Schema Designer (LLM reasoning agent, most complex).
Designs the full star schema: grain, measures, SCD types, surrogate keys.
"""
from __future__ import annotations

import json
import logging

from app.core.azure_openai import LLMResponse, llm_client
from app.prompts import (
    SCHEMA_DESIGNER_SYSTEM_V1,
    SCHEMA_DESIGNER_USER_V1,
    SCHEMA_DESIGNER_USER_V1_INITIAL,
)

logger = logging.getLogger(__name__)


class SchemaDesignerAgent:
    def run(
        self,
        schema_json: dict,
        classifications: dict,
        relationships: dict,
        user_comment: str = "",
        prior_plan: dict | None = None,
    ) -> dict:
        """
        prior_plan: if None, this is the initial design (iter 0).
        Returns star schema spec dict + llm_response.
        """
        if prior_plan is None:
            user_prompt = SCHEMA_DESIGNER_USER_V1_INITIAL.format(
                schema_json=json.dumps(schema_json, indent=2, default=str),
                classifications_json=json.dumps(classifications, indent=2),
                relationships_json=json.dumps(relationships, indent=2),
                user_comment=user_comment or "No additional context.",
            )
        else:
            user_prompt = SCHEMA_DESIGNER_USER_V1.format(
                schema_json=json.dumps(schema_json, indent=2, default=str),
                classifications_json=json.dumps(classifications, indent=2),
                relationships_json=json.dumps(relationships, indent=2),
                prior_plan_json=json.dumps(prior_plan, indent=2),
                user_comment=user_comment or "No changes requested.",
            )

        response: LLMResponse = llm_client.complete(
            system_prompt=SCHEMA_DESIGNER_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=8192,
        )

        try:
            result = json.loads(response.content)
        except json.JSONDecodeError as e:
            logger.error(f"SchemaDesigner JSON parse error: {e}")
            result = {
                "fact_tables": [],
                "dimension_tables": [],
                "bridge_tables": [],
                "notes": f"Parse error: {str(e)[:200]}",
            }

        return {
            "result": result,
            "llm_response": response,
        }


schema_designer = SchemaDesignerAgent()
