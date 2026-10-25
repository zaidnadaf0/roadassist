/* ==========================================================================
   RoadAssist Web — Mechanic portal
   mDashboard · mRequests · mJob · mEarnings · mProfile

   Mirrors the Flutter mechanic screens (mechanic_dashboard_screen,
   incoming_requests_screen, active_job_screen, earnings_screen).

   Router contract: each view returns { title, sub, back, actions, html,
   mount(root) }, and mount() may return a cleanup function. Delegated
   listeners are always attached to scope(root) — the fresh #main node the
   shell paints on every navigation — so they die with their own markup
   instead of stacking up one copy per route change.
   ========================================================================== */
(function (window) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var ui = RA.ui;
  var esc = U.esc;
  var icon = RA.icon;
  var S = RA.store;

  RA.views = RA.views || {};

  /* ======================================================================
     Shared helpers
     ====================================================================== */

  function sel() { return S.select; }
  function act() { return S.actions; }
  function scope(root) { return RA.views._scope(root); }
  function mech() { return S.get().mechanic; }

  function firstName(name) { return String(name || '').split(' ')[0]; }

  /** Seconds an incoming SOS stays claimable before it expires (MECHIST: 120s). */
  var OFFER_SECONDS = 120;

  /* The platform's cut, shown on the job receipt so the payout maths adds up. */
  var COMMISSION_RATE = 0.15;

  function netOf(payout) { return payout * (1 - COMMISSION_RATE); }

  /** Countdown ring markup. r=24 → circumference 150.8. */
  function countdown(id, seconds) {
    var c = 2 * Math.PI * 24;
    return '<div class="countdown" data-countdown="' + U.escAttr(id) +
      '" data-seconds="' + OFFER_SECONDS + '" role="timer" aria-label="Time left to respond">' +
      '<svg class="countdown__svg" viewBox="0 0 54 54" aria-hidden="true">' +
        '<circle class="countdown__track" cx="27" cy="27" r="24" stroke-width="4"></circle>' +
        '<circle class="countdown__bar" cx="27" cy="27" r="24" stroke-width="4" ' +
          'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="0"></circle>' +
      '</svg>' +
      '<span class="countdown__n">' + seconds + '</span>' +
      '</div>';
  }

  /**
   * Drive every countdown ring inside `root`. When one hits zero the offer is
   * declined for the mechanic — the same "you snoozed, you lost it" behaviour
   * the app had, which also keeps the queue from growing forever.
   * Returns a cleanup function.
   */
  function runCountdowns(root, onExpire) {
    var rings = U.qsa('[data-countdown]', root);
    if (!rings.length) return function () {};
    var c = 2 * Math.PI * 24;
    var left = {};
    rings.forEach(function (ring) {
      left[ring.getAttribute('data-countdown')] = Number(ring.getAttribute('data-seconds')) || OFFER_SECONDS;
    });

    var timer = setInterval(function () {
      rings.forEach(function (ring) {
        var id = ring.getAttribute('data-countdown');
        if (left[id] === undefined) return;
        left[id] -= 1;
        var n = U.qs('.countdown__n', ring);
        var bar = U.qs('.countdown__bar', ring);
        if (left[id] <= 0) {
          delete left[id];
          if (n) n.textContent = '0';
          if (onExpire) onExpire(id);
          return;
        }
        if (n) n.textContent = String(left[id]);
        if (bar) bar.setAttribute('stroke-dashoffset', String(c * (1 - left[id] / OFFER_SECONDS)));
      });
    }, 1000);

    return function () { clearInterval(timer); };
  }

  /** One incoming SOS card. */
  function jobCard(j, i) {
    var svc = sel().service(j.serviceId) || {};
    return '<article class="job" data-job="' + U.escAttr(j.id) + '">' +
      '<div class="job__head">' +
        '<span class="row__icon" style="--tint:' + U.escAttr(svc.tint || 'var(--danger-15)') +
          ';--tone:' + U.escAttr(svc.tone || 'var(--danger)') + '">' + icon(svc.icon || 'warning', 19) + '</span>' +
        '<div>' +
          '<div class="job__title">' + esc(j.service) + '</div>' +
          '<div class="job__sub">' + esc(j.customer) + ' · ' + esc(j.vehicle) + '</div>' +
        '</div>' +
        '<span class="job__meta">' + countdown(j.id, OFFER_SECONDS) + '</span>' +
      '</div>' +

      ui.dl([
        ['Location', j.address],
        ['Distance', U.miles(j.distanceMi)],
        ['Your payout', U.money(netOf(j.payout)) + ' net'],
        j.note ? ['Customer note', j.note] : null
      ]) +

      '<div class="job__actions">' +
        ui.btn({ label: 'Accept job', icon: 'check', variant: 'success',
                 act: 'accept-job', data: { 'data-id': j.id } }) +
        ui.btn({ label: 'Decline', icon: 'close', variant: 'secondary',
                 act: 'decline-job', data: { 'data-id': j.id } }) +
      '</div>' +
      '</article>';
  }

  /** Duty banner + its switch. Shared by the dashboard and the profile. */
  function dutyBanner() {
    var on = mech().online;
    return '<div class="' + ui.cx('duty', on ? 'is-online' : '') + '">' +
      '<span class="row__icon" style="--tint:' + (on ? 'var(--success-15)' : 'var(--w08)') +
        ';--tone:' + (on ? 'var(--success)' : 'var(--text-3)') + '">' +
        icon(on ? 'radio' : 'eyeOff', 21) + '</span>' +
      '<div class="duty__body">' +
        '<div class="duty__state">' + (on ? 'You’re online' : 'You’re offline') + '</div>' +
        '<div class="duty__hint">' + (on
          ? 'Nearby SOS requests will be offered to you.'
          : 'You won’t receive new requests until you go back online.') + '</div>' +
      '</div>' +
      '<label class="switch" style="flex:none">' +
        '<input type="checkbox" data-act="duty"' + (on ? ' checked' : '') +
          ' aria-label="Available for jobs">' +
        '<span class="switch__track"></span>' +
      '</label>' +
      '</div>';
  }

  /** Progress stepper for the accepted job. */
  function jobSteps(job) {
    var order = ['en_route', 'arrived', 'completed'];
    var at = Math.max(0, order.indexOf(job.status));
    function state(i) { return i < at ? 'done' : (i === at ? 'current' : 'todo'); }
    return ui.steps([
      { title: 'Job accepted', sub: U.fmtTime(job.acceptedAt), state: 'done' },
      { title: 'Driving to customer', sub: U.miles(job.distanceMi) + ' · ' + job.address, state: state(0) },
      { title: 'On site', sub: job.arrivedAt ? U.fmtTime(job.arrivedAt) : 'Mark arrival when you get there', state: state(1) },
      { title: 'Job complete', sub: 'Payout released to your next statement', state: state(2) }
    ]);
  }

  /** Group today's jobs by service name — feeds the earnings donut. */
  function byService(jobs) {
    var TONES = ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--danger)', '#a78bfa'];
    var groups = U.groupBy(jobs, function (j) { return j.service; });
    return Object.keys(groups).map(function (name, i) {
      var total = U.sum(groups[name], function (j) { return j.payout; });
      return {
        label: name,
        value: total,
        display: U.money(total, false),
        color: TONES[i % TONES.length]
      };
    });
  }

  function weekBars() {
    return ui.bars(mech().week.map(function (d) {
      return { label: d.day, value: d.amount, display: U.money(d.amount, false) };
    }), { tone: 'var(--grad-primary)' });
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */

  RA.views.mDashboard = function () {
    var me = sel().me();
    var m = mech();
    var st = sel().mechStats();
    var job = sel().activeJob();

    var activeCard = job
      ? ui.card(
          '<div class="hstack gap-4 hwrap">' +
            '<div class="grow">' +
              ui.statusPill(job.status) +
              '<div class="fs-h2 fw-8 mt-3">' + esc(job.service) + '</div>' +
              '<div class="fs-sm t-2 mt-2">' + esc(job.customer) + ' · ' + esc(job.address) + '</div>' +
            '</div>' +
            '<div class="ta-c" style="flex:none">' +
              '<div class="fs-h1 fw-8">' + esc(U.money(netOf(job.payout), false)) + '</div>' +
              '<div class="fs-2xs t-2">your payout</div>' +
            '</div>' +
          '</div>' +
          '<div class="hstack gap-3 mt-5 hwrap">' +
            ui.btn({ label: 'Open active job', icon: 'route', nav: '/m/job' }) +
            ui.btn({ label: 'Call ' + firstName(job.customer), icon: 'phone', variant: 'secondary', act: 'call-customer' }) +
          '</div>', { variant: 'navy' })
      : '';

    var queue = m.incoming.length
      ? ui.section('Incoming requests',
          '<div class="stack stack-4">' + m.incoming.slice(0, 2).map(jobCard).join('') + '</div>',
          m.incoming.length > 2 ? 'See all ' + m.incoming.length : null, '/m/requests')
      : ui.section('Incoming requests', ui.card(
          '<div class="hstack gap-3 hwrap">' +
            '<span class="row__icon" style="--tint:var(--w08);--tone:var(--text-3)">' + icon('inbox', 19) + '</span>' +
            '<div class="grow"><div class="fw-6">' + (m.online ? 'Queue is clear' : 'You’re offline') + '</div>' +
              '<div class="fs-xs t-2">' + (m.online
                ? 'You’ll be notified the moment a nearby driver needs help.'
                : 'Go online above to start receiving requests.') + '</div></div>' +
            ui.btn({ label: 'Simulate an SOS', icon: 'zap', variant: 'secondary', size: 'sm', act: 'simulate' }) +
          '</div>', { variant: 'flat' }));

    var stats = '<div class="kpi">' +
      ui.stat({ label: 'Earned today', value: U.money(st.todayEarnings), icon: 'dollar',
                tint: 'var(--success-15)', tone: 'var(--success)', sub: U.money(st.avgPerJob) + ' per job', rise: 0 }) +
      ui.stat({ label: 'Jobs today', value: String(st.todayJobs), icon: 'wrench',
                tint: 'var(--primary-15)', tone: 'var(--primary)', sub: 'Completed call-outs', rise: 1 }) +
      ui.stat({ label: 'Avg rating', value: st.avgRating ? st.avgRating.toFixed(2) : '—', icon: 'star',
                tint: 'var(--warning-15)', tone: 'var(--warning)', sub: 'Across today’s jobs', rise: 2 }) +
      ui.stat({ label: 'This week', value: U.money(st.weekEarnings, false), icon: 'trend',
                tint: 'var(--accent-15)', tone: 'var(--accent)', nav: '/m/earnings',
                sub: st.weekJobs + ' jobs', rise: 3 }) +
      '</div>';

    var recent = m.jobsToday.length
      ? ui.rows(m.jobsToday.slice(0, 5).map(function (j, i) {
          return ui.row({
            icon: 'checkCircle', tint: 'var(--success-15)', tone: 'var(--success)',
            title: j.service, sub: j.customer + ' · ' + j.vehicle,
            amount: U.money(j.payout), time: U.fmtTime(j.at), rise: i
          });
        }))
      : ui.empty({ icon: 'history', title: 'No jobs completed yet today',
                   text: 'Accepted jobs appear here once you mark them complete.' });

    return {
      title: 'Dashboard',
      sub: me.shop || 'Mechanic portal',
      actions: ui.btn({ label: 'Simulate SOS', icon: 'zap', variant: 'secondary', size: 'sm', act: 'simulate' }),
      html:
        '<div class="stack stack-6">' +
          dutyBanner() +
          activeCard +
          stats +
          queue +
          ui.section('Earnings this week',
            ui.card(weekBars()), 'Full breakdown', '/m/earnings') +
          ui.section('Completed today', recent, 'History', '/m/earnings') +
        '</div>',

      mount: function (root) {
        bindDuty(root);
        bindQueue(root);
        var sc = scope(root);
        U.on(sc, 'click', '[data-act="call-customer"]', function () {
          var j = sel().activeJob();
          if (j) callCustomer(j.customer);
        });
        return runCountdowns(root, expireOffer);
      }
    };
  };

  /* ======================================================================
     Incoming requests
     ====================================================================== */

  RA.views.mRequests = function () {
    var m = mech();

    var body;
    if (!m.incoming.length) {
      body = ui.empty({
        icon: 'inbox',
        title: m.online ? 'No requests waiting' : 'You’re offline',
        text: m.online
          ? 'When a driver nearby presses SOS for a service you offer, the request lands here with a countdown.'
          : 'Go online to start receiving nearby SOS requests.',
        action: ui.btn({ label: 'Simulate an SOS', icon: 'zap', act: 'simulate' })
      });
    } else {
      body = '<div class="stack stack-4">' + m.incoming.map(jobCard).join('') + '</div>';
    }

    return {
      title: 'Incoming requests',
      sub: m.incoming.length
        ? m.incoming.length + ' waiting · respond within ' + OFFER_SECONDS + 's'
        : 'Nothing in the queue',
      back: '/m',
      actions: ui.btn({ label: 'Simulate SOS', icon: 'zap', variant: 'secondary', size: 'sm', act: 'simulate' }),
      html:
        '<div class="stack stack-5">' +
          dutyBanner() +
          (m.incoming.length && !m.online
            ? ui.card('<div class="hstack gap-3"><span class="t-warning">' + icon('warning', 19) + '</span>' +
                '<div class="fs-sm">You’re marked offline, so no <em>new</em> requests will arrive. ' +
                'The ones below are still claimable.</div></div>', { variant: 'flat' })
            : '') +
          body +
        '</div>',

      mount: function (root) {
        bindDuty(root);
        bindQueue(root);
        return runCountdowns(root, expireOffer);
      }
    };
  };

  /* ======================================================================
     Active job
     ====================================================================== */

  RA.views.mJob = function () {
    var job = sel().activeJob();

    if (!job) {
      return {
        title: 'Active job', back: '/m',
        html: ui.empty({
          icon: 'route',
          title: 'No job in progress',
          text: 'Accept a request and this page becomes your navigation, customer contact and completion checklist.',
          action: ui.btn({ label: 'View incoming requests', icon: 'inbox', nav: '/m/requests' })
        })
      };
    }

    var me = sel().me();
    var svc = sel().service(job.serviceId) || {};
    var customerPos = { lat: job.lat, lng: job.lng };
    var myPos = { lat: me.lat, lng: me.lng };
    var route = U.curvedPath(myPos, customerPos);
    var etaMin = U.etaMinutes(myPos, customerPos);
    var onSite = job.status === 'arrived';

    var sheet = '<div class="sheet"><div class="sheet__grab"></div>' +
      '<div class="sheet__head">' +
        '<span class="sheet__title truncate">' + esc(job.customer) + '</span>' +
        '<span class="sheet__eta">' + esc(onSite ? 'On site' : U.mins(etaMin)) + '</span>' +
      '</div>' +
      '<p class="sheet__sub">' + esc(job.address + ' · ' + U.miles(job.distanceMi) + ' away') + '</p>' +
      '<div class="hstack gap-3">' +
        ui.btn({ label: 'Call ' + firstName(job.customer), cls: 'grow', icon: 'phone', act: 'call-customer' }) +
        '<button type="button" class="squarebtn" data-act="open-maps" aria-label="Open in maps">' +
          icon('navigation', 18) + '</button>' +
      '</div>' +
      '</div>';

    var main =
      ui.card(
        '<div class="hstack gap-4 hwrap">' +
          '<div class="grow">' + ui.statusPill(job.status) +
            '<div class="fs-h2 fw-8 mt-3">' + esc(job.service) + '</div>' +
            '<div class="fs-sm t-2 mt-2">' + esc(job.vehicle) + '</div>' +
          '</div>' +
          '<div class="ta-c" style="flex:none">' +
            '<div class="fs-h1 fw-8">' + esc(onSite ? 'Here' : U.mins(etaMin)) + '</div>' +
            '<div class="fs-2xs t-2">' + (onSite ? 'you have arrived' : 'driving time') + '</div>' +
          '</div>' +
        '</div>', { variant: 'navy' }) +

      RA.map.shell('job-map', {
        size: 'panel', sheet: sheet,
        aria: 'Route to ' + job.customer,
        fallbackTitle: 'Navigation preview unavailable',
        fallbackText: 'Map tiles need a connection. The address and distance below are still accurate.'
      }) +

      ui.section('Job progress', ui.card(jobSteps(job))) +

      ui.section('Customer', ui.card(
        '<div class="hstack gap-4 hwrap">' +
          ui.avatar(job.customer) +
          '<div class="grow">' +
            '<div class="fw-7">' + esc(job.customer) + '</div>' +
            '<div class="fs-xs t-2">' + esc(job.vehicle) + '</div>' +
          '</div>' +
        '</div>' +
        (job.note ? '<p class="fs-sm t-2 mt-4">' + icon('message', 15) + ' ' + esc(job.note) + '</p>' : '') +
        '<div class="hstack gap-3 mt-4 hwrap">' +
          ui.btn({ label: 'Call ' + firstName(job.customer), icon: 'phone', variant: 'success', act: 'call-customer' }) +
          ui.btn({ label: 'Open in maps', icon: 'navigation', variant: 'secondary', act: 'open-maps' }) +
        '</div>'));

    var aside =
      '<div class="receipt">' +
        '<div class="fw-7 mb-3">Payout</div>' +
        '<div class="receipt__row"><span>' + esc(svc.name || job.service) + '</span><span class="push">' + esc(U.money(job.payout)) + '</span></div>' +
        '<div class="receipt__row t-2"><span>Platform commission (' + Math.round(COMMISSION_RATE * 100) + '%)</span>' +
          '<span class="push">−' + esc(U.money(job.payout * COMMISSION_RATE)) + '</span></div>' +
        '<div class="receipt__total"><span>You earn</span><span class="push">' + esc(U.money(netOf(job.payout))) + '</span></div>' +
      '</div>' +

      ui.card(ui.dl([
        ['Job ref', job.id],
        ['Service', job.service],
        ['Accepted', U.fmtTime(job.acceptedAt)],
        ['Distance', U.miles(job.distanceMi)],
        ['Address', job.address]
      ])) +

      '<div class="stack stack-3">' +
        (onSite
          ? ui.btn({ label: 'Mark job complete', icon: 'checkCircle', variant: 'success', block: true, act: 'complete-job', id: 'complete-btn' })
          : ui.btn({ label: 'I’ve arrived on site', icon: 'pin', block: true, act: 'arrive-job', id: 'arrive-btn' })) +
        ui.btn({ label: 'Report a problem', icon: 'warning', variant: 'secondary', block: true, act: 'report-job' }) +
      '</div>';

    return {
      title: 'Active job',
      sub: job.service + ' · ' + job.customer,
      back: '/m',
      html: '<div class="detail"><div class="stack stack-6">' + main + '</div>' +
            '<aside class="detail__aside stack stack-4">' + aside + '</aside></div>',

      mount: function (root) {
        var sc = scope(root);

        RA.map.mount('job-map', {
          center: myPos, zoom: 13, user: customerPos, userLabel: false,
          mechanics: [{
            id: 'me', name: me.name, shop: me.shop || 'You',
            lat: myPos.lat, lng: myPos.lng,
            etaMin: onSite ? 0 : etaMin, distanceMi: job.distanceMi, rating: me.rating
          }],
          route: route, selectedId: 'me'
        });

        U.on(sc, 'click', '[data-act="call-customer"]', function () { callCustomer(job.customer); });

        U.on(sc, 'click', '[data-act="open-maps"]', function () {
          var url = 'https://www.openstreetmap.org/?mlat=' + job.lat + '&mlon=' + job.lng + '#map=16/' + job.lat + '/' + job.lng;
          window.open(url, '_blank', 'noopener');
        });

        U.on(sc, 'click', '[data-act="arrive-job"]', function () {
          act().arriveAtJob();
          ui.toast('Marked as on site', 'success');
          RA.router.refresh();
        });

        U.on(sc, 'click', '[data-act="complete-job"]', function () {
          ui.confirmDanger({
            icon: 'checkCircle', tint: 'var(--success-15)', tone: 'var(--success)',
            variant: 'success',
            title: 'Complete this job?',
            text: 'This closes the call-out for ' + job.customer + ' and adds ' +
                  U.money(netOf(job.payout)) + ' to your statement.',
            confirm: 'Yes, complete it',
            onConfirm: function () {
              var done = act().completeJob();
              ui.toast('Job complete · ' + U.money(netOf(done.payout)) + ' earned', 'success');
              RA.router.go('/m/earnings');
            }
          });
        });

        U.on(sc, 'click', '[data-act="report-job"]', function () {
          ui.modal({
            icon: 'warning', title: 'Report a problem',
            text: 'Tell dispatch what went wrong. In the demo this is logged locally.',
            body: '<form>' + ui.field({
              label: 'What happened?', name: 'issue', type: 'textarea',
              placeholder: 'Customer not at the location, vehicle needs a heavier tow, …'
            }) + '</form>',
            confirm: 'Send to dispatch', cancel: 'Cancel',
            onConfirm: function (data) {
              if (!data || !String(data.issue || '').trim()) {
                ui.toast('Add a short description first', 'warning');
                return false;
              }
              act().pushNotification({
                title: 'Issue reported',
                body: 'Dispatch has been notified about ' + job.id + '.',
                icon: 'warning', tone: '#F59E0B', type: 'warning'
              });
              ui.toast('Dispatch notified', 'success');
            }
          });
        });
      }
    };
  };

  /* ======================================================================
     Earnings
     ====================================================================== */

  RA.views.mEarnings = function () {
    var m = mech();
    var st = sel().mechStats();
    var split = byService(m.jobsToday);
    var best = m.week.slice().sort(function (a, b) { return b.amount - a.amount; })[0];

    var stats = '<div class="kpi">' +
      ui.stat({ label: 'Today', value: U.money(st.todayEarnings), icon: 'dollar',
                tint: 'var(--success-15)', tone: 'var(--success)', sub: st.todayJobs + ' jobs', rise: 0 }) +
      ui.stat({ label: 'This week', value: U.money(st.weekEarnings), icon: 'trend',
                tint: 'var(--primary-15)', tone: 'var(--primary)', sub: st.weekJobs + ' jobs', rise: 1 }) +
      ui.stat({ label: 'Avg per job', value: U.money(st.avgPerJob), icon: 'gauge',
                tint: 'var(--accent-15)', tone: 'var(--accent)', sub: 'Today’s average', rise: 2 }) +
      ui.stat({ label: 'Best day', value: best ? best.day : '—', icon: 'star',
                tint: 'var(--warning-15)', tone: 'var(--warning)',
                sub: best ? U.money(best.amount) : '', rise: 3 }) +
      '</div>';

    var payoutRows = m.payouts.map(function (p) {
      return [
        '<span class="mono">' + esc(p.id) + '</span>',
        esc(p.period),
        '<span class="fw-6">' + esc(U.money(p.amount)) + '</span>',
        ui.statusPill(p.status),
        esc(p.method),
        esc(U.fmtDate(p.at))
      ];
    });

    var todayRows = m.jobsToday.map(function (j, i) {
      return ui.row({
        icon: 'checkCircle', tint: 'var(--success-15)', tone: 'var(--success)',
        title: j.service,
        sub: j.customer + ' · ' + j.vehicle + (j.rating ? ' · ' + j.rating.toFixed(1) + '★' : ''),
        amount: U.money(j.payout), time: U.fmtTime(j.at), rise: i
      });
    });

    return {
      title: 'Earnings',
      sub: 'Payouts, daily volume and today’s jobs',
      back: '/m',
      actions: ui.btn({ label: 'Print', icon: 'print', variant: 'secondary', size: 'sm', act: 'print' }),
      html:
        '<div class="stack stack-6">' +
          stats +

          ui.section('Daily earnings', ui.card(weekBars())) +

          '<div class="grid grid--2">' +
            ui.card('<div class="fw-7 mb-4">Revenue by service <span class="fs-xs t-3">(today)</span></div>' +
              (split.length
                ? ui.donut(split, { aria: 'Revenue by service type' })
                : '<p class="fs-sm t-2">No completed jobs today yet.</p>')) +

            ui.card('<div class="fw-7 mb-4">Week at a glance</div>' +
              ui.dl([
                ['Gross earnings', U.money(st.weekEarnings)],
                ['Commission (' + Math.round(COMMISSION_RATE * 100) + '%)', '−' + U.money(st.weekEarnings * COMMISSION_RATE)],
                ['Net to you', U.money(netOf(st.weekEarnings))],
                ['Jobs completed', String(st.weekJobs)],
                ['Average rating', st.avgRating ? st.avgRating.toFixed(2) + ' / 5' : '—']
              ]) +
              '<div class="mt-4">' + ui.meter(
                Math.min(100, (st.weekEarnings / 2200) * 100), 'var(--success)') +
                '<div class="fs-2xs t-3 mt-2">' + esc(U.money(st.weekEarnings, false)) +
                ' of a ' + esc(U.money(2200, false)) + ' weekly target</div></div>') +
          '</div>' +

          ui.section('Payout statements', ui.table(
            ['Statement', 'Period', 'Amount', 'Status', 'Method', 'Paid'],
            payoutRows, { wrapCols: [1, 4] })) +

          ui.section('Completed today',
            todayRows.length ? ui.rows(todayRows)
              : ui.empty({ icon: 'history', title: 'Nothing completed today yet' })) +
        '</div>',

      mount: function (root) {
        U.on(scope(root), 'click', '[data-act="print"]', function () { window.print(); });
      }
    };
  };

  /* ======================================================================
     Shop profile
     ====================================================================== */

  RA.views.mProfile = function () {
    var me = sel().me();
    var m = mech();
    var st = sel().mechStats();
    var card = sel().mechanic(me.id);
    var services = card ? card.services : [];
    var tags = card ? card.tags : [];

    var head = ui.card(
      '<div class="hstack gap-5 hwrap">' +
        ui.avatar(me.name, { size: 'xl', dot: m.online }) +
        '<div class="grow">' +
          '<div class="hstack gap-2">' +
            '<span class="fs-h2 fw-8">' + esc(me.name) + '</span>' +
            '<span class="t-primary" title="Verified">' + icon('verified', 18) + '</span>' +
          '</div>' +
          '<div class="fs-sm t-2">' + esc(me.shop || 'Independent mechanic') + '</div>' +
          '<div class="hstack gap-3 mt-3 hwrap">' + ui.rating(me.rating || 0) +
            '<span class="metachip">' + icon('wrench', 14) + esc(U.num(card ? card.jobs : 0) + ' jobs') + '</span>' +
            '<span class="metachip">' + icon('calendar', 14) + esc('Since ' + (me.memberSince || '—')) + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="flex:none">' + ui.btn({ label: 'Edit profile', icon: 'edit', variant: 'secondary', size: 'sm', act: 'edit-profile' }) + '</div>' +
      '</div>');

    return {
      title: 'Shop profile',
      sub: me.shop || 'Mechanic portal',
      back: '/m',
      html:
        '<div class="stack stack-6">' +
          head +
          dutyBanner() +

          '<div class="kpi">' +
            ui.stat({ label: 'Lifetime jobs', value: U.num(card ? card.jobs : 0), icon: 'wrench',
                      tint: 'var(--primary-15)', tone: 'var(--primary)', rise: 0 }) +
            ui.stat({ label: 'Rating', value: (me.rating || 0).toFixed(1), icon: 'star',
                      tint: 'var(--warning-15)', tone: 'var(--warning)',
                      sub: card ? card.reviews + ' reviews' : '', rise: 1 }) +
            ui.stat({ label: 'Avg response', value: card ? U.mins(card.responseMin) : '—', icon: 'timer',
                      tint: 'var(--accent-15)', tone: 'var(--accent)', rise: 2 }) +
            ui.stat({ label: 'Earned this week', value: U.money(st.weekEarnings, false), icon: 'dollar',
                      tint: 'var(--success-15)', tone: 'var(--success)', nav: '/m/earnings', rise: 3 }) +
          '</div>' +

          ui.section('Business details', ui.card(ui.dl([
            ['Contact name', me.name],
            ['Shop', me.shop || '—'],
            ['Licence', me.license || '—'],
            ['Email', me.email],
            ['Phone', me.phone],
            ['Base', me.address],
            ['Member since', me.memberSince || '—']
          ]))) +

          ui.section('Services you offer', ui.card(
            (services.length
              ? '<div class="grid grid--services">' + services.map(function (id, i) {
                  var s = sel().service(id);
                  return s ? ui.svcTile(s, { rise: i, hidePrice: false, act: 'noop' }) : '';
                }).join('') + '</div>'
              : '<p class="fs-sm t-2">No services listed.</p>') +
            (tags.length ? '<div class="mt-4">' + ui.chips(tags) + '</div>' : ''))) +

          ui.section('Account', ui.rows([
            ui.row({ icon: 'dollar', title: 'Earnings and payouts', sub: 'Statements and daily volume', chev: true, nav: '/m/earnings' }),
            ui.row({ icon: 'inbox', title: 'Incoming requests', sub: st.pending + ' waiting', chev: true, nav: '/m/requests' }),
            ui.row({ icon: 'bell', title: 'Notifications', sub: 'Alerts and job updates', chev: true, nav: '/notifications' }),
            ui.row({ icon: 'settings', title: 'Settings', sub: 'Preferences and demo controls', chev: true, nav: '/settings' })
          ])) +

          ui.card('<div class="hstack gap-3 hwrap">' +
            '<div class="grow"><div class="fw-6">Sign out</div>' +
            '<div class="fs-xs t-2">You’ll return to the public site.</div></div>' +
            ui.btn({ label: 'Sign out', icon: 'logout', variant: 'danger', act: 'sign-out' }) +
            '</div>', { variant: 'flat' }) +
        '</div>',

      mount: function (root) {
        var sc = scope(root);
        bindDuty(root);

        U.on(sc, 'click', '[data-act="edit-profile"]', function () {
          ui.modal({
            icon: 'edit', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: 'Edit shop profile', wide: true,
            body: '<form>' +
              ui.field({ label: 'Contact name', name: 'name', value: me.name, icon: 'person' }) +
              ui.field({ label: 'Shop name', name: 'shop', value: me.shop || '', icon: 'building' }) +
              ui.field({ label: 'Email', name: 'email', type: 'email', value: me.email, icon: 'mail' }) +
              ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: me.phone, icon: 'phone' }) +
              ui.field({ label: 'Base location', name: 'address', value: me.address, icon: 'pin' }) +
              '</form>',
            confirm: 'Save changes', cancel: 'Cancel',
            onConfirm: function (data) {
              if (!data.name || !data.name.trim()) { ui.toast('Name cannot be empty', 'warning'); return false; }
              act().updateProfile({
                name: data.name.trim(), shop: data.shop.trim(),
                email: data.email.trim(), phone: data.phone.trim(),
                address: data.address.trim()
              });
              ui.toast('Profile updated', 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="sign-out"]', function () {
          ui.confirmDanger({
            icon: 'logout', title: 'Sign out?',
            text: 'Your demo data stays saved in this browser.',
            confirm: 'Sign out',
            onConfirm: function () {
              act().signOut().then(function () {
                ui.toast('Signed out', 'info');
                RA.router.go('/');
              });
            }
          });
        });
      }
    };
  };

  /* ======================================================================
     Shared bindings
     ====================================================================== */

  function callCustomer(name) {
    ui.modal({
      icon: 'phone', tint: 'var(--success-15)', tone: 'var(--success)',
      title: 'Call ' + name,
      text: 'Customer numbers are masked in the demo. On a real deployment this ' +
            'opens a relayed line so neither side sees the other’s number.',
      cancel: 'Close'
    });
  }

  /** Duty switch — used by the dashboard, requests list and profile. */
  function bindDuty(root) {
    U.on(scope(root), 'change', '[data-act="duty"]', function (e, node) {
      act().setMechanicOnline(node.checked);
      ui.toast(node.checked ? 'You’re online — requests will come through' : 'You’re offline', node.checked ? 'success' : 'info');
      RA.router.refresh();
    });
  }

  /** Accept / decline / simulate — shared by the dashboard and requests list. */
  function bindQueue(root) {
    var sc = scope(root);

    U.on(sc, 'click', '[data-act="accept-job"]', function (e, node) {
      var id = node.getAttribute('data-id');
      if (sel().activeJob()) {
        ui.toast('Finish your current job before accepting another', 'warning');
        return;
      }
      var res = act().acceptJob(id);
      var job = (res && res.job) || res;
      if (!res || res.ok === false || !job || job.code === 'alreadyTaken') {
        var code = (res && res.code) || 'alreadyTaken';
        ui.toast(code === 'expired' ? 'That offer expired — re-offered to the next mechanic' : 'That request is no longer available', 'warning');
        RA.router.refresh();
        return;
      }
      ui.toast('Job accepted — ' + (job.customer || 'customer') + ' has been notified', 'success');
      RA.router.go('/m/job');
    });

    U.on(sc, 'click', '[data-act="decline-job"]', function (e, node) {
      var id = node.getAttribute('data-id');
      act().declineJob(id);
      ui.toast('Request declined', 'info');
      RA.router.refresh();
    });

    U.on(sc, 'click', '[data-act="simulate"]', function () {
      var j = act().injectIncoming();
      ui.toast('New SOS from ' + j.customer, 'warning');
      RA.router.refresh();
    });
  }

  /** A countdown ran out — expire with rematch (not a silent decline). */
  function expireOffer(jobId) {
    if (!mech().incoming.filter(function (j) { return j.id === jobId; }).length) return;
    act().expireOffer(jobId);
    ui.toast('A request expired — re-offered to the next mechanic', 'info');
    RA.router.refresh();
  }
})(window);
