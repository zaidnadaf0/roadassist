"""M10 train-fit preprocessing — scalers/imputation fit on TRAIN ONLY.

Reuses M9 feature DEFINITIONS (features.py: NUMERIC, CATEGORICAL,
FEATURE_ORDER) but never its full-set-fitted stats. M10 fits here on the
train split and applies frozen stats to valid/test.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from features import CATEGORICAL, FEATURE_ORDER, NUMERIC


class Preprocessor:
    """Median-impute + standardize numerics, one-hot categoricals (fixed order)."""

    def __init__(self) -> None:
        self.medians_: dict[str, float] = {}
        self.means_: np.ndarray | None = None
        self.stds_: np.ndarray | None = None

    def fit(self, df: pd.DataFrame) -> "Preprocessor":
        work = df.copy()
        for col in ("rating", "review_count", "experience_years", "avg_response_min_hist"):
            self.medians_[col] = float(pd.to_numeric(work[col], errors="coerce").median())
        work["hour_of_day"] = pd.to_numeric(work["hour"], errors="coerce").fillna(12).clip(0, 23)
        work["day_of_week"] = pd.to_numeric(work["dow"], errors="coerce").fillna(0).clip(0, 6)
        for col in ("service_match", "within_radius", "availability", "active_jobs",
                    "offer_round", "eligible_count", "distance_km", "service_radius_km",
                    "acceptance_rate_hist", "completion_rate_hist"):
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)
        for col, med in self.medians_.items():
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(med)
        num = work[NUMERIC].to_numpy(dtype=np.float64)
        self.means_ = num.mean(axis=0)
        stds = num.std(axis=0)
        stds[stds == 0] = 1.0
        self.stds_ = stds
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        assert self.means_ is not None and self.stds_ is not None, "fit first"
        work = df.copy()
        work["hour_of_day"] = pd.to_numeric(work["hour"], errors="coerce").fillna(12).clip(0, 23)
        work["day_of_week"] = pd.to_numeric(work["dow"], errors="coerce").fillna(0).clip(0, 6)
        for col in ("service_match", "within_radius", "availability", "active_jobs",
                    "offer_round", "eligible_count", "distance_km", "service_radius_km",
                    "acceptance_rate_hist", "completion_rate_hist"):
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(0)
        for col, med in self.medians_.items():
            work[col] = pd.to_numeric(work[col], errors="coerce").fillna(med)
        num = work[NUMERIC].to_numpy(dtype=np.float64)
        num_z = (num - self.means_) / self.stds_
        cats = []
        for col, vocab in CATEGORICAL.items():
            vals = work[col].where(work[col].isin(vocab), vocab[-1] if col == "problem_category" else vocab[0])
            cats.append(np.stack([(vals == v).to_numpy(dtype=np.float64) for v in vocab], axis=1))
        X = np.concatenate([num_z, *cats], axis=1).astype(np.float32)
        assert X.shape[1] == len(FEATURE_ORDER)
        return X

    def stats(self) -> dict:
        return {"medians": self.medians_,
                "means": list(self.means_) if self.means_ is not None else [],
                "stds": list(self.stds_) if self.stds_ is not None else [],
                "feature_order": FEATURE_ORDER}
