"""
Agent 7 — Notebook Validator.
Validates generated PySpark notebook code against the CURRENT_RELATION_STATE
and medallion architecture patterns.
"""
from __future__ import annotations

import json
import logging
import re

from app.core.azure_openai import llm_client
from app.prompts import (
    NOTEBOOK_VALIDATOR_SYSTEM_V1,
    NOTEBOOK_VALIDATOR_USER_V1,
)

logger = logging.getLogger(__name__)


class NotebookValidatorAgent:
    """Validates a generated notebook's PySpark code against the relation state."""

    def validate(
        self,
        domain_tables: list[str],
        current_relation_state: dict,
        notebook_code: str,
    ) -> dict:
        """
        Validates the generated notebook code.

        Returns:
            {
                "is_valid": bool,
                "issues": list[str],
                "suggestions": str,
            }
        """
        user_prompt = NOTEBOOK_VALIDATOR_USER_V1.format(
            domain_tables=json.dumps(domain_tables, default=str),
            current_relation_state=json.dumps(current_relation_state, indent=2, default=str),
            notebook_code=notebook_code[:6000],  # cap to avoid token overflow
        )

        response = llm_client.complete(
            system_prompt=NOTEBOOK_VALIDATOR_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.0,
            max_tokens=1024,
        )

        return self._parse_result(response.content)

    def _parse_result(self, content: str) -> dict:
        cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
        try:
            result = json.loads(cleaned)
            return {
                "is_valid": bool(result.get("is_valid", False)),
                "issues": result.get("issues", []),
                "suggestions": result.get("suggestions", ""),
            }
        except json.JSONDecodeError as e:
            logger.warning(f"NotebookValidator parse error: {e}")
            return {
                "is_valid": False,
                "issues": [f"Validator returned non-JSON response: {content[:200]}"],
                "suggestions": "",
            }


notebook_validator = NotebookValidatorAgent()
