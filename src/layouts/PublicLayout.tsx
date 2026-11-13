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
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-safety-400/30 bg-gradient-to-br from-safety-500 to-safety-700 text-white shadow-[0_8px_20px_-12px_rgba(147,51,234,0.9)]">
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
      <header className="sticky top-0 z-40 border-b border-line-soft bg-grease/80 backdrop-blur-xl">
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
                    isActive ? 'bg-safety-500/10 text-safety-200' : 'text-steel-300 hover:bg-graphite-soft/70 hover:text-cream',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/login" className="ml-2 rounded-xl px-3 py-2 text-sm font-medium text-steel-300 hover:text-cream">
              Log in
            </Link>
            <Link
              to="/signup"
              className="ml-2 rounded-xl bg-gradient-to-br from-safety-500 to-safety-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-colors hover:from-safety-400 hover:to-safety-500"
            >
              Get help
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <Link to="/login" className="rounded-xl px-2.5 py-2 text-sm font-medium text-steel-300 hover:bg-graphite-soft/70 hover:text-cream">
              Log in
            </Link>
            <Link to="/signup" className="rounded-xl bg-gradient-to-br from-safety-500 to-safety-600 px-3 py-2 text-sm font-semibold text-white shadow-glow transition-colors hover:from-safety-400 hover:to-safety-500">
              Get help
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-line-soft bg-grease-soft/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Brand />
              <p className="mt-3 max-w-xs text-xs leading-5 text-steel-400">
                Verified roadside mechanics, live tracking and an estimate you approve before any repair starts.
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Services</p>
              <ul className="mt-2.5 grid gap-1.5 text-sm text-steel-300">
                <li><Link to="/services" className="hover:text-cream">Towing and recovery</Link></li>
                <li><Link to="/services" className="hover:text-cream">Battery and jump start</Link></li>
                <li><Link to="/services" className="hover:text-cream">Flat tyre repair</Link></li>
                <li><Link to="/services" className="hover:text-cream">Fuel delivery</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Platform</p>
              <ul className="mt-2.5 grid gap-1.5 text-sm text-steel-300">
                <li><Link to="/mechanics" className="hover:text-cream">Find a mechanic</Link></li>
                <li><Link to="/onboarding" className="hover:text-cream">How it works</Link></li>
                <li><Link to="/experience" className="hover:text-cream">Live Experience demo</Link></li>
                <li><Link to="/pricing" className="hover:text-cream">Pricing</Link></li>
                <li><Link to="/about" className="hover:text-cream">About RoadAssist</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Access</p>
              <ul className="mt-2.5 grid gap-1.5 text-sm text-steel-300">
                <li><Link to="/customer/login" className="hover:text-cream">Customer login</Link></li>
                <li><Link to="/mechanic/login" className="hover:text-cream">Mechanic login</Link></li>
                <li><Link to="/admin/login" className="hover:text-cream">Admin login</Link></li>
                <li><Link to="/emergency" className="hover:text-cream">Emergency guidance</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4 text-[11px] text-steel-500">
            <span>RoadAssist — 24/7 smart roadside assistance.</span>
            <span>Recorded offline payments are not independently verified transactions.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
