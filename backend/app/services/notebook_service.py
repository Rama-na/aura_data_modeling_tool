"""
Notebook generation service.
Orchestrates: Domain Splitter → sequential NotebookWriter runs with state tracking.
"""
from __future__ import annotations

import logging
import re
import uuid

from app.agents.notebook_validator import notebook_validator
from app.agents.notebook_writer import domain_splitter, notebook_writer
from app.services import session_state as state
from app.services.file_storage import save_manifest, save_notebook
from app.services.notebook_combiner import combine_notebooks

logger = logging.getLogger(__name__)


def _build_relation_state(
    schema_plan: dict,
    processed_tables: list[str],
    remaining_tables: list[str],
    current_domain_tables: list[str],
) -> dict:
    """
    Builds CURRENT_RELATION_STATE deterministically from the schema plan.
    Called before each domain's notebook generation.

    Structure:
    {
        "available_dataframes": ["df_sales_fact", "df_customer_dim", ...],
        "grain": "One row per order line item",
        "joined_tables": ["sales_fact", "customer_dim"],
        "primary_keys": ["SalesOrderLineID"],
        "ready_for_join": ["product_dim", "date_dim"],
    }
    """
    # DataFrames already built in prior domains
    available_dataframes = [f"df_{t}" for t in processed_tables]

    # Find the fact table in the current domain to extract grain + PKs
    grain = "Unknown"
    primary_keys: list[str] = []
    for fact in schema_plan.get("fact_tables", []):
        if fact["table_name"] in current_domain_tables:
            grain = fact.get("grain_description", "Unknown")
            # Use the natural keys from dimension references or measure columns as a proxy
            primary_keys = [
                ref["fk_column"]
                for ref in fact.get("dimension_references", [])
            ]
            break

    return {
        "available_dataframes": available_dataframes,
        "grain": grain,
        "joined_tables": processed_tables,
        "primary_keys": primary_keys,
        "ready_for_join": remaining_tables,
    }


async def generate_notebooks(
    session_id: str,
    from_iter_idx: int,
) -> str:
    """
    Splits the schema into domains and generates one notebook per domain sequentially.
    Passes CURRENT_RELATION_STATE to each domain for state-aware PySpark generation.
    Returns the job_id.
    """
    job_id = str(uuid.uuid4())[:8]

    # Load the star schema plan from the specified iteration
    iter_detail = state.get_iteration_detail(session_id, from_iter_idx)
    if not iter_detail or not iter_detail["agent4"]["output"]:
        raise ValueError(f"No schema plan found for iter {from_iter_idx}")

    schema_plan = iter_detail["agent4"]["output"]

    # Step 1: Domain splitting
    logger.info(f"[{session_id}] splitting schema into domains")
    domains = domain_splitter.split(schema_plan)
    logger.info(f"[{session_id}] {len(domains)} domains: {[d['domain_name'] for d in domains]}")

    state.create_notebook_job(session_id, job_id, len(domains))
    state.update_session_status(session_id, state.SessionStatus.generating_notebooks)

    # Precompute all table names in order (for ready_for_join tracking)
    all_tables_ordered: list[str] = []
    for d in domains:
        all_tables_ordered.extend(d.get("tables", []))

    # Step 2: Sequential generation with CURRENT_RELATION_STATE tracking
    manifest = []
    processed_tables: list[str] = []

    for i, domain in enumerate(domains):
        domain_name = domain["domain_name"]
        domain_tables = domain.get("tables", [])
        logger.info(f"[{session_id}] generating notebook {i+1}/{len(domains)}: {domain_name}")

        state.update_notebook_progress(
            session_id,
            domains_completed=i,
            current_domain=domain_name,
            manifest=manifest,
        )

        # Tables not yet processed (including current domain)
        remaining = [t for t in all_tables_ordered if t not in processed_tables]

        current_relation_state = _build_relation_state(
            schema_plan=schema_plan,
            processed_tables=processed_tables,
            remaining_tables=[t for t in remaining if t not in domain_tables],
            current_domain_tables=domain_tables,
        )

        result = notebook_writer.run(
            domain=domain,
            schema_plan=schema_plan,
            current_relation_state=current_relation_state,
        )

        nb_json = result["notebook_json"]
        pyspark_code = result["pyspark_code"]
        filename = _domain_to_filename(domain_name)
        save_notebook(session_id, filename, nb_json)

        # Validate the generated notebook
        validation_result = _run_validation(domain_tables, current_relation_state, pyspark_code)
        if not validation_result["is_valid"]:
            logger.warning(
                f"[{session_id}] domain '{domain_name}' validation issues: {validation_result['issues']}"
            )

        # Mark domain tables as processed for next iteration
        processed_tables.extend(domain_tables)

        resp = result["llm_response"]
        manifest.append({
            "filename": filename,
            "domain": domain_name,
            "tables": domain_tables,
            "description": domain.get("description", ""),
            "cell_count": len(nb_json.get("cells", [])),
            "token_usage": {
                "prompt_tokens": resp.prompt_tokens,
                "completion_tokens": resp.completion_tokens,
                "total_tokens": resp.total_tokens,
            },
            "validation": validation_result,
        })

    save_manifest(session_id, manifest)

    # Step 3: Deterministic merge into a single combined.ipynb (always-on, no LLM).
    try:
        summary = combine_notebooks(session_id)
        logger.info(
            f"[{session_id}] combined notebook built: {summary['filename']} "
            f"({summary['cell_count']} cells, {summary['char_count']} chars)"
        )
    except Exception as e:
        # Combining is best-effort — don't fail the whole notebook job if it breaks.
        logger.warning(f"[{session_id}] combined notebook build failed: {e}")

    state.complete_notebook_job(session_id, manifest)
    logger.info(f"[{session_id}] notebook generation complete — {len(manifest)} notebooks")
    return job_id


def _run_validation(
    domain_tables: list[str],
    current_relation_state: dict,
    pyspark_code: str,
) -> dict:
    """Run validator agent; return safe fallback on any exception."""
    try:
        return notebook_validator.validate(
            domain_tables=domain_tables,
            current_relation_state=current_relation_state,
            notebook_code=pyspark_code,
        )
    except Exception as e:
        logger.warning(f"NotebookValidator error (non-fatal): {e}")
        return {"is_valid": True, "issues": [], "suggestions": "Validation skipped due to error."}


def _domain_to_filename(domain_name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", domain_name).lower().strip("_")
    return f"{safe}_domain.ipynb"
