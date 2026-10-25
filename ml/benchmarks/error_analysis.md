# M10 Error Analysis (frozen winner, test split)

Miss rate (top pick wrong): **51.4%**

- True winner distance: **6.08 km** on misses vs **3.49 km** on hits: distant winners are the hard cases (nearby candidates outscore them).
- Pool size barely differs (misses average 11.97 candidates vs 11.48 on hits): crowding is NOT the driver.
- Winner round on misses: {1: 85, 2: 35, 3: 33, 4: 20, 0: 17, 5: 14, 6: 10, 7: 8, 9: 7, 8: 5, 10: 3, 11: 2, 14: 2, 12: 1}
- Winner category on misses: {'flat-tyre': 61, 'engine': 58, 'battery': 57, 'other': 38, 'tow': 28}

Full per-slice Hit@1/NDCG@3: `robustness.json`.
