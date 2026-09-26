"""
main.py — FastAPI AI Service
Exposes /chat as an SSE endpoint and /ml/* endpoints for ML Demand Forecasting.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

import google.generativeai as genai
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from agent import run_agent
from ml.model import forecast_pipeline
from tools.demand import _get

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# ─── Background startup training ─────────────────────────────────────────────

async def _train_on_startup() -> None:
    """Auto-train the ML model in the background when the service starts."""
    try:
        # Wait for .NET backend to be ready (max 30s)
        import httpx
        import os
        backend = os.getenv("BACKEND_BASE_URL", "http://localhost:5066")
        for _ in range(15):
            try:
                async with httpx.AsyncClient(timeout=3) as c:
                    r = await c.get(f"{backend}/health", follow_redirects=True)
                    if r.status_code < 500:
                        break
            except Exception:
                pass
            await asyncio.sleep(2)

        result = await forecast_pipeline.train_and_evaluate(_get, lookback_days=60, force=False)
        logger.info("Startup ML training: %s | MAE: %s", result.get("status"), result.get("mae", "n/a"))
    except Exception as exc:
        logger.warning("Startup ML training skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off background training without blocking startup
    asyncio.create_task(_train_on_startup())
    yield


# ─── Configure Gemini ─────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in .env")

genai.configure(api_key=GEMINI_API_KEY)

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Inventory AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5066"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request schemas ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message:     str
    user_id:     str
    workflow_id: str | None = None

class TrainRequest(BaseModel):
    lookback_days: int = 60
    force: bool = False

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

# ─── /ml endpoints (Component 4 Demand Forecasting) ───────────────────────────

@app.get("/ml/forecast")
async def get_forecast(
    days: int = Query(7, ge=1, le=30, description="Forecast horizon in days"),
    ingredient_id: str | None = Query(None, description="Optional ingredient UUID"),
):
    """
    Generate 7-day ML forward demand predictions based on real database records.
    """
    try:
        results = await forecast_pipeline.generate_forecast(_get, days=days, ingredient_id=ingredient_id)
        return {
            "status": "SUCCESS",
            "forecast_days": days,
            "forecasts": results,
            "metadata": forecast_pipeline.metadata,
        }
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "ERROR", "message": str(exc), "forecasts": []},
        )

@app.post("/ml/train")
async def train_model(req: TrainRequest = TrainRequest()):
    """
    Trigger training and chronological validation of the Random Forest demand model.
    """
    try:
        result = await forecast_pipeline.train_and_evaluate(_get, lookback_days=req.lookback_days, force=req.force)
        return result
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "ERROR", "message": str(exc)},
        )

@app.get("/ml/evaluation")
async def get_evaluation():
    """
    Retrieve latest evaluation metrics (MAE, RMSE, baseline comparison).
    """
    return {
        "status": "SUCCESS",
        "metadata": forecast_pipeline.metadata,
        "is_stale": forecast_pipeline.is_stale(),
    }

@app.get("/ml/status")
async def get_ml_status():
    """
    Health and freshness status of the ML pipeline.
    """
    return {
        "status": "ok",
        "is_stale": forecast_pipeline.is_stale(),
        "model_loaded": bool(forecast_pipeline.models or forecast_pipeline.global_model),
        "trained_at": forecast_pipeline.metadata.get("trained_at"),
        "mae": forecast_pipeline.metadata.get("mae"),
        "rmse": forecast_pipeline.metadata.get("rmse"),
    }

# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "inventory-ai"}
