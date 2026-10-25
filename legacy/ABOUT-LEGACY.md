# legacy/ — M0 source archive (read-only reference)

This directory holds the **exact** pre-M1 RoadAssistBACKUP implementation,
moved here byte-for-byte during M1 (verified: 31/31 SHA-256 hashes match the
M0 manifest `RoadAssistBACKUP-M0-20261007-113826.zip`, including the original
`README.md` — restored and re-verified after an accidental overwrite).

- `index.html` + `assets/` — the original static app (UX/IA reference).
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`,
  `.firebaserc` — original backend wiring (reference only; superseded in later phases).
- `README.md` — original product documentation (DO NOT overwrite).
- `demo-map-screenshot.png`, `bash.exe.stackdump` — carried over untouched.

**Do not edit files in here.** Later phases rebuild each screen on the new
React stack using these files as UX reference only. Deletion happens only
after the replacement passes its gates, file by file, with explicit approval.
