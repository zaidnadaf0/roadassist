import { useSyncExternalStore } from 'react';
import { SIM_SCENARIO } from './scenario';
import type { SimAction, SimActivity, SimJourney, SimResult, SimSession, SimTone, SimRole } from './types';
import { etaMinutes, polylineLengthKm, positionAlongRoute } from '@/lib/tracking';

/**
 * Presentation simulation store.
 *
 * Isolation contract (enforced by construction, not by convention):
 *   - this module imports NOTHING from Firebase — there is no code path from a
 *     simulation action to a Firestore write;
 *   - the session is a single JSON value under `roadassist.simulation.v1`,
 *     separate from the existing `roadassist.demoState.v1` fixtures key;
 *   - every view that renders it is a dedicated presentation screen, so the
 *     data cannot appear in the real customer/mechanic/admin queries.
 *
 * Travel is a CLOCK, not a stream of writes: `startedAt` + `paused` +
 * `accumulatedMs` live in the session, and the marker position is derived by
 * `journeySnapshot()`. Every tab therefore renders the same position, the
 * animation is deterministic, and only milestone events touch storage.
 *
 * Cross-tab synchronisation uses the native `storage` event (no dependency).
 */

export const SIM_STORAGE_KEY = 'roadassist.simulation.v1';
export const MAX_AMOUNT_CENTS = 1_000_000;
export const MAX_DURATION_MIN = 1440;
export const MAX_DIAGNOSIS_CHARS = 2000;

export function emptyJourney(): SimJourney {
  return {
    route: SIM_SCENARIO.route.map((point) => [point[0], point[1]] as [number, number]),
    startedAt: null,
    paused: false,
    accumulatedMs: 0,
    pausedAt: null,
    arrivedAt: null,
    milestones: [],
  };
}

export function emptySession(): SimSession {
  return {
    version: 1,
    phase: 'idle',
    autoPlay: false,
    request: null,
    status: 'requested',
    offer: 'none',
    mechanic: null,
    journey: emptyJourney(),
    estimate: { state: 'none', diagnosis: null, amountCents: null, durationMin: null, submittedAt: null, decidedAt: null },
    billing: { amountCents: null, durationMin: null, completedAt: null },
    payment: { state: 'none', method: null, amountCents: null, recordedAt: null },
    rating: null,
    activity: [],
    updatedAt: 0,
  };
}

function log(state: SimSession, actor: SimRole | 'system', label: string, tone: SimTone, now: number): SimActivity[] {
  const entry: SimActivity = { id: `a${state.activity.length + 1}`, at: now, actor, label, tone };
  return [...state.activity, entry];
}

function fail(state: SimSession, reason: string): SimResult {
  return { state, ok: false, reason };
}

function elapsedMs(journey: SimJourney, now: number): number {
  if (journey.arrivedAt != null) return journey.accumulatedMs;
  if (journey.startedAt == null) return journey.accumulatedMs;
  if (journey.paused) return journey.accumulatedMs;
  return journey.accumulatedMs + Math.max(0, now - journey.startedAt);
}

export interface JourneySnapshot {
  /** True while the simulated vehicle should be moving. */
  travelling: boolean;
  progress: number;
  position: [number, number];
  travelledKm: number;
  remainingKm: number;
  /** Distance-derived ETA in minutes (null before the journey starts). */
  etaMin: number | null;
  arrived: boolean;
  paused: boolean;
}

/**
 * Derived travel state — the single source of truth for the map, ETA and
 * progress in every role view.
 */
export function journeySnapshot(session: SimSession, nowMs = Date.now()): JourneySnapshot {
  const journey = session.journey;
  const totalKm = polylineLengthKm(journey.route);
  const start = journey.route[0] ?? [0, 0];
  const end = journey.route[journey.route.length - 1] ?? [0, 0];

  if (journey.arrivedAt != null) {
    return {
      travelling: false,
      progress: 1,
      position: [end[0], end[1]],
      travelledKm: totalKm,
      remainingKm: 0,
      etaMin: 0,
      arrived: true,
      paused: false,
    };
  }
  if (journey.startedAt == null) {
    return {
      travelling: false,
      progress: 0,
      position: [start[0], start[1]],
      travelledKm: 0,
      remainingKm: totalKm,
      etaMin: null,
      arrived: false,
      paused: false,
    };
  }
  const raw = elapsedMs(journey, nowMs) / SIM_SCENARIO.journeyDurationMs;
  const progress = Math.min(0.999, Math.max(0, raw));
  const at = positionAlongRoute(journey.route, progress);
  return {
    travelling: !journey.paused && progress < 1,
    progress,
    position: at.position,
    travelledKm: at.travelledKm,
    remainingKm: at.remainingKm,
    etaMin: etaMinutes(at.remainingKm),
    arrived: false,
    paused: journey.paused,
  };
}

/**
 * Pure reducer. `now` is injected so the workflow is deterministic in tests.
 * Every guard mirrors the real product's business rules (ordering, bounds and
 * the completion gate) without touching server-owned authority.
 */
export function reduceSession(state: SimSession, action: SimAction, now = Date.now()): SimResult {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'idle') return fail(state, 'The scenario is already running. Reset it to start again.');
      const request = {
        id: `sim-${SIM_SCENARIO.id}`,
        ref: SIM_SCENARIO.ref,
        customerName: SIM_SCENARIO.customer.name,
        vehicle: { ...SIM_SCENARIO.vehicle },
        locationLabel: SIM_SCENARIO.location.label,
        category: SIM_SCENARIO.category,
        problemText: SIM_SCENARIO.problemText,
        createdAt: now,
      };
      return {
        ok: true,
        state: {
          ...emptySession(),
          phase: 'live',
          request,
          status: 'requested',
          offer: 'pending',
          updatedAt: now,
          activity: log(state, 'customer', 'Customer raised a breakdown request', 'brand', now),
        },
      };
    }

    case 'accept-offer': {
      if (state.phase === 'idle' || !state.request) return fail(state, 'Raise the request before accepting an offer.');
      if (state.status !== 'requested' || state.offer !== 'pending') return fail(state, 'There is no pending offer to accept.');
      return {
        ok: true,
        state: {
          ...state,
          status: 'accepted',
          offer: 'accepted',
          mechanic: { name: SIM_SCENARIO.garage.name, shop: SIM_SCENARIO.garage.shop, acceptedAt: now },
          updatedAt: now,
          activity: log(state, 'mechanic', `${SIM_SCENARIO.garage.shop} accepted the job offer`, 'success', now),
        },
      };
    }

    case 'start-journey': {
      if (state.status !== 'accepted') return fail(state, 'The mechanic must accept the job before starting the journey.');
      return {
        ok: true,
        state: {
          ...state,
          status: 'on-the-way',
          journey: { ...emptyJourney(), startedAt: now },
          updatedAt: now,
          activity: log(state, 'mechanic', 'Mechanic started the journey to the pickup point', 'neutral', now),
        },
      };
    }

    case 'pause-journey': {
      if (state.status !== 'on-the-way') return fail(state, 'There is no journey in progress.');
      if (state.journey.paused) return fail(state, 'The journey is already paused.');
      return {
        ok: true,
        state: {
          ...state,
          journey: {
            ...state.journey,
            accumulatedMs: elapsedMs(state.journey, now),
            paused: true,
            pausedAt: now,
            startedAt: state.journey.startedAt ?? now,
          },
          updatedAt: now,
          activity: log(state, 'mechanic', 'Journey paused for the demonstration', 'warning', now),
        },
      };
    }

    case 'resume-journey': {
      if (state.status !== 'on-the-way') return fail(state, 'There is no journey in progress.');
      if (!state.journey.paused) return fail(state, 'The journey is already running.');
      return {
        ok: true,
        state: {
          ...state,
          journey: { ...state.journey, paused: false, pausedAt: null, startedAt: now },
          updatedAt: now,
          activity: log(state, 'mechanic', 'Journey resumed', 'neutral', now),
        },
      };
    }

    case 'milestone': {
      if (state.status !== 'on-the-way' || state.journey.arrivedAt != null) return fail(state, 'No journey is in progress.');
      if (state.journey.milestones.includes(action.value)) return fail(state, 'That milestone is already recorded.');
      if (!SIM_SCENARIO.journeyMilestones.includes(action.value as 25 | 50 | 75)) {
        return fail(state, 'Unknown journey milestone.');
      }
      return {
        ok: true,
        state: {
          ...state,
          journey: { ...state.journey, milestones: [...state.journey.milestones, action.value] },
          updatedAt: now,
          activity: log(state, 'system', `Journey ${action.value}% of the way to the pickup point`, 'neutral', now),
        },
      };
    }

    case 'arrive': {
      if (state.status !== 'on-the-way') return fail(state, 'The mechanic is not travelling to this job.');
      const snap = journeySnapshot(state, now);
      return {
        ok: true,
        state: {
          ...state,
          status: 'arrived',
          journey: {
            ...state.journey,
            paused: false,
            pausedAt: null,
            // Arrival stops the animation and pins the vehicle at the pickup.
            accumulatedMs: SIM_SCENARIO.journeyDurationMs,
            arrivedAt: now,
          },
          updatedAt: now,
          activity: log(
            state,
            'mechanic',
            `Mechanic arrived at the pickup point${snap.progress < 0.999 ? ' (arrival marked early)' : ''}`,
            'success',
            now,
          ),
        },
      };
    }

    case 'advance': {
      if (state.status !== 'arrived' || action.to !== 'service') {
        return fail(state, 'Service can only start after the mechanic has arrived.');
      }
      return {
        ok: true,
        state: {
          ...state,
          status: 'service',
          updatedAt: now,
          activity: log(state, 'mechanic', 'Vehicle inspected — service started on site', 'brand', now),
        },
      };
    }

    case 'submit-estimate': {
      if (state.status !== 'service') return fail(state, 'An estimate can only be submitted after arrival and inspection.');
      if (state.estimate.state === 'approved') return fail(state, 'The customer already approved this estimate.');
      if (state.estimate.state === 'pending') return fail(state, 'The estimate is already awaiting the customer.');
      const diagnosis = action.diagnosis.trim();
      if (diagnosis.length === 0) return fail(state, 'Add a short diagnosis before submitting.');
      if (diagnosis.length > MAX_DIAGNOSIS_CHARS) return fail(state, 'The diagnosis is too long.');
      if (!Number.isFinite(action.amountCents) || action.amountCents < 0 || action.amountCents > MAX_AMOUNT_CENTS) {
        return fail(state, 'The estimate amount is outside the allowed range.');
      }
      if (!Number.isFinite(action.durationMin) || action.durationMin < 0 || action.durationMin > MAX_DURATION_MIN) {
        return fail(state, 'The estimated duration is outside the allowed range.');
      }
      return {
        ok: true,
        state: {
          ...state,
          estimate: {
            state: 'pending',
            diagnosis,
            amountCents: Math.round(action.amountCents),
            durationMin: Math.round(action.durationMin),
            submittedAt: now,
            decidedAt: null,
          },
          updatedAt: now,
          activity: log(state, 'mechanic', 'Mechanic submitted a repair estimate', 'warning', now),
        },
      };
    }

    case 'decide-estimate': {
      if (state.estimate.state !== 'pending') return fail(state, 'There is no pending estimate to decide.');
      const approved = action.decision === 'approve';
      return {
        ok: true,
        state: {
          ...state,
          estimate: { ...state.estimate, state: approved ? 'approved' : 'rejected', decidedAt: now },
          updatedAt: now,
          activity: log(
            state,
            'customer',
            approved ? 'Customer approved the estimate' : 'Customer rejected the estimate',
            approved ? 'success' : 'danger',
            now,
          ),
        },
      };
    }

    case 'complete-job': {
      if (state.status !== 'service') return fail(state, 'The job is not in service.');
      if (state.estimate.state !== 'approved') {
        // The same gate the real product enforces in advanceJob() and in rules.
        return fail(state, 'Completion is blocked until the customer approves the estimate.');
      }
      if (!Number.isFinite(action.amountCents) || action.amountCents < 0 || action.amountCents > MAX_AMOUNT_CENTS) {
        return fail(state, 'The final bill is outside the allowed range.');
      }
      if (!Number.isFinite(action.durationMin) || action.durationMin < 0 || action.durationMin > MAX_DURATION_MIN) {
        return fail(state, 'The on-site duration is outside the allowed range.');
      }
      return {
        ok: true,
        state: {
          ...state,
          status: 'completed',
          billing: {
            amountCents: Math.round(action.amountCents),
            durationMin: Math.round(action.durationMin),
            completedAt: now,
          },
          rating: SIM_SCENARIO.rating,
          updatedAt: now,
          activity: log(state, 'mechanic', 'Repair completed and final bill recorded', 'success', now),
        },
      };
    }

    case 'record-payment': {
      if (state.status !== 'completed') return fail(state, 'A payment can only be recorded after completion.');
      if (state.payment.state === 'recorded') return fail(state, 'The payment is already recorded.');
      if (action.method !== 'cash' && action.method !== 'upi') return fail(state, 'Choose cash or UPI.');
      if (state.billing.amountCents != null && Math.round(action.amountCents) !== state.billing.amountCents) {
        return fail(state, 'The recorded amount must match the final bill.');
      }
      return {
        ok: true,
        state: {
          ...state,
          phase: 'complete',
          payment: { state: 'recorded', method: action.method, amountCents: Math.round(action.amountCents), recordedAt: now },
          updatedAt: now,
          activity: log(state, 'mechanic', `Payment recorded (${action.method.toUpperCase()})`, 'success', now),
        },
      };
    }

    case 'set-autoplay':
      return { ok: true, state: { ...state, autoPlay: action.playing, updatedAt: now } };

    case 'reset':
      return { ok: true, state: emptySession() };

    default:
      return fail(state, 'Unknown action.');
  }
}

/**
 * Records the next crossed journey milestone (25/50/75%). Called by the page's
 * animation clock; returns the applied action so callers can surface it.
 */
export function simTick(now = Date.now()): SimAction | null {
  const session = getSimSnapshot();
  if (session.status !== 'on-the-way') return null;
  const snap = journeySnapshot(session, now);
  if (!snap.travelling) return null;
  const percent = snap.progress * 100;
  for (const milestone of SIM_SCENARIO.journeyMilestones) {
    if (percent >= milestone && !session.journey.milestones.includes(milestone)) {
      const action: SimAction = { type: 'milestone', value: milestone };
      simDispatch(action, now);
      return action;
    }
  }
  return null;
}

/**
 * Next action for the guided controller. Returns null when the scenario is
 * waiting for a human decision (customer approval), for the vehicle to reach
 * the pickup, or when it has finished.
 */
export function autoStep(state: SimSession, now = Date.now()): SimAction | null {
  if (state.phase !== 'live' || !state.request) return null;
  switch (state.status) {
    case 'requested':
      return state.offer === 'pending' ? { type: 'accept-offer' } : null;
    case 'accepted':
      return { type: 'start-journey' };
    case 'on-the-way': {
      const snap = journeySnapshot(state, now);
      // Guided mode drives the arrival once the vehicle has actually arrived.
      return snap.progress >= 0.999 ? { type: 'arrive' } : null;
    }
    case 'arrived':
      return { type: 'advance', to: 'service' };
    case 'service':
      if (state.estimate.state === 'none' || state.estimate.state === 'rejected') {
        return {
          type: 'submit-estimate',
          diagnosis: SIM_SCENARIO.estimate.diagnosis,
          amountCents: SIM_SCENARIO.estimate.amountCents,
          durationMin: SIM_SCENARIO.estimate.durationMin,
        };
      }
      if (state.estimate.state === 'approved') {
        return {
          type: 'complete-job',
          amountCents: SIM_SCENARIO.billing.amountCents,
          durationMin: SIM_SCENARIO.billing.durationMin,
        };
      }
      return null; // pending → waiting for the customer
    case 'completed':
      if (state.payment.state === 'none') {
        return { type: 'record-payment', method: 'cash', amountCents: state.billing.amountCents ?? SIM_SCENARIO.billing.amountCents };
      }
      return null;
    default:
      return null;
  }
}

/* ---------------- browser store ---------------- */

function parseSession(raw: string | null): SimSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SimSession>;
    if (!value || value.version !== 1) return null;
    const base = emptySession();
    return {
      ...base,
      ...value,
      journey: { ...base.journey, ...(value.journey ?? {}) },
      estimate: { ...base.estimate, ...(value.estimate ?? {}) },
      billing: { ...base.billing, ...(value.billing ?? {}) },
      payment: { ...base.payment, ...(value.payment ?? {}) },
      activity: Array.isArray(value.activity) ? value.activity : [],
    };
  } catch {
    return null;
  }
}

function readStorage(): SimSession | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseSession(window.localStorage.getItem(SIM_STORAGE_KEY));
  } catch {
    return null;
  }
}

let current: SimSession = readStorage() ?? emptySession();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(next: SimSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable (private mode); the in-memory session still works */
  }
}

if (typeof window !== 'undefined') {
  // Another tab changed the session: adopt it so all three role views agree.
  window.addEventListener('storage', (event) => {
    if (event.key !== SIM_STORAGE_KEY) return;
    current = parseSession(event.newValue) ?? emptySession();
    emit();
  });
}

export function getSimSnapshot(): SimSession {
  return current;
}

export function subscribeSim(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies one action, persists the result and notifies every subscriber. */
export function simDispatch(action: SimAction, now = Date.now()): SimResult {
  const result = reduceSession(current, action, now);
  if (result.state !== current) {
    current = result.state;
    persist(current);
    emit();
  }
  return result;
}

/** Replaces the in-memory session from storage (used by tests and hard reloads). */
export function reloadSim(): SimSession {
  current = readStorage() ?? emptySession();
  emit();
  return current;
}

export function useSimulation(): SimSession {
  return useSyncExternalStore(subscribeSim, getSimSnapshot, getSimSnapshot);
}
