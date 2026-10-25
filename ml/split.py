"""M9 temporal splits by request day (no request spans splits, time-ordered).

  Days 0–19 → train (67%), 20–24 → validation (17%), 25–29 → test (17%).
  Writes ml/data/splits.csv (request_id, split) + prints sizes.

  python ml/split.py --in ml/data/candidates_clean.csv --out ml/data/splits.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

SPLIT_VERSION = "m9-split-v1"


def assign(day: int) -> str:
    if day <= 19:
        return "train"
    if day <= 24:
        return "valid"
    return "test"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="ml/data/candidates_clean.csv")
    ap.add_argument("--out", default="ml/data/splits.csv")
    args = ap.parse_args()
    df = pd.read_csv(args.inp, usecols=["request_id", "day", "y_win"])
    by_req = df.groupby("request_id").agg(day=("day", "first"), positives=("y_win", "sum"),
                                           rows=("y_win", "size")).reset_index()
    by_req["split"] = by_req["day"].map(assign)
    # Guard: one request, one day (generator invariant) — assert, don't assume.
    assert (df.groupby("request_id")["day"].nunique() == 1).all(), "request spans days"
    summary = {
        "version": SPLIT_VERSION,
        "splits": {
            s: {"requests": int((by_req["split"] == s).sum()),
                "rows": int(df[df["request_id"].isin(by_req.loc[by_req["split"] == s, "request_id"])].shape[0]),
                "positives": int(by_req.loc[by_req["split"] == s, "positives"].sum())}
            for s in ("train", "valid", "test")
        },
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    by_req[["request_id", "split"]].to_csv(args.out, index=False)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
