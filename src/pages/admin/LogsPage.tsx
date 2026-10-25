import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchAuditEvents, type AdminAuditEvent } from '@/lib/admin';
import { DEMO_AUDIT_EVENTS } from '@/lib/fixtures';

export function LogsPage() {
  const { demoMode } = useAuth();
  const [items, setItems] = useState<AdminAuditEvent[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (demoMode) {
      setItems(DEMO_AUDIT_EVENTS);
      setFeedError(false);
      return;
    }
    const unsub = watchAuditEvents(setItems, 100, () => setFeedError(true));
    return () => { if (unsub) unsub(); };
  }, [demoMode]);

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Audit logs" description="Immutable operator events written by trusted backend functions. Request activity remains available in System activity." />
        {demoMode && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Demo log examples only — they are not genuine security events and are never written to the audit collection.</p>}
        {feedError && !demoMode ? (
          <ErrorState title="Audit logs unavailable" description="The durable audit feed could not be loaded. Check your connection and try again." />
        ) : items === null ? (
          <LoadingState label="Loading operational logs…" />
        ) : items.length === 0 ? (
          <EmptyState title="No audit events yet" description="Approval and administrator claim changes will appear here after trusted backend operations run." />
        ) : (
          <Card>
            <ul className="grid gap-3">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                  <p className="truncate font-medium text-cream">{item.action} · {item.targetType} #{item.targetId.slice(-8)}</p>
                    <p className="mt-1 text-xs text-steel-400">actor {item.actorUid.slice(-8)} · event {item.id.slice(-8)}</p>
                  </div>
                  <Badge tone="brand">backend event</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-steel-400">Records are append-only from the client perspective. The Admin SDK writes events after approved mechanic or administrator claim operations.</p>
          </Card>
        )}
      </div>
    </RequireAdmin>
  );
}
