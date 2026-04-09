from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis_client import close_redis, get_redis
from app.api.v1 import sessions, uploads, checkpoints, iterations, notebooks, debug

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Schema Transformer API",
    description="AI-powered SQL Server → Star Schema / Microsoft Fabric tool",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(checkpoints.router, prefix="/api/v1")
app.include_router(iterations.router, prefix="/api/v1")
app.include_router(notebooks.router, prefix="/api/v1")
app.include_router(debug.router, prefix="/api/v1")


@app.on_event("shutdown")
async def shutdown():
    await close_redis()


@app.get("/health")
async def health():
    return {"status": "ok"}
