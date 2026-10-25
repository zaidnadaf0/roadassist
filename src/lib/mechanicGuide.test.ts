import { describe, expect, it } from 'vitest';
import { answerDemoBotScenario, buildFallbackReply, getDemoBotMenu, parseUntrustedGuideResponse, shouldStartSubmission, startDemoBotScenario, triageSafety, validateGuideDraft } from './mechanicGuide';
import type { Vehicle } from './customer';

const vehicle: Vehicle = { id: 'v1', ownerId: 'u1', make: 'Toyota', model: 'Etios', year: 2018, plate: 'KA01AA1234', type: 'car' };

describe('mechanic guide', () => {
  it('prioritizes immediate danger over ordinary troubleshooting', () => {
    const result = triageSafety('There is smoke and a strong fuel smell while I am in a live lane');
    expect(result.level).toBe('emergency');
    expect(result.message).toContain('112');
  });

  it('offers conservative fallback guidance for common breakdowns', () => {
    const result = buildFallbackReply('The car has a flat tyre on the rear wheel');
    expect(result.source).toBe('fallback');
    expect(result.category).toBe('flat-tyre');
    expect(result.message).toContain('puncture');
  });

  it('rejects incomplete drafts and safety-blocked drafts', () => {
    const safety = triageSafety('The vehicle is on fire');
    const result = validateGuideDraft({ vehicleId: '', problemText: 'fire', problemCategory: 'general', place: '', customerLat: null, customerLng: null, observations: '' }, [vehicle], safety);
    expect(result.valid).toBe(false);
    expect(result.errors.vehicleId).toBeTruthy();
    expect(result.errors.problemText).toContain('safety');
  });

  it('accepts a complete safe draft', () => {
    const result = validateGuideDraft({ vehicleId: 'v1', problemText: 'Battery is dead and the engine will not start', problemCategory: 'battery', place: 'Outer Ring Road, HSR exit', customerLat: 12.9716, customerLng: 77.5946, observations: '' }, [vehicle], triageSafety('Battery is dead'));
    expect(result).toEqual({ valid: true, errors: {} });
  });

  it('rejects non-finite coordinates before a request can be confirmed', () => {
    const result = validateGuideDraft({ vehicleId: 'v1', problemText: 'Battery is dead', problemCategory: 'battery', place: 'HSR exit', customerLat: Number.NaN, customerLng: Number.POSITIVE_INFINITY, observations: '' }, [vehicle], triageSafety('Battery is dead'));
    expect(result.valid).toBe(false);
    expect(result.errors.customerLat).toContain('valid latitude');
  });

  it('blocks repeated confirmation while a submission is already started', () => {
    expect(shouldStartSubmission(true, true, false, false)).toBe(true);
    expect(shouldStartSubmission(true, true, true, false)).toBe(false);
    expect(shouldStartSubmission(true, true, false, true)).toBe(false);
    expect(shouldStartSubmission(false, true, false, false)).toBe(false);
  });

  it('accepts a bounded structured provider response but recomputes safety locally', () => {
    const result = parseUntrustedGuideResponse({
      message: 'A battery or connection issue may be involved. Request a qualified inspection.',
      category: 'battery',
      safety: { level: 'normal' },
    }, 'There is a strong fuel smell near the vehicle');
    expect(result?.source).toBe('model');
    expect(result?.category).toBe('battery');
    expect(result?.safety.level).toBe('emergency');
  });

  it('rejects malformed, empty, oversized, and invalid provider responses', () => {
    expect(parseUntrustedGuideResponse('not-json', 'flat tyre')).toBeNull();
    expect(parseUntrustedGuideResponse({ message: '' }, 'flat tyre')).toBeNull();
    expect(parseUntrustedGuideResponse({ message: 'x'.repeat(1201) }, 'flat tyre')).toBeNull();
    expect(parseUntrustedGuideResponse({ message: 'Advice', category: 'dispatch-mechanic' }, 'flat tyre')).toBeNull();
  });

  it('exposes all supported predefined demo scenarios with a follow-up question', () => {
    const menu = getDemoBotMenu();
    expect(menu).toHaveLength(8);
    for (const item of menu) {
      const turn = startDemoBotScenario(item.id);
      expect(turn.phase).toBe('question');
      expect(turn.question).toBeTruthy();
      expect(turn.choices).toHaveLength(3);
    }
  });

  it('returns deterministic step-by-step guidance for each answer', () => {
    for (const item of getDemoBotMenu()) {
      for (const answer of ['yes', 'no', 'unsure'] as const) {
        const turn = answerDemoBotScenario(item.id, answer);
        expect(turn.phase).toBe('guidance');
        expect(turn.message).toBeTruthy();
        expect(turn.steps.length).toBeGreaterThan(0);
        expect(turn.safetySignal).toBeTruthy();
      }
    }
  });

  it('keeps dangerous demo answers on the conservative safety path', () => {
    expect(answerDemoBotScenario('brakes', 'yes').safety.level).toBe('caution');
    expect(answerDemoBotScenario('fuel', 'yes').safety.level).toBe('emergency');
    expect(answerDemoBotScenario('unknown', 'yes').safety.level).toBe('emergency');
    expect(answerDemoBotScenario('engine-overheating', 'yes').safety.level).toBe('caution');
  });
});
