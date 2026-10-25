/* ==========================================================================
   RoadAssist Web — boot

   Load order matters: this file runs last, after every RA.* namespace exists.
   Its whole job is:

     1. hydrate state from storage (or the seed on first run)
     2. wire the chrome behaviour that survives every repaint
     3. start the router

   Deliberately NOT here: a store subscription that re-renders the route.
   Several views own live things — the tracking map, countdown rings, the
   request simulator — and those tick the store roughly once a second. A
   global re-render on every notify would tear the map out of the DOM mid
   animation. Views that need a repaint call RA.router.refresh() themselves;
   everything this file listens for is patched in place instead.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA;

  /* ======================================================================
     Fatal error screen — used when boot itself fails
     ====================================================================== */

  function fatal(message, detail) {
    var app = document.getElementById('app');
    if (!app) return;
    app.innerHTML =
      '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;' +
      'font:400 15px/1.6 \'Inter Tight\',Inter,system-ui,sans-serif;color:#E4E4E7;background:#09090B">' +
        '<div style="max-width:520px;text-align:center">' +
          '<div style="font-size:40px;margin-bottom:12px">&#9888;</div>' +
          '<h1 style="font:800 22px/1.25 \'Inter Tight\',Inter,system-ui,sans-serif;margin:0 0 8px">' + message + '</h1>' +
          '<p style="color:#A1A1AA;margin:0 0 18px">' + (detail || '') + '</p>' +
          '<button type="button" onclick="window.location.reload()" ' +
            'style="background:#FF6B00;color:#1A0E00;border:0;border-radius:10px;' +
            'padding:11px 20px;font:700 14px \'Inter Tight\',Inter,system-ui,sans-serif;cursor:pointer">' +
            'Reload</button>' +
        '</div>' +
      '</div>';
  }

  /** Everything this file needs must already be on the page. */
  function missingDependency() {
    var need = ['config', 'backend', 'icon', 'util', 'store', 'ui', 'map', 'chrome', 'views', 'router'];
    for (var i = 0; i < need.length; i++) {
      if (!RA || !RA[need[i]]) return need[i];
    }
    return null;
  }

  /* ======================================================================
     Badge sync

     Rail and tab-bar badges are resolved at render time, so a background
     change (a new incoming job, a notification arriving, an approval being
     cleared) would otherwise sit stale until the next navigation. Rather
     than re-render the shell, walk RA.chrome.NAV and patch the badge nodes.
     That keeps #main — and anything live inside it — untouched.
     ====================================================================== */

  function badgeSignature(role) {
    var nav = RA.chrome.NAV[role];
    if (!nav) return '';
    var parts = [];
    nav.groups.forEach(function (g) {
      g.items.forEach(function (it) {
        if (it.badge) parts.push(it.route + ':' + RA.chrome.badgeCount(it.badge));
      });
    });
    nav.tabs.forEach(function (t) {
      if (t.badge) parts.push('t' + t.route + ':' + RA.chrome.badgeCount(t.badge));
    });
    return parts.join('|');
  }

  /** Add, update or remove the numeric badge on one rail link. */
  function patchRailBadge(link, count) {
    var badge = link.querySelector('.rail__badge');
    if (count > 0) {
      if (badge) { badge.textContent = String(count); }
      else {
        badge = document.createElement('span');
        badge.className = 'rail__badge';
        badge.textContent = String(count);
        link.appendChild(badge);
      }
    } else if (badge) {
      badge.parentNode.removeChild(badge);
    }
  }

  /** Add or remove the dot on one tab-bar item. */
  function patchTabDot(item, count) {
    var wrap = item.firstElementChild;          // the icon wrapper span
    if (!wrap) return;
    var dot = wrap.querySelector('.iconbtn__dot');
    if (count > 0 && !dot) {
      dot = document.createElement('span');
      dot.className = 'iconbtn__dot';
      dot.style.top = '-2px';
      dot.style.right = '-4px';
      wrap.appendChild(dot);
    } else if (count === 0 && dot) {
      dot.parentNode.removeChild(dot);
    }
  }

  function syncBadges() {
    var role = RA.store.select.role();
    var nav = role && RA.chrome.NAV[role];
    if (!nav) return;

    var rail = document.getElementById('rail');
    if (rail) {
      nav.groups.forEach(function (g) {
        g.items.forEach(function (it) {
          if (!it.badge) return;
          var link = rail.querySelector('[data-nav="' + it.route + '"]');
          if (link) patchRailBadge(link, RA.chrome.badgeCount(it.badge));
        });
      });
    }

    var tabbar = document.querySelector('.tabbar');
    if (tabbar) {
      nav.tabs.forEach(function (t) {
        if (!t.badge) return;
        var item = tabbar.querySelector('[data-nav="' + t.route + '"]');
        if (item) patchTabDot(item, RA.chrome.badgeCount(t.badge));
      });
    }
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  function boot() {
    var missing = missingDependency();
    if (missing) {
      fatal('The app could not start',
        'A required script (RA.' + missing + ') did not load. If you opened this ' +
        'from a zip, make sure the whole <code>assets</code> folder came with ' +
        'index.html.');
      return;
    }

    /* Pick the data adapter first. This always resolves — a misconfigured
       Firebase project degrades to demo data rather than to a broken page. */
    RA.backend.resolve().then(function () {
      return RA.store.boot();
    }).then(function () {
      RA.chrome.bind();
      if (RA.bgwave && typeof RA.bgwave.init === 'function') {
        try { RA.bgwave.init(); } catch (e) {}
      }
      RA.router.start();

      /* Keep badges honest without repainting the route. */
      var last = badgeSignature(RA.store.select.role());
      RA.store.subscribe(function () {
        var role = RA.store.select.role();
        var next = badgeSignature(role);
        if (next !== last) { last = next; syncBadges(); }
      });

      /* A throttled remote adapter may still be holding an unwritten change
         when the tab closes. Ask it to flush; Firestore's local cache covers
         us if the request does not make it out in time. */
      window.addEventListener('pagehide', function () {
        if (RA.data && typeof RA.data.flush === 'function') RA.data.flush();
      });

      document.body.classList.add('is-booted');
      document.body.setAttribute('data-backend', RA.backendInfo.active);
    }).catch(function (err) {
      console.error('[app] boot failed', err);
      fatal('The app could not start',
        String((err && err.message) || err) +
        '<br><br>Your saved demo data may be corrupt. Reloading usually clears it.');
    });
  }

  /* Scripts sit at the end of <body>, so the DOM is normally ready already. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  RA.app = { boot: boot, syncBadges: syncBadges };

  // Patch the router so every render (initial + every nav) wakes the
  // motion layer. Router is loaded before app.js, so the function is
  // already there to wrap.
  (function patchRouter() {
    if (!RA.router || typeof RA.router.refresh !== 'function') return;
    var origRefresh = RA.router.refresh;
    RA.router.refresh = function () {
      origRefresh.apply(RA.router, arguments);
      // The router just repainted #app. Hand the new DOM to the motion
      // layer on the next frame.
      requestAnimationFrame(MotionCtx.refresh);
    };
  })();

  /* ======================================================================
     Motion layer — re-runs after every route render
     The router swaps #app's innerHTML on every navigation, so any
     observers/listeners from the previous page must be torn down and
     re-attached. We use a single MotionCtx that owns the IntersectionObserver
     and the mock-tilt listeners, and call .refresh() after each render.
     ====================================================================== */
  var MotionCtx = (function () {
    var io = null;
    var mockListeners = null;
    var tiltListeners = [];
    var revealEls = [];
    var parallaxEls = [];
    var finePointer = false;
    try { finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches; }
    catch (e) { finePointer = false; }

    function setupReveals() {
      // Detach any elements from the previous observer first
      if (io) { try { io.disconnect(); } catch (e) {} io = null; }
      revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
      if (!revealEls.length || !('IntersectionObserver' in window)) return;

      // Cheap & cheerful: on every refresh, immediately mark any reveal
      // that is currently inside the viewport (top-down). This handles the
      // "user scrolled past it before the observer could fire" case which
      // would otherwise leave the element stuck invisible.
      revealEls.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add('is-in');
        }
      });

      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            try { io.unobserve(e.target); } catch (err) {}
          }
        });
      }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

      // Observe only elements that are still hidden (above-the-fold ones
      // are already marked, and elements scrolled past are still being
      // scrolled to).
      revealEls.forEach(function (el) {
        if (!el.classList.contains('is-in')) {
          try { io.observe(el); } catch (err) {}
        }
      });
    }

    function setupMockTilt() {
      teardownMockTilt();
      var mock = document.querySelector('.mock');
      if (!mock) return;
      var maxTilt = 6;        // degrees, subtle (premium, not gimmicky)
      var rect = null;
      function refreshRect() { rect = mock.getBoundingClientRect(); }
      function onMove(e) {
        if (!rect) refreshRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) / (rect.width / 2);
        var dy = (e.clientY - cy) / (rect.height / 2);
        mock.style.setProperty('--rx', (-dy * maxTilt).toFixed(2) + 'deg');
        mock.style.setProperty('--ry', ( dx * maxTilt).toFixed(2) + 'deg');
        mock.style.setProperty('--tz', '24px');
      }
      function onLeave() {
        mock.style.setProperty('--rx', '0deg');
        mock.style.setProperty('--ry', '0deg');
        mock.style.setProperty('--tz', '0px');
        rect = null;
      }
      mock.addEventListener('mousemove', onMove);
      mock.addEventListener('mouseleave', onLeave);
      window.addEventListener('resize', refreshRect);
      mockListeners = { mock: mock, onMove: onMove, onLeave: onLeave, refreshRect: refreshRect };
    }

    function teardownMockTilt() {
      if (!mockListeners) return;
      mockListeners.mock.removeEventListener('mousemove', mockListeners.onMove);
      mockListeners.mock.removeEventListener('mouseleave', mockListeners.onLeave);
      window.removeEventListener('resize', mockListeners.refreshRect);
      mockListeners = null;
    }

    /* Generic pointer tilt for any [data-tilt] card (feat/portal/price).
       Subtle 3D: max 7deg, springs back on leave. Skipped on touch. */
    function setupGenericTilt() {
      teardownGenericTilt();
      if (!finePointer) return;
      var els = Array.prototype.slice.call(document.querySelectorAll('[data-tilt]'));
      els.forEach(function (el) {
        var max = parseFloat(el.getAttribute('data-tilt')) || 7;
        var rect = null;
        function onMove(e) {
          if (!rect) rect = el.getBoundingClientRect();
          var dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
          var dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
          dx = Math.max(-1, Math.min(1, dx));
          dy = Math.max(-1, Math.min(1, dy));
          el.style.setProperty('--rx', (-dy * max).toFixed(2) + 'deg');
          el.style.setProperty('--ry', (dx * max).toFixed(2) + 'deg');
        }
        function onLeave() {
          el.style.setProperty('--rx', '0deg');
          el.style.setProperty('--ry', '0deg');
          rect = null;
        }
        el.addEventListener('mousemove', onMove);
        el.addEventListener('mouseleave', onLeave);
        tiltListeners.push({ el: el, onMove: onMove, onLeave: onLeave });
      });
    }

    function teardownGenericTilt() {
      tiltListeners.forEach(function (h) {
        h.el.removeEventListener('mousemove', h.onMove);
        h.el.removeEventListener('mouseleave', h.onLeave);
      });
      tiltListeners = [];
    }

    /* Scroll parallax: [data-parallax="speed"] drifts with viewport.
       Speed is a fraction of the element's distance from viewport centre. */
    function setupParallax() {
      parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
      updateParallax();
    }

    function updateParallax() {
      if (!parallaxEls.length) return;
      var vh = window.innerHeight;
      parallaxEls.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.06;
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var delta = (r.top + r.height / 2) - vh / 2;
        el.style.setProperty('--py', (-delta * speed).toFixed(1) + 'px');
      });
    }

    function refresh() {
      // Defer one frame so the router's innerHTML write has committed
      requestAnimationFrame(function () {
        setupReveals();
        setupMockTilt();
        setupGenericTilt();
        setupParallax();
      });
    }

    // Scroll-driven safety net: as the user scrolls, mark any reveal
    // that has come into the viewport but the observer hasn't fired for
    // (fast scroll, very tall sections). Throttled to one frame.
    var scrollTick = false;
    function onScroll() {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(function () {
        scrollTick = false;
        updateParallax();
        if (!revealEls.length) return;
        var vh = window.innerHeight;
        revealEls.forEach(function (el) {
          if (el.classList.contains('is-in')) return;
          var r = el.getBoundingClientRect();
          if (r.top < vh && r.bottom > 0) el.classList.add('is-in');
        });
      });
    }

    return { refresh: refresh, onScroll: onScroll };
  })();

  RA.motion = MotionCtx;

  // Run once on boot (for the very first render) and again after every
  // hash change. We listen on hashchange so every navigation rehydrates
  // the motion layer with the new view's elements.
  window.addEventListener('hashchange', MotionCtx.refresh);
  window.addEventListener('scroll', MotionCtx.onScroll, { passive: true });
  // The router will fire hashchange OR call render() directly on first
  // boot; queue a refresh immediately to catch the very first paint.
  requestAnimationFrame(MotionCtx.refresh);
})(window, document);
