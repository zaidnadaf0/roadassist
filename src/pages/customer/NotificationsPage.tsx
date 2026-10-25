import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import {
  countUnread,
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
  type AppNotification,
} from '@/lib/customer';
import { DEMO_NOTIFICATIONS } from '@/lib/fixtures';

export function NotificationsPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setItems(DEMO_NOTIFICATIONS);
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
  }, [uid, demoMode]);

  const unread = items ? countUnread(items) : 0;

  async function markAll() {
    if (!uid || markingAll || !items) return;
    setMarkingAll(true);
    if (demoMode) {
      setItems((prev) => (prev ?? []).map((x) => ({ ...x, read: true })));
      setMarkingAll(false);
      return;
    }
    const { marked } = await markAllNotificationsRead(
      uid,
      items.filter((n) => !n.read).map((n) => n.id),
    );
    setMarkingAll(false);
    if (marked > 0) {
      setItems((prev) => (prev ?? []).map((x) => ({ ...x, read: true })));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread — dispatch updates and account notices, newest first.` : 'Dispatch updates and account notices, newest first.'}
      />
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
                        onClick={() => demoMode
                          ? setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)))
                          : markNotificationRead(uid, n.id).then(() => setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x))))}
                        className="shrink-0 rounded-lg border border-line-soft px-3 py-1.5 text-xs font-medium hover:border-line-strong"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {n.requestId && (
                    <p className="mt-2 text-sm">
                      <Link to={`/track/${n.requestId}`} className="font-medium text-safety-400 hover:text-safety-300">Open request →</Link>
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
