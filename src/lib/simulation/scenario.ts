import type { IconName } from '@/components/Icon';
import type { SimSession, SimRole } from './types';

/**
 * The single demonstration scenario.
 *
 * Fictional people and places only: the customer, workshop and mechanic names
 * are invented, the plate is a demo plate, and the location is a fixed public
 * landmark used as a *simulated* pickup point. No GPS movement is simulated.
 */
export const SIM_SCENARIO = {
  id: 'cubbon-battery',
  title: 'Battery failure near Cubbon Park',
  subtitle: 'Bengaluru · daylight · dry roads',
  ref: 'RA-SIM-1001',
  customer: {
    name: 'Ananya Rao',
    note: 'Fictional customer profile — demo vehicle, demo plate.',
  },
  vehicle: {
    make: 'Maruti Suzuki',
    model: 'Swift',
    year: 2021,
    plate: 'KA01DEMO1',
    type: 'Car · petrol',
  },
  location: {
    label: 'Cubbon Park, Bengaluru',
    note: 'Fixed simulated pickup point — no live movement.',
    lat: 12.9763,
    lng: 77.5929,
  },
  /** Simulated workshop start point (fictional; ~2 km from the pickup). */
  mechanicStart: {
    label: 'Cubbon Auto Works, Residency Road',
    lat: 12.9648,
    lng: 77.6004,
  },
  /**
   * Predefined SIMULATED road geometry from the workshop to the pickup. It is
   * not a live route and carries no traffic data — every surface that draws it
   * labels it as presentation data.
   */
  route: [
    [12.9648, 77.6004],
    [12.9662, 77.5993],
    [12.9682, 77.5981],
    [12.9704, 77.5969],
    [12.9721, 77.5958],
    [12.9736, 77.5948],
    [12.9751, 77.5939],
    [12.9763, 77.5929],
  ] as [number, number][],
  /** Compressed animation duration; the ETA shown is distance-based. */
  journeyDurationMs: 45_000,
  /** Milestones appended to the activity timeline as the vehicle progresses. */
  journeyMilestones: [25, 50, 75],
  category: 'battery',
  problemText: 'Battery dead — engine cranks but will not start',
  garage: {
    name: 'Ravi Kulkarni',
    shop: 'Cubbon Auto Works',
    note: 'Fictional workshop — no real mechanic is dispatched.',
  },
  estimate: {
    diagnosis: 'Alternator not charging; battery at 9.1 V under load. Replace and retest.',
    amountCents: 49900,
    durationMin: 45,
  },
  billing: {
    amountCents: 49900,
    durationMin: 38,
  },
  rating: 5,
} as const;

export type SimStageKey =
  | 'requested'
  | 'accepted'
  | 'on-the-way'
  | 'arrived'
  | 'service'
  | 'estimate'
  | 'completed'
  | 'payment';

export interface SimStage {
  key: SimStageKey;
  label: string;
  short: string;
  icon: IconName;
  /** Which role owns the next action at this stage. */
  owner: SimRole | 'system';
}

/** The workflow the demo must follow — identical ordering to the real product. */
export const SIM_STAGES: SimStage[] = [
  { key: 'requested', label: 'Request raised', short: 'Requested', icon: 'inbox', owner: 'customer' },
  { key: 'accepted', label: 'Offer accepted', short: 'Accepted', icon: 'check', owner: 'mechanic' },
  { key: 'on-the-way', label: 'Mechanic on the way', short: 'On the way', icon: 'navigation', owner: 'mechanic' },
  { key: 'arrived', label: 'Arrived on site', short: 'Arrived', icon: 'map-pin', owner: 'mechanic' },
  { key: 'service', label: 'Service started', short: 'Service', icon: 'wrench', owner: 'mechanic' },
  { key: 'estimate', label: 'Estimate approved', short: 'Estimate', icon: 'receipt', owner: 'customer' },
  { key: 'completed', label: 'Repair completed', short: 'Completed', icon: 'check-circle', owner: 'mechanic' },
  { key: 'payment', label: 'Payment recorded', short: 'Payment', icon: 'wallet', owner: 'mechanic' },
];

export interface StageView extends SimStage {
  state: 'done' | 'current' | 'waiting' | 'next';
}

/**
 * Per-stage view derived from the session. Completion stays "next" while the
 * estimate is pending — the customer's approval is the gate.
 */
export function stageViews(session: SimSession): StageView[] {
  const status = session.status;
  const done: Record<SimStageKey, boolean> = {
    requested: session.request != null,
    accepted: session.request != null && status !== 'requested',
    'on-the-way': status === 'arrived' || status === 'service' || status === 'completed',
    arrived: status === 'service' || status === 'completed',
    service: status === 'service' || status === 'completed',
    estimate: session.estimate.state === 'approved',
    completed: status === 'completed',
    payment: session.payment.state === 'recorded',
  };

  let claimed = false;
  return SIM_STAGES.map((stage) => {
    if (done[stage.key]) return { ...stage, state: 'done' as const };
    if (stage.key === 'estimate' && session.estimate.state === 'pending') {
      // Waiting on the customer: this is the current step, but nobody is blocked-but-able.
      claimed = true;
      return { ...stage, state: 'waiting' as const };
    }
    if (!claimed) {
      claimed = true;
      return { ...stage, state: 'current' as const };
    }
    return { ...stage, state: 'next' as const };
  });
}

/** Who must act next — drives the "over to you" prompt in each role view. */
export function nextActor(session: SimSession): { role: SimRole; label: string } | null {
  if (!session.request) return { role: 'customer', label: 'Customer raises the breakdown request' };
  const current = stageViews(session).find((s) => s.state === 'current' || s.state === 'waiting');
  if (!current) return null;
  if (current.state === 'waiting') {
    return { role: 'customer', label: 'Customer approves or rejects the estimate' };
  }
  switch (current.key) {
    case 'requested':
      return { role: 'customer', label: 'Customer raises the breakdown request' };
    case 'accepted':
      return { role: 'mechanic', label: 'Mechanic starts the journey to the pickup point' };
    case 'on-the-way':
      return { role: 'mechanic', label: 'Mechanic arrives, then inspects the vehicle' };
    case 'arrived':
      return { role: 'mechanic', label: 'Mechanic starts service after inspecting the vehicle' };
    case 'service':
      return { role: 'mechanic', label: 'Mechanic submits the diagnosis and estimate' };
    case 'estimate':
      return { role: 'customer', label: 'Customer approves or rejects the estimate' };
    case 'completed':
      return { role: 'mechanic', label: 'Mechanic completes the repair' };
    case 'payment':
      return { role: 'mechanic', label: 'Mechanic records the payment' };
    default:
      return null;
  }
}
