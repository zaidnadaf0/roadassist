import type { AdminAuditEvent, AdminMechanic, AdminOfferRow, AdminRequest, AdminUser } from './admin';
import type { AppNotification, RequestStatus, ServiceRequest, Vehicle } from './customer';
import type { OfferView } from './dispatch';

/**
 * The isolated presentation dataset for local RoadAssist demonstrations.
 * These records are fictional, labelled in the UI, and never written to
 * Firebase. Live mode must use the repositories instead of these fixtures.
 */

export interface FixtureService {
  id: string;
  name: string;
  desc: string;
  base: number;
  eta: string;
}

export const FIXTURE_SERVICES: FixtureService[] = [
  { id: 'towing', name: 'Towing', desc: 'Flatbed and wheel-lift towing to any garage within 25 km.', base: 1499, eta: '15-25 min' },
  { id: 'battery', name: 'Battery Jump', desc: 'Jump start, terminal cleaning, and on-the-spot battery testing.', base: 599, eta: '10-18 min' },
  { id: 'tire', name: 'Flat Tire', desc: 'Spare fitting or puncture repair at the roadside.', base: 499, eta: '12-20 min' },
  { id: 'fuel', name: 'Fuel Delivery', desc: 'Up to 3 litres of petrol or diesel delivered to your location.', base: 399, eta: '15-22 min' },
  { id: 'lockout', name: 'Lockout', desc: 'Non-destructive entry by a certified locksmith technician.', base: 549, eta: '12-20 min' },
  { id: 'winch', name: 'Winched Out', desc: 'Recovery from ditches, mud, sand, and waterlogged sections.', base: 1899, eta: '20-30 min' },
];

export interface FixtureMechanic {
  id: string;
  name: string;
  garage: string;
  specialties: string[];
  rating: number;
  available: boolean;
  experienceYears?: number;
  reviewCount?: number;
  serviceRadiusKm?: number;
  baseLat?: number;
  baseLng?: number;
}

export const FIXTURE_MECHANICS: FixtureMechanic[] = [
  { id: 'demo-mech-01', name: 'Apex Towing', garage: 'Indiranagar Rig 4', specialties: ['tow', 'recovery'], rating: 4.8, reviewCount: 124, experienceYears: 8, serviceRadiusKm: 20, available: true, baseLat: 12.9781, baseLng: 77.6386 },
  { id: 'demo-mech-02', name: 'VoltCare', garage: 'Koramangala Unit 2', specialties: ['battery', 'electrical'], rating: 4.7, reviewCount: 98, experienceYears: 6, serviceRadiusKm: 15, available: true, baseLat: 12.9352, baseLng: 77.6245 },
  { id: 'demo-mech-03', name: 'Sharma Motors', garage: 'HSR Mobile Van', specialties: ['engine', 'general'], rating: 4.6, reviewCount: 61, experienceYears: 5, serviceRadiusKm: 18, available: false, baseLat: 12.9116, baseLng: 77.6412 },
];

/**
 * UI-only preview records. These are never written to Firebase and are only
 * used when a portal has no live records yet or its read feed is unavailable.
 */
export const DEMO_CUSTOMER_REQUESTS: ServiceRequest[] = [
  {
    id: 'demo-request-active', customerId: 'demo-customer', vehicleId: 'demo-vehicle-sedan',
    problemText: 'Battery failure near Indiranagar', problemCategory: 'battery', status: 'on-the-way',
    customerLat: 12.9719, customerLng: 77.6412, mechanicId: 'demo-mech-01', pickedMechanicId: 'demo-mech-01',
    mechanicName: 'Apex Towing', mechanicPhone: '+91 90000 10001', mechanicLat: 12.9781, mechanicLng: 77.6386,
    etaMin: 8, createdAt: '2026-10-24T10:18:00.000Z', updatedAt: '2026-10-24T10:28:00.000Z',
  },
  {
    id: 'demo-request-complete', customerId: 'demo-customer', vehicleId: 'demo-vehicle-hatchback',
    problemText: 'Flat tyre repaired on MG Road', problemCategory: 'tire', status: 'completed',
    customerLat: 12.9758, customerLng: 77.6044, mechanicId: 'demo-mech-02', mechanicName: 'VoltCare',
    amountCents: 49900, durationMin: 24, rating: 5, createdAt: '2026-10-21T08:40:00.000Z', updatedAt: '2026-10-21T09:10:00.000Z',
  },
  {
    id: 'demo-request-pending', customerId: 'demo-customer', vehicleId: 'demo-vehicle-sedan',
    problemText: 'Fuel delivery requested near Cubbon Park', problemCategory: 'fuel', status: 'requested',
    customerLat: 12.9763, customerLng: 77.5929, etaMin: 16, createdAt: '2026-10-24T10:35:00.000Z', updatedAt: '2026-10-24T10:35:00.000Z',
  },
];

export const DEMO_MECHANIC_ACTIVE: ServiceRequest[] = [
  {
    id: 'demo-job-active', customerId: 'demo-customer-02', vehicleId: 'demo-vehicle-suv',
    problemText: 'Engine overheating near Koramangala', problemCategory: 'engine', status: 'service',
    customerLat: 12.9352, customerLng: 77.6245, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage',
    etaMin: 6, createdAt: '2026-10-24T10:05:00.000Z', updatedAt: '2026-10-24T10:26:00.000Z',
  },
];

export const DEMO_MECHANIC_INCOMING: ServiceRequest[] = [
  {
    id: 'demo-request-pending', customerId: 'demo-customer', vehicleId: 'demo-vehicle-sedan',
    problemText: 'Fuel delivery requested near Cubbon Park', problemCategory: 'fuel', status: 'requested',
    customerLat: 12.9763, customerLng: 77.5929, createdAt: '2026-10-24T10:35:00.000Z',
  },
  {
    id: 'demo-job-incoming-02', customerId: 'demo-customer-05', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Flat tyre on Outer Ring Road', problemCategory: 'tire', status: 'requested',
    customerLat: 12.9480, customerLng: 77.6878, createdAt: '2026-10-24T10:32:00.000Z',
  },
];

export const DEMO_MECHANIC_HISTORY: ServiceRequest[] = [
  {
    id: 'demo-job-complete', customerId: 'demo-customer-04', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Flat tyre replacement completed', problemCategory: 'tire', status: 'completed',
    customerLat: 12.9716, customerLng: 77.5946, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage',
    amountCents: 65000, durationMin: 32, rating: 5, createdAt: '2026-10-23T12:10:00.000Z', updatedAt: '2026-10-23T12:45:00.000Z',
  },
];

export const DEMO_ADMIN_USERS: AdminUser[] = [
  { id: 'demo-user-01', displayName: 'Aarav Mehta', email: 'aarav@example.com', role: 'customer' },
  { id: 'demo-user-02', displayName: 'Priya Nair', email: 'priya@example.com', role: 'customer' },
  { id: 'demo-user-03', displayName: 'RoadAssist Operations', email: 'ops@example.com', role: 'admin' },
];

export const DEMO_ADMIN_MECHANICS: AdminMechanic[] = [
  { id: 'demo-mech-01', name: 'Apex Towing', approved: true, verificationStatus: 'approved', specialties: ['tow', 'recovery'], isAvailable: true, rating: 4.8, reviewCount: 124, garageName: 'Indiranagar Rig 4', serviceRadiusKm: 20, experienceYears: 8 },
  { id: 'demo-mech-02', name: 'VoltCare', approved: true, verificationStatus: 'approved', specialties: ['battery', 'electrical'], isAvailable: true, rating: 4.7, reviewCount: 98, garageName: 'Koramangala Unit 2', serviceRadiusKm: 15, experienceYears: 6 },
  { id: 'demo-mech-03', name: 'Sharma Motors', approved: false, verificationStatus: 'under_review', specialties: ['engine', 'general'], isAvailable: false, rating: 4.6, reviewCount: 61, garageName: 'HSR Mobile Van', serviceRadiusKm: 18, experienceYears: 5 },
];

export const DEMO_ADMIN_REQUESTS: AdminRequest[] = [
  { id: 'demo-request-active', customerId: 'demo-user-01', vehicleId: 'demo-vehicle-sedan', problemText: 'Battery failure near Indiranagar', problemCategory: 'battery', status: 'on-the-way', mechanicId: 'demo-mech-01', mechanicName: 'Apex Towing', amountCents: 59900, createdAt: '2026-10-24T10:18:00.000Z', updatedAt: '2026-10-24T10:28:00.000Z' },
  { id: 'demo-request-complete', customerId: 'demo-user-02', vehicleId: 'demo-vehicle-hatchback', problemText: 'Flat tyre repaired on MG Road', problemCategory: 'tire', status: 'completed', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', amountCents: 49900, durationMin: 24, rating: 5, createdAt: '2026-10-21T08:40:00.000Z', updatedAt: '2026-10-21T09:10:00.000Z' },
  { id: 'demo-request-pending', customerId: 'demo-customer', vehicleId: 'demo-vehicle-sedan', problemText: 'Fuel delivery requested near Cubbon Park', problemCategory: 'fuel', status: 'requested', createdAt: '2026-10-24T10:35:00.000Z' },
  { id: 'demo-request-arrived', customerId: 'demo-user-04', vehicleId: 'demo-vehicle-suv', problemText: 'Engine overheating near Koramangala', problemCategory: 'engine', status: 'arrived', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', createdAt: '2026-10-23T14:20:00.000Z' },
  { id: 'demo-request-service', customerId: 'demo-user-05', vehicleId: 'demo-vehicle-hatchback-02', problemText: 'Lockout assistance at Richmond Road', problemCategory: 'lockout', status: 'service', mechanicId: 'demo-mech-01', mechanicName: 'Apex Towing', createdAt: '2026-10-22T12:10:00.000Z' },
  { id: 'demo-request-cancelled', customerId: 'demo-user-02', vehicleId: 'demo-vehicle-hatchback', problemText: 'Fuel delivery cancelled after self-resolution', problemCategory: 'fuel', status: 'cancelled', cancelledBy: 'customer', createdAt: '2026-10-20T07:30:00.000Z' },
];

export interface DemoCustomerProfile {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  city: string;
  memberSince: string;
  plan: string;
}

export const DEMO_CUSTOMER_PROFILE: DemoCustomerProfile = {
  uid: 'demo-customer',
  displayName: 'Aarav Sharma',
  email: 'aarav.demo@example.test',
  phone: '+91 90000 00001',
  city: 'Bengaluru',
  memberSince: 'January 2025',
  plan: 'RoadAssist Plus · demo',
};

export const DEMO_CUSTOMER_VEHICLES: Vehicle[] = [
  { id: 'demo-vehicle-sedan', ownerId: 'demo-customer', make: 'Maruti Suzuki', model: 'Swift', year: 2022, plate: 'DEMO-001', type: 'car', isDefault: true, createdAt: '2026-01-04T09:00:00.000Z' },
  { id: 'demo-vehicle-hatchback', ownerId: 'demo-customer', make: 'Hyundai', model: 'Creta', year: 2023, plate: 'DEMO-002', type: 'car', createdAt: '2026-01-05T09:00:00.000Z' },
  { id: 'demo-vehicle-suv', ownerId: 'demo-customer-02', make: 'Tata', model: 'Nexon', year: 2021, plate: 'DEMO-003', type: 'car', createdAt: '2026-01-06T09:00:00.000Z' },
  { id: 'demo-vehicle-hatchback-02', ownerId: 'demo-customer-04', make: 'Honda', model: 'City', year: 2020, plate: 'DEMO-004', type: 'car', createdAt: '2026-01-07T09:00:00.000Z' },
];

export interface DemoMechanicProfile extends AdminMechanic {
  email: string;
  phone: string;
  workshopDescription: string;
  verificationNote: string;
  baseLat: number;
  baseLng: number;
}

export const DEMO_MECHANIC_PROFILE: DemoMechanicProfile = {
  id: 'demo-mech-current',
  name: 'Imran Shaikh',
  email: 'imran.demo@example.test',
  phone: '+91 90000 00002',
  approved: true,
  verificationStatus: 'approved',
  specialties: ['battery', 'engine', 'general'],
  isAvailable: true,
  rating: 4.9,
  reviewCount: 87,
  garageName: 'RoadAssist Demo Garage',
  serviceRadiusKm: 18,
  experienceYears: 9,
  workshopDescription: 'Mobile roadside technician serving central and south Bengaluru.',
  verificationNote: 'Sample approval record for demonstration only.',
  baseLat: 12.9352,
  baseLng: 77.6245,
};

export const DEMO_MECHANIC_OFFERS: OfferView[] = [
  { id: 'demo-offer-01', requestId: 'demo-request-pending', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 88_000, status: 'pending', round: 1 },
  { id: 'demo-offer-02', requestId: 'demo-job-incoming-02', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 142_000, status: 'pending', round: 1 },
  { id: 'demo-offer-03', requestId: 'demo-job-complete', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: null, status: 'accepted', round: 1 },
];

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  { id: 'demo-notification-01', type: 'dispatch', title: 'Mechanic is on the way', body: 'Apex Towing accepted your battery assistance request. Simulated ETA: 8 minutes.', requestId: 'demo-request-active', path: '/track/demo-request-active', createdAt: Date.parse('2026-10-24T10:28:00.000Z'), read: false },
  { id: 'demo-notification-02', type: 'receipt', title: 'Demo receipt ready', body: 'Your illustrative flat-tyre service receipt is available in history.', requestId: 'demo-request-complete', path: '/history/demo-request-complete', createdAt: Date.parse('2026-10-21T09:12:00.000Z'), read: false },
  { id: 'demo-notification-03', type: 'account', title: 'Vehicle profile is ready', body: 'Your Swift is marked as the default demo vehicle.', path: '/vehicles', createdAt: Date.parse('2026-10-20T08:00:00.000Z'), read: true },
];

export const DEMO_AUDIT_EVENTS: AdminAuditEvent[] = [
  { id: 'demo-audit-01', actorUid: 'demo-admin', action: 'mechanic.approved', targetType: 'mechanic', targetId: 'demo-mech-01', metadata: { sample: true, note: 'Illustrative event' }, createdAt: '2026-10-24T10:00:00.000Z' },
  { id: 'demo-audit-02', actorUid: 'demo-admin', action: 'dispatch.offer_created', targetType: 'request', targetId: 'demo-request-pending', metadata: { sample: true, round: 1 }, createdAt: '2026-10-24T10:18:00.000Z' },
  { id: 'demo-audit-03', actorUid: 'demo-admin', action: 'request.completed', targetType: 'request', targetId: 'demo-request-complete', metadata: { sample: true, amountInr: 499 }, createdAt: '2026-10-21T09:10:00.000Z' },
];

export const DEMO_ADMIN_OFFERS: AdminOfferRow[] = DEMO_MECHANIC_OFFERS.map((offer) => ({
  requestId: offer.requestId,
  mechanicId: offer.mechanicId,
  status: offer.status,
  round: offer.round,
}));

const DEMO_STATE_KEY = 'roadassist.demoState.v1';
interface DemoState {
  statusByRequest: Record<string, RequestStatus>;
  acceptedOffers: string[];
  declinedOffers: string[];
}

function readDemoState(): DemoState {
  if (typeof window === 'undefined') return { statusByRequest: {}, acceptedOffers: [], declinedOffers: [] };
  try {
    const raw = window.localStorage.getItem(DEMO_STATE_KEY);
    if (!raw) return { statusByRequest: {}, acceptedOffers: [], declinedOffers: [] };
    const value = JSON.parse(raw) as Partial<DemoState>;
    return {
      statusByRequest: value.statusByRequest ?? {},
      acceptedOffers: value.acceptedOffers ?? [],
      declinedOffers: value.declinedOffers ?? [],
    };
  } catch {
    return { statusByRequest: {}, acceptedOffers: [], declinedOffers: [] };
  }
}

function writeDemoState(next: DemoState): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('roadassist-demo-state'));
  }
}

function applyDemoState<T extends ServiceRequest>(items: T[]): T[] {
  const state = readDemoState();
  return items.map((item) => {
    const status = state.statusByRequest[item.id];
    if (!status) return item;
    if (state.acceptedOffers.includes(item.id)) {
      return {
        ...item,
        status,
        mechanicId: item.mechanicId ?? DEMO_MECHANIC_PROFILE.id,
        mechanicName: item.mechanicName ?? DEMO_MECHANIC_PROFILE.name,
        mechanicLat: item.mechanicLat ?? DEMO_MECHANIC_PROFILE.baseLat,
        mechanicLng: item.mechanicLng ?? DEMO_MECHANIC_PROFILE.baseLng,
        etaMin: item.etaMin ?? 12,
        ...(status === 'completed' ? { amountCents: item.amountCents ?? 39900, durationMin: item.durationMin ?? 28, rating: item.rating ?? 5 } : {}),
      };
    }
    return { ...item, status };
  });
}

export function getDemoCustomerRequests(): ServiceRequest[] {
  return applyDemoState(DEMO_CUSTOMER_REQUESTS);
}

export function getDemoMechanicActive(): ServiceRequest[] {
  const state = readDemoState();
  const acceptedIncoming = DEMO_MECHANIC_INCOMING.filter((item) => state.acceptedOffers.includes(item.id)).map((item) => ({
    ...item,
    mechanicId: DEMO_MECHANIC_PROFILE.id,
    mechanicName: DEMO_MECHANIC_PROFILE.name,
    status: 'accepted' as const,
  }));
  return applyDemoState([...DEMO_MECHANIC_ACTIVE, ...acceptedIncoming]);
}

export function getDemoMechanicIncoming(): ServiceRequest[] {
  const state = readDemoState();
  return applyDemoState(DEMO_MECHANIC_INCOMING.filter((item) => !state.declinedOffers.includes(item.id) && !state.acceptedOffers.includes(item.id)));
}

export function getDemoMechanicHistory(): ServiceRequest[] {
  const state = readDemoState();
  const completedBookings = DEMO_MECHANIC_INCOMING
    .filter((item) => state.acceptedOffers.includes(item.id) && state.statusByRequest[item.id] === 'completed')
    .map((item) => ({ ...item, mechanicId: DEMO_MECHANIC_PROFILE.id, mechanicName: DEMO_MECHANIC_PROFILE.name, status: 'completed' as const, amountCents: 39900, durationMin: 28, rating: 5 }));
  return applyDemoState([...DEMO_MECHANIC_HISTORY, ...completedBookings]);
}

export function getDemoOfferHistory(): OfferView[] {
  const state = readDemoState();
  return DEMO_MECHANIC_OFFERS.map((offer) => state.acceptedOffers.includes(offer.requestId)
    ? { ...offer, status: 'accepted' }
    : state.declinedOffers.includes(offer.requestId) ? { ...offer, status: 'declined' } : offer);
}

export function getDemoAdminRequests(): AdminRequest[] {
  const state = readDemoState();
  return DEMO_ADMIN_REQUESTS.map((item) => {
    const status = state.statusByRequest[item.id];
    if (!status) return item;
    return state.acceptedOffers.includes(item.id)
      ? { ...item, status, mechanicId: item.mechanicId ?? DEMO_MECHANIC_PROFILE.id, mechanicName: item.mechanicName ?? DEMO_MECHANIC_PROFILE.name, amountCents: status === 'completed' ? item.amountCents ?? 39900 : item.amountCents, durationMin: status === 'completed' ? item.durationMin ?? 28 : item.durationMin, rating: status === 'completed' ? item.rating ?? 5 : item.rating, updatedAt: new Date().toISOString() }
      : { ...item, status };
  });
}

export function getDemoAdminOffers(): AdminOfferRow[] {
  return getDemoOfferHistory().map((offer) => ({ requestId: offer.requestId, mechanicId: offer.mechanicId, status: offer.status, round: offer.round }));
}

export function acceptDemoOffer(requestId: string): ServiceRequest | null {
  const incoming = DEMO_MECHANIC_INCOMING.find((item) => item.id === requestId);
  if (!incoming) return null;
  const state = readDemoState();
  writeDemoState({ ...state, acceptedOffers: [...new Set([...state.acceptedOffers, requestId])], statusByRequest: { ...state.statusByRequest, [requestId]: 'accepted' } });
  return { ...incoming, mechanicId: DEMO_MECHANIC_PROFILE.id, mechanicName: DEMO_MECHANIC_PROFILE.name, status: 'accepted' };
}

export function declineDemoOffer(requestId: string): void {
  const state = readDemoState();
  writeDemoState({ ...state, declinedOffers: [...new Set([...state.declinedOffers, requestId])] });
}

export function advanceDemoRequest(requestId: string, next: RequestStatus): ServiceRequest | null {
  const all = [...DEMO_CUSTOMER_REQUESTS, ...DEMO_MECHANIC_ACTIVE, ...DEMO_MECHANIC_INCOMING, ...DEMO_MECHANIC_HISTORY];
  const current = all.find((item) => item.id === requestId);
  if (!current) return null;
  const state = readDemoState();
  writeDemoState({ ...state, statusByRequest: { ...state.statusByRequest, [requestId]: next } });
  return { ...current, status: next, updatedAt: new Date().toISOString() };
}

export function resetDemoState(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DEMO_STATE_KEY);
}
