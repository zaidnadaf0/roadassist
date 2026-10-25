"""M10 benchmark tests — isolation, determinism, ranking math, artifacts."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from benchmark import rank_metrics  # noqa: E402
from preprocess import Preprocessor  # noqa: E402

BENCH = ROOT / "benchmarks"


def load_split():
    df = pd.read_csv(ROOT / "data" / "candidates_clean.csv")
    splits = pd.read_csv(ROOT / "data" / "splits.csv")
    df = df.merge(splits, on="request_id", how="inner")
    return (df[df["split"] == "train"].reset_index(drop=True),
            df[df["split"] == "valid"].reset_index(drop=True),
            df[df["split"] == "test"].reset_index(drop=True))


def test_preprocessing_fit_only_on_train():
    train, valid, _ = load_split()
    prep = Preprocessor().fit(train)
    # Stats equal the train frame's own statistics (computed independently).
    work = train.copy()
    assert prep.medians_["rating"] == pytest.approx(float(pd.to_numeric(work["rating"], errors="coerce").median()))
    Xva = prep.transform(valid)
    assert Xva.shape[1] == len(prep.stats()["feature_order"])
    assert not np.isnan(Xva).any()
    # Perturbing VALID must not move the frozen stats (no leakage path).
    before = dict(prep.medians_)
    prep.transform(valid.assign(rating=np.nan))
    assert prep.medians_ == before


def test_rank_metrics_hand_computed():
    # Two requests: perfect order vs inverted order.
    # Group a perfectly ordered; group b perfectly inverted.
    scores = np.array([0.9, 0.1, 0.8, 0.2])
    labels = np.array([1, 0, 0, 1])
    groups = np.array(["a", "a", "b", "b"])
    m = rank_metrics(scores, labels, groups)
    assert m["Hit@1"] == 0.5
    assert m["Hit@3"] == 1.0
    assert m["groups"] == 2
    assert 0.0 <= m["NDCG@3"] <= 1.0


def test_deterministic_predictions():
    train, valid, _ = load_split()
    prep = Preprocessor().fit(train)
    Xtr, Xva = prep.transform(train), prep.transform(valid)
    ytr = train["y_win"].to_numpy()
    a = LogisticRegression(C=1.0, max_iter=2000, random_state=42).fit(Xtr, ytr).predict_proba(Xva)[:, 1]
    b = LogisticRegression(C=1.0, max_iter=2000, random_state=42).fit(Xtr, ytr).predict_proba(Xva)[:, 1]
    np.testing.assert_array_equal(a, b)


def test_selection_used_validation_only():
    v = json.loads((BENCH / "validation_results.json").read_text())
    # No test-split metrics may inform selection: the file must not contain
    # per-split test numbers (the words "test_results"/"final test" stay out).
    blob = json.dumps(v).lower()
    assert "test_results" not in blob and "final test" not in blob
    t = json.loads((BENCH / "test_results.json").read_text())
    # Winner satisfies the documented rule: max valid NDCG@3 (then Hit@1,
    # Hit@3), subject to the p95 latency veto.
    ordered = sorted(v["rows"], key=lambda r: (r["NDCG@3"], r["Hit@1"], r["Hit@3"]), reverse=True)
    allowed = [r["model"] for r in ordered if r["latency_ms"]["p95_ms"] < 50.0] or [ordered[0]["model"]]
    assert t["winner"] == allowed[0]
    assert t["winner"] == v["rows"][0]["model"] or t["winner"] in allowed


def test_artifacts_complete_and_consistent():
    for f in ("validation_results.json", "test_results.json", "comparison.md",
              "robustness.json", "error_analysis.md"):
        assert (BENCH / f).exists(), f"missing {f}"
    v = json.loads((BENCH / "validation_results.json").read_text())
    assert len(v["rows"]) >= 7  # 6 families + dummy, M8 row in comparison.md
    comp = (BENCH / "comparison.md").read_text()
    assert "m8_baseline" in comp and v["rows"][0]["model"] in comp
    t = json.loads((BENCH / "test_results.json").read_text())
    assert t["metrics"]["groups"] > 20
    r = json.loads((BENCH / "robustness.json").read_text())
    assert "slices" in r and "miss_profile" in r
