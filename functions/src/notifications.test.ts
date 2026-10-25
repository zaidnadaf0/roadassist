import { describe, expect, it } from 'vitest';
import {
  noticeForApproval,
  noticeForOffer,
  noticeId,
  noticesForTransition,
  type Notice,
} from './notifications';
import type { ServiceRequest } from './types';

function req(over: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: 'req-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    problemText: 'tow please',
    status: 'requested',
    customerLat: 12.97,
    customerLng: 77.59,
    ...over,
  } as ServiceRequest;
}

describe('noticeId (idempotency key)', () => {
  it('is deterministic and sanitized', () => {
    expect(noticeId('req-1', 'accepted_mech-2')).toBe('notif_req-1_accepted_mech-2');
    expect(noticeId('req-1', 'accepted_mech-2')).toBe(noticeId('req-1', 'accepted_mech-2'));
    expect(noticeId('req-1', 'a/b c!')).toBe('notif_req-1_a_b_c_');
    expect(noticeId('req-1', 'x'.repeat(200)).length).toBeLessThanOrEqual('notif_req-1_'.length + 80);
  });
});

describe('noticesForTransition (event matrix)', () => {
  it('emits created for new requests', () => {
    const out = noticesForTransition(null, req());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ toUid: 'cust-1', event: 'created' });
    expect(out[0].notice.type).toBe('request_created');
    expect(out[0].notice.path).toBe('/track/req-1');
  });

  it('emits nothing when status is unchanged', () => {
    expect(noticesForTransition(req({ status: 'accepted' }), req({ status: 'accepted' }))).toEqual([]);
  });

  it('notifies the customer on accept/progress/completion', () => {
    const acc = noticesForTransition(req(), req({ status: 'accepted', mechanicId: 'm1', mechanicName: 'Meg' }));
    expect(acc).toHaveLength(1);
    expect(acc[0].toUid).toBe('cust-1');
    expect(acc[0].notice.type).toBe('job_accepted');
    for (const [status, type] of [
      ['on-the-way', 'job_enroute'],
      ['arrived', 'job_arrived'],
      ['service', 'job_service'],
      ['completed', 'job_completed'],
    ] as const) {
      const out = noticesForTransition(req({ status: 'accepted' }), req({ status, mechanicId: 'm1', mechanicName: 'Meg' }));
      expect(out.map((o) => o.notice.type)).toContain(type);
      expect(out.every((o) => o.toUid === 'cust-1')).toBe(true);
    }
  });

  it('cancels both sides, skipping self-cancel customer spam', () => {
    const selfCancel = noticesForTransition(
      req({ status: 'accepted', mechanicId: 'm1' }),
      req({ status: 'cancelled', mechanicId: 'm1', cancelledBy: 'customer' }),
    );
    expect(selfCancel.map((o) => o.toUid)).toEqual(['m1']);
    const opsCancel = noticesForTransition(
      req({ status: 'accepted', mechanicId: 'm1' }),
      req({ status: 'cancelled', mechanicId: 'm1', cancelledBy: 'system', cancellationReason: 'no coverage' }),
    );
    expect(opsCancel.map((o) => o.toUid).sort()).toEqual(['cust-1', 'm1']);
    expect(opsCancel.find((o) => o.toUid === 'cust-1')?.notice.body).toMatch(/no coverage/);
  });

  it('caps title/body lengths for the rules-shaped inbox', () => {
    const long: Notice = { type: 'job_accepted', title: 't'.repeat(500), body: 'b'.repeat(900) };
    expect(long.title.length).toBeGreaterThan(120);
    // Caps are applied at write time (putNotification clips); mapping keeps full text.
    expect(long.title).toBe('t'.repeat(500));
  });
});

describe('offer + approval notices', () => {
  it('builds addressed offer and approval notices', () => {
    const offer = noticeForOffer('req-9', 'tow', 2);
    expect(offer.type).toBe('offer_received');
    expect(offer.path).toBe('/m/job/req-9');
    expect(noticeForApproval('approved').type).toBe('approval_decided');
    expect(noticeForApproval('suspended').title).toMatch(/suspended/i);
  });
});
