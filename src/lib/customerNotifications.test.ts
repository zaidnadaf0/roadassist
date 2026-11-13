import { describe, expect, it, vi } from 'vitest';

// Never touch a real backend from unit tests: force the db handle to null
// (vitest loads .env.local, which would otherwise make firebaseConfigured
// true and fire real denied writes at production).
vi.mock('@/lib/firebase', () => ({
  firebaseDb: () => null,
  firebaseAuth: () => null,
  firebaseFunctions: () => null,
  firebaseConfigured: false,
}));

import { countUnread, isInternalNotificationPath, markAllNotificationsRead, nextDefaultAfterDelete, notificationHref } from '@/lib/customer';
import { badgeLabel } from '@/lib/useUnreadCount';
import type { AppNotification } from '@/lib/customer';

function item(id: string, read: boolean): AppNotification {
  return { id, type: 'job_accepted', title: 't', createdAt: 1, read };
}

describe('countUnread', () => {
  it('counts only unread items', () => {
    expect(countUnread([item('a', false), item('b', true), item('c', false)])).toBe(2);
    expect(countUnread([])).toBe(0);
    expect(countUnread([item('a', true)])).toBe(0);
  });
});

describe('markAllNotificationsRead (unconfigured backend)', () => {
  it('caps at 50 writes and reports honestly with no backend', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const res = await markAllNotificationsRead('ghost-uid', ids);
    // No backend configured in unit context → every write fails, none hidden.
    expect(res.marked + res.failed).toBe(50);
  });
});

describe('isInternalNotificationPath', () => {
  it('accepts plain internal SPA routes for the owning portal', () => {
    expect(isInternalNotificationPath('/track/RA-1', 'customer')).toBe(true);
    expect(isInternalNotificationPath('/history/RA-1', 'customer')).toBe(true);
    expect(isInternalNotificationPath('/m/job/RA-1', 'mechanic')).toBe(true);
    expect(isInternalNotificationPath('/m/requests', 'mechanic')).toBe(true);
    expect(isInternalNotificationPath('/m', 'mechanic')).toBe(true);
    expect(isInternalNotificationPath('/admin/requests/RA-1', 'admin')).toBe(true);
    expect(isInternalNotificationPath('/admin', 'admin')).toBe(true);
  });

  it('rejects cross-portal and unregistered routes', () => {
    // The dead legacy producer path must not route mechanics anywhere.
    expect(isInternalNotificationPath('/mechanic/requests', 'mechanic')).toBe(false);
    expect(isInternalNotificationPath('/m/job/RA-1', 'customer')).toBe(false);
    expect(isInternalNotificationPath('/track/RA-1', 'admin')).toBe(false);
    expect(isInternalNotificationPath('/app', 'mechanic')).toBe(false);
  });

  it('rejects external, protocol-relative, traversal, and malformed values', () => {
    expect(isInternalNotificationPath('https://evil.example/grab', 'customer')).toBe(false);
    expect(isInternalNotificationPath('//evil.example', 'customer')).toBe(false);
    expect(isInternalNotificationPath('javascript:alert(1)', 'customer')).toBe(false);
    expect(isInternalNotificationPath('/track/../../admin', 'customer')).toBe(false);
    expect(isInternalNotificationPath('/track/x?next=\\evil', 'customer')).toBe(false);
    expect(isInternalNotificationPath('', 'customer')).toBe(false);
    expect(isInternalNotificationPath(null, 'customer')).toBe(false);
    expect(isInternalNotificationPath(42, 'customer')).toBe(false);
    expect(isInternalNotificationPath(`/${'a'.repeat(201)}`, 'customer')).toBe(false);
  });
});

describe('notificationHref', () => {
  const base = { requestId: 'RA-1' as string | undefined, path: undefined as string | undefined };

  it('prefers the trusted server path when valid for the portal', () => {
    expect(notificationHref({ ...base, path: '/m/job/RA-9' }, 'mechanic')).toBe('/m/job/RA-9');
    expect(notificationHref({ ...base, path: '/history/RA-9' }, 'customer')).toBe('/history/RA-9');
  });

  it('falls back to a role-appropriate request route', () => {
    expect(notificationHref({ requestId: 'RA-1', path: undefined }, 'customer')).toBe('/track/RA-1');
    expect(notificationHref({ requestId: 'RA-1', path: undefined }, 'mechanic')).toBe('/m/job/RA-1');
    expect(notificationHref({ requestId: 'RA-1', path: undefined }, 'admin')).toBe('/admin/requests/RA-1');
  });

  it('neutralizes the dead legacy mechanic path via fallback', () => {
    // Producer bug (pre-fix): job_cancelled notices carried /mechanic/requests,
    // which is not a registered route. The mechanic must land on the job.
    expect(notificationHref({ requestId: 'RA-1', path: '/mechanic/requests' }, 'mechanic')).toBe('/m/job/RA-1');
  });

  it('never returns an external or cross-portal destination', () => {
    expect(notificationHref({ requestId: 'RA-1', path: 'https://evil.example' }, 'customer')).toBe('/track/RA-1');
    expect(notificationHref({ requestId: 'RA-1', path: '/admin/logs' }, 'customer')).toBe('/track/RA-1');
  });

  it('returns null when nothing safe exists (no link rendered)', () => {
    expect(notificationHref({ requestId: undefined, path: undefined }, 'customer')).toBeNull();
    expect(notificationHref({ requestId: '   ', path: undefined }, 'mechanic')).toBeNull();
    expect(notificationHref({ requestId: undefined, path: '/mechanic/requests' }, 'mechanic')).toBeNull();
  });

  it('encodes the fallback request id', () => {
    expect(notificationHref({ requestId: 'a b/c?d', path: undefined }, 'customer')).toBe('/track/a%20b%2Fc%3Fd');
  });
});

describe('nextDefaultAfterDelete (default-vehicle continuity)', () => {
  it('promotes the first remaining vehicle when the deleted one was default', () => {
    expect(nextDefaultAfterDelete(
      { id: 'a', isDefault: true },
      [{ id: 'b' }, { id: 'c' }],
    )).toBe('b');
  });

  it('makes no change when the deleted vehicle was not default', () => {
    expect(nextDefaultAfterDelete({ id: 'a', isDefault: false }, [{ id: 'b' }])).toBeNull();
    expect(nextDefaultAfterDelete(null, [{ id: 'b' }])).toBeNull();
  });

  it('handles deleting the last vehicle (no fleet left)', () => {
    expect(nextDefaultAfterDelete({ id: 'a', isDefault: true }, [])).toBeNull();
  });
});

describe('badgeLabel (nav unread pill)', () => {
  it('hides at zero/null and caps wide counts', () => {
    expect(badgeLabel(null)).toBeNull();
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(1)).toBe('1');
    expect(badgeLabel(9)).toBe('9');
    expect(badgeLabel(10)).toBe('9+');
    expect(badgeLabel(47)).toBe('9+');
  });
});
