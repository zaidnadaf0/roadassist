/* ==========================================================================
   RoadAssist Web — FIREBASE ADAPTER

   A real backend: Firebase Authentication + Cloud Firestore.

   It implements exactly the same interface as the demo adapter in store.js —
   initial / load / save / clear / signIn / signUp / signOut — so not a single
   view had to change to support it. Two extra optional hooks (afterAuth and
   the live-sync subscription) are picked up by the store only if present, so
   demo mode behaves identically to before.

   DATA MODEL
     appState/{uid}   one document per signed-in user, holding that user's
                      whole state tree plus role/updatedAt metadata. This is
                      what the app reads and writes.
     requests/{id}    a mirror of the user's service requests as individual
                      documents, so requests are queryable by admins and
                      mechanics (and so the shipped indexes and rules describe
                      data that genuinely exists).

   HONEST LIMITATION — read this before you assume more than it does:
   state is stored per user account. Signing in as a mechanic on a *different*
   account will not surface another account's live request in the incoming
   queue, because no view reads the shared `requests` collection yet — the
   mirror populates it, and the rules and indexes support it, but wiring the
   mechanic queue to a cross-account live feed is a further step. Within one
   account, everything is real: real auth, real cloud persistence, real
   cross-device and cross-tab sync.

   FAIL-SOFT BY DESIGN
   Every failure path here logs a specific reason and falls back to demo mode
   instead of leaving a blank page. Losing the network should never cost the
   user their screen.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};
  var U = RA.util;

  /* Firestore rejects `undefined`, so a JSON round-trip is both the sanitiser
     and a cheap deep clone. It also drops functions and normalises Dates. */
  function sanitize(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function approxBytes(obj) {
    try { return JSON.stringify(obj).length; } catch (e) { return 0; }
  }

  /* Turn Firebase's error codes into something a human can act on. */
  function humanise(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/invalid-email':          'That email address is not valid.',
      'auth/user-disabled':          'That account has been disabled.',
      'auth/user-not-found':         'No account exists for that email. Create one first.',
      'auth/wrong-password':         'That password is not correct.',
      'auth/invalid-credential':     'That email and password combination is not correct.',
      'auth/email-already-in-use':   'An account already exists for that email. Sign in instead.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
      'auth/operation-not-allowed':  'That sign-in method is not enabled in the Firebase console.',
      'auth/unauthorized-domain':    'This domain is not in the Firebase authorised domains list.',
      'permission-denied':           'Firestore rules rejected that. Did you deploy firestore.rules?',
      'unavailable':                 'Firestore is unreachable right now.'
    };
    return new Error(map[code] || (err && err.message) || 'Something went wrong.');
  }

  function makeAdapter() {
    var cfg  = RA.config;
    var app  = null;
    var auth = null;
    var db   = null;

    var ready       = null;   // resolves once the first auth state is known
    var currentUser = null;
    var currentRole = null;

    /* Throttled writes -------------------------------------------------- */
    var pendingState = null;
    var writeTimer   = null;
    var lastWriteAt  = 0;
    var lastMirror   = '';

    /* Live sync --------------------------------------------------------- */
    var unsubscribeDoc = null;
    var lastWrittenAt  = 0;   // used to ignore snapshots caused by our own write
var unsubscribeRequests = null;   // for real-time request listening
var requestListenerSetUp = false; // track if request listener is active

    function stateDoc() {
      if (!db || !currentUser) return null;
      return db.collection(cfg.stateCollection).doc(currentUser.uid);
    }

    /* ------------------------------------------------------------------
       Start — initialise the SDK and settle the initial auth state.
       Rejects with a precise reason; the caller falls back to demo.
       ------------------------------------------------------------------ */
    function start() {
      if (ready) return ready;

      ready = new Promise(function (resolve, reject) {
        if (!window.firebase || !window.firebase.initializeApp) {
          return reject(new Error(
            'The Firebase SDK did not load. Check the <script> tags in index.html ' +
            'and that you are online.'));
        }
        if (!cfg.isFirebaseConfigured()) {
          return reject(new Error(
            'RA.config.firebase still contains PASTE_… placeholders. Fill in your ' +
            'Firebase web config in assets/js/config.js.'));
        }
        if (window.location.protocol === 'file:') {
          return reject(new Error(
            'Firebase Auth cannot run on a file:// page. Serve this folder over ' +
            'http:// — see README.md, "Go live with Firebase", step 5.'));
        }

        try {
          app  = window.firebase.apps && window.firebase.apps.length
            ? window.firebase.app()
            : window.firebase.initializeApp(cfg.firebase);
          auth = window.firebase.auth();
          db   = window.firebase.firestore();
        } catch (e) {
          return reject(humanise(e));
        }

        if (cfg.offlinePersistence && db.enablePersistence) {
          /* Fails harmlessly when several tabs are open, or on old browsers. */
          db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
            console.info('[firebase] offline cache unavailable:', (e && e.code) || e);
          });
        }

        var settled = false;
        auth.onAuthStateChanged(function (user) {
          currentUser = user || null;
          if (!user) { teardownLiveSync(); currentRole = null; }
          if (!settled) { settled = true; resolve(true); }
        }, function (e) {
          if (!settled) { settled = true; reject(humanise(e)); }
        });

        /* A dead network can leave onAuthStateChanged silent forever. */
        setTimeout(function () {
          if (!settled) {
            settled = true;
            reject(new Error('Firebase did not respond within 8 seconds.'));
          }
        }, 8000);
      });

      return ready;
    }

    /* ------------------------------------------------------------------
       Live sync — mirror remote changes into this tab.
       ------------------------------------------------------------------ */
    function teardownLiveSync() {
      if (unsubscribeDoc) { unsubscribeDoc(); unsubscribeDoc = null; }
    }

    function setupLiveSync() {
      if (!cfg.liveSync) return;
      teardownLiveSync();
      var doc = stateDoc();
      if (!doc) return;

      unsubscribeDoc = doc.onSnapshot(function (snap) {
        if (!snap.exists) return;
        /* Skip the echo of our own write, and anything with local pending
           writes still in flight. */
        if (snap.metadata && snap.metadata.hasPendingWrites) return;

        var data = snap.data() || {};
        if (!data.state) return;
        if (data.writtenAt && data.writtenAt <= lastWrittenAt) return;

        if (RA.store && typeof RA.store.applyRemoteState === 'function') {
          RA.store.applyRemoteState(data.state);
          updateRequestListener();
        }
      }, function (e) {
        console.warn('[firebase] live sync stopped:', (e && e.code) || e);
      });
    }

    /* ------------------------------------------------------------------
       Request listener — real-time updates for mechanic incoming requests
       ------------------------------------------------------------------ */
    function teardownRequestListener() {
      if (unsubscribeRequests) {
        unsubscribeRequests();
        unsubscribeRequests = null;
      }
    }

    function updateRequestListener() {
      var state = RA.store.get();
      if (!state) {
        teardownRequestListener();
        requestListenerSetUp = false;
        return;
      }

      var mechanic = state.mechanic;
      if (!mechanic) {
        teardownRequestListener();
        requestListenerSetUp = false;
        return;
      }

      // Should we have a request listener?
      var shouldListen = currentUser &&
                        currentRole === 'mechanic' &&
                        mechanic.online;

      if (shouldListen && !requestListenerSetUp) {
        setupRequestListener();
        requestListenerSetUp = true;
      } else if (!shouldListen && requestListenerSetUp) {
        teardownRequestListener();
        requestListenerSetUp = false;
      }
    }

    function setupRequestListener() {
      // Don't set up listener if no current user or not a mechanic
      if (!currentUser || currentRole !== 'mechanic') {
        teardownRequestListener();
        return;
      }

      // Get the mechanic object from state
      var state = RA.store.get();
      if (!state) return;

      var mechanic = state.mechanic;
      if (!mechanic) return;

      // Don't listen if mechanic is offline
      if (!mechanic.online) {
        teardownRequestListener();
        return;
      }

      // Set up real-time listener to requests collection
      teardownRequestListener(); // clean up any existing listener

      var requestsQuery = db.collection('requests')
        .where('status', '==', 'searching') // only show new requests
        .where('ownerId', '!=', currentUser.uid); // don't show own requests

      unsubscribeRequests = requestsQuery.onSnapshot(function (snapshot) {
        var filteredRequests = [];

        snapshot.docs.forEach(function (doc) {
          var request = doc.data();
          if (!request) return;

          // Check if request has origin for distance calculation
          if (!request.origin || !request.origin.lat || !request.origin.lng) return;

          // Calculate distance
          var distance = U.distanceMiles(
            { lat: mechanic.lat, lng: mechanic.lng },
            { lat: request.origin.lat, lng: request.origin.lng }
          );

          // Filter by distance (within 50 km)
          if (distance > 50) return;

          // Filter by service capability
          if (!mechanic.services || mechanic.services.indexOf(request.serviceId) === -1) return;

          // Format request as incoming request object
          var formattedRequest = {
            id: request.id,
            customer: request.customerName || 'Unknown Customer',
            vehicle: request.customerVehicle || 'Unknown Vehicle',
            serviceId: request.serviceId,
            service: request.service,
            address: request.address || '',
            distanceMi: distance,
            payout: request.amount || 0,
            lat: request.origin.lat,
            lng: request.origin.lng,
            note: request.note || ''
          };

          filteredRequests.push(formattedRequest);
        });

        // Sort by distance (closest first)
        filteredRequests.sort(function (a, b) {
          return a.distanceMi - b.distanceMi;
        });

        // Update state — use a targeted action so we don't clobber
        // activeRequestId, acceptedJob, requests, etc. with a partial copy.
        if (RA.store && RA.store.actions && typeof RA.store.actions.setMechanicIncoming === 'function') {
          RA.store.actions.setMechanicIncoming(filteredRequests);
        }
      }, function (e) {
        console.warn('[firebase] request listener stopped:', (e && e.code) || e);
        teardownRequestListener();
      });
    }

    /* ------------------------------------------------------------------
       Requests mirror — individual documents so the data is queryable.
       Entirely fail-soft: a rejected mirror must never break the app.
       ------------------------------------------------------------------ */
    function mirrorRequests(state) {
      if (!db || !currentUser || !state || !state.requests) return;

      /* Only write when something actually changed. */
      var signature = state.requests.map(function (r) {
        return r.id + ':' + r.status + ':' + (r.rating || '') + ':' + (r.amount || 0);
      }).join('|');
      if (signature === lastMirror) return;
      lastMirror = signature;

      try {
        var batch = db.batch();
        state.requests.slice(0, 400).forEach(function (r) {
          batch.set(db.collection('requests').doc(r.id), sanitize({
            id: r.id,
            ref: r.ref,
            ownerId: currentUser.uid,
            serviceId: r.serviceId,
            service: r.service,
            mechanicId: r.mechanicId || null,
            mechanic: r.mechanic || null,
            // Customer info for display in mechanic portal
            customerName: (state.users.customer && state.users.customer.name) || '',
            customerVehicle: (function() {
              if (!state.users.customer || !state.users.customer.vehicleId) return '';
              var vehicle = state.vehicles.find(function(v) {
                return v.id === state.users.customer.vehicleId;
              });
              return vehicle ? vehicle.name || '' : '';
            })(),
            // Origin for distance calculation and map display
            origin: r.origin ? { lat: r.origin.lat, lng: r.origin.lng } : null,
            vehicleId: r.vehicleId || null,
            address: r.address || '',
            amount: r.amount || 0,
            status: r.status,
            rating: r.rating || null,
            etaMin: r.etaMin || 0,
            durationMin: r.durationMin || 0,
            at: r.at,
            updatedAt: new Date().toISOString()
          }), { merge: true });
        });
        batch.commit().catch(function (e) {
          console.info('[firebase] request mirror skipped:', (e && e.code) || e);
        });
      } catch (e) {
        console.info('[firebase] request mirror skipped:', e);
      }
    }

    /* ------------------------------------------------------------------
       Throttled write of the state document.
       ------------------------------------------------------------------ */
    function flush() {
      writeTimer = null;
      var doc = stateDoc();
      if (!doc || !pendingState) return Promise.resolve(false);

      var payload = pendingState;
      pendingState = null;
      lastWriteAt = Date.now();
      lastWrittenAt = lastWriteAt;

      var size = approxBytes(payload);
      if (size > 900000) {
        console.warn('[firebase] state document is ' + Math.round(size / 1024) +
          'KB, close to Firestore\'s 1MB limit. Consider trimming history.');
      }

      return doc.set({
        state: payload,
        role: (payload.session && payload.session.role) || null,
        writtenAt: lastWriteAt,
        updatedAt: new Date().toISOString(),
        schema: payload.schema || 1
      }).then(function () {
        mirrorRequests(payload);
        return true;
      }).catch(function (e) {
        console.warn('[firebase] save failed:', (e && e.code) || e);
        return false;
      });
    }

    /* ------------------------------------------------------------------
       Auth helpers
       ------------------------------------------------------------------ */
    function looksLikeEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
    }

    /* Read the user's saved state, remembering the role stored alongside it. */
    function fetchState() {
      var doc = stateDoc();
      if (!doc) return Promise.resolve(null);
      return doc.get().then(function (snap) {
        if (!snap.exists) return null;
        var data = snap.data() || {};
        if (data.role) currentRole = data.role;
        lastWrittenAt = data.writtenAt || 0;
        return data.state || null;
      }).catch(function (e) {
        console.warn('[firebase] load failed:', (e && e.code) || e);
        return null;
      });
    }

    /* ==================================================================
       THE ADAPTER — same shape as demoAdapter in store.js
       ================================================================== */
    return {
      name: 'firebase',

      /* Seed data is code, not user data, so it comes from the demo adapter.
         A brand-new Firebase account starts from the same seeded world. */
      initial: function () {
        return RA.demoAdapter.initial();
      },

      load: function () {
        return start().then(function () {
          if (!currentUser) return null;      // signed out → seeded state
          setupLiveSync();
          return fetchState();
        });
      },

      save: function (state) {
        if (!currentUser) return Promise.resolve(false);
        pendingState = sanitize(state);
        if (writeTimer) return Promise.resolve(true);
        var wait = Math.max(0, cfg.writeThrottleMs - (Date.now() - lastWriteAt));
        writeTimer = setTimeout(flush, wait);
        return Promise.resolve(true);
      },

      /** Write immediately, ignoring the throttle (used on sign-out/unload). */
      flush: function () {
        if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
        return flush();
      },

      clear: function () {
        var doc = stateDoc();
        pendingState = null;
        lastMirror = '';
        if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
        if (!doc || !db || !currentUser) {
          if (!doc) return Promise.resolve(true);
          return doc.delete().then(function () { return true; })
            .catch(function () { return false; });
        }
        /* Delete the mirrored request docs too, otherwise a cleared account
           leaves ghost 'searching' jobs sitting in mechanics' live queues. */
        var purgeRequests = db.collection('requests')
          .where('ownerId', '==', currentUser.uid).get()
          .then(function (snap) {
            if (snap.empty) return;
            var batch = db.batch();
            snap.forEach(function (d) { batch.delete(d.ref); });
            return batch.commit();
          })
          .catch(function (e) {
            console.warn('[adapter] could not clear mirrored requests', e);
          });
        return purgeRequests.then(function () {
          return doc.delete().then(function () { return true; })
            .catch(function () { return false; });
        });
      },

      signIn: function (identifier, password, role) {
        return start().then(function () {
          if (!looksLikeEmail(identifier)) {
            throw new Error(
              'Firebase mode signs in with an email address. Phone sign-in needs ' +
              'SMS verification, which is not enabled on this project.');
          }
          return auth.signInWithEmailAndPassword(String(identifier).trim(), password);
        }).then(function (cred) {
          currentUser = cred.user;
          // Get the ID token result to access custom claims
          return cred.user.getIdTokenResult();
        }).then(function (idTokenResult) {
          // Extract role from claims, or use the passed role as fallback, or default to customer
          currentRole = idTokenResult.claims.role || role || 'customer';
          setupLiveSync();
          return { role: currentRole };
        }).catch(function (e) { throw humanise(e); });
      },

      signUp: function (payload) {
        return start().then(function () {
          return auth.createUserWithEmailAndPassword(
            String(payload.email).trim(), payload.password);
        }).then(function (cred) {
          currentUser = cred.user;
          if (payload.name && cred.user.updateProfile) {
            cred.user.updateProfile({ displayName: payload.name }).catch(function () {});
          }
          // Get the ID token result to access custom claims
          return cred.user.getIdTokenResult();
        }).then(function (idTokenResult) {
          // Extract role from claims, or default to customer
          currentRole = idTokenResult.claims.role || 'customer';
          setupLiveSync();
          return { role: currentRole, name: payload.name, email: payload.email };
        }).catch(function (e) { throw humanise(e); });
      },

      /** Backs the landing page's "Continue as guest" button. */
      signInAnonymously: function (role) {
        return start().then(function () {
          return auth.signInAnonymously();
        }).then(function (cred) {
          currentUser = cred.user;
          currentRole = role || 'customer';
          setupLiveSync();
          return { role: currentRole };
        }).catch(function (e) { throw humanise(e); });
      },

      signOut: function () {
        var self = this;
        return self.flush().catch(function () { return false; }).then(function () {
          teardownLiveSync();
          teardownRequestListener();
          lastMirror = '';
          return auth ? auth.signOut() : true;
        }).then(function () {
          currentUser = null;
          currentRole = null;
          return true;
        }).catch(function (e) { throw humanise(e); });
      },

      /* ----------------------------------------------------------------
         Optional hook. The store calls this after a successful sign-in and
         adopts whatever state comes back, so a returning user lands on
         their own data rather than the seed. Demo mode has no such hook.
         ---------------------------------------------------------------- */
      afterAuth: function () {
        if (!currentUser) return Promise.resolve(null);
        return fetchState().then(function (state) {
          updateRequestListener();
          return state;
        });
      },

      /** Exposed for the diagnostics line in the console. */
      status: function () {
        return {
          backend: 'firebase',
          projectId: cfg.firebase.projectId,
          signedIn: !!currentUser,
          uid: currentUser ? currentUser.uid : null,
          anonymous: currentUser ? !!currentUser.isAnonymous : false,
          role: currentRole,
          liveSync: !!unsubscribeDoc
        };
      },

      start: start
    };
  }

  RA.createFirebaseAdapter = makeAdapter;
})(window);
