import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { CUSTOMER_NAV, CUSTOMER_TABS, type NavGroup } from '@/lib/nav';
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

function Sidebar({ groups, home }: { groups: NavGroup[]; home: string }) {
  const { pathname } = useLocation();
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-line-soft bg-graphite/70 p-4 lg:flex" aria-label="Portal navigation">
      <Brand />
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{g.label}</p>
          <ul className="mt-2 grid gap-0.5">
            {g.items.map((item) => {
              const active = pathname === item.route || (item.route !== home && pathname.startsWith(item.route));
              return (
                <li key={item.route}>
                  <NavLink
                    to={item.route}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-safety-500/12 text-safety-300 shadow-[inset_2px_0_0_0_#9333EA]'
                        : 'text-steel-300 hover:bg-graphite-soft/70 hover:text-cream',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                    <UnreadBadge route={item.route} />
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function Shell({
  groups,
  home,
  tabs,
  routePath,
  title,
  description,
  children,
  portalLabel,
}: LayoutProps & { groups: NavGroup[]; home: string; tabs?: { route: string; icon: string; label: string }[]; portalLabel: string }) {
  const { demoMode, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // Firebase sign-out is independent of Firestore reads; always leave this
      // gated page so the login screen remains reachable.
    } finally {
      navigate('/login', { replace: true });
      setSigningOut(false);
    }
  }
  return (
    <div className="min-h-screen bg-grease text-cream">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <Sidebar groups={groups} home={home} />
        <div className="min-w-0 flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">{portalLabel}</p>
            <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="min-h-10 rounded-xl border border-line-soft px-3 py-2 text-sm font-semibold text-cream hover:border-safety-500/50 disabled:opacity-60">{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
          {demoMode && <div className="mt-3"><DemoNotice>Demo mode is active. All records on this portal are fictional and isolated from Firebase.</DemoNotice></div>}
          <div className="app-content mt-1">
            {children}
          </div>
        </div>
      </div>
      {tabs && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-grease/95 backdrop-blur-xl lg:hidden" aria-label="Portal tabs">
          <ul className="grid grid-cols-5">
            {tabs.map((t) => (
              <li key={t.route}>
                <NavLink
                  to={t.route}
                  className={({ isActive }) =>
                    cn(
                      'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                      isActive
                        ? 'text-safety-300 after:absolute after:inset-x-5 after:top-0 after:h-0.5 after:rounded-full after:bg-safety-500'
                        : 'text-steel-400 hover:text-cream',
                    )
                  }
                >
                  <Icon name={t.icon} size={19} />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <span className="hidden" data-route={routePath} data-title={title} data-description={description} />
    </div>
  );
}

export function CustomerLayout(props: LayoutProps) {
  return <Shell {...props} groups={CUSTOMER_NAV} home="/app" tabs={CUSTOMER_TABS} portalLabel="Customer portal" />;
}
