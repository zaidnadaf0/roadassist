# M9 — ML Problem Definition (RoadAssist mechanic ranking)

Status: **SYNTHETIC DEVELOPMENT DATASET** (no production history exists yet).
Nothing here represents real RoadAssist performance. M10 benchmarks models
against the M8 baseline on this data; production refit happens later.

## Task

Learning-to-rank over offer rounds: given a service request and its eligible
candidate mechanics, rank candidates by likelihood of **successful assignment**
(winning the offer with a clean accept inside the 120 s window).

- Unit of prediction: one (request, candidate mechanic) pair.
- Unit of evaluation: one request (ranked list) — Hit@k / NDCG@k.
- Label `y_win` (0/1): 1 = this candidate was the first-valid accept.
- Secondary label `y_completed` (0/1): winner whose job completed without
  dispute. Recorded for future use, NOT the M9 target.

## Why this target (and not "nearest mechanic")

Distance is one feature, not the objective: rookies nearby lose to reliable
mechanics slightly farther away; overloaded aces lose to free standards;
night tow needs capability over proximity. The target captures the actual
dispatch objective (an accepted, workable assignment now), while distance,
match, rating, workload, and history compete as features. M10 must show a
model beating the M8 distance-led baseline on this target, or we keep M8.

## Inference-time contract

At ranking time the server knows: request fields, candidate profile fields,
coarse/live positions, history aggregates computed BEFORE the request, round
number, eligible count. It does NOT know: who will accept, completion,
amount, ETA, this-job rating, or other candidates' outcomes. The feature set
in `features.py` (`INFERENCE_FEATURES`) is the closed allowed list; anything
else is leakage by definition (see leakage policy below).

## Leakage policy (mandatory)

FORBIDDEN as inputs: `winner_id`, final `status`, `amountCents`,
`mechanicName/Phone` assignment artifacts, `rating`/`comment` of the CURRENT
job, `etaMin` committed post-accept, per-round outcomes of OTHER candidates,
any aggregate computed including the current request. Response-time FEATURES
use precomputed per-mechanic history averages only — never the current job's
observed response. `tests/test_leakage.py` asserts the forbidden set is absent
from the feature matrix and that history aggregates predate the request.
