"""M11 FastAPI ML ranking service — roadassist-logreg-v1 (SYNTHETIC-trained).

Run:  uvicorn ml.api.main:app --port 8000   (from repo root: uvicorn ml.api.main:app)
M8 remains the dispatch authority: this service SCORES already-eligible
candidates only. Clients enforce a ~1.2 s timeout and fall back to the
deterministic M8 ranking on any failure (see src/lib/mlRank.ts).
"""
from __future__ import annotations

import logging
import math
import os
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("roadassist-ml")
logging.basicConfig(level=logging.INFO, format="%(message)s")

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"

PROBLEM_CATS = {"battery", "engine", "flat-tyre", "other", "tow"}
VEHICLE_TYPES = {"bike", "car", "truck", "van"}


def _load():
    import sys
    sys.path.insert(0, str(MODEL_DIR.parent))
    from features import FEATURE_ORDER  # noqa: E402
    from preprocess import Preprocessor  # noqa: E402
    model = joblib.load(MODEL_DIR / "model.joblib")
    prep: Preprocessor = joblib.load(MODEL_DIR / "preprocessor.joblib")
    import json
    meta = json.loads((MODEL_DIR / "metadata.json").read_text(encoding="utf-8"))
    # Fail startup on artifact/schema drift: frozen coefficients against a
    # reordered feature list would score garbage while still returning 200s.
    if list(meta.get("feature_order") or []) != list(FEATURE_ORDER):
        raise RuntimeError(
            "model artifact feature_order does not match features.FEATURE_ORDER — retrain before serving"
        )
    return model, prep, meta


_model, _prep, _meta = _load()
VERSION: str = _meta["model_version"]


class CandidateIn(BaseModel):
    mechanic_id: str
    distance_km: float
    service_match: int
    within_radius: int = 1
    rating: Optional[float] = None
    review_count: Optional[float] = None
    experience_years: Optional[float] = None
    service_radius_km: float = 25.0
    active_jobs: int = 0
    acceptance_rate_hist: float = 0.5
    completion_rate_hist: float = 0.8
    avg_response_min_hist: Optional[float] = None
    availability: int = 1
    hour: int = 12
    dow: int = 0
    offer_round: int = 0
    eligible_count: int = 1
    problem_category: str = "other"
    vehicle_type: str = "car"

    @field_validator("mechanic_id")
    @classmethod
    def _id_nonempty(cls, v: str) -> str:
        if not v or len(v) > 128:
            raise ValueError("mechanic_id required (1-128 chars)")
        return v

    @field_validator("distance_km", "service_radius_km", "acceptance_rate_hist",
                     "completion_rate_hist", "avg_response_min_hist", "rating",
                     "review_count", "experience_years")
    @classmethod
    def _finite(cls, v: Any) -> Any:
        if v is not None and (not isinstance(v, (int, float)) or not math.isfinite(v)):
            raise ValueError("must be finite")
        return v

    @field_validator("rating")
    @classmethod
    def _rating_range(cls, v: Any) -> Any:
        if v is not None and not 1.0 <= v <= 5.0:
            raise ValueError("rating must be 1-5 or omitted")
        return v

    @field_validator("distance_km")
    @classmethod
    def _distance_range(cls, v: float) -> float:
        # Training-data bounds (ml/clean.py): a client cannot vault a mechanic
        # to the top with a negative or absurd distance.
        if not 0.0 <= v <= 500.0:
            raise ValueError("distance_km must be within 0-500 km")
        return v

    @field_validator("service_radius_km")
    @classmethod
    def _radius_range(cls, v: float) -> float:
        if not 1.0 <= v <= 200.0:
            raise ValueError("service_radius_km must be within 1-200 km")
        return v

    @field_validator("acceptance_rate_hist", "completion_rate_hist")
    @classmethod
    def _rate_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("historical rates must be within 0-1")
        return v

    @field_validator("review_count", "experience_years", "active_jobs", "eligible_count", "offer_round", "avg_response_min_hist")
    @classmethod
    def _sane_caps(cls, v: Any, info: Any) -> Any:
        caps = {
            "review_count": 100_000,
            "experience_years": 60,
            "active_jobs": 100,
            "eligible_count": 1_000,
            "offer_round": 10,
            "avg_response_min_hist": 10_080,
        }
        cap = caps.get(getattr(info, "field_name", "") or "")
        if v is not None and cap is not None and not 0 <= float(v) <= cap:
            raise ValueError(f"{info.field_name} must be within 0-{cap}")
        return v

    @field_validator("service_match", "within_radius", "availability")
    @classmethod
    def _binary(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("must be 0 or 1")
        return v

    @field_validator("active_jobs", "offer_round", "eligible_count", "hour", "dow")
    @classmethod
    def _nonneg(cls, v: int) -> int:
        if not isinstance(v, int) or v < 0:
            raise ValueError("must be a non-negative int")
        return v

    @field_validator("hour")
    @classmethod
    def _hour(cls, v: int) -> int:
        if v > 23:
            raise ValueError("hour must be 0-23")
        return v

    @field_validator("dow")
    @classmethod
    def _dow(cls, v: int) -> int:
        if v > 6:
            raise ValueError("dow must be 0-6")
        return v

    @field_validator("problem_category")
    @classmethod
    def _cat(cls, v: str) -> str:
        if v not in PROBLEM_CATS:
            raise ValueError(f"unknown problem_category: {v}")
        return v

    @field_validator("vehicle_type")
    @classmethod
    def _veh(cls, v: str) -> str:
        if v not in VEHICLE_TYPES:
            raise ValueError(f"unknown vehicle_type: {v}")
        return v


class RankRequest(BaseModel):
    request_id: Optional[str] = None
    candidates: list[CandidateIn] = Field(default=[], max_length=100)


app = FastAPI(title="RoadAssist ML ranking", version=VERSION)

# CORS is FAIL-CLOSED: without ML_ALLOWED_ORIGINS no browser origin may call
# this service (server-to-server callers are unaffected). Set it to a comma-
# separated origin list only when the browser seam is actually deployed.
_ALLOWED_ORIGINS = os.environ.get("ML_ALLOWED_ORIGINS", "").strip()
if _ALLOWED_ORIGINS:
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in _ALLOWED_ORIGINS.split(",") if o.strip()],
        allow_methods=["POST", "GET"],
        allow_headers=["Content-Type"],
    )


def _log(corr: str, event: str, **fields: Any) -> None:
    safe = {k: v for k, v in fields.items()}  # callers pass counts/durations only
    logger.info({"corr": corr, "event": event, "model": VERSION, **safe})


def _row(c: CandidateIn) -> dict:
    d = c.model_dump()
    d.pop("mechanic_id")  # identifier: passthrough only, NEVER a feature
    return d


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_version": VERSION}


@app.get("/model-info")
def model_info() -> dict:
    return {
        "model_name": _meta["model_name"],
        "model_version": VERSION,
        "model_type": _meta["model_type"],
        "n_features": len(_meta["feature_order"]),
        "feature_schema_version": _meta["feature_schema_version"],
        "dataset": _meta["dataset"],
        "dataset_hash_sha256": _meta["dataset_hash_sha256"],
        "operation": "rank eligible mechanics by P(successful assignment)",
        "authority_note": "Scores only. M8 dispatch remains authoritative.",
    }


@app.post("/predict")
def predict(c: CandidateIn, request: Request) -> JSONResponse:
    corr = request.headers.get("x-correlation-id", uuid.uuid4().hex[:12])
    t0 = time.perf_counter()
    X = _prep.transform(pd.DataFrame([_row(c)]))
    score = float(_model.predict_proba(X)[0, 1])
    _log(corr, "predict", duration_ms=round((time.perf_counter() - t0) * 1000, 2), outcome="ok")
    return JSONResponse({"score": score, "model_version": VERSION})


@app.post("/rank-mechanics")
def rank_mechanics(body: RankRequest, request: Request) -> JSONResponse:
    corr = request.headers.get("x-correlation-id", uuid.uuid4().hex[:12])
    t0 = time.perf_counter()
    if not body.candidates:
        raise HTTPException(status_code=422, detail="candidates must not be empty")
    if len(body.candidates) > 100:
        raise HTTPException(status_code=422, detail="at most 100 candidates per call")
    X = _prep.transform(pd.DataFrame([_row(c) for c in body.candidates]))
    scores = _model.predict_proba(X)[:, 1].tolist()
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    ranked = [
        {"mechanic_id": body.candidates[i].mechanic_id, "score": round(float(scores[i]), 5),
         "rank": r + 1, "model_version": VERSION}
        for r, i in enumerate(order)
    ]
    _log(corr, "rank", candidates=len(body.candidates),
         duration_ms=round((time.perf_counter() - t0) * 1000, 2), outcome="ok")
    return JSONResponse({"ranked": ranked, "model_version": VERSION})
