# M9 — ML Dataset + Feature Engineering (SYNTHETIC DEVELOPMENT DATA)

No production history exists yet, so this pipeline generates a **seeded,
clearly-labeled synthetic development dataset** from the real M8 schema and
dispatch workflow. Nothing here represents real RoadAssist performance, and
nothing in M9 touches dispatch authority, ranking, or the app.

## Pipeline (run in order)

```bash
pip install -r ml/requirements.txt
python ml/generate.py --n-requests 3000 --seed 42 --out ml/data
python ml/clean.py
python ml/features.py
python ml/split.py
python ml/baseline.py
python ml/report.py
pytest ml/tests -q
```

## What each step does

| Step | Script | Output |
|---|---|---|
| Generate | `generate.py` | `ml/data/requests.csv`, `candidates_raw.csv`, `generation_meta.json` (hashes) |
| Clean | `clean.py` | `ml/data/candidates_clean.csv`, `ml/reports/cleaning_stats.json` |
| Features | `features.py` | `ml/features/feature_matrix.npz`, `labels.npy`, `groups.npy`, `feature_schema.json` |
| Split | `split.py` | `ml/data/splits.csv` (temporal, request-disjoint) |
| Baseline | `baseline.py` | `ml/reports/baseline_metrics.json` (M8 formula) |
| Report | `report.py` | `ml/reports/data_quality_report.{json,md}` |

## M11 — production service (roadassist-logreg-v1, SYNTHETIC-trained)

> The model was trained and evaluated on synthetic development data and MUST
> be revalidated/retrained against real historical RoadAssist data when
> sufficient production history becomes available.

- Final training: `python ml/train_final.py` → `ml/model/{model.joblib,
  preprocessor.joblib, metadata.json}` (logreg C=10, train split only for
  M10 parity; 906-byte-class model, no training data inside artifacts).
- Serve: `uvicorn ml.api.main:app --port 8000` (endpoints `/health`,
  `/model-info`, `/predict`, `/rank-mechanics`; strict validation; JSON logs
  with counts/durations only — never coords/PII/secrets).
- Contract: feature order MUST match M10 exactly (`metadata.json` pins it);
  `mechanic_id` is passthrough, never a feature (tested).
- Authority: ML scores display ordering ONLY. M8 deterministic dispatch
  decides offers/assignment; the app calls the service with a 1.2 s timeout
  (`src/lib/mlRank.ts`, `VITE_ML_API_URL`) and falls back silently on any
  failure. Server-side Functions→ML integration is future work.
- Measured locally: 12-candidate rank p95 ≈ 35 ms over localhost HTTP
  (M10's 0.107 ms was in-process scoring — do not compare directly).
- Parity: `ml/tests/test_service.py::test_parity_with_frozen_evaluation_pipeline`
  asserts service == sklearn pipeline within 1e-6.

## Key contracts (M9, unchanged)

- **Seed:** 42 everywhere (`m9-gen-v1`, `m9-clean-v1`, `m9-features-v1`, `m9-split-v1`, `m9-baseline-v1`).
- **Target:** `y_win` = first-valid-accept winner per request (see `problem.md`).
- **Leakage:** closed `INFERENCE_FEATURES` set; `tier`, `winner_response_min`,
  `y_completed`, raw coordinates excluded by construction + test.
- **Scaling:** schema stats are fit on the clean set for documentation;
  **M10 must re-fit scalers on train only** (flagged in the report).
- **M8 baseline** is the number M10 must beat (test-split metrics in the report).

## MECHIST reference (read-only, concepts reused — nothing copied)

Ranking-over-pairs formulation, Hit@k/NDCG@k evaluation, seed discipline,
deterministic-baseline-first methodology. All RoadAssist artifacts are
regenerated from the M8 schema; no MECHIST data, weights, or code were reused.
