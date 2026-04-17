"""
Deterministic merge of all per-domain .ipynb files into a single combined notebook.

Structure of the output notebook:
  Cell 0 (markdown):   Title header
  Cell 1 (code):       All deduped imports from every domain
  Cell 2 (code):       Shared constants (UPPER_CASE) + reusable helper defs
  Cell 3 (markdown):   ## {domain_name}   (one section per domain)
  Cell 4 (code):       Remaining code from that domain (imports / constants stripped)
  ... repeated per domain ...

This is pure Python; no LLM calls. The LLM supervisor pass (optional) runs after
this and only does semantic cleanup.
"""
from __future__ import annotations

import ast
import logging
import re
import uuid
from pathlib import Path

from app.services.file_storage import get_manifest, notebooks_dir

logger = logging.getLogger(__name__)

COMBINED_FILENAME = "combined.ipynb"

# Names that look like shared constants worth hoisting into the constants cell.
_CONSTANT_RE = re.compile(r"^[A-Z_][A-Z0-9_]*\s*=")
# Matches common revision/path helpers the Notebook Writer emits.
_HELPER_FN_NAMES = {"get_current_revision_max"}


def _cell_source_to_text(source) -> str:
    if isinstance(source, list):
        return "".join(source)
    if isinstance(source, str):
        return source
    return ""


def _load_notebook(path: Path) -> dict | None:
    try:
        import json
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Could not read notebook {path}: {e}")
        return None


def _extract_imports_and_body(code: str) -> tuple[list[str], str]:
    """
    Split a code block into (import_lines, remaining_code).
    Handles: `import x`, `import x as y`, `from x import y, z`, multi-line `from x import (…)`.
    """
    lines = code.splitlines()
    imports: list[str] = []
    body_lines: list[str] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            # Handle multi-line `from x import ( … )`
            if "(" in line and ")" not in line:
                collected = [line]
                i += 1
                while i < len(lines) and ")" not in lines[i]:
                    collected.append(lines[i])
                    i += 1
                if i < len(lines):
                    collected.append(lines[i])
                imports.append("\n".join(collected))
            else:
                imports.append(line)
        else:
            body_lines.append(line)
        i += 1

    return imports, "\n".join(body_lines)


def _dedupe_imports(imports: list[str]) -> list[str]:
    """Dedupe by normalized text; preserve first-seen order."""
    seen: set[str] = set()
    out: list[str] = []
    for imp in imports:
        key = re.sub(r"\s+", " ", imp.strip())
        if key and key not in seen:
            seen.add(key)
            out.append(imp.strip())
    return out


def _extract_constants_and_helpers(code: str) -> tuple[list[str], str]:
    """
    Pull UPPER_CASE module-level assignments and well-known helper functions
    out of the body. Return (lifted_blocks, remaining_body).
    """
    # Try AST first for robust splitting; fall back to line scan if parse fails.
    lifted: list[str] = []
    remaining_source: str = code

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return lifted, code

    lines = code.splitlines()

    def _block_text(node: ast.AST) -> str:
        start = node.lineno - 1
        end = getattr(node, "end_lineno", node.lineno)
        return "\n".join(lines[start:end])

    kept_ranges: list[tuple[int, int]] = []
    for node in tree.body:
        block_text = _block_text(node)

        if isinstance(node, ast.Assign):
            targets = node.targets
            if len(targets) == 1 and isinstance(targets[0], ast.Name):
                name = targets[0].id
                if _CONSTANT_RE.match(f"{name} ="):
                    lifted.append(block_text)
                    kept_ranges.append((node.lineno - 1, getattr(node, "end_lineno", node.lineno)))
                    continue
        elif isinstance(node, ast.FunctionDef):
            if node.name in _HELPER_FN_NAMES:
                lifted.append(block_text)
                kept_ranges.append((node.lineno - 1, getattr(node, "end_lineno", node.lineno)))
                continue

    # Remove lifted line-ranges from remaining source.
    if kept_ranges:
        removed = set()
        for a, b in kept_ranges:
            for n in range(a, b):
                removed.add(n)
        remaining_source = "\n".join(
            line for idx, line in enumerate(lines) if idx not in removed
        )

    return lifted, remaining_source


def _domain_section_body(nb: dict) -> str:
    """
    Concatenate all code cell sources, stripping imports, constants and helpers.
    Leave markdown cells alone (we only use code cells' content here).
    """
    code_chunks: list[str] = []
    for cell in nb.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        src = _cell_source_to_text(cell.get("source", []))
        if src.strip():
            code_chunks.append(src.rstrip())
    return "\n\n".join(code_chunks)


def _make_markdown_cell(text: str) -> dict:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [text],
    }


def _make_code_cell(code: str) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [code],
        "id": str(uuid.uuid4())[:8],
    }


def combine_notebooks(session_id: str) -> dict:
    """
    Deterministically merge all per-domain .ipynb files for this session.
    Writes `combined.ipynb` into the session's notebooks directory.

    Returns a summary dict: {
        "filename": "combined.ipynb",
        "domains": [...],
        "cell_count": N,
        "char_count": N,
    }
    """
    manifest = get_manifest(session_id)
    if not manifest:
        raise ValueError("No notebooks found — generate per-domain notebooks first")

    nb_dir = notebooks_dir(session_id)

    # First pass: load every notebook and collect imports + lifted constants.
    all_imports: list[str] = []
    lifted_blocks: list[str] = []
    domain_bodies: list[tuple[str, str]] = []  # (domain_name, remaining_code)

    for entry in manifest:
        filename = entry.get("filename")
        domain = entry.get("domain") or filename or "Domain"
        if not filename:
            continue
        path = nb_dir / filename
        nb = _load_notebook(path)
        if not nb:
            continue

        full_code = _domain_section_body(nb)
        imports, body_without_imports = _extract_imports_and_body(full_code)
        all_imports.extend(imports)

        lifted, remaining = _extract_constants_and_helpers(body_without_imports)
        lifted_blocks.extend(lifted)

        domain_bodies.append((domain, remaining.strip()))

    deduped_imports = _dedupe_imports(all_imports)
    deduped_lifted = _dedupe_blocks(lifted_blocks)

    # Build the combined notebook structure.
    combined: dict = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {
                "display_name": "PySpark",
                "language": "python",
                "name": "synapse_pyspark",
            },
            "language_info": {"name": "python"},
        },
        "cells": [],
    }

    combined["cells"].append(_make_markdown_cell(
        "# Combined PySpark Notebook — Microsoft Fabric Lakehouse Load\n\n"
        "Merged from all per-domain notebooks. Imports and shared constants have been "
        "grouped at the top; domain sections follow below."
    ))

    if deduped_imports:
        combined["cells"].append(_make_markdown_cell("## Imports"))
        combined["cells"].append(_make_code_cell("\n".join(deduped_imports)))

    if deduped_lifted:
        combined["cells"].append(_make_markdown_cell("## Shared constants & helpers"))
        combined["cells"].append(_make_code_cell("\n\n".join(deduped_lifted)))

    for domain_name, body in domain_bodies:
        combined["cells"].append(_make_markdown_cell(f"## {domain_name}"))
        if body:
            combined["cells"].append(_make_code_cell(body))

    # Write the combined notebook to disk.
    import json
    out_path = nb_dir / COMBINED_FILENAME
    out_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    logger.info(f"[{session_id}] combined notebook written: {out_path}")

    char_count = sum(
        len(_cell_source_to_text(c.get("source", [])))
        for c in combined["cells"]
    )

    return {
        "filename": COMBINED_FILENAME,
        "domains": [d for d, _ in domain_bodies],
        "cell_count": len(combined["cells"]),
        "char_count": char_count,
    }


def _dedupe_blocks(blocks: list[str]) -> list[str]:
    """Dedupe lifted constant/helper blocks by normalized whitespace."""
    seen: set[str] = set()
    out: list[str] = []
    for b in blocks:
        key = re.sub(r"\s+", " ", b.strip())
        if key and key not in seen:
            seen.add(key)
            out.append(b.strip())
    return out


def get_combined_path(session_id: str) -> Path:
    return notebooks_dir(session_id) / COMBINED_FILENAME


def load_combined_notebook(session_id: str) -> dict | None:
    import json
    path = get_combined_path(session_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def replace_combined_notebook(session_id: str, notebook_json: dict) -> None:
    """Overwrite the combined notebook file (used by the supervisor LLM pass)."""
    import json
    path = get_combined_path(session_id)
    path.write_text(json.dumps(notebook_json, indent=2), encoding="utf-8")
