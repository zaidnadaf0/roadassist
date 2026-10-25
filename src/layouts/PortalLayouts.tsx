import { NavLink } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ADMIN_NAV, ADMIN_TABS, MECHANIC_NAV, MECHANIC_TABS } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { Brand, type LayoutProps } from './PublicLayout';
import { useAuth } from '@/app/AuthProvider';
import { DemoNotice } from '@/components/ui';

function PortalShell({
  title,
  description,
  portalLabel,
  home,
  children,
}: LayoutProps & { portalLabel: string; home: string }) {
  const { demoMode } = useAuth();
  const groups = portalLabel === 'Admin portal' ? ADMIN_NAV : MECHANIC_NAV;
  const tabs = portalLabel === 'Admin portal' ? ADMIN_TABS : MECHANIC_TABS;
  return (
    <div className="min-h-screen bg-grease text-cream">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-line-soft/80 bg-grease-soft/60 p-4 shadow-clay-sm lg:flex" aria-label="Portal navigation">
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
                          'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive ? 'clay-inset bg-safety-500/10 text-safety-300' : 'text-steel-300 hover:bg-graphite-soft hover:text-cream',
                        )
                      }
                    >
                      <Icon name={item.icon} size={17} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
        <div className="min-w-0 flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
            {portalLabel}
          </p>
          {demoMode && <div className="mt-3"><DemoNotice>Demo mode is active. Sample records and actions stay in this browser and never write to Firebase.</DemoNotice></div>}
          <div className="mt-1">{children}</div>
        </div>
      </div>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line-soft bg-grease/90 px-4 shadow-clay-sm backdrop-blur-xl lg:hidden">
        <Brand compact />
        <span className="ml-auto truncate text-sm font-semibold">{title}</span>
      </div>
      <div className="h-14 lg:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-grease/90 shadow-clay-sm backdrop-blur-xl lg:hidden" aria-label={`${portalLabel} tabs`}>
        <ul className="grid grid-cols-5">
          {tabs.map((tab) => (
            <li key={tab.route}>
              <NavLink
                to={tab.route}
                end={tab.route === home}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium',
                    isActive ? 'text-safety-400' : 'text-steel-400 hover:text-cream',
                  )
                }
              >
                <Icon name={tab.icon} size={18} />
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
