#!/usr/bin/env node
/**
 * scripts/check-rules.mjs — static linter for RoadAssist `firestore.rules`.
 *
 * Java-free substitute for emulator rule evaluation: targeted textual
 * checks for the M3 security invariants. Exit 0 when all pass, 1 on any
 * failure (`FAIL:` lines for CI). The emulator suite in `emulator/`
 * provides runtime proof; this linter is the fast always-on gate.
 *
 *   node scripts/check-rules.mjs [path/to/rules]
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = process.argv[2] ? resolve(process.argv[2]) : join(__dirname, '..', 'firestore.rules');
if (!existsSync(filePath)) {
  process.stderr.write(`ERROR: rules file not found: ${filePath}\n`);
  process.exit(2);
}
const src = readFileSync(filePath, 'utf8');

function matchBlock(pathPattern) {
  const escaped = pathPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`match\\s+/${escaped}\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  let depth = 1;
  let i = open + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(open, i);
}

function updateBody(block, collection) {
  if (!block) return '';
  const start = block.indexOf('allow update:');
  const end = block.indexOf('allow delete:', start);
  if (start < 0) return '';
  return block.slice(start, end > start ? end : undefined);
}

const results = [];
function record(id, label, pass, detail) {
  results.push({ id, label, pass, detail });
}

// R001 — claim helper
{
  const pass = /function\s+isClaimAdmin\s*\([^)]*\)\s*\{[\s\S]*?request\.auth\.token\.admin\s*==\s*true/.test(src);
  record('R001', 'isClaimAdmin() checks request.auth.token.admin == true', pass, pass ? null : 'helper missing/misshapen');
}
// R002 — users create roles
{
  const block = matchBlock('users/{uid}');
  const pass = block != null && /request\.resource\.data\.role\s+in\s+\['customer',\s*'mechanic'\]/.test(block);
  record('R002', "users create restricts role to ['customer','mechanic']", pass, pass ? null : 'role allowlist missing');
}
// R003 — users update freezes role
{
  const block = matchBlock('users/{uid}');
  const pass = block != null && /request\.resource\.data\.role\s*==\s*resource\.data\.role/.test(block);
  record('R003', 'users update freezes role (no self-promotion)', pass, pass ? null : 'role freeze missing');
}
// R004 — requests read matrix
{
  const block = matchBlock('requests/{id}');
  const pass = block != null
    && /resource\.data\.customerId\s*==\s*request\.auth\.uid/.test(block)
    && /isMechanicApproved\(\)/.test(block)
    && /isClaimAdmin\(\)/.test(block);
  record('R004', 'requests read: owner + approved queue + admin', pass, pass ? null : 'read matrix incomplete');
}
// R005 — requests create status
{
  const block = matchBlock('requests/{id}');
  const pass = block != null && /request\.resource\.data\.status\s*==\s*'requested'/.test(block);
  record('R005', "requests create requires status == 'requested'", pass, pass ? null : 'status guard missing');
}
// R006 — customer cancel/rate branch + audit fields
{
  const body = updateBody(matchBlock('requests/{id}'));
  const pass = /cancelledAt/.test(body) && /cancelledBy/.test(body) && /cancellationReason/.test(body)
    && /request\.resource\.data\.cancelledBy\s*==\s*'customer'/.test(body);
  record('R006', 'customer branch carries cancel audit fields, cancelledBy=customer', pass, pass ? null : 'audit fields missing');
}
// R007 — mechanic advance freezes identity
{
  const body = updateBody(matchBlock('requests/{id}'));
  const pass = /request\.resource\.data\.mechanicId\s*==\s*resource\.data\.mechanicId/.test(body)
    && /request\.resource\.data\.mechanicName\s*==\s*resource\.data\.mechanicName/.test(body);
  record('R007', 'mechanic advance freezes mechanicId/mechanicName', pass, pass ? null : 'identity freeze missing');
}
// R008/R009/R010 — server-only assignment: no client-direct accept branch,
// release branch keeps its offer window, vehicles update stays allowlisted.
{
  const body = updateBody(matchBlock('requests/{id}'));
  const noDirectAccept = !/request\.resource\.data\.status\s*==\s*'accepted'/.test(body);
  record('R008', 'no client-direct accept branch (assignment is callable-only)', noDirectAccept, noDirectAccept ? null : 'client-direct accept branch present');
  const window = /request\.time\s*<\s*request\.resource\.data\.offerExpiresAt/.test(body);
  record('R009', 'release branch enforces offer window', window, window ? null : 'expiry check missing');
  const vehiclesBlock = matchBlock('vehicles/{id}');
  const keys = vehiclesBlock != null
    && /affectedKeys\(\)[\s\S]*?\.hasOnly\(\['make',\s*'model',\s*'year',\s*'plate',\s*'type',\s*'isDefault'\]\)/.test(vehiclesBlock);
  record('R010', 'vehicles update allowlists editable fields', keys, keys ? null : 'vehicles update allowlist missing');
  const ownership = /hasValidOffer\(id\)/.test(body) && /function hasValidOffer/.test(src)
    && /\.data\.status\s*==\s*'pending'/.test(src)
    && /\.data\.expiresAt\s*>\s*request\.time/.test(src);
  record('R037', 'decline branch requires an owned pending offer', ownership, ownership ? null : 'offer ownership guard missing');
  const transitions = /resource\.data\.status\s*==\s*'accepted'\s*&&\s*request\.resource\.data\.status\s*==\s*'on-the-way'/.test(body)
    && /resource\.data\.status\s*==\s*'on-the-way'\s*&&\s*request\.resource\.data\.status\s*==\s*'arrived'/.test(body)
    && /resource\.data\.status\s*==\s*'arrived'\s*&&\s*request\.resource\.data\.status\s*==\s*'service'/.test(body)
    && /resource\.data\.status\s*==\s*'service'\s*&&\s*request\.resource\.data\.status\s*==\s*'completed'/.test(body);
  record('R038', 'mechanic status changes require the next lifecycle step', transitions, transitions ? null : 'exact transition guards missing');
}
// R011 — mechanics create unapproved
{
  const block = matchBlock('mechanics/{uid}');
  const pass = block != null
    && /request\.resource\.data\.approved\s*==\s*false/.test(block)
    && /verificationStatus\s+in\s+\['pending',\s*'under_review'\]/.test(block);
  record('R011', 'mechanics create forces approved==false + pending/under_review', pass, pass ? null : 'self-approval possible');
}
// R012 — mechanics self-update guards
{
  const block = matchBlock('mechanics/{uid}');
  const pass = block != null
    && /!.*'rating'/.test(block) && /!.*'reviewCount'/.test(block)
    && /\.hasOnly\(\['isAvailable',\s*'currentLat',\s*'currentLng',\s*'locationUpdatedAt',\s*'updatedAt'\]\)/.test(block);
  record('R012', 'mechanics self-update: 5-key allowlist, no rating/contact mutation', pass, pass ? null : 'allowlist missing');
}
// R013 — catch-all deny
{
  const block = matchBlock('{document=**}');
  const pass = block != null && /allow read, write:\s*if false/.test(block);
  record('R013', 'catch-all denies everything', pass, pass ? null : 'catch-all missing');
}
// R014 — create validates text + coords
{
  const block = matchBlock('requests/{id}');
  const pass = block != null
    && /problemText\.size\(\)\s*>=\s*5/.test(block)
    && /customerLat\s*>=\s*-90/.test(block) && /customerLng\s*>=\s*-180/.test(block);
  record('R014', 'request create validates problemText + finite coords', pass, pass ? null : 'validation missing');
}
// R015 — storage rules file guards
{
  const storagePath = join(__dirname, '..', 'storage.rules');
  let pass = false;
  if (existsSync(storagePath)) {
    const s = readFileSync(storagePath, 'utf8');
    pass = /8\s*\*\s*1024\s*\*\s*1024/.test(s) && /image\/\.\*/.test(s) && /allow read, write:\s*if false/.test(s);
  }
  record('R015', 'storage.rules: 8MB + image MIME + catch-all deny', pass, pass ? null : 'storage guards missing');
}
// R016 — notifications server-only
{
  const block = matchBlock('notifications/{uid}/items/{id}');
  const pass = block != null
    && /allow create:\s*if false/.test(block)
    && /\.hasOnly\(\['read'\]\)/.test(block);
  record('R016', 'notifications server-only create + read-flag-only update', pass, pass ? null : 'inbox forgeable');
}
// R017 — private contact exists, owner+admin
{
  const block = matchBlock('private/contact');
  const pass = block != null && /isSelf\(uid\)\s*\|\|\s*isClaimAdmin\(\)/.test(block);
  record('R017', 'private/contact owner+admin only', pass, pass ? null : 'contact exposed');
}
// R018 — mechanics create forbids phone/email
{
  const block = matchBlock('mechanics/{uid}');
  const pass = block != null && /!\('phone' in request\.resource\.data\)/.test(block) && /!\('email' in request\.resource\.data\)/.test(block);
  record('R018', 'mechanics create forbids phone/email on parent', pass, pass ? null : 'contact leak possible');
}
// R019 — rating/comment bounds
{
  const body = updateBody(matchBlock('requests/{id}'));
  const pass = /request\.resource\.data\.rating\s*>=\s*1[\s\S]*?request\.resource\.data\.rating\s*<=\s*5/.test(body)
    && /request\.resource\.data\.comment\.size\(\)\s*<=\s*500/.test(body);
  record('R019', 'rating 1-5 + comment <=500', pass, pass ? null : 'rating bounds missing');
}
// R020 — accept requires approval
{
  const body = updateBody(matchBlock('requests/{id}'));
  const pass = /isMechanicApproved\(\)/.test(body);
  record('R020', 'accept/decline require isMechanicApproved()', pass, pass ? null : 'unapproved accept possible');
}
// R021–R029 spot pins (1B regression tripwires)
{
  const srcAll = src;
  const pins = [
    ['R021', 'amountCents 0..1000000 completed-only', /amountCents\s*>=\s*0[\s\S]*?amountCents\s*<=\s*1000000/],
    ['R022', 'etaMin 1..180', /etaMin\s*>=\s*1[\s\S]*?etaMin\s*<=\s*180/],
    ['R023', 'declinedBy append-only cap 50', /declinedBy\.size\(\)\s*<=\s*50/],
    ['R024', 'releasedAt timestamp', /releasedAt\s+is\s+timestamp/],
    ['R025', 'vehicles ownerId frozen', /request\.resource\.data\.ownerId\s*==\s*resource\.data\.ownerId/],
    ['R026', 'request create mechanicId null', /request\.resource\.data\.mechanicId\s*==\s*null/],
    ['R027', 'terminal states frozen', /!\s*\(resource\.data\.status in \['completed',\s*'cancelled'\]\)/],
    ['R028', 'users create key allowlist', /request\.resource\.data\.keys\(\)\.hasOnly\(\['uid',\s*'role',\s*'displayName',\s*'email',\s*'phone',\s*'createdAt',\s*'updatedAt'\]\)/],
    ['R029', 'customer live-cancel set', /resource\.data\.status\s+in\s+\[\s*'requested'\s*,\s*'accepted'\s*,\s*'on-the-way'\s*,\s*'arrived'\s*\]/],
  ];
  for (const [id, label, re] of pins) record(id, label, re.test(srcAll), null);
}
// R030 — mechanics read is private (M3 privacy)
{
  const block = matchBlock('mechanics/{uid}');
  const parentOnly = block ? block.split('match /private/contact')[0] : '';
  const noPublic = !/allow read:\s*if true\s*;/.test(parentOnly);
  const gated = /isSelf\(uid\)\s*\|\|\s*isClaimAdmin\(\)/.test(parentOnly);
  record('R030', 'mechanics parent read is owner/admin-only (never public)', noPublic && gated, `public=${!noPublic} gated=${gated}`);
}
// R031 — publicMechanics block: public read, claim-gated shape-checked writes
{
  const block = matchBlock('publicMechanics/{uid}');
  const pass = block != null
    && /allow read:\s*if true\s*;/.test(block)
    && /allow create, update:\s*if isClaimAdmin\(\)/.test(block)
    && /!\('currentLat' in request\.resource\.data\)/.test(block)
    && /!\('garageAddress' in request\.resource\.data\)/.test(block);
  record('R031', 'publicMechanics: public read + claim-gated writes, no private fields', pass, pass ? null : 'projection block wrong');
}
// R034 — offers: server-only writes (recursive match covers collection-group)
{
  const block = matchBlock('{path=**}/offers/{offerId}');
  const pass = block != null
    && /allow create, update, delete:\s*if false/.test(block);
  record('R034', 'offers: client create/update/delete denied (server-only)',
    pass,
    pass ? null : 'offers writable by clients');
}
// R035 — offers reads scoped (no public pool snooping)
{
  const block = matchBlock('{path=**}/offers/{offerId}');
  const pass = block != null
    && !/allow read:\s*if true\s*;/.test(block)
    && /resource\.data\.mechanicId\s*==\s*request\.auth\.uid/.test(block)
    && /resource\.data\.customerId\s*==\s*request\.auth\.uid/.test(block)
    && /isClaimAdmin\(\)/.test(block);
  record('R035', 'offers read: addressed mechanic + owning customer + admin only',
    pass,
    pass ? null : 'offer reads too broad');
}
// R036 — dispatch core constants/pins live in functions/src/dispatch.ts
{
  const dispatchPath = join(__dirname, '..', 'functions', 'src', 'dispatch.ts');
  let pass = false;
  let detail = 'functions/src/dispatch.ts missing';
  if (existsSync(dispatchPath)) {
    const d = readFileSync(dispatchPath, 'utf8');
    const window = /OFFER_WINDOW_MS\s*=\s*120_000/.test(d);
    const batch = /OFFER_BATCH_SIZE\s*=\s*\d+/.test(d) && /MAX_REMATCH_ROUNDS\s*=\s*\d+/.test(d);
    const fns = /acceptOfferTx/.test(d) && /declineOfferTx/.test(d) && /rematchRequest/.test(d) && /createOfferBatch/.test(d);
    const noML = !/tensorflow|sklearn|FastAPI|model\.predict/i.test(d);
    pass = window && batch && fns && noML;
    detail = `window=${window} batch=${batch} fns=${fns} noML=${noML}`;
  }
  record('R036', 'dispatch core: 120s window, bounded batches, tx fns, no ML',
    pass,
    pass ? null : detail);
}
// R033 — offer window is timestamp-typed; custom-claim reads are in-guarded
{
  const block = matchBlock('requests/{id}');
  const tsType = block != null && /request\.resource\.data\.offerExpiresAt\s+is\s+timestamp/.test(block);
  const roleGuard = /\('role' in request\.auth\.token\)/.test(src);
  const adminGuard = /\('admin' in request\.auth\.token\)/.test(src);
  record('R033', 'offerExpiresAt is timestamp + claim reads in-guarded',
    tsType && roleGuard && adminGuard,
    `tsType=${tsType} roleGuard=${roleGuard} adminGuard=${adminGuard}`);
}
// R032 — claim gates admin paths broadly
{
  const uses = (src.match(/isClaimAdmin\(\)/g) || []).length;
  record('R032', 'isClaimAdmin() gates admin paths (>=10 sites)', uses >= 10, `used ${uses}x`);
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  process.stdout.write(`${r.pass ? 'OK  ' : 'FAIL'}  ${r.id}  ${r.label}`);
  if (!r.pass && r.detail) process.stdout.write(`  -- ${r.detail}`);
  process.stdout.write('\n');
}
process.stdout.write(`\n${results.length - failed}/${results.length} checks passed.\n`);
process.exit(failed === 0 ? 0 : 1);
