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
  /** Dispatch problemCategory this card maps to (matches CATEGORY_NEEDS keys). */
  category: string;
}

export const FIXTURE_SERVICES: FixtureService[] = [
  { id: 'towing', name: 'Towing', desc: 'Flatbed and wheel-lift towing to any garage within 25 km.', base: 1499, eta: '15-25 min', category: 'tow' },
  { id: 'battery', name: 'Battery Jump', desc: 'Jump start, terminal cleaning, and on-the-spot battery testing.', base: 599, eta: '10-18 min', category: 'battery' },
  { id: 'tire', name: 'Flat Tire', desc: 'Spare fitting or puncture repair at the roadside.', base: 499, eta: '12-20 min', category: 'flat-tyre' },
  { id: 'fuel', name: 'Fuel Delivery', desc: 'Up to 3 litres of petrol or diesel delivered to your location.', base: 399, eta: '15-22 min', category: 'other' },
  { id: 'lockout', name: 'Lockout', desc: 'Non-destructive entry by a certified locksmith technician.', base: 549, eta: '12-20 min', category: 'other' },
  { id: 'winch', name: 'Winched Out', desc: 'Recovery from ditches, mud, sand, and waterlogged sections.', base: 1899, eta: '20-30 min', category: 'tow' },
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
  {
    id: 'demo-job-active-tow', customerId: 'demo-customer-03', vehicleId: 'demo-vehicle-suv',
    problemText: 'Vehicle recovery near Richmond Road', problemCategory: 'tow', status: 'on-the-way',
    customerLat: 12.9648, customerLng: 77.6011, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage',
    etaMin: 12, createdAt: '2026-10-28T09:42:00.000Z', updatedAt: '2026-10-28T09:49:00.000Z',
  },
  {
    id: 'demo-job-active-battery', customerId: 'demo-customer-06', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Battery jump-start near Jayanagar 4th Block', problemCategory: 'battery', status: 'arrived',
    customerLat: 12.9252, customerLng: 77.5838, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage',
    etaMin: 0, createdAt: '2026-10-28T09:18:00.000Z', updatedAt: '2026-10-28T09:36:00.000Z',
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
  {
    id: 'demo-job-incoming-03', customerId: 'demo-customer-07', vehicleId: 'demo-vehicle-sedan',
    problemText: 'No-start and battery check near Richmond Town', problemCategory: 'battery', status: 'requested',
    customerLat: 12.9601, customerLng: 77.6018, createdAt: '2026-10-28T10:04:00.000Z',
  },
  {
    id: 'demo-job-incoming-04', customerId: 'demo-customer-08', vehicleId: 'demo-vehicle-suv',
    problemText: 'Tow request near Old Airport Road', problemCategory: 'tow', status: 'requested',
    customerLat: 12.9594, customerLng: 77.6592, createdAt: '2026-10-28T09:57:00.000Z',
  },
  {
    id: 'demo-job-incoming-05', customerId: 'demo-customer-09', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Car lockout near Jayanagar', problemCategory: 'lockout', status: 'requested',
    customerLat: 12.9258, customerLng: 77.5831, createdAt: '2026-10-28T09:51:00.000Z',
  },
  {
    id: 'demo-job-incoming-06', customerId: 'demo-customer-10', vehicleId: 'demo-vehicle-sedan',
    problemText: 'Engine warning light near BTM Layout', problemCategory: 'engine', status: 'requested',
    customerLat: 12.9166, customerLng: 77.6101, createdAt: '2026-10-28T09:45:00.000Z',
  },
  {
    id: 'demo-job-incoming-07', customerId: 'demo-customer-11', vehicleId: 'demo-vehicle-suv',
    problemText: 'Puncture assistance near Whitefield', problemCategory: 'tire', status: 'requested',
    customerLat: 12.9698, customerLng: 77.7499, createdAt: '2026-10-28T09:38:00.000Z',
  },
  {
    id: 'demo-job-incoming-08', customerId: 'demo-customer-12', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Fuel delivery near MG Road', problemCategory: 'fuel', status: 'requested',
    customerLat: 12.9757, customerLng: 77.6060, createdAt: '2026-10-28T09:31:00.000Z',
  },
];

export const DEMO_MECHANIC_HISTORY: ServiceRequest[] = [
  {
    id: 'demo-job-complete', customerId: 'demo-customer-04', vehicleId: 'demo-vehicle-hatchback-02',
    problemText: 'Flat tyre replacement completed', problemCategory: 'tire', status: 'completed',
    customerLat: 12.9716, customerLng: 77.5946, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage',
    amountCents: 65000, durationMin: 32, rating: 5, createdAt: '2026-10-23T12:10:00.000Z', updatedAt: '2026-10-23T12:45:00.000Z',
  },
  { id: 'demo-job-history-02', customerId: 'demo-customer-01', vehicleId: 'demo-vehicle-sedan', problemText: 'Battery test and jump-start completed', problemCategory: 'battery', status: 'completed', customerLat: 12.9719, customerLng: 77.6412, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 42000, durationMin: 24, rating: 5, createdAt: '2026-10-27T08:20:00.000Z', updatedAt: '2026-10-27T08:52:00.000Z' },
  { id: 'demo-job-history-03', customerId: 'demo-customer-05', vehicleId: 'demo-vehicle-suv', problemText: 'Roadside tyre change completed', problemCategory: 'tire', status: 'completed', customerLat: 12.9480, customerLng: 77.6878, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 52000, durationMin: 29, rating: 4, createdAt: '2026-10-25T13:05:00.000Z', updatedAt: '2026-10-25T13:42:00.000Z' },
  { id: 'demo-job-history-04', customerId: 'demo-customer-08', vehicleId: 'demo-vehicle-hatchback-02', problemText: 'Lockout assistance completed', problemCategory: 'lockout', status: 'completed', customerLat: 12.9594, customerLng: 77.6592, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 48000, durationMin: 21, rating: 5, createdAt: '2026-10-21T10:15:00.000Z', updatedAt: '2026-10-21T10:48:00.000Z' },
  { id: 'demo-job-history-05', customerId: 'demo-customer-09', vehicleId: 'demo-vehicle-sedan', problemText: 'Engine diagnostic and restart', problemCategory: 'engine', status: 'completed', customerLat: 12.9258, customerLng: 77.5831, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 89000, durationMin: 48, rating: 5, createdAt: '2026-10-18T07:40:00.000Z', updatedAt: '2026-10-18T08:38:00.000Z' },
  { id: 'demo-job-history-06', customerId: 'demo-customer-10', vehicleId: 'demo-vehicle-suv', problemText: 'Towing to an authorised workshop', problemCategory: 'tow', status: 'completed', customerLat: 12.9166, customerLng: 77.6101, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 145000, durationMin: 54, rating: 4, createdAt: '2026-10-14T15:10:00.000Z', updatedAt: '2026-10-14T16:12:00.000Z' },
  { id: 'demo-job-history-07', customerId: 'demo-customer-11', vehicleId: 'demo-vehicle-hatchback-02', problemText: 'Fuel delivery and safe restart', problemCategory: 'fuel', status: 'completed', customerLat: 12.9698, customerLng: 77.7499, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 39000, durationMin: 27, rating: 5, createdAt: '2026-10-11T09:25:00.000Z', updatedAt: '2026-10-11T10:01:00.000Z' },
  { id: 'demo-job-history-08', customerId: 'demo-customer-12', vehicleId: 'demo-vehicle-sedan', problemText: 'Winch recovery from a roadside shoulder', problemCategory: 'recovery', status: 'completed', customerLat: 12.9757, customerLng: 77.6060, mechanicId: 'demo-mech-current', mechanicName: 'RoadAssist Demo Garage', amountCents: 179000, durationMin: 61, rating: 5, createdAt: '2026-10-08T12:30:00.000Z', updatedAt: '2026-10-08T13:44:00.000Z' },
];

export interface DemoAdminUser extends AdminUser {
  registeredAt: string;
  accountStatus: 'active';
}

export interface DemoAdminMechanic extends AdminMechanic {
  serviceArea: string;
  vehicleTypes: string[];
  completedJobs: number;
}

export const DEMO_ADMIN_USERS: DemoAdminUser[] = [
  { id: 'demo-user-01', displayName: 'Aarav Mehta', email: 'aarav@example.test', role: 'customer', registeredAt: '2026-01-12T09:00:00.000Z', accountStatus: 'active' },
  { id: 'demo-user-02', displayName: 'Priya Nair', email: 'priya@example.test', role: 'customer', registeredAt: '2026-02-03T11:20:00.000Z', accountStatus: 'active' },
  { id: 'demo-user-04', displayName: 'Kabir Rao', email: 'kabir@example.test', role: 'customer', registeredAt: '2026-03-19T08:45:00.000Z', accountStatus: 'active' },
  { id: 'demo-user-05', displayName: 'Ananya Das', email: 'ananya@example.test', role: 'customer', registeredAt: '2026-04-08T13:10:00.000Z', accountStatus: 'active' },
  { id: 'demo-user-06', displayName: 'Rohan Iyer', email: 'rohan@example.test', role: 'customer', registeredAt: '2026-05-21T07:30:00.000Z', accountStatus: 'active' },
  { id: 'demo-admin', displayName: 'RoadAssist Operations', email: 'ops@example.test', role: 'admin', registeredAt: '2025-12-01T09:00:00.000Z', accountStatus: 'active' },
];

export const DEMO_ADMIN_VEHICLES: Vehicle[] = [
  { id: 'demo-admin-vehicle-01', ownerId: 'demo-user-01', make: 'Maruti Suzuki', model: 'Swift', year: 2022, plate: 'DEMO-101', type: 'car' },
  { id: 'demo-admin-vehicle-02', ownerId: 'demo-user-02', make: 'Hyundai', model: 'Creta', year: 2023, plate: 'DEMO-102', type: 'car' },
  { id: 'demo-admin-vehicle-04', ownerId: 'demo-user-04', make: 'Honda', model: 'City', year: 2021, plate: 'DEMO-104', type: 'car' },
  { id: 'demo-admin-vehicle-05', ownerId: 'demo-user-05', make: 'Tata', model: 'Nexon', year: 2022, plate: 'DEMO-105', type: 'car' },
  { id: 'demo-admin-vehicle-06', ownerId: 'demo-user-06', make: 'Hyundai', model: 'i20', year: 2020, plate: 'DEMO-106', type: 'car' },
];

export const DEMO_ADMIN_MECHANICS: DemoAdminMechanic[] = [
  { id: 'demo-mech-01', name: 'Apex Towing', approved: true, verificationStatus: 'approved', specialties: ['tow', 'recovery'], isAvailable: true, rating: 4.8, reviewCount: 124, garageName: 'Indiranagar Rig 4', serviceRadiusKm: 20, experienceYears: 8, serviceArea: 'Indiranagar · Ulsoor', vehicleTypes: ['car', 'van', 'SUV'], completedJobs: 86 },
  { id: 'demo-mech-02', name: 'VoltCare', approved: true, verificationStatus: 'approved', specialties: ['battery', 'electrical'], isAvailable: true, rating: 4.7, reviewCount: 98, garageName: 'Koramangala Unit 2', serviceRadiusKm: 15, experienceYears: 6, serviceArea: 'Koramangala · HSR Layout', vehicleTypes: ['car', 'bike'], completedJobs: 72 },
  { id: 'demo-mech-07', name: 'Metro Roadside Works', approved: true, verificationStatus: 'approved', specialties: ['tyre', 'general'], isAvailable: false, rating: 4.9, reviewCount: 43, garageName: 'Jayanagar Service Van', serviceRadiusKm: 18, experienceYears: 10, serviceArea: 'Jayanagar · JP Nagar', vehicleTypes: ['car', 'van', 'bike'], completedJobs: 38 },
  { id: 'demo-mech-03', name: 'Sharma Motors', approved: false, verificationStatus: 'under_review', specialties: ['engine', 'general'], isAvailable: false, reviewCount: 0, garageName: 'HSR Mobile Van', serviceRadiusKm: 18, experienceYears: 5, serviceArea: 'HSR Layout · Bellandur', vehicleTypes: ['car', 'SUV'], completedJobs: 0 },
];

export const DEMO_ADMIN_REQUESTS: AdminRequest[] = [
  { id: 'demo-admin-request-active', customerId: 'demo-user-01', demoCustomerName: 'Aarav Mehta', vehicleId: 'demo-admin-vehicle-01', demoVehicleType: 'Hatchback', problemText: 'Battery failure near Indiranagar', problemCategory: 'battery', demoLocation: '100 Feet Road, Indiranagar', status: 'on-the-way', mechanicId: 'demo-mech-01', mechanicName: 'Apex Towing', amountCents: 59900, demoResponseMinutes: 7, createdAt: '2026-10-27T09:18:00.000Z', updatedAt: '2026-10-27T09:28:00.000Z' },
  { id: 'demo-admin-request-accepted', customerId: 'demo-user-02', demoCustomerName: 'Priya Nair', vehicleId: 'demo-admin-vehicle-02', demoVehicleType: 'SUV', problemText: 'Jump start requested near Forum Mall', problemCategory: 'battery', demoLocation: 'Hosur Road, Koramangala', status: 'accepted', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', demoResponseMinutes: 5, createdAt: '2026-10-27T08:42:00.000Z', updatedAt: '2026-10-27T08:47:00.000Z' },
  { id: 'demo-admin-request-pending', customerId: 'demo-user-04', demoCustomerName: 'Kabir Rao', vehicleId: 'demo-admin-vehicle-04', demoVehicleType: 'Sedan', problemText: 'Fuel delivery near Cubbon Park', problemCategory: 'fuel', demoLocation: 'Kasturba Road, Bengaluru', status: 'requested', createdAt: '2026-10-27T10:35:00.000Z' },
  { id: 'demo-admin-request-arrived', customerId: 'demo-user-05', demoCustomerName: 'Ananya Das', vehicleId: 'demo-admin-vehicle-05', demoVehicleType: 'SUV', problemText: 'Engine overheating near Koramangala', problemCategory: 'engine', demoLocation: '5th Block, Koramangala', status: 'arrived', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', demoResponseMinutes: 9, createdAt: '2026-10-27T07:20:00.000Z', updatedAt: '2026-10-27T07:48:00.000Z' },
  { id: 'demo-admin-request-service', customerId: 'demo-user-06', demoCustomerName: 'Rohan Iyer', vehicleId: 'demo-admin-vehicle-06', demoVehicleType: 'Hatchback', problemText: 'Lockout assistance on Richmond Road', problemCategory: 'lockout', demoLocation: 'Richmond Road, Bengaluru', status: 'service', mechanicId: 'demo-mech-01', mechanicName: 'Apex Towing', demoResponseMinutes: 6, createdAt: '2026-10-25T12:10:00.000Z', updatedAt: '2026-10-25T12:35:00.000Z' },
  { id: 'demo-admin-request-complete', customerId: 'demo-user-02', demoCustomerName: 'Priya Nair', vehicleId: 'demo-admin-vehicle-02', demoVehicleType: 'SUV', problemText: 'Flat tyre repaired on MG Road', problemCategory: 'tire', demoLocation: 'MG Road, Bengaluru', status: 'completed', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', amountCents: 49900, durationMin: 24, rating: 5, demoResponseMinutes: 8, createdAt: '2026-10-12T08:40:00.000Z', updatedAt: '2026-10-12T09:10:00.000Z' },
  { id: 'demo-admin-request-complete-3', customerId: 'demo-user-04', demoCustomerName: 'Kabir Rao', vehicleId: 'demo-admin-vehicle-04', demoVehicleType: 'Sedan', problemText: 'Puncture repair near Jayanagar 4th Block', problemCategory: 'tire', demoLocation: 'Jayanagar 4th Block, Bengaluru', status: 'completed', mechanicId: 'demo-mech-07', mechanicName: 'Metro Roadside Works', amountCents: 45000, durationMin: 25, rating: 5, demoResponseMinutes: 10, createdAt: '2026-10-17T11:40:00.000Z', updatedAt: '2026-10-17T12:15:00.000Z' },
  { id: 'demo-admin-request-complete-4', customerId: 'demo-user-05', demoCustomerName: 'Ananya Das', vehicleId: 'demo-admin-vehicle-05', demoVehicleType: 'SUV', problemText: 'Battery test and jump start in HSR Layout', problemCategory: 'battery', demoLocation: '27th Main Road, HSR Layout', status: 'completed', mechanicId: 'demo-mech-02', mechanicName: 'VoltCare', amountCents: 39900, durationMin: 22, rating: 4, demoResponseMinutes: 6, createdAt: '2026-10-14T06:55:00.000Z', updatedAt: '2026-10-14T07:25:00.000Z' },
  { id: 'demo-admin-request-complete-2', customerId: 'demo-user-01', demoCustomerName: 'Aarav Mehta', vehicleId: 'demo-admin-vehicle-01', demoVehicleType: 'Hatchback', problemText: 'Towing after a puncture near Ulsoor', problemCategory: 'tow', demoLocation: 'Cambridge Road, Ulsoor', status: 'completed', mechanicId: 'demo-mech-01', mechanicName: 'Apex Towing', amountCents: 129900, durationMin: 42, rating: 4, demoResponseMinutes: 11, createdAt: '2026-10-03T16:05:00.000Z', updatedAt: '2026-10-03T16:58:00.000Z' },
  { id: 'demo-admin-request-cancelled', customerId: 'demo-user-05', demoCustomerName: 'Ananya Das', vehicleId: 'demo-admin-vehicle-05', demoVehicleType: 'SUV', problemText: 'Fuel delivery cancelled after self-resolution', problemCategory: 'fuel', demoLocation: 'BTM Layout, Bengaluru', status: 'cancelled', cancelledBy: 'customer', createdAt: '2026-10-08T07:30:00.000Z' },
];

export interface DemoAdminReview {
  id: string;
  requestId: string;
  customerName: string;
  mechanicName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const DEMO_ADMIN_REVIEWS: DemoAdminReview[] = [
  { id: 'demo-review-01', requestId: 'demo-admin-request-complete', customerName: 'Priya Nair', mechanicName: 'VoltCare', rating: 5, comment: 'Quick arrival and a clear explanation before the repair.', createdAt: '2026-10-12T09:20:00.000Z' },
  { id: 'demo-review-02', requestId: 'demo-admin-request-complete-2', customerName: 'Aarav Mehta', mechanicName: 'Apex Towing', rating: 4, comment: 'Careful towing and helpful updates throughout.', createdAt: '2026-10-03T17:05:00.000Z' },
  { id: 'demo-review-03', requestId: 'demo-admin-request-complete-3', customerName: 'Kabir Rao', mechanicName: 'Metro Roadside Works', rating: 5, comment: 'The puncture was repaired quickly and safely.', createdAt: '2026-10-17T12:30:00.000Z' },
  { id: 'demo-review-04', requestId: 'demo-admin-request-complete-4', customerName: 'Ananya Das', mechanicName: 'VoltCare', rating: 4, comment: 'Helpful technician and a smooth battery restart.', createdAt: '2026-10-14T07:40:00.000Z' },
];

export const DEMO_ADMIN_NOTIFICATIONS: AppNotification[] = [
  { id: 'demo-admin-notification-01', type: 'application', title: 'Mechanic application received', body: 'Sharma Motors submitted a workshop application for HSR Layout coverage.', path: '/admin/approvals', createdAt: Date.parse('2026-10-27T09:40:00.000Z'), read: false },
  { id: 'demo-admin-notification-02', type: 'dispatch', title: 'Request awaiting dispatch', body: 'A sample fuel delivery request is waiting near Cubbon Park.', requestId: 'demo-admin-request-pending', createdAt: Date.parse('2026-10-27T10:35:00.000Z'), read: false },
  { id: 'demo-admin-notification-03', type: 'feedback', title: 'Customer feedback received', body: 'A sample five-star review was added for a completed sample request.', requestId: 'demo-admin-request-complete', createdAt: Date.parse('2026-10-12T09:20:00.000Z'), read: true },
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
  { id: 'demo-offer-01', requestId: 'demo-request-pending', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 105_000, status: 'pending', round: 1 },
  { id: 'demo-offer-02', requestId: 'demo-job-incoming-02', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 116_000, status: 'pending', round: 1 },
  { id: 'demo-offer-03', requestId: 'demo-job-complete', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: null, status: 'accepted', round: 1 },
  { id: 'demo-offer-04', requestId: 'demo-job-incoming-03', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 98_000, status: 'pending', round: 1 },
  { id: 'demo-offer-05', requestId: 'demo-job-incoming-04', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 110_000, status: 'pending', round: 2 },
  { id: 'demo-offer-06', requestId: 'demo-job-incoming-05', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: null, status: 'declined', round: 1 },
  { id: 'demo-offer-07', requestId: 'demo-job-incoming-06', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 118_000, status: 'pending', round: 1 },
  { id: 'demo-offer-08', requestId: 'demo-job-incoming-07', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 90_000, status: 'pending', round: 2 },
  { id: 'demo-offer-09', requestId: 'demo-job-incoming-08', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: Date.now() + 113_000, status: 'pending', round: 1 },
  { id: 'demo-offer-10', requestId: 'demo-job-active-tow', mechanicId: 'demo-mech-current', mechanicName: 'Imran Shaikh', expiresAtMs: null, status: 'accepted', round: 1 },
];

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  { id: 'demo-notification-01', type: 'dispatch', title: 'Mechanic is on the way', body: 'Apex Towing accepted your battery assistance request. Simulated ETA: 8 minutes.', requestId: 'demo-request-active', path: '/track/demo-request-active', createdAt: Date.parse('2026-10-24T10:28:00.000Z'), read: false },
  { id: 'demo-notification-02', type: 'receipt', title: 'Demo receipt ready', body: 'Your illustrative flat-tyre service receipt is available in history.', requestId: 'demo-request-complete', path: '/history/demo-request-complete', createdAt: Date.parse('2026-10-21T09:12:00.000Z'), read: false },
  { id: 'demo-notification-03', type: 'account', title: 'Vehicle profile is ready', body: 'Your Swift is marked as the default demo vehicle.', path: '/vehicles', createdAt: Date.parse('2026-10-20T08:00:00.000Z'), read: true },
];

export const DEMO_AUDIT_EVENTS: AdminAuditEvent[] = [
  { id: 'demo-audit-01', actorUid: 'demo-admin', action: 'mechanic.approved', targetType: 'mechanic', targetId: 'demo-mech-01', metadata: { sample: true, note: 'Illustrative event' }, createdAt: '2026-10-24T10:00:00.000Z' },
  { id: 'demo-audit-02', actorUid: 'demo-demo-system', action: 'mechanic.application_submitted', targetType: 'mechanic', targetId: 'demo-mech-03', metadata: { sample: true, note: 'Illustrative event' }, createdAt: '2026-10-24T09:45:00.000Z' },
  { id: 'demo-audit-03', actorUid: 'demo-demo-system', action: 'request.created', targetType: 'request', targetId: 'demo-admin-request-pending', metadata: { sample: true }, createdAt: '2026-10-24T10:18:00.000Z' },
  { id: 'demo-audit-04', actorUid: 'demo-demo-system', action: 'request.completed', targetType: 'request', targetId: 'demo-admin-request-complete', metadata: { sample: true, amountInr: 499 }, createdAt: '2026-10-21T09:10:00.000Z' },
  { id: 'demo-audit-05', actorUid: 'demo-demo-system', action: 'customer.feedback_received', targetType: 'request', targetId: 'demo-admin-request-complete', metadata: { sample: true, rating: 5 }, createdAt: '2026-10-21T09:20:00.000Z' },
];

export const DEMO_ADMIN_OFFERS: AdminOfferRow[] = [
  { requestId: 'demo-admin-request-active', mechanicId: 'demo-mech-01', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-accepted', mechanicId: 'demo-mech-02', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-pending', mechanicId: 'demo-mech-01', status: 'pending', round: 1 },
  { requestId: 'demo-admin-request-arrived', mechanicId: 'demo-mech-02', status: 'accepted', round: 2 },
  { requestId: 'demo-admin-request-service', mechanicId: 'demo-mech-01', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-complete', mechanicId: 'demo-mech-02', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-complete-3', mechanicId: 'demo-mech-07', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-complete-4', mechanicId: 'demo-mech-02', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-complete-2', mechanicId: 'demo-mech-01', status: 'accepted', round: 1 },
  { requestId: 'demo-admin-request-cancelled', mechanicId: 'demo-mech-02', status: 'declined', round: 1 },
];

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
  return DEMO_ADMIN_OFFERS;
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
