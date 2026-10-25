import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Badge, Button, Card, Stat } from '@/components/ui';
import { FIXTURE_SERVICES } from '@/lib/fixtures';

/**
 * M1 landing page — composition mirrors legacy/views-public.js landing:
 * hero + trust stats + service grid + how-it-works + final CTA.
 * Service names/descriptions are legacy catalogue copy (fixture data).
 */
export function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="map-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:pt-24">
          <Badge tone="brand">24/7 · Smart roadside assistance</Badge>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-cream md:text-6xl">
            Stranded? Help is <span className="text-safety-400">already rolling.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-steel-300">
            One tap connects you with certified roadside mechanics. Live GPS tracking, verified
            professionals, transparent pricing.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg">Get help now</Button>
            </Link>
            <Link to="/mechanics">
              <Button size="lg" variant="secondary">
                Browse mechanics
              </Button>
            </Link>
          </div>
          <div className="mt-10 grid max-w-3xl grid-cols-3 divide-x divide-line-soft rounded-2xl border border-line-soft bg-graphite-card">
            <Stat value="~12 min" label="Median ETA" sub="straight-line estimate" />
            <Stat value="6" label="Services" sub="towing · battery · more" />
            <Stat value="24/7" label="Coverage" sub="nights + weekends" />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
          Services
        </p>
        <h2 className="mt-2 text-2xl font-bold text-cream md:text-3xl">Whatever stopped you, we restart you.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIXTURE_SERVICES.map((s) => (
            <Card key={s.id}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-safety-500/10 text-safety-400">
                <Icon name="wrench" size={20} />
              </span>
              <h3 className="mt-3 font-bold text-cream">{s.name}</h3>
              <p className="mt-1 text-sm text-steel-300">{s.desc}</p>
              <p className="mt-3 font-mono text-xs text-steel-400">
                from ₹{s.base} · {s.eta}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line-soft bg-grease-soft/50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
            How it works
          </p>
          <h2 className="mt-2 text-2xl font-bold text-cream md:text-3xl">Three steps to rolling again.</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { n: '01', t: 'Request', d: 'Pick a service, confirm your vehicle and location.' },
              { n: '02', t: 'Match', d: 'Top eligible mechanics get a limited-time offer. First valid accept wins.' },
              { n: '03', t: 'Track', d: 'Follow every status from accepted to completed, then rate the service.' },
            ].map((s) => (
              <Card key={s.n}>
                <p className="font-mono text-sm font-bold text-safety-400">{s.n}</p>
                <h3 className="mt-2 font-bold text-cream">{s.t}</h3>
                <p className="mt-1 text-sm text-steel-300">{s.d}</p>
              </Card>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/onboarding">
              <Button variant="secondary">How it works</Button>
            </Link>
            <Link to="/map">
              <Button variant="ghost">
                <span className="inline-flex items-center gap-2">
                  <Icon name="map" size={17} /> Open the map
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
