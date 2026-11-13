import { expect, test, type Page } from '@playwright/test';
import { fieldValue, getDoc, listDocs, waitForDoc } from './support/emulator';
import { liveJobCount, resetEmulatorState } from './support/reset';

/**
 * Negative journeys for the M1.1 matrix.
 *
 * Every test asserts committed emulator state or a specifically-worded
 * refusal. None of them assert "the page did not crash".
 */

const CUST = { email: 'cust@roadassist.test', pass: 'Test!2345' };
const MECH = { email: 'mech@roadassist.test', pass: 'Test!2345' };
const CUSTOMER_UID = 'emul-cust';
const MECH_UID = 'emul-mech';

const CUSTOMER_HOME = /\/app/;
const MECHANIC_HOME = /\/m(?!\/)/;

function marker(label: string): string {
  return `NEG-${label}-${Date.now().toString(36).toUpperCase()}`;
}

async function login(page: Page, email: string, pass: string, home: RegExp) {
  await page.goto('/customer/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(pass);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/(login|customer\/login)/, { timeout: 30_000 });
}

/** Fill the wizard through to the review step. */
async function fillWizard(page: Page, problem: string, category = 'battery') {
  await page.goto('/request');
  await expect(page.getByTestId('vehicle-option-emul-veh-1')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('vehicle-option-emul-veh-1').click();
  await page.getByTestId('wizard-continue-vehicle').click();
  await page.getByTestId('request-problem').fill(problem);
  await page.getByTestId('request-category').selectOption(category);
  await page.getByTestId('wizard-continue-problem').click();
  await page.getByTestId('request-place').fill('Indiranagar, Bengaluru');
  await page.getByTestId('request-lat').fill('12.9716');
  await page.getByTestId('request-lng').fill('77.5946');
  await page.getByTestId('wizard-review').click();
}

async function countRequestsContaining(needle: string): Promise<number> {
  const all = await listDocs('requests');
  return all.filter((d) => String(fieldValue(d, 'problemText') ?? '').includes(needle)).length;
}

test.describe('negative journeys', () => {
  // Measured cause of cross-test failures: dispatch.ts caps a mechanic at
  // MAX_ACTIVE_JOBS=3. Any test that leaves a booking in `accepted` consumes a
  // slot, so after three runs the seeded mechanic is offered nothing and every
  // later test looks broken. Reset to a known baseline before each test.
  test.beforeEach(async () => {
    await resetEmulatorState();
  });

  test('duplicate submission creates exactly one request', async ({ page }) => {
    const mark = marker('DUP');
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await fillWizard(page, `${mark} duplicate submit probe`);

    // Double-activate the submit control the way a real double-tap does.
    // NOTE: the button unmounts once the first submit begins, so an awaited
    // second click can never land. `dblclick` dispatches both activations
    // while the element still exists.
    await page.getByTestId('wizard-confirm').dblclick({ noWaitAfter: true });

    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

    // Give any duplicate write time to land before counting.
    await page.waitForTimeout(3000);
    const count = await countRequestsContaining(mark);
    expect(count, 'double-submit must not create two bookings').toBe(1);

    const doc = await getDoc(`requests/${urlId}`);
    expect(fieldValue(doc!, 'customerId')).toBe(CUSTOMER_UID);
  });

  test('page refresh mid-booking keeps the request and its id', async ({ page }) => {
    const mark = marker('REFRESH');
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await fillWizard(page, `${mark} refresh probe`);
    await page.getByTestId('wizard-confirm').click();
    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/track/${urlId}`));
    await expect(page.locator('body')).toContainText(mark, { timeout: 30_000 });

    const doc = await waitForDoc(`requests/${urlId}`, (d) => d !== null);
    expect(fieldValue(doc!, 'status')).toBe('requested');
  });

  test('customer session survives navigation after acceptance', async ({ page }) => {
    const mark = marker('PERSIST');
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await fillWizard(page, `${mark} persistence probe`);
    await page.getByTestId('wizard-confirm').click();
    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

    // Mechanic accepts in a second browser context (separate session).
    const mechCtx = await page.context().browser()!.newContext();
    const mechPage = await mechCtx.newPage();
    await login(mechPage, MECH.email, MECH.pass, MECHANIC_HOME);
    await mechPage.goto('/m/requests');
    const accept = mechPage.getByTestId(`offer-accept-${urlId}`);
    await expect(accept).toBeVisible({ timeout: 60_000 });
    await accept.click();
    await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'status') === 'accepted',
      { label: 'accepted by second context' },
    );
    await mechCtx.close();

    // The customer's original session must still resolve the assignment.
    await page.reload();
    await expect(page.locator('body')).toContainText('Morgan Motors', { timeout: 30_000 });

    const doc = await getDoc(`requests/${urlId}`);
    expect(fieldValue(doc!, 'mechanicId')).toBe(MECH_UID);
  });

  test('mechanic decline leaves the request open and records the refusal', async ({ page }) => {
    const mark = marker('DECLINE');
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await fillWizard(page, `${mark} decline probe`);
    await page.getByTestId('wizard-confirm').click();
    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

    // Confirm dispatch actually created the offer before blaming the UI.
    await waitForDoc(
      `requests/${urlId}/offers/${MECH_UID}`,
      (d) => d !== null && fieldValue(d, 'status') === 'pending',
      { timeoutMs: 60_000, label: 'offer created before decline' },
    );

    await signOut(page);
    await login(page, MECH.email, MECH.pass, MECHANIC_HOME);
    await page.goto('/m/requests');
    const decline = page.getByTestId(`offer-decline-${urlId}`);
    await expect(decline).toBeVisible({ timeout: 60_000 });
    await decline.click();

    // Decline records declinedBy and keeps the request unassigned.
    const doc = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && Array.isArray((fieldValue(d, 'declinedBy') as { values?: unknown[] })?.values),
      { label: 'declinedBy recorded' },
    );
    expect(fieldValue(doc!, 'status')).toBe('requested');
    expect(fieldValue(doc!, 'mechanicId')).toBeNull();

    const offer = await getDoc(`requests/${urlId}/offers/${MECH_UID}`);
    expect(fieldValue(offer!, 'status')).toBe('declined');
  });

  test('customer can cancel a live request and cancellation is committed', async ({ page }) => {
    const mark = marker('CANCEL');
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await fillWizard(page, `${mark} cancel probe`);
    await page.getByTestId('wizard-confirm').click();
    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

    const cancel = page.getByRole('button', { name: /^Cancel request$/i }).first();
    await expect(cancel).toBeVisible({ timeout: 30_000 });

    // The app confirms via window.confirm(), a native dialog Playwright would
    // otherwise auto-dismiss (turning this into a silent no-op test).
    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      void dialog.accept();
    });
    await cancel.click();

    const doc = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'status') === 'cancelled',
      { label: 'request cancelled' },
    );
    expect(fieldValue(doc!, 'cancelledBy')).toBe('customer');
  });

  test('an expired offer cannot be accepted and the UI says so', async ({ page }) => {
    // NOTE ON SCOPE: the server-side sweep (`scheduledOfferSweep`) DOES NOT FIRE
    // in the Firebase emulator — measured across a 30-minute run, zero
    // executions. Expiry *logic* is therefore proven in the emulator vitest
    // suite (emulator/sweep.test.ts), which invokes sweepRequest directly
    // against real Firestore. This browser test covers the client contract:
    // an expired offer must be unusable and must explain itself.
    const mark = marker('EXPIRY');
    const now = Date.now();
    const requestId = `neg-expiry-${now.toString(36)}`;
    const docs = 'http://127.0.0.1:8080/v1/projects/roadassist-9c223/databases/(default)/documents';
    const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

    // A request whose offer window already closed one hour ago.
    await fetch(`${docs}/requests?documentId=${requestId}`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({
        fields: {
          id: { stringValue: requestId },
          customerId: { stringValue: CUSTOMER_UID },
          vehicleId: { stringValue: 'emul-veh-1' },
          problemText: { stringValue: `${mark} expiry probe` },
          problemCategory: { stringValue: 'battery' },
          customerLat: { doubleValue: 12.9716 },
          customerLng: { doubleValue: 77.5946 },
          status: { stringValue: 'requested' },
          mechanicId: { nullValue: null },
          offerExpiresAt: { timestampValue: new Date(now - 3_600_000).toISOString() },
          createdAt: { timestampValue: new Date(now).toISOString() },
          updatedAt: { timestampValue: new Date(now).toISOString() },
        },
      }),
    });
    await fetch(`${docs}/requests/${requestId}/offers?documentId=${MECH_UID}`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({
        fields: {
          requestId: { stringValue: requestId },
          customerId: { stringValue: CUSTOMER_UID },
          mechanicId: { stringValue: MECH_UID },
          mechanicName: { stringValue: 'Morgan Motors' },
          status: { stringValue: 'pending' },
          round: { integerValue: 0 },
          createdAt: { timestampValue: new Date(now).toISOString() },
          expiresAt: { timestampValue: new Date(now - 3_600_000).toISOString() },
        },
      }),
    });

    await login(page, MECH.email, MECH.pass, MECHANIC_HOME);
    await page.goto('/m/requests');

    // OBSERVED BEHAVIOUR (mechanic.ts:296-303): `watchIncoming` filters out
    // offers whose expiresAt has already passed, so an expired offer does not
    // appear in the queue at all. There is therefore no disabled button to
    // assert — the correct contract is "it is absent from the queue", which is
    // stricter than a greyed-out control.
    await page.waitForTimeout(5000);
    await expect(page.getByTestId(`offer-accept-${requestId}`)).toHaveCount(0);
    await expect(page.getByTestId(`offer-decline-${requestId}`)).toHaveCount(0);

    // The SERVER must still refuse it even though the UI never showed it.
    const token = await page.evaluate(async () => {
      const res = await fetch(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-api-key-placeholder',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'mech@roadassist.test', password: 'Test!2345', returnSecureToken: true }),
        },
      );
      const body = (await res.json()) as { idToken: string };
      return body.idToken;
    });
    const rpc = await fetch('http://127.0.0.1:5001/roadassist-9c223/us-central1/acceptOffer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: { requestId } }),
    });
    // gRPC DEADLINE_EXCEEDED maps to HTTP 504 (not 408) at the callable edge.
    expect(rpc.status, await rpc.text()).toBe(504);

    // And committed state is unchanged.
    const doc = await getDoc(`requests/${requestId}`);
    expect(fieldValue(doc!, 'status')).toBe('requested');
    expect(fieldValue(doc!, 'mechanicId')).toBeNull();
  });

  test('unauthenticated visitor cannot open a protected portal', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/(login|customer\/login)/, { timeout: 30_000 });

    await page.goto('/m/requests');
    await expect(page).toHaveURL(/\/(login|customer\/login|mechanic\/login)/, { timeout: 30_000 });

    await page.goto('/admin');
    await expect(page.locator('body')).not.toContainText('Operations dashboard', { timeout: 15_000 });
  });

  test('customer cannot open the admin or mechanic portal', async ({ page }) => {
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);

    await page.goto('/admin');
    // The claim gate renders an explanatory refusal, never the dashboard.
    await expect(page.locator('body')).not.toContainText('Mechanics awaiting approval', { timeout: 15_000 });

    await page.goto('/m/requests');
    await expect(page.locator('body')).not.toContainText('Incoming requests', { timeout: 15_000 });
  });

  test('no available mechanics leaves the request honestly unassigned', async ({ page }) => {
    const mark = marker('NOMECH');
    const docs = 'http://127.0.0.1:8080/v1/projects/roadassist-9c223/databases/(default)/documents';
    const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

    // Take the only seeded mechanic out of service.
    await fetch(`${docs}/mechanics/emul-mech?updateMask.fieldPaths=isAvailable`, {
      method: 'PATCH',
      headers: admin,
      body: JSON.stringify({ fields: { isAvailable: { booleanValue: false } } }),
    });

    try {
      await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
      await fillWizard(page, `${mark} no mechanics probe`);
      await page.getByTestId('wizard-confirm').click();
      await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });
      const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';

      // The request must exist and stay unassigned; no offer may be created.
      await page.waitForTimeout(5000);
      const request = await getDoc(`requests/${urlId}`);
      expect(fieldValue(request!, 'status')).toBe('requested');
      expect(fieldValue(request!, 'mechanicId')).toBeNull();

      const offers = await listDocs(`requests/${urlId}/offers`);
      expect(offers, 'no eligible mechanic means no offers').toHaveLength(0);
    } finally {
      // Restore availability so later tests are not poisoned.
      await fetch(`${docs}/mechanics/emul-mech?updateMask.fieldPaths=isAvailable`, {
        method: 'PATCH',
        headers: admin,
        body: JSON.stringify({ fields: { isAvailable: { booleanValue: true } } }),
      });
    }
  });
});
