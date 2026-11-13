/**
 * Presentation simulation — types.
 *
 * SIMULATION DATA IS NOT OPERATIONAL DATA. Nothing in `src/lib/simulation`
 * imports Firebase: the session lives in memory + one localStorage key, so a
 * simulated request can never reach Firestore, real analytics, mechanic
 * earnings or customer history.
 */

export type SimRole = 'customer' | 'mechanic' | 'admin';

/** Mirrors the real request lifecycle (no separate offer collection is needed). */
export type SimStatus = 'requested' | 'accepted' | 'on-the-way' | 'arrived' | 'service' | 'completed';

export type EstimateState = 'none' | 'pending' | 'approved' | 'rejected';
export type PaymentState = 'none' | 'recorded';
export type SimTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export interface SimVehicle {
  make: string;
  model: string;
  year: number;
  plate: string;
  type: string;
}

export interface SimRequest {
  id: string;
  ref: string;
  customerName: string;
  vehicle: SimVehicle;
  locationLabel: string;
  category: string;
  problemText: string;
  createdAt: number;
}

export interface SimMechanic {
  name: string;
  shop: string;
  acceptedAt: number;
}

export interface SimEstimate {
  state: EstimateState;
  diagnosis: string | null;
  amountCents: number | null;
  durationMin: number | null;
  submittedAt: number | null;
  decidedAt: number | null;
}

export interface SimBilling {
  amountCents: number | null;
  durationMin: number | null;
  completedAt: number | null;
}

export interface SimPayment {
  state: PaymentState;
  method: 'cash' | 'upi' | null;
  amountCents: number | null;
  recordedAt: number | null;
}

export interface SimActivity {
  id: string;
  at: number;
  actor: SimRole | 'system';
  label: string;
  tone: SimTone;
}

/**
 * Simulated travel clock. The marker position is DERIVED from this clock
 * (`journeySnapshot`) rather than written on every tick, so every tab renders
 * the same position and no storage write storm is produced.
 */
export interface SimJourney {
  /** Predefined simulated geometry, [lat, lng] from mechanic start to pickup. */
  route: [number, number][];
  startedAt: number | null;
  paused: boolean;
  accumulatedMs: number;
  pausedAt: number | null;
  arrivedAt: number | null;
  /** Progress milestones already appended to the activity timeline. */
  milestones: number[];
}

export interface SimSession {
  version: 1;
  phase: 'idle' | 'live' | 'complete';
  autoPlay: boolean;
  request: SimRequest | null;
  status: SimStatus;
  offer: 'none' | 'pending' | 'accepted';
  mechanic: SimMechanic | null;
  journey: SimJourney;
  estimate: SimEstimate;
  billing: SimBilling;
  payment: SimPayment;
  rating: number | null;
  activity: SimActivity[];
  updatedAt: number;
}

export type SimAction =
  | { type: 'start' }
  | { type: 'accept-offer' }
  | { type: 'start-journey' }
  | { type: 'pause-journey' }
  | { type: 'resume-journey' }
  | { type: 'arrive' }
  | { type: 'milestone'; value: number }
  | { type: 'advance'; to: 'service' }
  | { type: 'submit-estimate'; diagnosis: string; amountCents: number; durationMin: number }
  | { type: 'decide-estimate'; decision: 'approve' | 'reject' }
  | { type: 'complete-job'; amountCents: number; durationMin: number }
  | { type: 'record-payment'; method: 'cash' | 'upi'; amountCents: number }
  | { type: 'set-autoplay'; playing: boolean }
  | { type: 'reset' };

export interface SimResult {
  state: SimSession;
  ok: boolean;
  reason?: string;
}
