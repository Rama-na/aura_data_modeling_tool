"""
Agent 3 — Domain Classifier (LLM reasoning agent).
Classifies every table as fact / dimension / ignore.
"""
from __future__ import annotations

import json
import logging

from app.core.azure_openai import LLMResponse, llm_client
from app.models.schema_plan import ClassificationResult, TableClassification, Classification
from app.prompts import DOMAIN_CLASSIFIER_SYSTEM_V1, DOMAIN_CLASSIFIER_USER_V1

logger = logging.getLogger(__name__)


class DomainClassifierAgent:
    def run(
        self,
        enriched_schema: dict,
        user_context: str = "",
        hard_overrides: dict | None = None,
    ) -> dict:
        """
        enriched_schema: output dict from RelationMapper
        hard_overrides: {table_name: 'fact'|'dimension'|'ignore'}
        Returns classification result + llm_response.
        """
        overrides = hard_overrides or {}
        user_prompt = DOMAIN_CLASSIFIER_USER_V1.format(
            enriched_schema_json=json.dumps(enriched_schema, indent=2, default=str),
            user_context=user_context or "No additional context provided.",
            hard_overrides_json=json.dumps(overrides, indent=2),
        )

        response: LLMResponse = llm_client.complete(
            system_prompt=DOMAIN_CLASSIFIER_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=4096,
        )

        try:
            raw = json.loads(response.content)
            classifications = []
            for item in raw.get("classifications", []):
                table = item.get("table_name", "")
                if table in overrides:
                    item["classification"] = overrides[table]
                    item["user_override"] = True
                else:
                    item["user_override"] = False
                classifications.append(item)

            fact_count = sum(1 for c in classifications if c.get("classification") == "fact")
            dim_count = sum(1 for c in classifications if c.get("classification") == "dimension")
            ignore_count = sum(1 for c in classifications if c.get("classification") == "ignore")

            result = {
                "classifications": classifications,
                "fact_count": fact_count,
                "dimension_count": dim_count,
                "ignore_count": ignore_count,
                "summary": raw.get("summary", ""),
            }
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"DomainClassifier parse error: {e}")
            result = {"classifications": [], "fact_count": 0, "dimension_count": 0, "ignore_count": 0, "summary": "Parse error"}

        return {
            "result": result,
            "llm_response": response,
        }


domain_classifier = DomainClassifierAgent()
