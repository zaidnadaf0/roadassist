import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { PUBLIC_LINKS } from '@/lib/nav';
import { cn } from '@/lib/cn';

export interface LayoutProps {
  title: string;
  description?: string;
  routePath: string;
  children: ReactNode;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="RoadAssist home">
      <span className="clay-control grid h-10 w-10 place-items-center rounded-2xl border border-safety-300/20 bg-gradient-to-br from-safety-400 to-safety-600 text-white">
        <Icon name="truck" size={20} />
      </span>
      {!compact && (
        <span className="text-lg font-extrabold tracking-tight text-cream">
          Road<span className="text-safety-400">Assist</span>
        </span>
      )}
    </Link>
  );
}

export function PublicLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-grease text-cream">
      <header className="sticky top-0 z-40 border-b border-line-soft/80 bg-grease/80 shadow-clay-sm backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Brand />
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
            {PUBLIC_LINKS.map((l) => (
              <NavLink
                key={l.route}
                to={l.route}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'clay-inset bg-graphite-soft text-cream' : 'text-steel-300 hover:bg-graphite-soft/60 hover:text-cream',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/login" className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-steel-300 hover:text-cream">
              Log in
            </Link>
            <Link
              to="/signup"
              className="clay-control rounded-2xl bg-gradient-to-br from-safety-400 to-safety-600 px-4 py-2 text-sm font-semibold text-white hover:from-safety-300 hover:to-safety-500"
            >
              Get help
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <Link to="/login" className="rounded-xl px-2.5 py-2 text-sm font-medium text-steel-300 hover:bg-graphite-soft/60 hover:text-cream">
              Log in
            </Link>
            <Link to="/signup" className="clay-control rounded-2xl bg-gradient-to-br from-safety-400 to-safety-600 px-3 py-2 text-sm font-semibold text-white hover:from-safety-300 hover:to-safety-500">
              Get help
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-steel-400 md:flex-row md:items-center">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-cream">RoadAssist</span>
            <span>24/7 smart roadside assistance.</span>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 md:ml-auto" aria-label="Workspace access">
            <Link to="/customer/login" className="hover:text-cream">Customer login</Link>
            <Link to="/mechanic/login" className="hover:text-cream">Mechanic login</Link>
            <Link to="/admin/login" className="hover:text-cream">Admin login</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
