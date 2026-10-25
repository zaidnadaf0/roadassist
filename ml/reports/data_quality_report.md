# M9 Data-Quality Report — SYNTHETIC DEVELOPMENT DATA

> Seed 42. NOT production history. See `ml/problem.md` and `ml/README.md`.

## Size
- Candidate rows (final): **35231** across **3000** requests
- Raw rows: 35586 -> removed 355 -> final 35231
- Removal reasons: {"invalid_customer_lat": 177, "rating_out_of_range": 178}
- Target: 2971 wins / 32260 non-wins

## Missing (imputed with train medians in features.py)
- rating: 30.0%
- review_count: 13.6%
- experience_years: 6.8%
- avg_response_min_hist: 0.0%

## Splits (temporal, request-disjoint)
- train (days 0–19): 1991 requests
- valid (days 20–24): 525 requests
- test (days 25–29): 484 requests

## Features (25)
`distance_km, service_match, within_radius, rating, review_count, experience_years, service_radius_km, active_jobs, acceptance_rate_hist, completion_rate_hist, avg_response_min_hist, availability, hour_of_day, day_of_week, offer_round, eligible_count, cat__problem_category__battery, cat__problem_category__engine, cat__problem_category__flat-tyre, cat__problem_category__other, cat__problem_category__tow, cat__vehicle_type__bike, cat__vehicle_type__car, cat__vehicle_type__truck, cat__vehicle_type__van`

## M8 baseline on test
- Hit@1 0.3326 · Hit@3 0.7004 · NDCG@3 0.5476 · ROC-AUC 0.7766

## Leakage
Closed inference-time set only; forbidden columns asserted absent by `ml/tests/test_leakage.py`.
