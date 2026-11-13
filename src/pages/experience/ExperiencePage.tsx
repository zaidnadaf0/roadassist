import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Button, Card } from '@/components/ui';
import { SIM_STAGES } from '@/lib/simulation/scenario';

/**
 * RoadAssist Live Experience — entry point.
 *
 * Two clearly separated modes: the real Firebase-backed product, and an
 * isolated simulation that writes nothing. The difference is stated before a
 * single click, because confusing the two would misrepresent the demo.
 */

const ROLES: { role: string; icon: IconName; title: string; body: string; route: string }[] = [
  {
    role: 'Customer',
    icon: 'car-front',
    title: 'Customer',
    body: 'Raises the breakdown request, watches the mechanic approach, approves the estimate and keeps the receipt.',
    route: '/customer/login',
  },
  {
    role: 'Mechanic',
    icon: 'wrench',
    title: 'Mechanic',
    body: 'Receives the dispatched offer, accepts it, advances the job, prices the repair and records the payment.',
    route: '/mechanic/login',
  },
  {
    role: 'Admin',
    icon: 'chart-bar',
    title: 'Administrator',
    body: 'Monitors requests, open offers, active assignments, mechanic availability and operational analytics.',
    route: '/admin/login',
  },
];

export function ExperiencePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Intro */}
      <section className="relative overflow-hidden border-b border-line-soft py-12">
        <div className="map-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-safety-500/30 bg-safety-500/10 px-2.5 py-1 text-[11px] font-medium text-safety-300">
            <span className="h-1.5 w-1.5 rounded-full bg-safety-400" />
            Live Experience
          </span>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-cream sm:text-5xl">
            One breakdown.
            <span className="block bg-gradient-to-r from-safety-300 to-safety-500 bg-clip-text text-transparent">
              Three roles. The whole rescue.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-steel-300">
            RoadAssist is a roadside-assistance platform: a stranded driver raises a request, the dispatch service
            offers it to eligible mechanics, the assigned mechanic prices the repair, and the customer approves that
            price before any work can be completed. Choose how you want to experience it.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/experience/simulation">
              <Button size="lg">
                <span className="inline-flex items-center gap-2">
                  <Icon name="navigation" size={17} />
                  Start presentation simulation
                </span>
              </Button>
            </Link>
            <Link to="/experience/real">
              <Button size="lg" variant="secondary">
                <span className="inline-flex items-center gap-2">
                  <Icon name="shield-check" size={17} />
                  Run the real workflow
                </span>
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-steel-500">
            The simulation needs no accounts and writes nothing. Real mode signs you into the actual Firebase-backed product.
          </p>
        </div>
      </section>

      {/* Two modes */}
      <section className="grid gap-4 py-10 lg:grid-cols-2">
        <Card className="flex flex-col p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-steel-500">Mode A</p>
              <h2 className="mt-0.5 text-lg font-bold text-cream">Real working demonstration</h2>
            </div>
            <Badge tone="success">
              <span className="inline-flex items-center gap-1"><Icon name="shield-check" size={11} />Live Firebase</span>
            </Badge>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-5 py-4">
            <p className="text-sm leading-6 text-steel-300">
              The genuine application: Firebase Authentication for all three roles, Firestore documents, and the
              server-side dispatch callable. Everything you do is an authorised product action.
            </p>
            <ul className="grid gap-2 text-sm text-steel-300">
              {[
                'Real accounts and real role checks — no substituted identities.',
                'Assignment stays server-authoritative inside the dispatch transaction.',
                'The estimate gate and Firestore security rules are live.',
                'Data is written to the Firebase project you are configured against.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Icon name="check-circle" size={15} className="mt-0.5 shrink-0 text-success" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
              <Link to="/experience/real">
                <Button variant="secondary">Open real mode</Button>
              </Link>
              <span className="text-[11px] text-steel-500">Requires provisioned accounts.</span>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col border-warning/30 p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-steel-500">Mode B</p>
              <h2 className="mt-0.5 text-lg font-bold text-cream">Isolated presentation simulation</h2>
            </div>
            <Badge tone="warning">
              <span className="inline-flex items-center gap-1"><Icon name="alert" size={11} />Demonstration data</span>
            </Badge>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-5 py-4">
            <p className="text-sm leading-6 text-steel-300">
              One fictional rescue near Cubbon Park, played across the three role views in a single synchronised
              session. Ideal for a projector: no accounts, no waiting for a real mechanic, fully repeatable.
            </p>
            <ul className="grid gap-2 text-sm text-steel-300">
              {[
                'Customer, mechanic and admin views share one simulated request.',
                'Actions are synchronised across tabs in this browser only.',
                'Nothing is written to Firestore — no production data is touched.',
                'The completion gate still blocks completion until approval.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Icon name="check-circle" size={15} className="mt-0.5 shrink-0 text-warning" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
              <Link to="/experience/simulation">
                <Button>Enter simulation</Button>
              </Link>
              <span className="text-[11px] text-steel-500">No Firebase writes. Resettable.</span>
            </div>
          </div>
        </Card>
      </section>

      {/* Roles */}
      <section className="border-t border-line-soft py-10">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">The three roles</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role.role} className="rounded-xl border border-line-soft bg-graphite-card p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-safety-500/25 bg-safety-500/10 text-safety-300">
                <Icon name={role.icon} size={17} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-cream">{role.title}</h3>
              <p className="mt-1 text-xs leading-5 text-steel-400">{role.body}</p>
              <Link
                to={role.route}
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-safety-300 hover:text-safety-200"
              >
                Real login
                <Icon name="arrowRight" size={12} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Lifecycle */}
      <section className="border-t border-line-soft py-10">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">Service lifecycle</p>
        <h2 className="mt-2 text-xl font-bold text-cream">What the demonstration walks through</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SIM_STAGES.map((stage, i) => (
            <li key={stage.key} className="rounded-xl border border-line-soft bg-graphite-card/70 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full border border-line-strong bg-graphite-soft text-[10px] font-bold text-steel-300">
                  {i + 1}
                </span>
                <Icon name={stage.icon} size={15} className="text-safety-300" />
                <p className="text-[11px] uppercase tracking-wider text-steel-500">{stage.owner}</p>
              </div>
              <p className="mt-2 text-sm font-medium text-cream">{stage.label}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line-soft py-8">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line-soft bg-graphite-soft/30 px-4 py-3">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-steel-400" />
          <p className="max-w-3xl text-xs leading-5 text-steel-400">
            The two modes never blend. Simulation records are labelled <span className="font-semibold text-cream">DEMONSTRATION DATA</span>,
            live in this browser only and cannot appear in real analytics, earnings or history. Real mode uses authenticated
            accounts and the authoritative server workflow — assignment can never be forged from the interface.
          </p>
        </div>
      </section>
    </div>
  );
}
