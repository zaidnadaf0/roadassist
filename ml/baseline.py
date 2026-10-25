"""M9 ranking metrics (per-request groups) + M8 deterministic baseline.

Metrics: Hit@k, NDCG@k (binary relevance), ROC-AUC + accuracy (pair level,
reported for context only — ranking metrics decide). Baseline ports the M8
server formula: score = 1000 - 10*km + specialty + rating + reviews + live.

  python ml/baseline.py --clean ml/data/candidates_clean.csv --splits ml/data/splits.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

BASELINE_VERSION = "m9-baseline-v1"


def dcg(relevances: np.ndarray, k: int) -> float:
    rel = relevances[:k]
    return float(np.sum((2 ** rel - 1) / np.log2(np.arange(2, len(rel) + 2))))


def group_metrics(scores: np.ndarray, labels: np.ndarray, ks=(1, 3, 5)) -> dict:
    order = np.argsort(-scores, kind="stable")
    ranked = labels[order]
    out: dict[str, float] = {}
    ideal = np.sort(labels)[::-1]
    for k in ks:
        out[f"Hit@{k}"] = float(ranked[:k].max(initial=0))
        idcg = dcg(ideal, k)
        out[f"NDCG@{k}"] = float(dcg(ranked, k) / idcg) if idcg > 0 else 0.0
    return out


def evaluate(df: pd.DataFrame, score_col: str) -> dict:
    hits: list[dict] = []
    all_scores, all_labels = [], []
    for _, g in df.groupby("request_id", sort=False):
        s = g[score_col].to_numpy(dtype=float)
        y = g["y_win"].to_numpy(dtype=int)
        hits.append(group_metrics(s, y))
        all_scores.append(s)
        all_labels.append(y)
    agg = {k: float(np.mean([h[k] for h in hits])) for k in hits[0]}
    agg["groups"] = len(hits)
    agg["pairs"] = int(sum(len(h) for h in [g for _, g in df.groupby("request_id", sort=False)]))
    s_all = np.concatenate(all_scores)
    y_all = np.concatenate(all_labels).astype(int)
    agg["ROC_AUC"] = float(roc_auc_score(y_all, s_all)) if len(np.unique(y_all)) == 2 else float("nan")
    agg["accuracy"] = float(((s_all > np.median(s_all)).astype(int) == y_all).mean())
    return agg


def m8_score(df: pd.DataFrame) -> pd.Series:
    rating = df["rating"].fillna(0).to_numpy(dtype=float)
    reviews = df["review_count"].fillna(0).to_numpy(dtype=float)
    match = df["service_match"].to_numpy(dtype=float)
    km = df["distance_km"].to_numpy(dtype=float)
    return pd.Series(1000 - 10 * km + 200 * match + 20 * rating + 2 * np.minimum(reviews, 50))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", default="ml/data/candidates_clean.csv")
    ap.add_argument("--splits", default="ml/data/splits.csv")
    ap.add_argument("--out", default="ml/reports/baseline_metrics.json")
    args = ap.parse_args()
    df = pd.read_csv(args.clean)
    splits = pd.read_csv(args.splits)
    df = df.merge(splits, on="request_id", how="inner")
    df["_m8"] = m8_score(df)
    report = {"baseline": BASELINE_VERSION,
              "splits": {s: evaluate(df[df["split"] == s], "_m8") for s in ("train", "valid", "test")}}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"test": report["splits"]["test"]}, indent=2))


if __name__ == "__main__":
    main()
