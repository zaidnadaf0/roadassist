import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import type { LayoutProps } from './PublicLayout';
import { cn } from '@/lib/cn';

const POINTS = [
  { icon: 'truck', title: 'One-tap SOS', text: 'Your coordinates go straight to every capable mechanic nearby.' },
  { icon: 'map', title: 'Live GPS tracking', text: 'Watch help approach with an ETA that updates as it moves.' },
  { icon: 'shield', title: 'Verified technicians', text: 'Licence, insurance and identity checked before the first job.' },
  { icon: 'dollar', title: 'Price locked upfront', text: 'See the call-out rate before you confirm. No surge pricing.' },
] as const;

/** Centered auth shell with the legacy aside panel (testimonial + points). */
const AUTH_PORTALS = [
  { key: 'customer', label: 'Customer', detail: 'Request roadside help', login: '/customer/login', signup: '/customer/signup' },
  { key: 'mechanic', label: 'Mechanic', detail: 'Manage jobs and earnings', login: '/mechanic/login', signup: '/mechanic/signup' },
  { key: 'admin', label: 'Admin', detail: 'Operate the network', login: '/admin/login', signup: '/admin/signup' },
] as const;

export function AuthLayout({ title, description, routePath, children }: LayoutProps) {
  const activePortal = routePath.startsWith('/mechanic/') ? 'mechanic' : routePath.startsWith('/admin/') ? 'admin' : 'customer';

  return (
    <div className="min-h-screen bg-grease text-cream">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2">
        <div className="flex flex-col justify-center">
          <Link to="/" className="mb-8 inline-flex w-fit items-center gap-2 text-steel-300 hover:text-cream">
            <span className="clay-control grid h-10 w-10 place-items-center rounded-2xl border border-safety-300/20 bg-gradient-to-br from-safety-400 to-safety-600 text-white">
              <Icon name="truck" size={20} />
            </span>
            <span className="text-lg font-extrabold">RoadAssist</span>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-2 max-w-md text-steel-300">{description}</p>}
          <div className="mt-5 grid w-full max-w-md gap-2 sm:grid-cols-3" aria-label="Choose workspace">
            {AUTH_PORTALS.map((portal) => (
              <Link
                key={portal.key}
                to={portal.login}
                className={cn(
                  'clay-control rounded-2xl border px-3 py-3 transition-colors',
                  activePortal === portal.key ? 'border-safety-500/60 bg-safety-500/10' : 'border-line-soft bg-graphite-card hover:border-line-strong',
                )}
              >
                <span className="block text-sm font-semibold text-cream">{portal.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-steel-400">{portal.detail}</span>
              </Link>
            ))}
          </div>
          <div className="mt-6 w-full max-w-md">{children as ReactNode}</div>
        </div>
        <aside className="clay-surface hidden flex-col justify-center rounded-3xl border border-line-soft bg-graphite-card p-8 lg:flex">
          <p className="text-xl font-medium leading-relaxed text-cream">
            “Twelve minutes from the moment I pressed the button to the moment the truck pulled up
            behind me.”
          </p>
          <p className="mt-3 text-sm text-steel-300">Nina Patel · Towing · Outer Ring Road</p>
          <div className="mt-8 grid gap-5">
            {POINTS.map((p) => (
              <div key={p.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-safety-500/10 text-safety-400">
                  <Icon name={p.icon} size={18} />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-steel-300">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
