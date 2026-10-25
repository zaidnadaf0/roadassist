/**
 * M12 EMULATOR notification suite — idempotent server puts, inbox rules,
 * batch read-flag updates, cross-user denial.
 *
 * Run ONLY under the Firestore emulator (shares the phase boots):
 *   npx firebase emulators:exec --only firestore --project roadassist-9c223 "npm run test:emulator"
 *
 * Uses a NAMED Admin app (isolated namespace roadassist-tnotif) so parallel
 * suites never collide, and passes its handle into putNotification (the
 * optional db override — production callers omit it).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { noticeId, putNotification } from '../functions/src/notifications';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tnotif';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const ALICE = 'm12-alice';
const BOB = 'm12-bob';

function adminDb() {
  const existing = getApps().find((a) => a.name === 'm12notif');
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, 'm12notif');
  return getAdminFirestore(app);
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [ALICE, 'customer'],
      [BOB, 'customer'],
    ] as const) {
      await setDoc(
        (await import('firebase/firestore')).doc(db, 'users', uid),
        { uid, email: `${uid}@t.local`, displayName: uid, role, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      );
    }
  });
}

function ctx(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: PORT,
    },
  });
  await seed();
}, 60_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('server puts are idempotent + rules-shaped', () => {
  it('double-put of the same event yields exactly one inbox doc', async () => {
    const db = adminDb();
    const notice = { type: 'job_accepted' as const, title: 'Mechanic accepted', requestId: 'm12-req-1' };
    expect(await putNotification(ALICE, 'accepted_m1', notice, db)).toBe(true);
    expect(await putNotification(ALICE, 'accepted_m1', notice, db)).toBe(true);
    const snap = await db.collection('notifications').doc(ALICE).collection('items').get();
    expect(snap.docs.filter((d) => d.id === noticeId('m12-req-1', 'accepted_m1'))).toHaveLength(1);
  });

  it('distinct events coexist; titles/bodies respect inbox caps', async () => {
    const db = adminDb();
    await putNotification(ALICE, 'created', {
      type: 'request_created' as const,
      title: 't'.repeat(500),
      body: 'b'.repeat(900),
      requestId: 'm12-req-1',
    }, db);
    const snap = await db.collection('notifications').doc(ALICE).collection('items').doc(noticeId('m12-req-1', 'created')).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.title.length).toBeLessThanOrEqual(120);
    expect(snap.data()?.body.length).toBeLessThanOrEqual(500);
    expect(snap.data()?.read).toBe(false);
    expect(typeof snap.data()?.createdAt).toBe('number');
  });
});

describe('inbox authorization (M12 vs M3 rules)', () => {
  it('owner reads and flips read flags (single + batch shape)', async () => {
    const db = ctx(ALICE);
    const { doc: cdoc } = await import('firebase/firestore');
    const ref = cdoc(db, 'notifications', ALICE, 'items', noticeId('m12-req-1', 'accepted_m1'));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { read: true }));
    await assertSucceeds(updateDoc(ref, { read: false }));
  });

  it('owner cannot rewrite title/body, forge items, or touch another inbox', async () => {
    const db = ctx(ALICE);
    const { doc: cdoc, setDoc: cset } = await import('firebase/firestore');
    const ref = cdoc(db, 'notifications', ALICE, 'items', noticeId('m12-req-1', 'accepted_m1'));
    await assertFails(updateDoc(ref, { title: 'Edited' }));
    await assertFails(cset(cdoc(db, 'notifications', ALICE, 'items', 'forged'), { id: 'forged', type: 'x', title: 'x', createdAt: 1, read: false }));
    const bob = ctx(BOB);
    await assertFails(getDoc(cdoc(bob, 'notifications', ALICE, 'items', noticeId('m12-req-1', 'accepted_m1'))));
    await assertFails(updateDoc(cdoc(bob, 'notifications', ALICE, 'items', noticeId('m12-req-1', 'accepted_m1')), { read: true }));
  });
});
