"""M10 model benchmarking + validation-based selection (test evaluated ONCE).

SELECTION RULE (fixed before seeing results — do not shop it afterwards):
  1. Highest VALID NDCG@3.
  2. Tie-breaks: higher valid Hit@1, then Hit@3.
  3. Latency veto: p95 per-request scoring must be < 50 ms on this machine,
     else the next-ranked model wins (documented if triggered).
  4. No test data enters selection — test runs once, after freezing.

Search spaces are small, seeds fixed (42). M8 deterministic baseline included.

  python ml/benchmark.py [--quick]
"""
from __future__ import annotations

import argparse
import json
import pickle
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier

from preprocess import Preprocessor

SEED = 42
BENCH_VERSION = "m10-bench-v1"
LATENCY_P95_MS_CAP = 50.0

CANDIDATES: dict[str, dict] = {
    "logreg": {"cls": LogisticRegression, "params": [
        {"C": 0.1, "max_iter": 2000}, {"C": 1.0, "max_iter": 2000}, {"C": 10.0, "max_iter": 2000}]},
    "random_forest": {"cls": RandomForestClassifier, "params": [
        {"n_estimators": 100, "max_depth": None, "min_samples_leaf": 1},
        {"n_estimators": 100, "max_depth": 12, "min_samples_leaf": 1},
        {"n_estimators": 200, "max_depth": 12, "min_samples_leaf": 5}]},
    "grad_boosting": {"cls": HistGradientBoostingClassifier, "params": [
        {"max_iter": 100, "learning_rate": 0.1},
        {"max_iter": 200, "learning_rate": 0.05},
        {"max_iter": 200, "learning_rate": 0.1, "max_depth": 7}]},
    "decision_tree": {"cls": DecisionTreeClassifier, "params": [
        {"max_depth": 5}, {"max_depth": 10}, {"max_depth": None}]},
    "knn": {"cls": KNeighborsClassifier, "params": [{"n_neighbors": 5}, {"n_neighbors": 15}, {"n_neighbors": 31}]},
    "naive_bayes": {"cls": GaussianNB, "params": [{}, {"var_smoothing": 1e-7}]},
    "dummy": {"cls": DummyClassifier, "params": [{"strategy": "stratified"}]},
}

QUICK_ONLY = {"logreg", "random_forest", "grad_boosting"}


def dcg(rel: np.ndarray, k: int) -> float:
    r = rel[:k]
    return float(np.sum((2 ** r - 1) / np.log2(np.arange(2, len(r) + 2))))


def rank_metrics(scores: np.ndarray, labels: np.ndarray, groups: np.ndarray, ks=(1, 3)) -> dict:
    """Per-request ranking: sort WITHIN each request group, never globally."""
    out: dict[str, float] = {}
    hits: dict[str, list[float]] = {f"Hit@{k}": [] for k in ks}
    hits["NDCG@3"] = []
    n_groups = 0
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        o = idx[np.argsort(-scores[idx], kind="stable")]
        y = labels[o].astype(int)
        ideal = np.sort(y)[::-1]
        for k in ks:
            hits[f"Hit@{k}"].append(float(y[:k].max(initial=0)))
        idcg = dcg(ideal, 3)
        hits["NDCG@3"].append(float(dcg(y, 3) / idcg) if idcg > 0 else 0.0)
        n_groups += 1
    for k, v in hits.items():
        out[k] = float(np.mean(v))
    out["groups"] = n_groups
    return out


def proba(model, X: np.ndarray) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        return np.asarray(model.predict_proba(X))[:, 1]
    s = np.asarray(model.decision_function(X), dtype=float)
    return 1.0 / (1.0 + np.exp(-s))


def latency_per_request(model, X: np.ndarray, groups: np.ndarray, repeats: int = 3) -> dict:
    uniq = np.unique(groups)
    idx = [np.where(groups == g)[0] for g in uniq]
    times: list[float] = []
    for _ in range(repeats):
        for ii in idx:
            t0 = time.perf_counter()
            proba(model, X[ii])
            times.append((time.perf_counter() - t0) * 1000.0)
    arr = np.array(times)
    return {"mean_ms": float(arr.mean()), "median_ms": float(np.median(arr)),
            "p95_ms": float(np.percentile(arr, 95)), "n_sets": len(uniq)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="logreg/RF/HGB only")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent
    df = pd.read_csv(root / "data" / "candidates_clean.csv")
    splits = pd.read_csv(root / "data" / "splits.csv")
    df = df.merge(splits, on="request_id", how="inner")
    train = df[df["split"] == "train"].reset_index(drop=True)
    valid = df[df["split"] == "valid"].reset_index(drop=True)
    test = df[df["split"] == "test"].reset_index(drop=True)

    prep = Preprocessor().fit(train)
    Xtr, ytr = prep.transform(train), train["y_win"].to_numpy()
    Xva, yva = prep.transform(valid), valid["y_win"].to_numpy()
    gva = valid["request_id"].to_numpy()
    # TEST FEATURES ARE BUILT BUT ITS LABELS ARE NOT TOUCHED until final eval.
    Xte, gte = prep.transform(test), test["request_id"].to_numpy()

    names = [n for n in CANDIDATES if (not args.quick or n in QUICK_ONLY)]
    valid_rows: list[dict] = []
    fitted: dict[str, tuple] = {}
    for name in names:
        spec = CANDIDATES[name]
        best, best_cfg, best_ndcg = None, None, -1.0
        for p in spec["params"]:
            t0 = time.perf_counter()
            model = spec["cls"](**p) if name != "dummy" else spec["cls"](**p, random_state=SEED)
            if name in ("random_forest", "grad_boosting", "decision_tree", "logreg"):
                try:
                    model.set_params(random_state=SEED)
                except Exception:
                    pass
            model.fit(Xtr, ytr)
            train_s = time.perf_counter() - t0
            m = rank_metrics(proba(model, Xva), yva, gva)
            if m["NDCG@3"] > best_ndcg:
                best, best_cfg, best_ndcg, best_train_s, best_m = model, p, m["NDCG@3"], train_s, m
        lat = latency_per_request(best, Xva, gva)
        size = len(pickle.dumps(best))
        valid_rows.append({"model": name, "config": best_cfg, "train_s": round(best_train_s, 2),
                           **{k: round(v, 4) for k, v in best_m.items() if k != "groups"},
                           "groups": best_m["groups"], "latency_ms": {k: round(v, 3) for k, v in lat.items()},
                           "model_bytes": size})
        fitted[name] = (best, best_cfg)

    # ---- SELECTION (validation only) ----
    ranked = sorted(valid_rows, key=lambda r: (r["NDCG@3"], r["Hit@1"], r["Hit@3"]), reverse=True)
    winner = next((r for r in ranked if r["latency_ms"]["p95_ms"] < LATENCY_P95_MS_CAP), ranked[0])
    vetoed = [r["model"] for r in ranked if r["latency_ms"]["p95_ms"] >= LATENCY_P95_MS_CAP]

    # ---- FINAL TEST (once, frozen) ----
    wmodel, wcfg = fitted[winner["model"]]
    yte = test["y_win"].to_numpy()
    test_scores = proba(wmodel, Xte)
    test_m = rank_metrics(test_scores, yte, gte)
    test_m["ROC_AUC"] = float(roc_auc_score(yte, test_scores))
    test_lat = latency_per_request(wmodel, Xte, gte)

    out = root / "benchmarks"
    out.mkdir(exist_ok=True)
    (out / "validation_results.json").write_text(json.dumps(
        {"version": BENCH_VERSION, "seed": SEED, "selection_rule": "max valid NDCG@3, tie Hit@1 then Hit@3, p95<50ms veto",
         "latency_vetoed": vetoed, "rows": ranked}, indent=2), encoding="utf-8")
    (out / "test_results.json").write_text(json.dumps(
        {"version": BENCH_VERSION, "winner": winner["model"], "config": wcfg,
         "metrics": {k: round(v, 4) if isinstance(v, float) else v for k, v in test_m.items()},
         "latency_ms": {k: round(v, 3) for k, v in test_lat.items()},
         "model_bytes": winner["model_bytes"],
         "preprocessing": prep.stats()}, indent=2), encoding="utf-8")

    # Comparison table (validation) for the report. M8 row comes from the
    # frozen M9 baseline_metrics.json VALID split (formula untouched).
    m9b = json.loads((root / "reports" / "baseline_metrics.json").read_text(encoding="utf-8"))["splits"]["valid"]
    lines = ["| Model | Hit@1 | Hit@3 | NDCG@3 | ROC-AUC* | Train s | p95 ms | Bytes |",
             "|---|---|---|---|---|---|---|---|",
             f"| m8_baseline | {m9b['Hit@1']:.4f} | {m9b['Hit@3']:.4f} | {m9b['NDCG@3']:.4f} | {m9b.get('ROC_AUC', float('nan')):.4f} "
             f"| — | — | 0 |"]
    for r in ranked:
        lines.append(f"| {r['model']} | {r['Hit@1']:.4f} | {r['Hit@3']:.4f} | {r['NDCG@3']:.4f} | — "
                     f"| {r['train_s']} | {r['latency_ms']['p95_ms']} | {r['model_bytes']} |")
    (out / "comparison.md").write_text(
        "# M10 Validation Comparison (test-blind selection)\n\n" + "\n".join(lines)
        + f"\n\nWinner: **{winner['model']}** {json.dumps(wcfg)}"
        + "\n\n*ROC-AUC is pair-level context only; selection used NDCG@3 then Hit@1 then Hit@3.\n"
        + "*M8 row: frozen M9 baseline, validation split, formula untouched.*\n",
        encoding="utf-8")

    print(json.dumps({"winner": winner["model"], "config": wcfg,
                      "valid_NDCG@3": winner["NDCG@3"], "vetoed": vetoed,
                      "test": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in test_m.items()}},
                     indent=2))


if __name__ == "__main__":
    main()
