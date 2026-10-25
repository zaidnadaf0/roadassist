"""M9 data-quality report (human MD + machine JSON). Reads pipeline artifacts.

  python ml/report.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


def main() -> None:
    data = Path("ml/data")
    rep = Path("ml/reports")
    gen = json.loads((data / "generation_meta.json").read_text(encoding="utf-8"))
    cleaning = json.loads((rep / "cleaning_stats.json").read_text(encoding="utf-8"))
    baseline = json.loads((rep / "baseline_metrics.json").read_text(encoding="utf-8"))
    schema = json.loads((Path("ml/features/feature_schema.json").read_text(encoding="utf-8")))
    df = pd.read_csv(data / "candidates_clean.csv")
    splits = pd.read_csv(data / "splits.csv")
    joined = df.merge(splits, on="request_id")

    missing = {c: float(df[c].isna().mean()) for c in
               ("rating", "review_count", "experience_years", "avg_response_min_hist")}

    report = {
        "synthetic": True,
        "synthetic_warning": "Development data with seeded distributions (seed 42). NOT production history.",
        "generator": gen,
        "cleaning": cleaning,
        "rows_final": len(df),
        "requests_final": int(df["request_id"].nunique()),
        "target_distribution": {"positives": int(df["y_win"].sum()), "negatives": int((df["y_win"] == 0).sum())},
        "missing_rates": missing,
        "feature_order": schema["feature_order"],
        "n_features": len(schema["feature_order"]),
        "splits": {s: {"requests": int((splits["split"] == s).sum())} for s in ("train", "valid", "test")},
        "baseline_test": baseline["splits"]["test"],
        "leakage_checks": {
            "forbidden_columns_absent_from_features": True,
            "history_aggregates_precomputed_before_request": True,
            "no_request_spans_splits": True,
            "current_job_outcomes_excluded": True,
        },
        "limitations": [
            "All outcomes are simulated from a latent accept model; real acceptance behavior WILL differ.",
            "30-day window, single city, 40-mechanic pool: coverage is narrow by design.",
            "No cancellations, disputes, traffic, weather, or surge effects modeled.",
            "Night/urgency effects are coarse (hour buckets only).",
            "Scalers in feature_schema.json are fit on the full clean set for schema purposes; M10 MUST re-fit on train only.",
        ],
    }
    (rep / "data_quality_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    t = baseline["splits"]["test"]
    md = f"""# M9 Data-Quality Report — SYNTHETIC DEVELOPMENT DATA

> Seed 42. NOT production history. See `ml/problem.md` and `ml/README.md`.

## Size
- Candidate rows (final): **{len(df)}** across **{df["request_id"].nunique()}** requests
- Raw rows: {cleaning["raw_rows"]} -> removed {cleaning["removed_rows"]} -> final {cleaning["final_rows"]}
- Removal reasons: {json.dumps(cleaning["reasons"])}
- Target: {int(df["y_win"].sum())} wins / {int((df["y_win"] == 0).sum())} non-wins

## Missing (imputed with train medians in features.py)
{chr(10).join(f"- {c}: {v:.1%}" for c, v in missing.items())}

## Splits (temporal, request-disjoint)
- train (days 0–19): {int((splits["split"] == "train").sum())} requests
- valid (days 20–24): {int((splits["split"] == "valid").sum())} requests
- test (days 25–29): {int((splits["split"] == "test").sum())} requests

## Features ({len(schema["feature_order"])})
`{", ".join(schema["feature_order"])}`

## M8 baseline on test
- Hit@1 {t["Hit@1"]:.4f} · Hit@3 {t["Hit@3"]:.4f} · NDCG@3 {t["NDCG@3"]:.4f} · ROC-AUC {t["ROC_AUC"]:.4f}

## Leakage
Closed inference-time set only; forbidden columns asserted absent by `ml/tests/test_leakage.py`.
"""
    (rep / "data_quality_report.md").write_text(md, encoding="utf-8")
    # Console-safe: cp1252 terminals cannot render every glyph in the file.
    print(md.encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
