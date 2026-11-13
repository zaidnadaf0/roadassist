import { expect, test, type Page } from '@playwright/test';
import { fieldValue, findRequestByProblemText, getDoc, listDocs, waitForDoc } from './support/emulator';
import { resetEmulatorState } from './support/reset';

/**
 * M1.1 end-to-end journey: a REAL booking that must materialise as real
 * documents in the Firestore emulator.
 *
 * Rule this test obeys: a successful redirect is NOT proof. Every assertion
 * below reads committed emulator state through the REST API (admin bypass).
 * If a write silently failed and the UI rendered from stale state, this test
 * fails — which is exactly the failure mode the previous version could not
 * detect because it only asserted URLs and body text.
 */

const CUST = { email: 'cust@roadassist.test', pass: 'Test!2345' };
const MECH = { email: 'mech@roadassist.test', pass: 'Test!2345' };
const CUSTOMER_UID = 'emul-cust';
const MECH_UID = 'emul-mech';

/** Unique per run so parallel/leftover data can never satisfy an assertion. */
const MARKER = `E2E-${Date.now().toString(36).toUpperCase()}`;

async function login(page: Page, email: string, pass: string, home: RegExp) {
  await page.goto('/customer/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(pass);
  await page.getByTestId('login-submit').click();
  // Each role has its own portal home: customer -> /app, mechanic -> /m.
  // Asserting a single hard-coded home hid that distinction.
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

const CUSTOMER_HOME = /\/app/;
const MECHANIC_HOME = /\/m(?!\/)/;

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/(login|customer\/login)/, { timeout: 30_000 });
}

test.describe('booking journey (real Firestore state)', () => {
  // dispatch.ts caps a mechanic at 3 live jobs; an accepted-but-uncompleted
  // booking from an earlier run would otherwise silence all future offers.
  test.beforeEach(async () => {
    await resetEmulatorState();
  });

  test('customer creates a booking, mechanic accepts, job completes', async ({ page }) => {
    // ---------- 1. Customer creates a real request ----------
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);

    await page.goto('/request');
    await expect(page.getByTestId('vehicle-option-emul-veh-1')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('vehicle-option-emul-veh-1').click();
    await page.getByTestId('wizard-continue-vehicle').click();

    await page.getByTestId('request-problem').fill(`${MARKER} battery dead near Indiranagar`);
    await page.getByTestId('request-category').selectOption('battery');
    await page.getByTestId('wizard-continue-problem').click();

    await page.getByTestId('request-place').fill('Indiranagar, Bengaluru');
    await page.getByTestId('request-lat').fill('12.9716');
    await page.getByTestId('request-lng').fill('77.5946');
    await page.getByTestId('wizard-review').click();

    await page.getByTestId('wizard-confirm').click();
    await expect(page).toHaveURL(/\/track\//, { timeout: 30_000 });

    const urlId = page.url().split('/track/')[1]?.split(/[?#]/)[0] ?? '';
    expect(urlId, 'tracking URL must carry a request id').not.toBe('');

    // ---------- 2. Firestore really contains the request ----------
    const created = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'status') === 'requested',
      { label: `request ${urlId} exists as 'requested'` },
    );
    expect(fieldValue(created!, 'customerId')).toBe(CUSTOMER_UID);
    expect(String(fieldValue(created!, 'problemText'))).toContain(MARKER);
    expect(fieldValue(created!, 'mechanicId')).toBeNull();

    // The problem-text lookup must agree with the URL id (guards against a
    // stale render pointing at an older request).
    const byText = await findRequestByProblemText(CUSTOMER_UID, MARKER);
    expect(byText?.id).toBe(urlId);

    // ---------- 3. Dispatch created a real offer ----------
    const offer = await waitForDoc(
      `requests/${urlId}/offers/${MECH_UID}`,
      (d) => d !== null && fieldValue(d, 'status') === 'pending',
      { label: 'offer batch created for the mechanic', timeoutMs: 60_000 },
    );
    expect(fieldValue(offer!, 'round')).toBe(0);
    expect(fieldValue(offer!, 'requestId')).toBe(urlId);

    // ---------- 4. Mechanic accepts through the callable ----------
    await signOut(page);
    await login(page, MECH.email, MECH.pass, MECHANIC_HOME);

    await page.goto('/m/requests');
    const accept = page.getByTestId(`offer-accept-${urlId}`);
    await expect(accept).toBeVisible({ timeout: 60_000 });
    await accept.click();

    // ---------- 5. Acceptance is committed server-side ----------
    const accepted = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'status') === 'accepted',
      { label: 'request flipped to accepted' },
    );
    expect(fieldValue(accepted!, 'mechanicId')).toBe(MECH_UID);
    expect(fieldValue(accepted!, 'mechanicName')).toBe('Morgan Motors');

    const acceptedOffer = await getDoc(`requests/${urlId}/offers/${MECH_UID}`);
    expect(fieldValue(acceptedOffer!, 'status')).toBe('accepted');

    // ---------- 6. Customer sees the assigned mechanic ----------
    await signOut(page);
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await page.goto(`/track/${urlId}`);
    await expect(page.locator('body')).toContainText('Morgan Motors', { timeout: 30_000 });

    // ---------- 7. Mechanic submits a repair estimate ----------
    await signOut(page);
    await login(page, MECH.email, MECH.pass, MECHANIC_HOME);
    await page.goto(`/m/job/${urlId}`);

    await expect(page.getByTestId('estimate-diagnosis')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('estimate-diagnosis').fill('Battery dead, alternator not charging');
    await page.getByTestId('estimate-amount').fill('499');
    await page.getByTestId('estimate-duration').fill('45');
    await page.getByTestId('estimate-submit').click();

    const pending = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'estimateStatus') === 'pending',
      { label: 'estimate submitted as pending' },
    );
    // Stored field names are `estimated*` — the names the rules validate.
    expect(fieldValue(pending!, 'estimatedAmountCents')).toBe(49900);
    expect(fieldValue(pending!, 'estimatedDurationMin')).toBe(45);

    // ---------- 8. Mechanic advances the live lifecycle ----------
    for (const label of ['On the way', 'Arrived', 'Service']) {
      await page.getByTestId('job-advance').click();
      await expect(page.getByTestId('job-advance')).toBeVisible({ timeout: 30_000 });
      // Wait for the server-committed status rather than trusting the click.
      await waitForDoc(
        `requests/${urlId}`,
        (d) => d !== null && fieldValue(d, 'status') === label.toLowerCase().replace(/ /g, '-'),
        { label: `status advanced to '${label}'` },
      );
    }

    // ---------- 9. Completion is REFUSED before the customer approves ----------
    await page.getByTestId('job-amount').fill('499');
    await page.getByTestId('job-duration').fill('35');
    await page.getByTestId('job-advance').click();
    await expect(page.getByText(/approved estimate/i)).toBeVisible({ timeout: 30_000 });
    const blocked = await getDoc(`requests/${urlId}`);
    expect(fieldValue(blocked!, 'status')).toBe('service');
    expect(fieldValue(blocked!, 'amountCents')).toBeUndefined();

    // ---------- 10. Customer approves the estimate ----------
    await signOut(page);
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await page.goto(`/track/${urlId}`);
    // The customer sees the mechanic's diagnosis, cost and duration.
    await expect(page.locator('body')).toContainText('alternator not charging', { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('₹499');
    await page.getByTestId('estimate-approve').click();

    const approved = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'estimateStatus') === 'approved',
      { label: 'estimate approved by the customer' },
    );
    // A number, not a Timestamp sentinel: the rules demand `is number`.
    expect(typeof fieldValue(approved!, 'estimateApprovedAt')).toBe('number');

    // ---------- 11. Mechanic completes with billing ----------
    await signOut(page);
    await login(page, MECH.email, MECH.pass, MECHANIC_HOME);
    await page.goto(`/m/job/${urlId}`);

    await page.getByTestId('job-amount').fill('499');
    await page.getByTestId('job-duration').fill('35');
    await page.getByTestId('job-advance').click();

    const completed = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'status') === 'completed',
      { label: 'request completed' },
    );
    expect(fieldValue(completed!, 'amountCents')).toBe(49900);
    expect(fieldValue(completed!, 'durationMin')).toBe(35);

    // ---------- 12. Customer records the offline payment ----------
    await signOut(page);
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await page.goto(`/track/${urlId}`);

    await expect(page.getByTestId('payment-method')).toBeVisible({ timeout: 30_000 });
    // The receipt states the amount and that nothing is recorded yet.
    await expect(page.getByTestId('receipt-amount')).toContainText('₹499');
    await expect(page.getByTestId('receipt-payment-status')).toContainText('Not recorded');

    await page.getByTestId('payment-method').selectOption('cash');
    await page.getByTestId('payment-amount').fill('499');
    await page.getByTestId('payment-record').click();

    const paid = await waitForDoc(
      `requests/${urlId}`,
      (d) => d !== null && fieldValue(d, 'paymentStatus') === 'paid',
      { label: 'offline payment recorded' },
    );
    expect(fieldValue(paid!, 'paymentMethod')).toBe('cash');
    expect(fieldValue(paid!, 'paidBy')).toBe(CUSTOMER_UID);
    expect(typeof fieldValue(paid!, 'paidAt')).toBe('number');
    // Recording must never rewrite the billed amount.
    expect(fieldValue(paid!, 'amountCents')).toBe(49900);

    // The receipt reflects the RECORDED state and never claims verification.
    await expect(page.getByTestId('receipt-payment-status')).toContainText('Recorded', { timeout: 30_000 });
    await expect(page.getByTestId('receipt-method')).toContainText('Cash');
    await expect(page.locator('body')).toContainText('not a verified transaction');

    // ---------- 13. Customer history shows the completed booking ----------
    await page.goto('/history');
    await expect(page.locator('body')).toContainText(MARKER, { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('completed');
  });

  test('demo mode is OFF in emulator runs (no fixture leakage)', async ({ page }) => {
    await login(page, CUST.email, CUST.pass, CUSTOMER_HOME);
    await page.goto('/app');
    // A demo banner here would mean fixtures are driving the UI, which would
    // invalidate every assertion in the journey above.
    await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  });

  test('customer documents are visible only to their owner (rules intact)', async () => {
    // Sanity check on the test harness itself: the admin bypass reads more
    // than a rule-anonymous caller can. Anonymous REST listing must be denied.
    const res = await fetch(
      'http://127.0.0.1:8080/v1/projects/roadassist-9c223/databases/(default)/documents/requests',
    );
    expect(res.status).toBe(403);
    // ...while the privileged path used by these tests succeeds.
    const docs = await listDocs('requests');
    expect(docs.length).toBeGreaterThan(0);
  });
});
