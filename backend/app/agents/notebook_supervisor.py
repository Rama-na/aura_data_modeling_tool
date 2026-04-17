"""
Notebook Supervisor — optional LLM polish pass on the deterministically-merged
combined notebook. Does not rewrite business logic; only dedupes helpers and
reconciles naming.

Short-circuits on oversized input (cells > 30k chars) to avoid token blow-up;
the caller should check the returned `skipped` flag and fall back to the
deterministic output in that case.
"""
from __future__ import annotations

import json
import logging
import re
import uuid

from app.core.azure_openai import LLMResponse, llm_client
from app.prompts import (
    NOTEBOOK_SUPERVISOR_SYSTEM_V1,
    NOTEBOOK_SUPERVISOR_USER_V1,
)

logger = logging.getLogger(__name__)

MAX_INPUT_CHARS = 30_000


def _cell_source_to_text(source) -> str:
    if isinstance(source, list):
        return "".join(source)
    if isinstance(source, str):
        return source
    return ""


def _cells_payload(notebook_json: dict) -> list[dict]:
    """Shrink each cell to {cell_type, source} for the LLM payload."""
    out: list[dict] = []
    for cell in notebook_json.get("cells", []):
        out.append({
            "cell_type": cell.get("cell_type", "code"),
            "source": _cell_source_to_text(cell.get("source", "")),
        })
    return out


def _hydrate_cells(cells: list[dict]) -> list[dict]:
    """Turn {cell_type, source} pairs back into full .ipynb cell dicts."""
    hydrated: list[dict] = []
    for c in cells:
        if not isinstance(c, dict):
            continue
        ctype = c.get("cell_type", "code")
        source = c.get("source", "")
        if isinstance(source, list):
            source_text = "".join(source)
        else:
            source_text = str(source)
        if ctype == "markdown":
            hydrated.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": [source_text],
            })
        else:
            hydrated.append({
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [source_text],
                "id": str(uuid.uuid4())[:8],
            })
    return hydrated


class NotebookSupervisorAgent:
    def run(self, notebook_json: dict) -> dict:
        """
        Polish the combined notebook via one LLM pass.
        Returns:
            {
                "notebook_json": dict,         # polished (or original if skipped)
                "notes": str,                   # supervisor commentary
                "skipped": bool,                # True if we short-circuited on size
                "skip_reason": str | None,
                "llm_response": LLMResponse | None,
            }
        """
        cells = _cells_payload(notebook_json)
        cells_json = json.dumps(cells, indent=2, default=str)

        if len(cells_json) > MAX_INPUT_CHARS:
            logger.info(
                f"NotebookSupervisor skipping LLM pass: input size "
                f"{len(cells_json)} > {MAX_INPUT_CHARS} chars"
            )
            return {
                "notebook_json": notebook_json,
                "notes": f"Skipped LLM polish — combined notebook too large ({len(cells_json)} chars).",
                "skipped": True,
                "skip_reason": "oversize",
                "llm_response": None,
            }

        user_prompt = NOTEBOOK_SUPERVISOR_USER_V1.format(cells_json=cells_json)

        response: LLMResponse = llm_client.complete(
            system_prompt=NOTEBOOK_SUPERVISOR_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=8192,
        )

        parsed = self._parse_response(response.content)
        if parsed is None or not isinstance(parsed.get("cells"), list):
            logger.warning("NotebookSupervisor returned unparseable output — falling back to input.")
            return {
                "notebook_json": notebook_json,
                "notes": "Supervisor output was unparseable; kept deterministic merge output.",
                "skipped": True,
                "skip_reason": "parse_error",
                "llm_response": response,
            }

        polished = {
            "nbformat": notebook_json.get("nbformat", 4),
            "nbformat_minor": notebook_json.get("nbformat_minor", 5),
            "metadata": notebook_json.get("metadata", {}),
            "cells": _hydrate_cells(parsed["cells"]),
        }

        return {
            "notebook_json": polished,
            "notes": str(parsed.get("notes", "")),
            "skipped": False,
            "skip_reason": None,
            "llm_response": response,
        }

    def _parse_response(self, content: str) -> dict | None:
        cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip(), flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning(f"NotebookSupervisor parse error: {e}")
            return None


notebook_supervisor = NotebookSupervisorAgent()
