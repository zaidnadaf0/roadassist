/* ==========================================================================
   RoadAssist Web — Router
   Hash-based (#/app, #/mechanic/mech_001) on purpose:
     • works when you open index.html straight off the disk (file://)
     • works on any static host with no server rewrite rules
     • back/forward and deep links behave like a normal website
   Swap to the History API later by changing path()/go() only.

   A view is a function(params) that returns:
     { title, sub, back, actions, chrome, html, mount(root), raw }
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;

  /* ======================================================================
     Route table
     `view` is resolved lazily so the views-*.js files can load in any order.
     ====================================================================== */
  var ROUTES = [
    /* --- public --- */
    { path: '/',            v: 'landing',   guard: 'public' },
    { path: '/features',    v: 'features',  guard: 'public' },
    { path: '/pricing',     v: 'pricing',   guard: 'public' },
    { path: '/about',       v: 'about',     guard: 'public' },
    { path: '/contact',     v: 'contact',   guard: 'public' },

    /* --- auth --- */
    { path: '/welcome',     v: 'onboarding', guard: 'public' },
    { path: '/login',       v: 'login',      guard: 'public' },
    { path: '/signup',      v: 'signup',     guard: 'public' },
    { path: '/forgot',      v: 'forgot',     guard: 'public' },
    { path: '/verify',      v: 'verify',     guard: 'public' },

    /* --- customer portal --- */
    { path: '/app',              v: 'dashboard',     role: 'customer' },
    { path: '/services',         v: 'services',      role: 'customer' },
    { path: '/request/:id',      v: 'requestForm',   role: 'customer' },
    { path: '/mechanics',        v: 'mechanics',     role: 'customer' },
    { path: '/mechanic/:id',     v: 'mechanicDetail', role: 'customer' },
    { path: '/map',              v: 'liveMap',       role: 'customer' },
    { path: '/track',            v: 'tracking',      role: 'customer' },
    { path: '/history',          v: 'history',       role: 'customer' },
    { path: '/history/:id',      v: 'historyDetail', role: 'customer' },
    { path: '/vehicles',         v: 'vehicles',      role: 'customer' },
    { path: '/emergency',        v: 'emergency',     role: 'customer' },
    { path: '/notifications',    v: 'notifications' },
    { path: '/profile',          v: 'profile',       role: 'customer' },
    { path: '/settings',         v: 'settings' },

    /* --- mechanic portal --- */
    { path: '/m',            v: 'mDashboard', role: 'mechanic' },
    { path: '/m/requests',   v: 'mRequests',  role: 'mechanic' },
    { path: '/m/job',        v: 'mJob',       role: 'mechanic' },
    { path: '/m/earnings',   v: 'mEarnings',  role: 'mechanic' },
    { path: '/m/profile',    v: 'mProfile',   role: 'mechanic' },

    /* --- admin portal --- */
    { path: '/admin',            v: 'aDashboard', role: 'admin' },
    { path: '/admin/dispatch',   v: 'aDispatch',  role: 'admin' },
    { path: '/admin/approvals',  v: 'aApprovals', role: 'admin' },
    { path: '/admin/mechanics',  v: 'aMechanics', role: 'admin' },
    { path: '/admin/analytics',  v: 'aAnalytics', role: 'admin' },
    { path: '/admin/reports',    v: 'aReports',   role: 'admin' },
    { path: '/admin/logs',       v: 'aLogs',      role: 'admin' }
  ];

  /* ======================================================================
     Path helpers
     ====================================================================== */

  function path() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return '/';
    var q = h.indexOf('?');
    return (q > -1 ? h.slice(0, q) : h) || '/';
  }

  function query() {
    var h = window.location.hash;
    var q = h.indexOf('?');
    if (q < 0) return {};
    var out = {};
    h.slice(q + 1).split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    return out;
  }

  function go(to) {
    if (!to) return;
    if (/^https?:/i.test(to)) { window.open(to, '_blank', 'noopener'); return; }
    var next = '#' + to;
    if (window.location.hash === next) { render(); return; }
    window.location.hash = next;
  }

  function replace(to) {
    var url = window.location.href.split('#')[0] + '#' + to;
    try { window.history.replaceState(null, '', url); render(); }
    catch (e) { window.location.replace(url); }
  }

  function back(fallback) {
    if (window.history.length > 1) window.history.back();
    else go(fallback || '/app');
  }

  /* ======================================================================
     Matching
     ====================================================================== */

  function match(p) {
    var segs = p.replace(/^\/|\/$/g, '').split('/');
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var rsegs = r.path.replace(/^\/|\/$/g, '').split('/');
      if (rsegs.length !== segs.length) continue;
      var params = {}, ok = true;
      for (var j = 0; j < rsegs.length; j++) {
        if (rsegs[j].charAt(0) === ':') params[rsegs[j].slice(1)] = decodeURIComponent(segs[j]);
        else if (rsegs[j] !== segs[j]) { ok = false; break; }
      }
      if (ok) return { route: r, params: params };
    }
    return null;
  }

  /* ======================================================================
     Render
     ====================================================================== */

  var app = null;
  var current = { path: null, cleanup: null };
  var scrollMemory = {};

  function notFound(p) {
    return {
      title: 'Page not found',
      chrome: RA.store.select.signedIn(),
      html: RA.ui.empty({
        icon: 'search',
        title: 'That page doesn’t exist',
        text: 'We couldn’t find ' + p + '. It may have moved, or the link may be incomplete.',
        action: RA.ui.btn({ label: 'Back to home', nav: RA.store.select.signedIn() ? '/app' : '/' })
      })
    };
  }

  function render() {
    if (!app) app = document.getElementById('app');
    var p = path();

    /* Tear down whatever the previous view set up (maps, timers). */
    if (current.cleanup) { try { current.cleanup(); } catch (e) {} current.cleanup = null; }
    RA.map.destroyAll();
    RA.ui.closeModal();

    var m = match(p);
    var signedIn = RA.store.select.signedIn();
    var role = RA.store.select.role();

    /* --- guards --- */
    if (m) {
      var r = m.route;
      if (r.role && !signedIn) {
        // Remember where they wanted to go, then send them through login.
        replace('/login?next=' + encodeURIComponent(p));
        return;
      }
      if (r.role && role !== r.role) {
        var strict = false;
        try { strict = !!(RA.config && RA.config.strictRoles); } catch (e) {}
        if (strict) {
          // MECHIST-style hard block: bounce to your own portal, never auto-switch.
          var home = role === 'mechanic' ? '/m' : role === 'admin' ? '/admin' : '/app';
          try { if (RA.ui && RA.ui.toast) RA.ui.toast('That portal belongs to another role', 'warning'); } catch (e) {}
          replace(home);
          return;
        }
        // Demo default: switch persona so the portal switcher keeps working.
        RA.store.actions.switchRole(r.role);
        role = r.role;
      }
      if (r.guard === 'public' && signedIn && (p === '/login' || p === '/signup' || p === '/welcome')) {
        replace(RA.chrome.NAV[role].home);
        return;
      }
    }

    var viewFn = m ? RA.views[m.route.v] : null;
    var out;
    if (!viewFn) {
      out = notFound(p);
    } else {
      try {
        out = viewFn(m.params, query()) || notFound(p);
      } catch (e) {
        console.error('[router] view "' + m.route.v + '" threw', e);
        out = {
          title: 'Something went wrong',
          chrome: signedIn,
          html: RA.ui.empty({
            icon: 'warning',
            title: 'This page hit an error',
            text: String(e && e.message ? e.message : e),
            action: RA.ui.btn({ label: 'Reload', act: 'hard-reload' })
          })
        };
      }
    }

    /* --- paint --- */
    var useChrome = out.chrome !== false && signedIn;
    app.innerHTML = useChrome
      ? RA.chrome.shell(out.html, {
          title: out.title, sub: out.sub, back: out.back,
          actions: out.actions, route: p
        })
      : out.html;

    document.title = (out.docTitle || out.title)
      ? (out.docTitle || out.title) + ' · RoadAssist'
      : 'RoadAssist — 24/7 Smart Roadside Assistance';

    /* Restore scroll on back-navigation, otherwise start at the top. */
    var y = scrollMemory[p];
    window.scrollTo(0, y || 0);

    RA.ui.hydrate(app);
    if (typeof out.mount === 'function') {
      try { current.cleanup = out.mount(app) || null; }
      catch (e) { console.error('[router] mount failed for ' + p, e); }
    }

    current.path = p;
  }

  /** Re-run the current route (used after store mutations change the page). */
  var started = false;
  function refresh() { if (started) render(); }

  /* ======================================================================
     Wiring
     ====================================================================== */

  function start() {
    app = document.getElementById('app');
    started = true;

    window.addEventListener('hashchange', function () {
      scrollMemory[current.path] = window.scrollY;
      render();
    });

    /* Global escape hatch used by the error view. */
    U.on(document.body, 'click', '[data-act="hard-reload"]', function () {
      window.location.reload();
    });

    if (!window.location.hash) replace('/');
    else render();
  }

  RA.router = {
    ROUTES: ROUTES,
    path: path, query: query, go: go, replace: replace, back: back,
    match: match, render: render, refresh: refresh, start: start
  };
})(window, document);
