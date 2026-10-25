/* ==========================================================================
   RoadAssist Web — Customer portal
   dashboard · services · requestForm · mechanics · mechanicDetail · liveMap
   tracking · history · historyDetail · vehicles · emergency · notifications
   profile · settings

   Every view returns the router contract: { title, sub, back, actions, html,
   mount(root) }. mount() may return a cleanup function — used here to clear
   the tracking timer and let the router tear the map down.
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
     Small shared helpers
     ====================================================================== */

  function sel() { return S.select; }
  function act() { return S.actions; }
  function scope(root) { return RA.views._scope(root); }

  function firstName(name) { return String(name || '').split(' ')[0]; }

  function vehLabel(v) {
    if (!v) return 'No vehicle saved';
    return v.year + ' ' + v.make + ' ' + v.model + ' · ' + v.plate;
  }

  function vehicleOptions() {
    return S.get().vehicles.map(function (v) {
      return { value: v.id, label: vehLabel(v) };
    });
  }

  /** Phone dialog — a browser can't place the call, so offer the tel: link. */
  function callModal(name, phone) {
    ui.modal({
      icon: 'phone', tint: 'var(--success-15)', tone: 'var(--success)',
      title: 'Call ' + name,
      text: phone,
      body: '<div class="stack stack-3">' +
        ui.btn({ label: 'Open dialer', icon: 'phone', block: true, href: 'tel:' + phone.replace(/[^\d+]/g, '') }) +
        ui.btn({ label: 'Copy number', icon: 'file', variant: 'secondary', block: true, act: 'copy-phone', data: { 'data-phone': phone } }) +
        '</div>',
      cancel: 'Close'
    });
    var box = U.qs('#modal-root');
    U.on(box, 'click', '[data-act="copy-phone"]', function (e, node) {
      ui.copy(node.getAttribute('data-phone'), 'Number');
    });
  }

  /** Wire the buttons that ui.mechCard() emits. */
  function bindMechCards(root) {
    var sc = scope(root);
    U.on(sc, 'click', '[data-act="call-mechanic"]', function (e, node) {
      var m = sel().mechanic(node.getAttribute('data-id'));
      if (m) callModal(m.name, m.phone);
    });
    U.on(sc, 'click', '[data-act="request-mechanic"]', function (e, node) {
      var id = node.getAttribute('data-id');
      RA.router.go('/services?mech=' + encodeURIComponent(id));
    });
  }

  /** Rating dialog shown after a job completes. */
  function reviewModal(request, onDone) {
    ui.modal({
      wide: true,
      icon: 'star', tint: 'var(--warning-15)', tone: 'var(--warning)',
      title: 'How did it go?',
      text: request.service + ' · ' + request.mechanic,
      body: '<form>' +
        '<div class="ta-c mb-5">' + ui.stars(5, { input: true, name: 'rating', size: 30 }) + '</div>' +
        ui.field({ label: 'Anything worth mentioning? (optional)', name: 'text', type: 'textarea',
                   placeholder: 'Arrived quickly, explained the problem clearly…' }) +
        '</form>',
      confirm: 'Submit rating', cancel: 'Maybe later',
      onConfirm: function (data) {
        act().submitReview(request.id, Number(data.rating) || 5, data.text);
        ui.toast('Thanks — your rating helps keep the network honest', 'success');
        if (onDone) onDone();
      }
    });
  }

  /** Steps for a request, derived from its event log. */
  function requestSteps(r) {
    var order = ['searching', 'assigned', 'en_route', 'arrived', 'in_progress', 'completed'];
    if (r.status === 'cancelled') {
      return ui.steps([
        { title: 'Request submitted', sub: U.fmtDateTime(r.at), state: 'done' },
        { title: 'Cancelled', sub: r.note || 'No charge was made', state: 'current' }
      ]);
    }
    var events = {};
    (r.events || []).forEach(function (e) { if (!events[e.status]) events[e.status] = e.at; });
    var meta = S.STATUS_META;
    var now = meta[r.status] ? meta[r.status].step : 5;

    return ui.steps(order.map(function (k, i) {
      var state = i < now ? 'done' : (i === now ? 'current' : 'todo');
      var when = events[k];
      var sub = when ? U.fmtTime(when)
        : (state === 'todo' ? 'Pending' : '');
      if (k === 'en_route' && state === 'current' && r.etaMin) sub = 'ETA ' + U.mins(r.etaMin);
      return { title: meta[k].label, sub: sub, state: state };
    }));
  }

  /* ======================================================================
     1. Dashboard
     ====================================================================== */

  RA.views.dashboard = function () {
    var me = sel().me();
    var state = S.get();
    var active = sel().activeRequest();
    var spend = sel().spendStats();
    var near = sel().mechanicsNear(me).filter(function (m) { return m.online; }).slice(0, 3);
    var recent = sel().history().slice(0, 3);
    var veh = sel().defaultVehicle();

    var activeCard = active
      ? ui.card(
          '<div class="hstack gap-3 hwrap mb-4">' +
            ui.statusPill(active.status) +
            '<span class="push fs-xs t-2 mono">' + esc(active.ref) + '</span>' +
          '</div>' +
          '<div class="hstack gap-4 hwrap">' +
            '<div class="grow">' +
              '<div class="fs-h3 fw-7">' + esc(active.service) + '</div>' +
              '<div class="fs-xs t-2 mt-2">' + esc(active.mechanic) + ' · ' + esc(active.address) + '</div>' +
            '</div>' +
            '<div class="ta-c">' +
              '<div class="fs-h3 fw-8 t-accent">' + esc(U.mins(active.etaMin)) + '</div>' +
              '<div class="fs-xs t-3">estimated arrival</div>' +
            '</div>' +
          '</div>' +
          '<div class="mt-5">' + ui.meter(((S.STATUS_META[active.status] || {}).step / 5) * 100) + '</div>' +
          '<div class="hstack gap-3 mt-5">' +
            ui.btn({ label: 'Track live', icon: 'route', nav: '/track', cls: 'grow' }) +
            ui.btn({ label: 'Details', variant: 'secondary', nav: '/history/' + active.id }) +
          '</div>',
          { variant: 'navy' })
      : '';

    var sos = '<div class="sos">' +
      '<div class="sos__copy">' +
        '<div class="sos__eyebrow">EMERGENCY ASSISTANCE</div>' +
        '<div class="sos__title">Broken down right now?</div>' +
        '<div class="sos__sub">One press sends your location to every verified mechanic in range. You pick the service, we dispatch the closest one.</div>' +
      '</div>' +
      '<button type="button" class="sospulse" data-act="sos" aria-label="Send an SOS request">' +
        '<span class="sospulse__ring"></span><span class="sospulse__ring"></span>' +
        '<span class="sospulse__core">' + icon('zap', 26) +
          '<span class="sospulse__label">SOS</span></span>' +
      '</button>' +
      '</div>';

    var services = ui.section('What do you need?',
      '<div class="grid grid--services">' + state.services.map(function (s, i) {
        return ui.svcTile(s, { rise: i });
      }).join('') + '</div>',
      'See all', '/services');

    var stats = '<div class="grid grid--stats mt-5">' +
      ui.stat({ label: 'Call-outs', value: U.num(spend.completed), icon: 'history', rise: 0,
                tint: 'var(--primary-15)', tone: 'var(--primary)', nav: '/history',
                sub: 'lifetime' }) +
      ui.stat({ label: 'Total spent', value: U.money(spend.totalSpent, false), icon: 'dollar', rise: 1,
                tint: 'var(--success-15)', tone: 'var(--success)',
                sub: U.money(spend.avgSpend, false) + ' average' }) +
      ui.stat({ label: 'Avg. job time', value: Math.round(spend.avgDuration) + ' min', icon: 'timer', rise: 2,
                tint: 'var(--warning-15)', tone: 'var(--warning)', sub: 'roadside to clear' }) +
      ui.stat({ label: 'Saved vehicles', value: U.num(state.vehicles.length), icon: 'car', rise: 3,
                tint: 'var(--accent-15)', tone: 'var(--accent)', nav: '/vehicles',
                sub: veh ? veh.plate + ' default' : 'add one' }) +
      '</div>';

    var mechanics = ui.section('Mechanics near you',
      near.length
        ? '<div class="grid grid--cards">' + near.map(function (m, i) {
            return ui.mechCard(m, { rise: i });
          }).join('') + '</div>'
        : ui.empty({ icon: 'users', title: 'No one online nearby', text: 'Every mechanic in your area is currently offline. Try again shortly.' }),
      'View all', '/mechanics');

    var activity = ui.section('Recent activity',
      recent.length
        ? ui.rows(recent.map(function (r, i) {
            var svc = sel().service(r.serviceId) || {};
            return ui.row({
              icon: svc.icon || 'wrench', tint: svc.tint, tone: svc.tone,
              title: r.service,
              sub: r.mechanic + ' · ' + U.relTime(r.at),
              amount: r.status === 'cancelled' ? '—' : U.money(r.amount, false),
              chev: true, nav: '/history/' + r.id, rise: i
            });
          }))
        : ui.empty({ icon: 'history', title: 'No call-outs yet', text: 'When you request assistance it will show up here with a receipt.' }),
      'Full history', '/history');

    return {
      title: 'Hi, ' + firstName(me.name),
      sub: veh ? veh.year + ' ' + veh.make + ' ' + veh.model + ' · ' + me.address : me.address,
      html: '<div class="stack stack-5">' + activeCard + sos + '</div>' +
        services + stats + mechanics + activity,
      mount: function (root) {
        var sc = scope(root);
        bindMechCards(root);

        U.on(sc, 'click', '[data-act="pick-service"]', function (e, node) {
          RA.router.go('/request/' + node.getAttribute('data-value'));
        });

        U.on(sc, 'click', '[data-act="sos"]', function () {
          if (sel().activeRequest()) {
            ui.toast('You already have a live request', 'warning');
            RA.router.go('/track');
            return;
          }
          ui.modal({
            wide: true,
            icon: 'zap', tint: 'var(--danger-15)', tone: 'var(--danger)',
            title: 'What has happened?',
            text: 'Pick a service and we will dispatch the closest verified mechanic to ' +
                  (sel().me().address || 'your location') + ' immediately.',
            body: '<div class="grid grid--services">' + S.get().services.map(function (s) {
              return ui.svcTile(s, { act: 'sos-pick' });
            }).join('') + '</div>',
            cancel: 'Not now'
          });
          var modalRoot = U.qs('#modal-root');
          U.on(modalRoot, 'click', '[data-act="sos-pick"]', function (e2, node2) {
            var id = node2.getAttribute('data-value');
            ui.closeModal();
            act().setDraft({ serviceId: id, mechanicId: null });
            var req = act().createRequest();
            ui.toast('SOS sent — ' + req.ref, 'danger');
            RA.router.go('/track');
          });
        });
      }
    };
  };

  /* ======================================================================
     2. Services
     ====================================================================== */

  RA.views.services = function (params, q) {
    var mech = q.mech ? sel().mechanic(q.mech) : null;
    var state = S.get();
    var suffix = mech ? '?mech=' + encodeURIComponent(mech.id) : '';

    var chosen = mech
      ? ui.card(
          '<div class="hstack gap-3 hwrap">' +
            ui.avatar(mech.name, { size: 'sm', dot: mech.online }) +
            '<div class="grow"><div class="fw-7">' + esc(mech.name) + '</div>' +
              '<div class="fs-xs t-2">' + esc(mech.shop) + ' — pick the service you need from their list</div></div>' +
            '<span class="push">' + ui.btn({ label: 'Clear', variant: 'ghost', size: 'sm', nav: '/services' }) + '</span>' +
          '</div>', { variant: 'navy' }) + '<div class="mt-5"></div>'
      : '';

    var list = state.services.map(function (s, i) {
      var offered = !mech || mech.services.indexOf(s.id) > -1;
      var near = sel().mechanicsNear(sel().me(), s.id).filter(function (m) { return m.online; });
      return ui.card(
        '<div class="hstack gap-4 hwrap">' +
          '<span class="svc__icon" style="--tint:' + U.escAttr(s.tint) + ';--tone:' + U.escAttr(s.tone) + '">' +
            icon(s.icon, 24) + '</span>' +
          '<div class="grow" style="flex:1 1 180px">' +
            '<div class="fs-h3 fw-7">' + esc(s.name) + '</div>' +
            '<div class="fs-xs t-2 mt-2">' + esc(s.desc) + '</div>' +
            '<div class="mech__meta mt-3">' +
              ui.metachip('clock', s.eta) +
              ui.metachip('users', near.length + ' online nearby') +
            '</div>' +
          '</div>' +
          '<div class="ta-c" style="flex:none">' +
            '<div class="fs-h3 fw-8">' + esc(U.money(s.base, false)) + '</div>' +
            '<div class="fs-xs t-3">call-out</div>' +
          '</div>' +
        '</div>' +
        '<div class="mt-5">' +
          (offered
            ? ui.btn({ label: 'Request ' + s.name, block: true, icon: 'chevronR',
                       nav: '/request/' + s.id + suffix })
            : ui.btn({ label: mech.name.split(' ')[0] + ' does not offer this', block: true, variant: 'secondary', disabled: true })) +
        '</div>',
        { rise: i });
    }).join('');

    return {
      title: 'Request assistance',
      sub: 'Six services, dispatched in minutes',
      back: '/app',
      html: chosen +
        ui.pageTitle('What do you need help with?',
          'Prices are the standard call-out rate and are locked when you confirm. You will see the exact total before anything is charged.') +
        '<div class="grid grid--wide">' + list + '</div>',
      mount: function (root) { bindMechCards(root); }
    };
  };

  /* ======================================================================
     3. Request form
     ====================================================================== */

  var PLATFORM_FEE = 2.5;

  RA.views.requestForm = function (params, q) {
    var svc = sel().service(params.id);
    if (!svc) {
      return {
        title: 'Service not found', back: '/services',
        html: (function() {
          var geoStatus = sel().geolocationStatus();
          var notice = '';
          if (geoStatus.error) {
            switch (geoStatus.error.code) {
              case 1: // PERMISSION_DENIED
                notice = ui.notify({
                  title: 'Location Access Denied',
                  text: 'Location access was denied. To use RoadAssist, please allow location access in your browser settings or enter your location manually.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              case 2: // POSITION_UNAVAILABLE
                notice = ui.notify({
                  title: 'Location Unavailable',
                  text: 'Unable to determine your location. Please check your device\'s location services and try again or enter your location manually.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              case 3: // TIMEOUT
                notice = ui.notify({
                  title: 'Location Timeout',
                  text: 'The request to get your location timed out. Please try again or enter your location manually.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              default:
                notice = ui.notify({
                  title: 'Location Error',
                  text: 'There was an error accessing your location: ' + geoStatus.error.message + '. Please try again or enter your location manually.',
                  duration: 8000,
                  type: 'warning'
                });
            }
          } else if (geoStatus.isDemoCoordinates) {
            notice = ui.notify({
              title: 'Using Saved Location',
              text: 'You are using your saved location. For the most accurate nearby mechanics and ETAs, click the location icon to update your position.',
              duration: 5000,
              type: 'info'
            });
          }
          return notice;
        })() +
        ui.empty({
          icon: 'search', title: 'We don’t offer that service',
          text: 'Pick one of the six roadside services instead.',
          action: ui.btn({ label: 'Back to services', nav: '/services' })
        })
      };
    }

    var me = sel().me();
    var capable = sel().mechanicsNear(me, svc.id).filter(function (m) { return m.online; });
    var picked = q.mech ? sel().mechanic(q.mech) : null;
    var assigned = picked || capable[0] || null;
    var etaMin = assigned ? U.etaMinutes(me, assigned) : 12;
    var veh = sel().defaultVehicle();

    var mechBlock = assigned
      ? '<div class="hstack gap-3 hwrap">' +
          ui.avatar(assigned.name, { dot: assigned.online }) +
          '<div class="grow">' +
            '<div class="fw-7">' + esc(assigned.name) + (picked ? '' : ' <span class="t-3 fs-xs">(closest available)</span>') + '</div>' +
            '<div class="fs-xs t-2">' + esc(assigned.shop) + '</div>' +
            '<div class="mech__meta mt-2">' +
              ui.metachip('pin', U.miles(U.distanceMiles(me, assigned)) + ' away') +
              ui.metachip('clock', U.mins(etaMin) + ' ETA') +
            '</div>' +
          '</div>' +
          '<span class="push">' + ui.rating(assigned.rating) + '</span>' +
        '</div>' +
        '<div class="hstack gap-3 mt-4">' +
          ui.btn({ label: 'Choose someone else', variant: 'secondary', size: 'sm', cls: 'grow',
                   nav: '/mechanics?service=' + svc.id }) +
          (picked ? ui.btn({ label: 'Use closest instead', variant: 'ghost', size: 'sm', nav: '/request/' + svc.id }) : '') +
        '</div>'
      : '<div class="hstack gap-3">' +
          '<span class="row__icon" style="--tint:var(--warning-15);--tone:var(--warning)">' + icon('radio', 19) + '</span>' +
          '<div class="grow"><div class="fw-6">No one online for this service</div>' +
          '<div class="fs-xs t-2">We will keep broadcasting and widen the radius until someone accepts.</div></div>' +
        '</div>';

    var form = ui.card(
      '<h2 class="section__title mb-4">Where and what</h2>' +
      '<form id="req-form" novalidate>' +
        ui.field({ label: 'Your location', name: 'address', icon: 'pin',
          value: me.address === 'Bengaluru, CA' ? 'Indiranagar, Bengaluru, Karnataka' : me.address,
          placeholder: 'Street, city' }) +
        '<div class="hstack gap-3 mt-3 hwrap">' +
          '<button type="button" class="btn btn--sm btn--secondary" data-act="use-real-location" ' +
            'aria-label="Use my current location">' +
            icon('crosshair', 16) +
            '<span class="btn__label">Use my current location</span>' +
          '</button>' +
          (sel().geolocationStatus().isDemoCoordinates
            ? '<span class="fs-xs t-3">Currently using your saved Indiranagar anchor</span>'
            : '<span class="fs-xs t-success">Using your real location</span>') +
        '</div>' +
        (S.get().vehicles.length
          ? ui.field({ label: 'Vehicle', name: 'vehicleId', type: 'select',
              options: vehicleOptions(), value: veh ? veh.id : '' })
          : '<div class="demohint"><span class="i">' + icon('info', 15) + '</span><div>' +
            'No vehicle saved yet. <button type="button" class="section__link" data-nav="/vehicles">Add one</button> ' +
            'so the mechanic knows what they are coming to.</div></div>') +
        ui.field({ label: 'Anything they should know? (optional)', name: 'note', type: 'textarea',
          placeholder: svc.id === 'tire' ? 'Rear passenger tire, spare is in the boot…'
            : (svc.id === 'towing' ? 'Will not start, needs transport to my usual garage…'
            : 'Describe what happened…') }) +
      '</form>', { cls: 'mb-5' }) +

      ui.card('<h2 class="section__title mb-4">Who is coming</h2>' + mechBlock);

    var total = svc.base + PLATFORM_FEE;

    var aside = '<div class="stack stack-5 detail__aside">' +
      ui.card(
        '<div class="hstack gap-3 mb-4">' +
          '<span class="svc__icon" style="--tint:' + U.escAttr(svc.tint) + ';--tone:' + U.escAttr(svc.tone) + '">' +
            icon(svc.icon, 22) + '</span>' +
          '<div><div class="fw-7">' + esc(svc.name) + '</div>' +
          '<div class="fs-xs t-2">' + esc(svc.eta) + ' typical</div></div>' +
        '</div>' +
        '<div class="receipt">' +
          '<div class="receipt__row"><span>Call-out rate</span><span class="push">' + esc(U.money(svc.base)) + '</span></div>' +
          '<div class="receipt__row"><span>Platform fee</span><span class="push">' + esc(U.money(PLATFORM_FEE)) + '</span></div>' +
          '<div class="receipt__row t-2"><span>' + esc(svc.id === 'towing' ? 'First 25 towing km' : 'Roadside labour') + '</span><span class="push t-success">Included</span></div>' +
          '<div class="receipt__total"><span>Total</span><span class="push">' + esc(U.money(total)) + '</span></div>' +
        '</div>' +
        '<p class="fs-xs t-3 mt-3">Nothing is charged until the job is marked complete. Cancelling before arrival is free.</p>' +
        '<div class="mt-5">' +
          ui.btn({ label: 'Confirm request', block: true, icon: 'zap', id: 'req-confirm', act: 'confirm-request' }) +
        '</div>') +
      ui.card(
        '<div class="hstack gap-3">' +
          '<span class="row__icon" style="--tint:var(--danger-15);--tone:var(--danger)">' + icon('shield', 19) + '</span>' +
          '<div class="grow"><div class="fw-6">Share with a contact</div>' +
          '<div class="fs-xs t-2">Your emergency contacts can follow this job live.</div></div>' +
        '</div>' +
        '<div class="mt-4">' + ui.btn({ label: 'Manage contacts', variant: 'secondary', size: 'sm', block: true, nav: '/emergency' }) + '</div>',
        { variant: 'flat' }) +
      '</div>';

    return {
      title: svc.name,
      sub: 'Confirm the details',
      back: '/services',
      html: (function() {
        var geoStatus = sel().geolocationStatus();
        var notice = '';
        if (geoStatus.error) {
          switch (geoStatus.error.code) {
            case 1: // PERMISSION_DENIED
              notice = ui.notify({
                title: 'Location Access Denied',
                text: 'Location access was denied. For accurate nearby mechanics and ETAs, please allow location access in your browser settings. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 2: // POSITION_UNAVAILABLE
              notice = ui.notify({
                title: 'Location Unavailable',
                text: 'Unable to determine your location. Please check your device\'s location services and try again. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 3: // TIMEOUT
              notice = ui.notify({
                title: 'Location Timeout',
                text: 'The request to get your location timed out. Please try again. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            default:
              notice = ui.notify({
                title: 'Location Error',
                text: 'There was an error accessing your location: ' + geoStatus.error.message + '. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
          }
        } else if (geoStatus.isDemoCoordinates) {
          notice = ui.notify({
            title: 'Using Saved Location',
            text: 'You are using your saved location. For the most accurate nearby mechanics and ETAs, click the location icon to update your position.',
            duration: 5000,
            type: 'info'
          });
        }
        return notice;
      })() +
      '<div class="detail">' + '<div>' + form + '</div>' + aside + '</div>',
      mount: function (root) {
        var sc = scope(root);
        var form = U.qs('#req-form', root);

        U.on(sc, 'click', '[data-act="use-real-location"]', function (e, node) {
          if (typeof S.updateUserLocationFromGeolocation !== 'function') {
            ui.toast('Geolocation is not available right now', 'warning');
            return;
          }
          ui.withLoading(node, S.updateUserLocationFromGeolocation()).then(function () {
            var s = sel().geolocationStatus();
            if (s.error) {
              if (s.error.code === 1) {
                ui.toast('Location permission denied', 'warning');
              } else if (s.error.code === 2) {
                ui.toast('Location unavailable — check your device settings', 'warning');
              } else if (s.error.code === 3) {
                ui.toast('Location request timed out', 'warning');
              } else {
                ui.toast('Could not get your location', 'warning');
              }
              return;
            }
            if (s.hasCoordinates && !s.isDemoCoordinates) {
              ui.toast('Updated to your real location', 'success');
              RA.router.refresh();
            } else {
              ui.toast('Still using your saved location', 'info');
            }
          });
        });

        U.on(sc, 'click', '[data-act="confirm-request"]', function (e, node) {
          var values = ui.validateForm(form, { address: U.validate.required });
          if (!values) return;

          act().setDraft({
            serviceId: svc.id,
            mechanicId: assigned ? assigned.id : null,
            vehicleId: values.vehicleId || (veh ? veh.id : null),
            address: values.address,
            note: values.note
          });

          ui.withLoading(node, new Promise(function (r) { setTimeout(r, 650); })).then(function () {
            var req = act().createRequest();
            ui.toast('Request ' + req.ref + ' broadcast', 'success');
            RA.router.go('/track');
          });
        });
      }
    };
  };

  /* ======================================================================
     4. Mechanics list
     ====================================================================== */

  RA.views.mechanics = function (params, q) {
    var me = sel().me();
    var svcFilter = q.service || 'all';
    var all = sel().mechanicsNear(me);

    var chips = [{ value: 'all', label: 'All services' }].concat(
      S.get().services.map(function (s) { return { value: s.id, label: s.name }; }));

    var cards = all.map(function (m, i) {
      return '<div data-mech-card' +
        ' data-hay="' + U.escAttr((m.name + ' ' + m.shop + ' ' + m.specialty + ' ' + m.tags.join(' ')).toLowerCase()) + '"' +
        ' data-services="' + U.escAttr(m.services.join(' ')) + '"' +
        ' data-online="' + (m.online ? '1' : '0') + '">' +
        ui.mechCard(m, { rise: i }) + '</div>';
    }).join('');

    return {
      title: 'Find mechanics',
      sub: all.length + ' in your area',
      back: '/app',
      html: ui.pageTitle('Mechanics near you',
        'Sorted by distance from your saved location. Ratings and job counts come from completed RoadAssist call-outs.') +
        '<div class="toolbar">' +
          '<div class="toolbar__search">' + ui.search({ name: 'q', placeholder: 'Search name, shop or speciality…' }) + '</div>' +
          '<div class="toolbar__group">' +
            '<button type="button" class="chipbtn" data-act="only-online" aria-pressed="false">' +
              icon('radio', 14) + ' Online only</button>' +
          '</div>' +
        '</div>' +
        '<div class="mt-4">' + ui.chipRow(chips, svcFilter, 'svc-filter') + '</div>' +
        '<p class="fs-xs t-3 mt-4" id="mech-count" aria-live="polite"></p>' +
        '<div class="grid grid--cards mt-4" id="mech-list">' + cards + '</div>' +
        '<div id="mech-empty" hidden>' + ui.empty({
          icon: 'search', title: 'No mechanics match',
          text: 'Try clearing the search box or choosing a different service.'
        }) + '</div>',
      mount: function (root) {
        var sc = scope(root);
        var searchInput = U.qs('.search__input', root);
        var countNode = U.qs('#mech-count', root);
        var emptyNode = U.qs('#mech-empty', root);
        var cardNodes = U.qsa('[data-mech-card]', root);
        var current = { q: '', service: svcFilter, onlineOnly: false };

        function apply() {
          var shown = 0;
          cardNodes.forEach(function (node) {
            var okQ = !current.q || node.getAttribute('data-hay').indexOf(current.q) > -1;
            var okS = current.service === 'all' ||
              node.getAttribute('data-services').split(' ').indexOf(current.service) > -1;
            var okO = !current.onlineOnly || node.getAttribute('data-online') === '1';
            var show = okQ && okS && okO;
            node.hidden = !show;
            if (show) shown++;
          });
          countNode.textContent = 'Showing ' + shown + ' of ' + cardNodes.length + ' mechanics';
          emptyNode.hidden = shown > 0;
        }

        if (searchInput) {
          searchInput.addEventListener('input', U.debounce(function () {
            current.q = searchInput.value.trim().toLowerCase();
            apply();
          }, 140));
        }

        U.on(sc, 'click', '[data-act="svc-filter"]', function (e, node) {
          U.qsa('[data-act="svc-filter"]', root).forEach(function (b) { b.classList.remove('is-active'); });
          node.classList.add('is-active');
          current.service = node.getAttribute('data-value');
          apply();
        });

        U.on(sc, 'click', '[data-act="only-online"]', function (e, node) {
          current.onlineOnly = !current.onlineOnly;
          node.classList.toggle('is-active', current.onlineOnly);
          node.setAttribute('aria-pressed', String(current.onlineOnly));
          apply();
        });

        bindMechCards(root);
        apply();
      }
    };
  };

  /* ======================================================================
     5. Mechanic detail
     ====================================================================== */

  RA.views.mechanicDetail = function (params) {
    var m = sel().mechanic(params.id);
    if (!m) {
      return {
        title: 'Mechanic not found', back: '/mechanics',
        html: ui.empty({
          icon: 'users', title: 'That mechanic isn’t on the network',
          text: 'They may have been removed, or the link may be incomplete.',
          action: ui.btn({ label: 'Browse mechanics', nav: '/mechanics' })
        })
      };
    }

    var me = sel().me();
    var dist = U.distanceMiles(me, m);
    var eta = U.etaMinutes(me, m);
    var reviews = sel().reviewsFor(m.id);
    var offers = m.services.map(function (id) { return sel().service(id); }).filter(Boolean);

    var header = ui.card(
      '<div class="hstack gap-4 hwrap">' +
        ui.avatar(m.name, { size: 'lg', dot: m.online }) +
        '<div class="grow">' +
          '<div class="hstack gap-2 hwrap">' +
            '<span class="fs-h3 fw-7">' + esc(m.name) + '</span>' +
            (m.verified ? ui.pill('Verified', 'primary') : '') +
            (m.online ? ui.pill('Online', 'success', true) : ui.pill('Offline', 'danger')) +
          '</div>' +
          '<div class="t-2 fs-sm mt-2">' + esc(m.shop) + ' · ' + esc(m.specialty) + '</div>' +
          '<div class="mech__meta mt-3">' +
            ui.metachip('star', m.rating.toFixed(1) + ' (' + m.reviews + ' reviews)') +
            ui.metachip('pin', U.miles(dist) + ' away') +
            ui.metachip('clock', U.mins(eta) + ' ETA') +
            ui.metachip('wrench', U.num(m.jobs) + ' jobs done') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p class="t-2 fs-sm mt-5">' + esc(m.bio) + '</p>' +
      '<div class="mt-5">' + ui.chips(m.tags) + '</div>');

    var servicesCard = ui.card(
      '<h2 class="section__title mb-4">Services offered</h2>' +
      ui.rows(offers.map(function (s, i) {
        return ui.row({
          icon: s.icon, tint: s.tint, tone: s.tone,
          title: s.name, sub: s.desc,
          amount: U.money(s.base, false), chev: true,
          nav: '/request/' + s.id + '?mech=' + m.id, rise: i
        });
      })));

    var reviewsCard = ui.card(
      '<h2 class="section__title mb-4">Reviews</h2>' +
      (reviews.length
        ? '<div class="stack stack-5">' + reviews.map(function (r) { return ui.review(r); }).join('<hr class="divider">') + '</div>'
        : ui.empty({ icon: 'message', title: 'No written reviews yet', text: 'This mechanic has a ' + m.rating.toFixed(1) + ' rating but no comments on file.' })));

    var aside = '<div class="stack stack-5 detail__aside">' +
      ui.card(
        '<div class="stack stack-3">' +
          ui.btn({ label: 'Request this mechanic', block: true, icon: 'zap', act: 'req-this' }) +
          ui.btn({ label: 'Call ' + firstName(m.name), block: true, variant: 'secondary', icon: 'phone', act: 'call-this' }) +
        '</div>' +
        '<hr class="divider">' +
        ui.dl([
          ['Shop', m.shop],
          ['Phone', m.phone],
          ['On RoadAssist since', String(m.since)],
          ['Typical response', U.mins(m.responseMin)],
          ['Status', m.online ? 'Accepting jobs' : 'Off duty']
        ])) +
      RA.map.shell('mech-map', {
        size: 'panel', recenter: false,
        aria: 'Map showing ' + m.name + ' relative to you',
        fallbackTitle: 'Roughly ' + U.miles(dist) + ' from you',
        fallbackText: 'Live tiles need a connection, but the distance and ETA above are calculated locally.'
      }) +
      '</div>';

    return {
      title: m.name,
      sub: m.shop,
      back: '/mechanics',
      html: '<div class="detail">' +
        '<div class="stack stack-5">' + header + servicesCard + reviewsCard + '</div>' +
        aside + '</div>',
      mount: function (root) {
        var sc = scope(root);

        RA.map.mount('mech-map', {
          center: { lat: (me.lat + m.lat) / 2, lng: (me.lng + m.lng) / 2 },
          zoom: 13, user: me,
          mechanics: [Object.assign({}, m, { distanceMi: dist, etaMin: eta })],
          selectedId: m.id, interactive: false
        });

        U.on(sc, 'click', '[data-act="req-this"]', function () {
          RA.router.go('/services?mech=' + m.id);
        });
        U.on(sc, 'click', '[data-act="call-this"]', function () {
          callModal(m.name, m.phone);
        });
      }
    };
  };

  /* ======================================================================
     6. Live map
     ====================================================================== */

  RA.views.liveMap = function (params, q) {
    var me = sel().me();
    var list = sel().mechanicsNear(me).filter(function (m) { return m.online; });
    var selected = (q.mech && sel().mechanic(q.mech)) || list[0] || null;

    function sheetFor(m) {
      if (!m) {
        return '<div class="sheet"><div class="sheet__grab"></div>' +
          '<div class="glass-card">' +
          '<div class="sheet__head"><span class="sheet__title">Nobody online</span></div>' +
          '<p class="sheet__sub">Every mechanic in range is off duty right now.</p>' +
        '</div>' +
        '</div>';
      }
      return '<div class="sheet" id="map-sheet"><div class="sheet__grab"></div>' +
        '<div class="glass-card">' +
          '<div class="sheet__head">' +
            '<span class="sheet__title truncate">' + esc(m.name) + '</span>' +
            '<span class="sheet__eta">' + esc(U.mins(m.etaMin)) + '</span>' +
          '</div>' +
          '<p class="sheet__sub">' + esc(m.shop + ' · ' + U.miles(m.distanceMi) + ' away · ' + m.rating.toFixed(1) + '★') + '</p>' +
          '<div class="hstack gap-3">' +
            ui.btn({ label: 'Request help', cls: 'grow', act: 'request-mechanic', data: { 'data-id': m.id } }) +
            '<button type="button" class="squarebtn" data-act="call-mechanic" data-id="' + U.escAttr(m.id) +
              '" aria-label="Call ' + U.escAttr(m.name) + '">' + icon('phone', 18) + '</button>' +
            '<button type="button" class="squarebtn" data-nav="/mechanic/' + U.escAttr(m.id) +
              '" aria-label="Profile">' + icon('chevronR', 18) + '</button>' +
          '</div>' +
        '</div>' +
        '</div>';
    }

    return {
      title: 'Live map',
      sub: list.length + ' mechanics online',
      back: '/app',
      html: (function() {
        var geoStatus = sel().geolocationStatus();
        var notice = '';
        if (geoStatus.error) {
          switch (geoStatus.error.code) {
            case 1: // PERMISSION_DENIED
              notice = ui.notify({
                title: 'Location Access Denied',
                text: 'Location access was denied. For accurate nearby mechanics and ETAs, please allow location access in your browser settings. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 2: // POSITION_UNAVAILABLE
              notice = ui.notify({
                title: 'Location Unavailable',
                text: 'Unable to determine your location. Please check your device\'s location services and try again. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 3: // TIMEOUT
              notice = ui.notify({
                title: 'Location Timeout',
                text: 'The request to get your location timed out. Please try again. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
              break;
            default:
              notice = ui.notify({
                title: 'Location Error',
                text: 'There was an error accessing your location: ' + geoStatus.error.message + '. You can still use the service by entering your location manually.',
                duration: 8000,
                type: 'warning'
              });
          }
        } else if (geoStatus.isDemoCoordinates) {
          notice = ui.notify({
            title: 'Using Saved Location',
            text: 'You are using your saved location. For the most accurate nearby mechanics and ETAs, click the location icon to update your position.',
            duration: 5000,
            type: 'info'
          });
        }
        return notice;
      })() +
      /* Inline banner above the map when the user is on demo coordinates. Gives
         them a single-tap way to re-prompt the browser for their real location
         without waiting for a permission pop-up they might have dismissed. */
      (function() {
        var s = sel().geolocationStatus();
        if (!s.isDemoCoordinates) return '';
        return '<div class="card card--flat" style="margin-bottom:var(--s-4);display:flex;align-items:center;gap:var(--s-4);padding:var(--s-4) var(--s-5)">' +
          '<span class="row__icon" style="--tint:var(--primary-15);--tone:var(--primary)">' + icon('pin', 19) + '</span>' +
          '<div class="grow">' +
            '<div class="fw-7">Demo location</div>' +
            '<div class="fs-xs t-2">Distances and ETAs are using the Indiranagar anchor. Tap to use your real position.</div>' +
          '</div>' +
          '<button type="button" class="btn btn--sm" data-act="use-real-location">' +
            icon('crosshair', 16) + '<span class="btn__label">Use my location</span>' +
          '</button>' +
          '</div>';
      })() +
      RA.map.shell('live-map', {
        size: 'tall', sheet: sheetFor(selected),
        aria: 'Map of mechanics online near you',
        fallbackTitle: list.length + ' mechanics online near you',
        fallbackText: 'Map tiles need an internet connection. The list below still works — distances and ETAs are calculated on your device.'
      }) +
      ui.section('Online right now',
        list.length
          ? ui.rows(list.map(function (m, i) {
              return ui.row({
                avatar: m.name, dot: true,
                title: m.name,
                sub: m.shop + ' · ' + U.miles(m.distanceMi) + ' · ' + U.mins(m.etaMin) + ' ETA',
                end: '<div class="row__end">' + ui.rating(m.rating) + '<span class="row__chev">' + icon('chevronR', 18) + '</span></div>',
                act: 'focus-mech', data: { 'data-id': m.id }, rise: i
              });
            }))
          : ui.empty({ icon: 'users', title: 'No mechanics online', text: 'Try again in a few minutes.' })),
      mount: function (root) {
        var sc = scope(root);
        var wrap = U.qs('#live-map-wrap', root);

        function paintSheet(m) {
          var old = U.qs('#map-sheet', wrap);
          if (!old) return;
          old.outerHTML = sheetFor(m);
          U.bindNav(wrap);
        }

        RA.map.mount('live-map', {
          center: me, zoom: 13, user: me, mechanics: list,
          selectedId: selected ? selected.id : null,
          scrollWheelZoom: true,
          onSelect: function (id) {
            var m = list.filter(function (x) { return x.id === id; })[0];
            RA.map.select('live-map', id, list);
            paintSheet(m);
          }
        });

        U.on(sc, 'click', '[data-act="focus-mech"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var m = list.filter(function (x) { return x.id === id; })[0];
          RA.map.select('live-map', id, list);
          paintSheet(m);
          if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        /* Re-prompt the browser for real coordinates. After it resolves the
           geolocationStatus selector will report isDemoCoordinates=false, and
           router.refresh() will repaint with the new center. */
        U.on(sc, 'click', '[data-act="use-real-location"]', function () {
          var s = S.get();
          var role = s && s.session && s.session.role;
          if (role && s.users && s.users[role] && s.users[role].geolocationError) {
            s.users[role].geolocationError = null;
          }
          if (typeof S.updateUserLocationFromGeolocation === 'function') {
            S.updateUserLocationFromGeolocation().then(function () { RA.router.refresh(); });
          } else {
            ui.toast('Geolocation is not available right now', 'warning');
          }
        });

        bindMechCards(root);
      }
    };
  };

  /* ======================================================================
     7. Tracking
     ====================================================================== */

  RA.views.tracking = function () {
    var r = sel().activeRequest();
    if (!r) {
      return {
        title: 'Track request', back: '/app',
        html: (function() {
          var geoStatus = sel().geolocationStatus();
          var notice = '';
          if (geoStatus.error) {
            switch (geoStatus.error.code) {
              case 1: // PERMISSION_DENIED
                notice = ui.notify({
                  title: 'Location Access Denied',
                  text: 'Location access was denied. To track your request, please allow location access in your browser settings.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              case 2: // POSITION_UNAVAILABLE
                notice = ui.notify({
                  title: 'Location Unavailable',
                  text: 'Unable to determine your location. Please check your device\'s location services and try again.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              case 3: // TIMEOUT
                notice = ui.notify({
                  title: 'Location Timeout',
                  text: 'The request to get your location timed out. Please try again.',
                  duration: 8000,
                  type: 'warning'
                });
                break;
              default:
                notice = ui.notify({
                  title: 'Location Error',
                  text: 'There was an error accessing your location: ' + geoStatus.error.message + '.',
                  duration: 8000,
                  type: 'warning'
                });
            }
          } else if (geoStatus.isDemoCoordinates) {
            notice = ui.notify({
              title: 'Using Saved Location',
              text: 'You are using your saved location. For the most accurate tracking, click the location icon to update your position.',
              duration: 5000,
              type: 'info'
            });
          }
          return notice;
        })() +
        ui.empty({
          icon: 'route',
          title: 'Nothing to track right now',
          text: 'When you have a live call-out this page shows the mechanic moving toward you, with a running ETA.',
          action: ui.btn({ label: 'Request assistance', icon: 'zap', nav: '/services' })
        })
      };
    }

    var m = sel().mechanic(r.mechanicId);
    var svc = sel().service(r.serviceId) || {};
    var veh = sel().vehicle(r.vehicleId);
    var route = (m && r.origin) ? U.curvedPath({ lat: m.lat, lng: m.lng }, r.origin) : null;

    var mechCard = m
      ? ui.card(
          '<div class="hstack gap-4 hwrap">' +
            ui.avatar(m.name, { dot: true }) +
            '<div class="grow">' +
              '<div class="hstack gap-2"><span class="fw-7">' + esc(m.name) + '</span>' +
                (m.verified ? '<span class="t-primary">' + icon('verified', 15) + '</span>' : '') + '</div>' +
              '<div class="fs-xs t-2">' + esc(m.shop) + '</div>' +
            '</div>' +
            '<span class="push">' + ui.rating(m.rating) + '</span>' +
          '</div>' +
          '<div class="hstack gap-3 mt-4">' +
            ui.btn({ label: 'Call ' + firstName(m.name), icon: 'phone', variant: 'success', cls: 'grow', act: 'call-mech' }) +
            ui.btn({ label: 'Message', icon: 'message', variant: 'secondary', act: 'message-mech' }) +
          '</div>',
          { cls: 'glass-card' }
        )
      : ui.card('<div class="hstack gap-3">' +
          '<span class="row__icon" style="--tint:var(--warning-15);--tone:var(--warning)">' + icon('radio', 19) + '</span>' +
          '<div class="grow"><div class="fw-6">Still searching</div>' +
          '<div class="fs-xs t-2">Broadcasting to mechanics in a widening radius.</div></div></div>',
          { cls: 'glass-card' }
        );

    var etaCard = ui.card(
      '<div class="hstack gap-4 hwrap">' +
        '<div class="grow">' + ui.statusPill(r.status) +
          '<div class="fs-h3 fw-7 mt-3" id="trk-title">' + esc(r.service) + '</div>' +
          '<div class="fs-xs t-2 mt-2 mono">' + esc(r.ref) + ' · ' + esc(U.fmtTime(r.at)) + '</div>' +
        '</div>' +
        '<div class="ta-c" style="flex:none">' +
          '<div class="fs-h3 fw-8 t-accent" id="trk-eta">' + esc(U.mins(r.etaMin)) + '</div>' +
          '<div class="fs-xs t-3">estimated arrival</div>' +
        '</div>' +
      '</div>' +
      '<div class="mt-5" id="trk-meter">' + ui.meter(((S.STATUS_META[r.status] || {}).step / 5) * 100) + '</div>',
      { variant: 'navy', cls: 'glass-card' }
);

    var actionsCard = ui.card(
      '<h2 class="section__title mb-4">Options</h2>' +
      ui.rows([
        ui.row({ icon: 'shield', tint: 'var(--danger-15)', tone: 'var(--danger)',
                 title: 'Share live location', sub: 'Send this job to an emergency contact', chev: true, act: 'share-loc' }),
        ui.row({ icon: 'refresh', tint: 'var(--primary-15)', tone: 'var(--primary)',
                 title: 'Advance the simulation', sub: 'Demo control — jump to the next stage', chev: true, act: 'advance' }),
        ui.row({ icon: 'xCircle', tint: 'var(--danger-15)', tone: 'var(--danger)',
                 title: 'Cancel this request', sub: 'Free until the mechanic arrives', chev: true, act: 'cancel-req' })
      ]));

    var detailsCard = ui.card(
      '<h2 class="section__title mb-4">Request details</h2>' +
      ui.dl([
        ['Reference', r.ref],
        ['Service', r.service],
        ['Location', r.address],
        ['Vehicle', vehLabel(veh)],
        ['Quoted', U.money(r.amount)],
        r.note ? ['Your note', r.note] : null
      ]));

    return {
      title: 'Tracking ' + r.ref,
      sub: (S.STATUS_META[r.status] || {}).label,
      back: '/app',
      html: (function() {
        var geoStatus = sel().geolocationStatus();
        var notice = '';
        if (geoStatus.error) {
          switch (geoStatus.error.code) {
            case 1: // PERMISSION_DENIED
              notice = ui.notify({
                title: 'Location Access Denied',
                text: 'Location access was denied. For accurate tracking and ETAs, please allow location access in your browser settings.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 2: // POSITION_UNAVAILABLE
              notice = ui.notify({
                title: 'Location Unavailable',
                text: 'Unable to determine your location. Please check your device\'s location services and try again. The ETA and status above are still accurate.',
                duration: 8000,
                type: 'warning'
              });
              break;
            case 3: // TIMEOUT
              notice = ui.notify({
                title: 'Location Timeout',
                text: 'The request to get your location timed out. Please try again. The ETA and status above are still accurate.',
                duration: 8000,
                type: 'warning'
              });
              break;
            default:
              notice = ui.notify({
                title: 'Location Error',
                text: 'There was an error accessing your location: ' + geoStatus.error.message + '. The ETA and status above are still accurate.',
                duration: 8000,
                type: 'warning'
              });
          }
        } else if (geoStatus.isDemoCoordinates) {
          notice = ui.notify({
            title: 'Using Saved Location',
            text: 'You are using your saved location. For the most accurate tracking and ETAs, click the location icon to update your position.',
            duration: 5000,
            type: 'info'
          });
        }
        return notice;
      })() +
      '<div class="stack stack-5">' + etaCard +
        RA.map.shell('trk-map', {
          size: 'panel',
          aria: 'Live position of your mechanic',
          fallbackTitle: 'Live tracking unavailable offline',
          fallbackText: 'The ETA and status above keep updating — only the map tiles need a connection.'
        }) + '</div>' +
        '<div class="detail mt-5">' +
          '<div class="stack stack-5">' + mechCard +
            ui.card('<h2 class="section__title mb-4">Progress</h2><div id="trk-steps">' + requestSteps(r) + '</div>') +
          '</div>' +
          '<div class="stack stack-5 detail__aside">' + detailsCard + actionsCard + '</div>' +
        '</div>',

      mount: function (root) {
        var sc = scope(root);
        var id = r.id;
        var mapId = 'trk-map';
        var timer = null;

        // Always show the map: assigned mechanic when known, else a live
        // preview of the top-3 eligible mechanics so the user sees themself
        // relative to the fleet even while still searching.
        var previewMechs = [];
        if (m) {
          previewMechs = [Object.assign({}, m, {
            lat: r.mechanicPos ? r.mechanicPos.lat : m.lat,
            lng: r.mechanicPos ? r.mechanicPos.lng : m.lng,
            etaMin: r.etaMin, distanceMi: U.distanceMiles(r.origin, r.mechanicPos || m)
          })];
        } else if (r.origin) {
          try {
            previewMechs = sel().eligibleMechanics(r.origin, r.serviceId, { radiusKm: 25 })
              .slice(0, 3).map(function (e) {
                return Object.assign({}, e.mechanic, { etaMin: e.etaMin, distanceMi: e.distanceKm });
              });
          } catch (e) { previewMechs = []; }
        }
        if (r.origin) {
          RA.map.mount(mapId, {
            center: r.origin, zoom: 14, user: r.origin, userLabel: true,
            mechanics: previewMechs,
            selectedId: m ? m.id : null, route: route
          });
        }

        function paint(req) {
          var eta = U.qs('#trk-eta', root);
          var meter = U.qs('#trk-meter', root);
          if (eta) eta.textContent = U.mins(req.etaMin);
          if (meter) meter.innerHTML = ui.meter(((S.STATUS_META[req.status] || {}).step / 5) * 100);
          if (route && req.mechanicPos) {
            var i = Math.min(route.length - 1, Math.round((req.progress || 0) * (route.length - 1)));
            req.mechanicPos = route[i];
            RA.map.moveMechanic(mapId, req.mechanicId, route[i]);
          }
        }

        timer = setInterval(function () {
          var req = sel().request(id);
          if (!req) { clearInterval(timer); return; }

          if (req.status === 'searching') {
            act().advanceRequest(id);
            RA.router.refresh();
            return;
          }
          if (req.status === 'completed' || req.status === 'cancelled') {
            clearInterval(timer);
            RA.router.go('/history/' + id + (req.status === 'completed' ? '?review=1' : ''));
            return;
          }
          if (req.status === 'assigned' || req.status === 'en_route') {
            var before = req.status;
            act().tickRequest(id, 0.07);
            var after = sel().request(id).status;
            if (after !== before) { RA.router.refresh(); return; }
            paint(sel().request(id));
            return;
          }
          // arrived / in_progress — nudge forward so the demo completes.
          act().advanceRequest(id);
          RA.router.refresh();
        }, 1800);

        U.on(sc, 'click', '[data-act="call-mech"]', function () {
          if (m) callModal(m.name, m.phone);
        });

        U.on(sc, 'click', '[data-act="message-mech"]', function () {
          ui.toast('In-app messaging needs a real backend — try the call button', 'info');
        });

        U.on(sc, 'click', '[data-act="advance"]', function () {
          act().advanceRequest(id);
          var req = sel().request(id);
          ui.toast('Status: ' + (S.STATUS_META[req.status] || {}).label, 'info');
          if (req.status === 'completed') RA.router.go('/history/' + id + '?review=1');
          else RA.router.refresh();
        });

        U.on(sc, 'click', '[data-act="share-loc"]', function () {
          var contacts = S.get().contacts.filter(function (c) { return !c.locked; });
          ui.modal({
            icon: 'shield', tint: 'var(--danger-15)', tone: 'var(--danger)',
            title: 'Share live location',
            text: 'Pick who should be able to follow this job.',
            body: contacts.length
              ? ui.rows(contacts.map(function (c) {
                  return ui.row({ avatar: c.name, title: c.name, sub: c.relation + ' · ' + c.phone,
                                  chev: true, act: 'share-to', data: { 'data-name': c.name } });
                }))
              : ui.empty({ icon: 'shield', title: 'No contacts saved', text: 'Add one from the Emergency Contacts page first.' }),
            cancel: 'Close'
          });
          var mr = U.qs('#modal-root');
          U.on(mr, 'click', '[data-act="share-to"]', function (e2, node2) {
            ui.closeModal();
            ui.toast('Live location shared with ' + node2.getAttribute('data-name'), 'success');
          });
        });

        U.on(sc, 'click', '[data-act="cancel-req"]', function () {
          ui.confirmDanger({
            title: 'Cancel ' + r.ref + '?',
            text: 'The mechanic will be released to other jobs. You will not be charged.',
            confirm: 'Cancel request', cancel: 'Keep it',
            body: '<form>' + ui.field({ label: 'Reason (optional)', name: 'reason', type: 'select',
              options: ['Problem resolved itself', 'Found help elsewhere', 'Taking too long', 'Requested by mistake', 'Other'] }) + '</form>',
            onConfirm: function (data) {
              var cancelled = act().cancelRequest(id, data && data.reason);
              if (!cancelled) {
                ui.toast('This request can no longer be cancelled — the mechanic has already arrived.', 'danger');
                return;
              }
              clearInterval(timer);
              ui.toast('Request cancelled', 'info');
              RA.router.go('/history/' + id);
            }
          });
        });

        return function () { clearInterval(timer); };
      }
    };
  };

  /* ======================================================================
     8. History
     ====================================================================== */

  RA.views.history = function () {
    var list = sel().history();
    var spend = sel().spendStats();
    var byService = Object.keys(spend.byService).map(function (k) {
      var s = sel().service(k) || { name: k, tone: 'var(--primary)' };
      return { label: s.name, value: spend.byService[k].length, color: s.tone, display: spend.byService[k].length };
    });

    var rows = list.map(function (r, i) {
      var svc = sel().service(r.serviceId) || {};
      return '<div data-hist data-status="' + U.escAttr(r.status) + '">' +
        ui.row({
          icon: svc.icon || 'wrench', tint: svc.tint, tone: svc.tone,
          title: r.service,
          badge: r.status === 'cancelled' ? ' <span class="pill pill--danger" style="margin-left:8px">Cancelled</span>' : '',
          sub: r.mechanic + ' · ' + U.fmtDate(r.at) + (r.rating ? ' · ' + Number(r.rating).toFixed(1) + '★' : ''),
          amount: r.status === 'cancelled' ? '—' : U.money(r.amount, false),
          time: U.relTime(r.at),
          chev: true, nav: '/history/' + r.id, rise: i
        }) + '</div>';
    }).join('');

    return {
      title: 'Service history',
      sub: list.length + ' ' + U.pluralize(list.length, 'record'),
      back: '/app',
      actions: '<button type="button" class="iconbtn" data-act="print-history" aria-label="Print history">' +
        icon('print', 20) + '</button>',
      html: ui.pageTitle('Your call-outs',
        'Every request, receipt and rating stays on file — useful for warranty claims and when you sell the vehicle.') +

        '<div class="grid grid--stats">' +
          ui.stat({ label: 'Completed', value: U.num(spend.completed), icon: 'checkCircle', rise: 0,
                    tint: 'var(--success-15)', tone: 'var(--success)' }) +
          ui.stat({ label: 'Total spent', value: U.money(spend.totalSpent, false), icon: 'dollar', rise: 1,
                    tint: 'var(--primary-15)', tone: 'var(--primary)' }) +
          ui.stat({ label: 'Average job', value: U.money(spend.avgSpend, false), icon: 'chart', rise: 2,
                    tint: 'var(--accent-15)', tone: 'var(--accent)' }) +
          ui.stat({ label: 'Rating given', value: spend.avgRatingGiven ? spend.avgRatingGiven.toFixed(1) : '—',
                    icon: 'star', rise: 3, tint: 'var(--warning-15)', tone: 'var(--warning)' }) +
        '</div>' +

        (byService.length ? ui.section('Where your money went',
          ui.card(ui.donut(byService, { aria: 'Call-outs by service type' }))) : '') +

        ui.section('All records',
          '<div class="mb-4">' + ui.chipRow([
            { value: 'all', label: 'All' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' }
          ], 'all', 'hist-filter') + '</div>' +
          (list.length
            ? '<div class="rows" id="hist-list">' + rows + '</div>' +
              '<div id="hist-empty" hidden>' + ui.empty({ icon: 'history', title: 'Nothing in this filter', text: 'Try “All”.' }) + '</div>'
            : ui.empty({
                icon: 'history', title: 'No call-outs yet',
                text: 'Once you request assistance, the record and receipt land here.',
                action: ui.btn({ label: 'Request assistance', nav: '/services' })
              }))),

      mount: function (root) {
        var sc = scope(root);
        var nodes = U.qsa('[data-hist]', root);
        var emptyNode = U.qs('#hist-empty', root);

        U.on(sc, 'click', '[data-act="hist-filter"]', function (e, node) {
          var v = node.getAttribute('data-value');
          U.qsa('[data-act="hist-filter"]', root).forEach(function (b) { b.classList.remove('is-active'); });
          node.classList.add('is-active');
          var shown = 0;
          nodes.forEach(function (n) {
            var show = v === 'all' || n.getAttribute('data-status') === v;
            n.hidden = !show;
            if (show) shown++;
          });
          if (emptyNode) emptyNode.hidden = shown > 0;
        });

        U.on(sc, 'click', '[data-act="print-history"]', function () { window.print(); });
      }
    };
  };

  /* ======================================================================
     9. History detail / receipt
     ====================================================================== */

  RA.views.historyDetail = function (params, q) {
    var r = sel().request(params.id);
    if (!r) {
      return {
        title: 'Record not found', back: '/history',
        html: ui.empty({
          icon: 'file', title: 'We can’t find that call-out',
          text: 'It may have been cleared with the demo data.',
          action: ui.btn({ label: 'Back to history', nav: '/history' })
        })
      };
    }

    var svc = sel().service(r.serviceId) || {};
    var m = sel().mechanic(r.mechanicId);
    var veh = sel().vehicle(r.vehicleId);
    var fee = r.status === 'cancelled' ? 0 : PLATFORM_FEE;
    var live = r.status !== 'completed' && r.status !== 'cancelled';

    var receipt = ui.card(
      '<div class="hstack gap-3 hwrap mb-4">' +
        '<span class="svc__icon" style="--tint:' + U.escAttr(svc.tint || 'var(--primary-15)') +
          ';--tone:' + U.escAttr(svc.tone || 'var(--primary)') + '">' + icon(svc.icon || 'wrench', 22) + '</span>' +
        '<div class="grow"><div class="fs-h3 fw-7">' + esc(r.service) + '</div>' +
          '<div class="fs-xs t-2 mono">' + esc(r.ref) + '</div></div>' +
        ui.statusPill(r.status) +
      '</div>' +
      '<div class="receipt">' +
        '<div class="receipt__row"><span>Call-out rate</span><span class="push">' + esc(U.money(r.status === 'cancelled' ? 0 : r.amount)) + '</span></div>' +
        '<div class="receipt__row"><span>Platform fee</span><span class="push">' + esc(U.money(fee)) + '</span></div>' +
        (r.durationMin ? '<div class="receipt__row t-2"><span>On-site time</span><span class="push">' + esc(U.mins(r.durationMin)) + '</span></div>' : '') +
        '<div class="receipt__total"><span>' + (r.status === 'cancelled' ? 'Not charged' : 'Total') + '</span>' +
          '<span class="push">' + esc(U.money((r.status === 'cancelled' ? 0 : r.amount) + fee)) + '</span></div>' +
      '</div>' +
      '<div class="hstack gap-3 mt-5 hwrap">' +
        ui.btn({ label: 'Print receipt', variant: 'secondary', icon: 'print', act: 'print-receipt' }) +
        ui.btn({ label: 'Copy reference', variant: 'secondary', icon: 'file', act: 'copy-ref' }) +
        (live ? ui.btn({ label: 'Track live', icon: 'route', nav: '/track' }) : '') +
      '</div>');

    var ratingCard = (r.status === 'completed')
      ? ui.card(
          '<h2 class="section__title mb-4">Your rating</h2>' +
          (r.rating
            ? '<div class="hstack gap-3">' + ui.stars(r.rating, { size: 22 }) +
              '<span class="fw-7">' + Number(r.rating).toFixed(1) + ' / 5</span></div>' +
              '<p class="fs-xs t-2 mt-3">Thanks — this feeds into ' + esc(r.mechanic) + '’s score.</p>'
            : '<p class="fs-sm t-2 mb-4">You haven’t rated this call-out yet.</p>' +
              ui.btn({ label: 'Leave a rating', icon: 'star', act: 'rate' })))
      : '';

    var aside = '<div class="stack stack-5 detail__aside">' +
      ui.card('<h2 class="section__title mb-4">Details</h2>' +
        ui.dl([
          ['Date', U.fmtDateTime(r.at)],
          ['Location', r.address],
          ['Vehicle', vehLabel(veh)],
          ['Mechanic', r.mechanic],
          r.durationMin ? ['Duration', U.mins(r.durationMin)] : null,
          r.note ? ['Note', r.note] : null
        ])) +
      (m ? ui.card(
        '<div class="hstack gap-3">' + ui.avatar(m.name, { size: 'sm', dot: m.online }) +
          '<div class="grow"><div class="fw-6">' + esc(m.name) + '</div>' +
          '<div class="fs-xs t-2">' + esc(m.shop) + '</div></div>' +
          '<span class="push">' + ui.rating(m.rating) + '</span></div>' +
        '<div class="hstack gap-3 mt-4">' +
          ui.btn({ label: 'Profile', variant: 'secondary', size: 'sm', cls: 'grow', nav: '/mechanic/' + m.id }) +
          ui.btn({ label: 'Book again', size: 'sm', cls: 'grow', nav: '/services?mech=' + m.id }) +
        '</div>') : '') +
      '</div>';

    return {
      title: r.ref,
      sub: r.service,
      back: '/history',
      html: '<div class="detail">' +
        '<div class="stack stack-5">' + receipt +
          ui.card('<h2 class="section__title mb-4">Timeline</h2>' + requestSteps(r)) +
          ratingCard +
        '</div>' + aside + '</div>',

      mount: function (root) {
        var sc = scope(root);

        function openReview() {
          reviewModal(r, function () { RA.router.refresh(); });
        }

        U.on(sc, 'click', '[data-act="rate"]', openReview);
        U.on(sc, 'click', '[data-act="print-receipt"]', function () { window.print(); });
        U.on(sc, 'click', '[data-act="copy-ref"]', function () { ui.copy(r.ref, 'Reference'); });

        if (q.review && r.status === 'completed' && !r.rating) {
          setTimeout(openReview, 420);
        }
      }
    };
  };

  /* ======================================================================
     10. Vehicles
     ====================================================================== */

  function vehicleForm(v) {
    v = v || {};
    return '<form>' +
      ui.field({ label: 'Make', name: 'make', placeholder: 'Tesla', icon: 'car', value: v.make }) +
      ui.field({ label: 'Model', name: 'model', placeholder: 'Model 3', value: v.model }) +
      ui.field({ label: 'Year', name: 'year', type: 'text', inputmode: 'numeric', placeholder: '2023', value: v.year }) +
      ui.field({ label: 'License plate', name: 'plate', placeholder: 'KA-05-MN-4321', value: v.plate }) +
      ui.field({ label: 'Colour', name: 'color', placeholder: 'Midnight Silver', value: v.color }) +
      ui.field({ label: 'Fuel', name: 'fuel', type: 'select', value: v.fuel,
        options: ['Petrol', 'Diesel', 'Hybrid', 'Electric'] }) +
      '</form>';
  }

  var VEH_RULES = {
    make: U.validate.required,
    model: U.validate.required,
    plate: U.validate.plate,
    year: U.validate.year
  };

  RA.views.vehicles = function () {
    var list = S.get().vehicles;

    return {
      title: 'My vehicles',
      sub: list.length + ' saved',
      back: '/app',
      actions: '<button type="button" class="iconbtn" data-act="add-vehicle" aria-label="Add a vehicle">' +
        icon('plus', 20) + '</button>',
      html: ui.pageTitle('Saved vehicles',
        'The mechanic sees the make, model and plate before they set off, so they arrive with the right equipment.') +

        (list.length
          ? '<div class="grid grid--cards">' + list.map(function (v, i) {
              return ui.card(
                '<div class="hstack gap-3 hwrap mb-4">' +
                  '<span class="row__icon" style="--tint:var(--primary-15);--tone:var(--primary)">' + icon('car', 20) + '</span>' +
                  '<div class="grow"><div class="fw-7">' + esc(v.year + ' ' + v.make + ' ' + v.model) + '</div>' +
                    '<div class="fs-xs t-2 mono">' + esc(v.plate) + '</div></div>' +
                  (v.isDefault ? ui.pill('Default', 'primary') : '') +
                '</div>' +
                ui.dl([['Colour', v.color], ['Fuel', v.fuel]]) +
                '<div class="hstack gap-2 mt-4 hwrap">' +
                  (v.isDefault ? '' : ui.btn({ label: 'Make default', variant: 'secondary', size: 'sm',
                    act: 'default-vehicle', data: { 'data-id': v.id } })) +
                  ui.btn({ label: 'Edit', variant: 'secondary', size: 'sm', icon: 'edit',
                    act: 'edit-vehicle', data: { 'data-id': v.id } }) +
                  '<button type="button" class="squarebtn push" data-act="delete-vehicle" data-id="' + U.escAttr(v.id) +
                    '" aria-label="Remove ' + U.escAttr(v.plate) + '">' + icon('trash', 18) + '</button>' +
                '</div>',
                { rise: i });
            }).join('') + '</div>'
          : ui.empty({
              icon: 'car', title: 'No vehicles saved',
              text: 'Add one now and requesting help later takes a single tap.',
              action: ui.btn({ label: 'Add a vehicle', icon: 'plus', act: 'add-vehicle' })
            })) +

        '<div class="mt-5">' + ui.btn({ label: 'Add another vehicle', icon: 'plus', variant: 'secondary', act: 'add-vehicle' }) + '</div>',

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="add-vehicle"]', function () {
          ui.modal({
            wide: true, icon: 'car', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: 'Add a vehicle', body: vehicleForm(),
            confirm: 'Save vehicle', cancel: 'Cancel',
            onConfirm: function (data, box) {
              var form = U.qs('form', box);
              if (!ui.validateForm(form, VEH_RULES)) return false;
              act().addVehicle(data);
              ui.toast('Vehicle added', 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="edit-vehicle"]', function (e, node) {
          var v = sel().vehicle(node.getAttribute('data-id'));
          if (!v) return;
          ui.modal({
            wide: true, icon: 'edit', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: 'Edit ' + v.plate, body: vehicleForm(v),
            confirm: 'Save changes', cancel: 'Cancel',
            onConfirm: function (data, box) {
              var form = U.qs('form', box);
              if (!ui.validateForm(form, VEH_RULES)) return false;
              act().updateVehicle(v.id, {
                make: data.make, model: data.model, year: Number(data.year) || v.year,
                plate: (data.plate || '').toUpperCase(), color: data.color, fuel: data.fuel
              });
              ui.toast('Vehicle updated', 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="default-vehicle"]', function (e, node) {
          act().setDefaultVehicle(node.getAttribute('data-id'));
          ui.toast('Default vehicle changed', 'success');
          RA.router.refresh();
        });

        U.on(sc, 'click', '[data-act="delete-vehicle"]', function (e, node) {
          var v = sel().vehicle(node.getAttribute('data-id'));
          if (!v) return;
          ui.confirmDanger({
            title: 'Remove ' + v.plate + '?',
            text: 'Past call-outs for this vehicle stay in your history.',
            confirm: 'Remove', cancel: 'Keep',
            onConfirm: function () {
              act().deleteVehicle(v.id);
              ui.toast('Vehicle removed', 'info');
              RA.router.refresh();
            }
          });
        });
      }
    };
  };

  /* ======================================================================
     11. Emergency contacts
     ====================================================================== */

  RA.views.emergency = function () {
    var list = S.get().contacts;
    var active = sel().activeRequest();

    return {
      title: 'Emergency contacts',
      sub: list.length + ' on file',
      back: '/app',
      actions: '<button type="button" class="iconbtn" data-act="add-contact" aria-label="Add a contact">' +
        icon('plus', 20) + '</button>',
      html: ui.pageTitle('People we can alert',
        'One tap shares your live location and job details. Nothing is sent without you choosing to send it.') +

        ui.card(
          '<div class="hstack gap-4 hwrap">' +
            '<span class="row__icon" style="--tint:var(--danger-15);--tone:var(--danger)">' + icon('shield', 22) + '</span>' +
            '<div class="grow"><div class="fw-7">Share my live location</div>' +
              '<div class="fs-xs t-2">' + (active
                ? 'You have a live call-out (' + esc(active.ref) + ') that can be shared right now.'
                : 'Available whenever you have a live call-out in progress.') + '</div></div>' +
            ui.btn({ label: active ? 'Share now' : 'Nothing live', variant: active ? 'danger' : 'secondary',
                     disabled: !active, act: 'share-now' }) +
          '</div>', { variant: 'navy' }) +

        ui.section('Contacts', ui.rows(list.map(function (c, i) {
          return ui.row({
            avatar: c.name,
            title: c.name,
            badge: c.locked ? ' <span class="pill pill--danger" style="margin-left:8px">Always available</span>' : '',
            sub: c.relation + ' · ' + c.phone,
            end: '<div class="row__end">' +
              '<button type="button" class="squarebtn" data-act="call-contact" data-phone="' + U.escAttr(c.phone) +
                '" data-name="' + U.escAttr(c.name) + '" aria-label="Call ' + U.escAttr(c.name) + '">' + icon('phone', 18) + '</button>' +
              (c.locked ? '' :
                '<button type="button" class="squarebtn" data-act="delete-contact" data-id="' + U.escAttr(c.id) +
                '" aria-label="Remove ' + U.escAttr(c.name) + '">' + icon('trash', 18) + '</button>') +
              '</div>',
            rise: i
          });
        }))) +

        '<div class="mt-5">' + ui.btn({ label: 'Add a contact', icon: 'plus', variant: 'secondary', act: 'add-contact' }) + '</div>',

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="add-contact"]', function () {
          ui.modal({
            icon: 'shield', tint: 'var(--danger-15)', tone: 'var(--danger)',
            title: 'Add an emergency contact',
            body: '<form>' +
              ui.field({ label: 'Name', name: 'name', placeholder: 'John Developer', icon: 'person' }) +
              ui.field({ label: 'Relationship', name: 'relation', type: 'select',
                options: ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Colleague', 'Other'] }) +
              ui.field({ label: 'Phone number', name: 'phone', type: 'tel', placeholder: '+91 98456 11122', icon: 'phone' }) +
              '</form>',
            confirm: 'Add contact', cancel: 'Cancel',
            onConfirm: function (data, box) {
              var form = U.qs('form', box);
              if (!ui.validateForm(form, { name: U.validate.required, phone: U.validate.phone })) return false;
              act().addContact(data);
              ui.toast('Contact added', 'success');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="call-contact"]', function (e, node) {
          callModal(node.getAttribute('data-name'), node.getAttribute('data-phone'));
        });

        U.on(sc, 'click', '[data-act="delete-contact"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var c = S.get().contacts.filter(function (x) { return x.id === id; })[0];
          if (!c) return;
          ui.confirmDanger({
            title: 'Remove ' + c.name + '?',
            text: 'They will no longer be offered when you share a live location.',
            confirm: 'Remove', cancel: 'Keep',
            onConfirm: function () {
              act().deleteContact(id);
              ui.toast('Contact removed', 'info');
              RA.router.refresh();
            }
          });
        });

        U.on(sc, 'click', '[data-act="share-now"]', function () {
          if (!active) return;
          ui.toast('Live location shared with your contacts', 'success');
        });
      }
    };
  };

  /* ======================================================================
     12. Notifications
     ====================================================================== */

  RA.views.notifications = function () {
    var list = sel().notifications();
    var unread = sel().unreadCount();

    return {
      title: 'Notifications',
      sub: unread ? unread + ' unread' : 'All caught up',
      back: sel().role() === 'customer' ? '/app' : RA.chrome.NAV[sel().role()].home,
      actions: (unread
        ? '<button type="button" class="iconbtn" data-act="read-all" aria-label="Mark all as read">' + icon('check', 20) + '</button>'
        : '') +
        '<button type="button" class="iconbtn" data-nav="/settings" aria-label="Notification settings">' + icon('settings', 20) + '</button>',
      html: (list.length
        ? (unread ? '<div class="mb-4">' + ui.btn({ label: 'Mark all ' + unread + ' as read', variant: 'secondary', size: 'sm', icon: 'check', act: 'read-all' }) + '</div>' : '') +
          ui.rows(list.map(function (n, i) {
            return ui.row({
              icon: n.icon, tint: 'rgba(255,255,255,.06)', tone: n.tone,
              title: n.title,
              sub: n.body,
              time: U.relTime(n.at),
              chev: true,
              unread: !n.read,
              act: 'open-ntf',
              data: { 'data-id': n.id, 'data-type': n.type },
              rise: i
            });
          }))
        : ui.empty({
            icon: 'bell', title: 'Nothing here yet',
            text: 'Dispatch updates, receipts and offers will appear on this page.',
            action: ui.btn({ label: 'Back to dashboard', nav: '/app' })
          })),

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="read-all"]', function () {
          act().markAllRead();
          ui.toast('All notifications marked as read', 'success');
          RA.router.refresh();
        });

        U.on(sc, 'click', '[data-act="open-ntf"]', function (e, node) {
          var id = node.getAttribute('data-id');
          var type = node.getAttribute('data-type');
          act().markRead(id);
          var n = S.get().notifications.filter(function (x) { return x.id === id; })[0];

          if (type === 'dispatch' && sel().activeRequest()) { RA.router.go('/track'); return; }
          if (type === 'receipt' || type === 'complete') {
            var last = sel().history()[0];
            if (last) { RA.router.go('/history/' + last.id); return; }
          }
          ui.modal({
            icon: n ? n.icon : 'bell', tint: 'rgba(255,255,255,.06)', tone: n ? n.tone : 'var(--primary)',
            title: n ? n.title : 'Notification',
            text: n ? n.body : '',
            cancel: 'Close',
            onCancel: function () { RA.router.refresh(); }
          });
        });
      }
    };
  };

  /* ======================================================================
     13. Profile
     ====================================================================== */

  RA.views.profile = function () {
    var me = sel().me();
    var spend = sel().spendStats();
    var state = S.get();

    return {
      title: 'Profile',
      sub: me.email,
      back: '/app',
      actions: '<button type="button" class="iconbtn" data-act="edit-profile" aria-label="Edit profile">' +
        icon('edit', 20) + '</button>',
      html: '<div class="detail">' +
        '<div class="stack stack-5">' +
          ui.card(
            '<div class="hstack gap-4 hwrap">' +
              ui.avatar(me.name, { size: 'xl' }) +
              '<div class="grow">' +
                '<div class="fs-h3 fw-8">' + esc(me.name) + '</div>' +
                '<div class="t-2 fs-sm mt-2">' + esc(me.email) + '</div>' +
                '<div class="hstack gap-2 mt-3 hwrap">' +
                  ui.pill(me.plan || 'Standard', 'primary') +
                  ui.pill('Member since ' + me.memberSince, 'accent') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="hstack gap-3 mt-5 hwrap">' +
              ui.btn({ label: 'Edit profile', icon: 'edit', variant: 'secondary', act: 'edit-profile' }) +
              ui.btn({ label: 'Upgrade plan', icon: 'sparkles', nav: '/pricing' }) +
            '</div>', { variant: 'navy' }) +

          ui.card('<h2 class="section__title mb-4">Account details</h2>' +
            ui.dl([
              ['Full name', me.name],
              ['Email', me.email],
              ['Mobile', me.phone],
              ['Home area', me.address],
              ['Plan', me.plan || 'Standard'],
              ['Member since', me.memberSince]
            ])) +

          ui.card('<h2 class="section__title mb-4">Your activity</h2>' +
            '<div class="grid grid--2">' +
              ui.stat({ label: 'Call-outs', value: U.num(spend.completed), icon: 'history',
                        tint: 'var(--primary-15)', tone: 'var(--primary)' }) +
              ui.stat({ label: 'Total spent', value: U.money(spend.totalSpent, false), icon: 'dollar',
                        tint: 'var(--success-15)', tone: 'var(--success)' }) +
              ui.stat({ label: 'Vehicles', value: U.num(state.vehicles.length), icon: 'car',
                        tint: 'var(--accent-15)', tone: 'var(--accent)' }) +
              ui.stat({ label: 'Contacts', value: U.num(state.contacts.length), icon: 'shield',
                        tint: 'var(--danger-15)', tone: 'var(--danger)' }) +
            '</div>') +
        '</div>' +

        '<div class="stack stack-5 detail__aside">' +
          ui.card('<h2 class="section__title mb-4">Shortcuts</h2>' + ui.rows([
            ui.row({ icon: 'car', tint: 'var(--primary-15)', tone: 'var(--primary)',
                     title: 'My vehicles', sub: state.vehicles.length + ' saved', chev: true, nav: '/vehicles' }),
            ui.row({ icon: 'shield', tint: 'var(--danger-15)', tone: 'var(--danger)',
                     title: 'Emergency contacts', sub: state.contacts.length + ' on file', chev: true, nav: '/emergency' }),
            ui.row({ icon: 'history', tint: 'var(--accent-15)', tone: 'var(--accent)',
                     title: 'Service history', sub: sel().history().length + ' records', chev: true, nav: '/history' }),
            ui.row({ icon: 'settings', tint: 'rgba(255,255,255,.06)', tone: 'var(--text-2)',
                     title: 'Settings', sub: 'Notifications, privacy, demo data', chev: true, nav: '/settings' })
          ])) +
          ui.card('<h2 class="section__title mb-4">Session</h2>' +
            '<p class="fs-xs t-2 mb-4">This demo keeps everything in your browser. Signing out does not delete it.</p>' +
            ui.btn({ label: 'Sign out', variant: 'danger', icon: 'logout', block: true, act: 'sign-out' }),
            { variant: 'flat' }) +
        '</div>' +
        '</div>',

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'click', '[data-act="edit-profile"]', function () {
          ui.modal({
            wide: true, icon: 'person', tint: 'var(--primary-15)', tone: 'var(--primary)',
            title: 'Edit profile',
            body: '<form>' +
              ui.field({ label: 'Full name', name: 'name', value: me.name, icon: 'person' }) +
              ui.field({ label: 'Email', name: 'email', type: 'email', value: me.email, icon: 'mail' }) +
              ui.field({ label: 'Mobile', name: 'phone', type: 'tel', value: me.phone, icon: 'phone' }) +
              ui.field({ label: 'Home area', name: 'address', value: me.address, icon: 'pin' }) +
              '</form>',
            confirm: 'Save changes', cancel: 'Cancel',
            onConfirm: function (data, box) {
              var form = U.qs('form', box);
              if (!ui.validateForm(form, {
                name: U.validate.required, email: U.validate.email, phone: U.validate.phone
              })) return false;
              act().updateProfile(data);
              ui.toast('Profile updated', 'success');
              RA.router.refresh();
            }
          });
        });
      }
    };
  };

  /* ======================================================================
     14. Settings (shared by all three portals)
     ====================================================================== */

  RA.views.settings = function () {
    var st = S.get();
    var s = st.settings;
    var role = sel().role() || 'customer';

    return {
      title: 'Settings',
      sub: RA.chrome.NAV[role].label + ' portal',
      back: RA.chrome.NAV[role].home,
      html: ui.pageTitle('Settings', 'Preferences are stored in this browser only.') +

        ui.section('Notifications', ui.card('<div class="stack">' +
          ui.switchRow({ icon: 'bell', label: 'Push notifications', name: 'pushNotifications',
            sub: 'Dispatch updates, arrival alerts and receipts', checked: s.pushNotifications, act: 'set' }) +
          ui.switchRow({ icon: 'mail', label: 'Email receipts', name: 'emailReceipts',
            sub: 'A PDF receipt after every completed call-out', checked: s.emailReceipts, act: 'set' }) +
          '</div>', { variant: 'pad-0', cls: 'p-0' })) +

        ui.section('Privacy', ui.card('<div class="stack">' +
          ui.switchRow({ icon: 'pin', label: 'Location tracking', name: 'locationTracking',
            sub: 'Needed to dispatch a mechanic to you', checked: s.locationTracking, act: 'set' }) +
          ui.switchRow({ icon: 'eye', label: 'Dark interface', name: 'darkMode',
            sub: 'RoadAssist is dark-first; light mode is not built yet', checked: s.darkMode, act: 'set' }) +
          '</div>')) +

        ui.section('Preferences', ui.card(
          '<form id="pref-form">' +
            ui.field({ label: 'Language', name: 'language', type: 'select', value: s.language,
              options: ['English (US)', 'English (UK)', 'Español', 'Français', 'Deutsch', 'हिन्दी'] }) +
          '</form>' +
          ui.dl([
            ['Data source', RA.data.name === 'demo' ? 'Demo (seeded, in-browser)' : RA.data.name],
            ['Storage', U.storage.available ? 'localStorage' : 'in-memory (private mode)'],
            ['Map tiles', RA.map.available() ? 'Leaflet + CARTO' : 'unavailable offline'],
            ['Saved records', st.requests.length + ' requests · ' + st.notifications.length + ' notifications']
          ]))) +

        ui.section('About', ui.card(ui.rows([
          ui.row({ icon: 'info', title: 'How RoadAssist works', sub: 'Dispatch flow, pricing and FAQs', chev: true, nav: '/features' }),
          ui.row({ icon: 'dollar', title: 'Plans and pricing', sub: 'Pay as you go, Priority, Fleet', chev: true, nav: '/pricing' }),
          ui.row({ icon: 'message', title: 'Contact support', sub: '24/7 emergency line and email', chev: true, nav: '/contact' }),
          ui.row({ icon: 'building', title: 'About the company', sub: 'Who we are and what we won’t do', chev: true, nav: '/about' })
        ]))) +

        ui.section('Demo data', ui.card(
          '<p class="fs-sm t-2 mb-4">Requests, vehicles, contacts and approvals you create are saved in this browser. ' +
          'Resetting restores the original seeded data — the same starting point every reviewer sees.</p>' +
          '<div class="hstack gap-3 hwrap">' +
            ui.btn({ label: 'Reset demo data', variant: 'danger', icon: 'refresh', act: 'reset-demo' }) +
            ui.btn({ label: 'Add a test notification', variant: 'secondary', icon: 'bell', act: 'test-ntf' }) +
          '</div>', { variant: 'flat' })),

      mount: function (root) {
        var sc = scope(root);

        U.on(sc, 'change', 'input[type="checkbox"][data-act="set"]', function (e, node) {
          act().setSetting(node.name, node.checked);
          ui.toast(node.getAttribute('aria-label') + (node.checked ? ' on' : ' off'), 'info', 1600);
        });

        var langSelect = U.qs('#pref-form [name="language"]', root);
        if (langSelect) {
          langSelect.addEventListener('change', function () {
            act().setSetting('language', langSelect.value);
            ui.toast('Language set to ' + langSelect.value, 'success');
          });
        }

        U.on(sc, 'click', '[data-act="test-ntf"]', function () {
          act().pushNotification({
            title: 'Test notification',
            body: 'This is what a dispatch alert looks like.',
            icon: 'sparkles', tone: '#F59E0B', type: 'info'
          });
          S.notify();
          ui.toast('Notification added', 'success');
        });

        U.on(sc, 'click', '[data-act="reset-demo"]', function () {
          ui.confirmDanger({
            title: 'Reset all demo data?',
            text: 'Every request, vehicle, contact and approval you created will be replaced with the original seeded set.',
            confirm: 'Reset everything', cancel: 'Keep my data',
            onConfirm: function () {
              S.resetDemo().then(function () {
                ui.toast('Demo data restored', 'success');
                RA.router.go('/');
              });
            }
          });
        });
      }
    };
  };
})(window);
