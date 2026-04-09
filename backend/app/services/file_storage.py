"""
Local filesystem storage helpers.
No cloud storage — files live in uploads/ and outputs/ at project root.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from app.core.config import settings


def uploads_dir(session_id: str) -> Path:
    d = settings.UPLOADS_DIR / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def notebooks_dir(session_id: str) -> Path:
    d = settings.OUTPUTS_DIR / session_id / "notebooks"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_upload(session_id: str, filename: str, content: bytes) -> Path:
    path = uploads_dir(session_id) / filename
    path.write_bytes(content)
    return path


def get_upload_path(session_id: str, filename: str) -> Path:
    return uploads_dir(session_id) / filename


def save_notebook(session_id: str, filename: str, notebook_json: dict) -> Path:
    path = notebooks_dir(session_id) / filename
    path.write_text(json.dumps(notebook_json, indent=2), encoding="utf-8")
    return path


def save_manifest(session_id: str, manifest: list[dict]) -> Path:
    path = notebooks_dir(session_id) / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return path


def get_manifest(session_id: str) -> list[dict]:
    path = notebooks_dir(session_id) / "manifest.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def list_notebooks(session_id: str) -> list[Path]:
    d = notebooks_dir(session_id)
    return sorted(p for p in d.glob("*.ipynb"))


def build_zip(session_id: str) -> bytes:
    """Returns an in-memory zip of all .ipynb files for this session."""
    buf = io.BytesIO()
    notebooks = list_notebooks(session_id)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for nb_path in notebooks:
            zf.write(nb_path, arcname=nb_path.name)
    return buf.getvalue()


def get_notebook_content(session_id: str, filename: str) -> dict | None:
    path = notebooks_dir(session_id) / filename
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
