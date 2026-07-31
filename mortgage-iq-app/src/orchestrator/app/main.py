"""FastAPI entrypoint for the Loan Concierge orchestrator.

Exposes:
* GET  /health          - liveness probe for Azure Container Apps.
* GET  /api/config      - reports the active mode + IQ metadata for the UI.
* POST /api/chat        - streams the assessment as Server-Sent Events.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import settings
from .orchestrator import run_assessment

app = FastAPI(title="Mortgage IQ - Loan Concierge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

IQ_METADATA = [
    {"id": "work", "name": "Work IQ", "source": "Microsoft 365 + Graph",
     "blurb": "Borrower documents, email, and collaboration context."},
    {"id": "fabric", "name": "Fabric IQ", "source": "Microsoft Fabric (OneLake)",
     "blurb": "Governed business data: credit, income, valuation."},
    {"id": "foundry", "name": "Foundry IQ", "source": "Azure AI Foundry",
     "blurb": "Agent reasoning + knowledge grounding (AI Search)."},
    {"id": "web", "name": "Web IQ", "source": "Grounding with Bing",
     "blurb": "Live market rates and regulatory context from the web."},
]


class ChatRequest(BaseModel):
    message: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
async def config() -> dict:
    return {
        "mode": "foundry" if settings.is_foundry else "mock",
        "model": settings.model_deployment if settings.is_foundry else "mock-reasoner",
        "iqs": IQ_METADATA,
    }


@app.post("/api/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        run_assessment(req.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
