import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'clay-control inline-flex items-center justify-center gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safety-300 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-9 rounded-xl px-3.5 text-sm',
        size === 'md' && 'h-11 rounded-2xl px-5 text-[15px]',
        size === 'lg' && 'h-12 rounded-2xl px-6 text-base',
        variant === 'primary' && 'bg-gradient-to-br from-safety-400 to-safety-600 text-white shadow-glow hover:from-safety-300 hover:to-safety-500',
        variant === 'secondary' && 'border border-line-soft bg-graphite-soft text-cream shadow-clay-sm hover:border-line-strong hover:bg-graphite-hover',
        variant === 'ghost' && 'text-steel-300 hover:bg-graphite-soft hover:text-cream',
        variant === 'danger' && 'bg-gradient-to-br from-danger to-[#B95B69] text-white',
        className,
      )}
      {...rest}
    />
  );
}

/* ---------- Card ---------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('clay-surface rounded-3xl border border-line-soft/90 bg-graphite-card p-5', className)}>
      {children}
    </div>
  );
}

/* ---------- Badge ---------- */

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'clay-inset inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium',
        tone === 'neutral' && 'border-line-soft bg-graphite-soft text-steel-300',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
        tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'brand' && 'border-safety-500/40 bg-safety-500/10 text-safety-400',
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <p className="inline-flex items-center rounded-full border border-safety-500/25 bg-safety-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-safety-300 shadow-clay-inset">RoadAssist</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-cream">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-[15px] text-steel-300">{description}</p>}
    </div>
  );
}

/* ---------- States ---------- */

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="clay-inset rounded-3xl border border-dashed border-line-strong bg-graphite-soft/40 px-6 py-10 text-center">
      <p className="font-semibold text-cream">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-steel-300">{description}</p>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid gap-3" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="clay-inset h-16 animate-pulse rounded-2xl bg-graphite-soft" />
      ))}
    </div>
  );
}

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="clay-surface rounded-3xl border border-danger/30 bg-danger/10 px-6 py-8 text-center" role="alert">
      <p className="font-semibold text-cream">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-steel-300">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DemoNotice({ children = 'Showing sample records until live data is available.' }: { children?: ReactNode }) {
  return (
    <div className="clay-surface flex flex-wrap items-center gap-2 rounded-2xl border border-safety-500/30 bg-safety-500/10 px-4 py-3 text-sm text-steel-200" role="status">
      <span className="rounded-md bg-safety-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-safety-300">Demo preview</span>
      <span>{children}</span>
    </div>
  );
}

/* ---------- Stat ---------- */

export function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="px-5 py-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-cream">{value}</p>
      {sub && <p className="mt-1 text-xs text-steel-400">{sub}</p>}
    </div>
  );
}

/* ---------- Dashboard metrics ---------- */

export function MetricCard({
  icon = 'grid',
  label,
  value,
  helper,
  tone = 'brand',
}: {
  icon?: IconName;
  label: string;
  value: string;
  helper?: string;
  tone?: 'brand' | 'success' | 'warning' | 'neutral';
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-steel-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-cream">{value}</p>
        </div>
        <span className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl border',
          tone === 'brand' && 'border-safety-500/30 bg-safety-500/10 text-safety-400',
          tone === 'success' && 'border-success/30 bg-success/10 text-success',
          tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
          tone === 'neutral' && 'border-line-soft bg-graphite-soft text-steel-300',
        )}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      {helper && <p className="mt-2 text-xs leading-5 text-steel-400">{helper}</p>}
    </Card>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-cream">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-steel-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Form ---------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-cream">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-steel-400">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
      'clay-inset h-11 w-full rounded-2xl border border-line-soft bg-grease-soft px-3.5 text-[15px] text-cream placeholder:text-steel-500 focus:border-safety-400 focus:outline-none',
        props.className,
      )}
    />
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="clay-surface w-full max-w-md rounded-3xl border border-line-soft bg-graphite p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-cream">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- M1 fixture notice ---------- */

export function PreviewNotice({ routePath }: { routePath: string }) {
  return (
    <div className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-cream">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-warning">
        M1 UI preview
      </span>
      <p className="mt-1 text-steel-300">
        <code className="rounded bg-grease-soft px-1 font-mono text-xs">{routePath}</code> shell only —
        no backend connection yet. Real data arrives in later phases.
      </p>
      <p className="mt-2">
        <Link to="/" className="font-medium text-safety-400 hover:text-safety-300">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
