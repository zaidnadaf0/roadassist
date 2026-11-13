import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Button, Card } from '@/components/ui';
import { firebaseConfigured, firebaseProjectId } from '@/lib/firebase';

/**
 * Mode A — the real, Firebase-backed workflow.
 *
 * This screen deliberately does NOT recreate any product screen: it opens the
 * genuine portals and lists the runbook. Credentials are never printed here —
 * accounts are provisioned separately (emulator seed script or your own admin
 * provisioning), so the demo cannot leak secrets.
 */

const ROLE_ENTRIES: { role: string; icon: IconName; login: string; label: string; detail: string }[] = [
  { role: 'Customer', icon: 'car-front', login: '/customer/login', label: 'Customer portal', detail: 'Raise a request, approve the estimate, keep the receipt.' },
  { role: 'Mechanic', icon: 'wrench', login: '/mechanic/login', label: 'Mechanic portal', detail: 'Accept a dispatched offer, price the job, record payment.' },
  { role: 'Admin', icon: 'chart-bar', login: '/admin/login', label: 'Admin portal', detail: 'Monitor dispatch, requests and analytics.' },
];

const RUNBOOK: { role: string; steps: string[]; icon: IconName }[] = [
  {
    role: 'Customer',
    icon: 'car-front',
    steps: [
      'Sign in with a provisioned customer account.',
      'Open My Vehicles — confirm a registered vehicle exists.',
      'Choose Request Help and complete the four-step wizard.',
      'Pick the breakdown category, then a GPS or manual location.',
      'Submit the request and watch its status on Track Request.',
      'Wait for the assignment, then follow progress on the timeline.',
      'Review the estimate when it arrives and approve or reject it.',
      'After completion, read the receipt and record the offline payment.',
    ],
  },
  {
    role: 'Mechanic',
    icon: 'wrench',
    steps: [
      'Sign in with a provisioned, approved mechanic account.',
      'Open Incoming Requests to see the dispatched offer.',
      'Accept it — assignment happens inside the dispatch callable, never in this page.',
      'Open the job, then advance: on the way, arrived, service.',
      'Submit the diagnosis and repair estimate.',
      'Wait for customer approval — completion stays blocked until then.',
      'Complete the repair with the final bill.',
      'Record the cash/UPI payment, then review Job History and Earnings.',
    ],
  },
  {
    role: 'Admin',
    icon: 'chart-bar',
    steps: [
      'Sign in with a claim-admin account.',
      'Open Dispatch: open offers, active assignments, in-service counts.',
      'Open Requests and inspect the same request in detail.',
      'Confirm mechanic availability under Mechanics.',
      'Review Analytics for the operational summary.',
    ],
  },
];

export function RealModePage() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-5">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-success">Mode A</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-cream">Real working demonstration</h1>
        </div>
        <Badge tone="success">
          <span className="inline-flex items-center gap-1"><Icon name="shield-check" size={11} />Real Firebase · authenticated</span>
        </Badge>
      </div>

      {/* Readiness */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cream">Environment readiness</p>
            <p className="mt-1 text-xs leading-5 text-steel-400">
              {firebaseConfigured
                ? `Connected to a configured Firebase project${firebaseProjectId ? ` (${firebaseProjectId})` : ''}. Accounts must exist in this project — sign-in never creates roles.`
                : 'Firebase is not configured in this build. Copy .env.example to .env.emulator (or .env.local), start the local emulators and seed the demo accounts before running this mode.'}
            </p>
            {!firebaseConfigured && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-line-soft bg-grease-soft px-3 py-2 font-mono text-[11px] leading-5 text-steel-300">
{`npm run dev:emulators   # auth + firestore + functions + pubsub
npm run seed:local      # provisions demo accounts & fixture data`}
              </pre>
            )}
          </div>
          <Badge tone={firebaseConfigured ? 'success' : 'warning'}>{firebaseConfigured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        <p className="mt-3 rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2 text-[11px] leading-4 text-steel-400">
          Passwords are never displayed by RoadAssist. The local seed script provisions known demo accounts for
          emulator/staging use; in any other environment, create accounts through your normal admin provisioning flow.
        </p>
      </Card>

      {/* Entries */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {ROLE_ENTRIES.map((entry) => (
          <Card key={entry.role} className="flex flex-col">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-line-soft bg-graphite-soft text-safety-300">
              <Icon name={entry.icon} size={17} />
            </span>
            <p className="mt-3 text-sm font-semibold text-cream">{entry.label}</p>
            <p className="mt-1 text-xs leading-5 text-steel-400">{entry.detail}</p>
            <div className="mt-auto pt-3">
              <Link to={entry.login}>
                <Button size="sm" variant="secondary">Sign in as {entry.role.toLowerCase()}</Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>

      {/* Runbook */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {RUNBOOK.map((block) => (
          <Card key={block.role}>
            <div className="flex items-center gap-2">
              <Icon name={block.icon} size={16} className="text-safety-300" />
              <p className="text-sm font-semibold text-cream">{block.role} runbook</p>
            </div>
            <ol className="mt-2.5 grid gap-2">
              {block.steps.map((step, i) => (
                <li key={step} className="flex gap-2 text-xs leading-5 text-steel-300">
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-steel-500">{String(i + 1).padStart(2, '0')}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </section>

      {/* Guardrails */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: 'shield-check' as IconName, title: 'Server-authoritative assignment', body: 'Accepting a job travels through the dispatch callable transaction. No interface here can create an accepted assignment.' },
          { icon: 'receipt' as IconName, title: 'Approval before completion', body: 'The mechanic cannot mark a job complete until the customer has approved the estimate — enforced by client logic and Firestore rules.' },
          { icon: 'wallet' as IconName, title: 'Payments are recorded, not verified', body: 'Cash/UPI entries describe what an authorised actor reported. RoadAssist does not independently verify the transaction.' },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-line-soft bg-graphite-card p-4">
            <Icon name={item.icon} size={16} className="text-safety-300" />
            <p className="mt-2 text-sm font-semibold text-cream">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-steel-400">{item.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-5 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[11px] leading-4 text-warning">
        Data honesty: records created here live in your configured Firebase project (local emulator or your own staging
        project). They are demo-account data, not real customer business activity, and must not be presented as such.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to="/experience/simulation">
          <Button variant="secondary">Prefer a scripted run? Open the simulation</Button>
        </Link>
        <Link to="/experience" className="text-xs font-semibold text-safety-300 hover:text-safety-200">← Back to Live Experience</Link>
      </div>
    </div>
  );
}
