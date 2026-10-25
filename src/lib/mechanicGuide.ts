import type { NewRequest, Vehicle } from '@/lib/customer';

export type GuideCategory = NonNullable<NewRequest['problemCategory']>;

export type SafetyLevel = 'normal' | 'caution' | 'emergency';

export interface SafetyTriage {
  level: SafetyLevel;
  title: string;
  message: string;
  actions: string[];
}

export interface GuideDraft {
  vehicleId: string;
  problemText: string;
  problemCategory: GuideCategory;
  place: string;
  customerLat: number | null;
  customerLng: number | null;
  observations: string;
}

export interface DraftValidation {
  valid: boolean;
  errors: Partial<Record<keyof GuideDraft, string>>;
}

export interface GuideReply {
  message: string;
  category?: GuideCategory;
  followUp?: string;
  safety: SafetyTriage;
  source: 'fallback' | 'model';
}

export type DemoBotScenario =
  | 'battery'
  | 'flat-tyre'
  | 'engine-overheating'
  | 'low-tyre-pressure'
  | 'engine-warning'
  | 'brakes'
  | 'fuel'
  | 'unknown';

export type DemoBotAnswer = 'yes' | 'no' | 'unsure';

export interface DemoBotChoice {
  id: DemoBotScenario;
  label: string;
}

export interface DemoBotTurn {
  phase: 'question' | 'guidance';
  scenario: DemoBotScenario;
  category: GuideCategory;
  message: string;
  question?: string;
  choices?: Array<{ id: DemoBotAnswer; label: string }>;
  steps: string[];
  safety: SafetyTriage;
  /** Signal stored in the draft so the same local safety rules apply before booking. */
  safetySignal: string;
}

export interface UntrustedGuideResponse {
  message?: unknown;
  category?: unknown;
  followUp?: unknown;
  safety?: unknown;
}

export const GUIDE_TEXT_LIMIT = 2000;
export const GUIDE_REPLY_LIMIT = 1200;
export const GUIDE_ACTION_LIMIT = 180;

const GUIDE_CATEGORIES: GuideCategory[] = ['general', 'flat-tyre', 'battery', 'engine', 'tow', 'other'];

const DEMO_BOT_FLOWS: Record<DemoBotScenario, {
  label: string;
  category: GuideCategory;
  question: string;
  safetySignal: string;
  guidance: Record<DemoBotAnswer, { message: string; steps: string[]; safetySignal: string }>;
}> = {
  battery: {
    label: 'Vehicle will not start / battery problem', category: 'battery',
    question: 'When you turn the key or press start, do you hear clicking or see dim dashboard lights?',
    safetySignal: 'battery is dead and the vehicle will not start',
    guidance: {
      yes: { message: 'A discharged battery or poor connection is possible. Do not improvise electrical repairs.', steps: ['Switch off lights and accessories.', 'Move away from traffic if the vehicle is in an unsafe position.', 'Request a qualified mechanic for a battery test or safe jump-start.'], safetySignal: 'battery is dead and the vehicle will not start' },
      no: { message: 'The cause may be the starter, immobiliser, fuel system, or another fault. A mechanic should inspect it.', steps: ['Do not repeatedly crank the engine.', 'Check that the vehicle is safely parked.', 'Request assistance if it still will not start.'], safetySignal: 'vehicle will not start' },
      unsure: { message: 'Treat an unknown no-start condition conservatively and avoid repeated attempts.', steps: ['Switch on hazard lights if safe.', 'Stay clear of traffic and do not push the vehicle on a live road.', 'Request professional assistance.'], safetySignal: 'vehicle will not start' },
    },
  },
  'flat-tyre': {
    label: 'Flat tyre / puncture', category: 'flat-tyre',
    question: 'Is the tyre visibly flat or is the vehicle pulling strongly to one side?',
    safetySignal: 'flat tyre',
    guidance: {
      yes: { message: 'Do not continue driving on a flat or badly damaged tyre.', steps: ['Slow down and stop only where it is safe.', 'Keep away from moving traffic and do not work on an unsafe shoulder.', 'Use a spare only from a stable, safe location; otherwise request roadside assistance.'], safetySignal: 'flat tyre' },
      no: { message: 'A slow puncture or valve issue is possible. Avoid high speed until it is checked.', steps: ['Check pressure only when safely parked.', 'Do not rely on a temporary sealant as a permanent repair.', 'Request a tyre inspection if pressure keeps falling.'], safetySignal: 'possible tyre pressure loss' },
      unsure: { message: 'Treat uncertain tyre damage as unsafe to drive until inspected.', steps: ['Stop in a safe place.', 'Do not remove the wheel beside live traffic.', 'Request a mechanic or recovery vehicle.'], safetySignal: 'possible tyre damage' },
    },
  },
  'engine-overheating': {
    label: 'Engine overheating', category: 'engine', question: 'Is the temperature warning red, or do you see steam from the engine bay?', safetySignal: 'engine overheating',
    guidance: {
      yes: { message: 'Stop driving. Overheating can cause serious damage and burns.', steps: ['Stop in a safe place and switch off the engine when appropriate.', 'Do not open a hot radiator or coolant cap.', 'Wait for qualified assistance; request a tow if the vehicle cannot be moved safely.'], safetySignal: 'engine overheating with steam' },
      no: { message: 'The temperature warning still needs attention before normal driving continues.', steps: ['Avoid long or high-speed driving.', 'Do not open the cooling system while hot.', 'Request a mechanic to check coolant and the cooling system.'], safetySignal: 'engine temperature warning' },
      unsure: { message: 'Treat uncertain temperature warnings conservatively.', steps: ['Stop safely and let the engine cool.', 'Do not open a hot radiator cap.', 'Request professional assistance if the warning returns.'], safetySignal: 'possible engine overheating' },
    },
  },
  'low-tyre-pressure': {
    label: 'Low tyre pressure', category: 'flat-tyre', question: 'Is the pressure warning on, or does the tyre look visibly soft?', safetySignal: 'low tyre pressure',
    guidance: {
      yes: { message: 'Low pressure can affect control and may indicate a puncture.', steps: ['Reduce speed and stop at a safe location.', 'Do not drive on a visibly damaged or flat tyre.', 'Use a safe inflator only when away from traffic, then arrange an inspection.'], safetySignal: 'low tyre pressure' },
      no: { message: 'The warning may need a pressure check or sensor inspection.', steps: ['Check all tyre pressures when safely parked.', 'Use the vehicle manufacturer’s recommended pressure.', 'Request assistance if the warning remains or handling changes.'], safetySignal: 'tyre pressure warning' },
      unsure: { message: 'Avoid guessing when tyre condition is uncertain.', steps: ['Stop safely before inspecting.', 'Do not kneel or work beside fast traffic.', 'Request a tyre check if you cannot confirm the cause.'], safetySignal: 'uncertain tyre pressure' },
    },
  },
  'engine-warning': {
    label: 'Engine warning light', category: 'engine', question: 'Is the warning light flashing, or is the engine running roughly or losing power?', safetySignal: 'engine warning light',
    guidance: {
      yes: { message: 'A flashing warning or loss of power can indicate a serious fault. Avoid driving further.', steps: ['Stop safely and switch off the engine if needed.', 'Do not continue if the vehicle is shaking, smoking, or losing control.', 'Request a mechanic or recovery service.'], safetySignal: 'flashing engine warning light and loss of power' },
      no: { message: 'A steady warning light still needs diagnosis; it is not a confirmed diagnosis from this chat.', steps: ['Avoid hard acceleration and unnecessary travel.', 'Arrange a qualified inspection soon.', 'Request assistance if the light changes or the vehicle behaves abnormally.'], safetySignal: 'steady engine warning light' },
      unsure: { message: 'When the warning behavior is unclear, avoid taking risks.', steps: ['Stop safely if the vehicle feels abnormal.', 'Do not clear the warning without identifying the cause.', 'Request professional assistance.'], safetySignal: 'uncertain engine warning light' },
    },
  },
  brakes: {
    label: 'Brake problems', category: 'tow', question: 'Are the brakes weak, spongy, grinding, or not responding normally?', safetySignal: 'brakes not working',
    guidance: {
      yes: { message: 'Do not drive. Brake faults can make the vehicle unsafe immediately.', steps: ['Stop in a safe place without making sudden manoeuvres.', 'Keep everyone away from traffic.', 'Request a tow or qualified roadside professional; do not attempt a roadside brake repair.'], safetySignal: 'brakes not working' },
      no: { message: 'Any unusual brake noise or feel should be inspected before continued travel.', steps: ['Avoid unnecessary driving and heavy loads.', 'Do not rely on a warning light clearing itself.', 'Request a professional brake inspection.'], safetySignal: 'unusual brake problem' },
      unsure: { message: 'Treat uncertain brake behavior as unsafe until a professional checks it.', steps: ['Stop safely and do not continue at speed.', 'Keep clear of traffic.', 'Request recovery or qualified roadside assistance.'], safetySignal: 'uncertain brake failure' },
    },
  },
  fuel: {
    label: 'Fuel problem', category: 'tow', question: 'Do you smell fuel, see a leak, or suspect the vehicle is simply out of fuel?', safetySignal: 'fuel problem',
    guidance: {
      yes: { message: 'A fuel smell or visible leak is an emergency risk. Do not start the vehicle or handle the leak.', steps: ['Move away from the vehicle and traffic only if safe.', 'Avoid flames, sparks, and electrical switches near a suspected leak.', 'Seek appropriate emergency help and professional roadside assistance.'], safetySignal: 'fuel leak or strong fuel smell' },
      no: { message: 'If the vehicle is out of fuel without a leak, roadside fuel delivery may be appropriate.', steps: ['Park safely and use hazard lights if safe.', 'Do not walk along a live road to find fuel.', 'Request the existing roadside assistance flow for fuel delivery.'], safetySignal: 'vehicle is out of fuel' },
      unsure: { message: 'Do not guess when fuel leakage is possible.', steps: ['Do not start the engine.', 'Move away from the vehicle only if safe.', 'Request professional help and report any fuel smell or visible leak.'], safetySignal: 'possible fuel leak' },
    },
  },
  unknown: {
    label: 'Unknown breakdown', category: 'general', question: 'Is there fire, smoke, a fuel smell, brake or steering failure, injury, or immediate traffic danger?', safetySignal: 'unknown vehicle breakdown',
    guidance: {
      yes: { message: 'Stop and get to safety first. This is not a situation for ordinary troubleshooting.', steps: ['Move away from traffic only if safe.', 'Do not attempt a roadside repair.', 'Seek appropriate emergency help and request professional roadside assistance.'], safetySignal: 'smoke or fire or fuel leak or brake failure or immediate traffic danger' },
      no: { message: 'The cause cannot be confirmed from the available details. A mechanic should inspect the vehicle.', steps: ['Record what happened immediately before the breakdown.', 'Stay in a safe location and do not work beneath an unsupported vehicle.', 'Request roadside assistance for diagnosis and recovery.'], safetySignal: 'unknown vehicle breakdown' },
      unsure: { message: 'When the situation is unclear, choose safety over troubleshooting.', steps: ['Stop in a safe place if possible.', 'Do not attempt repairs beside moving traffic.', 'Request professional assistance and describe the symptoms.'], safetySignal: 'uncertain vehicle breakdown' },
    },
  },
};

export function getDemoBotMenu(): DemoBotChoice[] {
  return (Object.entries(DEMO_BOT_FLOWS) as Array<[DemoBotScenario, (typeof DEMO_BOT_FLOWS)[DemoBotScenario]]>)
    .map(([id, flow]) => ({ id, label: flow.label }));
}

export function startDemoBotScenario(scenario: DemoBotScenario): DemoBotTurn {
  const flow = DEMO_BOT_FLOWS[scenario];
  return {
    phase: 'question', scenario, category: flow.category, message: `Let’s check the ${flow.label.toLowerCase()} flow.`, question: flow.question,
    choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'unsure', label: 'Not sure' }], steps: [],
    safety: triageSafety(flow.safetySignal), safetySignal: flow.safetySignal,
  };
}

export function answerDemoBotScenario(scenario: DemoBotScenario, answer: DemoBotAnswer): DemoBotTurn {
  const flow = DEMO_BOT_FLOWS[scenario];
  const response = flow.guidance[answer];
  return {
    phase: 'guidance', scenario, category: flow.category, message: response.message, steps: response.steps,
    safety: triageSafety(response.safetySignal), safetySignal: response.safetySignal,
  };
}

export function buildRequestProblemText(draft: GuideDraft): string {
  return `${draft.problemText.trim()}${draft.observations.trim() ? ` Observed: ${draft.observations.trim()}` : ''} @ ${draft.place.trim()}`;
}

const CATEGORY_TERMS: Array<{ category: GuideCategory; terms: string[] }> = [
  { category: 'flat-tyre', terms: ['flat tyre', 'flat tire', 'puncture', 'burst tyre', 'burst tire', 'punctured'] },
  { category: 'battery', terms: ['dead battery', 'battery dead', 'won’t start', "won't start", 'no crank', 'jump start', 'clicking'] },
  { category: 'engine', terms: ['overheat', 'overheating', 'engine stalled', 'engine stopped', 'smoke from engine', 'check engine'] },
  { category: 'tow', terms: ['tow', 'towing', 'recovery', 'breakdown', 'stuck', 'immobile'] },
];

const EMERGENCY_PATTERNS = [
  /fire|flame|burning|vehicle on fire/i,
  /fuel leak|petrol leak|diesel leak|strong fuel smell|smell of fuel/i,
  /smoke.*(cabin|inside|vehicle)|smoke.*fire/i,
  /crash|collision|accident.*injur|injur.*accident/i,
  /live lane|middle of traffic|dangerous traffic|on the motorway|on the highway.*lane/i,
  /electrical arcing|sparks from|sparking/i,
];

const CAUTION_PATTERNS = [
  /overheat|overheating|temperature.*red|steam from/i,
  /brake.*fail|brakes? not working|steering.*fail/i,
  /smoke|burning smell|fluid leak/i,
];

export function inferCategory(text: string): GuideCategory {
  const normalized = text.toLowerCase();
  return CATEGORY_TERMS.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.category ?? 'general';
}

export function triageSafety(text: string): SafetyTriage {
  if (EMERGENCY_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: 'emergency',
      title: 'Stop and get to safety first',
      message: 'Do not continue driving or attempt a roadside repair. If it is safe to do so, move away from traffic and call emergency services on 112. RoadAssist assistance must not delay urgent help.',
      actions: ['Move everyone away from traffic only if safe', 'Switch on hazard lights if you can do so safely', 'Call 112 for immediate danger, fire, injury, or a fuel leak'],
    };
  }
  if (CAUTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: 'caution',
      title: 'Do not risk driving further',
      message: 'Stop in a safe place, switch off the engine when appropriate, and request professional assistance. This is guidance, not a confirmed diagnosis.',
      actions: ['Stay clear of traffic', 'Do not open a hot cooling system', 'Request a mechanic or tow if the vehicle is unsafe to move'],
    };
  }
  return {
    level: 'normal',
    title: 'Initial guidance only',
    message: 'These are possible causes based on your description, not a confirmed diagnosis. A mechanic should inspect the vehicle before repair decisions are made.',
    actions: [],
  };
}

/**
 * Validates a future model/provider response at the trust boundary.
 *
 * Model output is never allowed to decide safety: the local triage result is
 * recomputed from the user's report and always wins over model-provided
 * safety fields. Returning null lets the caller use the deterministic
 * fallback without rendering untrusted content.
 */
export function parseUntrustedGuideResponse(raw: unknown, userText: string): GuideReply | null {
  let value: UntrustedGuideResponse = {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      value = parsed as UntrustedGuideResponse;
    } catch {
      return null;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    value = raw as UntrustedGuideResponse;
  } else {
    return null;
  }

  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (!message || message.length > GUIDE_REPLY_LIMIT) return null;

  if (value.category !== undefined && (typeof value.category !== 'string' || !GUIDE_CATEGORIES.includes(value.category as GuideCategory))) return null;
  if (value.followUp !== undefined && (typeof value.followUp !== 'string' || value.followUp.trim().length > GUIDE_REPLY_LIMIT)) return null;
  const category = value.category as GuideCategory | undefined;
  const followUp = typeof value.followUp === 'string' ? value.followUp.trim() || undefined : undefined;
  const safety = triageSafety(userText);
  return { message, category, followUp, safety, source: 'model' };
}

export function validateGuideDraft(draft: GuideDraft, vehicles: Vehicle[], safety: SafetyTriage): DraftValidation {
  const errors: DraftValidation['errors'] = {};
  if (safety.level === 'emergency') errors.problemText = 'Resolve the immediate safety situation before placing a normal assistance request.';
  if (!vehicles.some((vehicle) => vehicle.id === draft.vehicleId)) errors.vehicleId = 'Select one of your vehicles.';
  if (draft.problemText.trim().length < 5) errors.problemText = errors.problemText ?? 'Describe the problem in at least 5 characters.';
  if (draft.problemText.trim().length > GUIDE_TEXT_LIMIT) errors.problemText = `Keep the problem description under ${GUIDE_TEXT_LIMIT.toLocaleString()} characters.`;
  if (draft.observations.trim().length > GUIDE_TEXT_LIMIT) errors.observations = `Keep observations under ${GUIDE_TEXT_LIMIT.toLocaleString()} characters.`;
  if (!draft.place.trim()) errors.place = 'Add a road, landmark, or safe meeting point.';
  if (draft.customerLat == null || !Number.isFinite(draft.customerLat) || draft.customerLng == null || !Number.isFinite(draft.customerLng)) errors.customerLat = 'Add valid latitude and longitude, or use the request form location picker.';
  if (draft.customerLat != null && Number.isFinite(draft.customerLat) && (draft.customerLat < -90 || draft.customerLat > 90)) errors.customerLat = 'Latitude must be between -90 and 90.';
  if (draft.customerLng != null && Number.isFinite(draft.customerLng) && (draft.customerLng < -180 || draft.customerLng > 180)) errors.customerLng = 'Longitude must be between -180 and 180.';
  if (buildRequestProblemText(draft).length > GUIDE_TEXT_LIMIT) errors.problemText = 'The combined request description is too long. Shorten the problem, observations, or location.';
  return { valid: Object.keys(errors).length === 0, errors };
}

function fallbackMessage(text: string, safety: SafetyTriage): string {
  if (safety.level === 'emergency') return safety.message;
  const category = inferCategory(text);
  const advice: Record<GuideCategory, string> = {
    'flat-tyre': 'A puncture, damaged valve, or tyre failure is possible. Keep clear of traffic and do not change the tyre on an unsafe shoulder.',
    battery: 'A discharged battery, poor terminal connection, or charging-system fault is possible. Avoid improvised electrical work; a mechanic can test it safely.',
    engine: 'Low coolant, a belt issue, overheating, or an engine fault is possible. Do not open a hot radiator or continue driving if temperature is high.',
    tow: 'The vehicle may need recovery because it is immobile or unsafe to drive. Tell us what happened and where it is located.',
    general: 'I need a little more detail before narrowing the possibilities: what happened immediately before the problem, and what do you observe now?',
    other: 'I need a little more detail before narrowing the possibilities: what happened immediately before the problem, and what do you observe now?',
  };
  return `${advice[category]} ${safety.message}`;
}

export function buildFallbackReply(text: string): GuideReply {
  const safety = triageSafety(text);
  return { message: fallbackMessage(text, safety), category: inferCategory(text), safety, source: 'fallback' };
}

export function vehicleSummary(vehicle: Vehicle | undefined): string {
  return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.type}, ${vehicle.plate})` : 'vehicle not selected';
}

/** Synchronous guard used by the UI ref to reject duplicate confirmation events. */
export function shouldStartSubmission(confirmed: boolean, valid: boolean, submitting: boolean, started: boolean): boolean {
  return confirmed && valid && !submitting && !started;
}
