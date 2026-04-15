import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[3]  # project root
BACKEND_DIR = Path(__file__).resolve().parents[2]  # backend/

# Load .env from the backend directory
load_dotenv(BACKEND_DIR / ".env")


class Settings:
    AZURE_OPENAI_ENDPOINT: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    AZURE_OPENAI_KEY: str = os.getenv("AZURE_OPENAI_KEY", "")
    AZURE_OPENAI_DEPLOYMENT: str = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.3-chat")
    AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key")
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    DEBUG_MODE: bool = os.getenv("DEBUG_MODE", "false").lower() == "true"

    UPLOADS_DIR: Path = BASE_DIR / "uploads"
    OUTPUTS_DIR: Path = BASE_DIR / "outputs"

    # Max tables per notebook chunk
    MAX_TABLES_PER_NOTEBOOK: int = 8


settings = Settings()
