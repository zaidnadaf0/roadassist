import { describe, expect, it } from 'vitest';
import { CANCELLABLE_STATUSES, OFFER_WINDOW_MS, buildRequestPayload, buildVehiclePayload } from '@/lib/customer';

const REQUEST_ALLOWLIST = [
  'customerId', 'vehicleId', 'problemText', 'problemCategory', 'customerLat', 'customerLng',
  'status', 'offerExpiresAt', 'mechanicId', 'createdAt', 'updatedAt', 'pickedMechanicId',
];
const VEHICLE_ALLOWLIST = ['ownerId', 'make', 'model', 'year', 'plate', 'type', 'isDefault', 'createdAt'];

describe('customer payload contracts (mirror M3 rules allowlists)', () => {
  it('request payload carries exactly allowlisted keys', () => {
    const p = buildRequestPayload('cust-1', {
      vehicleId: 'veh-1',
      problemText: '  burst tyre on highway ',
      problemCategory: 'flat-tyre',
      customerLat: 12.97,
      customerLng: 77.59,
      pickedMechanicId: 'mech-9',
    });
    for (const k of Object.keys(p)) expect(REQUEST_ALLOWLIST).toContain(k);
    expect(p.customerId).toBe('cust-1');
    expect(p.problemText).toBe('burst tyre on highway');
    expect(p.status).toBe('requested');
    expect(p.mechanicId).toBeNull();
    // Timestamp (not millis): rules compare against request.time.
    const offer = p.offerExpiresAt as { toMillis?: () => number };
    expect(typeof offer?.toMillis).toBe('function');
    const ms = offer.toMillis!();
    expect(ms).toBeGreaterThan(Date.now() + OFFER_WINDOW_MS - 5_000);
    expect(ms).toBeLessThanOrEqual(Date.now() + OFFER_WINDOW_MS + 5_000);
  });

  it('request payload omits unset optionals', () => {
    const p = buildRequestPayload('cust-1', {
      vehicleId: 'veh-1',
      problemText: 'need a jump start please',
      customerLat: 12.97,
      customerLng: 77.59,
    });
    expect(p).not.toHaveProperty('problemCategory');
    expect(p).not.toHaveProperty('pickedMechanicId');
    expect(p).not.toHaveProperty('amountCents');
    expect(p).not.toHaveProperty('rating');
  });

  it('vehicle payload carries exactly allowlisted keys (no updatedAt)', () => {
    const p = buildVehiclePayload('cust-1', { make: ' Maruti ', model: 'Swift', year: 2020, plate: ' KA01AB1234 ', type: 'car' });
    for (const k of Object.keys(p)) expect(VEHICLE_ALLOWLIST).toContain(k);
    expect(p).not.toHaveProperty('updatedAt');
    expect(p.make).toBe('Maruti');
    expect(p.plate).toBe('KA01AB1234');
  });

  it('cancellable set matches the rules live-state matrix', () => {
    expect(CANCELLABLE_STATUSES).toEqual(['requested', 'accepted', 'on-the-way', 'arrived']);
  });
});
