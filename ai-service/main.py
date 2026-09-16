"""
main.py — FastAPI AI Service
Exposes /chat as an SSE endpoint.
"""

import os
from dotenv import load_dotenv
load_dotenv()

import google.generativeai as genai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent import run_agent

# ─── Configure Gemini ─────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in .env")

genai.configure(api_key=GEMINI_API_KEY)

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Inventory AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5066"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request schema ───────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message:     str
    user_id:     str
    workflow_id: str | None = None

# ─── /chat endpoint ───────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest):
    """
    Streams SSE events from the agent back to the .NET backend (which relays
    them further to the React frontend).
    """
    async def event_stream():
        try:
            async for chunk in run_agent(
                message=req.message,
                user_id=req.user_id,
                workflow_id=req.workflow_id,
            ):
                yield chunk
        except Exception as exc:
            # Keep the SSE contract intact so the .NET proxy and UI receive a
            # useful diagnostic instead of an abruptly failed stream.
            import json
            yield f"data: {json.dumps({'type': 'message', 'text': f'AI service error: {exc}'})}\n\n"
            yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "inventory-ai"}
