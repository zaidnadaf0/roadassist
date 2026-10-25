/* ==========================================================================
   RoadAssist Web — Admin portal
   aDashboard · aDispatch · aApprovals · aMechanics · aAnalytics · aReports · aLogs

   Mirrors the Flutter admin screens (admin_dashboard_screen,
   mechanic_approval_screen, analytics_screen, reports_screen).

   Filtering on the list pages is done locally by toggling node.hidden rather
   than re-running the router. That keeps search-box focus and scroll position,
   which a full repaint would throw away.
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
  function admin() { return S.get().admin; }

  var LEVEL_TONE = {
    info:    { tint: 'var(--primary-15)', tone: 'var(--primary)', icon: 'info',    pill: 'primary' },
    warning: { tint: 'var(--warning-15)', tone: 'var(--warning)', icon: 'warning', pill: 'warning' },
    error:   { tint: 'var(--danger-15)',  tone: 'var(--danger)',  icon: 'xCircle', pill: 'danger' }
  };

  function levelOf(level) { return LEVEL_TONE[level] || LEVEL_TONE.info; }

  /** Mechanic names available to take over a dispatch. */
  function rosterOptions() {
    return sel().onlineMechanics().map(function (m) {
      return { value: m.name, label: m.name + ' — ' + m.shop };
    });
  }

  /**
   * Wire a search box + chip filter over a list of nodes.
   * `match(node, term, filter)` decides visibility. Keeps focus by never
   * re-rendering: it only flips `hidden`.
   */
  function bindLocalFilter(root, o) {
    var sc = scope(root);
    var box = U.qs(o.searchSel, sc);
    var countNode = o.countSel ? U.qs(o.countSel, sc) : null;
    var state = { term: '', filter: o.initialFilter || 'all' };

    function apply() {
      var shown = 0;
      U.qsa(o.itemSel, sc).forEach(function (node) {
        var ok = o.match(node, state.term.toLowerCase(), state.filter);
        node.hidden = !ok;
        if (ok) shown++;
      });
      if (countNode) countNode.textContent = o.countText ? o.countText(shown) : String(shown);
      var none = U.qs(o.emptySel, sc);
      if (none) none.hidden = shown !== 0;
    }

    if (box) {
      box.addEventListener('input', U.debounce(function () {
        state.term = box.value || '';
        apply();
      }, 120));
    }

    U.on(sc, 'click', '[data-act="' + (o.filterAct || 'filter') + '"]', function (e, node) {
      U.qsa('[data-act="' + (o.filterAct || 'filter') + '"]', sc).forEach(function (b) {
        b.classList.remove('is-active');
      });
      node.classList.add('is-active');
      state.filter = node.getAttribute('data-value');
      apply();
    });

    apply();
    return apply;
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */

  RA.views.aDashboard = function () {
    var a = admin();
    var st = sel().adminStats();
    var open = a.dispatches.filter(function (d) { return d.status !== 'completed'; });
    var recentLogs = a.logs.slice(0, 5);

    var kpis = '<div class="kpi">' +
      ui.stat({ label: 'Open dispatches', value: String(st.openDispatches), icon: 'radio',
                tint: 'var(--danger-15)', tone: 'var(--danger)', nav: '/admin/dispatch',
                sub: st.searching + ' still unmatched', rise: 0 }) +
      ui.stat({ label: 'Active mechanics', value: U.num(st.activeMechanics), icon: 'users',
                tint: 'var(--success-15)', tone: 'var(--success)', nav: '/admin/mechanics',
                sub: sel().onlineMechanics().length + ' online now', rise: 1 }) +
      ui.stat({ label: 'Pending approvals', value: String(st.pendingApprovals), icon: 'idcard',
                tint: 'var(--warning-15)', tone: 'var(--warning)', nav: '/admin/approvals',
                sub: 'Awaiting verification', rise: 2 }) +
      ui.stat({ label: 'Revenue this month', value: U.money(st.monthRevenue, false), icon: 'dollar',
                tint: 'var(--primary-15)', tone: 'var(--primary)', nav: '/admin/analytics',
                sub: U.num(st.monthRescues) + ' rescues', rise: 3 }) +
      '</div>';

    var health = ui.card(
      '<div class="fw-7 mb-4">Platform health</div>' +
      '<div class="stack stack-4">' +
        '<div>' +
          '<div class="hstack gap-3 fs-sm mb-2"><span class="grow">Completion rate</span>' +
            '<span class="fw-7">' + esc(st.completionRate.toFixed(1)) + '%</span></div>' +
          ui.meter(st.completionRate, 'var(--success)') +
        '</div>' +
        '<div>' +
          '<div class="hstack gap-3 fs-sm mb-2"><span class="grow">Avg response time</span>' +
            '<span class="fw-7">' + esc(U.mins(st.avgResponseMin)) + '</span></div>' +
          ui.meter(Math.max(0, 100 - (st.avgResponseMin / 30) * 100), 'var(--primary)') +
        '</div>' +
        '<div>' +
          '<div class="hstack gap-3 fs-sm mb-2"><span class="grow">Mechanics online</span>' +
            '<span class="fw-7">' + sel().onlineMechanics().length + ' / ' + S.get().mechanics.length + '</span></div>' +
          ui.meter((sel().onlineMechanics().length / Math.max(1, S.get().mechanics.length)) * 100, 'var(--accent)') +
        '</div>' +
      '</div>');

    var totals = ui.card(
      '<div class="fw-7 mb-4">All time</div>' +
      ui.dl([
        ['Registered users', U.num(st.totalUsers)],
        ['Total rescues', U.num(st.totalRescues)],
        ['Gross revenue', U.money(st.revenueTotal)],
        ['Active mechanics', U.num(st.activeMechanics)],
        ['Avg response', U.mins(st.avgResponseMin)]
      ]));

    var openRows = open.length
      ? ui.rows(open.slice(0, 5).map(function (d, i) {
          var svc = sel().service(d.serviceId) || {};
          return ui.row({
            icon: svc.icon || 'wrench', tint: svc.tint, tone: svc.tone,
            title: d.ref + ' · ' + (svc.name || d.serviceId),
            badge: ' ' + ui.statusPill(d.status),
            sub: d.customer + ' · ' + d.address + (d.mechanic ? ' · ' + d.mechanic : ' · unassigned'),
            amount: U.money(d.amount, false),
            time: d.etaMin ? U.mins(d.etaMin) : '—',
            chev: true, nav: '/admin/dispatch', rise: i
          });
        }))
      : ui.empty({ icon: 'checkCircle', title: 'No open dispatches', text: 'Every call-out is closed.' });

    return {
      title: 'Control room',
      sub: 'Live operations overview',
      html:
        '<div class="stack stack-6">' +
          kpis +

          (st.searching
            ? ui.card('<div class="hstack gap-3 hwrap">' +
                '<span class="row__icon" style="--tint:var(--danger-15);--tone:var(--danger)">' + icon('warning', 19) + '</span>' +
                '<div class="grow"><div class="fw-6">' + st.searching + ' ' +
                  U.pluralize(st.searching, 'request', 'requests') + ' still unmatched</div>' +
                  '<div class="fs-xs t-2">No mechanic has accepted yet — assign one manually.</div></div>' +
                ui.btn({ label: 'Open dispatch board', icon: 'radio', size: 'sm', nav: '/admin/dispatch' }) +
                '</div>', { variant: 'flat' })
            : '') +

          '<div class="grid grid--2">' + health + totals + '</div>' +

          ui.section('Monthly volume',
            ui.card(ui.bars(a.monthly.map(function (m) {
              return { label: m.m, value: m.rescues, display: U.num(m.rescues) };
            }))), 'Full analytics', '/admin/analytics') +

          ui.section('Open dispatches', openRows, 'Dispatch board', '/admin/dispatch') +

          ui.section('Recent system activity',
            ui.rows(recentLogs.map(function (l, i) {
              var lv = levelOf(l.level);
              return ui.row({
                icon: lv.icon, tint: lv.tint, tone: lv.tone,
                title: l.message, sub: l.source, time: U.relTime(l.at), rise: i
              });
            })), 'All logs', '/admin/logs') +
        '</div>'
    };
  };

  /* ======================================================================
     Live dispatch board
     ====================================================================== */

  RA.views.aDispatch = function () {
    var a = admin();
    var FILTERS = [
      { value: 'all', label: 'All' },
      { value: 'searching', label: 'Unmatched' },
      { value: 'active', label: 'In progress' },
      { value: 'completed', label: 'Completed' }
    ];

    var rows = a.dispatches.map(function (d) {
      var svc = sel().service(d.serviceId) || {};
      var actions = d.status === 'completed'
        ? '<span class="fs-2xs t-3">closed</span>'
        : ui.btn({ label: d.mechanic ? 'Reassign' : 'Assign', size: 'sm',
                   variant: d.mechanic ? 'secondary' : '', act: 'assign',
                   data: { 'data-id': d.id } }) +
          ' ' + ui.btn({ label: 'Close', size: 'sm', variant: 'ghost',
                         act: 'close-dispatch', data: { 'data-id': d.id } });

      return {
        data: {
          'data-dispatch': d.id,
          'data-status': d.status,
          'data-search': (d.ref + ' ' + d.customer + ' ' + d.address + ' ' +
                          (d.mechanic || 'unassigned') + ' ' + (svc.name || '')).toLowerCase()
        },
        cells: [
          '<span class="mono">' + esc(d.ref) + '</span>',
          esc(d.customer),
          esc(svc.name || d.serviceId),
          d.mechanic ? esc(d.mechanic) : '<span class="t-warning">Unassigned</span>',
          ui.statusPill(d.status),
          d.etaMin ? esc(U.mins(d.etaMin)) : '—',
          esc(U.money(d.amount, false)),
          esc(U.relTime(d.startedAt)),
          '<span class="hstack gap-2">' + actions + '</span>'
        ]
      };
    });

    return {
      title: 'Live dispatch',
      sub: a.dispatches.length + ' call-outs on the board',
      back: '/admin',
      html:
        '<div class="stack stack-5">' +
          '<div class="toolbar">' +
            ui.search({ name: 'q', placeholder: 'Search ref, customer, mechanic, address…' }) +
            ui.chipRow(FILTERS, 'all', 'filter') +
          '</div>' +
          '<p class="fs-xs t-2" aria-live="polite"><span id="dsp-count">' +
            a.dispatches.length + '</span> shown</p>' +

          ui.table(
            ['Ref', 'Customer', 'Service', 'Mechanic', 'Status', 'ETA', 'Amount', 'Started', ''],
            rows, { wrapCols: [1, 3] }) +

          '<div id="dsp-empty" hidden>' + ui.empty({
            icon: 'search', title: 'No dispatches match',
            text: 'Try a different search term or filter.'
          }) + '</div>' +
        '</div>',

      mount: function (root) {
        var sc = scope(root);

        bindLocalFilter(root, {
          searchSel: '.search__input',
          itemSel: '[data-dispatch]',
          countSel: '#dsp-count',
          emptySel: '#dsp-empty',
          match: function (node, term, filter) {
            var status = node.getAttribute('data-status');
            var okFilter =
              filter === 'all' ? true :
              filter === 'active' ? (status !== 'completed' && status !== 'searching') :
              status === filter;
            var okTerm = !term || node.getAttribute('data-search').indexOf(term) > -1;
            return okFilter && okTerm;
          }
        });

        U.on(sc, 'click', '[data-act="assign"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var d = admin().dispatches.filter(function (x) { return x.id === id; })[0];
          if (!d) return;
          var opts = rosterOptions();
          if (!opts.length) { ui.toast('No mechanics are online to assign', 'warning'); return; }

          ui.modal({
            icon: 'users', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: 'Assign ' + d.ref,
            text: d.customer + ' · ' + d.address,
            body: '<form>' + ui.field({
              label: 'Send to mechanic', name: 'mechanic', type: 'select',
              options: opts, value: d.mechanic || opts[0].value
            }) + '</form>',
            confirm: 'Dispatch', cancel: 'Cancel',
            onConfirm: function (data) {
              var res = act().reassignDispatch(id, data.mechanic);
              ui.toast(res.ref + ' assigned to ' + data.mechanic, 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="close-dispatch"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var d = admin().dispatches.filter(function (x) { return x.id === id; })[0];
          if (!d) return;
          ui.confirmDanger({
            title: 'Close ' + d.ref + '?',
            text: 'This marks the call-out complete for ' + d.customer + '.',
            confirm: 'Close it',
            onConfirm: function () {
              act().closeDispatch(id);
              ui.toast(d.ref + ' closed', 'success');
              RA.router.refresh();
            }
          });
        });
      }
    };
  };

  /* ======================================================================
     Verification queue
     ====================================================================== */

  RA.views.aApprovals = function () {
    var a = admin();

    function applicantCard(p, i) {
      return ui.card(
        '<div class="hstack gap-4 hwrap">' +
          ui.avatar(p.name, { size: 'lg' }) +
          '<div class="grow">' +
            '<div class="fs-h3 fw-7">' + esc(p.name) + '</div>' +
            '<div class="fs-xs t-2">' + esc(p.shop) + ' · ' + esc(p.city) + '</div>' +
          '</div>' +
          '<div class="ta-c" style="flex:none">' +
            '<div class="fs-2xs t-3">applied</div>' +
            '<div class="fs-sm fw-6">' + esc(U.relTime(p.appliedAt)) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4">' + ui.dl([
          ['Licence', p.license],
          ['Experience', p.experience],
          ['Services', p.services.map(function (s) {
            return (sel().service(s) || {}).name || s;
          }).join(', ')]
        ]) + '</div>' +

        '<div class="mt-4"><div class="fs-2xs t-3 mb-2">DOCUMENTS SUBMITTED</div>' +
          ui.chips(p.docs) + '</div>' +

        '<div class="hstack gap-3 mt-5 hwrap">' +
          ui.btn({ label: 'Approve', icon: 'check', variant: 'success',
                   act: 'approve', data: { 'data-id': p.id } }) +
          ui.btn({ label: 'Reject', icon: 'close', variant: 'secondary',
                   act: 'reject', data: { 'data-id': p.id } }) +
          ui.btn({ label: 'View documents', icon: 'file', variant: 'ghost',
                   act: 'docs', data: { 'data-id': p.id } }) +
        '</div>',
        { rise: i });
    }

    var queue = a.pending.length
      ? '<div class="grid grid--wide">' + a.pending.map(applicantCard).join('') + '</div>'
      : ui.empty({
          icon: 'checkCircle',
          title: 'Verification queue is clear',
          text: 'Every application has been reviewed. New ones appear here automatically.'
        });

    var decisions = a.decisions.length
      ? ui.rows(a.decisions.map(function (d, i) {
          var ok = d.decision === 'approved';
          return ui.row({
            icon: ok ? 'checkCircle' : 'xCircle',
            tint: ok ? 'var(--success-15)' : 'var(--danger-15)',
            tone: ok ? 'var(--success)' : 'var(--danger)',
            title: d.name + ' — ' + U.titleCase(d.decision),
            sub: d.shop + ' · ' + d.license + (d.reason ? ' · ' + d.reason : ''),
            time: U.relTime(d.at), rise: i
          });
        }))
      : ui.card('<p class="fs-sm t-2">No decisions recorded in this session yet.</p>', { variant: 'flat' });

    return {
      title: 'Verification queue',
      sub: a.pending.length + ' ' + U.pluralize(a.pending.length, 'application', 'applications') + ' awaiting review',
      back: '/admin',
      html:
        '<div class="stack stack-6">' +
          '<div class="kpi">' +
            ui.stat({ label: 'Awaiting review', value: String(a.pending.length), icon: 'idcard',
                      tint: 'var(--warning-15)', tone: 'var(--warning)', rise: 0 }) +
            ui.stat({ label: 'Approved', value: String(a.decisions.filter(function (d) { return d.decision === 'approved'; }).length),
                      icon: 'checkCircle', tint: 'var(--success-15)', tone: 'var(--success)', rise: 1 }) +
            ui.stat({ label: 'Rejected', value: String(a.decisions.filter(function (d) { return d.decision === 'rejected'; }).length),
                      icon: 'xCircle', tint: 'var(--danger-15)', tone: 'var(--danger)', rise: 2 }) +
            ui.stat({ label: 'Active roster', value: U.num(S.get().mechanics.length), icon: 'users',
                      tint: 'var(--primary-15)', tone: 'var(--primary)', nav: '/admin/mechanics', rise: 3 }) +
          '</div>' +

          ui.section('Applications', queue) +
          ui.section('Decision log', decisions) +
        '</div>',

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="approve"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var p = admin().pending.filter(function (x) { return x.id === id; })[0];
          if (!p) return;
          ui.modal({
            icon: 'verified', tint: 'var(--success-15)', tone: 'var(--success)',
            title: 'Approve ' + p.name + '?',
            text: 'They are added to the live roster immediately and can start accepting jobs.',
            confirm: 'Approve', cancel: 'Cancel', variant: 'success',
            onConfirm: function () {
              act().approveMechanic(id);
              ui.toast(p.name + ' approved and added to the roster', 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="reject"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var p = admin().pending.filter(function (x) { return x.id === id; })[0];
          if (!p) return;
          ui.confirmDanger({
            title: 'Reject ' + p.name + '?',
            text: 'Give a reason so the applicant knows what to fix.',
            body: '<form>' + ui.field({
              label: 'Reason', name: 'reason', type: 'select',
              options: ['Documents incomplete', 'Licence could not be verified',
                        'Insurance expired', 'Outside our service area',
                        'Failed background check']
            }) + '</form>',
            confirm: 'Reject application',
            onConfirm: function (data) {
              act().rejectMechanic(id, data.reason);
              ui.toast(p.name + ' rejected', 'info');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="docs"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var p = admin().pending.filter(function (x) { return x.id === id; })[0];
          if (!p) return;
          ui.modal({
            icon: 'file', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: p.name + ' — documents',
            text: 'Uploaded files are not part of the demo dataset, so these are placeholders.',
            body: ui.rows(p.docs.map(function (d) {
              return ui.row({
                icon: 'pdf', tint: 'var(--danger-15)', tone: 'var(--danger)',
                title: d, sub: 'PDF · verified checksum', end: '<span class="t-success">' + icon('check', 18) + '</span>'
              });
            })),
            cancel: 'Close'
          });
        });
      }
    };
  };

  /* ======================================================================
     Mechanic roster
     ====================================================================== */

  RA.views.aMechanics = function () {
    var list = S.get().mechanics;
    var FILTERS = [
      { value: 'all', label: 'All' },
      { value: 'online', label: 'Online' },
      { value: 'offline', label: 'Offline' }
    ];

    var rows = list.map(function (m) {
      return {
        data: {
          'data-mech': m.id,
          'data-online': m.online ? 'online' : 'offline',
          'data-search': (m.name + ' ' + m.shop + ' ' + m.specialty).toLowerCase()
        },
        cells: [
          '<span class="hstack gap-3">' + ui.avatar(m.name, { size: 'sm', dot: m.online }) +
            '<span><span class="fw-6">' + esc(m.name) + '</span>' +
            '<span class="fs-2xs t-3" style="display:block">' + esc(m.shop) + '</span></span></span>',
          esc(m.specialty),
          ui.pill(m.online ? 'Online' : 'Offline', m.online ? 'success' : 'default', m.online),
          ui.rating(m.rating),
          U.num(m.jobs),
          esc(U.mins(m.responseMin)),
          esc(String(m.since)),
          /* Deliberately a modal, not a link to /mechanic/:id — that route is
             customer-scoped, so navigating there would flip the admin's
             persona via the router's role guard. */
          ui.btn({ label: 'Details', size: 'sm', variant: 'secondary',
                   act: 'mech-detail', data: { 'data-id': m.id } })
        ]
      };
    });

    var online = list.filter(function (m) { return m.online; }).length;
    var avg = list.length ? U.sum(list, function (m) { return m.rating; }) / list.length : 0;

    return {
      title: 'Mechanics',
      sub: list.length + ' on the roster · ' + online + ' online',
      back: '/admin',
      html:
        '<div class="stack stack-5">' +
          '<div class="kpi">' +
            ui.stat({ label: 'On roster', value: U.num(list.length), icon: 'users',
                      tint: 'var(--primary-15)', tone: 'var(--primary)', rise: 0 }) +
            ui.stat({ label: 'Online now', value: String(online), icon: 'radio',
                      tint: 'var(--success-15)', tone: 'var(--success)', rise: 1 }) +
            ui.stat({ label: 'Avg rating', value: avg.toFixed(2), icon: 'star',
                      tint: 'var(--warning-15)', tone: 'var(--warning)', rise: 2 }) +
            ui.stat({ label: 'Total jobs', value: U.num(U.sum(list, function (m) { return m.jobs; })),
                      icon: 'wrench', tint: 'var(--accent-15)', tone: 'var(--accent)', rise: 3 }) +
          '</div>' +

          '<div class="toolbar">' +
            ui.search({ name: 'q', placeholder: 'Search name, shop or specialty…' }) +
            ui.chipRow(FILTERS, 'all', 'filter') +
          '</div>' +
          '<p class="fs-xs t-2" aria-live="polite"><span id="mech-count">' +
            list.length + '</span> shown</p>' +

          ui.table(
            ['Mechanic', 'Specialty', 'Status', 'Rating', 'Jobs', 'Response', 'Since', ''],
            rows, { wrapCols: [1] }) +

          '<div id="mech-empty" hidden>' + ui.empty({
            icon: 'search', title: 'No mechanics match', text: 'Try a different search or filter.'
          }) + '</div>' +
        '</div>',

      mount: function (root) {
        bindLocalFilter(root, {
          searchSel: '.search__input',
          itemSel: '[data-mech]',
          countSel: '#mech-count',
          emptySel: '#mech-empty',
          match: function (node, term, filter) {
            var okFilter = filter === 'all' || node.getAttribute('data-online') === filter;
            var okTerm = !term || node.getAttribute('data-search').indexOf(term) > -1;
            return okFilter && okTerm;
          }
        });

        U.on(scope(root), 'click', '[data-act="mech-detail"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var m = S.get().mechanics.filter(function (x) { return x.id === id; })[0];
          if (!m) return;
          ui.modal({
            icon: m.verified ? 'verified' : 'users',
            tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: m.name,
            text: m.shop + ' · ' + m.specialty,
            wide: true,
            body:
              ui.dl([
                ['Status', m.online ? 'Online' : 'Offline'],
                ['Rating', m.rating.toFixed(1) + ' from ' + U.num(m.reviews) + ' reviews'],
                ['Jobs completed', U.num(m.jobs)],
                ['Avg response', U.mins(m.responseMin)],
                ['On platform since', String(m.since)],
                ['Phone', m.phone],
                ['Verified', m.verified ? 'Yes' : 'Not verified']
              ]) +
              '<div class="mt-4"><div class="fs-2xs t-3 mb-2">CAPABILITIES</div>' +
                ui.chips(m.tags) + '</div>' +
              '<p class="fs-sm t-2 mt-4">' + esc(m.bio) + '</p>',
            cancel: 'Close'
          });
        });
      }
    };
  };

  /* ======================================================================
     Analytics
     ====================================================================== */

  RA.views.aAnalytics = function () {
    var a = admin();
    var st = sel().adminStats();
    var months = a.monthly;
    var last = months[months.length - 1];
    var prev = months[months.length - 2] || last;

    var revDelta = prev.revenue ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : 0;
    var resDelta = prev.rescues ? ((last.rescues - prev.rescues) / prev.rescues) * 100 : 0;

    /* Service mix across the whole request history + live dispatches. */
    var TONES = ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--danger)', '#a78bfa'];
    var mix = (function () {
      var counts = U.groupBy(a.dispatches, function (d) { return d.serviceId; });
      return Object.keys(counts).map(function (id, i) {
        var s = sel().service(id) || { name: id };
        return { label: s.name, value: counts[id].length, display: String(counts[id].length), color: TONES[i % TONES.length] };
      });
    })();

    function delta(v) {
      return { delta: (v >= 0 ? '+' : '') + v.toFixed(1) + '%', deltaDir: v >= 0 ? 'up' : 'down' };
    }

    return {
      title: 'Analytics',
      sub: 'Volume, revenue and response performance',
      back: '/admin',
      actions: ui.btn({ label: 'Print', icon: 'print', variant: 'secondary', size: 'sm', act: 'print' }),
      html:
        '<div class="stack stack-6">' +
          '<div class="kpi">' +
            ui.stat(Object.assign({ label: 'Revenue (' + last.m + ')', value: U.money(last.revenue, false),
                      icon: 'dollar', tint: 'var(--success-15)', tone: 'var(--success)', rise: 0 }, delta(revDelta))) +
            ui.stat(Object.assign({ label: 'Rescues (' + last.m + ')', value: U.num(last.rescues),
                      icon: 'activity', tint: 'var(--primary-15)', tone: 'var(--primary)', rise: 1 }, delta(resDelta))) +
            ui.stat({ label: 'Completion rate', value: st.completionRate.toFixed(1) + '%', icon: 'checkCircle',
                      tint: 'var(--accent-15)', tone: 'var(--accent)', sub: 'Rolling 12 months', rise: 2 }) +
            ui.stat({ label: 'Avg response', value: U.mins(st.avgResponseMin), icon: 'timer',
                      tint: 'var(--warning-15)', tone: 'var(--warning)', sub: 'Dispatch to arrival', rise: 3 }) +
          '</div>' +

          ui.section('Revenue by month', ui.card(
            ui.bars(months.map(function (m) {
              return { label: m.m, value: m.revenue, display: U.money(m.revenue, false) };
            })) +
            '<div class="divider"></div>' +
            '<div class="hstack gap-4 hwrap fs-xs t-2">' +
              '<span>Total ' + esc(U.money(U.sum(months, function (m) { return m.revenue; }))) + '</span>' +
              '<span>Best ' + esc(months.slice().sort(function (x, y) { return y.revenue - x.revenue; })[0].m) + '</span>' +
              '<span>Avg ' + esc(U.money(U.sum(months, function (m) { return m.revenue; }) / months.length, false)) + '</span>' +
            '</div>')) +

          '<div class="grid grid--2">' +
            ui.card('<div class="fw-7 mb-4">Rescue volume trend</div>' +
              ui.sparkline(months.map(function (m) { return m.rescues; }), { fill: true }) +
              '<div class="hstack gap-3 mt-3 fs-2xs t-3">' +
                '<span>' + esc(months[0].m) + '</span>' +
                '<span class="push">' + esc(last.m) + '</span>' +
              '</div>') +

            ui.card('<div class="fw-7 mb-4">Current service mix</div>' +
              (mix.length ? ui.donut(mix, { aria: 'Requests by service type' })
                          : '<p class="fs-sm t-2">No dispatches on the board.</p>')) +
          '</div>' +

          ui.section('Month by month', ui.table(
            ['Month', 'Rescues', 'Revenue', 'Avg per rescue'],
            months.slice().reverse().map(function (m) {
              return [
                esc(m.m),
                U.num(m.rescues),
                '<span class="fw-6">' + esc(U.money(m.revenue, false)) + '</span>',
                esc(U.money(m.revenue / Math.max(1, m.rescues)))
              ];
            }))) +
        '</div>',

      mount: function (root) {
        U.on(scope(root), 'click', '[data-act="print"]', function () { window.print(); });
      }
    };
  };

  /* ======================================================================
     Reports
     ====================================================================== */

  RA.views.aReports = function () {
    var a = admin();
    var KIND = {
      PDF:  { icon: 'pdf',  tint: 'var(--danger-15)',  tone: 'var(--danger)' },
      XLSX: { icon: 'file', tint: 'var(--success-15)', tone: 'var(--success)' },
      CSV:  { icon: 'file', tint: 'var(--primary-15)', tone: 'var(--primary)' }
    };

    var GENERATE = [
      { id: 'assist', name: 'Assistance summary', text: 'Volume, response times and completion by service.', icon: 'activity' },
      { id: 'perf',   name: 'Mechanic performance', text: 'Ratings, jobs completed and acceptance rate.', icon: 'users' },
      { id: 'rev',    name: 'Revenue & payouts', text: 'Gross revenue, commission and mechanic payouts.', icon: 'dollar' },
      { id: 'resp',   name: 'Response analysis', text: 'Dispatch-to-arrival breakdown by area.', icon: 'timer' }
    ];

    return {
      title: 'Reports',
      sub: 'Generate and download operational reports',
      back: '/admin',
      html:
        '<div class="stack stack-6">' +
          ui.section('Generate a report',
            '<div class="grid grid--cards">' + GENERATE.map(function (g, i) {
              return ui.card(
                '<div class="hstack gap-3">' +
                  '<span class="row__icon" style="--tint:var(--primary-15);--tone:var(--primary)">' +
                    icon(g.icon, 19) + '</span>' +
                  '<div class="grow"><div class="fw-6">' + esc(g.name) + '</div>' +
                    '<div class="fs-xs t-2">' + esc(g.text) + '</div></div>' +
                '</div>' +
                '<div class="mt-4">' + ui.btn({
                  label: 'Generate', icon: 'sparkles', size: 'sm', block: true,
                  act: 'generate', data: { 'data-name': g.name }
                }) + '</div>', { rise: i });
            }).join('') + '</div>') +

          ui.section('Available reports',
            ui.rows(a.reports.map(function (r, i) {
              var k = KIND[r.kind] || KIND.CSV;
              return ui.row({
                icon: k.icon, tint: k.tint, tone: k.tone,
                title: r.name,
                badge: ' ' + ui.pill(r.kind, 'default'),
                sub: r.period + ' · ' + r.size + ' · generated ' + U.relTime(r.at),
                end: '<span class="hstack gap-2">' +
                  ui.btn({ label: 'Download', icon: 'download', size: 'sm', variant: 'secondary',
                           act: 'download', data: { 'data-name': r.name } }) +
                  '</span>',
                rise: i
              });
            }))) +

          ui.card('<div class="hstack gap-3 hwrap">' +
            '<span class="row__icon" style="--tint:var(--warning-15);--tone:var(--warning)">' + icon('info', 19) + '</span>' +
            '<div class="grow fs-sm t-2">This is a demo build with no reporting backend, so generating a ' +
            'report creates an entry in this list rather than a real file. Downloads export the ' +
            'seeded data as CSV so you can see the shape a real export would take.</div>' +
            '</div>', { variant: 'flat' }) +
        '</div>',

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="generate"]', function (e, node) {
          var name = node.getAttribute('data-name');
          ui.withLoading(node, new Promise(function (r) { setTimeout(r, 900); })).then(function () {
            admin().reports.unshift({
              id: U.uid('rep'), name: name, period: 'August 2026',
              kind: 'PDF', size: (120 + Math.floor(Math.random() * 400)) + ' KB',
              at: new Date().toISOString()
            });
            ui.toast(name + ' generated', 'success');
            RA.router.refresh();
          });
        });

        /* Export the live dispatch board as a real CSV — the one download on
           this page that can genuinely produce a file client-side. */
        U.on(sc, 'click', '[data-act="download"]', function (e, node) {
          var name = node.getAttribute('data-name');
          var head = ['ref', 'customer', 'service', 'mechanic', 'status', 'eta_min', 'amount', 'address'];
          var lines = [head.join(',')].concat(admin().dispatches.map(function (d) {
            var svc = sel().service(d.serviceId) || {};
            return [d.ref, d.customer, svc.name || d.serviceId, d.mechanic || '',
                    d.status, d.etaMin === null ? '' : d.etaMin, d.amount, d.address]
              .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
          }));
          var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a2 = document.createElement('a');
          a2.href = url;
          a2.download = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
          document.body.appendChild(a2);
          a2.click();
          document.body.removeChild(a2);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          ui.toast('Exported as CSV', 'success');
        });
      }
    };
  };

  /* ======================================================================
     System logs
     ====================================================================== */

  RA.views.aLogs = function () {
    var a = admin();
    var FILTERS = [
      { value: 'all', label: 'All' },
      { value: 'info', label: 'Info' },
      { value: 'warning', label: 'Warnings' },
      { value: 'error', label: 'Errors' }
    ];

    var counts = { info: 0, warning: 0, error: 0 };
    a.logs.forEach(function (l) { if (counts[l.level] !== undefined) counts[l.level]++; });

    var items = a.logs.map(function (l, i) {
      var lv = levelOf(l.level);
      return '<div data-log="' + U.escAttr(l.id) + '" data-level="' + U.escAttr(l.level) + '"' +
        ' data-search="' + U.escAttr((l.message + ' ' + l.source + ' ' + l.level).toLowerCase()) + '">' +
        ui.row({
          icon: lv.icon, tint: lv.tint, tone: lv.tone,
          title: l.message,
          badge: ' ' + ui.pill(l.level, lv.pill),
          sub: l.source + ' · ' + U.fmtDateTime(l.at),
          time: U.relTime(l.at),
          rise: i
        }) + '</div>';
    }).join('');

    return {
      title: 'System logs',
      sub: a.logs.length + ' events',
      back: '/admin',
      html:
        '<div class="stack stack-5">' +
          '<div class="kpi">' +
            ui.stat({ label: 'Total events', value: U.num(a.logs.length), icon: 'logs',
                      tint: 'var(--primary-15)', tone: 'var(--primary)', rise: 0 }) +
            ui.stat({ label: 'Info', value: String(counts.info), icon: 'info',
                      tint: 'var(--primary-15)', tone: 'var(--primary)', rise: 1 }) +
            ui.stat({ label: 'Warnings', value: String(counts.warning), icon: 'warning',
                      tint: 'var(--warning-15)', tone: 'var(--warning)', rise: 2 }) +
            ui.stat({ label: 'Errors', value: String(counts.error), icon: 'xCircle',
                      tint: 'var(--danger-15)', tone: 'var(--danger)', rise: 3 }) +
          '</div>' +

          '<div class="toolbar">' +
            ui.search({ name: 'q', placeholder: 'Search message or source…' }) +
            ui.chipRow(FILTERS, 'all', 'filter') +
          '</div>' +
          '<p class="fs-xs t-2" aria-live="polite"><span id="log-count">' +
            a.logs.length + '</span> shown</p>' +

          '<div class="rows">' + items + '</div>' +

          '<div id="log-empty" hidden>' + ui.empty({
            icon: 'search', title: 'No events match', text: 'Try a different search or level.'
          }) + '</div>' +
        '</div>',

      mount: function (root) {
        bindLocalFilter(root, {
          searchSel: '.search__input',
          itemSel: '[data-log]',
          countSel: '#log-count',
          emptySel: '#log-empty',
          match: function (node, term, filter) {
            var okFilter = filter === 'all' || node.getAttribute('data-level') === filter;
            var okTerm = !term || node.getAttribute('data-search').indexOf(term) > -1;
            return okFilter && okTerm;
          }
        });
      }
    };
  };
})(window);
