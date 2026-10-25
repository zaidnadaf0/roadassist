"""M9 pipeline tests — schema, determinism, cleaning, leakage, splits, baseline."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FEAT = ROOT / "features"
REP = ROOT / "reports"


def run_gen(seed: int, n: int, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([sys.executable, str(ROOT / "generate.py"), "--n-requests", str(n),
                        "--seed", str(seed), "--out", str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return out


def test_generation_is_deterministic(tmp_path):
    a = run_gen(42, 200, tmp_path / "a")
    b = run_gen(42, 200, tmp_path / "b")
    for f in ("requests.csv", "candidates_raw.csv"):
        ha = hashlib.sha256((a / f).read_bytes()).hexdigest()
        hb = hashlib.sha256((b / f).read_bytes()).hexdigest()
        assert ha == hb
    c = run_gen(43, 200, tmp_path / "c")
    assert (c / "candidates_raw.csv").read_bytes() != (a / "candidates_raw.csv").read_bytes()


def test_raw_schema_and_labels():
    df = pd.read_csv(DATA / "candidates_raw.csv")
    required = {"request_id", "mechanic_id", "day", "hour", "dow", "problem_category",
                "vehicle_type", "distance_km", "service_match", "rating", "y_win"}
    assert required <= set(df.columns)
    assert set(df["y_win"].unique()) <= {0, 1}
    assert (df.groupby("request_id")["y_win"].sum() <= 1).all(), "at most one winner per request"


def test_cleaning_reported_and_bounded():
    stats = json.loads((REP / "cleaning_stats.json").read_text())
    assert stats["raw_rows"] > stats["final_rows"] > 0
    removed_frac = stats["removed_rows"] / stats["raw_rows"]
    assert removed_frac < 0.15, f"cleaning dropped {removed_frac:.1%} — investigate, don't silently purge"
    assert sum(stats["reasons"].values()) == stats["removed_rows"]


def test_clean_values_valid():
    df = pd.read_csv(DATA / "candidates_clean.csv")
    assert df["customer_lat"].between(-90, 90).all()
    assert df["customer_lng"].between(-180, 180).all()
    assert ((df["rating"].isna()) | df["rating"].between(1, 5)).all()
    assert not df.duplicated(subset=["request_id", "mechanic_id"]).any()


def test_leakage_forbidden_absent():
    from pathlib import Path as P
    import sys
    sys.path.insert(0, str(ROOT))
    from features import FEATURE_ORDER, FORBIDDEN
    assert not (FORBIDDEN & set(FEATURE_ORDER))
    for f in ("tier", "winner_response_min", "y_completed", "mechanic_id"):
        assert f not in FEATURE_ORDER
    X = np.load(FEAT / "feature_matrix.npz")["X"]
    assert X.shape[1] == len(FEATURE_ORDER)
    assert not np.isnan(X).any(), "no NaNs may reach the matrix"


def test_splits_temporal_and_disjoint():
    splits = pd.read_csv(DATA / "splits.csv")
    df = pd.read_csv(DATA / "candidates_clean.csv", usecols=["request_id", "day"])
    joined = df.merge(splits, on="request_id")
    assert joined["split"].isin(["train", "valid", "test"]).all()
    assert joined.groupby("request_id")["split"].nunique().max() == 1
    assert joined[joined.split == "train"]["day"].max() <= 19
    assert joined[joined.split == "valid"]["day"].min() >= 20
    assert joined[joined.split == "test"]["day"].min() >= 25


def test_feature_order_stable_and_labeled():
    schema = json.loads((FEAT / "feature_schema.json").read_text())
    assert schema["feature_order"][0] == "distance_km"
    assert schema["schema"].startswith("m9-features-")
    labels = np.load(FEAT / "labels.npy")
    groups = np.load(FEAT / "groups.npy", allow_pickle=True)  # request_id strings
    assert len(labels) == len(groups)
    assert set(np.unique(labels)) <= {0, 1}


def test_baseline_reproducible_and_sane():
    m = json.loads((REP / "baseline_metrics.json").read_text())
    t = m["splits"]["test"]
    assert 0.0 <= t["Hit@1"] <= 1.0 and 0.0 <= t["NDCG@3"] <= 1.0
    assert t["Hit@1"] <= t["Hit@3"], "Hit@k must be non-decreasing"
    assert t["groups"] > 20, "test split too small to trust"
