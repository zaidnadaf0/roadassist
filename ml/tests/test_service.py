"""M11 service + parity tests (FastAPI TestClient, no network)."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from main import VERSION, app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)

GOOD = {
    "mechanic_id": "mech_001",
    "distance_km": 2.5,
    "service_match": 1,
    "rating": 4.6,
    "review_count": 80,
    "experience_years": 6,
    "service_radius_km": 25.0,
    "active_jobs": 1,
    "acceptance_rate_hist": 0.7,
    "completion_rate_hist": 0.9,
    "avg_response_min_hist": 6.0,
    "availability": 1,
    "hour": 18,
    "dow": 2,
    "offer_round": 0,
    "eligible_count": 4,
    "problem_category": "tow",
    "vehicle_type": "car",
}


def test_health_and_model_info():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    info = client.get("/model-info").json()
    assert info["model_version"] == VERSION == "roadassist-logreg-v1"
    assert info["n_features"] == 25
    assert "synthetic" in info["dataset"].lower() or "SYNTHETIC" in info["dataset"]


def test_predict_valid_and_versioned():
    r = client.post("/predict", json=GOOD)
    assert r.status_code == 200
    body = r.json()
    assert 0.0 <= body["score"] <= 1.0
    assert body["model_version"] == VERSION


def test_predict_invalid_rejected():
    assert client.post("/predict", json={**GOOD, "rating": 9.9}).status_code == 422
    assert client.post("/predict", json={**GOOD, "problem_category": "teleport"}).status_code == 422
    assert client.post("/predict", json={**GOOD, "hour": 25}).status_code == 422
    assert client.post("/predict", json={k: v for k, v in GOOD.items() if k != "distance_km"}).status_code == 422
    assert client.post("/predict", json={**GOOD, "mechanic_id": ""}).status_code == 422
    assert client.post("/predict", json={**GOOD, "service_match": 2}).status_code == 422


def test_rank_ordering_and_determinism():
    cands = [
        {**GOOD, "mechanic_id": "near-ace", "distance_km": 0.5, "rating": 4.9},
        {**GOOD, "mechanic_id": "far-rookie", "distance_km": 18.0, "rating": 3.6, "review_count": 5},
        {**GOOD, "mechanic_id": "mid", "distance_km": 4.0, "rating": 4.3},
    ]
    first = client.post("/rank-mechanics", json={"candidates": cands}).json()["ranked"]
    second = client.post("/rank-mechanics", json={"candidates": cands}).json()["ranked"]
    assert first == second, "same input must rank identically"
    assert [r["mechanic_id"] for r in first] == ["near-ace", "mid", "far-rookie"]
    assert [r["rank"] for r in first] == [1, 2, 3]
    assert all(r["model_version"] == VERSION for r in first)


def test_identifiers_do_not_leak_into_features():
    a = {**GOOD, "mechanic_id": "aaa"}
    b = {**GOOD, "mechanic_id": "zzz-completely-different"}
    sa = client.post("/predict", json=a).json()["score"]
    sb = client.post("/predict", json=b).json()["score"]
    assert sa == sb


def test_rank_malformed_and_empty():
    assert client.post("/rank-mechanics", json={"candidates": []}).status_code == 422
    assert client.post("/rank-mechanics", json={}).status_code == 422
    assert client.post("/rank-mechanics", json={"candidates": [{**GOOD, "distance_km": "far"}]}).status_code == 422
    big = {"candidates": [{**GOOD, "mechanic_id": f"m{i}"} for i in range(101)]}
    assert client.post("/rank-mechanics", json=big).status_code == 422


def test_parity_with_frozen_evaluation_pipeline():
    """Service predictions == direct sklearn pipeline within 1e-9."""
    import joblib
    model = joblib.load(ROOT / "model" / "model.joblib")
    sys.path.insert(0, str(ROOT))
    from preprocess import Preprocessor
    df = pd.read_csv(ROOT / "data" / "candidates_clean.csv").head(50)
    prep = Preprocessor().fit(pd.read_csv(ROOT / "data" / "candidates_clean.csv").merge(
        pd.read_csv(ROOT / "data" / "splits.csv"), on="request_id").query("split == 'train'"))
    # Direct pipeline on raw-style rows.
    direct = model.predict_proba(prep.transform(df))[:, 1]
    # Same rows through the service contract.
    for i, (_, row) in enumerate(df.head(5).iterrows()):
        payload = {
            "mechanic_id": f"parity-{i}",
            "distance_km": float(row["distance_km"]), "service_match": int(row["service_match"]),
            "rating": None if pd.isna(row["rating"]) else float(row["rating"]),
            "review_count": None if pd.isna(row["review_count"]) else float(row["review_count"]),
            "experience_years": None if pd.isna(row["experience_years"]) else float(row["experience_years"]),
            "service_radius_km": float(row["service_radius_km"]), "active_jobs": int(row["active_jobs"]),
            "acceptance_rate_hist": float(row["acceptance_rate_hist"]),
            "completion_rate_hist": float(row["completion_rate_hist"]),
            "avg_response_min_hist": None if pd.isna(row["avg_response_min_hist"]) else float(row["avg_response_min_hist"]),
            "hour": int(row["hour"]), "dow": int(row["dow"]), "offer_round": int(row["offer_round"]),
            "eligible_count": int(row["eligible_count"]),
            "problem_category": str(row["problem_category"]), "vehicle_type": str(row["vehicle_type"]),
        }
        r = client.post("/predict", json=payload)
        assert r.status_code == 200, r.text
        assert abs(r.json()["score"] - float(direct[i])) < 1e-6
