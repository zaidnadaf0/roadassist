"""M9 feature engineering — the closed inference-time set (see problem.md).

  python ml/features.py --in ml/data/candidates_clean.csv --out-dir ml/features

Outputs: feature_matrix.npz (float32, FIXED column order), feature_schema.json
(columns, scaling stats from TRAIN ONLY — computed here on the full clean set
for schema purposes and RE-FIT on train in split-aware training; M10 must
re-fit scalers on train), labels.npy, groups.npy (request_id per row).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

SCHEMA_VERSION = "m9-features-v1"

# FIXED order. Anything not listed here never reaches a model.
NUMERIC = [
    "distance_km", "service_match", "within_radius", "rating", "review_count",
    "experience_years", "service_radius_km", "active_jobs",
    "acceptance_rate_hist", "completion_rate_hist", "avg_response_min_hist",
    "availability", "hour_of_day", "day_of_week", "offer_round", "eligible_count",
]
CATEGORICAL = {"problem_category": ["battery", "engine", "flat-tyre", "other", "tow"],
               "vehicle_type": ["bike", "car", "truck", "van"]}

FORBIDDEN = {"tier", "winner_response_min", "y_completed", "mechanic_id",
             "customer_lat", "customer_lng"}

FEATURE_ORDER = (
    NUMERIC
    + [f"cat__problem_category__{c}" for c in CATEGORICAL["problem_category"]]
    + [f"cat__vehicle_type__{c}" for c in CATEGORICAL["vehicle_type"]]
)


def engineer(df: pd.DataFrame) -> tuple[np.ndarray, dict]:
    missing_forbidden = FORBIDDEN & set(df.columns)
    # Forbidden columns are dropped if present (defense in depth); their
    # absence from FEATURE_ORDER is what actually matters (asserted in tests).
    work = df.drop(columns=[c for c in FORBIDDEN if c in df.columns]).copy()

    medians = {
        "rating": float(work["rating"].median()),
        "review_count": float(work["review_count"].median()),
        "experience_years": float(work["experience_years"].median()),
        "avg_response_min_hist": float(work["avg_response_min_hist"].median()),
    }
    for col, med in medians.items():
        work[col] = pd.to_numeric(work[col], errors="coerce").fillna(med)
    work["hour_of_day"] = pd.to_numeric(work["hour"], errors="coerce").fillna(12).clip(0, 23)
    work["day_of_week"] = pd.to_numeric(work["dow"], errors="coerce").fillna(0).clip(0, 6).astype(int)
    for col in ("service_match", "within_radius", "availability", "active_jobs",
                "offer_round", "eligible_count", "distance_km", "service_radius_km",
                "acceptance_rate_hist", "completion_rate_hist"):
        work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)

    num = work[NUMERIC].to_numpy(dtype=np.float64)
    means = num.mean(axis=0)
    stds = num.std(axis=0)
    stds[stds == 0] = 1.0
    num_z = (num - means) / stds

    cats = []
    for col, vocab in CATEGORICAL.items():
        vals = work[col].where(work[col].isin(vocab), vocab[-1] if col == "problem_category" else vocab[0])
        cats.append(np.stack([(vals == v).to_numpy(dtype=np.float64) for v in vocab], axis=1))
    X = np.concatenate([num_z, *cats], axis=1).astype(np.float32)
    schema = {
        "schema": SCHEMA_VERSION, "feature_order": FEATURE_ORDER,
        "numeric": NUMERIC, "categorical": {k: list(v) for k, v in CATEGORICAL.items()},
        "scaling": {"means": means.tolist(), "stds": stds.tolist()},
        "impute_medians": medians,
        "forbidden_absent_from_order": sorted(FORBIDDEN),
    }
    return X, schema


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="ml/data/candidates_clean.csv")
    ap.add_argument("--out-dir", default="ml/features")
    args = ap.parse_args()
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(args.inp)
    X, schema = engineer(df)
    np.savez_compressed(out / "feature_matrix.npz", X=X)
    np.save(out / "labels.npy", df["y_win"].to_numpy(dtype=np.int64))
    np.save(out / "groups.npy", df["request_id"].to_numpy())
    (out / "feature_schema.json").write_text(json.dumps(schema, indent=2), encoding="utf-8")
    print(json.dumps({"rows": len(df), "n_features": X.shape[1], "positives": int(df["y_win"].sum()),
                      "schema": SCHEMA_VERSION}, indent=2))


if __name__ == "__main__":
    main()
