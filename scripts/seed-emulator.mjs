/**
 * Seed the LOCAL Firebase Emulator Suite with synthetic RoadAssist fixtures
 * for browser testing. NEVER points at a real project: it requires the
 * emulator env vars to be set and refuses to run without them.
 *
 * Usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   SEED_PROJECT_ID=roadassist-9c223 \
 *   node scripts/seed-emulator.mjs
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('REFUSING to run: set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST. This script only seeds the local emulator.');
  process.exit(2);
}
const PROJECT_ID = process.env.SEED_PROJECT_ID ?? 'roadassist-9c223';

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = 'Test!2345';
const PEOPLE = [
  { uid: 'emul-cust', email: 'cust@roadassist.test', displayName: 'Casey Customer', role: 'customer' },
  { uid: 'emul-mech', email: 'mech@roadassist.test', displayName: 'Morgan Motors', role: 'mechanic' },
  { uid: 'emul-admin', email: 'admin@roadassist.test', displayName: 'Ada Operations', role: 'admin' },
];

async function upsertUser(p) {
  try {
    await auth.deleteUser(p.uid);
  } catch { /* not present yet */ }
  await auth.createUser({ uid: p.uid, email: p.email, password: PASSWORD, displayName: p.displayName, emailVerified: true });
  await db.collection('users').doc(p.uid).set({
    uid: p.uid, role: p.role, displayName: p.displayName, email: p.email,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  if (p.role === 'admin') await auth.setCustomUserClaims(p.uid, { admin: true });
}

const vehicle = (id, plate, isDefault) => ({
  ownerId: 'emul-cust', make: 'Maruti', model: 'Swift', year: 2021, plate, type: 'car',
  isDefault, createdAt: FieldValue.serverTimestamp(),
});

const openRequest = {
  id: 'emul-req-open', customerId: 'emul-cust', vehicleId: 'emul-veh-1',
  problemText: 'Battery dead near Indiranagar metro — engine cranks but will not start',
  problemCategory: 'battery', customerLat: 12.9716, customerLng: 77.5946,
  status: 'requested', mechanicId: null,
  offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
};
const mechOffer = (reqId) => ({
  requestId: reqId, customerId: 'emul-cust', mechanicId: 'emul-mech', mechanicName: 'Morgan Motors',
  createdAt: FieldValue.serverTimestamp(),
  expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
  status: 'pending', round: 0,
});
const completedRequest = {
  id: 'emul-req-done', customerId: 'emul-cust', vehicleId: 'emul-veh-1',
  problemText: 'Flat tyre replaced at the roadside on Outer Ring Road',
  problemCategory: 'flat-tyre', customerLat: 12.9352, customerLng: 77.6245,
  status: 'completed', mechanicId: 'emul-mech', mechanicName: 'Morgan Motors',
  amountCents: 49900, durationMin: 35, rating: 5,
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
};
const cancelledRequest = {
  id: 'emul-req-cancel', customerId: 'emul-cust', vehicleId: 'emul-veh-2',
  problemText: 'Towing needed — cancelled before dispatch', problemCategory: 'tow',
  customerLat: 12.98, customerLng: 77.6, status: 'cancelled', cancelledBy: 'customer',
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
};

const notification = (id, title, body, requestId, path, read) => ({
  id, type: 'seed', title, body, requestId, path, read,
  createdAt: Date.now() - 60_000,
});

async function main() {
  for (const p of PEOPLE) await upsertUser(p);
  console.log(`seeded auth+users: ${PEOPLE.map((p) => p.email).join(', ')}`);

  // Optional owner/admin account, provided at RUNTIME via env so personal
  // data never lands in the repo. Password defaults to the demo standard —
  // never pass a real personal password here.
  const ownerEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (ownerEmail) {
    await upsertUser({ uid: 'emul-owner', email: ownerEmail, displayName: 'Project Owner', role: 'admin' });
    await auth.setCustomUserClaims('emul-owner', { admin: true });
    console.log(`seeded OWNER admin account: ${ownerEmail} (password: SEED_ADMIN_PASSWORD or the demo standard)`);
  }

  await db.collection('mechanics').doc('emul-mech').set({
    uid: 'emul-mech', name: 'Morgan Motors', approved: true, verificationStatus: 'approved',
    specialties: ['battery', 'tow', 'general'], vehicleTypes: ['car'],
    experienceYears: 6, serviceRadiusKm: 25, isAvailable: true,
    garageName: 'Morgan Auto Care', garageAddress: 'PRIVATE 12 Test Layout',
    baseLat: 12.9716, baseLng: 77.5946, rating: 4.8, reviewCount: 12,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection('publicMechanics').doc('emul-mech').set({
    name: 'Morgan Motors', approved: true, isAvailable: true,
    specialties: ['battery', 'tow', 'general'], vehicleTypes: ['car'],
    experienceYears: 6, serviceRadiusKm: 25, rating: 4.8, reviewCount: 12,
    garageName: 'Morgan Auto Care', baseLat: 12.9716, baseLng: 77.5946,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('vehicles').doc('emul-veh-1').set(vehicle('emul-veh-1', 'KA01EM0001', true));
  await db.collection('vehicles').doc('emul-veh-2').set(vehicle('emul-veh-2', 'KA01EM0002', false));

  await db.collection('requests').doc('emul-req-open').set(openRequest);
  await db.collection('requests').doc('emul-req-open').collection('offers').doc('emul-mech').set(mechOffer('emul-req-open'));
  await db.collection('requests').doc('emul-req-done').set(completedRequest);
  await db.collection('requests').doc('emul-req-cancel').set(cancelledRequest);

  const notice = (n) => db.collection('notifications').doc('emul-cust').collection('items').doc(n.id).set(n);
  await notice(notification('emul-n1', 'Mechanic assigned', 'Morgan Motors accepted your battery request.', 'emul-req-done', `/track/emul-req-done`, true));
  await notice(notification('emul-n2', 'Offer received', 'A nearby mechanic can take your request.', 'emul-req-open', '/track/emul-req-open', false));
  await db.collection('notifications').doc('emul-mech').collection('items').doc('emul-n3').set({
    id: 'emul-n3', type: 'offer', title: 'New offer nearby', body: 'Battery request within your radius.',
    requestId: 'emul-req-open', path: '/m/job/emul-req-open', read: false, createdAt: Date.now() - 30_000,
  });

  console.log('seed complete: 2 vehicles, 3 requests (open+offer / completed / cancelled), notifications.');
}

main()
  .then(async () => {
    const { getApps } = await import('firebase-admin/app');
    await Promise.all(getApps().map((a) => a.delete().catch(() => {})));
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
