import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import {
  countUnread,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  watchNotifications,
  type AppNotification,
  type NotificationPortal,
} from '@/lib/customer';
import { DEMO_ADMIN_NOTIFICATIONS, DEMO_NOTIFICATIONS } from '@/lib/fixtures';
import type { RoutePageProps } from '@/routes';

/**
 * Shared inbox for all three portals. `portal` selects the role-safe link
 * destination for each notice (see notificationHref) — the customer tracking
 * page is never opened from the mechanic or admin inbox.
 */
export function NotificationsPage({ portal = 'customer' }: { portal?: NotificationPortal } & Partial<RoutePageProps>) {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setItems(portal === 'admin' ? DEMO_ADMIN_NOTIFICATIONS : DEMO_NOTIFICATIONS);
      setFailed(false);
      return;
    }
    setFailed(false);
    const unsub = watchNotifications(uid, setItems, () => {
      setItems([]);
      setFailed(true);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, portal]);

  const unread = items ? countUnread(items) : 0;

  async function markAll() {
    if (!uid || markingAll || !items) return;
    setMarkingAll(true);
    if (demoMode) {
      setItems((prev) => (prev ?? []).map((x) => ({ ...x, read: true })));
      setMarkingAll(false);
      return;
    }
    const { marked, failed } = await markAllNotificationsRead(
      uid,
      items.filter((n) => !n.read).map((n) => n.id),
    );
    setMarkingAll(false);
    if (marked > 0) {
      setItems((prev) => (prev ?? []).map((x) => ({ ...x, read: true })));
    }
    if (failed > 0) {
      setActionError(`Could not mark ${failed} notification${failed > 1 ? 's' : ''} as read. Check your connection and try again.`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread — dispatch updates and account notices, newest first.` : 'Dispatch updates and account notices, newest first.'}
      />
      {actionError && (
        <p role="alert" className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">{actionError}</p>
      )}
      {items === null && !failed ? (
        <LoadingState label="Loading notifications…" />
      ) : failed ? (
        <ErrorState title="Could not load notifications" description="The live feed failed. Your notices are safe — check your connection and reopen this page." />
      ) : (items ?? []).length === 0 ? (
        <EmptyState title="All caught up" description="Assignment and progress notices will appear here." />
      ) : (
        <>
          {unread > 0 && (
            <div className="mb-3">
              <Button size="sm" variant="secondary" disabled={markingAll} onClick={markAll}>
                {markingAll ? 'Marking…' : `Mark all ${unread} read`}
              </Button>
            </div>
          )}
          <ul className="grid gap-2">
            {(items ?? []).map((n) => (
              <li key={n.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold ${n.read ? 'text-steel-300' : 'text-cream'}`}>{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-steel-300">{n.body}</p>}
                      <p className="mt-1 font-mono text-xs text-steel-500">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          if (demoMode) {
                            setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                            return;
                          }
                          // Flip the row only when the server write succeeds —
                          // an optimistic flip on a failed write diverges from
                          // the authoritative snapshot.
                          void markNotificationRead(uid, n.id).then((ok) => {
                            if (ok) {
                              setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                            } else {
                              setActionError('Could not mark this notification as read. Try again.');
                            }
                          });
                        }}
                        className="shrink-0 rounded-lg border border-line-soft px-3 py-1.5 text-xs font-medium hover:border-line-strong"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {(() => {
                    const href = notificationHref(n, portal);
                    return href ? (
                      <p className="mt-2 text-sm">
                        <Link to={href} className="font-medium text-safety-400 hover:text-safety-300">
                          {portal === 'customer' ? 'Open request →' : 'Open →'}
                        </Link>
                      </p>
                    ) : null;
                  })()}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
