import { describe, expect, it } from 'vitest';
import { SIM_SCENARIO } from '@/lib/simulation/scenario';
import { autoStep, emptySession, journeySnapshot, reduceSession } from '@/lib/simulation/store';
import type { SimAction, SimSession } from '@/lib/simulation/types';

const T0 = Date.UTC(2026, 10, 2, 8, 50);

function run(actions: SimAction[], start: SimSession = emptySession(), step = 1000): SimSession {
  let state = start;
  let now = T0;
  for (const action of actions) {
    state = reduceSession(state, action, now).state;
    now += step;
  }
  return state;
}

function start(): SimSession {
  return run([{ type: 'start' }]);
}

/** Accepted job, journey not started yet. */
function accepted(): SimSession {
  return run([{ type: 'start' }, { type: 'accept-offer' }]);
}

/** On the road (journey started a moment ago). */
function travelling(): SimSession {
  return run([{ type: 'start' }, { type: 'accept-offer' }, { type: 'start-journey' }]);
}

/** Arrived on site, service not started. */
function arrived(): SimSession {
  return run([{ type: 'start' }, { type: 'accept-offer' }, { type: 'start-journey' }, { type: 'arrive' }]);
}

/** In service after inspection. */
function inService(): SimSession {
  return run([{ type: 'start' }, { type: 'accept-offer' }, { type: 'start-journey' }, { type: 'arrive' }, { type: 'advance', to: 'service' }]);
}

const ESTIMATE: SimAction = {
  type: 'submit-estimate',
  diagnosis: SIM_SCENARIO.estimate.diagnosis,
  amountCents: SIM_SCENARIO.estimate.amountCents,
  durationMin: SIM_SCENARIO.estimate.durationMin,
};

describe('simulation — scenario lifecycle', () => {
  it('starts idle and creates the fictional request on Start', () => {
    expect(emptySession().phase).toBe('idle');
    expect(emptySession().request).toBeNull();

    const state = start();
    expect(state.phase).toBe('live');
    expect(state.status).toBe('requested');
    expect(state.offer).toBe('pending');
    expect(state.request).toMatchObject({
      ref: 'RA-SIM-1001',
      customerName: SIM_SCENARIO.customer.name,
      locationLabel: 'Cubbon Park, Bengaluru',
      category: 'battery',
    });
    expect(state.request?.vehicle.plate).toBe('KA01DEMO1');
    expect(state.journey.startedAt).toBeNull();
  });

  it('refuses to start twice without a reset', () => {
    const started = start();
    const second = reduceSession(started, { type: 'start' }, T0);
    expect(second.ok).toBe(false);
    expect(second.state).toBe(started);
  });

  it('accepts the offer only from a pending offer', () => {
    const acceptedState = reduceSession(start(), { type: 'accept-offer' }, T0);
    expect(acceptedState.ok).toBe(true);
    expect(acceptedState.state.status).toBe('accepted');
    expect(acceptedState.state.mechanic?.shop).toBe(SIM_SCENARIO.garage.shop);

    const twice = reduceSession(acceptedState.state, { type: 'accept-offer' }, T0);
    expect(twice.ok).toBe(false);
  });

  it('requires acceptance before the journey can start', () => {
    const early = reduceSession(start(), { type: 'start-journey' }, T0);
    expect(early.ok).toBe(false);
    expect(early.reason).toMatch(/accept/i);

    const started = reduceSession(accepted(), { type: 'start-journey' }, T0);
    expect(started.ok).toBe(true);
    expect(started.state.status).toBe('on-the-way');
    expect(started.state.journey.startedAt).toBe(T0);
  });

  it('does not allow service before arrival', () => {
    const early = reduceSession(travelling(), { type: 'advance', to: 'service' }, T0);
    expect(early.ok).toBe(false);
    expect(early.reason).toMatch(/arrive/i);

    const afterArrival = reduceSession(arrived(), { type: 'advance', to: 'service' }, T0);
    expect(afterArrival.ok).toBe(true);
    expect(afterArrival.state.status).toBe('service');
  });
});

describe('simulation — journey, distance and ETA', () => {
  it('starts at the workshop with the full route remaining', () => {
    const snap = journeySnapshot(accepted(), T0);
    expect(snap.progress).toBe(0);
    expect(snap.travelling).toBe(false);
    expect(snap.remainingKm).toBeGreaterThan(1.5);
    expect(snap.etaMin).toBeNull();
    expect(snap.position[0]).toBeCloseTo(SIM_SCENARIO.mechanicStart.lat, 4);
  });

  it('moves deterministically and decreases remaining distance and ETA', () => {
    const state = travelling();
    const snapshots = [0, 0.25, 0.5, 0.75, 0.95].map((p) =>
      journeySnapshot(state, T0 + Math.round(SIM_SCENARIO.journeyDurationMs * p)),
    );
    const progresses = snapshots.map((s) => s.progress);
    for (let i = 1; i < progresses.length; i++) expect(progresses[i]).toBeGreaterThan(progresses[i - 1]);

    const remaining = snapshots.map((s) => s.remainingKm);
    for (let i = 1; i < remaining.length; i++) expect(remaining[i]).toBeLessThan(remaining[i - 1]);

    const etas = snapshots.slice(1).map((s) => s.etaMin ?? 0);
    for (let i = 1; i < etas.length; i++) expect(etas[i]).toBeLessThanOrEqual(etas[i - 1]);

    // Position interpolates between route vertices instead of jumping.
    const positions = snapshots.map((s) => s.position[0]);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      expect(positions[i] - positions[i - 1]).toBeLessThan(0.01);
    }
  });

  it('pause freezes progress and resume continues from the same point', () => {
    const state = travelling();
    const halfway = T0 + SIM_SCENARIO.journeyDurationMs / 2;
    const before = journeySnapshot(state, halfway);
    const paused = reduceSession(state, { type: 'pause-journey' }, halfway).state;
    const frozen = journeySnapshot(paused, halfway + 20_000);
    expect(frozen.travelling).toBe(false);
    expect(frozen.paused).toBe(true);
    expect(frozen.progress).toBeCloseTo(before.progress, 5);

    const resumedAt = halfway + 20_000;
    const resumed = reduceSession(paused, { type: 'resume-journey' }, resumedAt).state;
    const later = journeySnapshot(resumed, resumedAt + 5_000);
    expect(later.travelling).toBe(true);
    expect(later.progress).toBeGreaterThan(frozen.progress);
  });

  it('arrival stops the journey at the pickup and clears the ETA', () => {
    const state = travelling();
    const at = T0 + 5_000;
    const moved = journeySnapshot(state, at);
    const done = reduceSession(state, { type: 'arrive' }, at).state;
    const snap = journeySnapshot(done, at + 60_000);

    expect(done.status).toBe('arrived');
    expect(done.journey.arrivedAt).toBe(at);
    expect(snap.arrived).toBe(true);
    expect(snap.travelling).toBe(false);
    expect(snap.remainingKm).toBe(0);
    expect(snap.etaMin).toBe(0);
    expect(snap.progress).toBe(1);
    expect(snap.position[0]).toBeCloseTo(SIM_SCENARIO.location.lat, 4);
    expect(snap.position[1]).toBeCloseTo(SIM_SCENARIO.location.lng, 4);
    // Arrival was marked early: the marker is snapped to the pickup regardless.
    expect(moved.progress).toBeLessThan(0.999);
  });

  it('records each journey milestone once, and only while travelling', () => {
    let state = travelling();
    const first = reduceSession(state, { type: 'milestone', value: 50 }, T0 + 1);
    expect(first.ok).toBe(true);
    expect(first.state.journey.milestones).toEqual([50]);
    state = first.state;

    const again = reduceSession(state, { type: 'milestone', value: 50 }, T0 + 2);
    expect(again.ok).toBe(false);

    const unknown = reduceSession(state, { type: 'milestone', value: 10 }, T0 + 2);
    expect(unknown.ok).toBe(false);

    const arrivedState = arrived();
    const afterArrival = reduceSession(arrivedState, { type: 'milestone', value: 25 }, T0 + 3);
    expect(afterArrival.ok).toBe(false);
  });
});

describe('simulation — estimate and completion gate', () => {
  it('requires arrival and service before an estimate', () => {
    const duringTravel = reduceSession(travelling(), ESTIMATE, T0);
    expect(duringTravel.ok).toBe(false);
    expect(duringTravel.reason).toMatch(/arrival|service/i);

    const afterArrival = reduceSession(arrived(), ESTIMATE, T0);
    expect(afterArrival.ok).toBe(false);

    const duringService = reduceSession(inService(), ESTIMATE, T0);
    expect(duringService.ok).toBe(true);
    expect(duringService.state.estimate.state).toBe('pending');
  });

  it('rejects out-of-bounds estimates', () => {
    const state = inService();
    expect(reduceSession(state, { ...ESTIMATE, amountCents: 1_000_001 } as SimAction, T0).ok).toBe(false);
    expect(reduceSession(state, { ...ESTIMATE, diagnosis: '   ' } as SimAction, T0).ok).toBe(false);
    expect(reduceSession(state, { ...ESTIMATE, durationMin: 1441 } as SimAction, T0).ok).toBe(false);
  });

  it('BLOCKS completion until the customer approves (the M18 gate)', () => {
    const pending = reduceSession(inService(), ESTIMATE, T0).state;
    const blocked = reduceSession(pending, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }, T0);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/customer approves/i);
    expect(blocked.state.status).toBe('service');
    expect(blocked.state.billing.completedAt).toBeNull();
  });

  it('allows completion once approved, and refuses a second completion', () => {
    const approved = run([ESTIMATE, { type: 'decide-estimate', decision: 'approve' }], inService());
    const done = reduceSession(approved, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }, T0);
    expect(done.ok).toBe(true);
    expect(done.state.billing.amountCents).toBe(49_900);
    expect(reduceSession(done.state, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }, T0).ok).toBe(false);
  });

  it('lets a rejected estimate be revised and approved again', () => {
    const rejected = run([ESTIMATE, { type: 'decide-estimate', decision: 'reject' }], inService());
    expect(rejected.estimate.state).toBe('rejected');
    expect(reduceSession(rejected, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }, T0).ok).toBe(false);

    const revised = reduceSession(rejected, { ...ESTIMATE, amountCents: 45_000 } as SimAction, T0);
    expect(revised.ok).toBe(true);
    expect(revised.state.estimate.state).toBe('pending');
  });
});

describe('simulation — payment and reset', () => {
  function completed(): SimSession {
    return run([ESTIMATE, { type: 'decide-estimate', decision: 'approve' }, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }], inService());
  }

  it('records cash/UPI only after completion and only for the billed amount', () => {
    const done = completed();
    expect(reduceSession(inService(), { type: 'record-payment', method: 'cash', amountCents: 49_900 }, T0).ok).toBe(false);
    expect(reduceSession(done, { type: 'record-payment', method: 'upi', amountCents: 30_000 }, T0).ok).toBe(false);

    const paid = reduceSession(done, { type: 'record-payment', method: 'upi', amountCents: 49_900 }, T0);
    expect(paid.ok).toBe(true);
    expect(paid.state.payment).toMatchObject({ state: 'recorded', method: 'upi' });
    expect(paid.state.phase).toBe('complete');
  });

  it('reset restores the original scenario, position, ETA and timeline', () => {
    const paid = run(
      [ESTIMATE, { type: 'decide-estimate', decision: 'approve' }, { type: 'complete-job', amountCents: 49_900, durationMin: 38 }, { type: 'record-payment', method: 'cash', amountCents: 49_900 }],
      inService(),
    );
    const reset = reduceSession(paid, { type: 'reset' }, T0).state;
    expect(reset).toEqual(emptySession());
    expect(reset.journey.arrivedAt).toBeNull();
    expect(reset.activity).toHaveLength(0);
    expect(reset.status).toBe('requested');
  });
});

describe('simulation — guided controller', () => {
  it('drives the journey, then waits for the customer approval', () => {
    let state = start();
    let now = T0;
    for (let i = 0; i < 6; i++) {
      const action = autoStep(state, now);
      if (!action) break;
      state = reduceSession(state, action, now).state;
      now += 1_000;
    }
    // Journey started; the controller waits for the vehicle to reach the pickup.
    expect(state.status).toBe('on-the-way');
    const afterDuration = T0 + SIM_SCENARIO.journeyDurationMs + 1_000;
    const arrive = autoStep(state, afterDuration);
    expect(arrive).toEqual({ type: 'arrive' });
    state = reduceSession(state, arrive!, afterDuration).state;

    // Arrival → service → estimate, then it must stop for the customer.
    let guard = 0;
    while (guard < 6) {
      const action = autoStep(state, afterDuration + guard * 1000);
      if (!action) break;
      state = reduceSession(state, action, afterDuration + guard * 1000).state;
      guard += 1;
    }
    expect(state.estimate.state).toBe('pending');
    expect(autoStep(state, afterDuration + 20_000)).toBeNull();
  });

  it('finishes the workflow after approval, including the payment record', () => {
    let state = run([ESTIMATE, { type: 'decide-estimate', decision: 'approve' }], inService());
    let guard = 0;
    let action = autoStep(state, T0);
    while (action && guard < 8) {
      state = reduceSession(state, action, T0).state;
      action = autoStep(state, T0);
      guard += 1;
    }
    expect(state.status).toBe('completed');
    expect(state.payment.state).toBe('recorded');
    expect(state.phase).toBe('complete');
  });

  it('does nothing from the idle state', () => {
    expect(autoStep(emptySession())).toBeNull();
  });
});
