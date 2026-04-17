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


def _normalize_column(col: object, fallback_name: str = "") -> dict | None:
    """Normalize a single column entry — tolerates many field-name aliases."""
    if not isinstance(col, dict):
        return None
    return {
        "name": (
            col.get("name")
            or col.get("column_name")
            or col.get("field_name")
            or col.get("col_name")
            or col.get("attr_name")
            or col.get("field")
            or col.get("property_name")
            or fallback_name
            or ""
        ),
        "type": (
            col.get("type")
            or col.get("data_type")
            or col.get("datatype")
            or col.get("dtype")
            or ""
        ),
        "classification": (
            col.get("classification")
            or col.get("key_type")
            or col.get("constraint")
            or col.get("key")
            or ""
        ),
        "description": col.get("description") or col.get("desc") or col.get("comment") or "",
    }


def _normalize_columns(cols_raw: object) -> list:
    """Handle columns as list, or as dict keyed by column name."""
    normalized: list = []
    if isinstance(cols_raw, list):
        for col in cols_raw:
            n = _normalize_column(col)
            if n:
                normalized.append(n)
    elif isinstance(cols_raw, dict):
        # {"sales_sk": {"type": "int", "classification": "PK"}, …}
        for col_name, col_body in cols_raw.items():
            if isinstance(col_body, dict):
                n = _normalize_column(col_body, fallback_name=str(col_name))
                if n:
                    normalized.append(n)
            elif isinstance(col_body, str):
                # {"sales_sk": "int"} shorthand
                normalized.append({
                    "name": str(col_name),
                    "type": col_body,
                    "classification": "",
                    "description": "",
                })
    return normalized


def _normalize_table_entry(entry: dict) -> dict:
    """Pull columns + description out of a table entry, handling aliases."""
    cols_raw = (
        entry.get("columns")
        or entry.get("column_definitions")
        or entry.get("fields")
        or entry.get("column_list")
        or entry.get("attributes")
        or []
    )
    return {
        "description": entry.get("description") or entry.get("table_description") or "",
        "columns": _normalize_columns(cols_raw),
    }


def _normalize_data_dict(raw: object) -> dict:
    """
    Normalize the data_dictionary regardless of how the LLM formatted it.
    Handles:
      - {"tables": {"DimDate": {...}}}  → unwrap "tables" wrapper
      - list of table objects: [{"table_name": "sales_fact", "columns": [...]}, ...]
      - columns stored under various aliases (column_definitions, fields, attributes, column_list)
      - columns as a dict keyed by column name instead of a list
      - column objects with assorted field-name aliases (column_name, data_type, etc.)
    """
    # List shape: [{"table_name": "…", "columns": [...]}, ...]
    if isinstance(raw, list):
        normalized_from_list: dict = {}
        for item in raw:
            if not isinstance(item, dict):
                continue
            table_name = (
                item.get("table_name")
                or item.get("name")
                or item.get("table")
                or ""
            )
            if not table_name:
                continue
            normalized_from_list[str(table_name)] = _normalize_table_entry(item)
        return normalized_from_list

    if not isinstance(raw, dict):
        return {}

    # Unwrap single-key {"tables": ...} wrapper (may wrap dict OR list)
    if set(raw.keys()) == {"tables"}:
        inner = raw.get("tables")
        if isinstance(inner, (dict, list)):
            return _normalize_data_dict(inner)

    normalized: dict = {}
    for table_name, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        # If this value looks like a *group* of table entries rather than a single
        # table entry (e.g. LLM used "dimension_tables": {"dim_customer": {...}}),
        # flatten it one level.
        if _looks_like_table_group(entry):
            for sub_name, sub_entry in entry.items():
                if isinstance(sub_entry, dict):
                    normalized[str(sub_name)] = _normalize_table_entry(sub_entry)
        else:
            normalized[str(table_name)] = _normalize_table_entry(entry)
    return normalized


def _looks_like_table_group(v: dict) -> bool:
    """
    Return True when v is a dict of table entries (a group), not a single table entry.
    A table entry has keys like 'columns', 'description', etc.
    A group has those keys nested one level deeper.
    """
    table_keys = {"columns", "column_definitions", "fields", "column_list", "attributes", "description"}
    if any(k in v for k in table_keys):
        return False  # v itself is a table entry
    for sub_v in v.values():
        if isinstance(sub_v, dict) and any(k in sub_v for k in table_keys):
            return True
    return False


def _extract_full_data_dict(parsed: dict) -> dict:
    """
    Collect ALL tables from the LLM's parsed response, regardless of where it put them.

    LLMs vary widely: some put everything flat inside data_dictionary, others split
    fact/dimension tables into separate top-level keys, or nest them under group keys
    inside data_dictionary. This function merges everything it can find.
    """
    # Keys the LLM commonly uses to describe table groups (other than data_dictionary)
    TABLE_GROUP_KEYS = {
        "dimension_tables", "dimensions", "dim_tables",
        "fact_tables", "facts",
        "bridge_tables", "tables",
    }
    NON_TABLE_KEYS = {"mermaid_source", "reasoning", "notes", "explanation", "data_dictionary"}

    merged: dict = {}

    # Primary source: the data_dictionary key
    raw_dd = parsed.get("data_dictionary", {})
    if raw_dd:
        merged.update(_normalize_data_dict(raw_dd))

    # Secondary: scan sibling keys for table groups the LLM put outside data_dictionary
    for key, value in parsed.items():
        if key in NON_TABLE_KEYS:
            continue
        if not isinstance(value, dict):
            continue
        # Either an explicit group key or something that looks like a table group
        if key in TABLE_GROUP_KEYS or _looks_like_table_group(value):
            merged.update(_normalize_data_dict(value))
        elif not merged.get(key):
            # Could be an individual table entry at the top level
            merged.update(_normalize_data_dict({key: value}))

    return merged


def _validate_mermaid(source: str) -> tuple[bool, str]:
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
            "data_dictionary": _extract_full_data_dict(parsed),
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
