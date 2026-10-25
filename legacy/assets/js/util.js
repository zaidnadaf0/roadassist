/* ==========================================================================
   RoadAssist Web — Utilities
   HTML escaping, formatting, DOM helpers, geo math (port of core/utils/)
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA = window.RA || {};

  /* ---------------------------------------------------------------------
     Escaping — every dynamic string goes through this before hitting
     innerHTML. Cheap insurance against a stored-XSS style bug when user
     text (vehicle names, review comments) is rendered.
     --------------------------------------------------------------------- */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  /** Escape for use inside an attribute that will be single-quoted in JS. */
  function escAttr(v) { return esc(v).replace(/`/g, '&#96;'); }

  /* ---------------------------------------------------------------------
     Formatting  ←  core/utils/date_formatter.dart, double_extensions.dart
     --------------------------------------------------------------------- */

  function money(n, withCents) {
    var num = Number(n) || 0;
    var cents = withCents === undefined ? true : withCents;
    /* Indian numbering system: en-IN groups with the lakh/crore pattern and
       uses ₹ as the rupee sign. Default to 2 decimal places so the figure
       matches the way roadside receipts are printed locally. */
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
  }

  function num(n) { return (Number(n) || 0).toLocaleString('en-IN'); }

  /** Distance label — India uses the metric system. Note: the underlying value
      was already kilometres (distanceKm in geo math), so "miles" was always
      mislabeled; this restores the correct unit name. */
  function miles(m) {
    var v = Number(m) || 0;
    return v < 0.1 ? '< 0.1 km' : v.toFixed(1) + ' km';
  }

  function mins(m) {
    var v = Math.max(0, Math.round(Number(m) || 0));
    if (v < 1) return 'Arriving now';
    if (v < 60) return v + ' min' + (v === 1 ? '' : 's');
    var h = Math.floor(v / 60), r = v % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function toDate(d) { return (d instanceof Date) ? d : new Date(d); }

  function fmtDate(d) {
    var x = toDate(d);
    if (isNaN(x)) return '—';
    return MONTHS[x.getMonth()] + ' ' + x.getDate() + ', ' + x.getFullYear();
  }

  function fmtTime(d) {
    var x = toDate(d);
    if (isNaN(x)) return '';
    var h = x.getHours(), m = x.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  function fmtDateTime(d) { return fmtDate(d) + ', ' + fmtTime(d); }

  /** "10m ago", "2h ago", "Yesterday, 4:15 PM" — matches the app's copy style. */
  function relTime(d) {
    var x = toDate(d);
    if (isNaN(x)) return '—';
    var diff = Date.now() - x.getTime();
    var mn = Math.round(diff / 60000);
    if (mn < 1) return 'Just now';
    if (mn < 60) return mn + 'm ago';
    var hr = Math.round(mn / 60);
    if (hr < 24) return hr + 'h ago';
    var startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    var days = Math.floor((startToday - x) / 86400000) + 1;
    if (days === 1) return 'Yesterday, ' + fmtTime(x);
    if (days < 7) return days + ' days ago';
    if (days < 14) return '1 week ago';
    if (days < 31) return Math.floor(days / 7) + ' weeks ago';
    return fmtDate(x);
  }

  function initials(name) {
    var s = String(name || '').trim();
    if (!s) return '?';
    var parts = s.replace(/\(.*?\)/g, ' ').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function titleCase(s) {
    return String(s || '').replace(/[_-]+/g, ' ')
      .replace(/\w\S*/g, function (t) { return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); });
  }

  /** "en_route" -> "En Route" */
  function humanStatus(s) { return titleCase(s); }

  function pluralize(n, one, many) {
    return (Number(n) === 1) ? one : (many || one + 's');
  }

  /* ---------------------------------------------------------------------
     Geo  ←  core/utils/geo_utils.dart
     --------------------------------------------------------------------- */

  var R_KM = 6371;
  function toRad(d) { return d * Math.PI / 180; }

  /** Haversine great-circle distance in kilometres. */
  function distanceKm(a, b) {
    if (!a || !b) return 0;
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  /** Distance in kilometres (India uses metric throughout). */
  function distanceMiles(a, b) { return distanceKm(a, b); }

  /** Rough ETA assuming ~22 km/h average urban response speed + 2 min dispatch. */
  function etaMinutes(a, b) {
    return Math.max(1, Math.round((distanceKm(a, b) / 22) * 60) + 2);
  }

  /* ---------------------------------------------------------------------
     Dispatch engine — ported from MECHIST (src/lib/nearby.ts +
     functions/src/matching.ts), adapted to BACKUP's mechanic shape.
     Pure functions: same logic runs in demo and against Firebase.
     --------------------------------------------------------------------- */

  /** Customer-facing radius (km). Mechanics beyond this are hidden in UI. */
  var DISPATCH_RADIUS_KM = 25;
  /** Operational outer bound (km). A mechanic's own serviceRadiusKm overrides. */
  var SERVER_RADIUS_KM = 50;
  /** How long an offer stays claimable (ms). MECHIST: 120s. */
  var OFFER_WINDOW_MS = 120000;
  /** Urban/mixed-road average speed until real routing lands. */
  var DISPATCH_SPEED_KMH = 35;

  /** Estimate travel time at dispatch speed (no +2 dispatch pad). */
  function kmToMin(km, speedKmh) {
    var s = Number(speedKmh) || DISPATCH_SPEED_KMH;
    km = Number(km);
    if (!isFinite(km) || km <= 0 || !isFinite(s) || s <= 0) return 0;
    return Math.max(1, Math.round((km / s) * 60));
  }

  function deriveEtaMinutes(mechPos, origin) {
    if (!mechPos || !origin) return 15;
    var km = distanceKm(mechPos, origin);
    if (!isFinite(km) || km <= 0) return 15;
    return kmToMin(km, DISPATCH_SPEED_KMH);
  }

  function isValidLatLng(p) {
    if (!p) return false;
    var la = Number(p.lat), ln = Number(p.lng);
    return isFinite(la) && isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
  }

  /** Catalogue service -> request problem-category (mirrors MECHIST services.ts). */
  function serviceCategoryFor(serviceId) {
    var map = { towing: 'tow', winch: 'tow', battery: 'battery', tire: 'flat-tyre', fuel: 'other', lockout: 'other' };
    return map[serviceId] || 'other';
  }

  function stemWord(s) {
    var out = String(s || '').toLowerCase().trim();
    if (out === 'tire' || out === 'tyres') out = 'tyre';
    if (out.length > 3 && out.charAt(out.length - 1) === 's') out = out.slice(0, -1);
    if (out === 'tire') out = 'tyre';
    if (out === 'batterie') out = 'battery';
    return out;
  }

  /**
   * A mechanic is compatible when one of their service tags stems to the
   * category's expected set. Empty specialties/services => generalist pass.
   */
  function problemCompatibility(category, specialties, serviceIds) {
    if (!category) return true;
    var EXPECTED = {
      'flat-tyre': ['tyre', 'tire', 'wheel', 'general'],
      battery: ['battery', 'electrical', 'general'],
      engine: ['engine', 'general'],
      tow: ['tow', 'recovery', 'winch', 'general'],
      other: ['general', 'fuel', 'lockout', 'tire', 'battery', 'tow']
    };
    if (category === 'other') return true; // fuel/lockout: everyone eligible
    var need = (EXPECTED[category] || ['general']).map(stemWord);
    var got = [];
    (specialties || []).forEach(function (x) { String(x).split(/[^a-zA-Z]+/).forEach(function (w) { if (w) got.push(stemWord(w)); }); });
    (serviceIds || []).forEach(function (x) { got.push(stemWord(x)); });
    if (!got.length) return true;
    for (var i = 0; i < need.length; i++) {
      if (got.indexOf(need[i]) > -1) return true;
    }
    // serviceId-level fallback: tire service always handles flat-tyre etc.
    return false;
  }

  /**
   * Score a mechanic for a request. Higher is better; -Infinity = ineligible.
   * 1000 - km*10 + specialty200 + rating*20 + min(reviews,50)*2 + liveBonus100
   */
  function scoreMechanic(m, origin, category) {
    if (!m) return -Infinity;
    if (m.online === false) return -Infinity;
    if (m.verified === false) return -Infinity;
    if (m.approved === false) return -Infinity;
    if (m.lat == null || m.lng == null) return -Infinity;
    if (!origin || origin.lat == null) return -Infinity;
    var km = distanceKm(origin, m);
    if (!isFinite(km)) return -Infinity;
    var radius = (m.serviceRadiusKm != null) ? Number(m.serviceRadiusKm) : SERVER_RADIUS_KM;
    if (km > radius) return -Infinity;
    if (!problemCompatibility(category, (m.tags || []).concat([m.specialty || '']), m.services)) {
      // still allow generalists: if mechanic lists the exact serviceId, pass
      if (!m.services || m.services.length === 0) { /* generalist */ }
      else if (category && serviceCategoryFor(m.services[0]) !== category) {
        // check any service maps to category
        var ok = false;
        for (var i = 0; i < m.services.length; i++) {
          if (serviceCategoryFor(m.services[i]) === category || category === 'other') { ok = true; break; }
        }
        if (!ok && category !== 'other') return -Infinity;
      }
    }
    var score = 1000 - km * 10;
    // specialty bonus: mechanic explicitly lists a matching stem
    score += 0; // compatibility already gates; bonus applied via service match below
    var svcMatch = false;
    try {
      var cat = category || '';
      (m.services || []).forEach(function (sid) { if (serviceCategoryFor(sid) === cat) svcMatch = true; });
    } catch (e) {}
    if (svcMatch) score += 200;
    if (m.rating != null) score += Number(m.rating) * 20;
    if (m.reviews != null) score += Math.min(Number(m.reviews) || 0, 50) * 2;
    return score;
  }

  /** Eligible mechanics sorted best-first. Pure; caller decides radius. */
  function findEligibleMechanics(mechanics, origin, opts) {
    opts = opts || {};
    var category = opts.category;
    var exclude = opts.exclude || opts.declinedBy || [];
    var radiusKm = (opts.radiusKm != null) ? opts.radiusKm : DISPATCH_RADIUS_KM;
    var out = [];
    (mechanics || []).forEach(function (m) {
      if (exclude.indexOf(m.id) > -1) return;
      var s = scoreMechanic(m, origin, category);
      if (s === -Infinity) return;
      var km = distanceKm(origin, m);
      if (km > radiusKm && (m.serviceRadiusKm == null || km > Number(m.serviceRadiusKm))) return;
      out.push({ mechanic: m, score: s, distanceKm: km, etaMin: kmToMin(km, DISPATCH_SPEED_KMH) });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /** Minimal CSV builder for admin exports (requests/mechanics/users). */
  function toCsv(rows) {
    if (!rows || !rows.length) return '';
    var cols = Object.keys(rows[0]);
    function q(v) {
      if (v == null) return '';
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return cols.join(',') + '\n' + rows.map(function (r) {
      return cols.map(function (c) { return q(r[c]); }).join(',');
    }).join('\n');
  }

  /** Linear interpolation between two points (used to animate the tow truck). */
  function lerpPoint(a, b, t) {
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }

  /**
   * Build a plausible curved path between two coords so the route line doesn't
   * look like a ruler. Not real routing — the app used a straight polyline too.
   */
  function curvedPath(a, b, steps) {
    var n = steps || 26;
    var mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    var dx = b.lng - a.lng, dy = b.lat - a.lat;
    // Offset the control point perpendicular to the A→B vector.
    var ctrl = { lat: mid.lat + dx * 0.14, lng: mid.lng - dy * 0.14 };
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push({
        lat: u * u * a.lat + 2 * u * t * ctrl.lat + t * t * b.lat,
        lng: u * u * a.lng + 2 * u * t * ctrl.lng + t * t * b.lng
      });
    }
    return pts;
  }

  /* ---------------------------------------------------------------------
     Ids & misc
     --------------------------------------------------------------------- */

  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function refCode(prefix, n) {
    return (prefix || 'RA') + '-' + String(n).padStart(4, '0');
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  function sortBy(arr, key, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var x = typeof key === 'function' ? key(a) : a[key];
      var y = typeof key === 'function' ? key(b) : b[key];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * d;
    });
  }

  function groupBy(arr, key) {
    return arr.reduce(function (acc, item) {
      var k = typeof key === 'function' ? key(item) : item[key];
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  function sum(arr, pick) {
    return arr.reduce(function (t, x) { return t + (Number(pick ? pick(x) : x) || 0); }, 0);
  }

  /* ---------------------------------------------------------------------
     DOM helpers
     --------------------------------------------------------------------- */

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /** Event delegation: on(root, 'click', '.btn', handler) */
  function on(root, type, sel, handler) {
    root.addEventListener(type, function (e) {
      var t = e.target.closest(sel);
      if (t && root.contains(t)) handler.call(t, e, t);
    });
  }

  /** Attach a click handler to every element matching sel within root. */
  function bindAll(root, sel, handler) {
    qsa(sel, root).forEach(function (node) {
      node.addEventListener('click', function (e) { handler.call(node, e, node); });
    });
  }

  /* Bind [data-nav="/path"] on any element to route navigation. */
  function bindNav(root) {
    qsa('[data-nav]', root).forEach(function (node) {
      node.addEventListener('click', function (e) {
        e.preventDefault();
        RA.router.go(node.getAttribute('data-nav'));
      });
    });
  }

  /** Read a form into a plain object. */
  function formData(form) {
    var out = {};
    qsa('input, select, textarea', form).forEach(function (f) {
      if (!f.name) return;
      out[f.name] = (f.type === 'checkbox') ? f.checked : f.value.trim();
    });
    return out;
  }

  /* ---------------------------------------------------------------------
     Validators  ←  core/utils/input_validators.dart
     --------------------------------------------------------------------- */

  var validate = {
    required: function (v) { return (v && String(v).trim()) ? '' : 'This field is required.'; },
    email: function (v) {
      if (!v) return 'Email is required.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email address.';
    },
    /** Accepts an email OR a phone number — the login field allows both. */
    emailOrPhone: function (v) {
      if (!v) return 'Email or mobile number is required.';
      var digits = v.replace(/\D/g, '');
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return '';
      if (digits.length >= 10) return '';
      return 'Enter a valid email or 10-digit mobile number.';
    },
    password: function (v) {
      if (!v) return 'Password is required.';
      return v.length >= 6 ? '' : 'Password must be at least 6 characters.';
    },
    phone: function (v) {
      if (!v) return 'Phone number is required.';
      return v.replace(/\D/g, '').length >= 10 ? '' : 'Enter a valid 10-digit phone number.';
    },
    plate: function (v) {
      if (!v) return 'License plate is required.';
      return /^[A-Za-z0-9 -]{2,10}$/.test(v) ? '' : 'Enter a valid license plate.';
    },
    year: function (v) {
      if (!v) return '';
      var y = parseInt(v, 10), now = new Date().getFullYear();
      return (y >= 1950 && y <= now + 1) ? '' : 'Enter a year between 1950 and ' + (now + 1) + '.';
    }
  };

  /* ---------------------------------------------------------------------
     Safe storage — localStorage throws in private mode / sandboxed iframes,
     so everything is wrapped with an in-memory fallback.
     --------------------------------------------------------------------- */

  var memStore = {};
  var canStore = (function () {
    try {
      var k = '__ra_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var storage = {
    available: canStore,
    get: function (key, fallback) {
      try {
        var raw = canStore ? window.localStorage.getItem(key) : memStore[key];
        return raw ? JSON.parse(raw) : (fallback === undefined ? null : fallback);
      } catch (e) { return fallback === undefined ? null : fallback; }
    },
    set: function (key, value) {
      try {
        var raw = JSON.stringify(value);
        if (canStore) window.localStorage.setItem(key, raw); else memStore[key] = raw;
        return true;
      } catch (e) { memStore[key] = JSON.stringify(value); return false; }
    },
    remove: function (key) {
      try { if (canStore) window.localStorage.removeItem(key); delete memStore[key]; } catch (e) {}
    }
  };

  RA.util = {
    esc: esc, escAttr: escAttr,
    money: money, num: num, miles: miles, mins: mins,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtDateTime: fmtDateTime, relTime: relTime,
    initials: initials, titleCase: titleCase, humanStatus: humanStatus, pluralize: pluralize,
    distanceKm: distanceKm, distanceMiles: distanceMiles, etaMinutes: etaMinutes,
    kmToMin: kmToMin, deriveEtaMinutes: deriveEtaMinutes, isValidLatLng: isValidLatLng,
    serviceCategoryFor: serviceCategoryFor, problemCompatibility: problemCompatibility,
    scoreMechanic: scoreMechanic, findEligibleMechanics: findEligibleMechanics, toCsv: toCsv,
    DISPATCH_RADIUS_KM: DISPATCH_RADIUS_KM, SERVER_RADIUS_KM: SERVER_RADIUS_KM,
    OFFER_WINDOW_MS: OFFER_WINDOW_MS, DISPATCH_SPEED_KMH: DISPATCH_SPEED_KMH,
    lerpPoint: lerpPoint, curvedPath: curvedPath,
    uid: uid, refCode: refCode, clamp: clamp, debounce: debounce,
    sortBy: sortBy, groupBy: groupBy, sum: sum,
    qs: qs, qsa: qsa, el: el, on: on, bindAll: bindAll, bindNav: bindNav, formData: formData,
    validate: validate, storage: storage
  };

  /* Convenience aliases used constantly in the view files. */
  RA.esc = esc;
  RA.qs = qs;
  RA.qsa = qsa;
})(window);
