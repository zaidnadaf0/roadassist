# RoadAssist — demonstration script (final-year viva / college demo)

A 10–12 minute walkthrough that shows every portal, the security model, and
the dispatch loop. Two supported modes — pick one before starting:

| Mode | Setup | Shows |
| --- | --- | --- |
| **Demo mode** (safest) | `npm run dev` → open the app → Settings → "Use demo data" | Isolated sample data, no emulator needed |
| **Emulator mode** (full workflow) | Terminal 1: `npx firebase emulators:start --only auth,firestore,functions --project roadassist-9c223` · Terminal 2: set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `SEED_PROJECT_ID=roadassist-9c223`, run `node scripts/seed-emulator.mjs` · Terminal 3: `npm run build && npx vite preview --port 4173` | Real Auth + Firestore + Cloud Functions round-trips |

**Synthetic emulator accounts** (exist only in the local emulator):
`cust@roadassist.test` / `mech@roadassist.test` / `admin@roadassist.test` — password `Test!2345`.

## 1. Public entry (1 min)

- `/` — landing, service catalogue, "how it works" (request → match → track).
- Point out honest copy: prices are illustrative, matching is first-valid-accept.

## 2. Customer journey (3–4 min)

1. Log in as **cust@roadassist.test** at `/customer/login`.
2. Dashboard — live metrics, active request, unread-notification badge in the sidebar.
3. **My Vehicles** — add a vehicle, set default, remove (atomic default handling).
4. **Request help** — pick "Battery Jump" → wizard: vehicle → problem →
   location (manual entry; GPS optional) → confirm → lands on tracking.
5. Tracking — timeline `requested`, "1 nearby mechanic notified — first valid
   accept wins". Explain: offers are server-created; the client cannot assign.
6. **Mechanic Guide** — choose a scenario; type "there is fire" to show the
   emergency triage blocking submission with 112 guidance (safety-first design).

## 3. Security boundary (1–2 min) — the highlight

- While logged in as the customer, open `/admin` — the claim gate: "Admin
  authority comes from a server-minted access claim, not from your profile."
- Explain the three trust layers: Firestore rules (deny-by-default), Cloud
  Functions callables (server-authoritative dispatch), custom claims (admin).

## 4. Mechanic journey (3 min)

1. Sign out (portal sidebar) → log in as **mech@roadassist.test**.
2. Dashboard — availability toggle, honest metrics (Avg job value, not a fake
   completion rate).
3. **Incoming Requests** — live countdown on the offer; Accept → job becomes
   active (transactional first-win; concurrent losers get "Already claimed").
4. **Job page** — advance `On the way → Arrived → Service`, then complete with
   billing (try a negative amount first: rejected with a specific message).
5. **Earnings** — derived strictly from recorded amounts. **Notifications** —
   deep links open the mechanic job page directly.

## 5. Admin portal (2–3 min)

1. Sign out → log in as **admin@roadassist.test** at `/admin/login`.
2. Operations dashboard — bounded KPI cards, "Needs attention" exceptions.
3. **Approvals** — approve/suspend a mechanic (server-side transition guard;
   audit event written). **Logs** — show the immutable audit trail.
4. **Analytics** — UTC windows, status mix, mechanics breakdown, CSV export.

## 6. Close (30 s)

- Local test suite summary: typecheck, lint, 142 unit tests, 69 emulator
  rules/integration tests, 38/38 rules invariants, ML suite.
- Known deferred items (mobile-overflow polish, production-Firebase
  verification) — see `docs/DEPLOYMENT-CHECKLIST.md`.

## Safety notes

- Never run this script against a production Firebase project; the emulator
  seed script refuses to run without emulator env vars.
- The emergency flow only displays 112 guidance — it never places a call.
