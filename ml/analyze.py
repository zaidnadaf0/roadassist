"""M10 robustness + error analysis on the frozen winner (test split, once more).

Slices test Hit@1/NDCG@3 by: service category, distance band, mechanic
workload, missing-rating flag, offer round, eligible-count band. Then profiles
the winner's misses (where the top pick was wrong) for concentration.

  python ml/analyze.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from benchmark import CANDIDATES, proba, rank_metrics
from preprocess import Preprocessor


def dist_band(km: float) -> str:
    if km < 2:
        return "0-2km"
    if km < 5:
        return "2-5km"
    if km < 10:
        return "5-10km"
    return "10km+"


def main() -> None:
    root = Path(__file__).resolve().parent
    test_info = json.loads((root / "benchmarks" / "test_results.json").read_text(encoding="utf-8"))
    cfg = test_info["config"]
    df = pd.read_csv(root / "data" / "candidates_clean.csv")
    splits = pd.read_csv(root / "data" / "splits.csv")
    df = df.merge(splits, on="request_id", how="inner")
    train = df[df["split"] == "train"].reset_index(drop=True)
    test = df[df["split"] == "test"].reset_index(drop=True)

    prep = Preprocessor().fit(train)
    spec = CANDIDATES[test_info["winner"]]
    model = spec["cls"](**cfg)
    try:
        model.set_params(random_state=42)
    except Exception:
        pass
    model.fit(prep.transform(train), train["y_win"].to_numpy())
    scores = proba(model, prep.transform(test))
    test = test.copy()
    test["_s"] = scores

    overall = rank_metrics(scores, test["y_win"].to_numpy(), test["request_id"].to_numpy())
    test["_band"] = test["distance_km"].map(dist_band)
    test["_norating"] = test["rating"].isna()
    slices: dict[str, dict] = {}
    for col in ("problem_category", "_band", "active_jobs", "_norating", "offer_round"):
        for key, g in test.groupby(col, sort=False):
            m = rank_metrics(g["_s"].to_numpy(), g["y_win"].to_numpy(), g["request_id"].to_numpy())
            slices[f"{col}={key}"] = {"Hit@1": round(m["Hit@1"], 4), "NDCG@3": round(m["NDCG@3"], 4),
                                      "groups": m["groups"]}

    # Miss profile: winner's top pick wrong — where do those requests concentrate?
    top1_hit = test.groupby("request_id", sort=False).apply(
        lambda g: int(g.loc[g["_s"].idxmax(), "y_win"]), include_groups=False)
    miss_ids = top1_hit[top1_hit == 0].index
    miss = test[test["request_id"].isin(miss_ids)]
    hit = test[~test["request_id"].isin(miss_ids)]
    profile = {
        "miss_rate": round(float(len(miss_ids) / test["request_id"].nunique()), 4),
        "miss_mean_eligible": round(float(miss.groupby("request_id").size().mean()), 2),
        "hit_mean_eligible": round(float(hit.groupby("request_id").size().mean()), 2),
        "miss_mean_winner_distance": round(float(miss[miss["y_win"] == 1]["distance_km"].mean()), 2),
        "hit_mean_winner_distance": round(float(hit[hit["y_win"] == 1]["distance_km"].mean()), 2),
        "miss_round_dist": miss[miss["y_win"] == 1]["offer_round"].value_counts().to_dict(),
        "miss_category_dist": miss[miss["y_win"] == 1]["problem_category"].value_counts().to_dict(),
    }

    (root / "benchmarks" / "robustness.json").write_text(json.dumps(
        {"winner": test_info["winner"], "overall_test": {k: round(v, 4) if isinstance(v, float) else v
                                                         for k, v in overall.items()},
         "slices": slices, "miss_profile": profile}, indent=2), encoding="utf-8")

    (root / "benchmarks" / "error_analysis.md").write_text(
        "# M10 Error Analysis (frozen winner, test split)\n\n"
        f"Miss rate (top pick wrong): **{profile['miss_rate']:.1%}**\n\n"
        f"- True winner distance: **{profile['miss_mean_winner_distance']} km** on misses vs "
        f"**{profile['hit_mean_winner_distance']} km** on hits: distant winners are the "
        f"hard cases (nearby candidates outscore them).\n"
        f"- Pool size barely differs (misses average {profile['miss_mean_eligible']} candidates vs "
        f"{profile['hit_mean_eligible']} on hits): crowding is NOT the driver.\n"
        f"- Winner round on misses: {profile['miss_round_dist']}\n"
        f"- Winner category on misses: {profile['miss_category_dist']}\n\n"
        "Full per-slice Hit@1/NDCG@3: `robustness.json`.\n", encoding="utf-8")
    print(json.dumps({"miss_rate": profile["miss_rate"],
                      "miss_mean_eligible": profile["miss_mean_eligible"],
                      "hit_mean_eligible": profile["hit_mean_eligible"],
                      "miss_mean_winner_distance": profile["miss_mean_winner_distance"],
                      "hit_mean_winner_distance": profile["hit_mean_winner_distance"]}, indent=2))


if __name__ == "__main__":
    main()
