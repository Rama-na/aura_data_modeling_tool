"""
Base LLM client abstracted behind a single class.
All agents import from here — never instantiate the Azure client inline.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from openai import AzureOpenAI
from app.core.config import settings


@dataclass
class LLMResponse:
    content: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    duration_ms: int


class AzureLLMClient:
    """Thin wrapper around AzureOpenAI for consistent usage across agents."""

    def __init__(self) -> None:
        self._client = AzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_KEY,
            api_version="2024-08-01-preview",
        )
        self._deployment = settings.AZURE_OPENAI_DEPLOYMENT

    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> LLMResponse:
        start = time.monotonic()
        kwargs: dict = {
            "model": self._deployment,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = self._client.chat.completions.create(**kwargs)
        duration_ms = int((time.monotonic() - start) * 1000)

        usage = response.usage
        return LLMResponse(
            content=response.choices[0].message.content or "",
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            duration_ms=duration_ms,
        )


# Singleton — import this in agents
llm_client = AzureLLMClient()
