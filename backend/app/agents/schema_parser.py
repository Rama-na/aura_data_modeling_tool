"""
Agent 1 — Schema Parser (deterministic, no LLM).
Parses uploaded SQL/CSV files into a structured ParsedSchema object.
"""
from __future__ import annotations

import csv
import io
import logging
import re
from pathlib import Path

from app.models.schema_plan import (
    ColumnInfo,
    FKRelationship,
    ParsedSchema,
    TableInfo,
)

logger = logging.getLogger(__name__)


class SchemaParserAgent:
    """Parses column metadata and FK relationship files."""

    def parse(
        self,
        columns_file_path: Path,
        fk_file_path: Path,
    ) -> ParsedSchema:
        tables = self._parse_columns_file(columns_file_path)
        relationships = self._parse_fk_file(fk_file_path)

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

    def _parse_columns_file(self, path: Path) -> list[TableInfo]:
        content = path.read_text(encoding="utf-8-sig")

        # Detect format — try CSV first, then SQL-style tab-separated
        tables: dict[str, TableInfo] = {}

        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            # Normalise column names (strip whitespace, lower for matching)
            row = {k.strip(): v.strip() for k, v in row.items() if k}

            schema_name = row.get("TABLE_SCHEMA") or row.get("schema_name") or "dbo"
            table_name = row.get("TABLE_NAME") or row.get("table_name") or ""
            column_name = row.get("COLUMN_NAME") or row.get("column_name") or ""
            data_type = row.get("DATA_TYPE") or row.get("data_type") or "nvarchar"
            nullable_raw = row.get("IS_NULLABLE") or row.get("is_nullable") or "YES"
            pk_raw = row.get("IS_PK") or row.get("is_pk") or "0"
            row_count_raw = row.get("ROW_COUNT") or row.get("row_count") or ""

            if not table_name or not column_name:
                continue

            key = f"{schema_name}.{table_name}"
            if key not in tables:
                row_count = None
                if row_count_raw:
                    try:
                        row_count = int(row_count_raw.replace(",", ""))
                    except ValueError:
                        pass
                tables[key] = TableInfo(
                    schema_name=schema_name,
                    table_name=table_name,
                    columns=[],
                    row_count=row_count,
                )

            nullable = nullable_raw.upper() in ("YES", "Y", "TRUE", "1")
            is_pk = pk_raw in ("1", "Y", "YES", "TRUE", "PK")

            tables[key].columns.append(
                ColumnInfo(
                    name=column_name,
                    data_type=data_type,
                    nullable=nullable,
                    is_pk=is_pk,
                )
            )

        return list(tables.values())

    def _parse_fk_file(self, path: Path) -> list[FKRelationship]:
        content = path.read_text(encoding="utf-8-sig")
        relationships: list[FKRelationship] = []

        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            row = {k.strip(): v.strip() for k, v in row.items() if k}

            parent_schema = row.get("PARENT_SCHEMA") or row.get("parent_schema") or "dbo"
            parent_table = row.get("PARENT_TABLE") or row.get("parent_table") or ""
            parent_col = row.get("PARENT_COLUMN") or row.get("parent_column") or ""
            ref_schema = row.get("REF_SCHEMA") or row.get("ref_schema") or "dbo"
            ref_table = row.get("REF_TABLE") or row.get("ref_table") or ""
            ref_col = row.get("REF_COLUMN") or row.get("ref_column") or ""

            if not parent_table or not ref_table:
                continue

            relationships.append(
                FKRelationship(
                    parent_schema=parent_schema,
                    parent_table=parent_table,
                    parent_column=parent_col,
                    ref_schema=ref_schema,
                    ref_table=ref_table,
                    ref_column=ref_col,
                    is_inferred=False,
                    confidence=1.0,
                )
            )

        return relationships


schema_parser = SchemaParserAgent()
