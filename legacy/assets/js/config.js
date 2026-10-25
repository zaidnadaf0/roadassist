/* ==========================================================================
   RoadAssist Web — BACKEND CONFIGURATION

   ★ THIS IS THE ONLY FILE YOU EDIT TO GO LIVE. ★

   Out of the box the site runs in DEMO mode: all data lives in this browser's
   localStorage, nothing is sent anywhere, and you can open index.html by
   double-clicking it. That is deliberate — Firebase Auth refuses to run on a
   file:// page, so demo has to be the default for the "just open it" promise
   to hold.

   To switch to a real Firebase backend:

     1. Set  BACKEND = 'firebase'  below.
     2. Paste your own Firebase web config into FIREBASE below.
     3. Serve the folder over http:// (see README.md — one command).

   If anything is missing or the SDK cannot load, the app logs a clear reason
   to the console and quietly falls back to demo mode rather than showing a
   broken page. See assets/js/adapter-firebase.js.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};

  /* ======================================================================
     1. WHICH BACKEND?
     'demo'     — localStorage only. No account needed. Works from file://.
     'firebase' — real Firebase Auth + Cloud Firestore. Needs http:// + keys.
     ====================================================================== */

  var BACKEND = 'demo';

  /* ======================================================================
     2. YOUR FIREBASE WEB CONFIG

     Firebase console → Project settings → General → "Your apps" → Web app →
     "SDK setup and configuration" → Config. Copy the object and paste the
     values here, replacing every PASTE_… placeholder.

     These keys are NOT secrets — Firebase web config is meant to ship in the
     browser. What actually protects your data is firestore.rules, which is
     included in this folder and which you must deploy.
     ====================================================================== */

  var FIREBASE = {
    apiKey:            'PASTE_YOUR_API_KEY',
    authDomain:        'PASTE_YOUR_PROJECT.firebaseapp.com',
    projectId:         'PASTE_YOUR_PROJECT_ID',
    storageBucket:     'PASTE_YOUR_PROJECT.appspot.com',
    messagingSenderId: 'PASTE_YOUR_SENDER_ID',
    appId:             'PASTE_YOUR_APP_ID'
  };

  /* ======================================================================
     3. OPTIONS (sensible defaults — you rarely need to touch these)
     ====================================================================== */

  var OPTIONS = {
    /* Firestore collection holding one state document per signed-in user.
       Must match the collection name in firestore.rules. */
    stateCollection: 'appState',

    /* Minimum gap between Firestore writes, in ms. Live tracking ticks the
       store roughly once a second; without this the map animation alone would
       burn through thousands of writes an hour. Writes are coalesced, and the
       final state is always flushed. */
    writeThrottleMs: 2500,

    /* Mirror remote changes back into open tabs in real time (Firestore
       onSnapshot). Lets you watch a request update in a second browser. */
    liveSync: true,

    /* Keep working through short network drops using Firestore's local cache. */
    offlinePersistence: true,

    /* MECHIST-parity dispatch tuning (used by store.js; safe to override). */
    offerWindowMs: 120000,
    dispatchRadiusKm: 25,

    /* false = demo-friendly auto-switch (current behaviour).
       true  = MECHIST-style hard block: wrong-role routes bounce home. */
    strictRoles: false
  };

  /* ======================================================================
     Assembly — allows ?backend=firebase / ?backend=demo for a quick A/B
     without editing this file. Handy when testing a deployment.
     ====================================================================== */

  var override = '';
  try {
    override = (String(window.location.search).match(/[?&]backend=(demo|firebase)/) || [])[1] || '';
  } catch (e) { /* exotic sandbox with no location — ignore */ }

  RA.config = {
    backend: override || BACKEND,
    backendSource: override ? 'url' : 'config.js',
    firebase: FIREBASE,
    stateCollection: OPTIONS.stateCollection,
    writeThrottleMs: OPTIONS.writeThrottleMs,
    liveSync: OPTIONS.liveSync,
    offlinePersistence: OPTIONS.offlinePersistence,
    offerWindowMs: OPTIONS.offerWindowMs,
    dispatchRadiusKm: OPTIONS.dispatchRadiusKm,
    strictRoles: OPTIONS.strictRoles,

    /* True only when FIREBASE has been filled in with real values. */
    isFirebaseConfigured: function () {
      var f = RA.config.firebase || {};
      var need = ['apiKey', 'authDomain', 'projectId', 'appId'];
      for (var i = 0; i < need.length; i++) {
        var v = f[need[i]];
        if (!v || typeof v !== 'string' || v.indexOf('PASTE_') === 0) return false;
      }
      return true;
    }
  };
})(window);
