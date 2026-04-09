"""
Agent 2 — Relation Mapper (LLM-assisted).
Infers implicit relationships where formal FKs are absent.
"""
from __future__ import annotations

import json
import logging

from app.core.azure_openai import LLMResponse, llm_client
from app.models.schema_plan import FKRelationship, ParsedSchema
from app.prompts import RELATION_MAPPER_SYSTEM_V1, RELATION_MAPPER_USER_V1

logger = logging.getLogger(__name__)


class RelationMapperAgent:
    def run(self, schema: ParsedSchema) -> dict:
        """
        Returns an enriched relationship dict with inferred links.
        Also returns the raw LLMResponse for session logging.
        """
        schema_json = json.dumps(schema.model_dump(), indent=2, default=str)
        fk_json = json.dumps(
            [r.model_dump() for r in schema.relationships], indent=2
        )

        user_prompt = RELATION_MAPPER_USER_V1.format(
            schema_json=schema_json, fk_json=fk_json
        )

        response: LLMResponse = llm_client.complete(
            system_prompt=RELATION_MAPPER_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=4096,
        )

        try:
            result = json.loads(response.content)
        except json.JSONDecodeError:
            logger.warning("RelationMapper returned non-JSON; falling back to schema relationships only.")
            result = {
                "confirmed_relationships": [r.model_dump() for r in schema.relationships],
                "inferred_relationships": [],
                "junction_tables": [],
                "self_referencing_tables": [],
                "summary": "Fallback: formal FKs only.",
            }

        return {
            "result": result,
            "llm_response": response,
        }


relation_mapper = RelationMapperAgent()
