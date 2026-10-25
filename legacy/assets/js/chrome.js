/* ==========================================================================
   RoadAssist Web — App chrome
   The shell every signed-in route renders inside: left rail (desktop),
   top bar, and bottom tab bar (mobile).

   One nav definition per role drives all three surfaces, so adding a route
   means editing exactly one array.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var ui = RA.ui;
  var esc = U.esc;
  var icon = RA.icon;

  /* ======================================================================
     Navigation definitions
     ====================================================================== */

  var NAV = {
    customer: {
      label: 'Customer',
      home: '/app',
      groups: [
        {
          label: 'Assistance',
          items: [
            { route: '/app',        icon: 'home',    label: 'Dashboard' },
            { route: '/services',   icon: 'wrench',  label: 'Request Help' },
            { route: '/mechanics',  icon: 'users',   label: 'Find Mechanics' },
            { route: '/map',        icon: 'map',     label: 'Live Map' },
            { route: '/track',      icon: 'route',   label: 'Track Request', activeOnly: true }
          ]
        },
        {
          label: 'My Account',
          items: [
            { route: '/history',       icon: 'history',  label: 'Service History' },
            { route: '/vehicles',      icon: 'car',      label: 'My Vehicles' },
            { route: '/emergency',     icon: 'shield',   label: 'Emergency Contacts' },
            { route: '/notifications', icon: 'bell',     label: 'Notifications', badge: 'unread' },
            { route: '/profile',       icon: 'person',   label: 'Profile' },
            { route: '/settings',      icon: 'settings', label: 'Settings' }
          ]
        }
      ],
      tabs: [
        { route: '/app',           icon: 'home',    label: 'Home' },
        { route: '/map',           icon: 'map',     label: 'Map' },
        { route: '/services',      icon: 'wrench',  label: 'Request' },
        { route: '/notifications', icon: 'bell',    label: 'Alerts', badge: 'unread' },
        { route: '/profile',       icon: 'person',  label: 'Profile' }
      ]
    },

    mechanic: {
      label: 'Mechanic',
      home: '/m',
      groups: [
        {
          label: 'Workshop',
          items: [
            { route: '/m',          icon: 'grid',    label: 'Dashboard' },
            { route: '/m/requests', icon: 'inbox',   label: 'Incoming Requests', badge: 'incoming' },
            { route: '/m/job',      icon: 'route',   label: 'Active Job' },
            { route: '/m/earnings', icon: 'dollar',  label: 'Earnings' }
          ]
        },
        {
          label: 'Account',
          items: [
            { route: '/m/profile',  icon: 'person',   label: 'Shop Profile' },
            { route: '/settings',   icon: 'settings', label: 'Settings' }
          ]
        }
      ],
      tabs: [
        { route: '/m',          icon: 'grid',   label: 'Home' },
        { route: '/m/requests', icon: 'inbox',  label: 'Requests', badge: 'incoming' },
        { route: '/m/job',      icon: 'route',  label: 'Job' },
        { route: '/m/earnings', icon: 'dollar', label: 'Earnings' },
        { route: '/m/profile',  icon: 'person', label: 'Profile' }
      ]
    },

    admin: {
      label: 'Admin',
      home: '/admin',
      groups: [
        {
          label: 'Operations',
          items: [
            { route: '/admin',           icon: 'grid',     label: 'Overview' },
            { route: '/admin/dispatch',  icon: 'radio',    label: 'Live Dispatch' },
            { route: '/admin/approvals', icon: 'idcard',   label: 'Verification Queue', badge: 'pending' },
            { route: '/admin/mechanics', icon: 'users',    label: 'Mechanics' }
          ]
        },
        {
          label: 'Insight',
          items: [
            { route: '/admin/analytics', icon: 'chart',    label: 'Analytics' },
            { route: '/admin/reports',   icon: 'file',     label: 'Reports' },
            { route: '/admin/logs',      icon: 'logs',     label: 'System Logs' },
            { route: '/settings',        icon: 'settings', label: 'Settings' }
          ]
        }
      ],
      tabs: [
        { route: '/admin',           icon: 'grid',   label: 'Overview' },
        { route: '/admin/dispatch',  icon: 'radio',  label: 'Dispatch' },
        { route: '/admin/approvals', icon: 'idcard', label: 'Queue', badge: 'pending' },
        { route: '/admin/analytics', icon: 'chart',  label: 'Analytics' },
        { route: '/admin/reports',   icon: 'file',   label: 'Reports' }
      ]
    }
  };

  /* Badge counters, resolved at render time. */
  function badgeCount(kind) {
    var s = RA.store.get();
    if (kind === 'unread')   return RA.store.select.unreadCount();
    if (kind === 'incoming') return s.mechanic.incoming.length;
    if (kind === 'pending')  return s.admin.pending.length;
    return 0;
  }

  /* ======================================================================
     Rail
     ====================================================================== */

  function railLink(item, activeRoute) {
    var active = activeRoute === item.route ||
      (item.route !== '/' && activeRoute.indexOf(item.route + '/') === 0);
    var n = item.badge ? badgeCount(item.badge) : 0;
    return '<button type="button" class="' + ui.cx('rail__link', active ? 'is-active' : '') + '"' +
      ' data-nav="' + U.escAttr(item.route) + '"' + (active ? ' aria-current="page"' : '') + '>' +
      icon(item.icon, 19) +
      '<span>' + esc(item.label) + '</span>' +
      (n ? '<span class="rail__badge">' + esc(n) + '</span>' : '') +
      '</button>';
  }

  function rail(role, activeRoute) {
    var nav = NAV[role];
    var st = RA.store.get();
    var activeReq = RA.store.select.activeRequest();

    var groups = nav.groups.map(function (g) {
      var items = g.items.filter(function (it) {
        return !it.activeOnly || activeReq;
      });
      if (!items.length) return '';
      return '<div class="rail__group">' +
        '<div class="rail__grouplabel">' + esc(g.label) + '</div>' +
        items.map(function (it) { return railLink(it, activeRoute); }).join('') +
        '</div>';
    }).join('');

    var roles = ['customer', 'mechanic', 'admin'].map(function (r) {
      return '<button type="button" class="' + ui.cx('roleswitch__btn', r === role ? 'is-active' : '') + '"' +
        ' data-role="' + r + '">' + esc(NAV[r].label) + '</button>';
    }).join('');

    return '<aside class="rail" id="rail" aria-label="Main navigation">' +
      '<div class="rail__head">' +
        '<span class="rail__logo">' + icon('truck', 20) + '</span>' +
        '<div>' +
          '<div class="rail__word">RoadAssist</div>' +
          '<div class="rail__tag">' + esc(nav.label) + ' portal</div>' +
        '</div>' +
        '<button type="button" class="iconbtn rail__close" data-act="close-rail" aria-label="Close navigation">' +
          icon('close', 20) + '</button>' +
      '</div>' +

      '<nav class="rail__scroll">' + groups + '</nav>' +

      '<div class="rail__foot">' +
        '<div class="roleswitch">' +
          '<div class="roleswitch__label">Demo: switch portal</div>' +
          '<div class="roleswitch__row" role="group" aria-label="Switch portal">' + roles + '</div>' +
        '</div>' +
        '<button type="button" class="rail__link mt-3" data-act="sign-out">' +
          icon('logout', 19) + '<span>Sign out</span></button>' +
      '</div>' +
      '</aside>' +
      '<div class="scrim" id="scrim" data-act="close-rail" aria-hidden="true"></div>';
  }

  /* ======================================================================
     Top bar
     ====================================================================== */

  /**
   * topbar({ title, sub, back, actions })
   * back: a route string → renders the back chevron instead of the hamburger.
   */
  function topbar(o) {
    o = o || {};
    var unread = RA.store.select.unreadCount();
    var role = RA.store.select.role();
    var nav = NAV[role] || NAV.customer;

    var lead = o.back
      ? '<button type="button" class="topbar__back" data-nav="' + U.escAttr(o.back) + '" aria-label="Go back">' +
        icon('back', 19) + '</button>'
      : '<button type="button" class="iconbtn topbar__menu" data-act="open-rail" aria-label="Open navigation" aria-controls="rail">' +
        icon('menu', 21) + '</button>';

    var actions = o.actions !== undefined ? o.actions :
      '<button type="button" class="iconbtn" data-nav="/notifications" aria-label="Notifications' +
        (unread ? ' (' + unread + ' unread)' : '') + '">' +
        icon('bell', 20) + (unread ? '<span class="iconbtn__dot"></span>' : '') + '</button>' +
      '<button type="button" class="iconbtn" data-nav="' + U.escAttr(role === 'customer' ? '/profile' : (role === 'mechanic' ? '/m/profile' : '/settings')) +
        '" aria-label="Account">' + icon('person', 20) + '</button>';

    return '<header class="topbar">' +
      lead +
      '<div class="topbar__id">' +
        '<div class="topbar__titles">' +
          '<div class="topbar__title">' + esc(o.title || 'RoadAssist') + '</div>' +
          (o.sub ? '<div class="topbar__sub">' + esc(o.sub) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="topbar__spacer"></div>' +
      '<div class="topbar__actions">' + actions + '</div>' +
      '</header>';
  }

  /* ======================================================================
     Bottom tab bar
     ====================================================================== */

  function tabbar(role, activeRoute) {
    var nav = NAV[role];
    return '<nav class="tabbar" aria-label="Primary">' + nav.tabs.map(function (t) {
      var active = activeRoute === t.route ||
        (t.route !== '/' && activeRoute.indexOf(t.route + '/') === 0);
      var n = t.badge ? badgeCount(t.badge) : 0;
      return '<button type="button" class="' + ui.cx('tabbar__item', active ? 'is-active' : '') + '"' +
        ' data-nav="' + U.escAttr(t.route) + '"' + (active ? ' aria-current="page"' : '') + '>' +
        '<span style="position:relative;display:grid">' + icon(t.icon, 21) +
          (n ? '<span class="iconbtn__dot" style="top:-2px;right:-4px"></span>' : '') + '</span>' +
        '<span>' + esc(t.label) + '</span>' +
        '</button>';
    }).join('') + '</nav>';
  }

  /* ======================================================================
     shell(content, options) — the full signed-in frame
     ====================================================================== */

  function shell(content, o) {
    o = o || {};
    var role = RA.store.select.role() || 'customer';
    var activeRoute = o.route || RA.router.path();

    return '<div class="shell">' +
      rail(role, activeRoute) +
      '<div class="shell__main">' +
        topbar(o) +
        '<main class="shell__content" id="main">' + content + '</main>' +
      '</div>' +
      tabbar(role, activeRoute) +
      '</div>';
  }

  /* ======================================================================
     Behaviour — wired once, works for every render
     ====================================================================== */

  function openRail() {
    var r = document.getElementById('rail'), s = document.getElementById('scrim');
    if (r) r.classList.add('is-open');
    if (s) s.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var first = U.qs('.rail__link', r);
    if (first) first.focus();
  }

  function closeRail() {
    var r = document.getElementById('rail'), s = document.getElementById('scrim');
    if (r) r.classList.remove('is-open');
    if (s) s.classList.remove('is-open');
    document.body.style.removeProperty('overflow');
  }

  function bind() {
    var app = document.getElementById('app');

    U.on(app, 'click', '[data-act="open-rail"]', openRail);
    U.on(app, 'click', '[data-act="close-rail"]', closeRail);

    /* Any navigation closes the drawer. */
    U.on(app, 'click', '[data-nav]', function () { closeRail(); });

    U.on(app, 'click', '[data-role]', function (e, node) {
      var role = node.getAttribute('data-role');
      RA.store.actions.switchRole(role);
      ui.toast('Switched to the ' + NAV[role].label.toLowerCase() + ' portal', 'info');
      RA.router.go(NAV[role].home);
    });

    U.on(app, 'click', '[data-act="sign-out"]', function () {
      ui.modal({
        icon: 'logout', tint: 'var(--danger-15)', tone: 'var(--danger)',
        title: 'Sign out?',
        text: 'Your demo data stays saved in this browser, so you can pick up where you left off.',
        confirm: 'Sign out', cancel: 'Stay', variant: 'danger',
        onConfirm: function () {
          RA.store.actions.signOut().then(function () {
            ui.toast('Signed out', 'info');
            RA.router.go('/');
          });
        }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeRail();
    });

    /* Returning to a wide viewport should not leave the drawer state stuck. */
    window.addEventListener('resize', U.debounce(function () {
      if (window.innerWidth >= 1024) closeRail();
    }, 150));
  }

  RA.chrome = {
    NAV: NAV,
    shell: shell, topbar: topbar, rail: rail, tabbar: tabbar,
    openRail: openRail, closeRail: closeRail, bind: bind,
    badgeCount: badgeCount
  };
})(window, document);
