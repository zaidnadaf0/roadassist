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

import { countUnread, markAllNotificationsRead } from '@/lib/customer';
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
