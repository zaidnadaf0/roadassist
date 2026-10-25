"""M9 synthetic development dataset generator (seeded, reproducible).

Simulates the M8 schema + dispatch workflow: mechanic pool with skill tiers,
30 days of requests, M8-style eligibility, latent accept model, offer rounds.
EVERYTHING IS SYNTHETIC — distributions are documented below, not observed.

  python ml/generate.py --n-requests 3000 --seed 42 --out ml/data

Reproducibility: numpy Generator(seed) is the ONLY randomness source.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
GENERATOR_VERSION = "m9-gen-v1"

CATEGORIES = ["flat-tyre", "battery", "engine", "tow", "other"]
CATEGORY_W = [0.25, 0.20, 0.20, 0.15, 0.20]
VEHICLES = ["car", "bike", "van", "truck"]
VEHICLE_W = [0.45, 0.30, 0.10, 0.15]
SPECIALTIES = ["tow", "recovery", "battery", "electrical", "engine", "tyre", "general"]

# Bengaluru neighborhoods (anchor lat/lng) — customer + garage placement.
HOODS = [
    (12.9784, 77.6408),  # Indiranagar
    (12.9352, 77.6245),  # Koramangala
    (12.9698, 77.7500),  # Whitefield
    (12.9116, 77.6474),  # HSR
    (12.9871, 77.5873),  # Malleshwaram
    (12.9279, 77.6271),  # BTM
    (13.0358, 77.5970),  # Hebbal
    (12.9141, 77.6782),  # Electronic City edge
]

CATEGORY_NEEDS = {
    "flat-tyre": {"tyre", "general"},
    "battery": {"battery", "electrical", "general"},
    "engine": {"engine", "general"},
    "tow": {"tow", "recovery", "general"},
    "other": {"general"},
}


def haversine(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(np.radians, [lat1, lng1, lat2, lng2])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlng / 2) ** 2
    return 2 * 6371 * np.arcsin(np.sqrt(h))


def build_pool(rng: np.random.Generator, n: int = 40) -> pd.DataFrame:
    tiers = rng.choice(["ace", "standard", "rookie"], size=n, p=[0.2, 0.55, 0.25])
    rows = []
    for i, tier in enumerate(tiers):
        hood = HOODS[int(rng.integers(len(HOODS)))]
        n_spec = int(rng.integers(1, 4))
        specs = list(rng.choice(SPECIALTIES, size=n_spec, replace=False))
        if tier == "rookie" and rng.random() < 0.5:
            specs = ["general"]
        rating = None
        if not (tier == "rookie" and rng.random() < 0.6):
            base = {"ace": 4.8, "standard": 4.35, "rookie": 3.9}[tier]
            rating = round(float(np.clip(rng.normal(base, 0.2), 1.0, 5.0)), 1)
        # Reviews correlate with tenure/tier: the deterministic baseline reads
        # them as reliability signal, so the truth rewards them too (with
        # headroom left for history/workload/context features ML will use).
        rc_lo, rc_hi = {"ace": (80, 220), "standard": (20, 120), "rookie": (3, 30)}[tier]
        review_count = None if (rating is None and rng.random() < 0.5) else int(rng.integers(rc_lo, rc_hi + 1))
        rows.append({
            "mechanic_id": f"mech_{i:03d}",
            "tier": tier,  # synthetic-design column, NEVER a feature (dropped in features.py)
            "approved": bool(rng.random() < 0.9),
            "is_available": bool(rng.random() < 0.9),
            "specialties": "|".join(specs),
            "vehicle_types": "|".join(rng.choice(["car", "bike", "van", "truck"], size=int(rng.integers(1, 3)), replace=False)),
            "experience_years": None if rng.random() < 0.05 else int(rng.integers(1, 26)),
            "service_radius_km": int(rng.integers(10, 41)),
            "rating": rating,
            "review_count": review_count,
            "base_lat": hood[0] + float(rng.normal(0, 0.02)),
            "base_lng": hood[1] + float(rng.normal(0, 0.02)),
            "accept_base": {"ace": 0.75, "standard": 0.5, "rookie": 0.3}[tier],
            "complete_prob": {"ace": 0.95, "standard": 0.85, "rookie": 0.7}[tier],
            "avg_response_min": round(float(np.clip(rng.normal({"ace": 4, "standard": 8, "rookie": 12}[tier], 2), 1, 30)), 1),
            "acceptance_rate_hist": round(float(np.clip(rng.normal({"ace": 0.8, "standard": 0.55, "rookie": 0.35}[tier], 0.08), 0.05, 0.98)), 3),
            "completion_rate_hist": round(float(np.clip(rng.normal({"ace": 0.95, "standard": 0.86, "rookie": 0.72}[tier], 0.05), 0.1, 1.0)), 3),
        })
    return pd.DataFrame(rows)


def sample_hour(rng: np.random.Generator) -> int:
    # Commute peaks 8-10h and 17-20h; quiet 0-5h.
    w = np.array([2, 1, 1, 1, 1, 2, 4, 7, 10, 9, 7, 6, 6, 6, 6, 6, 7, 9, 10, 8, 6, 5, 4, 3], dtype=float)
    return int(rng.choice(24, p=w / w.sum()))


def generate(n_requests: int, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    pool = build_pool(rng)
    req_rows: list[dict] = []
    cand_rows: list[dict] = []
    for r in range(n_requests):
        day = int(rng.integers(0, 30))
        hour = sample_hour(rng)
        hood = HOODS[int(rng.integers(len(HOODS)))]
        clat = hood[0] + float(rng.normal(0, 0.015))
        clng = hood[1] + float(rng.normal(0, 0.015))
        cat = str(rng.choice(CATEGORIES, p=CATEGORY_W))
        veh = str(rng.choice(VEHICLES, p=VEHICLE_W))
        req_id = f"req_{r:05d}"
        req_rows.append({
            "request_id": req_id, "day": day, "hour": hour, "dow": (day % 7),
            "problem_category": cat, "vehicle_type": veh,
            "customer_lat": round(clat, 5), "customer_lng": round(clng, 5),
        })
        needs = CATEGORY_NEEDS[cat]
        eligible = []
        for _, m in pool.iterrows():
            if not m["approved"] or not m["is_available"]:
                continue
            if not (set(str(m["specialties"]).split("|")) & needs):
                continue
            km = float(haversine(clat, clng, m["base_lat"], m["base_lng"]))
            if km > m["service_radius_km"]:
                continue
            workload = int(rng.integers(0, 4))
            if workload >= 3 and rng.random() < 0.8:
                continue
            # NOTE: pool None becomes NaN in the DataFrame — NaN-safe check.
            # Latent truth: distance-led (like M8) plus tier/history/workload
            # residuals the deterministic formula cannot see (ML headroom).
            _r = m["rating"]
            _rate = (float(_r) - 4.0) if (_r is not None and _r == _r) else -0.6
            _acc = float(m["acceptance_rate_hist"])
            latent = (m["accept_base"] - 0.30 * km + 0.8 * _rate - 0.10 * workload
                      + 0.4 * (_acc - 0.5)
                      + (0.15 if hour in (8, 9, 17, 18, 19) else 0.0))
            eligible.append((m, km, workload, latent))
        if not eligible:
            continue  # unmatched request: no candidate rows (honest waiting state)
        # Softmax over RAW latents (never pre-clipped: clipping would flatten
        # all signal into near-uniform noise). Shift for numeric stability.
        scores = np.array([e[3] for e in eligible])
        shifted = scores - scores.max()
        exp_s = np.exp(shifted)
        probs = exp_s / exp_s.sum()
        winner_idx = int(rng.choice(len(eligible), p=probs))
        order = np.argsort(-scores)
        winner_pos = int(np.where(order == winner_idx)[0][0])
        # ALL eligible candidates are recorded (dropping lower-scored losers
        # would bias every group against its winner). Rounds model rematch
        # depth: decliners ahead of the winner, winner at its position,
        # the rest superseded in the winner's round.
        for pos, idx in enumerate(order):
            m, km, workload, latent = eligible[int(idx)]
            won = int(idx) == winner_idx
            completed = won and bool(rng.random() < m["complete_prob"])
            resp = (round(float(np.clip(rng.normal(m["avg_response_min"], 1.5), 0.5, 40)), 1)
                    if won else None)
            round_no = pos if pos <= winner_pos else winner_pos
            cand_rows.append({
                "request_id": req_id, "mechanic_id": m["mechanic_id"],
                "day": day, "hour": hour, "dow": day % 7,
                "problem_category": cat, "vehicle_type": veh,
                "customer_lat": round(clat, 5), "customer_lng": round(clng, 5),
                "distance_km": round(km, 3),
                "service_match": int(bool(set(str(m["specialties"]).split("|")) & needs)),
                "within_radius": 1,
                "rating": m["rating"], "review_count": m["review_count"],
                "experience_years": m["experience_years"],
                "service_radius_km": int(m["service_radius_km"]),
                "active_jobs": workload,
                "acceptance_rate_hist": m["acceptance_rate_hist"],
                "completion_rate_hist": m["completion_rate_hist"],
                "avg_response_min_hist": m["avg_response_min"],
                "availability": 1,
                "offer_round": round_no,
                "eligible_count": len(eligible),
                "y_win": int(won), "y_completed": int(completed),
                "winner_response_min": resp,
            })
    requests = pd.DataFrame(req_rows)
    cands = pd.DataFrame(cand_rows)
    # 1% invalid-row injection to exercise cleaning (counted, reported, dropped).
    if len(cands) > 0:
        bad_idx = rng.choice(cands.index.to_numpy(), size=max(1, len(cands) // 100), replace=False)
        cands.loc[bad_idx[: len(bad_idx) // 2], "customer_lat"] = 999.0
        cands.loc[bad_idx[len(bad_idx) // 2:], "rating"] = 9.9
    return requests, cands


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-requests", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--out", type=str, default="ml/data")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    requests, cands = generate(args.n_requests, args.seed)
    requests.to_csv(out / "requests.csv", index=False)
    cands.to_csv(out / "candidates_raw.csv", index=False)
    meta = {
        "generator": GENERATOR_VERSION, "seed": args.seed, "n_requests_attempted": args.n_requests,
        "n_requests": len(requests), "n_candidate_rows": len(cands),
        "synthetic": True,
        "sha256_requests": hashlib.sha256(requests.to_csv(index=False).encode()).hexdigest(),
        "sha256_candidates": hashlib.sha256(cands.to_csv(index=False).encode()).hexdigest(),
    }
    (out / "generation_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in meta.items() if not k.startswith("sha256")}, indent=2))


if __name__ == "__main__":
    main()
