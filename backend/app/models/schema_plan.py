from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class SCDType(str, Enum):
    type1 = "type1"
    type2 = "type2"


class Classification(str, Enum):
    fact = "fact"
    dimension = "dimension"
    ignore = "ignore"


# --- Agent 1/2 outputs ---

class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool
    is_pk: bool = False


class TableInfo(BaseModel):
    schema_name: str
    table_name: str
    columns: list[ColumnInfo]
    row_count: Optional[int] = None
    fk_count: int = 0


class FKRelationship(BaseModel):
    parent_schema: str
    parent_table: str
    parent_column: str
    ref_schema: str
    ref_table: str
    ref_column: str
    is_inferred: bool = False
    confidence: float = 1.0
    reasoning: Optional[str] = None


class ParsedSchema(BaseModel):
    tables: list[TableInfo]
    relationships: list[FKRelationship]
    table_count: int
    relationship_count: int


# --- Agent 3 output ---

class TableClassification(BaseModel):
    schema_name: str
    table_name: str
    classification: Classification
    reasoning: str
    user_override: bool = False


class ClassificationResult(BaseModel):
    classifications: list[TableClassification]
    fact_count: int
    dimension_count: int
    ignore_count: int


# --- Agent 4 output ---

class MeasureColumn(BaseModel):
    column_name: str
    aggregation: str  # SUM, COUNT, AVG, etc.
    description: str


class DimensionReference(BaseModel):
    dimension_table: str
    fk_column: str
    sk_column: str  # surrogate key column name in fact


class FactTableSpec(BaseModel):
    table_name: str
    grain_description: str
    measures: list[MeasureColumn]
    dimension_references: list[DimensionReference]
    source_table: str


class DimensionTableSpec(BaseModel):
    table_name: str
    scd_type: SCDType
    natural_key_columns: list[str]
    surrogate_key_column: str
    attributes: list[str]
    source_table: str
    is_conformed: bool = False
    conformed_usage: list[str] = []


class StarSchemaSpec(BaseModel):
    fact_tables: list[FactTableSpec]
    dimension_tables: list[DimensionTableSpec]
    bridge_tables: list[dict] = []  # for many-to-many
    notes: str = ""
