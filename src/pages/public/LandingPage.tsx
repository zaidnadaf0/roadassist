import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import { FIXTURE_SERVICES } from '@/lib/fixtures';

/**
 * Landing page. Composition is deliberately asymmetric: a left-hand editorial
 * column (what / who / how) and a right-hand product visual (the live-tracking
 * surface customers actually get), rather than a wall of identical cards.
 * Service names, prices and ETAs are the legacy fixture catalogue.
 */

const TRUST: { icon: IconName; title: string; body: string }[] = [
  { icon: 'shield-check', title: 'Verified workshops', body: 'Licence, insurance and identity checked before a mechanic receives work.' },
  { icon: 'wallet', title: 'Price agreed first', body: 'You approve the estimate before a repair can be completed.' },
  { icon: 'clock', title: 'Around the clock', body: 'Nights, weekends and motorway breakdowns — including fuel and lockouts.' },
];

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: '01', title: 'Tell us where you are', body: 'Pick your vehicle, the problem and your location — GPS or manually.', icon: 'map-pin' },
  { n: '02', title: 'We dispatch the nearest fit', body: 'Eligible mechanics receive a 120-second offer. First valid accept wins.', icon: 'navigation' },
  { n: '03', title: 'Track, approve, pay', body: 'Watch the arrival, approve the estimate, then record how you paid.', icon: 'check-circle' },
];

function TrackingPreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-soft bg-graphite-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="text-[11px] font-medium text-steel-300">Live tracking</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-steel-500">RA-9F3K2A</span>
      </div>

      <div className="map-grid relative h-[15.5rem] w-full">
        <svg viewBox="0 0 400 260" className="absolute inset-0 h-full w-full" aria-hidden role="presentation">
          <path
            d="M52 208c46-6 58-52 96-64s66 8 96-22 28-58 58-66"
            fill="none"
            stroke="#9333EA"
            strokeOpacity="0.5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="7 7"
          />
          <circle cx="52" cy="208" r="7" fill="#A855F7" fillOpacity="0.18" stroke="#A855F7" strokeWidth="1.5" />
          <circle cx="52" cy="208" r="2.5" fill="#A855F7" />
          <circle cx="300" cy="146" r="7" fill="#2DD4BF" fillOpacity="0.18" stroke="#2DD4BF" strokeWidth="1.5" />
          <circle cx="300" cy="146" r="2.5" fill="#2DD4BF" />
        </svg>
        <span className="absolute left-[3%] top-[79%] rounded-md border border-line-soft bg-graphite px-1.5 py-0.5 text-[10px] font-medium text-cream">
          You
        </span>
        <span className="absolute right-[16%] top-[50%] rounded-md border border-line-soft bg-graphite px-1.5 py-0.5 text-[10px] font-medium text-cream">
          Mechanic
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line-soft border-t border-line-soft">
        {[
          { label: 'Status', value: 'On the way' },
          { label: 'ETA', value: '9 min' },
          { label: 'Estimate', value: 'Approved' },
        ].map((item) => (
          <div key={item.label} className="px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-steel-500">{item.label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-cream">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div>
      {/* Hero — editorial left, product visual right */}
      <section className="relative overflow-hidden border-b border-line-soft">
        <div className="map-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-56 left-1/4 h-[32rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(147,51,234,0.20),transparent)] blur-2xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-graphite-card/80 px-2.5 py-1 text-[11px] text-steel-300">
              <span className="h-1.5 w-1.5 rounded-full bg-safety-400" />
              24/7 roadside assistance · India
            </span>
            <p className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">
              Breakdowns end here
            </p>
            <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight text-cream sm:text-5xl lg:text-6xl">
              Help is already
              <span className="mt-1 block bg-gradient-to-r from-safety-300 to-safety-500 bg-clip-text text-transparent">
                rolling.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-steel-300 sm:text-lg">
              RoadAssist connects stranded drivers with verified roadside mechanics in minutes — towing,
              battery, tyres, fuel, lockouts and recovery. Live tracking, an estimate you approve, and a
              receipt you keep.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button size="lg">Get help now</Button>
              </Link>
              <Link to="/mechanics">
                <Button size="lg" variant="secondary">
                  Browse mechanics
                </Button>
              </Link>
            </div>
            <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
              {[
                { k: '~12 min', v: 'median arrival estimate' },
                { k: '6', v: 'roadside services' },
                { k: '1 tap', v: 'from breakdown to dispatch' },
              ].map((item) => (
                <div key={item.k}>
                  <dt className="font-mono text-lg font-bold text-cream">{item.k}</dt>
                  <dd className="text-[11px] text-steel-500">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:pl-4">
            <TrackingPreview />
            <p className="mt-2 text-[11px] leading-4 text-steel-500">
              The customer view: live status, mechanic on the map, and the estimate you approve before work starts.
            </p>
          </div>
        </div>
      </section>

      {/* Services — dense rows, not a card wall */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">Services</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-cream md:text-3xl">Whatever stopped you, we restart you.</h2>
          </div>
          <Link to="/services" className="inline-flex items-center gap-1 text-sm font-semibold text-safety-300 hover:text-safety-200">
            Compare services
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>

        <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
          {FIXTURE_SERVICES.map((s) => (
            <li key={s.id} className="group bg-graphite-card p-4 transition-colors hover:bg-graphite-hover/60">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-graphite-soft text-safety-300">
                  <Icon name="wrench" size={16} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-cream">{s.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-steel-400">{s.desc}</p>
                  <p className="mt-2 font-mono text-[11px] text-steel-500">from ₹{s.base} · {s.eta}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works — ordered steps with a connecting line */}
      <section className="border-y border-line-soft bg-grease-soft/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-safety-400">How it works</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-cream md:text-3xl">Three steps to rolling again.</h2>

          <ol className="relative mt-9 grid gap-8 sm:grid-cols-3 sm:gap-6">
            <span aria-hidden className="absolute left-0 right-0 top-4 hidden h-px bg-line-strong sm:block" />
            {STEPS.map((step) => (
              <li key={step.n} className="relative">
                <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-safety-500/40 bg-grease text-safety-300">
                  <Icon name={step.icon} size={15} />
                </span>
                <p className="mt-3 font-mono text-[11px] text-safety-400">{step.n}</p>
                <h3 className="mt-0.5 text-sm font-semibold text-cream">{step.title}</h3>
                <p className="mt-1 max-w-xs text-xs leading-5 text-steel-400">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/onboarding">
              <Button variant="secondary">How it works</Button>
            </Link>
            <Link to="/map">
              <Button variant="ghost">
                <span className="inline-flex items-center gap-2">
                  <Icon name="map" size={16} /> Open the map
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust — plain text band, three columns */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {TRUST.map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-graphite-card text-safety-300">
                <Icon name={item.icon} size={16} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-cream">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-steel-400">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Live Experience entry point */}
      <section className="border-t border-line-soft bg-graphite-card/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-7">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-safety-500/30 bg-safety-500/10 text-safety-300">
              <Icon name="navigation" size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-cream">Live Experience — all three roles, end to end</p>
              <p className="mt-0.5 text-xs leading-5 text-steel-400">
                Run the real Firebase workflow, or a scripted simulation that writes nothing and resets in one click.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/experience/simulation">
              <Button size="sm">Open simulation</Button>
            </Link>
            <Link to="/experience/real">
              <Button size="sm" variant="secondary">Real mode</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-12">
          <div>
            <p className="text-xl font-bold tracking-tight text-cream">Stuck on the hard shoulder?</p>
            <p className="mt-1 text-sm text-steel-400">Tell us where you are — the nearest verified mechanic gets the offer in seconds.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/signup">
              <Button>Request assistance</Button>
            </Link>
            <Link to="/emergency">
              <Button variant="secondary">Emergency contacts</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
