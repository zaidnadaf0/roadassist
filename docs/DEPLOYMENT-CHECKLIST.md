# RoadAssist — deployment readiness checklist (no deployment performed)

Status: **local-verified only**. Nothing in this repo has been deployed; this
document records what must be true before a deploy is authorized.

## 1. Required Firebase configuration (apply in this order)

1. `firebase deploy --only firestore:index` — builds the composite indexes in
   `firestore.indexes.json`, including the `offers (mechanicId, status)`
   COLLECTION_GROUP index the live mechanic offer queue requires. Deploying
   code without this index breaks `/m/requests` in live mode (the client now
   shows a retryable error instead of silently empty).
2. `firebase deploy --only firestore:rules,storage` — rules and storage rules.
   Current invariants: server-only assignment (no client accept path),
   vehicles update allowlist, deny-by-default catch-all, claim-admin gating.
3. `firebase deploy --only functions` — Cloud Functions (Node 20 runtime).
   firebase-admin v14 with subpath imports; test files excluded from the
   bundle.
4. Hosting target for the built SPA (`dist/`) is **not configured** in
   `firebase.json` — add a hosting section before the first web deploy.

## 2. Environment and secrets

- `.env.local` (gitignored) carries the Firebase web config; copy
  `.env.example` keys into the hosting provider's env settings.
- Restrict the web API key in Google Cloud Console (HTTP referrer
  restrictions) — defense in depth; rules remain the boundary.
- First admin bootstrap: `node scripts/setAdminClaim.mjs --project <id>
  --uid <uid>` with `GOOGLE_APPLICATION_CREDENTIALS` set (service account).
  The script refuses any `mechist` project id. There is no in-app
  grant/revoke UI; further admins use the callables.
- ML service (optional): `pip install -r ml/requirements.txt`, then
  `uvicorn ml.api.main:app`. It is fail-closed: without `ML_ALLOWED_ORIGINS`
  no browser origin may call it. Set that variable only if the browser
  ranking seam is actually exposed.

## 3. Verification gate (must pass on the release commit)

| Check | Command | Last verified result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Security-rules lint | `npm run lint:rules` | 38/38 |
| Unit suite | `npm test` | 142 passed |
| Rules integration (emulator) | `npm run test:emulator:rules` | 69 passed |
| SPA build | `npm run build` | success |
| Functions build | `npm run build:functions` | success |
| ML suite (optional) | `python -m pytest ml/tests -q` | 20 passed |

CI (`.github/workflows/ci.yml`) runs everything except the emulator suite and
ML tests on every push/PR.

## 3b. Browser verification (Phase 7, 2026-10-25)

**Environment:** production bundle (`npm run build` + `vite preview`) served
locally; Firebase **Emulator Suite** (Auth 9099, Firestore 8080, Functions
5001) via `VITE_USE_EMULATORS=true` (dev-only seam in `src/lib/firebase.ts`);
synthetic accounts seeded by `scripts/seed-emulator.mjs`; Chromium-based
in-app browser at 1280×800, 820×1180 and 390×844 viewports. No production
Firebase account, data, or deployment was touched.

**Verified in a real browser (all PASSED unless noted):**

- Customer: landing render, login → `/app`, live dashboard metrics, vehicle
  add / set-default / remove, request wizard (category param, validation,
  manual coordinates) → real emulator dispatch (offer created by the
  `onRequestCreate` trigger), tracking timeline + "1 nearby mechanic
  notified", mechanic-guide emergency triage (fire text blocks submission),
  directory, Leaflet coverage map (tiles loaded), notifications with working
  deep links, `/admin` claim-gate denial for a customer.
- Mechanic: dashboard (approved/available/earnings), offer queue with
  countdowns, server-side expiry rejection ("Offer expired before it could
  be claimed"), live accept via callable, full lifecycle accepted →
  on-the-way → arrived → service → completed with billing validation
  (negative amount rejected with a specific message), history + earnings
  math (₹1298 = 499+799), `/m/job/...` notification deep links, apply-page
  guard for an approved mechanic.
- Admin: claim-gated login, KPI cards + "Needs attention" exceptions,
  analytics windows + mechanics breakdown + accessible volume chart,
  suspend/approve via the real callable with **auditEvents** captured at
  `/admin/logs`, users search (3→1 filtered), dispatch view, CSV download.
- Demo isolation: explicit "DEMO PREVIEW" banners, fictional identity on the
  same authenticated session, demo booking controller, no Firebase writes.
- Responsive: zero horizontal overflow at 390px and 820px; bottom tab bar on
  mobile; keyboard-reachable controls verified via ARIA tree.

**Fixed during this phase (regression tests added):** live-mode request
submit denial (missing-doc idempotency pre-read), zero-default fleet after
deleting the default vehicle, expired-but-pending offers displayed as live,
missing mechanic/admin sign-out control.

**Re-verified in the second smoke round (same day, pubsub emulator added):**
GPS granted / denied / position-unavailable states all render distinct
messaging with manual-entry fallback (granted autofills via a stubbed
geolocation); zero broken images across seven pages (the app intentionally
uses inline SVG icons; the only raster images are OSM tiles, all loaded);
demo↔live toggle round-trip restores real data; availability toggle
round-trip; offer accept + lifecycle advance re-verified with the scheduled
sweep running. **Known deferred item (by owner decision):** live-mode pages
show ~132px horizontal overflow at 390px viewport (page-stack grid tracks
size to max-content); desktop rendering is unaffected and mobile layout
changes were explicitly deferred — desktop is the demonstration priority.

**Not covered (requires real devices/permissions):** native GPS permission
prompts, push notifications/FCM, real payment flows (none exist), and
production-Firebase smoke. The embedded dev-server HMR is incompatible with
the automation browser — test against the production preview build.

## 4. Known risks / not-yet-production items

- Browser E2E journeys (authenticated, all three portals, GPS flows,
  responsive layouts) are **not** automated — run the manual smoke list from
  `docs/ARCHITECTURE-AND-WORKFLOWS.md` §5 before a public launch.
- No monitoring, alerting, or error reporting is configured (no Sentry /
  Cloud Monitoring dashboards). Lifecycle fan-out failures are logged only.
- `scheduledOfferSweep` runs every minute with a 50-request window — at scale
  the scan should be paginated/keyed (bounded reads documented in code).
- Claim-admin **direct** Firestore writes (allowed by rules for mechanics/
  requests/users) bypass `auditEvents`; only callable actions are audited.
- CSV exports are client-side snapshots of bounded windows (≤200 rows) and
  are labelled as such in the UI.
- Rollback: redeploy the previous release commit; Firestore indexes and
  rules are additive-safe to roll back (deny-by-default catch-all remains).

## 5. Explicit non-goals of this checklist

No deploy, publish, or live-resource change has been executed from this
workspace. Any deployment requires separate, explicit authorization.
