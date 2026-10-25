/* ==========================================================================
   RoadAssist Web — BACKEND SELECTOR

   Decides which data adapter the store will use, before the store boots.

   The rule is simple and never negotiable: if the requested backend cannot be
   brought up for ANY reason, we log exactly why and continue in demo mode. A
   misconfigured Firebase project must degrade to a working demo site, never to
   a blank page. That is the whole reason RA.data is an adapter.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};

  var resolved = null;

  /* What actually ended up running — read by the settings screen and the
     console diagnostics line. */
  RA.backendInfo = {
    requested: (RA.config && RA.config.backend) || 'demo',
    active: 'demo',
    fellBack: false,
    reason: ''
  };

  function useDemo(reason) {
    RA.data = RA.demoAdapter;
    RA.backendInfo.active = 'demo';
    if (reason) {
      RA.backendInfo.fellBack = true;
      RA.backendInfo.reason = reason;
      console.warn('[RoadAssist] Firebase was requested but is not available, so the ' +
        'site is running on demo data.\n  Reason: ' + reason);
    } else {
      console.info('[RoadAssist] Demo backend active — data is stored in this browser only. ' +
        'See assets/js/config.js to connect Firebase.');
    }
    return RA.data;
  }

  /**
   * resolve() → Promise<adapter>
   * Always resolves. Never rejects: failure means demo mode.
   */
  function resolve() {
    if (resolved) return resolved;

    var cfg = RA.config || { backend: 'demo' };

    if (cfg.backend !== 'firebase') {
      resolved = Promise.resolve(useDemo(null));
      return resolved;
    }

    if (typeof RA.createFirebaseAdapter !== 'function') {
      resolved = Promise.resolve(useDemo('assets/js/adapter-firebase.js did not load.'));
      return resolved;
    }

    var adapter;
    try {
      adapter = RA.createFirebaseAdapter();
    } catch (e) {
      resolved = Promise.resolve(useDemo('Could not construct the adapter: ' + e.message));
      return resolved;
    }

    resolved = adapter.start().then(function () {
      RA.data = adapter;
      RA.backendInfo.active = 'firebase';
      console.info('[RoadAssist] Firebase backend active — project "' +
        cfg.firebase.projectId + '". Requested via ' + cfg.backendSource + '.');
      return adapter;
    }).catch(function (err) {
      return useDemo((err && err.message) || String(err));
    });

    return resolved;
  }

  RA.backend = {
    resolve: resolve,
    info: function () { return RA.backendInfo; },

    /** Human-readable one-liner, used on the settings screen. */
    label: function () {
      if (RA.backendInfo.active === 'firebase') {
        return 'Firebase (' + ((RA.config.firebase && RA.config.firebase.projectId) || 'connected') + ')';
      }
      return RA.backendInfo.fellBack ? 'Demo data (Firebase unavailable)' : 'Demo data (this browser only)';
    }
  };
})(window);
