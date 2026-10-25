/* ==========================================================================
   RoadAssist Web — Seed data
   Values ported from the Flutter providers (which held richer mock data than
   the screens actually rendered). Names, prices, ratings, addresses and copy
   are kept identical to the app wherever they existed.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};

  /* Bengaluru anchor — Indiranagar. Used as the default map centre and as
     the home coordinate for the demo customer when geolocation is denied. */
  var HOME = { lat: 12.9716, lng: 77.5946 };

  /* ---------------------------------------------------------------------
     Service catalogue — merges the home grid (6 items) and the service
     selection screen (4 items) into one canonical list, and resolves the
     "Flat Tire" vs "Tire Change" naming conflict in favour of "Flat Tire".
     --------------------------------------------------------------------- */
  var SERVICES = [
    { id: 'towing',   name: 'Towing',        icon: 'tow',     tint: 'rgba(124,156,196,.16)',  tone: '#7C9CC4', base: 1499, eta: '15-25 min', desc: 'Flatbed and wheel-lift towing to any garage within 25 km.' },
    { id: 'battery',  name: 'Battery Jump',  icon: 'battery', tint: 'rgba(245,158,11,.15)',  tone: '#F59E0B', base: 599,  eta: '10-18 min', desc: 'Jump start, terminal cleaning, and on-the-spot battery testing.' },
    { id: 'tire',     name: 'Flat Tire',     icon: 'tire',    tint: 'rgba(56,189,248,.15)',  tone: '#38BDF8', base: 499,  eta: '12-20 min', desc: 'Spare fitting or puncture repair at the roadside.' },
    { id: 'fuel',     name: 'Fuel Delivery', icon: 'fuel',    tint: 'rgba(251,146,60,.15)',  tone: '#FB923C', base: 399,  eta: '15-22 min', desc: 'Up to 3 litres of petrol or diesel delivered to your location.' },
    { id: 'lockout',  name: 'Lockout',       icon: 'lock',    tint: 'rgba(255,107,0,.14)',   tone: '#FF8A2A', base: 549,  eta: '12-20 min', desc: 'Non-destructive entry by a certified locksmith technician.' },
    { id: 'winch',    name: 'Winched Out',   icon: 'winch',   tint: 'rgba(74,222,128,.15)',  tone: '#4ADE80', base: 1899, eta: '20-30 min', desc: 'Recovery from ditches, mud, sand, and waterlogged sections.' }
  ];

  /* ---------------------------------------------------------------------
     Mechanics — merged from mechanics_search_provider, the map screen's
     mock list, and the home dashboard's two hardcoded cards.
     --------------------------------------------------------------------- */
  var MECHANICS = [
    {
      id: 'mech_001',
      name: 'Arjun Reddy',
      shop: 'Apex Auto Towing & Repair',
      specialty: 'Flatbed Towing • Battery Service',
      services: ['towing', 'battery', 'winch'],
      tags: ['Flatbed Towing', 'Battery Replacement', 'Winched Out', 'Lockout Service'],
      rating: 4.9, reviews: 142, jobs: 1284,
      lat: 12.9750, lng: 77.6062,
      phone: '+91 98456 11122',
      online: true, verified: true,
      since: 2019,
      responseMin: 7,
      bio: 'Fifteen years working recoveries across Bengaluru. Certified for heavy-duty flatbed and electric vehicle transport.'
    },
    {
      id: 'mech_002',
      name: 'Sneha Iyer',
      shop: 'QuickFix Tire & Battery',
      specialty: 'Lockout & Tire Replacement',
      services: ['tire', 'battery', 'lockout'],
      tags: ['Tire Repair', 'Battery Jump', 'Lockout Service', 'Fuel Dispatch'],
      rating: 4.8, reviews: 98, jobs: 870,
      lat: 12.9658, lng: 77.5850,
      phone: '+91 99800 23456',
      online: true, verified: true,
      since: 2020,
      responseMin: 12,
      bio: 'Mobile tire and battery specialist. Carries stock for most sedan and light-truck fitments on board.'
    },
    {
      id: 'mech_003',
      name: 'Vikram Singh',
      shop: 'Metro Rescue Squad',
      specialty: 'Winched Out & Fuel Dispatch',
      services: ['winch', 'fuel', 'towing'],
      tags: ['Winch Recovery', 'Fuel Delivery', 'Long-Distance Tow'],
      rating: 4.7, reviews: 63, jobs: 542,
      lat: 12.9820, lng: 77.6015,
      phone: '+91 96321 78901',
      online: true, verified: true,
      since: 2021,
      responseMin: 16,
      bio: 'Recovery specialist for off-road and embankment incidents. Operates a 12,000 kg winch rig.'
    },
    {
      id: 'mech_004',
      name: 'Priya Nair',
      shop: 'Rapid Auto Care',
      specialty: 'Lockout & Fuel Dispatch',
      services: ['lockout', 'fuel', 'battery'],
      tags: ['Lockout Service', 'Fuel Delivery', 'Jump Start'],
      rating: 4.9, reviews: 211, jobs: 1620,
      lat: 12.9590, lng: 77.5980,
      phone: '+91 98861 45678',
      online: true, verified: true,
      since: 2018,
      responseMin: 9,
      bio: 'Highest-rated lockout technician in the district. Non-destructive entry on all modern immobiliser systems.'
    },
    {
      id: 'mech_005',
      name: 'Marcus D\'Souza',
      shop: 'Marathahalli Auto Works',
      specialty: 'Engine Diagnostics & Towing',
      services: ['towing', 'battery'],
      tags: ['Engine Repair', 'Diagnostics', 'Flatbed Towing'],
      rating: 4.6, reviews: 47, jobs: 318,
      lat: 12.9900, lng: 77.5800,
      phone: '+91 97310 22334',
      online: false, verified: true,
      since: 2022,
      responseMin: 21,
      bio: 'Mobile diagnostics with full OBD-II scan capability before deciding whether a tow is even needed.'
    },
    {
      id: 'mech_006',
      name: 'Elena Mascarenhas',
      shop: 'Euro Performance',
      specialty: 'European & EV Specialist',
      services: ['tire', 'battery', 'towing'],
      tags: ['EV Certified', 'European Marques', 'Low-Clearance Towing'],
      rating: 5.0, reviews: 34, jobs: 205,
      lat: 12.9520, lng: 77.6100,
      phone: '+91 90190 55667',
      online: true, verified: true,
      since: 2023,
      responseMin: 14,
      bio: 'Specialist in low-clearance and electric vehicles. Trained on high-voltage isolation procedures.'
    }
  ];

  /* ---------------------------------------------------------------------
     Vehicles  ←  vehicle_provider.dart
     --------------------------------------------------------------------- */
  var VEHICLES = [
    { id: 'veh_001', make: 'Tata',    model: 'Nexon EV', year: 2023, plate: 'KA-05-MN-4321', color: 'Signature Teal', isDefault: true,  fuel: 'Electric' },
    { id: 'veh_002', make: 'Mahindra', model: 'Scorpio', year: 2021, plate: 'KA-03-AB-1209', color: 'Napoli Black',   isDefault: false, fuel: 'Diesel' }
  ];

  /* ---------------------------------------------------------------------
     Emergency contacts  ←  emergency_provider.dart
     --------------------------------------------------------------------- */
  var CONTACTS = [
    { id: 'ec_000', name: 'Emergency Services (112)', relation: 'Police / Ambulance / Fire', phone: '112',         isPrimary: true,  locked: true },
    { id: 'ec_001', name: 'Zaid Nadaf',               relation: 'Spouse',                       phone: '+91 98456 11122', isPrimary: false, locked: false },
    { id: 'ec_002', name: 'Aarav Kumar',              relation: 'Brother',                      phone: '+91 99800 23456', isPrimary: false, locked: false }
  ];

  /* ---------------------------------------------------------------------
     Service history  ←  history_provider.dart (kept its ₹120 / ₹45 values)
     --------------------------------------------------------------------- */
  function daysAgo(n, h, m) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h === undefined ? 14 : h, m === undefined ? 0 : m, 0, 0);
    return d.toISOString();
  }

  var HISTORY = [
    { id: 'req_1003', ref: 'RA-1003', serviceId: 'towing',  service: 'Towing Assistance',  mechanicId: 'mech_001', mechanic: 'Apex Auto Towing & Repair', vehicleId: 'veh_001', amount: 1499, status: 'completed', rating: 5,    at: daysAgo(1, 16, 15), address: 'MG Road, Bengaluru, Karnataka',        durationMin: 42, note: 'Flatbed transport to Apex service centre.' },
    { id: 'req_1002', ref: 'RA-1002', serviceId: 'battery', service: 'Battery Jump Start', mechanicId: 'mech_002', mechanic: 'QuickFix Tire & Battery',   vehicleId: 'veh_002', amount: 599,  status: 'completed', rating: 4.8,  at: daysAgo(22, 9, 40), address: 'Residency Road, Bengaluru, Karnataka',  durationMin: 18, note: 'Terminals cleaned, battery tested at 71% health.' },
    { id: 'req_1001', ref: 'RA-1001', serviceId: 'tire',    service: 'Flat Tire Replacement', mechanicId: 'mech_002', mechanic: 'QuickFix Tire & Battery', vehicleId: 'veh_001', amount: 499, status: 'completed', rating: 5,    at: daysAgo(48, 18, 5), address: 'Old Airport Road, Bengaluru, Karnataka',  durationMin: 26, note: 'Rear left puncture patched, spare stowed.' },
    { id: 'req_1000', ref: 'RA-1000', serviceId: 'fuel',    service: 'Fuel Delivery',      mechanicId: 'mech_003', mechanic: 'Metro Rescue Squad',        vehicleId: 'veh_002', amount: 399,  status: 'completed', rating: 4.5,  at: daysAgo(74, 20, 30), address: 'Outer Ring Road, Bengaluru, Karnataka', durationMin: 21, note: '3 litres of petrol delivered.' },
    { id: 'req_0999', ref: 'RA-0999', serviceId: 'lockout', service: 'Lockout Service',    mechanicId: 'mech_004', mechanic: 'Rapid Auto Care',           vehicleId: 'veh_001', amount: 549,  status: 'cancelled', rating: null, at: daysAgo(96, 11, 10), address: 'Indiranagar 100 Ft Road, Bengaluru, Karnataka',    durationMin: 0,  note: 'Cancelled — spare key located.' }
  ];

  /* ---------------------------------------------------------------------
     Reviews  ←  review_provider.dart
     --------------------------------------------------------------------- */
  var REVIEWS = [
    { id: 'rev_001', mechanicId: 'mech_001', author: 'Ramesh Kumar', rating: 5,   text: 'Arrived in 10 minutes! Incredible tow truck service.', at: daysAgo(2, 15, 0) },
    { id: 'rev_002', mechanicId: 'mech_002', author: 'Suresh Patil',    rating: 4.8, text: 'Fixed my flat tire very quickly and professionally.',  at: daysAgo(8, 12, 30) },
    { id: 'rev_003', mechanicId: 'mech_001', author: 'Manjunath Gowda',   rating: 5,   text: 'Handled my EV with proper low-clearance ramps. No damage at all.', at: daysAgo(15, 17, 45) },
    { id: 'rev_004', mechanicId: 'mech_004', author: 'Arjun Shetty',    rating: 4.9, text: 'Got into my locked car without a scratch. Very reassuring.', at: daysAgo(20, 8, 20) },
    { id: 'rev_005', mechanicId: 'mech_003', author: 'Vikram Singh',  rating: 4.6, text: 'Winched me out of a ditch off the coast road at midnight.', at: daysAgo(31, 23, 55) }
  ];

  /* ---------------------------------------------------------------------
     Notifications  ←  notification_list_provider.dart
     --------------------------------------------------------------------- */
  function minsAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

  var NOTIFICATIONS = [
    { id: 'ntf_001', type: 'dispatch',  title: 'Mechanic En Route',    body: 'Apex Auto Towing is 8 mins away from your location.',        at: minsAgo(10),   read: false, icon: 'truck',       tone: '#7C9CC4' },
    { id: 'ntf_002', type: 'complete',  title: 'Service Completed',    body: 'Your battery jump request has been marked as complete.',      at: minsAgo(120),  read: false, icon: 'checkCircle', tone: '#22C55E' },
    { id: 'ntf_003', type: 'promo',     title: 'Priority Cover Offer', body: 'Upgrade to Priority and get unlimited call-outs this month.', at: minsAgo(1440), read: true,  icon: 'sparkles',    tone: '#F59E0B' },
    { id: 'ntf_004', type: 'receipt',   title: 'Receipt Available',    body: 'Invoice RA-1003 for ₹1,499.00 is ready to download.',         at: minsAgo(1500), read: true,  icon: 'file',        tone: '#A1A1AA' }
  ];

  /* ---------------------------------------------------------------------
     Mechanic portal — pending jobs  ←  mechanic_job_provider.dart
     --------------------------------------------------------------------- */
  var INCOMING = [
    { id: 'job_501', customer: 'Sarah Sharma',   vehicle: 'Maruti Suzuki Swift 2019 • KA-05-AB-1209', serviceId: 'tire',    service: 'Flat Tire Replacement',   address: 'Residency Road, Bengaluru, Karnataka',         distanceMi: 2.3, payout: 499, lat: 12.9658, lng: 77.5850, note: 'Rear passenger tire, has a spare in the boot.' },
    { id: 'job_502', customer: 'Mark Taylor',    vehicle: 'Hyundai Creta 2020 • KA-03-MN-7782',       serviceId: 'towing',  service: 'Flatbed Towing Request',   address: 'MG Road & Brigade Road, Bengaluru, Karnataka', distanceMi: 2.8, payout: 1299, lat: 12.9750, lng: 77.6062, note: 'Vehicle will not start, needs transport to dealer.' }
  ];

  var MECH_JOBS_TODAY = [
    { id: 'job_490', customer: 'Daniel D\'Souza', vehicle: 'Tata Nexon',     service: 'Towing Rescue',    payout: 1499.00, at: daysAgo(0, 16, 30), status: 'completed', rating: 5 },
    { id: 'job_489', customer: 'Rita Menon',      vehicle: 'Tata Tigor',     service: 'Battery Jump',     payout: 599.00,  at: daysAgo(0, 14, 10), status: 'completed', rating: 4.8 },
    { id: 'job_488', customer: 'Tom Whitfield',   vehicle: 'Tata Harrier',   service: 'Fuel Delivery',    payout: 399.00,  at: daysAgo(0, 12, 45), status: 'completed', rating: 5 },
    { id: 'job_487', customer: 'Grace Liu',       vehicle: 'Mahindra XUV700', service: 'Lockout Service', payout: 549.00,  at: daysAgo(0, 11, 5),  status: 'completed', rating: 4.9 },
    { id: 'job_486', customer: 'Owen Bailey',     vehicle: 'Hyundai Venue',  service: 'Flat Tire',        payout: 499.00,  at: daysAgo(0, 9, 50),  status: 'completed', rating: 4.7 },
    { id: 'job_485', customer: 'Nadia Hassan',    vehicle: 'VW Golf',        service: 'Battery Jump',     payout: 599.00,  at: daysAgo(0, 8, 20),  status: 'completed', rating: 5 }
  ];

  /* Weekly earnings — sums to a realistic week for an Indian roadside mechanic. */
  var MECH_EARNINGS_WEEK = [
    { day: 'Mon', jobs: 5, amount: 3450.00 },
    { day: 'Tue', jobs: 7, amount: 4875.00 },
    { day: 'Wed', jobs: 4, amount: 2750.00 },
    { day: 'Thu', jobs: 8, amount: 5680.00 },
    { day: 'Fri', jobs: 6, amount: 4225.00 },
    { day: 'Sat', jobs: 9, amount: 6325.00 },
    { day: 'Sun', jobs: 6, amount: 3950.00 }
  ];

  var PAYOUTS = [
    { id: 'po_014', period: 'Aug 11 – Aug 17', amount: 31255.50, status: 'paid',    at: daysAgo(7, 10, 0),  method: 'HDFC Bank •••• 4471' },
    { id: 'po_013', period: 'Aug 4 – Aug 10',  amount: 28540.00, status: 'paid',    at: daysAgo(14, 10, 0), method: 'HDFC Bank •••• 4471' },
    { id: 'po_012', period: 'Jul 28 – Aug 3',  amount: 33120.25, status: 'paid',    at: daysAgo(21, 10, 0), method: 'HDFC Bank •••• 4471' }
  ];

  /* ---------------------------------------------------------------------
     Admin  ←  admin_analytics_provider + mechanic_approval_provider
     --------------------------------------------------------------------- */
  var ADMIN_STATS = {
    totalUsers: 1420,
    activeMechanics: 85,
    totalRescues: 3890,
    revenueTotal: 4850000.00,
    avgResponseMin: 14.5,
    completionRate: 96.4,
    openDispatches: 12,
    pendingApprovals: 3
  };

  var PENDING_MECHANICS = [
    { id: 'pm_001', name: 'David Miller',     shop: 'Marathahalli Auto Works',   license: 'MECH-9921',  appliedAt: daysAgo(2, 9, 15),  city: 'Bengaluru, Karnataka',   services: ['towing', 'battery'],       docs: ['Trade License', 'Insurance Certificate', 'Aadhaar Card'],  experience: '8 years' },
    { id: 'pm_002', name: 'Elena Mascarenhas', shop: 'Euro Performance', license: 'MECH-4410',  appliedAt: daysAgo(3, 14, 40), city: 'Mysuru, Karnataka',     services: ['tire', 'battery', 'towing'], docs: ['Trade License', 'Insurance Certificate'],               experience: '5 years' },
    { id: 'pm_003', name: 'Ravi Kumar',       shop: 'Express Towing',   license: 'MECH-49281', appliedAt: daysAgo(5, 11, 0),  city: 'Hubballi, Karnataka',   services: ['towing', 'winch'],          docs: ['Commercial Tow License', 'Insurance Certificate', 'PAN Card'], experience: '12 years' }
  ];

  var DISPATCHES = [
    { id: 'dsp_301', ref: 'RA-2041', customer: 'Nina Patel',     serviceId: 'towing',  mechanic: 'Arjun Reddy',        status: 'en_route',  etaMin: 6,  address: 'Outer Ring Road & Marathahalli',   startedAt: minsAgo(14), amount: 1499 },
    { id: 'dsp_302', ref: 'RA-2042', customer: 'Robert Cole',    serviceId: 'battery', mechanic: 'Sneha Iyer',         status: 'arrived',   etaMin: 0,  address: 'Koramangala 5th Block',            startedAt: minsAgo(28), amount: 599 },
    { id: 'dsp_303', ref: 'RA-2043', customer: 'Aisha Rahman',   serviceId: 'lockout', mechanic: 'Priya Nair',         status: 'assigned',  etaMin: 11, address: 'Indiranagar 100 Ft Road',          startedAt: minsAgo(5),  amount: 549 },
    { id: 'dsp_304', ref: 'RA-2044', customer: 'Greg Donovan',   serviceId: 'winch',   mechanic: 'Vikram Singh',       status: 'en_route',  etaMin: 18, address: 'Nice Road & Outer Ring Road',      startedAt: minsAgo(9),  amount: 1899 },
    { id: 'dsp_305', ref: 'RA-2045', customer: 'Maya Fernandes', serviceId: 'fuel',    mechanic: null,                     status: 'searching', etaMin: null, address: 'Whitefield Main Road',         startedAt: minsAgo(2),  amount: 399 },
    { id: 'dsp_306', ref: 'RA-2046', customer: 'Leo Barnes',     serviceId: 'tire',    mechanic: 'Elena Mascarenhas',  status: 'completed', etaMin: 0,  address: 'HSR Layout Sector 1',             startedAt: minsAgo(52), amount: 499 }
  ];

  /* 12 months of platform volume for the admin chart — Indian scale (lakhs of
     rupees per month, hundreds of rescues per month). */
  var MONTHLY_VOLUME = [
    { m: 'Sep', rescues: 238, revenue: 1994000 },
    { m: 'Oct', rescues: 265, revenue: 2231000 },
    { m: 'Nov', rescues: 301, revenue: 2548000 },
    { m: 'Dec', rescues: 388, revenue: 3312000 },
    { m: 'Jan', rescues: 412, revenue: 3576000 },
    { m: 'Feb', rescues: 356, revenue: 3014000 },
    { m: 'Mar', rescues: 322, revenue: 2789000 },
    { m: 'Apr', rescues: 298, revenue: 2533000 },
    { m: 'May', rescues: 310, revenue: 2648000 },
    { m: 'Jun', rescues: 345, revenue: 2961000 },
    { m: 'Jul', rescues: 379, revenue: 3245000 },
    { m: 'Aug', rescues: 276, revenue: 2389000 }
  ];

  var SYSTEM_LOGS = [
    { id: 'log_01', level: 'info',    source: 'dispatch-engine', message: 'Auto-assigned RA-2043 to mech_004 (1.4 km, 11 min ETA).', at: minsAgo(5) },
    { id: 'log_02', level: 'warning', source: 'matching',        message: 'No mechanic within 5 km for RA-2045; widening radius to 8 km.', at: minsAgo(2) },
    { id: 'log_03', level: 'info',    source: 'auth',            message: 'New mechanic application submitted: MECH-9921.', at: minsAgo(2880) },
    { id: 'log_04', level: 'error',   source: 'payments',        message: 'UPI authorisation declined for RA-2039; customer notified to retry.', at: minsAgo(96) },
    { id: 'log_05', level: 'info',    source: 'tracking',        message: 'Location stream reconnected for mech_002 after 40s gap.', at: minsAgo(43) },
    { id: 'log_06', level: 'warning', source: 'tracking',        message: 'GPS accuracy degraded (>90 m) for mech_005 in tunnel segment.', at: minsAgo(210) }
  ];

  var REPORTS = [
    { id: 'rep_001', name: 'Assistance Summary Report', period: 'August 2026',    kind: 'PDF', size: '248 KB', at: minsAgo(60) },
    { id: 'rep_002', name: 'Mechanic Performance Review', period: 'Q3 2026',      kind: 'XLSX', size: '512 KB', at: minsAgo(1440) },
    { id: 'rep_003', name: 'Revenue & Payout Statement',  period: 'July 2026',    kind: 'PDF', size: '196 KB', at: minsAgo(44640) },
    { id: 'rep_004', name: 'Response Time Analysis',      period: 'Rolling 90d',  kind: 'CSV', size: '84 KB',  at: minsAgo(2880) }
  ];

  /* ---------------------------------------------------------------------
     Demo accounts  ←  profile_provider.dart
     --------------------------------------------------------------------- */
  var USERS = {
    customer: {
      id: 'usr_001', role: 'customer',
      name: 'Zaid Nadaf',
      email: 'zaid@roadassist.in',
      phone: '+91 98456 11122',
      address: 'Indiranagar, Bengaluru, Karnataka',
      memberSince: 'March 2024',
      plan: 'Standard',
      lat: HOME.lat, lng: HOME.lng
    },
    mechanic: {
      id: 'mech_001', role: 'mechanic',
      name: 'Arjun Reddy',
      shop: 'Apex Auto Towing & Repair',
      email: 'arjun@apextowing.in',
      phone: '+91 98456 11122',
      address: 'Indiranagar, Bengaluru, Karnataka',
      memberSince: 'June 2019',
      rating: 4.9,
      license: 'MECH-1042',
      lat: 12.9750, lng: 77.6062
    },
    admin: {
      id: 'adm_001', role: 'admin',
      name: 'Control Room',
      email: 'ops@roadassist.in',
      phone: '+91 98456 11122',
      address: 'RoadAssist HQ, Bengaluru, Karnataka',
      memberSince: 'January 2019'
    }
  };

  var SETTINGS = {
    pushNotifications: true,
    locationTracking: true,
    darkMode: true,
    emailReceipts: true,
    language: 'English (India)'
  };

  RA.seed = {
    HOME: HOME,
    SERVICES: SERVICES,
    MECHANICS: MECHANICS,
    VEHICLES: VEHICLES,
    CONTACTS: CONTACTS,
    HISTORY: HISTORY,
    REVIEWS: REVIEWS,
    NOTIFICATIONS: NOTIFICATIONS,
    INCOMING: INCOMING,
    MECH_JOBS_TODAY: MECH_JOBS_TODAY,
    MECH_EARNINGS_WEEK: MECH_EARNINGS_WEEK,
    PAYOUTS: PAYOUTS,
    ADMIN_STATS: ADMIN_STATS,
    PENDING_MECHANICS: PENDING_MECHANICS,
    DISPATCHES: DISPATCHES,
    MONTHLY_VOLUME: MONTHLY_VOLUME,
    SYSTEM_LOGS: SYSTEM_LOGS,
    REPORTS: REPORTS,
    USERS: USERS,
    SETTINGS: SETTINGS
  };
})(window);
