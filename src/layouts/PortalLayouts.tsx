import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ADMIN_NAV, ADMIN_TABS, MECHANIC_NAV, MECHANIC_TABS } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { Brand, type LayoutProps } from './PublicLayout';
import { useAuth } from '@/app/AuthProvider';
import { badgeLabel, useUnreadCount } from '@/lib/useUnreadCount';
import { DemoNotice } from '@/components/ui';

/** Unread pill for the notifications nav entry (hidden when zero). */
function UnreadBadge({ route }: { route: string }) {
  const { user, demoMode } = useAuth();
  const isNotifications = route.endsWith('/notifications');
  const badge = badgeLabel(useUnreadCount(user?.uid ?? '', demoMode, isNotifications));
  if (!isNotifications || !badge) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1.5 text-[10px] font-semibold text-white"
      aria-label={`${badge} unread notifications`}
    >
      {badge}
    </span>
  );
}

function PortalShell({
  title,
  description,
  portalLabel,
  home,
  children,
}: LayoutProps & { portalLabel: string; home: string }) {
  const { demoMode, setDemoMode, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const groups = portalLabel === 'Admin portal' ? ADMIN_NAV : MECHANIC_NAV;
  const tabs = portalLabel === 'Admin portal' ? ADMIN_TABS : MECHANIC_TABS;

  // Mechanics and admins have no /settings route (customer-gated), so the
  // portal shell itself must offer session end.
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate('/login');
    }
  }
  const signOutButton = (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={signingOut}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-steel-300 transition-colors hover:bg-graphite-soft hover:text-cream disabled:opacity-60"
    >
      <Icon name="person" size={17} />
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  );
  return (
    <div className="min-h-screen bg-grease text-cream">
      <div className="mx-auto flex min-h-screen max-w-screen-2xl">
        <aside className="hidden w-72 shrink-0 flex-col gap-6 border-r border-line-soft bg-graphite/70 p-5 lg:flex" aria-label="Portal navigation">
          <Brand />
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{g.label}</p>
              <ul className="mt-2 grid gap-0.5">
                {g.items.map((item) => (
                  <li key={item.route}>
                    <NavLink
                      to={item.route}
                      end={item.route === home}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors',
                          isActive
                            ? 'bg-safety-500/12 text-safety-300 shadow-[inset_2px_0_0_0_#9333EA]'
                            : 'text-steel-300 hover:bg-graphite-soft/70 hover:text-cream',
                        )
                      }
                    >
                      <Icon name={item.icon} size={20} />
                      {item.label}
                      <UnreadBadge route={item.route} />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-auto border-t border-line-soft pt-3">{signOutButton}</div>
        </aside>
        {/* pt-16 clears the fixed mobile top bar (h-14) on small screens. */}
        <div className="min-w-0 flex-1 px-4 pb-24 pt-16 lg:px-10 lg:pb-10 lg:pt-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
            {portalLabel}
          </p>
          {portalLabel === 'Admin portal' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {demoMode
                ? <DemoNotice>DEMO MODE — Sample data, not live operational records. Demo actions remain local and never write to Firebase.</DemoNotice>
                : <p role="status" className="rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-steel-300">LIVE MODE — Admin records are read from Firebase.</p>}
              <button type="button" onClick={() => setDemoMode(!demoMode)} className="min-h-10 rounded-xl border border-line-soft px-3 py-2 text-xs font-semibold text-cream hover:border-safety-500/50">
                {demoMode ? 'Switch to live Firebase' : 'Use isolated demo data'}
              </button>
            </div>
          ) : demoMode && <div className="mt-3"><DemoNotice>Demo mode is active. Sample records and actions stay in this browser and never write to Firebase.</DemoNotice></div>}
          <div key={portalLabel === 'Admin portal' ? String(demoMode) : undefined} className="portal-content mt-3">{children}</div>
        </div>
      </div>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line-soft bg-grease/90 px-4 backdrop-blur-xl lg:hidden">
        <Brand compact />
        <span className="ml-auto truncate text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="shrink-0 rounded-lg border border-line-soft px-2.5 py-1.5 text-xs font-medium text-steel-300 disabled:opacity-60"
        >
          {signingOut ? '…' : 'Sign out'}
        </button>
      </div>
      <div className="h-14 lg:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-grease/95 backdrop-blur-xl lg:hidden" aria-label={`${portalLabel} tabs`}>
        <ul className="grid grid-cols-5">
          {tabs.map((tab) => (
            <li key={tab.route}>
              <NavLink
                to={tab.route}
                end={tab.route === home}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors',
                    isActive
                      ? 'text-safety-300 after:absolute after:inset-x-5 after:top-0 after:h-0.5 after:rounded-full after:bg-safety-500'
                      : 'text-steel-400 hover:text-cream',
                  )
                }
              >
                <Icon name={tab.icon} size={21} />
                <span className="truncate">{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <span className="hidden" data-description={description} />
    </div>
  );
}

export function MechanicLayout(props: LayoutProps) {
  return <PortalShell {...props} portalLabel="Mechanic portal" home="/m" />;
}

export function AdminLayout(props: LayoutProps) {
  return <PortalShell {...props} portalLabel="Admin portal" home="/admin" />;
}
