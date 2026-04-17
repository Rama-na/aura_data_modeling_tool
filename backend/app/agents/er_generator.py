"""
Agent 5 — ER Generator (code generation with Mermaid retry logic).
Generates Mermaid erDiagram syntax and data dictionary from the star schema spec.
"""
from __future__ import annotations

import json
import logging
import re

from app.core.azure_openai import LLMResponse, llm_client
from app.prompts import (
    ER_GENERATOR_SYSTEM_V1,
    ER_GENERATOR_USER_V1,
    ER_GENERATOR_RETRY_V1,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 2


def _normalize_data_dict(raw: object) -> dict:
    """
    Normalize the data_dictionary regardless of how the LLM formatted it.
    Handles:
      - {"tables": {"DimDate": {...}}}  → unwrap "tables" wrapper
      - columns stored under "column_definitions", "fields", "column_list"
      - column objects with "column_name"/"data_type" instead of "name"/"type"
    """
    if not isinstance(raw, dict):
        return {}

    # Unwrap single-key {"tables": {table_name: ...}} wrapper
    if set(raw.keys()) == {"tables"} and isinstance(raw.get("tables"), dict):
        raw = raw["tables"]

    normalized: dict = {}
    for table_name, entry in raw.items():
        if not isinstance(entry, dict):
            continue

        # Find columns under any of the common LLM key names
        cols_raw = (
            entry.get("columns")
            or entry.get("column_definitions")
            or entry.get("fields")
            or entry.get("column_list")
            or []
        )

        cols_normalized = []
        for col in cols_raw if isinstance(cols_raw, list) else []:
            if not isinstance(col, dict):
                continue
            cols_normalized.append({
                "name": col.get("name") or col.get("column_name") or col.get("field_name") or "",
                "type": col.get("type") or col.get("data_type") or col.get("datatype") or "",
                "classification": col.get("classification") or col.get("key_type") or col.get("constraint") or "",
                "description": col.get("description") or col.get("desc") or "",
            })

        normalized[table_name] = {
            "description": entry.get("description") or entry.get("table_description") or "",
            "columns": cols_normalized,
        }

    return normalized



    """Basic structural validation of Mermaid erDiagram syntax."""
    if not source.strip().startswith("erDiagram"):
        return False, "Must start with 'erDiagram'"
    open_braces = source.count("{")
    close_braces = source.count("}")
    if open_braces != close_braces:
        return False, f"Mismatched braces: {open_braces} open, {close_braces} close"
    # Detect legacy/invalid cardinality markers rejected by Mermaid v9+
    # Valid markers: || |o }| }o  — invalid: |{ }{
    if re.search(r'\|\{', source) or re.search(r'\}\{', source):
        return False, "Invalid cardinality markers detected (use }| }o || |o — not |{ or }{)"
    return True, ""


class ERGeneratorAgent:
    def run(self, schema_plan: dict) -> dict:
        """
        Returns mermaid_source, data_dictionary, llm_response, required_retry flag.
        Retries up to MAX_RETRIES times on Mermaid parse failure.
        """
        schema_json = json.dumps(schema_plan, indent=2, default=str)
        user_prompt = ER_GENERATOR_USER_V1.format(schema_plan_json=schema_json)

        response = self._call_llm(ER_GENERATOR_SYSTEM_V1, user_prompt)
        required_retry = False

        parsed, error = self._parse_response(response.content)

        if parsed is None or not self._is_valid(parsed):
            mermaid_ok, mermaid_error = (True, "") if parsed else (False, error)
            if parsed:
                mermaid_ok, mermaid_error = _validate_mermaid(parsed.get("mermaid_source", ""))

            if not mermaid_ok:
                logger.warning(f"ERGenerator attempt 1 failed: {mermaid_error}. Retrying...")
                required_retry = True
                bad_output_prefix = response.content[:500]
                retry_prompt = ER_GENERATOR_RETRY_V1.format(
                    error=mermaid_error,
                    output_prefix=bad_output_prefix,
                    schema_plan_json=schema_json,
                )
                response = self._call_llm(ER_GENERATOR_SYSTEM_V1, retry_prompt)
                parsed, error = self._parse_response(response.content)

        if parsed is None:
            logger.error("ERGenerator failed after retry. Returning empty diagram.")
            parsed = {
                "mermaid_source": "erDiagram\n  %% Generation failed — please refine and retry",
                "data_dictionary": {},
                "reasoning": f"Failed: {error}",
            }

        return {
            "mermaid_source": parsed.get("mermaid_source", ""),
            "data_dictionary": _normalize_data_dict(parsed.get("data_dictionary", {})),
            "reasoning": parsed.get("reasoning", ""),
            "llm_response": response,
            "required_retry": required_retry,
        }

    def _call_llm(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        return llm_client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=8192,
        )

    def _parse_response(self, content: str) -> tuple[dict | None, str]:
        # Strip markdown fences if the LLM wrapped in them
        cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
        try:
            return json.loads(cleaned), ""
        except json.JSONDecodeError as e:
            return None, str(e)

    def _is_valid(self, parsed: dict) -> bool:
        if "mermaid_source" not in parsed:
            return False
        ok, _ = _validate_mermaid(parsed["mermaid_source"])
        return ok


er_generator = ERGeneratorAgent()
