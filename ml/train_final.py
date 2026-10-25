"""M11 final training — frozen M10 winner (LogisticRegression C=10, max_iter=2000).

Trains on the TRAIN split only (parity with the M10 evaluation pipeline),
preprocessing fit on train. Artifacts versioned under ml/model/.

  python ml/train_final.py
"""
from __future__ import annotations

import datetime
import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from preprocess import Preprocessor  # noqa: E402

MODEL_VERSION = "roadassist-logreg-v1"
MODEL_NAME = "roadassist-logreg"
CONFIG = {"C": 10.0, "max_iter": 2000, "random_state": 42, "solver": "lbfgs"}
SEED = 42


def main() -> None:
    df = pd.read_csv(ROOT / "data" / "candidates_clean.csv")
    splits = pd.read_csv(ROOT / "data" / "splits.csv")
    df = df.merge(splits, on="request_id", how="inner")
    train = df[df["split"] == "train"].reset_index(drop=True)

    prep = Preprocessor().fit(train)
    Xtr = prep.transform(train)
    ytr = train["y_win"].to_numpy()
    model = LogisticRegression(**CONFIG)
    model.fit(Xtr, ytr)

    dataset_hash = hashlib.sha256(pd.read_csv(ROOT / "data" / "candidates_clean.csv").to_csv(index=False).encode()).hexdigest()
    out = ROOT / "model"
    out.mkdir(exist_ok=True)
    joblib.dump(model, out / "model.joblib")
    joblib.dump(prep, out / "preprocessor.joblib")
    meta = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "model_type": "LogisticRegression",
        "config": CONFIG,
        "seed": SEED,
        "sklearn_version": sklearn.__version__,
        "trained_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dataset": "SYNTHETIC development data (seed 42) — MUST revalidate/retrain on real history",
        "dataset_hash_sha256": dataset_hash,
        "feature_order": prep.stats()["feature_order"],
        "feature_schema_version": "m9-features-v1",
        "preprocessing": "median-impute + standardize (fit on train), one-hot fixed vocabs",
        "n_train_rows": len(train),
        "positive_rate_train": round(float(ytr.mean()), 5),
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps({"model_version": MODEL_VERSION, "train_rows": len(train),
                      "coef_norm": round(float(np.linalg.norm(model.coef_)), 4)}, indent=2))


if __name__ == "__main__":
    main()
