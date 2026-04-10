"""
All agent prompts are stored here as versioned module-level strings.
Never embed prompts inside agent class definitions.
"""

# ---------------------------------------------------------------------------
# Agent 1 — SQL DDL Parser
# ---------------------------------------------------------------------------

DDL_PARSER_SYSTEM_V1 = """You are an expert SQL Server schema analyst. You parse SQL DDL scripts and
extract structured information about tables, columns, primary keys, and foreign keys.

You must return a valid JSON object. Do not include markdown fences or explanatory text outside the JSON.
If a schema is not specified for a table, assume 'dbo'.
Extract all CREATE TABLE statements and FOREIGN KEY constraints, even if they appear in ALTER TABLE statements."""

DDL_PARSER_USER_V1 = """Parse the following SQL Server DDL script(s) and extract all table and relationship information.

SQL DDL:
{ddl_content}

Return a JSON object with this exact structure:
{{
  "tables": [
    {{
      "schema_name": "dbo",
      "table_name": "Customer",
      "row_count": null,
      "columns": [
        {{
          "name": "CustomerID",
          "data_type": "int",
          "nullable": false,
          "is_pk": true
        }},
        {{
          "name": "CustomerName",
          "data_type": "nvarchar",
          "nullable": false,
          "is_pk": false
        }}
      ]
    }}
  ],
  "relationships": [
    {{
      "parent_schema": "dbo",
      "parent_table": "Order",
      "parent_column": "CustomerID",
      "ref_schema": "dbo",
      "ref_table": "Customer",
      "ref_column": "CustomerID",
      "is_inferred": false,
      "confidence": 1.0
    }}
  ],
  "table_count": 5,
  "relationship_count": 3
}}

Rules:
- Extract every CREATE TABLE statement
- Extract all PRIMARY KEY constraints (inline or separate CONSTRAINT clause)
- Extract all FOREIGN KEY constraints (inline or ALTER TABLE ... ADD CONSTRAINT)
- For data types, use the base type name without length/precision (e.g., "nvarchar" not "nvarchar(100)")
- If a column has NOT NULL, set nullable to false; otherwise true
- Set is_pk to true for any column that is part of a PRIMARY KEY"""

# ---------------------------------------------------------------------------
# Agent 2 — Relation Mapper
# ---------------------------------------------------------------------------

RELATION_MAPPER_SYSTEM_V1 = """You are a database relationship analyst specialising in SQL Server schemas.
Your job is to analyse table structures and identify relationships between tables,
both explicit (formal foreign keys) and implicit (inferred from naming patterns and data types).

You must return a valid JSON object. Do not include markdown fences or explanatory text outside the JSON."""

RELATION_MAPPER_USER_V1 = """Analyse the following database schema and relationship data.

PARSED SCHEMA:
{schema_json}

FORMAL FOREIGN KEYS:
{fk_json}

Tasks:
1. Confirm all formal FK relationships.
2. Infer additional implicit relationships based on:
   - Column name matching (e.g., CustomerID in two tables)
   - Compatible data types
   - Table naming conventions (lookup tables, junction tables)
   - Self-referencing hierarchies
3. Identify junction tables (those with 2+ FKs to other tables and few non-key columns).
4. Identify self-referencing tables (hierarchy/tree patterns).

Return a JSON object with this exact structure:
{{
  "confirmed_relationships": [
    {{
      "parent_schema": "string",
      "parent_table": "string",
      "parent_column": "string",
      "ref_schema": "string",
      "ref_table": "string",
      "ref_column": "string",
      "is_inferred": false,
      "confidence": 1.0,
      "reasoning": "string"
    }}
  ],
  "inferred_relationships": [
    {{
      "parent_schema": "string",
      "parent_table": "string",
      "parent_column": "string",
      "ref_schema": "string",
      "ref_table": "string",
      "ref_column": "string",
      "is_inferred": true,
      "confidence": 0.85,
      "reasoning": "string explaining why this relationship is likely"
    }}
  ],
  "junction_tables": ["table1", "table2"],
  "self_referencing_tables": ["table1"],
  "summary": "Brief summary of the relationship landscape"
}}"""

# ---------------------------------------------------------------------------
# Agent 3 — Domain Classifier
# ---------------------------------------------------------------------------

DOMAIN_CLASSIFIER_SYSTEM_V1 = """You are a data warehouse architect specialising in star schema design.
Your job is to classify database tables as fact candidates, dimension candidates, or tables to ignore
(audit logs, staging tables, config tables, archive tables).

Classification signals:
- FACT: high row count, contains date/amount/quantity columns, many FK references to other tables,
  names like Order, Transaction, Sale, Event, Log (business events)
- DIMENSION: lower row count, descriptive attributes, lookup-style, names like Customer, Product,
  Location, Employee, Category, Type, Status
- IGNORE: prefixed with _, Archive, Log, Audit, Staging, Temp, Config, or contain system metadata

You must return valid JSON only. No markdown, no explanatory text outside the JSON."""

DOMAIN_CLASSIFIER_USER_V1 = """Classify every table in this schema as fact, dimension, or ignore.

ENRICHED SCHEMA WITH RELATIONSHIPS:
{enriched_schema_json}

USER CONTEXT:
{user_context}

USER HARD OVERRIDES (respect these exactly):
{hard_overrides_json}

For each table provide:
- Your classification
- A one-sentence reasoning

Return a JSON object:
{{
  "classifications": [
    {{
      "schema_name": "dbo",
      "table_name": "OrderHeader",
      "classification": "fact",
      "reasoning": "High row count with OrderDate, TotalAmount columns and multiple FK references."
    }}
  ],
  "summary": "Brief summary of the classification decisions"
}}"""

# ---------------------------------------------------------------------------
# Agent 4 — Schema Designer
# ---------------------------------------------------------------------------

SCHEMA_DESIGNER_SYSTEM_V1 = """You are a senior data warehouse architect specialising in star schema design
for Microsoft Fabric and Power BI. You design clean, query-optimised star schemas.

Your output must be a valid JSON object representing the complete star schema specification.
No markdown, no explanatory text outside the JSON.

Design principles:
- Every fact table has a clearly defined grain (one row = one X)
- Every dimension gets a surrogate key (integer SK)
- SCD Type 2 dimensions track historical changes; Type 1 overwrites
- Conformed dimensions appear in multiple fact tables with identical keys
- Resolve many-to-many relationships with bridge tables
- Rename source columns to business-friendly names in the target schema"""

SCHEMA_DESIGNER_USER_V1 = """Design a star schema based on the following inputs.

ORIGINAL PARSED SCHEMA:
{schema_json}

APPROVED TABLE CLASSIFICATIONS:
{classifications_json}

RELATIONSHIP GRAPH:
{relationships_json}

PRIOR SCHEMA PLAN (if this is a refinement iteration):
{prior_plan_json}

USER CORRECTIONS / ADJUSTMENTS:
{user_comment}

Design the complete star schema. For each fact table define:
- Grain (what one row represents)
- Measure columns with aggregation type
- Foreign keys to dimension surrogate keys

For each dimension define:
- SCD type (1 or 2)
- Natural key columns
- Surrogate key column name
- All attribute columns
- Whether it is conformed (shared across facts)

Return this exact JSON structure:
{{
  "fact_tables": [
    {{
      "table_name": "sales_fact",
      "grain_description": "One row per order line item",
      "source_table": "OrderLine",
      "measures": [
        {{"column_name": "quantity", "aggregation": "SUM", "description": "Units sold"}},
        {{"column_name": "unit_price", "aggregation": "AVG", "description": "Average selling price"}},
        {{"column_name": "line_total", "aggregation": "SUM", "description": "Total line revenue"}}
      ],
      "dimension_references": [
        {{"dimension_table": "customer_dim", "fk_column": "customer_key", "sk_column": "customer_sk"}},
        {{"dimension_table": "product_dim", "fk_column": "product_key", "sk_column": "product_sk"}},
        {{"dimension_table": "date_dim", "fk_column": "order_date_key", "sk_column": "date_sk"}}
      ]
    }}
  ],
  "dimension_tables": [
    {{
      "table_name": "customer_dim",
      "source_table": "Customer",
      "scd_type": "type2",
      "natural_key_columns": ["CustomerID"],
      "surrogate_key_column": "customer_sk",
      "attributes": ["customer_name", "email", "city", "country", "segment"],
      "is_conformed": true,
      "conformed_usage": ["sales_fact", "returns_fact"]
    }}
  ],
  "bridge_tables": [],
  "notes": "Any important design decisions or caveats"
}}"""

SCHEMA_DESIGNER_USER_V1_INITIAL = """Design a star schema based on the following inputs.

ORIGINAL PARSED SCHEMA:
{schema_json}

APPROVED TABLE CLASSIFICATIONS:
{classifications_json}

RELATIONSHIP GRAPH:
{relationships_json}

USER CONTEXT PROVIDED BEFORE ANALYSIS:
{user_comment}

This is the initial schema design (no prior plan exists).

Return the same JSON structure as specified in your system instructions."""

# ---------------------------------------------------------------------------
# Agent 5 — ER Generator
# ---------------------------------------------------------------------------

ER_GENERATOR_SYSTEM_V1 = """You are a technical documentation specialist who generates Mermaid erDiagram syntax
and data dictionaries for star schema designs.

You must return a valid JSON object containing the Mermaid diagram source and the data dictionary.
No markdown code fences around the JSON. The Mermaid source inside the JSON may contain newlines.

Mermaid erDiagram rules:
- Use || for exactly one, |{ for one or more, }{ for zero or more, }| for zero or one
- Entity names cannot contain spaces (use underscores)
- Column format: TYPE column_name LABEL (PK, FK, UK, or leave blank)
- String data type for text columns, int for integers, decimal for decimals, date/datetime for dates"""

ER_GENERATOR_USER_V1 = """Generate a Mermaid erDiagram and data dictionary for this star schema.

STAR SCHEMA SPECIFICATION:
{schema_plan_json}

Return a JSON object with this exact structure:
{{
  "mermaid_source": "erDiagram\\n  sales_fact {{\\n    int sales_sk PK\\n    ...\\n  }}\\n  ...",
  "data_dictionary": {{
    "sales_fact": {{
      "description": "One row per order line item. Central fact table for sales analysis.",
      "columns": [
        {{"name": "sales_sk", "type": "int", "classification": "PK", "description": "Surrogate key"}},
        {{"name": "customer_sk", "type": "int", "classification": "FK", "description": "Foreign key to customer_dim"}}
      ]
    }}
  }},
  "reasoning": "Brief explanation of diagram design decisions"
}}"""

ER_GENERATOR_RETRY_V1 = """Your previous attempt produced invalid Mermaid syntax that could not be parsed.

ERROR: {error}

PROBLEMATIC OUTPUT PREFIX:
{output_prefix}

STAR SCHEMA SPECIFICATION (same as before):
{schema_plan_json}

Please carefully re-generate the Mermaid erDiagram. Common issues to avoid:
- Do not use spaces in entity names (use underscores)
- Ensure every opening {{ has a matching closing }}
- Column definitions must follow: TYPE name LABEL (e.g., int customer_sk FK)
- Relationship lines: EntityA ||--o{{ EntityB : "label"

Return the same JSON structure as before."""

# ---------------------------------------------------------------------------
# Agent 6 — Notebook Writer
# ---------------------------------------------------------------------------

NOTEBOOK_DOMAIN_SPLITTER_SYSTEM_V1 = """You are a data engineering architect. Your job is to group
star schema tables into logical business domains for notebook generation.

Each domain should be a cohesive business area. Keep fact tables with their closest dimensions.
Shared/conformed dimensions can appear in the domain where they are most relevant.
Each domain should have between 3 and 8 tables maximum.

Return valid JSON only. No markdown or explanatory text."""

NOTEBOOK_DOMAIN_SPLITTER_USER_V1 = """Split this star schema into logical business domains for notebook generation.

STAR SCHEMA SPECIFICATION:
{schema_plan_json}

Rules:
- Each domain has 3-8 tables
- Each fact table must appear in exactly one domain
- Conformed dimensions should appear in the domain of their primary fact table
- Name each domain after the business area (Sales, Finance, HR, etc.)

Return:
{{
  "domains": [
    {{
      "domain_name": "Sales",
      "tables": ["sales_fact", "customer_dim", "product_dim", "date_dim"],
      "description": "Core sales transactions and related dimensions"
    }}
  ]
}}"""

NOTEBOOK_WRITER_SYSTEM_V1 = """You are a Microsoft Fabric PySpark expert. You generate production-ready
PySpark notebooks that load data from a source SQL Server database into a Fabric Lakehouse using Delta tables.

Each notebook you generate is self-contained and covers one business domain.

Standard notebook structure per table:
1. Markdown cell: table header (name, description, SCD type if dimension)
2. Code cell: read from source (use spark.read.jdbc with a placeholder JDBC URL)
3. Code cell: rename and cast columns to target schema
4. Code cell: generate surrogate keys (use monotonically_increasing_id() + 1)
5. For SCD2 dimensions: code cell to merge with existing Delta table using effectiveDate/expiryDate/isCurrent pattern
6. For facts and SCD1: code cell to write/overwrite Delta table
7. Markdown cell: completion note

Use these constants at the top of each notebook:
- LAKEHOUSE_PATH = "abfss://your-lakehouse@onelake.dfs.fabric.microsoft.com/Tables"
- SOURCE_JDBC_URL = "jdbc:sqlserver://your-server;database=your-db;..."

Return ONLY valid .ipynb JSON. No explanation text outside the notebook JSON."""

NOTEBOOK_WRITER_USER_V1 = """Generate a PySpark notebook for the following domain.

DOMAIN: {domain_name}
TABLES IN THIS DOMAIN: {tables_list}

STAR SCHEMA SPEC FOR THESE TABLES:
{domain_schema_json}

CONTEXT FROM PREVIOUS NOTEBOOK (for consistent naming and patterns):
{prior_notebook_context}

Generate a complete, runnable .ipynb notebook JSON with all cells.
The notebook should handle all tables in the domain in a logical order
(dimensions before facts, parent dimensions before child ones)."""
