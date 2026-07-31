"""Event contract shared between the orchestrator and the frontend.

Every event is streamed to the browser as Server-Sent Events (SSE). The
``iq_active`` events are what drive the "which IQ layer is lighting up" panel in
the UI.
"""

from __future__ import annotations

import json
from enum import Enum
from typing import Any, Optional


class IQ(str, Enum):
    WORK = "work"
    FABRIC = "fabric"
    FOUNDRY = "foundry"
    WEB = "web"


class IQStatus(str, Enum):
    ACTIVE = "active"
    DONE = "done"


def sse(event: str, data: dict[str, Any]) -> str:
    """Format a single Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def iq_event(iq: IQ, status: IQStatus, detail: str, source: Optional[str] = None) -> str:
    return sse(
        "iq_active",
        {"iq": iq.value, "status": status.value, "detail": detail, "source": source},
    )


def token_event(text: str) -> str:
    return sse("token", {"text": text})


def message_event(role: str, content: str) -> str:
    return sse("message", {"role": role, "content": content})


def done_event() -> str:
    return sse("done", {"ok": True})


def error_event(message: str) -> str:
    return sse("error", {"message": message})
