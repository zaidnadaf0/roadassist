import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchAllUsers, type AdminUser } from '@/lib/admin';
import { DEMO_ADMIN_USERS } from '@/lib/fixtures';

/** User roster — hint fields only. No role editing here by design. */
export function UsersPage() {
  const { demoMode } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) {
      setUsers(DEMO_ADMIN_USERS);
      setFeedError(false);
      return;
    }
    const unsub = watchAllUsers(setUsers, 100, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode]);

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Users" description="Accounts on the network. Roles shown are profile hints — authority lives in the access claim, which this screen cannot change." />
        {feedError && !demoMode ? (
          <ErrorState title="Users unavailable" description="The user roster could not be loaded. Check your connection and try again." />
        ) : users === null ? (
          <LoadingState label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users visible" description="Accounts appear here once they sign up. If you hold the admin claim and still see this, check the claim on your session." />
        ) : (
          <div className="grid gap-4">
            <Card>
              <ul className="grid gap-1.5">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-graphite-soft">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-cream">{u.displayName || u.email || u.id.slice(0, 8)}</p>
                      <p className="truncate font-mono text-xs text-steel-500">{u.email ?? u.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={u.role === 'admin' ? 'brand' : u.role === 'mechanic' ? 'warning' : 'neutral'}>{u.role ?? 'unknown'}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(selectedId === u.id ? null : u.id)}>
                        {selectedId === u.id ? 'Hide details' : 'Details'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            {selectedId && (() => {
              const selected = users.find((u) => u.id === selectedId);
              if (!selected) return null;
              return (
                <Card>
                  <p className="font-semibold text-cream">User details</p>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-steel-400">Name</dt><dd className="text-right font-medium text-cream">{selected.displayName || '—'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-steel-400">Email</dt><dd className="text-right font-medium text-cream">{selected.email || '—'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-steel-400">Phone</dt><dd className="text-right font-medium text-cream">{selected.phone || '—'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-steel-400">Role hint</dt><dd className="text-right font-medium text-cream">{selected.role || 'unknown'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-steel-400">UID</dt><dd className="font-mono text-xs text-cream">{selected.id}</dd></div>
                  </dl>
                </Card>
              );
            })()}
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
