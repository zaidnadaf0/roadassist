import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { CUSTOMER_NAV, CUSTOMER_TABS, type NavGroup } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { Brand, type LayoutProps } from './PublicLayout';
import { useAuth } from '@/app/AuthProvider';
import { DemoNotice } from '@/components/ui';

function Sidebar({ groups, home }: { groups: NavGroup[]; home: string }) {
  const { pathname } = useLocation();
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-line-soft/80 bg-grease-soft/60 p-4 shadow-clay-sm lg:flex" aria-label="Portal navigation">
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
                      active ? 'clay-inset bg-safety-500/10 text-safety-300' : 'text-steel-300 hover:bg-graphite-soft hover:text-cream',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
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
  const { demoMode } = useAuth();
  return (
    <div className="min-h-screen bg-grease text-cream">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <Sidebar groups={groups} home={home} />
        <div className="min-w-0 flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
            {portalLabel}
          </p>
          {demoMode && <div className="mt-3"><DemoNotice>Demo mode is active. All records on this portal are fictional and isolated from Firebase.</DemoNotice></div>}
          <div className="mt-1">
            {children}
          </div>
        </div>
      </div>
      {tabs && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-grease/90 shadow-clay-sm backdrop-blur-xl lg:hidden" aria-label="Portal tabs">
          <ul className="grid grid-cols-5">
            {tabs.map((t) => (
              <li key={t.route}>
                <NavLink
                  to={t.route}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                      isActive ? 'text-safety-400' : 'text-steel-400',
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
