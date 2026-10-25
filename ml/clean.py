"""M9 deterministic cleaning. Every rule is explicit; drops are counted by reason.

  python ml/clean.py --in ml/data/candidates_raw.csv --out ml/data/candidates_clean.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

CATEGORIES = {"flat-tyre", "battery", "engine", "tow", "other"}
VEHICLES = {"car", "bike", "van", "truck"}
CLEANER_VERSION = "m9-clean-v1"


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    stats: dict[str, int] = {"raw_rows": len(df)}
    reasons: dict[str, int] = {}
    out = df.copy()

    def drop(mask, reason: str) -> None:
        nonlocal out
        n = int(mask.sum())
        if n:
            reasons[reason] = reasons.get(reason, 0) + n
            out = out[~mask].copy()

    # 1. Finite coordinates in range (request + mechanic base implied by distance).
    for col, lo, hi in (("customer_lat", -90, 90), ("customer_lng", -180, 180), ("distance_km", 0, 500)):
        bad = ~pd.to_numeric(out[col], errors="coerce").between(lo, hi)
        drop(bad.fillna(True), f"invalid_{col}")
    out["customer_lat"] = pd.to_numeric(out["customer_lat"])
    out["customer_lng"] = pd.to_numeric(out["customer_lng"])
    out["distance_km"] = pd.to_numeric(out["distance_km"])

    # 2. Rating 1–5 or null (never clipped silently: out-of-range = drop).
    rating_num = pd.to_numeric(out["rating"], errors="coerce")
    drop((~rating_num.isna()) & ((rating_num < 1) | (rating_num > 5)), "rating_out_of_range")

    # 3. review_count: non-negative ints or null.
    rc = pd.to_numeric(out["review_count"], errors="coerce")
    drop((~rc.isna()) & (rc < 0), "review_count_negative")

    # 4. Categorical normalization (unknown → 'other' for category only;
    #    vehicle outside vocab → drop, it indicates schema drift).
    out["problem_category"] = out["problem_category"].where(out["problem_category"].isin(CATEGORIES), "other")
    drop(~out["vehicle_type"].isin(VEHICLES), "vehicle_type_unknown")

    # 5. y_win must be 0/1.
    drop(~pd.to_numeric(out["y_win"], errors="coerce").isin([0, 1]), "label_invalid")

    # 6. Exact duplicates on (request_id, mechanic_id).
    dup = out.duplicated(subset=["request_id", "mechanic_id"], keep="first")
    drop(dup, "duplicate_pair")

    # 7. Requests left with zero candidates are removed (nothing to rank).
    counts = out.groupby("request_id").size()
    empty_reqs = counts[counts == 0].index
    drop(out["request_id"].isin(empty_reqs), "request_without_candidates")

    stats["reasons"] = reasons
    stats["removed_rows"] = sum(reasons.values())
    stats["final_rows"] = len(out)
    stats["final_requests"] = int(out["request_id"].nunique())
    return out.reset_index(drop=True), stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="ml/data/candidates_raw.csv")
    ap.add_argument("--out", default="ml/data/candidates_clean.csv")
    ap.add_argument("--stats", default="ml/reports/cleaning_stats.json")
    args = ap.parse_args()
    df = pd.read_csv(args.inp)
    out, stats = clean(df)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.stats).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False)
    stats["cleaner"] = CLEANER_VERSION
    Path(args.stats).write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
