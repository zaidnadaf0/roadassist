/* ==========================================================================
   RoadAssist Web ��� Store
   Single source of truth + a swappable data source.

   The `RA.data` adapter below is deliberately the ONLY place that touches
   persistence. Everything is async (returns Promises) even though demo mode
   resolves immediately ��� so a real Firebase adapter can be dropped in without
   changing a single view. See README.md > "Connecting real Firebase".
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};
  var U = RA.util;
  var seed = RA.seed;

  var STORAGE_KEY = 'roadassist.state.v1';
  var SCHEMA = 2;

  /* Offer/dispatch tuning — mirrors MECHIST OFFER_WINDOW_MS + radii.
     Overridable via RA.config (config.js OPTIONS). */
  function cfg(key, fallback) {
    try { if (RA.config && RA.config[key] != null) return RA.config[key]; } catch (e) {}
    return fallback;
  }
  function offerWindowMs() { return cfg('offerWindowMs', (U.OFFER_WINDOW_MS || 120000)); }
  function dispatchRadiusKm() { return cfg('dispatchRadiusKm', (U.DISPATCH_RADIUS_KM || 25)); }

  /* Deduplicate rapid double-taps on "Confirm request" (MECHIST 2s guard). */
  var lastCreateAt = 0;
  var CREATE_DEDUP_MS = 2000;

  /* Request lifecycle ��� mirrors AssistanceRequestProvider's status enum
     (idle/submitting/assigned/enRoute/arrived/completed/cancelled). */
  var STATUS = {
    SEARCHING: 'searching',
    ASSIGNED:  'assigned',
    EN_ROUTE:  'en_route',
    ARRIVED:   'arrived',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  };

  var STATUS_META = {
    searching:   { label: 'Finding Mechanic', tone: 'warning', step: 0 },
    assigned:    { label: 'Mechanic Assigned', tone: 'primary', step: 1 },
    en_route:    { label: 'En Route',          tone: 'primary', step: 2 },
    arrived:     { label: 'Arrived On Site',   tone: 'accent',  step: 3 },
    in_progress: { label: 'Work In Progress',  tone: 'accent',  step: 4 },
    completed:   { label: 'Completed',         tone: 'success', step: 5 },
    cancelled:   { label: 'Cancelled',         tone: 'danger',  step: -1 }
  };

  /* MECHIST-compatible lifecycle helpers. BACKUP keeps its own status words;
     these sets encode the same guards MECHIST enforces transactionally. */
  var CANCELLABLE = ['searching', 'assigned', 'en_route', 'arrived'];
  var RELEASABLE = ['assigned', 'en_route', 'arrived', 'in_progress'];

  /* ======================================================================
     DATA SOURCE ADAPTER
     ====================================================================== */

  var demoAdapter = {
    name: 'demo',

    /** Build the initial state tree from seed data. */
    initial: function () {
      return {
        schema: SCHEMA,
        session: { role: null, userId: null, signedIn: false },
        users: JSON.parse(JSON.stringify(seed.USERS)),
        settings: Object.assign({}, seed.SETTINGS),

        services:   seed.SERVICES.slice(),
        mechanics:  JSON.parse(JSON.stringify(seed.MECHANICS)),
        vehicles:   JSON.parse(JSON.stringify(seed.VEHICLES)),
        contacts:   JSON.parse(JSON.stringify(seed.CONTACTS)),
        requests:   JSON.parse(JSON.stringify(seed.HISTORY)),
        reviews:    JSON.parse(JSON.stringify(seed.REVIEWS)),
        notifications: JSON.parse(JSON.stringify(seed.NOTIFICATIONS)),

        activeRequestId: null,
        draft: null,

        mechanic: {
          online: true,
          incoming: JSON.parse(JSON.stringify(seed.INCOMING)),
          acceptedJob: null,
          activeJobId: null,
          jobsToday: JSON.parse(JSON.stringify(seed.MECH_JOBS_TODAY)),
          week: JSON.parse(JSON.stringify(seed.MECH_EARNINGS_WEEK)),
          payouts: JSON.parse(JSON.stringify(seed.PAYOUTS))
        },

        admin: {
          stats: Object.assign({}, seed.ADMIN_STATS),
          pending: JSON.parse(JSON.stringify(seed.PENDING_MECHANICS)),
          dispatches: JSON.parse(JSON.stringify(seed.DISPATCHES)),
          monthly: JSON.parse(JSON.stringify(seed.MONTHLY_VOLUME)),
          logs: JSON.parse(JSON.stringify(seed.SYSTEM_LOGS)),
          reports: JSON.parse(JSON.stringify(seed.REPORTS)),
          decisions: []
        }
      };
    },

    load: function () {
      return Promise.resolve(U.storage.get(STORAGE_KEY, null));
    },

    save: function (state) {
      U.storage.set(STORAGE_KEY, state);
      return Promise.resolve(true);
    },

    clear: function () {
      U.storage.remove(STORAGE_KEY);
      return Promise.resolve(true);
    },

    /* Demo auth: any well-formed credential works. Role is chosen explicitly
       at sign-in rather than derived from a claim. */
    signIn: function (identifier, password, role) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (!identifier) return reject(new Error('Enter your email or mobile number.'));
          if (!password || password.length < 6) return reject(new Error('Password must be at least 6 characters.'));
          resolve({ role: role || 'customer' });
        }, 620);
      });
    },

    signUp: function (payload) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve({ role: 'customer', name: payload.name, email: payload.email }); }, 720);
      });
    },

    signOut: function () { return Promise.resolve(true); }
  };

  /* The demo adapter stays reachable no matter what else is running: it owns
     the seed state tree (which a brand-new Firebase account starts from) and
     it is the fallback whenever a real backend cannot be reached. */
  RA.demoAdapter = demoAdapter;

  /* Active adapter. RA.backend.resolve() may swap this for the Firebase
     adapter before the store boots ��� see assets/js/backend.js. */
  RA.data = demoAdapter;

  /* ======================================================================
     STORE
     ====================================================================== */

  var state = null;
  var listeners = [];
  var saveQueued = false;

  function notify(opts) {
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('[store] listener failed', e); }
    });
    /* A change that arrived FROM the backend must not be written straight back
       to it ��� that is exactly how you build an infinite sync loop. */
    if (opts && opts.remote) return;
    if (!saveQueued) {
      saveQueued = true;
      setTimeout(function () { saveQueued = false; RA.data.save(state); }, 120);
    }
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  function get() { return state; }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  function boot() {
    return RA.data.load().then(function (saved) {
      if (saved && (saved.schema === SCHEMA || saved.schema === 1)) {
        state = saved;
        // Seed lists are code, not user data — refresh them so edits to
        // seed.js show up without the user having to clear storage.
        state.services = seed.SERVICES.slice();
        if (state.schema === 1) migrateV1toV2();
        state.schema = SCHEMA;
      } else {
        state = RA.data.initial();
      }
      // Kick off geolocation in the background: the permission prompt must
      // never hold the first paint hostage. Views repaint when it lands.
      updateUserLocationFromGeolocation();
      return state;
    });
  }

  /* v1 -> v2: backfill MECHIST-parity fields without losing user data. */
  function migrateV1toV2() {
    try {
      (state.requests || []).forEach(function (r) {
        if (r.offerExpiresAt == null) r.offerExpiresAt = Date.now() + offerWindowMs();
        if (!Array.isArray(r.declinedBy)) r.declinedBy = [];
        if (r.problemCategory == null && r.serviceId) {
          try { r.problemCategory = U.serviceCategoryFor(r.serviceId); } catch (e) { r.problemCategory = 'other'; }
        }
        if (r.problemText == null) r.problemText = r.note || '';
        if (r.customerId == null) r.customerId = (state.users && state.users.customer || {}).id || 'customer_001';
      });
      if (state.mechanic && !Array.isArray(state.mechanic.incoming)) state.mechanic.incoming = [];
    } catch (e) { console.warn('[store] migrate v1->v2 skipped', e); }
  }

  function mechanicBase() {
    // state.mechanic holds queue/online flags; coordinates live on users.mechanic.
    var u = (state.users || {}).mechanic || {};
    return { lat: u.lat, lng: u.lng };
  }

  function updateUserLocationFromGeolocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        // Geolocation not supported - store error and resolve
        var role = select.role();
        if (role && state.users && state.users[role]) {
          state.users[role].geolocationError = {
            code: 0,
            message: 'Geolocation is not supported by this browser'
          };
        }
        resolve();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        function (position) {
          // Success - clear any previous error and update coordinates
          var role = select.role();
          if (role && state.users && state.users[role]) {
            state.users[role].lat = position.coords.latitude;
            state.users[role].lng = position.coords.longitude;
            // Clear geolocation error on success
            if (state.users[role].geolocationError) {
              state.users[role].geolocationError = null;
            }
          }
          if (RA.router && typeof RA.router.refresh === 'function') RA.router.refresh();
          resolve();
        },
        function (error) {
          // Error occurred - store error info but keep existing lat/lng as fallback
          var role = select.role();
          if (role && state.users && state.users[role]) {
            state.users[role].geolocationError = {
              code: error.code,
              message: error.message
            };
          }
          if (RA.router && typeof RA.router.refresh === 'function') RA.router.refresh();
          resolve();
        },
        { timeout: 10000 } // 10 second timeout
      );
    });
  }

  /* Adopt a state tree pushed from the backend (Firebase onSnapshot). Applied
     without writing it straight back, and only when it is genuinely newer, so
     open tabs and other devices converge without an echo loop. Live views
     repaint themselves via their own refresh; this just swaps the data under
     them and pings listeners so badges and the next navigation are correct. */
  function applyRemoteState(remote) {
    if (!remote || (remote.schema !== SCHEMA && remote.schema !== 1)) return false;
    // Never let a remote push knock the user out of the portal they're using.
    var session = state && state.session;
    state = remote;
    if (session && session.signedIn) state.session = session;
    state.services = seed.SERVICES.slice();
    notify({ remote: true });
    return true;
  }

  /* After a successful authentication, give the adapter a chance to hand back
     the state it already holds for that account, so a returning user lands on
     their own vehicles and history instead of the seed. The demo adapter has
     no afterAuth hook, so this is a no-op there and demo behaviour is
     unchanged. Never rejects: a failed fetch just leaves the local state. */
  function hydrateAfterAuth() {
    if (!RA.data || typeof RA.data.afterAuth !== 'function') return Promise.resolve(false);
    return RA.data.afterAuth().then(function (remote) {
      if (!remote || remote.schema !== SCHEMA) return false;
      state = remote;
      state.services = seed.SERVICES.slice();
      return true;
    }).catch(function (e) {
      console.warn('[store] could not load your saved data', e);
      return false;
    });
  }

  function resetDemo() {
    return RA.data.clear().then(function () {
      state = RA.data.initial();
      notify();
      return state;
    });
  }

  /* ----------------------------------------------------------------------
     Unified-mirror helpers (MECHIST parity, demo-safe).
     requests[] is the source of truth; dispatches[] and mechanic.incoming[]
     are views kept in sync here so the three portals never diverge.
     ---------------------------------------------------------------------- */
  function syncDispatchForRequest(req, mechHint) {
    try {
      var a = state.admin;
      var found = null;
      for (var i = 0; i < a.dispatches.length; i++) {
        if (a.dispatches[i].requestId === req.id || a.dispatches[i].ref === req.ref) { found = a.dispatches[i]; break; }
      }
      var mech = mechHint || (req.mechanicId ? select.mechanic(req.mechanicId) : null);
      if (!found) {
        a.dispatches.unshift({
          id: U.uid('dsp'), requestId: req.id, ref: req.ref,
          customer: req.customer, serviceId: req.serviceId,
          mechanicId: req.mechanicId || null,
          mechanic: mech ? mech.shop : (req.mechanic || 'Unassigned'),
          status: req.status, etaMin: req.etaMin,
          address: req.address, startedAt: req.at, amount: req.amount
        });
      } else {
        found.requestId = req.id;
        found.mechanicId = req.mechanicId || found.mechanicId || null;
        if (mech) found.mechanic = mech.shop;
        found.status = req.status;
        found.etaMin = req.etaMin;
        found.amount = req.amount;
      }
    } catch (e) {}
  }

  function pushMechanicOffer(req, mech) {
    try {
      var exists = state.mechanic.incoming.filter(function (j) { return j.id === req.id; })[0];
      if (exists) return exists;
      var veh = select.vehicle(req.vehicleId);
      var offer = {
        id: req.id, ref: req.ref,
        customer: req.customer, vehicle: veh ? (veh.make + ' ' + veh.model + ' ' + (veh.year || '')) : 'Vehicle',
        serviceId: req.serviceId, service: req.service,
        address: req.address, distanceMi: U.distanceKm(req.origin, mech),
        payout: req.amount, lat: req.origin.lat, lng: req.origin.lng,
        note: req.problemText || req.note || '',
        offerExpiresAt: req.offerExpiresAt
      };
      state.mechanic.incoming.unshift(offer);
      return offer;
    } catch (e) { return null; }
  }

  function rematchRequest(req) {
    // Next best eligible mechanic excluding declinedBy (MECHIST rematch).
    try {
      var ranked = select.eligibleMechanics(req.origin, req.serviceId, { exclude: req.declinedBy || [] });
      var next = ranked[0];
      if (!next) {
        req.offerExpiresAt = Date.now() + offerWindowMs();
        syncDispatchForRequest(req, null);
        return null;
      }
      req.offerExpiresAt = Date.now() + offerWindowMs();
      req.etaMin = next.etaMin;
      req.mechanicPos = { lat: next.mechanic.lat, lng: next.mechanic.lng };
      req.mechanic = next.mechanic.shop;
      syncDispatchForRequest(req, next.mechanic);
      pushMechanicOffer(req, next.mechanic);
      return next.mechanic;
    } catch (e) { return null; }
  }

  /* ----------------------------------------------------------------------
     Selectors
     ---------------------------------------------------------------------- */
  var select = {
    role: function () { return state.session.role; },
    signedIn: function () { return !!state.session.signedIn; },

    me: function () {
      var r = state.session.role || 'customer';
      return state.users[r];
    },

    service: function (id) {
      return state.services.filter(function (s) { return s.id === id; })[0] || null;
    },

    mechanic: function (id) {
      return state.mechanics.filter(function (m) { return m.id === id; })[0] || null;
    },

    onlineMechanics: function () {
      return state.mechanics.filter(function (m) { return m.online; });
    },

    /** Mechanics sorted by distance from the customer, with derived fields. */
    mechanicsNear: function (origin, serviceId) {
      var from = origin || select.me();
      var list = state.mechanics.map(function (m) {
        var mi = U.distanceMiles(from, m);
        return Object.assign({}, m, {
          distanceMi: mi,
          etaMin: U.etaMinutes(from, m)
        });
      });
      if (serviceId) {
        list = list.filter(function (m) { return m.services.indexOf(serviceId) > -1; });
      }
      return U.sortBy(list, 'distanceMi', 'asc');
    },

    vehicle: function (id) {
      return state.vehicles.filter(function (v) { return v.id === id; })[0] || null;
    },

    defaultVehicle: function () {
      return state.vehicles.filter(function (v) { return v.isDefault; })[0] || state.vehicles[0] || null;
    },

    /** Geolocation status and error information for the current user */
    geolocationStatus: function () {
      var role = select.role();
      if (role && state.users && state.users[role]) {
        var user = state.users[role];
        return {
          hasCoordinates: user.lat !== undefined && user.lng !== undefined,
          error: user.geolocationError || null,
          /* "Demo" coordinates = the Bengaluru anchor in seed.js. If the
             browser denied geolocation we are still showing a sensible
             default rather than a broken map. */
          isDemoCoordinates: user.lat === seed.HOME.lat && user.lng === seed.HOME.lng
        };
      }
      return { hasCoordinates: false, error: null, isDemoCoordinates: false };
    },

    request: function (id) {
      return state.requests.filter(function (r) { return r.id === id; })[0] || null;
    },

    activeRequest: function () {
      return state.activeRequestId ? select.request(state.activeRequestId) : null;
    },

    /** Completed/cancelled requests, newest first. */
    history: function () {
      return U.sortBy(state.requests.filter(function (r) {
        return r.status === STATUS.COMPLETED || r.status === STATUS.CANCELLED;
      }), function (r) { return new Date(r.at).getTime(); }, 'desc');
    },

    reviewsFor: function (mechanicId) {
      return U.sortBy(state.reviews.filter(function (r) { return r.mechanicId === mechanicId; }),
        function (r) { return new Date(r.at).getTime(); }, 'desc');
    },

    unreadCount: function () {
      return state.notifications.filter(function (n) { return !n.read; }).length;
    },

    notifications: function () {
      return U.sortBy(state.notifications, function (n) { return new Date(n.at).getTime(); }, 'desc');
    },

    /* --- customer spend analytics --- */
    spendStats: function () {
      var done = state.requests.filter(function (r) { return r.status === STATUS.COMPLETED; });
      var total = U.sum(done, function (r) { return r.amount; });
      var rated = done.filter(function (r) { return r.rating; });
      return {
        requests: state.requests.length,
        completed: done.length,
        totalSpent: total,
        avgSpend: done.length ? total / done.length : 0,
        avgDuration: done.length ? U.sum(done, function (r) { return r.durationMin; }) / done.length : 0,
        avgRatingGiven: rated.length ? U.sum(rated, function (r) { return r.rating; }) / rated.length : 0,
        byService: U.groupBy(done, 'serviceId')
      };
    },

    /* --- mechanic analytics (demo week + real completed-request earnings) --- */
    mechStats: function () {
      var m = state.mechanic;
      var today = U.sum(m.jobsToday, function (j) { return j.payout; });
      var rated = m.jobsToday.filter(function (j) { return j.rating; });
      var myId = ((select.mechanicBySession && select.mechanicBySession()) || {}).id;
      var real = state.requests.filter(function (r) {
        return r.status === STATUS.COMPLETED && myId && r.mechanicId === myId;
      });
      return {
        todayEarnings: today,
        todayJobs: m.jobsToday.length,
        weekEarnings: U.sum(m.week, function (d) { return d.amount; }),
        weekJobs: U.sum(m.week, function (d) { return d.jobs; }),
        realEarnings: U.sum(real, function (r) { return r.amount; }),
        realJobs: real.length,
        avgRating: rated.length ? U.sum(rated, function (j) { return j.rating; }) / rated.length : 0,
        avgPerJob: m.jobsToday.length ? today / m.jobsToday.length : 0,
        pending: m.incoming.length
      };
    },

    /** Roster mechanic matching the signed-in mechanic user (demo: first). */
    mechanicBySession: function () {
      var mu = (state.users || {}).mechanic || {};
      var byId = state.mechanics.filter(function (x) { return x.id === mu.id; })[0];
      return byId || state.mechanics[0] || null;
    },

    /** Ranked eligible mechanics for an origin + service (MECHIST scoring). */
    eligibleMechanics: function (origin, serviceId, opts) {
      var o = opts || {};
      var from = origin || select.me();
      var category = null;
      try { category = U.serviceCategoryFor(serviceId); } catch (e) {}
      return U.findEligibleMechanics(state.mechanics, from, {
        category: category,
        exclude: o.exclude || [],
        radiusKm: (o.radiusKm != null) ? o.radiusKm : dispatchRadiusKm()
      });
    },

    activeJob: function () {
      return state.mechanic.acceptedJob || null;
    },

    /* --- admin analytics (static stats + live request-derived ops) --- */
    opsStats: function () {
      var reqs = state.requests || [];
      var byStatus = U.groupBy(reqs, 'status');
      var completed = byStatus[STATUS.COMPLETED] || [];
      var now = Date.now();
      return {
        total: reqs.length,
        byStatus: byStatus,
        completed: completed.length,
        revenue: U.sum(completed, function (r) { return r.amount; }),
        avgEta: reqs.length ? U.sum(reqs, function (r) { return r.etaMin; }) / reqs.length : 0,
        avgDuration: completed.length ? U.sum(completed, function (r) { return r.durationMin; }) / completed.length : 0,
        unassigned: reqs.filter(function (r) { return r.status === STATUS.SEARCHING && !r.mechanicId; }).length,
        expiredOffers: reqs.filter(function (r) {
          return r.status === STATUS.SEARCHING && r.offerExpiresAt && r.offerExpiresAt < now;
        }).length,
        released: reqs.filter(function (r) { return r.releaseReason; }).length,
        cancelled: (byStatus[STATUS.CANCELLED] || []).length
      };
    },

    /* --- admin analytics --- */
    adminStats: function () {
      var a = state.admin;
      var open = a.dispatches.filter(function (d) { return d.status !== 'completed'; });
      return Object.assign({}, a.stats, {
        openDispatches: open.length,
        pendingApprovals: a.pending.length,
        searching: a.dispatches.filter(function (d) { return d.status === 'searching'; }).length,
        monthRevenue: a.monthly[a.monthly.length - 1].revenue,
        monthRescues: a.monthly[a.monthly.length - 1].rescues
      });
    }
  };

  /* ----------------------------------------------------------------------
     Actions
     ---------------------------------------------------------------------- */
  var actions = {

    /* --- session --- */
    signIn: function (identifier, password, role) {
      return RA.data.signIn(identifier, password, role).then(function (res) {
        return hydrateAfterAuth().then(function () {
          var r = res.role;
          state.session = { role: r, userId: state.users[r].id, signedIn: true };
          notify();
          return res;
        });
      });
    },

    signUp: function (payload) {
      return RA.data.signUp(payload).then(function (res) {
        if (payload.name)  state.users.customer.name = payload.name;
        if (payload.email) state.users.customer.email = payload.email;
        state.session = { role: 'customer', userId: state.users.customer.id, signedIn: true };
        notify();
        return res;
      });
    },

    /** Demo shortcut used by the landing page portal cards and guest sign-in.
        With a real backend that exposes anonymous auth, this becomes a genuine
        (anonymous) session so the state has a real place to persist; if that is
        unavailable it falls back to a local-only session so the button still
        works. */
    enterAs: function (role) {
      function localSession() {
        state.session = { role: role, userId: state.users[role].id, signedIn: true };
        notify();
        return role;
      }
      if (RA.data && typeof RA.data.signInAnonymously === 'function') {
        return RA.data.signInAnonymously(role)
          .then(function () { return hydrateAfterAuth(); })
          .then(function () { return localSession(); })
          .catch(function (e) {
            console.warn('[store] anonymous sign-in unavailable, using a local session', e);
            return localSession();
          });
      }
      return Promise.resolve(localSession());
    },

    switchRole: function (role) {
      if (!state.users[role]) return;
      state.session.role = role;
      state.session.userId = state.users[role].id;
      notify();
    },

    signOut: function () {
      return RA.data.signOut().then(function () {
        state.session = { role: null, userId: null, signedIn: false };
        notify();
      });
    },

    /* --- profile & settings --- */
    updateProfile: function (patch) {
      var r = state.session.role || 'customer';
      Object.assign(state.users[r], patch);
      notify();
    },

    setSetting: function (key, value) {
      state.settings[key] = value;
      notify();
    },

    /* --- vehicles --- */
    addVehicle: function (v) {
      var veh = {
        id: U.uid('veh'),
        make: v.make, model: v.model,
        year: v.year ? Number(v.year) : new Date().getFullYear(),
        plate: (v.plate || '').toUpperCase(),
        color: v.color || '���',
        fuel: v.fuel || 'Petrol',
        isDefault: state.vehicles.length === 0
      };
      state.vehicles.push(veh);
      notify();
      return veh;
    },

    updateVehicle: function (id, patch) {
      var v = select.vehicle(id);
      if (v) { Object.assign(v, patch); notify(); }
      return v;
    },

    deleteVehicle: function (id) {
      var wasDefault = (select.vehicle(id) || {}).isDefault;
      state.vehicles = state.vehicles.filter(function (v) { return v.id !== id; });
      if (wasDefault && state.vehicles.length) state.vehicles[0].isDefault = true;
      notify();
    },

    setDefaultVehicle: function (id) {
      state.vehicles.forEach(function (v) { v.isDefault = (v.id === id); });
      notify();
    },

    /* --- emergency contacts --- */
    addContact: function (c) {
      var ct = { id: U.uid('ec'), name: c.name, relation: c.relation || 'Contact', phone: c.phone, isPrimary: false, locked: false };
      state.contacts.push(ct);
      notify();
      return ct;
    },

    deleteContact: function (id) {
      state.contacts = state.contacts.filter(function (c) { return c.id !== id || c.locked; });
      notify();
    },

    /* --- request flow --------------------------------------------------
       draft ��� createRequest ��� (simulated) assigned ��� en_route ��� arrived
       ��� in_progress ��� completed
       ------------------------------------------------------------------ */

    setDraft: function (patch) {
      state.draft = Object.assign({
        serviceId: null,
        vehicleId: (select.defaultVehicle() || {}).id || null,
        mechanicId: null,
        address: 'Indiranagar, Bengaluru, Karnataka',
        note: ''
      }, state.draft || {}, patch);
      notify();
      return state.draft;
    },

    clearDraft: function () { state.draft = null; notify(); },

    createRequest: function () {
      // 2s double-tap guard (MECHIST parity).
      var nowDedup = Date.now();
      if (nowDedup - lastCreateAt < CREATE_DEDUP_MS) return null;
      var d = state.draft || {};
      var svc = select.service(d.serviceId) || state.services[0];
      var me = select.me() || {};
      var address = String(d.address || '').trim() || 'Indiranagar, Bengaluru, Karnataka';
      var note = String(d.note || '').trim();
      // Validation mirrors MECHIST createRequestValidate (problem >=5 chars).
      var veh = select.vehicle(d.vehicleId) || select.defaultVehicle();
      if (!veh) return null;
      if (!me.lat || !me.lng || !U.isValidLatLng({ lat: me.lat, lng: me.lng })) return null;

      var category = 'other';
      try { category = U.serviceCategoryFor(svc.id); } catch (e) {}
      // Ranked dispatch: picked mechanic first, else best eligible (not just nearest).
      var mech = d.mechanicId ? select.mechanic(d.mechanicId) : null;
      if (!mech) {
        var ranked = select.eligibleMechanics(me, svc.id, {});
        mech = (ranked[0] || {}).mechanic
          || select.mechanicsNear(me, svc.id).filter(function (m) { return m.online; })[0]
          || select.mechanicsNear(me, null)[0]
          || null;
      }
      lastCreateAt = nowDedup;

      var n = 2050 + state.requests.length;
      var nowIso = new Date().toISOString();
      var req = {
        id: U.uid('req'),
        ref: U.refCode('RA', n),
        serviceId: svc.id,
        service: svc.name,
        problemCategory: category,
        problemText: note,
        mechanicId: null, // unassigned until a mechanic claims (or admin dispatches)
        mechanic: mech ? mech.shop : 'RoadAssist Dispatcher',
        pickedMechanicId: d.mechanicId || null,
        customerId: me.id || 'customer_001',
        customer: me ? me.name : '',
        customerPhone: me.phone || null,
        vehicleId: veh.id,
        address: address,
        note: note,
        amount: svc.base,
        status: STATUS.SEARCHING,
        rating: null,
        ratingComment: null,
        at: nowIso,
        createdAt: nowDedup,
        updatedAt: nowDedup,
        durationMin: 0,
        etaMin: mech ? U.deriveEtaMinutes(mech, me) : 12,
        origin: { lat: me.lat, lng: me.lng },
        mechanicPos: mech ? { lat: mech.lat, lng: mech.lng } : null,
        progress: 0,
        completedAt: null,
        offerExpiresAt: nowDedup + offerWindowMs(),
        declinedBy: [],
        releaseReason: null,
        releasedAt: null,
        cancellationReason: null,
        cancelledBy: null,
        cancelledAt: null,
        events: [{ status: STATUS.SEARCHING, at: nowIso }]
      };

      state.requests.unshift(req);
      state.activeRequestId = req.id;
      state.draft = null;

      // Keep the three mirrors in sync from birth: customer request +
      // admin dispatch row + (if pre-picked) mechanic offer.
      syncDispatchForRequest(req, mech);
      if (d.mechanicId && mech) pushMechanicOffer(req, mech);

      actions.pushNotification({
        id: 'notif_' + req.id + '_requested',
        title: 'Request Broadcast',
        body: 'Searching for a verified mechanic near ' + req.address + '.',
        icon: 'radio', tone: '#7C9CC4', type: 'dispatch',
        requestId: req.id, path: '#/track'
      });

      notify();
      return req;
    },

    /** Move a request to the next lifecycle stage. */
    advanceRequest: function (id) {
      var r = select.request(id);
      if (!r) return null;
      if (r.status === STATUS.COMPLETED || r.status === STATUS.CANCELLED) return r;
      var order = [STATUS.SEARCHING, STATUS.ASSIGNED, STATUS.EN_ROUTE, STATUS.ARRIVED, STATUS.IN_PROGRESS, STATUS.COMPLETED];
      var i = order.indexOf(r.status);
      if (i < 0 || i >= order.length - 1) return r;

      r.status = order[i + 1];
      r.updatedAt = Date.now();
      r.events.push({ status: r.status, at: new Date().toISOString() });

      var mech = select.mechanic(r.mechanicId);
      var name = mech ? mech.shop : (r.mechanic || 'Your mechanic');

      if (r.status === STATUS.ASSIGNED) {
        actions.pushNotification({ id: 'notif_' + r.id + '_assigned', title: 'Mechanic Assigned', body: name + ' accepted your request.', icon: 'verified', tone: '#7C9CC4', type: 'dispatch', requestId: r.id, path: '#/track' });
      } else if (r.status === STATUS.EN_ROUTE) {
        actions.pushNotification({ id: 'notif_' + r.id + '_enroute', title: 'Mechanic En Route', body: name + ' is ' + U.mins(r.etaMin) + ' away from your location.', icon: 'truck', tone: '#7C9CC4', type: 'dispatch', requestId: r.id, path: '#/track' });
      } else if (r.status === STATUS.ARRIVED) {
        r.etaMin = 0; r.progress = 1;
        actions.pushNotification({ id: 'notif_' + r.id + '_arrived', title: 'Mechanic Arrived', body: name + ' has arrived at your location.', icon: 'pin', tone: '#FF8A2A', type: 'dispatch', requestId: r.id, path: '#/track' });
      } else if (r.status === STATUS.COMPLETED) {
        r.completedAt = new Date().toISOString();
        r.durationMin = Math.max(12, Math.round((new Date(r.completedAt).getTime() - new Date(r.at).getTime()) / 60000));
        if (state.activeRequestId === r.id) state.activeRequestId = null;
        actions.pushNotification({ id: 'notif_' + r.id + '_completed', title: 'Service Completed', body: 'Your ' + String(r.service || '').toLowerCase() + ' request has been marked as complete.', icon: 'checkCircle', tone: '#22C55E', type: 'complete', requestId: r.id, path: '#/history/' + r.id });
        // Mechanic mirror: clear accepted job if it was this request.
        try {
          if (state.mechanic.acceptedJob && state.mechanic.acceptedJob.id === r.id) {
            var job = state.mechanic.acceptedJob;
            state.mechanic.jobsToday.unshift({
              id: job.id, customer: job.customer || r.customer, vehicle: job.vehicle,
              service: job.service || r.service, payout: job.payout || r.amount,
              at: new Date().toISOString(), status: 'completed', rating: null
            });
            var last = state.mechanic.week[state.mechanic.week.length - 1];
            if (last) { last.amount += (job.payout || r.amount || 0); last.jobs += 1; }
            state.mechanic.acceptedJob = null;
            state.mechanic.activeJobId = null;
          }
        } catch (e) {}
      }
      syncDispatchForRequest(r, mech);
      notify();
      return r;
    },

    cancelRequest: function (id, reason) {
      var r = select.request(id);
      if (!r) return null;
      // MECHIST CANCELLABLE: requested/accepted/on-the-way/arrived.
      if (CANCELLABLE.indexOf(r.status) < 0) return null;
      r.status = STATUS.CANCELLED;
      r.cancellationReason = reason || null; // keep note/problemText intact
      r.cancelledBy = 'customer';
      r.cancelledAt = new Date().toISOString();
      r.updatedAt = Date.now();
      r.amount = 0;
      r.events.push({ status: STATUS.CANCELLED, at: new Date().toISOString() });
      if (state.activeRequestId === id) state.activeRequestId = null;
      try {
        state.mechanic.incoming = state.mechanic.incoming.filter(function (j) { return j.id !== id; });
        if (state.mechanic.acceptedJob && state.mechanic.acceptedJob.id === id) {
          state.mechanic.acceptedJob = null; state.mechanic.activeJobId = null;
        }
      } catch (e) {}
      syncDispatchForRequest(r, null);
      actions.pushNotification({ id: 'notif_' + r.id + '_cancelled', title: 'Request Cancelled', body: r.ref + ' was cancelled. You have not been charged.', icon: 'xCircle', tone: '#FF3B30', type: 'dispatch', requestId: r.id, path: '#/history' });
      notify();
      return r;
    },

    /** Called on a timer while a request is live, to animate the map. */
    tickRequest: function (id, delta) {
      var r = select.request(id);
      if (!r || !r.mechanicPos) return null;
      if (r.status !== STATUS.EN_ROUTE && r.status !== STATUS.ASSIGNED) return r;
      if (!r.etaTotal) r.etaTotal = r.etaMin || 12;
      r.progress = U.clamp((r.progress || 0) + delta, 0, 1);
      r.etaMin = Math.max(0, Math.round(r.etaTotal * (1 - r.progress)));
      if (r.progress >= 1) { actions.advanceRequest(id); return r; }
      notify();
      return r;
    },

    /** Jump a live request straight to arrival (demo "Simulate" button). */
    fastForward: function (id) {
      var r = select.request(id);
      if (!r) return null;
      var guard = 0;
      while (r.status !== STATUS.ARRIVED && r.status !== STATUS.COMPLETED && guard++ < 6) {
        actions.advanceRequest(id);
      }
      return r;
    },

    /* --- reviews --- */
    submitReview: function (requestId, rating, text) {
      var r = select.request(requestId);
      if (!r) return null;

      // Only allow reviews for completed requests
      if (r.status !== STATUS.COMPLETED) {
        return null;
      }

      // Only allow the customer who owns the request to leave a review
      var currentUser = select.me();
      if (!currentUser || (r.customer && r.customer !== currentUser.name)) {
        return null;
      }

      // Check if a review already exists for this request
      var existingReview = state.reviews.filter(function (rev) {
        return rev.requestId === requestId;
      })[0];
      if (existingReview) {
        return null;
      }

      r.rating = rating;
      r.ratingComment = text || null;
      r.updatedAt = Date.now();
      var rev = {
        id: U.uid('rev'),
        mechanicId: r.mechanicId,
        requestId: requestId,
        author: currentUser.name,
        rating: rating,
        text: text || '',
        at: new Date().toISOString()
      };
      state.reviews.unshift(rev);

      // Nudge the mechanic's aggregate rating.
      var m = select.mechanic(r.mechanicId);
      if (m) {
        var total = m.rating * m.reviews + rating;
        m.reviews += 1;
        m.rating = Math.round((total / m.reviews) * 10) / 10;
      }
      notify();
      return rev;
    },

    /* --- notifications (deterministic ids: notif_{req}_{event}) --- */
    pushNotification: function (n) {
      var id = n.id || U.uid('ntf');
      var dup = state.notifications.filter(function (x) { return x.id === id; })[0];
      if (dup) { dup.read = false; dup.at = new Date().toISOString(); return true; }
      state.notifications.unshift({
        id: id,
        type: n.type || 'info',
        title: n.title,
        body: n.body,
        at: new Date().toISOString(),
        read: false,
        icon: n.icon || 'bell',
        tone: n.tone || '#7C9CC4',
        requestId: n.requestId || null,
        path: n.path || null
      });
      if (state.notifications.length > 40) state.notifications.length = 40;
      return true;
    },

    markRead: function (id) {
      var n = state.notifications.filter(function (x) { return x.id === id; })[0];
      if (n) { n.read = true; notify(); }
    },

    markAllRead: function () {
      state.notifications.forEach(function (n) { n.read = true; });
      notify();
    },

    /* --- mechanic portal --- */
    setMechanicOnline: function (on) {
      state.mechanic.online = !!on;
      notify();
    },

    /** Replace the mechanic's incoming queue with a fresh list of offers.
        Patches the live state in place rather than overwriting the whole tree,
        which is what the Firestore requests-listener needs to do — see
        adapter-firebase.js > setupRequestListener. */
    setMechanicIncoming: function (requests) {
      state.mechanic.incoming = Array.isArray(requests) ? requests : [];
      notify();
      return state.mechanic.incoming;
    },

    acceptJob: function (jobId, mechanicId) {
      // Unified claim: checks status + expiry + duplicate, then syncs all mirrors.
      // Returns { ok, code } where code ∈ accepted|expired|alreadyTaken.
      var m = state.mechanic;
      var myId = mechanicId || (select.mechanicBySession() || {}).id || 'mech_001';
      var job = m.incoming.filter(function (j) { return j.id === jobId; })[0];
      var req = select.request(jobId);
      if (!req && !job) return { ok: false, code: 'alreadyTaken' };
      var target = req || null;
      if (target) {
        if (target.status !== STATUS.SEARCHING) return { ok: false, code: 'alreadyTaken' };
        if (target.offerExpiresAt && target.offerExpiresAt < Date.now()) {
          actions.expireOffer(target.id);
          return { ok: false, code: 'expired' };
        }
        if ((target.declinedBy || []).indexOf(myId) > -1) return { ok: false, code: 'alreadyTaken' };
      }
      var roster = select.mechanic(myId) || select.mechanicBySession();
      m.incoming = m.incoming.filter(function (j) { return j.id !== jobId; });
      var payout = job ? job.payout : (target ? target.amount : 0);
      m.acceptedJob = Object.assign({}, job || {
        id: target.id, customer: target.customer, vehicle: target.vehicleId,
        service: target.service, serviceId: target.serviceId
      }, {
        payout: payout, mechanicId: myId,
        acceptedAt: new Date().toISOString(), status: 'en_route',
        offerExpiresAt: null
      });
      m.activeJobId = jobId;
      if (target) {
        target.status = STATUS.ASSIGNED;
        target.mechanicId = myId;
        target.mechanic = roster ? roster.shop : target.mechanic;
        target.mechanicPos = roster ? { lat: roster.lat, lng: roster.lng } : target.mechanicPos;
        target.etaMin = roster && target.origin ? U.deriveEtaMinutes(roster, target.origin) : target.etaMin;
        target.updatedAt = Date.now();
        target.events.push({ status: STATUS.ASSIGNED, at: new Date().toISOString() });
        syncDispatchForRequest(target, roster);
        actions.pushNotification({
          id: 'notif_' + target.id + '_assigned', title: 'Mechanic Assigned',
          body: (roster ? roster.shop : 'Your mechanic') + ' accepted your request.',
          icon: 'verified', tone: '#7C9CC4', type: 'dispatch', requestId: target.id, path: '#/track'
        });
      }
      notify();
      return { ok: true, code: 'accepted', job: m.acceptedJob };
    },

    declineJob: function (jobId, mechanicId) {
      // Decline keeps the request open: appends declinedBy + rematches.
      var myId = mechanicId || (select.mechanicBySession() || {}).id || 'mech_001';
      state.mechanic.incoming = state.mechanic.incoming.filter(function (j) { return j.id !== jobId; });
      var req = select.request(jobId);
      if (req && req.status === STATUS.SEARCHING) {
        req.declinedBy = req.declinedBy || [];
        if (req.declinedBy.indexOf(myId) < 0) req.declinedBy.push(myId);
        req.updatedAt = Date.now();
        rematchRequest(req);
      }
      notify();
      return { ok: true, code: 'declined' };
    },

    /** Offer expired without a claim: drop from queue, extend window, rematch. */
    expireOffer: function (requestId) {
      var req = select.request(requestId);
      state.mechanic.incoming = state.mechanic.incoming.filter(function (j) { return j.id !== requestId; });
      if (req && req.status === STATUS.SEARCHING) {
        rematchRequest(req);
        actions.pushNotification({
          id: 'notif_' + req.id + '_expired', title: 'Offer Expired',
          body: req.ref + ' was re-offered to the next available mechanic.',
          icon: 'radio', tone: '#F59E0B', type: 'dispatch', requestId: req.id, path: '#/track'
        });
      }
      notify();
      return true;
    },

    /** Release an in-flight job back to the queue with a fresh window. */
    releaseJob: function (reason) {
      var m = state.mechanic;
      var job = m.acceptedJob;
      if (!job) return null;
      var req = select.request(job.id);
      m.acceptedJob = null;
      m.activeJobId = null;
      if (req && RELEASABLE.indexOf(req.status) > -1 || (req && req.status === STATUS.ASSIGNED)) {
        req.status = STATUS.SEARCHING;
        req.mechanicId = null;
        req.offerExpiresAt = Date.now() + offerWindowMs();
        req.releaseReason = reason || 'Released by mechanic';
        req.releasedAt = new Date().toISOString();
        req.updatedAt = Date.now();
        req.events.push({ status: STATUS.SEARCHING, at: new Date().toISOString() });
        rematchRequest(req);
        actions.pushNotification({
          id: 'notif_' + req.id + '_released', title: 'Mechanic Released',
          body: (reason || 'Your request is back in the queue.'),
          icon: 'radio', tone: '#F59E0B', type: 'dispatch', requestId: req.id, path: '#/track'
        });
      }
      notify();
      return job;
    },

    /** Mark that the mechanic has reached the customer (en_route → arrived). */
    arriveAtJob: function () {
      var job = state.mechanic.acceptedJob;
      if (!job) return null;
      job.status = 'arrived';
      job.arrivedAt = new Date().toISOString();
      var req = select.request(job.id);
      if (req && (req.status === STATUS.EN_ROUTE || req.status === STATUS.ASSIGNED)) {
        req.status = STATUS.ARRIVED;
        req.etaMin = 0; req.progress = 1;
        req.updatedAt = Date.now();
        req.events.push({ status: STATUS.ARRIVED, at: new Date().toISOString() });
        syncDispatchForRequest(req, null);
        actions.pushNotification({ id: 'notif_' + req.id + '_arrived', title: 'Mechanic Arrived', body: (req.mechanic || 'Mechanic') + ' has arrived at your location.', icon: 'pin', tone: '#FF8A2A', type: 'dispatch', requestId: req.id, path: '#/track' });
      }
      notify();
      return job;
    },

    completeJob: function () {
      var m = state.mechanic;
      var job = m.acceptedJob;
      if (!job) return null;
      m.jobsToday.unshift({
        id: job.id, customer: job.customer, vehicle: job.vehicle,
        service: job.service, payout: job.payout,
        at: new Date().toISOString(), status: 'completed', rating: null
      });
      m.acceptedJob = null;
      m.activeJobId = null;
      // Reflect in the current week's last bucket.
      var last = m.week[m.week.length - 1];
      if (last) { last.amount += job.payout; last.jobs += 1; }
      // Sync the customer request mirror (unified model).
      var req = select.request(job.id);
      if (req && req.status !== STATUS.COMPLETED && req.status !== STATUS.CANCELLED) {
        req.status = STATUS.COMPLETED;
        req.completedAt = new Date().toISOString();
        req.durationMin = Math.max(12, Math.round((new Date(req.completedAt).getTime() - new Date(req.at).getTime()) / 60000));
        req.updatedAt = Date.now();
        req.events.push({ status: STATUS.COMPLETED, at: req.completedAt });
        if (state.activeRequestId === req.id) state.activeRequestId = null;
        syncDispatchForRequest(req, null);
        actions.pushNotification({ id: 'notif_' + req.id + '_completed', title: 'Service Completed', body: 'Your ' + String(req.service || '').toLowerCase() + ' request is complete.', icon: 'checkCircle', tone: '#22C55E', type: 'complete', requestId: req.id, path: '#/history/' + req.id });
      }
      notify();
      return job;
    },

    /** Simulate a fresh SOS landing in the mechanic's queue. */
    injectIncoming: function () {
      var pool = [
        { customer: 'Hannah D\'Souza',  vehicle: 'Kia Sportage 2022 • KA-05-AB-1209', serviceId: 'battery', service: 'Battery Jump Start',     address: '100 Ft Road, Indiranagar, Bengaluru',  distanceMi: 1.4, payout: 599,  lat: 12.9700, lng: 77.6400, note: 'Dashboard lights dim, will not crank.' },
        { customer: 'Victor Osei',      vehicle: 'Hyundai Verna 2018 • KA-03-MN-7782', serviceId: 'fuel',   service: 'Fuel Delivery',           address: '3rd Block, Koramangala, Bengaluru',      distanceMi: 2.6, payout: 399,  lat: 12.9352, lng: 77.6245, note: 'Ran dry on the way to the airport.' },
        { customer: 'Claire Desai',     vehicle: 'Honda City 2020 • KA-04-MN-1234',    serviceId: 'tire',   service: 'Flat Tire Replacement',   address: 'Jayanagar 4th Block, Bengaluru',          distanceMi: 3.2, payout: 499,  lat: 12.9279, lng: 77.5937, note: 'No spare on board.' }
      ];
      var pick = pool[Math.floor(Math.random() * pool.length)];
      state.mechanic.incoming.unshift(Object.assign({ id: U.uid('job') }, pick));
      notify();
      return state.mechanic.incoming[0];
    },

    /* --- admin portal --- */
    approveMechanic: function (id) {
      var a = state.admin;
      var pm = a.pending.filter(function (p) { return p.id === id; })[0];
      if (!pm) return null;
      a.pending = a.pending.filter(function (p) { return p.id !== id; });
      a.decisions.unshift({ id: U.uid('dec'), name: pm.name, shop: pm.shop, license: pm.license, decision: 'approved', at: new Date().toISOString() });
      a.stats.activeMechanics += 1;

      // Onboard them into the live mechanic roster.
      state.mechanics.push({
        id: U.uid('mech'), name: pm.name, shop: pm.shop,
        specialty: pm.services.map(function (s) { return (select.service(s) || {}).name || s; }).join(' • '),
        services: pm.services.slice(), tags: pm.docs.slice(),
        rating: 5.0, reviews: 0, jobs: 0,
        lat: seed.HOME.lat + (Math.random() - 0.5) * 0.02,
        lng: seed.HOME.lng + (Math.random() - 0.5) * 0.02,
        phone: '+91 90000 00000', online: true, verified: true,
        since: new Date().getFullYear(), responseMin: 15,
        bio: pm.experience + ' of experience. Newly verified on RoadAssist.'
      });
      notify();
      return pm;
    },

    rejectMechanic: function (id, reason) {
      var a = state.admin;
      var pm = a.pending.filter(function (p) { return p.id === id; })[0];
      if (!pm) return null;
      a.pending = a.pending.filter(function (p) { return p.id !== id; });
      a.decisions.unshift({ id: U.uid('dec'), name: pm.name, shop: pm.shop, license: pm.license, decision: 'rejected', reason: reason || 'Documents incomplete', at: new Date().toISOString() });
      notify();
      return pm;
    },

    reassignDispatch: function (dispatchId, mechanicIdOrName) {
      var d = state.admin.dispatches.filter(function (x) { return x.id === dispatchId; })[0];
      if (!d) return null;
      // Accept id (preferred) or legacy display name; resolve to roster entry.
      var mech = select.mechanic(mechanicIdOrName)
        || state.mechanics.filter(function (x) { return x.shop === mechanicIdOrName || x.name === mechanicIdOrName; })[0]
        || null;
      d.mechanicId = mech ? mech.id : (d.mechanicId || null);
      d.mechanic = mech ? mech.shop : mechanicIdOrName;
      d.status = 'assigned';
      try {
        var origin = d.requestId ? (select.request(d.requestId) || {}).origin : null;
        d.etaMin = (mech && origin) ? U.deriveEtaMinutes(mech, origin) : (d.etaMin || 12);
      } catch (e) { d.etaMin = d.etaMin || 12; }
      state.admin.logs.unshift({
        id: U.uid('log'), level: 'info', source: 'dispatch-engine',
        message: 'Manual reassignment: ' + d.ref + ' → ' + d.mechanic + '.',
        at: new Date().toISOString()
      });
      // Sync the linked customer request + mechanic offer when known.
      try {
        var req = d.requestId ? select.request(d.requestId) : null;
        if (req && req.status === STATUS.SEARCHING) {
          req.mechanicId = d.mechanicId;
          req.mechanic = d.mechanic;
          req.status = STATUS.ASSIGNED;
          req.updatedAt = Date.now();
          req.events.push({ status: STATUS.ASSIGNED, at: new Date().toISOString() });
          if (mech) pushMechanicOffer(req, mech);
          actions.pushNotification({ id: 'notif_' + req.id + '_assigned', title: 'Mechanic Assigned', body: d.mechanic + ' was assigned by dispatch.', icon: 'verified', tone: '#7C9CC4', type: 'dispatch', requestId: req.id, path: '#/track' });
        }
      } catch (e) {}
      notify();
      return d;
    },

    closeDispatch: function (dispatchId) {
      var d = state.admin.dispatches.filter(function (x) { return x.id === dispatchId; })[0];
      if (!d) return null;
      d.status = 'completed';
      d.etaMin = 0;
      state.admin.stats.totalRescues += 1;
      try {
        var req = d.requestId ? select.request(d.requestId) : null;
        if (req && req.status !== STATUS.COMPLETED && req.status !== STATUS.CANCELLED) {
          req.status = STATUS.COMPLETED;
          req.completedAt = req.completedAt || new Date().toISOString();
          req.updatedAt = Date.now();
          req.events.push({ status: STATUS.COMPLETED, at: req.completedAt });
          if (state.activeRequestId === req.id) state.activeRequestId = null;
        }
      } catch (e) {}
      notify();
      return d;
    },

    /** Live request-derived log view (MECHIST Logs parity) + stored system logs. */
    derivedLogs: function (filter) {
      var out = [];
      (state.requests || []).forEach(function (r) {
        if (r.releaseReason && (!filter || filter === 'all' || filter === 'released')) {
          out.push({ id: 'log_' + r.id + '_rel', level: 'warning', source: 'matching', message: r.ref + ' released: ' + r.releaseReason, at: r.releasedAt || r.at });
        }
        if (r.cancellationReason && (!filter || filter === 'all' || filter === 'cancelled')) {
          out.push({ id: 'log_' + r.id + '_can', level: 'info', source: 'customer', message: r.ref + ' cancelled: ' + r.cancellationReason, at: r.cancelledAt || r.at });
        }
        if (r.rating && (!filter || filter === 'all' || filter === 'rated')) {
          out.push({ id: 'log_' + r.id + '_rate', level: 'info', source: 'reviews', message: r.ref + ' rated ' + r.rating + '/5', at: r.completedAt || r.at });
        }
      });
      return out;
    },

    /** CSV export rows (MECHIST Reports parity): kind ∈ requests|mechanics|users. */
    exportRows: function (kind) {
      if (kind === 'mechanics') {
        return state.mechanics.map(function (m) {
          return { id: m.id, name: m.name, shop: m.shop, rating: m.rating, reviews: m.reviews, jobs: m.jobs, online: m.online, verified: m.verified, phone: m.phone || '' };
        });
      }
      if (kind === 'users') {
        return Object.keys(state.users || {}).map(function (k) {
          var u = state.users[k];
          return { role: k, id: u.id, name: u.name, email: u.email, phone: u.phone || '' };
        });
      }
      return (state.requests || []).map(function (r) {
        return { ref: r.ref, id: r.id, service: r.service, status: r.status, customer: r.customer, mechanic: r.mechanic, amount: r.amount, etaMin: r.etaMin, address: r.address, at: r.at };
      });
    }
  };

  RA.store = {
    STATUS: STATUS,
    STATUS_META: STATUS_META,
    CANCELLABLE: CANCELLABLE,
    RELEASABLE: RELEASABLE,
    boot: boot,
    get: get,
    subscribe: subscribe,
    notify: notify,
    resetDemo: resetDemo,
    applyRemoteState: applyRemoteState,
    updateUserLocationFromGeolocation: updateUserLocationFromGeolocation,
    select: select,
    actions: actions
  };
})(window);
