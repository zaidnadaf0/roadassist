/* ==========================================================================
   RoadAssist Web — Public marketing site
   Landing, features, pricing, about, contact.
   This is the layer the Flutter app never had: the part that makes RoadAssist
   a website people can find, read and trust before they ever sign up.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var ui = RA.ui;
  var esc = U.esc;
  var icon = RA.icon;

  RA.views = RA.views || {};

  /* ======================================================================
     Shared public chrome
     ====================================================================== */

  var LINKS = [
    { route: '/features', label: 'How it works' },
    { route: '/pricing',  label: 'Pricing' },
    { route: '/about',    label: 'About' },
    { route: '/contact',  label: 'Contact' }
  ];

  function pubnav(active) {
    return '<header class="pubnav"><div class="pubnav__in">' +
      '<button type="button" class="brand" data-nav="/" aria-label="RoadAssist home">' +
        '<span class="brand__mark">' + icon('truck', 20) + '</span>' +
        '<span class="brand__name">RoadAssist</span>' +
      '</button>' +
      '<nav class="pubnav__links" aria-label="Site">' + LINKS.map(function (l) {
        return '<button type="button" class="pubnav__link" data-nav="' + U.escAttr(l.route) + '"' +
          (active === l.route ? ' aria-current="page" style="color:#fff"' : '') + '>' +
          esc(l.label) + '</button>';
      }).join('') + '</nav>' +
      '<div class="pubnav__cta">' +
        ui.btn({ label: 'Sign in', variant: 'ghost', size: 'sm', nav: '/login' }) +
        ui.btn({ label: 'Get help now', size: 'sm', nav: '/app' }) +
      '</div>' +
      '</div></header>';
  }

  function footer() {
    var cols = [
      { h: 'Services', items: RA.seed.SERVICES.map(function (s) { return { label: s.name, route: '/services' }; }) },
      { h: 'Company',  items: [
        { label: 'About us', route: '/about' },
        { label: 'How it works', route: '/features' },
        { label: 'Pricing', route: '/pricing' },
        { label: 'Contact', route: '/contact' }
      ] },
      { h: 'Portals', items: [
        { label: 'Customer portal', route: '/app' },
        { label: 'Mechanic portal', route: '/m' },
        { label: 'Admin console', route: '/admin' },
        { label: 'Sign in', route: '/login' }
      ] }
    ];

    return '<footer class="foot"><div class="foot__in">' +
      '<div class="foot__grid">' +
        '<div class="foot__about">' +
          '<button type="button" class="brand" data-nav="/">' +
            '<span class="brand__mark">' + icon('truck', 20) + '</span>' +
            '<span class="brand__name">RoadAssist</span>' +
          '</button>' +
          '<p class="foot__text">Roadside help that arrives when it says it will. Verified mechanics, live GPS tracking and prices you can see before you confirm.</p>' +
          '<div class="hstack gap-2 mt-4">' +
            '<span class="pill pill--success"><span class="pill__dot pill__dot--live"></span>All systems operational</span>' +
          '</div>' +
        '</div>' +
        cols.map(function (c) {
          return '<div><div class="foot__h">' + esc(c.h) + '</div><div class="foot__list">' +
            c.items.map(function (i) {
              return '<a href="#' + U.escAttr(i.route) + '">' + esc(i.label) + '</a>';
            }).join('') + '</div></div>';
        }).join('') +
      '</div>' +
      '<div class="foot__bar">' +
        '<span>&copy; ' + new Date().getFullYear() + ' RoadAssist. Demo build — seeded data, no live dispatch.</span>' +
        '<span class="push">Built as a static site: no build step, no server required.</span>' +
      '</div>' +
      '</div></footer>';
  }

  function pubShell(active, main) {
    return '<div class="public">' + pubnav(active) +
      '<main id="main">' + main + '</main>' + footer() + '</div>';
  }

  /* ======================================================================
     Landing
     ====================================================================== */

  function heroMock() {
    var mechs = RA.store.select.mechanicsNear(RA.seed.HOME).slice(0, 2);
    return '<div class="mock reveal" data-d="1">' +
      '<div class="mock__bar">' +
        '<span class="mock__dot"></span><span class="mock__dot"></span><span class="mock__dot"></span>' +
        '<span class="mock__url">roadassist.app/track — RA-2041 · en route</span>' +
      '</div>' +
      '<div class="mock__screen">' +
        '<div class="hstack gap-3 mb-4">' +
          ui.pill('En Route', 'primary', true) +
          '<span class="push t-2 fs-xs demo-eta" id="demo-eta">ETA ' + esc(U.mins(mechs[0] ? mechs[0].etaMin : 8)) + '</span>' +
        '</div>' +
        // Real interactive Leaflet map, sized to the mock device.
        RA.map.shell('hero-demo-map', {
          size: 'panel',
          aria: 'Live demo map of a mechanic en route to a customer',
          fallbackTitle: 'Live tracking',
          fallbackText: 'Watch your mechanic move toward you in real time.',
          recenter: false
        }) +
        '<div class="mt-4">' + ui.rows(mechs.map(function (m, i) {
          return ui.row({
            avatar: m.name, dot: m.online,
            title: m.name,
            sub: m.shop + ' · ' + U.miles(m.distanceMi) + ' away',
            end: '<div class="row__end">' + ui.rating(m.rating) + '</div>',
            rise: i
          });
        })) + '</div>' +
      '</div></div>';
  }

  RA.views.landing = function () {
    var stats = RA.store.select.adminStats();

    var hero = '<section class="hero"><div class="hero__in">' +
      '<div class="reveal" data-parallax="-0.05">' +
        '<span class="eyebrow"><span class="eyebrow__dot"></span>24/7 · Average response 14 minutes</span>' +
        '<h1 class="hero__title">Stranded? Help is <em>one tap away</em>.</h1>' +
        '<p class="hero__lede">RoadAssist connects you with verified roadside mechanics in minutes — towing, jump starts, flat tyres, fuel, lockouts and winch-outs. Live GPS tracking, upfront pricing, no phone tag.</p>' +
        '<div class="hero__actions">' +
          ui.btn({ label: 'Request assistance', icon: 'zap', nav: '/app' }) +
          ui.btn({ label: 'See how it works', variant: 'secondary', icon: 'chevronR', nav: '/features' }) +
        '</div>' +
        '<div class="hero__proof reveal" data-d="2">' +
          [['Rescues completed', U.num(stats.totalRescues)],
           ['Verified mechanics', U.num(stats.activeMechanics)],
           ['Avg. response', stats.avgResponseMin + ' min'],
           ['Completion rate', stats.completionRate + '%']].map(function (p) {
            return '<div><div class="proof__v">' + esc(p[1]) + '</div><div class="proof__k">' + esc(p[0]) + '</div></div>';
          }).join('') +
        '</div>' +
        '<div class="scrollhint" aria-hidden="true"><span class="scrollhint__mouse"></span>Scroll to explore</div>' +
      '</div>' +
      '<div class="reveal" data-d="1" data-parallax="0.07">' + heroMock() + '</div>' +
      '</div></section>';

    var services = '<section class="sect reveal"><div class="sect__in">' +
      '<div class="sect__head sect__head--c">' +
        '<h2 class="sect__title">Six services, one number</h2>' +
        '<p class="sect__lede">Whatever stopped you, there is a technician nearby who is equipped for it. Prices below are the standard call-out rate — you see the exact figure before you confirm.</p>' +
      '</div>' +
      '<div class="grid grid--services">' +
        RA.seed.SERVICES.map(function (s, i) {
          return ui.svcTile(s, { rise: i, nav: '/services' });
        }).join('') +
      '</div></div></section>';

    var FEATURES = [
      { icon: 'radio',    tint: 'var(--primary-15)', tone: 'var(--primary)', title: 'Instant SOS dispatch', text: 'One press broadcasts your exact coordinates to every capable mechanic in range. No describing landmarks over a bad phone line.' },
      { icon: 'navigation', tint: 'var(--accent-15)', tone: 'var(--accent)', title: 'Live GPS tracking', text: 'Watch the truck approach on a live map with a continuously updated ETA, so you know whether you have time for a coffee.' },
      { icon: 'verified', tint: 'var(--success-15)', tone: 'var(--success)', title: 'Verified professionals', text: 'Every mechanic clears a licence, insurance and identity check before they can accept a single job on the platform.' },
      { icon: 'dollar',   tint: 'var(--warning-15)', tone: 'var(--warning)', title: 'Transparent pricing', text: 'The call-out price is shown up front and locked when you confirm. No surge pricing at 2am, no surprises on the invoice.' },
      { icon: 'shield',   tint: 'var(--danger-15)',  tone: 'var(--danger)',  title: 'Emergency contacts', text: 'Share your live location with a nominated contact in one tap, so someone always knows where you are.' },
      { icon: 'history',  tint: 'var(--primary-15)', tone: 'var(--primary)', title: 'Complete service record', text: 'Every call-out, receipt and rating is kept against your vehicle — useful for warranty claims and resale.' }
    ];

    var features = '<section class="sect sect--alt reveal"><div class="sect__in">' +
      '<div class="sect__head">' +
        '<h2 class="sect__title">Built for the worst ten minutes of your week</h2>' +
        '<p class="sect__lede">Roadside breakdowns are stressful, and most assistance apps make them worse. RoadAssist is designed around the things that actually matter when you are standing on a hard shoulder.</p>' +
      '</div>' +
      '<div class="grid grid--cards">' + FEATURES.map(function (f, i) {
        return '<article class="feat rise" data-tilt="6" style="--i:' + i + '">' +
          '<span class="feat__icon" style="--tint:' + f.tint + ';--tone:' + f.tone + '">' + icon(f.icon, 23) + '</span>' +
          '<h3 class="feat__title">' + esc(f.title) + '</h3>' +
          '<p class="feat__text">' + esc(f.text) + '</p>' +
          '</article>';
      }).join('') + '</div></div></section>';

    var how = '<section class="sect reveal"><div class="sect__in">' +
      '<div class="sect__head sect__head--c">' +
        '<h2 class="sect__title">From breakdown to back on the road</h2>' +
        '<p class="sect__lede">Four steps. The longest one is the wait, and you can watch that tick down.</p>' +
      '</div>' +
      '<div class="how">' + [
        ['Tell us what happened', 'Pick a service or hit SOS. We capture your GPS position automatically, so there is nothing to type while you are stressed.'],
        ['We match a mechanic', 'The request goes out to verified technicians nearby. The closest one who can actually do the job accepts it.'],
        ['Track them in', 'Follow the vehicle on a live map, call the driver directly, and share your location with an emergency contact.'],
        ['Pay and rate', 'The agreed price is charged, a receipt lands in your history, and your rating keeps the network honest.']
      ].map(function (s) {
        return '<div class="how__item"><h3 class="how__title">' + esc(s[0]) + '</h3>' +
          '<p class="how__text">' + esc(s[1]) + '</p></div>';
      }).join('') + '</div></div></section>';

    var portals = '<section class="sect sect--alt reveal"><div class="sect__in">' +
      '<div class="sect__head sect__head--c">' +
        '<h2 class="sect__title">Three portals, one platform</h2>' +
        '<p class="sect__lede">This build ships with realistic seeded data, so you can walk through all three experiences right now — no account needed.</p>' +
      '</div>' +
      '<div class="portals">' + [
        { role: 'customer', route: '/app', icon: 'person', tint: 'var(--primary-15)', tone: 'var(--primary)',
          name: 'Customer portal', text: 'Request help, choose a mechanic, track them live, manage vehicles and emergency contacts, and review your full service history.' },
        { role: 'mechanic', route: '/m', icon: 'wrench', tint: 'var(--warning-15)', tone: 'var(--warning)',
          name: 'Mechanic portal', text: 'Go on duty, accept or decline incoming SOS jobs, navigate to the customer, and track daily and weekly earnings and payouts.' },
        { role: 'admin', route: '/admin', icon: 'building', tint: 'var(--accent-15)', tone: 'var(--accent)',
          name: 'Admin console', text: 'Monitor live dispatches, approve mechanic applications, read platform analytics, pull reports and audit system logs.' }
      ].map(function (p) {
        return '<button type="button" class="portal" data-tilt="5" data-nav="' + U.escAttr(p.route) + '"' +
          ' style="--tint:' + p.tint + ';--tone:' + p.tone + '">' +
          '<span class="portal__icon">' + icon(p.icon, 24) + '</span>' +
          '<span class="portal__name">' + esc(p.name) + '</span>' +
          '<span class="portal__text">' + esc(p.text) + '</span>' +
          '<span class="portal__go">Open portal ' + icon('chevronR', 15) + '</span>' +
          '</button>';
      }).join('') + '</div></div></section>';

    var band = '<section class="sect reveal"><div class="band"><div class="band__in">' +
      '<h2 class="sect__title">Set it up before you need it</h2>' +
      '<p class="sect__lede">Add your vehicle and an emergency contact now, and a future breakdown becomes a single tap instead of a form.</p>' +
      '<div class="band__actions">' +
        ui.btn({ label: 'Create free account', nav: '/signup' }) +
        ui.btn({ label: 'Explore the demo', variant: 'secondary', nav: '/app' }) +
      '</div>' +
      '</div></div></section>';

    return {
      chrome: false,
      docTitle: null,
      html: pubShell('/', hero + services + features + how + portals + band),
      // Mount the real Leaflet demo map into the hero card and start a
      // small animation: one mechanic marker walks from a starting point
      // toward the user's location on a curved path, ETA counts down.
      // The whole loop runs on requestAnimationFrame; cleanup() stops it.
      mount: function (root) {
        var home = RA.seed.HOME;
        var mechs = RA.store.select.mechanicsNear(home);
        if (!mechs || !mechs.length) return null;
        // Pick the closest available mechanic for the demo
        var featured = mechs[0];

        // Two labelled points: the user (home) and the mechanic's origin
        var demoMech = {
          id: 'demo-mech',
          name: featured.name,
          shop: featured.shop,
          rating: featured.rating,
          etaMin: featured.etaMin,
          lat: featured.lat,
          lng: featured.lng,
          online: true
        };

        // Build a curved path from the mechanic to home (matches real
        // tracking view) and seed the marker at the start.
        var path = U.curvedPath(
          { lat: demoMech.lat, lng: demoMech.lng },
          home
        );

        var map = RA.map.mount('hero-demo-map', {
          center: { lat: (demoMech.lat + home.lat) / 2, lng: (demoMech.lng + home.lng) / 2 },
          user: home,
          userLabel: true,
          mechanics: [demoMech],
          selectedId: 'demo-mech',
          route: path,
          zoom: 14,
          interactive: false,        // hero card is non-interactive preview
          scrollWheelZoom: false,
          fit: true
        });
        if (!map) return null;  // Leaflet not available — fallback shown

        // Animate the mechanic along the path on a loop. We move 0→1
        // over 8s, then snap back to 0 and continue. ETA label ticks
        // down from the mechanic's etaMin to 0 across the same window.
        var startTime = null;
        var DURATION = 8000;
        var totalEta = Math.max(2, featured.etaMin || 5);
        var raf = null;
        var etaNode = root.querySelector('#demo-eta');

        function lerp(a, b, t) { return a + (b - a) * t; }
        function pointAt(t) {
          // Sample the path at fractional position t
          var idx = t * (path.length - 1);
          var i = Math.floor(idx);
          var frac = idx - i;
          if (i >= path.length - 1) return path[path.length - 1];
          var a = path[i], b = path[i + 1];
          return { lat: lerp(a.lat, b.lat, frac), lng: lerp(a.lng, b.lng, frac) };
        }
        function tick(ts) {
          if (startTime === null) startTime = ts;
          var elapsed = (ts - startTime) % DURATION;
          var t = elapsed / DURATION;
          var pt = pointAt(t);
          RA.map.moveMechanic('hero-demo-map', 'demo-mech', pt);
          if (etaNode) {
            var remaining = Math.max(0, Math.round(totalEta * (1 - t)));
            etaNode.textContent = 'ETA ' + (remaining === 1 ? '1 min' : remaining + ' mins');
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        return function cleanup() {
          if (raf) cancelAnimationFrame(raf);
          try { RA.map.destroy('hero-demo-map'); } catch (e) {}
        };
      }
    };
  };

  /* ======================================================================
     Features / How it works
     ====================================================================== */

  RA.views.features = function () {
    var faq = [
      ['How fast will someone actually arrive?', 'Across the seeded demo network the average is 14.5 minutes from confirmation to arrival. The live ETA you see when you request is calculated from the assigned mechanic\'s real position and distance, not a flat estimate.'],
      ['What if no mechanic accepts my request?', 'The dispatcher widens the search radius automatically — from 5 km to 8, then 12. You stay on the tracking screen and can cancel at any point without a charge.'],
      ['Can I choose a specific mechanic?', 'Yes. Browse the mechanic list, read reviews, and request one directly. If you would rather not choose, RoadAssist assigns the closest capable technician.'],
      ['Is the price I see the price I pay?', 'The call-out rate is fixed when you confirm. Towing beyond the included 25 km is charged per kilometre and shown on the confirmation screen before you commit.'],
      ['What happens to my location data?', 'Location is used to dispatch and track a single job, and to show your emergency contact where you are if you choose to share. It is not sold or used for advertising.'],
      ['Does this work for electric vehicles?', 'Yes. Several mechanics in the network are EV-certified for high-voltage isolation and low-clearance flatbed loading. EV capability is shown on the mechanic profile.']
    ];

    var main = '<section class="sect"><div class="sect__in">' +
      '<div class="sect__head">' +
        '<span class="eyebrow">' + icon('info', 14) + 'How it works</span>' +
        '<h1 class="sect__title mt-4">Everything that happens between the breakdown and the tow</h1>' +
        '<p class="sect__lede">A plain-English walkthrough of the dispatch flow, what each portal does, and the questions people ask most often.</p>' +
      '</div>' +

      '<div class="how mb-5">' + [
        ['You request', 'Choose a service or press SOS. Your coordinates, vehicle and a short note go out together.'],
        ['We broadcast', 'Every online mechanic within range who offers that service sees the job, with distance and payout.'],
        ['They accept', 'The first suitable technician claims it. You get their name, photo, rating, phone number and live position.'],
        ['You track', 'The map updates as they approach. Status moves through assigned, en route, arrived, then in progress.'],
        ['Work happens', 'Most jobs finish roadside. If a tow is needed, the destination garage is agreed before loading.'],
        ['You rate', 'A receipt is filed against your vehicle and your rating feeds back into the mechanic\'s score.']
      ].map(function (s) {
        return '<div class="how__item"><h3 class="how__title">' + esc(s[0]) + '</h3>' +
          '<p class="how__text">' + esc(s[1]) + '</p></div>';
      }).join('') + '</div>' +

      '</div></section>' +

      '<section class="sect sect--alt"><div class="sect__in">' +
      '<div class="sect__head"><h2 class="sect__title">What each service covers</h2></div>' +
      '<div class="grid grid--cards">' + RA.seed.SERVICES.map(function (s, i) {
        return ui.card(
          '<div class="hstack gap-3 mb-3">' +
            '<span class="svc__icon" style="--tint:' + U.escAttr(s.tint) + ';--tone:' + U.escAttr(s.tone) + '">' +
              icon(s.icon, 22) + '</span>' +
            '<div><div class="fw-7">' + esc(s.name) + '</div>' +
            '<div class="fs-xs t-2">' + esc(s.eta) + ' typical</div></div>' +
            '<span class="push fw-7">' + esc(U.money(s.base, false)) + '</span>' +
          '</div>' +
          '<p class="fs-sm t-2">' + esc(s.desc) + '</p>',
          { rise: i });
      }).join('') + '</div></div></section>' +

      '<section class="sect"><div class="sect__in">' +
      '<div class="sect__head"><h2 class="sect__title">Frequently asked</h2></div>' +
      '<div class="faq">' + faq.map(function (f, i) {
        return '<details class="faq__item"' + (i === 0 ? ' open' : '') + '>' +
          '<summary class="faq__q">' + esc(f[0]) + '</summary>' +
          '<div class="faq__a">' + esc(f[1]) + '</div></details>';
      }).join('') + '</div></div></section>';

    return { chrome: false, title: 'How it works', html: pubShell('/features', main) };
  };

  /* ======================================================================
     Pricing
     ====================================================================== */

  RA.views.pricing = function () {
    var PLANS = [
      { name: 'Pay as you go', price: 0, per: 'no membership fee', featured: false,
        badge: null,
        items: ['Standard call-out rates', 'Live GPS tracking', 'Verified mechanics', 'Service history & receipts', 'One saved vehicle'],
        cta: 'Start free' },
      { name: 'Priority', price: 299, per: 'per month', featured: true,
        badge: 'Most popular',
        items: ['4 free call-outs per year', '25% off every additional call-out', 'Priority in the dispatch queue', 'Up to 5 saved vehicles', 'Unlimited emergency contacts', '24/7 phone support line'],
        cta: 'Choose Priority' },
      { name: 'Fleet', price: 999, per: 'per vehicle / month', featured: false,
        badge: 'For business',
        items: ['Unlimited call-outs', 'Consolidated monthly invoicing', 'Driver and vehicle management', 'Downtime and cost reporting', 'Dedicated account manager'],
        cta: 'Talk to sales' }
    ];

    var main = '<section class="sect"><div class="sect__in">' +
      '<div class="sect__head sect__head--c">' +
        '<h1 class="sect__title">Pay only when you break down — or never worry again</h1>' +
        '<p class="sect__lede">No membership is required to use RoadAssist. A plan simply makes call-outs cheaper and puts you higher in the queue.</p>' +
      '</div>' +

      '<div class="grid grid--cards mb-5">' + PLANS.map(function (p, i) {
        return '<div class="' + ui.cx('price', p.featured ? 'is-featured' : '', 'rise') + '" style="--i:' + i + '">' +
          (p.badge ? '<span class="price__badge">' + ui.pill(p.badge, p.featured ? 'primary' : 'accent') + '</span>' : '') +
          '<div class="price__name">' + esc(p.name) + '</div>' +
          '<div class="price__amt"><span class="price__num">' + esc(U.money(p.price, false)) + '</span>' +
            '<span class="price__per">' + esc(p.per) + '</span></div>' +
          '<div class="price__list">' + p.items.map(function (it) {
            return '<div class="price__li">' + icon('check', 16) + '<span>' + esc(it) + '</span></div>';
          }).join('') + '</div>' +
          ui.btn({ label: p.cta, variant: p.featured ? '' : 'secondary', block: true,
                   nav: p.name === 'Fleet' ? '/contact' : '/signup' }) +
          '</div>';
      }).join('') + '</div>' +

      '<h2 class="section__title mb-4">Standard call-out rates</h2>' +
      ui.table(['Service', 'Included', 'Standard', 'Priority plan'],
        RA.seed.SERVICES.map(function (s) {
          return [
            '<div class="hstack gap-3"><span class="row__icon" style="width:32px;height:32px;--tint:' +
              U.escAttr(s.tint) + ';--tone:' + U.escAttr(s.tone) + '">' + icon(s.icon, 16) + '</span>' +
              '<span class="fw-6">' + esc(s.name) + '</span></div>',
            '<span class="t-2">' + esc(s.id === 'towing' ? 'First 25 km' : (s.id === 'fuel' ? 'Up to 3 litres' : 'Roadside labour')) + '</span>',
            '<span class="fw-7">' + esc(U.money(s.base, false)) + '</span>',
            '<span class="fw-7 t-success">' + esc(U.money(s.base * 0.75, false)) + '</span>'
          ];
        }), { wrapCols: [1] }) +
      '<p class="fs-xs t-3 mt-3">Towing beyond the included distance is charged at ₹50 per kilometer. Rates shown are for the seeded Bengaluru demo network.</p>' +
      '</div></section>';

    return { chrome: false, title: 'Pricing', html: pubShell('/pricing', main) };
  };

  /* ======================================================================
     About
     ====================================================================== */

  RA.views.about = function () {
    var stats = RA.store.select.adminStats();

    var main = '<section class="sect"><div class="sect__in">' +
      '<div class="sect__head">' +
        '<span class="eyebrow">' + icon('building', 14) + 'About</span>' +
        '<h1 class="sect__title mt-4">We are trying to make the hard shoulder less lonely</h1>' +
        '<p class="sect__lede">RoadAssist started as a simple observation: when a car stops working, the technology around the problem is usually worse than the problem itself. Long hold queues, vague arrival windows, and a bill you only see at the end.</p>' +
      '</div>' +

      '<div class="split">' +
        '<div class="stack stack-4">' +
          '<p class="t-2">Every part of this platform is built around removing a moment of uncertainty. You should know who is coming, where they are, what they will do, and what it will cost — before they arrive, not after.</p>' +
          '<p class="t-2">The mechanic side matters just as much. Technicians see a clear job with a stated payout and distance, accept or decline in one tap, and get paid weekly without chasing anyone. A network only stays fast if the people in it want to keep working in it.</p>' +
          '<p class="t-2">This build is a demonstration running entirely on seeded data in your browser. Nothing is transmitted anywhere, no account is created, and you can reset it to its original state at any time from Settings.</p>' +
        '</div>' +
        '<div class="stack stack-4">' +
          '<div class="grid grid--2">' +
            ui.stat({ label: 'Rescues completed', value: U.num(stats.totalRescues), icon: 'checkCircle', tint: 'var(--success-15)', tone: 'var(--success)' }) +
            ui.stat({ label: 'Verified mechanics', value: U.num(stats.activeMechanics), icon: 'verified', tint: 'var(--primary-15)', tone: 'var(--primary)' }) +
            ui.stat({ label: 'Drivers registered', value: U.num(stats.totalUsers), icon: 'users', tint: 'var(--accent-15)', tone: 'var(--accent)' }) +
            ui.stat({ label: 'Avg. response', value: stats.avgResponseMin + ' min', icon: 'timer', tint: 'var(--warning-15)', tone: 'var(--warning)' }) +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div></section>' +

      '<section class="sect sect--alt"><div class="sect__in">' +
      '<div class="sect__head"><h2 class="sect__title">What we will not do</h2></div>' +
      '<div class="grid grid--cards">' + [
        ['Surge pricing', 'The rate you are quoted at 2am on a wet Tuesday is the same rate as midday on a Sunday. Breakdowns are not a bidding opportunity.'],
        ['Unverified operators', 'Every technician clears licence, insurance and identity checks before their first job. Applications sit in a review queue until a human approves them.'],
        ['Vague arrival windows', 'No "sometime this afternoon". You get a live position and a continuously recalculated ETA, or you get to cancel for free.'],
        ['Selling your location', 'Location data exists to dispatch a job and, if you choose, to reassure someone who cares about you. That is the entire list of uses.']
      ].map(function (c, i) {
        return ui.card('<h3 class="feat__title">' + esc(c[0]) + '</h3>' +
          '<p class="feat__text">' + esc(c[1]) + '</p>', { rise: i });
      }).join('') + '</div></div></section>';

    return { chrome: false, title: 'About', html: pubShell('/about', main) };
  };

  /* ======================================================================
     Contact
     ====================================================================== */

  RA.views.contact = function () {
    var main = '<section class="sect"><div class="sect__in">' +
      '<div class="sect__head">' +
        '<h1 class="sect__title">Talk to us</h1>' +
        '<p class="sect__lede">If you are broken down right now, do not use this form — open the app and press SOS, or call the 24/7 line.</p>' +
      '</div>' +

      '<div class="split">' +
        ui.card(
          '<h2 class="section__title mb-4">Send a message</h2>' +
          '<form id="contact-form" novalidate>' +
            ui.field({ label: 'Your name', name: 'name', placeholder: 'Jane Doe', icon: 'person' }) +
            ui.field({ label: 'Email address', name: 'email', type: 'email', placeholder: 'you@example.com', icon: 'mail' }) +
            ui.field({ label: 'Topic', name: 'topic', type: 'select',
              options: ['General enquiry', 'Billing question', 'Become a mechanic', 'Fleet & business', 'Report a problem'] }) +
            ui.field({ label: 'Message', name: 'message', type: 'textarea', placeholder: 'How can we help?' }) +
            ui.btn({ label: 'Send message', icon: 'send', block: true, type: 'submit', id: 'contact-send' }) +
          '</form>') +

        '<div class="stack stack-4">' +
          ui.card(
            '<div class="hstack gap-3 mb-3">' +
              '<span class="row__icon" style="--tint:var(--danger-15);--tone:var(--danger)">' + icon('phone', 19) + '</span>' +
              '<div><div class="fw-7">24/7 emergency line</div><div class="fs-xs t-2">Answered in under 30 seconds</div></div>' +
            '</div>' +
            '<a class="fw-7 fs-h3" href="tel:+919845611122">+91 98456 11122</a>',
            { variant: 'navy' }) +
          ui.card(ui.dl([
            ['Support email', 'help@roadassist.com'],
            ['Mechanic onboarding', 'partners@roadassist.com'],
            ['Press', 'press@roadassist.com'],
            ['Head office', 'RoadAssist HQ, Indiranagar, Bengaluru, Karnataka'],
            ['Support hours', '24 hours, 7 days']
          ])) +
        '</div>' +
      '</div>' +
      '</div></section>';

    return {
      chrome: false, title: 'Contact',
      html: pubShell('/contact', main),
      mount: function (root) {
        var form = U.qs('#contact-form', root);
        if (!form) return;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var values = ui.validateForm(form, {
            name: U.validate.required,
            email: U.validate.email,
            message: function (v) { return v && v.length >= 10 ? '' : 'Please write at least 10 characters.'; }
          });
          if (!values) return;
          ui.withLoading(U.qs('#contact-send', form), new Promise(function (r) { setTimeout(r, 700); }))
            .then(function () {
              form.reset();
              ui.toast('Message sent — we usually reply within a day', 'success');
            });
        });
      }
    };
  };

  RA.views._pubShell = pubShell;

  /**
   * Delegation scope for a view's mount().
   * router.render() hands mount() the persistent #app node, so attaching
   * delegated listeners there would stack up one copy per navigation.
   * Every shell renders a fresh #main on each paint, so scoping to it means
   * listeners die with the markup they belong to.
   */
  RA.views._scope = function (root) {
    return U.qs('#main', root) || root;
  };
})(window);
