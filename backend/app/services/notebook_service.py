"""
Notebook generation service.
Orchestrates: Domain Splitter → sequential NotebookWriter runs.
"""
from __future__ import annotations

import logging
import re
import uuid

import redis.asyncio as aioredis

from app.agents.notebook_writer import domain_splitter, notebook_writer
from app.services import session_state as state
from app.services.file_storage import save_manifest, save_notebook

logger = logging.getLogger(__name__)


async def generate_notebooks(
    r: aioredis.Redis,
    session_id: str,
    from_iter_idx: int,
) -> str:
    """
    Splits the schema into domains and generates one notebook per domain sequentially.
    Returns the job_id.
    """
    job_id = str(uuid.uuid4())[:8]

    # Load the star schema plan from the specified iteration
    iter_detail = await state.get_iteration_detail(r, session_id, from_iter_idx)
    if not iter_detail or not iter_detail["agent4"]["output"]:
        raise ValueError(f"No schema plan found for iter {from_iter_idx}")

    schema_plan = iter_detail["agent4"]["output"]

    # Step 1: Domain splitting
    logger.info(f"[{session_id}] splitting schema into domains")
    domains = domain_splitter.split(schema_plan)
    logger.info(f"[{session_id}] {len(domains)} domains: {[d['domain_name'] for d in domains]}")

    await state.create_notebook_job(r, session_id, job_id, len(domains))
    await state.update_session_status(r, session_id, state.SessionStatus.generating_notebooks)

    # Step 2: Sequential generation with rolling context
    manifest = []
    prior_cells: list[str] | None = None

    for i, domain in enumerate(domains):
        domain_name = domain["domain_name"]
        logger.info(f"[{session_id}] generating notebook {i+1}/{len(domains)}: {domain_name}")

        await state.update_notebook_progress(
            r, session_id,
            domains_completed=i,
            current_domain=domain_name,
            manifest=manifest,
        )

        result = notebook_writer.run(
            domain=domain,
            schema_plan=schema_plan,
            prior_notebook_cells=prior_cells,
        )

        nb_json = result["notebook_json"]
        filename = _domain_to_filename(domain_name)
        save_notebook(session_id, filename, nb_json)

        # Extract cell sources for next iteration's context
        prior_cells = notebook_writer.get_cell_sources(nb_json)

        resp = result["llm_response"]
        manifest.append({
            "filename": filename,
            "domain": domain_name,
            "tables": domain.get("tables", []),
            "description": domain.get("description", ""),
            "cell_count": len(nb_json.get("cells", [])),
            "token_usage": {
                "prompt_tokens": resp.prompt_tokens,
                "completion_tokens": resp.completion_tokens,
                "total_tokens": resp.total_tokens,
            },
        })

    save_manifest(session_id, manifest)
    await state.complete_notebook_job(r, session_id, manifest)
    logger.info(f"[{session_id}] notebook generation complete — {len(manifest)} notebooks")
    return job_id


def _domain_to_filename(domain_name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", domain_name).lower().strip("_")
    return f"{safe}_domain.ipynb"
