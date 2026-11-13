# RoadAssist — Known Limitations

Everything below was **measured in this repository**, not inherited from earlier
reports. Each item states what is true today, how it was confirmed, and what it
would take to remove. Written for a viva: an examiner who probes any of these
should get a straight answer, not a deflection.

Last verified: Phase 1 completion (M1.1), see `docs/VERIFICATION-M1.1.md`.

---

## 1. Verification caveats (read this first)

### 1.1 `scheduledOfferSweep` does not run in the emulator
**Confirmed:** the function initialises as a pubsub trigger
(`functions[us-central1-scheduledOfferSweep]: pubsub function initialized`)
but **zero executions** were logged across a 30-minute session with the pubsub
emulator running. Scheduled triggers are not fired by the emulator.

- **Consequence:** browser tests cannot wait for offer expiry; any such test
  would simply time out.
- **Mitigation:** `emulator/sweep.test.ts` calls the real `sweepRequest`,
  `expireStaleOffers` and `rematchRequest` against live Firestore, so the
  *logic* is proven. The *scheduling* of that logic is proven only in production.
- **Status:** logic verified; trigger scheduling requires production verification.

### 1.2 Offer expiry is invisible in the mechanic UI
`watchIncoming` (`src/lib/mechanic.ts:296-303`) filters offers whose `expiresAt`
has passed, so an expired offer is **removed** from the queue rather than shown
greyed out. This is a deliberate, stricter contract; it is noted here because a
reader expecting a disabled button will not find one.

### 1.3 "38/38 rules checks" is a text linter, not rules evaluation
`scripts/check-rules.mjs` is documented in its own header as a
*"Java-free substitute for emulator rule evaluation: targeted textual checks"*.
It greps `firestore.rules` for expected patterns.

- **Real rules proof** is `emulator/security.test.ts` (21 cases) plus
  `emulator/dispatch.test.ts`, which run against the emulator.
- Do not present 38/38 as behavioural proof of the rules.

---

## 2. Dispatch and scale limits

### 2.1 Global candidate and active-job caps
`functions/src/dispatch.ts:128,135` both cap at `limit(100)`:
- `loadCandidateMechanics` reads at most 100 approved+available mechanics.
- `loadActiveCounts` scans at most 100 live requests.

**Consequence:** beyond ~100 concurrent live jobs the per-mechanic
`MAX_ACTIVE_JOBS` cap silently under-enforces, because the active count is
computed from a truncated scan. Correct for a demo; **not** production-correct.

**To remove:** maintain a per-mechanic active-job counter document updated
transactionally, or aggregate with a query scoped to the candidate batch.

### 2.2 Active-job cap can be consumed by abandoned bookings
`MAX_ACTIVE_JOBS = 3`. Any booking that reaches `accepted` and is never
completed or cancelled permanently occupies a slot for that mechanic. This was
observed directly: after three test runs the seeded mechanic received **no**
offers.

- **Test mitigation:** `e2e/support/reset.ts` returns the emulator to baseline
  before each test.
- **Product implication:** a real mechanic with three neglected jobs stops
  receiving work with no visible explanation. A stale-job reaper is warranted
  before production.

### 2.3 Distance is straight-line, not road distance
`haversineKm` (`functions/src/dispatch.ts:37`) is great-circle distance.
Matching and displayed distance both use it (labelled honestly in the UI).

---

## 3. ETA

**There is no ETA calculation.** `etaMin` is a number the **mechanic types in**,
bounded 1–180 by rules (`firestore.rules:227-230`), and consumed verbatim by
notification copy (`functions/src/notifications.ts:105`).

`src/pages/customer/TrackingPage.tsx:213` states this explicitly:
> "Road route and traffic ETA are not calculated."

Do not claim an ETA feature exists. A distance-based heuristic is Phase 3 work
and is explicitly **not authorised**.

---

## 4. Trust-boundary asymmetry (lifecycle vs dispatch)

Assignment is genuinely server-authoritative: only the `acceptOffer` callable
writes `mechanicId`; clients are denied by rules and proven denied by tests.

Lifecycle is **not** server-authoritative in the same sense:

| Operation | Implementation | Authority |
| --- | --- | --- |
| Accept offer | `acceptOffer` callable + transaction | Server (Admin SDK) |
| Decline offer | `declineOffer` callable + transaction | Server (Admin SDK) |
| Advance status | `advanceJob` — **client** `runTransaction` | Rules only |
| Release job | `releaseJob` — **client** `runTransaction` | Rules only |

`advanceJob`/`releaseJob` (`src/lib/mechanic.ts:402,436`) are validated by
Firestore rules, which *is* a real trust boundary — but it is a different
guarantee from a callable, and they should not be described as equivalent.
Not a defect; a documented asymmetry.

---

## 5. Pricing integrity (partially closed in M17/M18)

The workflow now EXISTS: the assigned mechanic submits an estimate
(`estimatedAmountCents`, `estimatedDurationMin`, `estimateDiagnosis`,
`estimateStatus = 'pending'`), the owning customer approves or rejects it, and
**completion is refused until the estimate is approved** — enforced in
`advanceJob()` *and* in `firestore.rules`, so a direct SDK write cannot bill an
unapproved repair. Estimate writes are bounded (0…₹10,000, 0…1,440 min,
≤2,000-character diagnosis), are frozen once approved, and are frozen once the
job is terminal. A rejected estimate can be revised.

What is still missing:

- The approved estimate is a **decision record, not a bill**: `amountCents` is
  still entered by the mechanic at completion (same ₹10,000 cap). Nothing
  reconciles the two figures.
- No line items, taxes, discounts or invoice documents exist.
- Nothing records *why* an estimate changed between revisions (only the latest
  diagnosis is kept).

**Consequence:** price changes are now customer-gated, but the final billed
amount remains a unilateral client write within a bounded range.

Similarly, `pickedMechanicId` is written by the client
(`src/lib/customer.ts:261`, `RequestPage.tsx:206`) but **never read by
dispatch** — a live UI affordance backed by a dead field.

---

## 6. Payments and invoices

Offline payment **recording** exists (M17). The owning customer or the assigned
mechanic records `paymentMethod` (`cash` | `upi`), `paymentStatus` (`paid`),
`paidAt` and `paidBy` on a completed request; `paymentStatus` is one-way and
`pending` is not storable. Analytics report these as *recorded*, never as
verified revenue, and never as settlement.

Still not implemented: any online provider, server-side verification, webhook
handling, refunds, payouts, invoices or reconciliation. `amountCents` remains
the only authoritative figure for what was billed.

**Recording a payment in Firestore is not an online payment integration.**

---

## 7. Storage

`storage.rules` exists (owner-scoped, image-only, 8 MB) and the emulator is
wired, but **no application code uses Storage**: no `getStorage`,
`uploadBytes` or `getDownloadURL` anywhere in `src/` or `functions/src/`.
`VITE_FIREBASE_STORAGE_BUCKET` is read into config but never used by a feature.

Photo/diagnosis upload is entirely greenfield. The rules comment already states
that `contentType` is client-asserted and is a gate, not a content guarantee.

---

## 8. Demo mode is a second implementation

`src/lib/fixtures.ts` is a parallel domain model, and roughly a dozen pages
branch on `demoMode`. Demo mutations live in localStorage/browser events and are
never covered by the emulator suite. This is the mechanism that previously
produced the "Load demo booking" confusion (it navigates to
`/track/demo-request-pending` and never calls `createRequest`).

**Phase 1 change:** `initialDemoMode()` (`src/app/AuthProvider.tsx`) now lets an
explicit `VITE_ROADASSIST_MODE` win over stale localStorage, so an emulator run
cannot silently serve fixtures. A `demo-banner` test id was added so tests can
assert its absence.

**Recommendation:** demo the real seeded flow; keep demo mode only as a
no-network fallback.

---

## 9. Configuration hazards

### 9.1 Emulator and production share a project id
`.firebaserc`, `.env.local` and `.env.emulator` all use `roadassist-9c223`.
Isolation depends entirely on `VITE_USE_EMULATORS=true` causing the SDK
`connect*Emulator` calls.

**Mitigation:** `e2e/global-setup.ts` refuses to run browser tests unless the
emulator env file sets `VITE_USE_EMULATORS=true` **and** the local emulators
answer on 127.0.0.1. There is no configuration path to production.

### 9.2 The Functions emulator runs compiled `lib/`, not `src/`
`functions/package.json` sets `main: lib/index.js`, and `emulators:start` does
**not** rebuild it (only `predeploy` does, on deploy).

**Consequence:** a stale `functions/lib/` makes the emulator execute old
dispatch code while you believe you are testing `functions/src`.
**Mitigation:** `npm run dev:emulators` builds Functions before starting.

### 9.3 `.env.emulator` was not gitignored
It is now (`.gitignore`). Values are placeholders today, but a future edit could
carry real credentials.

### 9.4 Service-account JSON sits in the repo root
`roadassist-Cloud secured.json` is correctly gitignored and untracked, and was
**not opened** during this work. Per instruction, any previously exposed service
account key must be treated as compromised and rotated before any deploy.

---

## 10. Client-side idempotency only

`createRequest` idempotency (`src/lib/customer.ts:242-272`) is a client-held
`requestKeyRef` UUID. It survives a double-click within one page lifetime and is
proven by E2E, but it is **not** server-enforced: a client could supply a fresh
key for identical content and produce a second booking. Duplicate protection is
therefore a UX guard, not an invariant.

---

## 11. Data-model gaps

- No `statusHistory[]` — the timeline is reconstructed from a constant.
- No `lineItems` on a request.
- No `dispute` state.
- No server-side `currency` or `tax` fields.
- `notifications` fan-out crashes if a request document lacks the denormalized
  `id` field: `shortRef(undefined)` throws
  `Cannot read properties of undefined (reading 'slice')` in
  `functions/src/notifications.ts`. Real clients always write `id`
  (`customer.ts:270`), so this only affects hand-seeded or admin-created
  documents — but the handler swallows the error and the customer silently
  receives no notification.
