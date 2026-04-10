"""
Agent 1 — SQL DDL Parser (LLM-based).
Parses uploaded SQL DDL files into a structured ParsedSchema object.
Accepts one or more .sql files and extracts tables, columns, PKs, and FKs.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.core.azure_openai import llm_client
from app.models.schema_plan import (
    ColumnInfo,
    FKRelationship,
    ParsedSchema,
    TableInfo,
)
from app.prompts import DDL_PARSER_SYSTEM_V1, DDL_PARSER_USER_V1

logger = logging.getLogger(__name__)


class SchemaParserAgent:
    """Parses SQL DDL files using an LLM to extract schema structure."""

    def parse_files(self, sql_file_paths: list[Path]) -> ParsedSchema:
        """Parse one or more SQL DDL files."""
        combined_ddl = self._combine_files(sql_file_paths)
        return self._parse_ddl(combined_ddl)

    def parse(self, sql_file_paths: list[Path]) -> ParsedSchema:
        """Alias for parse_files — for API compatibility."""
        return self.parse_files(sql_file_paths)

    def _combine_files(self, paths: list[Path]) -> str:
        parts = []
        for path in paths:
            try:
                content = path.read_text(encoding="utf-8-sig", errors="replace")
                parts.append(f"-- FILE: {path.name}\n{content}")
            except Exception as exc:
                logger.warning(f"Could not read {path}: {exc}")
        return "\n\n".join(parts)

    def _parse_ddl(self, ddl_content: str) -> ParsedSchema:
        # Truncate if very large (LLM input limit)
        max_chars = 60_000
        if len(ddl_content) > max_chars:
            logger.warning(f"DDL content truncated from {len(ddl_content)} to {max_chars} chars")
            ddl_content = ddl_content[:max_chars] + "\n-- [TRUNCATED]"

        user_prompt = DDL_PARSER_USER_V1.format(ddl_content=ddl_content)

        response = llm_client.complete(
            system_prompt=DDL_PARSER_SYSTEM_V1,
            user_prompt=user_prompt,
            temperature=0.0,
            max_tokens=8192,
            response_format={"type": "json_object"},
        )

        try:
            data = json.loads(response.content)
        except json.JSONDecodeError as exc:
            logger.error(f"DDL parser returned invalid JSON: {exc}\nContent: {response.content[:500]}")
            raise ValueError(f"LLM returned invalid JSON: {exc}")

        tables = self._build_tables(data.get("tables", []))
        relationships = self._build_relationships(data.get("relationships", []))

        # Annotate FK count per table
        fk_targets: dict[str, int] = {}
        for rel in relationships:
            key = f"{rel.parent_schema}.{rel.parent_table}"
            fk_targets[key] = fk_targets.get(key, 0) + 1

        for t in tables:
            key = f"{t.schema_name}.{t.table_name}"
            t.fk_count = fk_targets.get(key, 0)

        return ParsedSchema(
            tables=tables,
            relationships=relationships,
            table_count=len(tables),
            relationship_count=len(relationships),
        )

    def _build_tables(self, raw_tables: list[dict]) -> list[TableInfo]:
        tables = []
        for t in raw_tables:
            columns = []
            for c in t.get("columns", []):
                columns.append(ColumnInfo(
                    name=c.get("name", ""),
                    data_type=c.get("data_type", "nvarchar"),
                    nullable=bool(c.get("nullable", True)),
                    is_pk=bool(c.get("is_pk", False)),
                ))
            tables.append(TableInfo(
                schema_name=t.get("schema_name", "dbo"),
                table_name=t.get("table_name", ""),
                columns=columns,
                row_count=t.get("row_count"),
            ))
        return tables

    def _build_relationships(self, raw_rels: list[dict]) -> list[FKRelationship]:
        relationships = []
        for r in raw_rels:
            if not r.get("parent_table") or not r.get("ref_table"):
                continue
            relationships.append(FKRelationship(
                parent_schema=r.get("parent_schema", "dbo"),
                parent_table=r.get("parent_table", ""),
                parent_column=r.get("parent_column", ""),
                ref_schema=r.get("ref_schema", "dbo"),
                ref_table=r.get("ref_table", ""),
                ref_column=r.get("ref_column", ""),
                is_inferred=bool(r.get("is_inferred", False)),
                confidence=float(r.get("confidence", 1.0)),
            ))
        return relationships


schema_parser = SchemaParserAgent()
