# M10 Validation Comparison (test-blind selection)

| Model | Hit@1 | Hit@3 | NDCG@3 | ROC-AUC* | Train s | p95 ms | Bytes |
|---|---|---|---|---|---|---|---|
| m8_baseline | 0.4095 | 0.6990 | 0.5787 | 0.7902 | — | — | 0 |
| logreg | 0.5429 | 0.8533 | 0.7243 | — | 0.02 | 0.088 | 906 |
| grad_boosting | 0.4952 | 0.8248 | 0.6882 | — | 0.3 | 1.291 | 334987 |
| random_forest | 0.4514 | 0.8000 | 0.6546 | — | 1.71 | 7.11 | 36340532 |
| decision_tree | 0.4381 | 0.7752 | 0.6331 | — | 0.1 | 0.101 | 334491 |
| knn | 0.3638 | 0.7390 | 0.5816 | — | 0.0 | 1.909 | 2518166 |
| naive_bayes | 0.2895 | 0.6629 | 0.5054 | — | 0.01 | 0.337 | 958 |
| dummy | 0.2533 | 0.6457 | 0.4762 | — | 0.0 | 0.252 | 475 |

Winner: **logreg** {"C": 10.0, "max_iter": 2000}

*ROC-AUC is pair-level context only; selection used NDCG@3 then Hit@1 then Hit@3.
*M8 row: frozen M9 baseline, validation split, formula untouched.*
