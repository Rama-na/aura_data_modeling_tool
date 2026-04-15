"""
Base LLM client abstracted behind a single class.
All agents import from here — never instantiate the Azure client inline.

Compatibility notes for gpt-5.3-chat (o-series reasoning model):
  - 'temperature' is not supported; omitted from all requests.
  - 'system' role is replaced by 'developer' role.
  - 'max_tokens' replaced by 'max_completion_tokens'.
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
        self._client: AzureOpenAI | None = None
        self._deployment: str = ""

    def _get_client(self) -> AzureOpenAI:
        if self._client is None:
            endpoint = settings.AZURE_OPENAI_ENDPOINT
            if not endpoint or not endpoint.startswith("http"):
                raise RuntimeError(
                    "AZURE_OPENAI_ENDPOINT is not set. "
                    "Create backend/.env with your Azure OpenAI credentials "
                    "(see .env.example) and restart the server."
                )
            self._client = AzureOpenAI(
                azure_endpoint=endpoint,
                api_key=settings.AZURE_OPENAI_KEY,
                api_version=settings.AZURE_OPENAI_API_VERSION,
            )
            self._deployment = settings.AZURE_OPENAI_DEPLOYMENT
        return self._client

    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 1.0,   # kept in signature for call-site compatibility; not sent to API
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> LLMResponse:
        client = self._get_client()
        start = time.monotonic()
        # gpt-5.3-chat (o-series): uses 'developer' role (not 'system'),
        # does not accept 'temperature', uses 'max_completion_tokens'.
        kwargs: dict = {
            "model": self._deployment,
            "messages": [
                {"role": "developer", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = client.chat.completions.create(**kwargs)
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
