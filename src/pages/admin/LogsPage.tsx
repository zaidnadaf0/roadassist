import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchAuditEvents, type AdminAuditEvent } from '@/lib/admin';
import { DEMO_AUDIT_EVENTS } from '@/lib/fixtures';
import { shortRef } from '@/lib/reference';

export function LogsPage() {
  const { demoMode } = useAuth();
  const [items, setItems] = useState<AdminAuditEvent[] | null>(null);
  const [feedError, setFeedError] = useState<false | 'denied' | true>(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (demoMode) {
      setItems(DEMO_AUDIT_EVENTS);
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const unsub = watchAuditEvents(setItems, 100, (err) => {
      const code = (err as { code?: string } | null)?.code ?? '';
      setFeedError(code.includes('permission-denied') ? 'denied' : true);
    });
    return () => { if (unsub) unsub(); };
  }, [demoMode, retry]);

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Audit logs" description="Immutable operator events written by trusted backend functions. Request activity remains available in System activity." />
        {demoMode && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Demo log examples only — they are not genuine security events and are never written to the audit collection.</p>}
        {feedError && !demoMode ? (
          <ErrorState
            title={feedError === 'denied' ? 'Audit logs require the admin claim' : 'Audit logs unavailable'}
            description={feedError === 'denied'
              ? 'This session does not carry the Firebase admin custom claim, which is the only authority allowed to read audit events. Sign in with an operations account or re-authenticate to refresh claims.'
              : 'The durable audit feed could not be loaded. Check your connection and try again.'}
            action={feedError === 'denied' ? undefined : <Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
          />
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
                  <p className="truncate font-medium text-cream">{item.action} · {item.targetType} #{shortRef(item.targetId, 8)}</p>
                    <p className="mt-1 text-xs text-steel-400">actor {shortRef(item.actorUid, 8)} · event {shortRef(item.id, 8)}</p>
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
