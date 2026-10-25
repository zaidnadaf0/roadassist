import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, Stat } from '@/components/ui';
import { FIXTURE_SERVICES } from '@/lib/fixtures';

function MarketingShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">{children}</div>;
}

export function FeaturesPage() {
  const features = [
    ['Fast requests', 'Describe the problem, choose a vehicle, confirm the location, and send one clear request.'],
    ['Verified mechanics', 'Operations reviews workshop applications before mechanics can receive jobs.'],
    ['Live progress', 'Follow accepted, on-the-way, arrived, service, and completed states from one timeline.'],
    ['Mechanic guide', 'Get practical safety guidance while you decide whether to request roadside help.'],
    ['Transparent updates', 'Receive assignment and progress notifications without refreshing the page.'],
    ['Operations visibility', 'Admin teams can monitor requests, mechanics, approvals, and bounded reporting windows.'],
  ];

  return (
    <MarketingShell>
      <PageHeader title="Roadside help with a clear next step" description="RoadAssist connects customers, verified mechanics, and operations in one focused workflow." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(([title, description]) => (
          <Card key={title}>
            <Badge tone="brand">RoadAssist</Badge>
            <h2 className="mt-4 text-lg font-bold text-cream">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-steel-300">{description}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/signup"><Button>Get help now</Button></Link>
        <Link to="/onboarding"><Button variant="secondary">See how it works</Button></Link>
      </div>
    </MarketingShell>
  );
}

export function PricingPage() {
  return (
    <MarketingShell>
      <PageHeader title="Simple service pricing" description="Use the catalogue as a starting point; the final amount is confirmed before dispatch and recorded on the request." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIXTURE_SERVICES.map((service) => (
          <Card key={service.id}>
            <h2 className="font-bold text-cream">{service.name}</h2>
            <p className="mt-2 text-sm text-steel-300">{service.desc}</p>
            <p className="mt-5 text-2xl font-bold text-safety-400">From ₹{service.base}</p>
            <p className="mt-1 font-mono text-xs text-steel-400">Typical response: {service.eta}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <p className="font-semibold text-cream">Before you confirm</p>
        <p className="mt-1 text-sm leading-6 text-steel-300">Distance, vehicle type, service complexity, and availability can affect the final quote. The request flow is the source of truth for each rescue.</p>
      </Card>
    </MarketingShell>
  );
}

export function AboutPage() {
  return (
    <MarketingShell>
      <PageHeader title="Built around trust at the roadside" description="RoadAssist is designed to make a stressful moment easier to understand and safer to manage." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><Stat value="01" label="Request" sub="Tell us what happened" /></Card>
        <Card><Stat value="02" label="Verify" sub="Match with an eligible mechanic" /></Card>
        <Card><Stat value="03" label="Recover" sub="Track the rescue to completion" /></Card>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-bold text-cream">For customers</h2>
          <p className="mt-2 text-sm leading-6 text-steel-300">Your request keeps the vehicle, problem, location, status, and service history together so you always know what happens next.</p>
        </Card>
        <Card>
          <h2 className="font-bold text-cream">For mechanics</h2>
          <p className="mt-2 text-sm leading-6 text-steel-300">Workshop applications, verification, incoming offers, active jobs, and earnings live in a dedicated mechanic workspace.</p>
        </Card>
      </div>
    </MarketingShell>
  );
}

export function ContactPage() {
  return (
    <MarketingShell>
      <PageHeader title="Contact and emergency guidance" description="Use the right path for the situation so help can reach you quickly." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-bold text-cream">Need roadside help?</h2>
          <p className="mt-2 text-sm text-steel-300">Sign in and create a request with your vehicle and current location.</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-safety-400" to="/signup">Start a request →</Link>
        </Card>
        <Card>
          <h2 className="font-bold text-cream">Immediate danger?</h2>
          <p className="mt-2 text-sm text-steel-300">Move to a safe place and contact local emergency services first.</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-safety-400" to="/emergency">Open safety guidance →</Link>
        </Card>
        <Card>
          <h2 className="font-bold text-cream">Want to join?</h2>
          <p className="mt-2 text-sm text-steel-300">Create an account, then submit your workshop application for operations review.</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-safety-400" to="/signup">Create an account →</Link>
        </Card>
      </div>
    </MarketingShell>
  );
}

export function OnboardingPage() {
  const steps = [
    ['Tell us where you are', 'Confirm your vehicle and location so the right mechanic can find you.'],
    ['Explain the problem', 'Choose a service or use the guide to describe what happened.'],
    ['Stay informed', 'Watch the request timeline and receive notifications until the job is complete.'],
  ];

  return (
    <MarketingShell>
      <PageHeader title="Welcome to RoadAssist" description="A short route from being stranded to knowing exactly what happens next." />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map(([title, description], index) => (
          <Card key={title}>
            <p className="font-mono text-sm font-bold text-safety-400">0{index + 1}</p>
            <h2 className="mt-3 font-bold text-cream">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-steel-300">{description}</p>
          </Card>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/signup"><Button size="lg">Create your account</Button></Link>
        <Link to="/features"><Button size="lg" variant="secondary">Explore features</Button></Link>
      </div>
    </MarketingShell>
  );
}
