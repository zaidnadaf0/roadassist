# RoadAssist Firestore Schema (M3)

Normalized, owner-scoped collections. Adapted from the proven MECHIST 1B/1C
model; naming decision: `requests` (not `serviceRequests`) for MECHIST parity
and shorter paths. Ratings live on the request + server-aggregated onto the
mechanic — no separate `ratings` collection. The immutable `auditEvents/{id}`
collection exists: written only by trusted Cloud Functions (approval and
admin-claim changes), readable by claim-admins, and closed to all client
writes (see firestore.rules).

Conventions: `createdAt`/`updatedAt` on every doc (server timestamps where the
client writes, Admin SDK timestamps server-side). Ownership fields are
immutable once written. `users/{uid}.role` is a UI hint; authority is
`request.auth.uid` + custom claim `admin === true` (see §7 of this doc set).

## users/{uid} — doc ID = Auth UID

| Field | Type | Req | Notes |
|---|---|---|---|
| uid | string | y | == Auth UID, immutable |
| email | string | y | lowercase |
| displayName | string | y | 1–120 |
| phone | string\|null | n | owner-editable |
| role | enum | y | `customer`\|`mechanic`\|`admin` — HINT ONLY |
| createdAt / updatedAt | timestamp | y | |

Client writes: create own doc with role `customer`\|`mechanic` + exact key
allowlist (matches M2 signup payload + mechanic onboarding); update own
`displayName, phone, updatedAt` only; role/approved frozen. Delete: claim-admin.
Mechanic-hint elevation happens only via the approval callable (§8), which
syncs the hint server-side. Admin hint via grant callable only.

## mechanics/{uid} — PRIVATE operational source, doc ID = Auth UID

| Field | Type | Req | Notes |
|---|---|---|---|
| uid / name | string | y | |
| approved | bool | y | MUST start `false`; client can never set true |
| verificationStatus | enum | y | `pending`\|`under_review`\|`approved`\|`suspended`\|`rejected` |
| specialties / vehicleTypes | string[] | y | |
| experienceYears | number | y | 0–60 |
| serviceRadiusKm | number | y | 1–200 |
| isAvailable | bool | y | self-mutable |
| rating / reviewCount | number | n | SERVER-aggregated, client-frozen |
| vehicleDescription / garageName | string | y | |
| garageAddress | string | y | PRIVATE — never projected |
| baseLat / baseLng | number\|null | n | exact home/garage — PRIVATE |
| currentLat / currentLng | number\|null | n | live GPS — PRIVATE, cleared on completion |
| locationUpdatedAt | number | n | epoch ms |
| createdAt / updatedAt | timestamp | y | |

Reads: owner + claim-admin ONLY (never public, never other customers).
Self-update allowlist: `isAvailable, currentLat, currentLng,
locationUpdatedAt, updatedAt` (GPS + availability writers). Everything else
(name, radius, garage, base, approval, rating) is claim-admin or server-only.
Contact (`phone`/`email`) lives in `mechanics/{uid}/private/contact`
(owner + admin only), never on the parent.

Decision note: MECHIST used `approved` + `verificationStatus(pending,
under_review, approved, rejected)`. RoadAssist keeps both and adds
`suspended` (temporary halt without full rejection). `approved === true`
iff `verificationStatus === 'approved'`; only the approval callable (or a
claim-admin write) may transition it.

## publicMechanics/{uid} — customer-safe projection (server-written)

Written ONLY by the `onMechanicWrite` trigger (Admin SDK) when the source is
`approved === true`; deleted otherwise. Fields: `name, approved,
isAvailable, specialties, vehicleTypes, experienceYears, serviceRadiusKm,
rating, reviewCount, vehicleDescription, garageName, baseLat, baseLng
(COARSE, rounded to 2 decimals ≈ 1.1 km), updatedAt`. NEVER: phone, email,
garageAddress, currentLat/Lng, locationUpdatedAt, verificationStatus.
Reads: public (directory/map work login-free). Writes: claim-admin shape-
checked (server bypasses rules); clients can never forge it. This completes —
rather than copies — the earlier projection WIP: trigger + backfill +
client rewire are all included here.

## vehicles/{id} — doc ID random

`ownerId` (frozen, == creator UID), `make, model, plate` strings, `year`
number, `type` enum `car|bike|van|truck`, `isDefault` bool, `createdAt`.
Owner-only CRUD (+ claim-admin read; delete is owner-only). Create key allowlist
enforced; updates allowlist the same bounded fields as create.

## requests/{id} — doc ID random

Lifecycle: `requested → accepted → on-the-way → arrived → service →
completed`, plus `cancelled`. Offer pool: `offerExpiresAt` (**Firestore
timestamp**, NOT epoch millis — rules compare it with `request.time` and
timestamp<int comparison is an evaluation error; clients write
`Timestamp.fromMillis(Date.now() + 120_000)`),
`declinedBy` UID list (append-only, cap 50), release/rematch fields.

| Field | Writer | Notes |
|---|---|---|
| customerId / vehicleId (owned) / problemText (5–2000) / problemCategory? / customerLat,Lng (finite) / pickedMechanicId? / status=`requested` / offerExpiresAt / mechanicId=null / createdAt, updatedAt | customer create | exact allowlist; vehicle must exist + be owned |
| status→cancelled (+cancelledAt, cancelledBy=`customer`, reason ≤500) from live states; rating 1–5 + comment ≤500 on completed only | customer update | safe-transition matrix |
| first assignment (status→accepted + mechanicId=self + name + etaMin 1–180, in-window) | approved mechanic | approval enforced in rules |
| advance incl. live coords; amountCents 0–1e6 + durationMin 0–1440 on completed ONLY, and only with an approved estimate; rating fields + terminal states frozen | assigned mechanic | |
| decline (append own UID), release (reset + reason ≤500 + future window + releasedAt timestamp) | mechanic | |
| mechanicPhone (server-denormalized), mechanicLat/Lng (live, nulled on completion) | mechanic push + server | customer reads own request only |
| ratingAggregated flag, phone attach, live-location cleanup | server triggers | Admin SDK |

Reads: customer owner, assigned mechanic, approved mechanics for `requested`
queue, claim-admin. Delete: claim-admin.

## requests/{id} — repair estimate and offline payment (M17/M18)

Two narrow, separate update paths. Both are allowlisted in `firestore.rules`
and neither may be bundled with any other field.

| Field | Type | Writer | Notes |
|---|---|---|---|
| `estimatedAmountCents` | number 0–1,000,000 | assigned mechanic | stored name is `estimated*`; UI/types must read the same name |
| `estimatedDurationMin` | number 0–1,440 | assigned mechanic | |
| `estimateDiagnosis` | string ≤2,000 or null | assigned mechanic | free-text diagnosis |
| `estimateStatus` | `pending` \| `approved` \| `rejected` | mechanic submits `pending`; owning customer decides | a mechanic can never write `approved` |
| `estimateApprovedAt` | number (epoch ms) | owning customer | `is number` — a `serverTimestamp()` sentinel is denied |
| `paymentMethod` | `cash` \| `upi` | customer owner or assigned mechanic | offline record only |
| `paymentStatus` | `paid` | same | one-way recording; `pending` is not storable |
| `paidAt` | number (epoch ms) | same | |
| `paidBy` | string (acting uid) | same | |

Rules behaviour:

- Estimate writes: assigned mechanic only, live (non-terminal) request only,
  frozen once `estimateStatus == 'approved'`. A `rejected` estimate may be
  revised back to `pending`.
- Customer decision: owning customer only, only while `estimateStatus ==
  'pending'`, and only `estimateStatus` / `estimateApprovedAt` / `updatedAt`.
- **Completion requires `estimateStatus == 'approved'`** at the rules level;
  `advanceJob()` refuses first, so the UI never relies on the rule error.
- Payments: owning customer or assigned mechanic only, `completed` request
  only, only the four payment fields.

HONESTY: a recorded payment is what an authorized actor reported. Nothing here
verifies a transaction; no analytics surface may label it verified revenue.

## notifications/{uid}/items/{id} — doc ID deterministic per event

`{id, type, title ≤120, body?, requestId?, path?, createdAt ms, read bool}`.
Reads/updates (read-flag only)/deletes: owner. **Creates: server-only**
(`allow create: if false`; Admin SDK producers bypass). Producers for
assignment/progress events land in M8/M12 with dispatch; the inbox contract
is frozen here.

## Indexes (firestore.indexes.json)

requests by (status, createdAt), (customerId, createdAt),
(mechanicId, status, updatedAt), (mechanicId, status),
(status, offerExpiresAt, mechanicId), (status, mechanicId, updatedAt);
mechanics + publicMechanics by (approved, isAvailable, name);
vehicles by (ownerId, createdAt); notifications by createdAt.
Each exists for a concrete M4–M8 query; no speculative indexes.
