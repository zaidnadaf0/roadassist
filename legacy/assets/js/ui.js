/* ==========================================================================
   RoadAssist Web — UI kit
   Two halves:
     1. Builders  — pure functions returning HTML strings (composable in views)
     2. Runtime   — toasts, modals, button loading states, star inputs
   Every dynamic string is escaped via RA.util.esc before it reaches innerHTML.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var esc = U.esc;
  var icon = RA.icon;

  /* ======================================================================
     1. BUILDERS
     ====================================================================== */

  /** Merge extra classes without producing "undefined" in the output. */
  function cx() {
    return Array.prototype.slice.call(arguments)
      .filter(function (c) { return !!c; }).join(' ');
  }

  /** data-* attribute string from a plain object. */
  function attrs(o) {
    if (!o) return '';
    return Object.keys(o).map(function (k) {
      if (o[k] === null || o[k] === undefined || o[k] === false) return '';
      return ' ' + k + '="' + U.escAttr(o[k]) + '"';
    }).join('');
  }

  /* ---------------------------------------------------------------- button */
  /**
   * btn({ label, variant, icon, size, block, nav, act, id, type, disabled })
   * variant: '' | secondary | danger | success | accent | ghost
   * nav: route to push on click (handled by util.bindNav)
   * act: data-act value, handled by the view's own delegated listener
   */
  function btn(o) {
    o = o || {};
    var tag = o.href ? 'a' : 'button';
    var cls = cx('btn',
      o.variant ? 'btn--' + o.variant : '',
      o.size ? 'btn--' + o.size : '',
      o.block ? 'btn--block' : '',
      o.cls);
    return '<' + tag + ' class="' + cls + '"' +
      (o.href ? ' href="' + U.escAttr(o.href) + '"' : ' type="' + (o.type || 'button') + '"') +
      (o.disabled ? ' disabled' : '') +
      (o.nav ? ' data-nav="' + U.escAttr(o.nav) + '"' : '') +
      (o.act ? ' data-act="' + U.escAttr(o.act) + '"' : '') +
      attrs(o.data) +
      (o.id ? ' id="' + U.escAttr(o.id) + '"' : '') +
      (o.aria ? ' aria-label="' + U.escAttr(o.aria) + '"' : '') + '>' +
      '<span class="btn__spinner"></span>' +
      '<span class="btn__label">' +
        (o.icon ? icon(o.icon, o.iconSize || 18) : '') +
        (o.label ? '<span>' + esc(o.label) + '</span>' : '') +
      '</span>' +
      '</' + tag + '>';
  }

  /* ------------------------------------------------------------------ card */
  function card(inner, o) {
    o = o || {};
    var tag = o.nav ? 'button' : (o.href ? 'a' : 'div');
    var cls = cx('card',
      o.variant ? 'card--' + o.variant : '',
      (o.nav || o.href || o.act) ? 'card--tap' : '',
      o.rise !== undefined ? 'rise' : '',
      o.cls);
    return '<' + tag + ' class="' + cls + '"' +
      (o.rise !== undefined ? ' style="--i:' + Number(o.rise) + '"' : '') +
      (o.href ? ' href="' + U.escAttr(o.href) + '"' : '') +
      (o.nav ? ' type="button" data-nav="' + U.escAttr(o.nav) + '"' : '') +
      (o.act ? ' data-act="' + U.escAttr(o.act) + '"' : '') +
      attrs(o.data) + '>' + inner + '</' + tag + '>';
  }

  /* --------------------------------------------------------------- heading */
  function sectionHead(title, linkLabel, linkRoute, extra) {
    return '<div class="section__head">' +
      '<h2 class="section__title">' + esc(title) + '</h2>' +
      (linkLabel
        ? '<button type="button" class="section__link"' +
          (linkRoute ? ' data-nav="' + U.escAttr(linkRoute) + '"' : '') +
          '>' + esc(linkLabel) + '</button>'
        : '') +
      (extra || '') +
      '</div>';
  }

  function section(title, inner, linkLabel, linkRoute) {
    return '<section class="section">' +
      sectionHead(title, linkLabel, linkRoute) + inner + '</section>';
  }

  function pageTitle(title, lede) {
    return '<header class="mb-5"><h1 class="page__title">' + esc(title) + '</h1>' +
      (lede ? '<p class="page__lede">' + esc(lede) + '</p>' : '') + '</header>';
  }

  /* ------------------------------------------------------------------ pill */
  function pill(label, variant, live) {
    return '<span class="' + cx('pill', variant ? 'pill--' + variant : '') + '">' +
      (variant ? '<span class="' + cx('pill__dot', live ? 'pill__dot--live' : '') + '"></span>' : '') +
      esc(label) + '</span>';
  }

  /** Status pill straight from a request status string. */
  function statusPill(status) {
    var m = RA.store.STATUS_META[status] ||
      { label: U.humanStatus(status), tone: 'default' };
    var live = status === 'en_route' || status === 'searching' || status === 'in_progress';
    return pill(m.label, m.tone, live);
  }

  /* ---------------------------------------------------------------- avatar */
  function avatar(name, o) {
    o = o || {};
    return '<div class="' + cx('avatar', o.size ? 'avatar--' + o.size : '', o.cls) + '"' +
      (o.style ? ' style="' + U.escAttr(o.style) + '"' : '') + ' aria-hidden="true">' +
      esc(U.initials(name)) +
      (o.dot === undefined ? '' :
        '<span class="' + cx('avatar__dot', o.dot ? '' : 'avatar__dot--off') + '"></span>') +
      '</div>';
  }

  /* ---------------------------------------------------------------- rating */
  function rating(value) {
    return '<span class="rating">' + icon('starFill', 12) +
      esc(Number(value).toFixed(1)) + '</span>';
  }

  /** Read-only or interactive star row. `input` makes it clickable. */
  function stars(value, o) {
    o = o || {};
    var size = o.size || 18;
    var out = '<div class="' + cx('stars', o.input ? 'stars--input' : '') + '"' +
      (o.input ? ' data-stars="' + U.escAttr(o.name || 'rating') + '"' : '') +
      ' role="img" aria-label="' + U.escAttr(Number(value).toFixed(1) + ' out of 5') + '">';
    for (var i = 1; i <= 5; i++) {
      out += (o.input ? '<button type="button"' : '<span') +
        ' class="' + cx('stars__star', i <= Math.round(value) ? 'is-on' : '') + '"' +
        (o.input ? ' data-star="' + i + '" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '"' : '') +
        '>' + icon('starFill', size) + (o.input ? '</button>' : '</span>');
    }
    return out + '</div>' +
      (o.input ? '<input type="hidden" name="' + U.escAttr(o.name || 'rating') +
        '" value="' + Number(value) + '">' : '');
  }

  /* ---------------------------------------------------------------- metric */
  function metachip(iconName, text) {
    return '<span class="metachip">' + icon(iconName, 14) + esc(text) + '</span>';
  }

  function stat(o) {
    var tag = o.nav ? 'button' : 'div';
    var body = '<div class="stat__row">' +
        (o.icon ? '<span class="stat__icon" style="--tint:' + U.escAttr(o.tint || 'var(--primary-15)') +
          ';--tone:' + U.escAttr(o.tone || 'var(--primary)') + '">' + icon(o.icon, 19) + '</span>' : '') +
        '<span class="stat__label">' + esc(o.label) + '</span>' +
      '</div>' +
      '<span class="stat__value">' + esc(o.value) + '</span>' +
      (o.delta
        ? '<span class="' + cx('stat__delta', o.deltaDir === 'down' ? 'stat__delta--down' : 'stat__delta--up') + '">' +
          esc(o.delta) + '</span>'
        : (o.sub ? '<span class="stat__delta t-3">' + esc(o.sub) + '</span>' : ''));

    return '<' + tag + ' class="' + cx('stat', o.nav ? 'card--tap' : '', o.rise !== undefined ? 'rise' : '') + '"' +
      (o.rise !== undefined ? ' style="--i:' + Number(o.rise) + '"' : '') +
      (o.nav ? ' type="button" data-nav="' + U.escAttr(o.nav) + '"' : '') +
      '>' + body + '</' + tag + '>';
  }

  /* ------------------------------------------------------------------- row */
  /**
   * row({ icon, tint, tone, title, badge, sub, amount, time, chev, nav, act,
   *       avatar, end, unread, rise })
   */
  function row(o) {
    var tag = (o.nav || o.act) ? 'button' : (o.href ? 'a' : 'div');
    var lead = o.avatar !== undefined
      ? avatar(o.avatar, { size: 'sm', dot: o.dot })
      : (o.icon
        ? '<span class="row__icon" style="--tint:' + U.escAttr(o.tint || 'var(--w08)') +
          ';--tone:' + U.escAttr(o.tone || 'var(--text-2)') + '">' + icon(o.icon, 19) + '</span>'
        : '');

    var end = o.end !== undefined ? o.end :
      ((o.amount !== undefined || o.time || o.chev)
        ? '<div class="row__end">' +
            (o.amount !== undefined ? '<span class="row__amount">' + esc(o.amount) + '</span>' : '') +
            (o.time ? '<span class="row__time">' + esc(o.time) + '</span>' : '') +
            (o.chev ? '<span class="row__chev">' + icon('chevronR', 18) + '</span>' : '') +
          '</div>'
        : '');

    return '<' + tag + ' class="' + cx('row', o.unread ? 'is-unread' : '', o.rise !== undefined ? 'rise' : '', o.cls) + '"' +
      (o.rise !== undefined ? ' style="--i:' + Number(o.rise) + '"' : '') +
      (tag === 'button' ? ' type="button"' : '') +
      (o.href ? ' href="' + U.escAttr(o.href) + '"' : '') +
      (o.nav ? ' data-nav="' + U.escAttr(o.nav) + '"' : '') +
      (o.act ? ' data-act="' + U.escAttr(o.act) + '"' : '') +
      attrs(o.data) + '>' +
      lead +
      '<span class="row__body">' +
        '<span class="row__title">' + esc(o.title) + (o.badge || '') + '</span>' +
        (o.sub ? '<span class="row__sub">' + esc(o.sub) + '</span>' : '') +
      '</span>' +
      end +
      '</' + tag + '>';
  }

  function rows(list) { return '<div class="rows">' + list.join('') + '</div>'; }

  /* -------------------------------------------------------- definition list */
  function dl(pairs) {
    return '<div class="dl">' + pairs.filter(function (p) { return p; }).map(function (p) {
      return '<div class="dl__item"><span class="dl__k">' + esc(p[0]) +
        '</span><span class="dl__v">' + (p[2] === 'raw' ? p[1] : esc(p[1])) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ----------------------------------------------------------------- forms */
  function field(o) {
    var id = o.id || ('f_' + o.name);
    var inner;
    if (o.type === 'select') {
      inner = '<select class="select" id="' + U.escAttr(id) + '" name="' + U.escAttr(o.name) + '"' +
        (o.required ? ' required' : '') + '>' +
        (o.options || []).map(function (opt) {
          var v = (typeof opt === 'string') ? opt : opt.value;
          var l = (typeof opt === 'string') ? opt : opt.label;
          return '<option value="' + U.escAttr(v) + '"' + (String(v) === String(o.value) ? ' selected' : '') + '>' +
            esc(l) + '</option>';
        }).join('') + '</select>';
    } else if (o.type === 'textarea') {
      inner = '<textarea class="textarea" id="' + U.escAttr(id) + '" name="' + U.escAttr(o.name) + '"' +
        (o.placeholder ? ' placeholder="' + U.escAttr(o.placeholder) + '"' : '') +
        (o.required ? ' required' : '') + '>' + esc(o.value || '') + '</textarea>';
    } else {
      inner = (o.icon ? '<span class="field__icon">' + icon(o.icon, 18) + '</span>' : '') +
        '<input class="input" id="' + U.escAttr(id) + '" name="' + U.escAttr(o.name) + '"' +
        ' type="' + (o.type || 'text') + '"' +
        (o.placeholder ? ' placeholder="' + U.escAttr(o.placeholder) + '"' : '') +
        (o.value !== undefined && o.value !== null ? ' value="' + U.escAttr(o.value) + '"' : '') +
        (o.autocomplete ? ' autocomplete="' + U.escAttr(o.autocomplete) + '"' : '') +
        (o.inputmode ? ' inputmode="' + U.escAttr(o.inputmode) + '"' : '') +
        (o.required ? ' required' : '') + '>' +
        (o.type === 'password'
          ? '<button type="button" class="field__reveal" data-reveal aria-label="Show password">' + icon('eye', 18) + '</button>'
          : '');
    }
    return '<label class="field" for="' + U.escAttr(id) + '">' +
      '<span class="field__label">' + esc(o.label) + '</span>' +
      '<span class="' + cx('field__wrap', o.icon ? 'field__wrap--icon' : '') + '">' + inner + '</span>' +
      '<span class="field__error" data-error-for="' + U.escAttr(o.name) + '" hidden></span>' +
      '</label>';
  }

  function search(o) {
    o = o || {};
    return '<div class="search">' + icon('search', 18) +
      '<input class="search__input" type="search" name="' + U.escAttr(o.name || 'q') + '"' +
      ' placeholder="' + U.escAttr(o.placeholder || 'Search…') + '"' +
      (o.value ? ' value="' + U.escAttr(o.value) + '"' : '') +
      ' aria-label="' + U.escAttr(o.placeholder || 'Search') + '">' +
      '</div>';
  }

  function chipRow(items, activeValue, actName) {
    return '<div class="toolbar__group" role="group">' + items.map(function (it) {
      var v = (typeof it === 'string') ? it : it.value;
      var l = (typeof it === 'string') ? it : it.label;
      return '<button type="button" class="' + cx('chipbtn', String(v) === String(activeValue) ? 'is-active' : '') +
        '" data-act="' + U.escAttr(actName || 'filter') + '" data-value="' + U.escAttr(v) + '">' +
        esc(l) + '</button>';
    }).join('') + '</div>';
  }

  function chips(list) {
    return '<div class="chips">' + list.map(function (c) {
      return '<span class="chip">' + icon('check', 13) + esc(c) + '</span>';
    }).join('') + '</div>';
  }

  function switchRow(o) {
    return '<div class="settingrow">' +
      (o.icon ? '<span class="row__icon" style="--tint:var(--primary-08);--tone:var(--primary)">' + icon(o.icon, 19) + '</span>' : '') +
      '<span class="settingrow__body">' +
        '<span class="row__title">' + esc(o.label) + '</span>' +
        (o.sub ? '<span class="row__sub">' + esc(o.sub) + '</span>' : '') +
      '</span>' +
      '<label class="switch">' +
        '<input type="checkbox" name="' + U.escAttr(o.name) + '"' + (o.checked ? ' checked' : '') +
        ' data-act="' + U.escAttr(o.act || 'toggle') + '" aria-label="' + U.escAttr(o.label) + '">' +
        '<span class="switch__track"></span>' +
      '</label>' +
      '</div>';
  }

  /* --------------------------------------------------------------- service */
  function svcTile(svc, o) {
    o = o || {};
    return '<button type="button" class="' + cx('svc', o.selected ? 'is-selected' : '', o.rise !== undefined ? 'rise' : '') + '"' +
      (o.rise !== undefined ? ' style="--i:' + Number(o.rise) + '"' : '') +
      (o.nav ? ' data-nav="' + U.escAttr(o.nav) + '"' : '') +
      ' data-act="' + U.escAttr(o.act || 'pick-service') + '" data-value="' + U.escAttr(svc.id) + '">' +
      '<span class="svc__icon" style="--tint:' + U.escAttr(svc.tint) + ';--tone:' + U.escAttr(svc.tone) + '">' +
        icon(svc.icon, 23) + '</span>' +
      '<span class="svc__label">' + esc(svc.name) + '</span>' +
      (o.hidePrice ? '' : '<span class="svc__price">from ' + esc(U.money(svc.base, false)) + '</span>') +
      '</button>';
  }

  /* -------------------------------------------------------- mechanic card */
  function mechCard(m, o) {
    o = o || {};
    var meta = [];
    if (m.distanceMi !== undefined) meta.push(metachip('pin', U.miles(m.distanceMi) + ' away'));
    if (m.etaMin !== undefined) meta.push(metachip('clock', U.mins(m.etaMin) + ' ETA'));
    meta.push(metachip('wrench', U.num(m.jobs) + ' jobs'));

    var inner = '<div class="mech">' +
      '<div class="mech__top">' +
        avatar(m.name, { dot: m.online }) +
        '<div class="mech__id">' +
          '<div class="mech__name">' + esc(m.name) +
            (m.verified ? '<span class="t-primary" title="Verified">' + icon('verified', 15) + '</span>' : '') +
          '</div>' +
          '<div class="mech__spec">' + esc(m.shop) + ' · ' + esc(m.specialty) + '</div>' +
        '</div>' +
        rating(m.rating) +
      '</div>' +
      '<div class="mech__meta">' + meta.join('') + '</div>' +
      (o.actions === false ? '' :
        '<div class="mech__foot">' +
          btn({ label: o.cta || 'Request Help', size: 'md', act: 'request-mechanic', data: { 'data-id': m.id } }) +
          '<button type="button" class="squarebtn" data-act="call-mechanic" data-id="' + U.escAttr(m.id) +
            '" aria-label="Call ' + U.escAttr(m.name) + '">' + icon('phone', 18) + '</button>' +
          '<button type="button" class="squarebtn" data-nav="/mechanic/' + U.escAttr(m.id) +
            '" aria-label="View ' + U.escAttr(m.name) + ' profile">' + icon('chevronR', 18) + '</button>' +
        '</div>') +
      '</div>';

    return card(inner, { rise: o.rise, cls: o.cls });
  }

  /* --------------------------------------------------------------- stepper */
  /** steps([{ title, sub, state }]) — state: done | current | todo */
  function steps(list) {
    return '<div class="steps">' + list.map(function (s) {
      var ico = s.state === 'done' ? 'check' : (s.state === 'current' ? 'radio' : 'clock');
      return '<div class="step is-' + esc(s.state) + '">' +
        '<div class="step__gutter">' +
          '<span class="step__dot">' + icon(ico, 15) + '</span>' +
          '<span class="step__line"></span>' +
        '</div>' +
        '<div class="step__body">' +
          '<div class="step__title">' + esc(s.title) + '</div>' +
          (s.sub ? '<div class="step__sub">' + esc(s.sub) + '</div>' : '') +
        '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------- charts */
  /** bars([{label, value, display}], {max, tone}) */
  function bars(data, o) {
    o = o || {};
    var max = o.max || Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    return '<div class="bars">' + data.map(function (d, i) {
      var h = Math.max(3, Math.round((d.value / max) * 100));
      return '<div class="bars__col">' +
        '<span class="bars__val">' + esc(d.display !== undefined ? d.display : d.value) + '</span>' +
        '<span class="bars__bar" style="height:' + h + '%;animation-delay:' + (i * 45) + 'ms' +
          (o.tone ? ';background:' + U.escAttr(o.tone) : '') + '"' +
          ' title="' + U.escAttr(d.label + ': ' + (d.display !== undefined ? d.display : d.value)) + '"></span>' +
        '<span class="bars__label">' + esc(d.label) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  /** donut([{label, value, color}], {size, thickness, centerLabel, centerValue}) */
  function donut(data, o) {
    o = o || {};
    var size = o.size || 148, th = o.thickness || 18;
    var r = (size - th) / 2, c = 2 * Math.PI * r, cx0 = size / 2;
    var total = U.sum(data, function (d) { return d.value; }) || 1;
    var offset = 0;

    var segs = data.map(function (d) {
      var frac = d.value / total;
      var len = frac * c;
      var s = '<circle class="donut__seg" cx="' + cx0 + '" cy="' + cx0 + '" r="' + r +
        '" stroke="' + U.escAttr(d.color) + '" stroke-width="' + th +
        '" stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) +
        '" stroke-dashoffset="' + (-offset).toFixed(2) + '"></circle>';
      offset += len;
      return s;
    }).join('');

    var legend = data.map(function (d) {
      return '<div class="legend">' +
        '<span class="legend__sw" style="background:' + U.escAttr(d.color) + '"></span>' +
        '<span class="legend__k">' + esc(d.label) + '</span>' +
        '<span class="legend__v">' + esc(d.display !== undefined ? d.display : d.value) + '</span>' +
        '</div>';
    }).join('');

    return '<div class="donut">' +
      '<svg class="donut__svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + U.escAttr(o.aria || 'Distribution chart') + '">' +
        '<circle class="donut__track" cx="' + cx0 + '" cy="' + cx0 + '" r="' + r + '" stroke-width="' + th + '"></circle>' +
        segs +
      '</svg>' +
      '<div class="donut__legend">' + legend + '</div>' +
      '</div>';
  }

  /** sparkline([numbers], {tone, fill}) */
  function sparkline(values, o) {
    o = o || {};
    var w = 300, h = 56, pad = 3;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var pts = values.map(function (v, i) {
      var x = pad + (i / (values.length - 1 || 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var tone = o.tone || 'var(--primary)';
    return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' + U.escAttr(o.aria || 'Trend') + '">' +
      (o.fill === false ? '' :
        '<polygon points="' + pad + ',' + (h - pad) + ' ' + pts.join(' ') + ' ' + (w - pad) + ',' + (h - pad) +
        '" fill="' + U.escAttr(tone) + '" opacity=".12"></polygon>') +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + U.escAttr(tone) +
      '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
      '</svg>';
  }

  function meter(pct, tone) {
    return '<div class="meter" role="progressbar" aria-valuenow="' + Math.round(pct) +
      '" aria-valuemin="0" aria-valuemax="100"><span class="meter__fill" style="width:' +
      U.clamp(pct, 0, 100) + '%' + (tone ? ';background:' + U.escAttr(tone) : '') + '"></span></div>';
  }

  /* ----------------------------------------------------------------- table */
  /** table(['Head'], [[cell, cell]], {wrapCols:[0]}) — cells may be raw HTML. */
  function table(heads, bodyRows, o) {
    o = o || {};
    var wrap = o.wrapCols || [];
    return '<div class="tablewrap"><table class="table">' +
      '<thead><tr>' + heads.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + bodyRows.map(function (r) {
        return '<tr' + attrs(r.data) + '>' + (r.cells || r).map(function (cell, i) {
          return '<td' + (wrap.indexOf(i) > -1 ? ' class="is-wrap"' : '') + '>' + cell + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------------------------------------------------------- review */
  function review(r) {
    return '<div class="review">' + avatar(r.author, { size: 'sm' }) +
      '<div class="review__body">' +
        '<div class="review__head">' +
          '<span class="review__author">' + esc(r.author) + '</span>' +
          stars(r.rating, { size: 13 }) +
          '<span class="review__when">' + esc(U.relTime(r.at)) + '</span>' +
        '</div>' +
        '<p class="review__text">' + esc(r.text) + '</p>' +
      '</div></div>';
  }

  /* ----------------------------------------------------------------- empty */
  function empty(o) {
    return '<div class="empty">' +
      '<span class="empty__icon">' + icon(o.icon || 'inbox', 34) + '</span>' +
      '<h3 class="empty__title">' + esc(o.title) + '</h3>' +
      (o.text ? '<p class="empty__text">' + esc(o.text) + '</p>' : '') +
      (o.action ? '<div class="mt-3">' + o.action + '</div>' : '') +
      '</div>';
  }

  function skeleton(kind, count) {
    var n = count || 1, out = '';
    for (var i = 0; i < n; i++) out += '<div class="skel skel--' + esc(kind || 'line') + '"></div>';
    return out;
  }

  /* ======================================================================
     2. RUNTIME
     ====================================================================== */

  var toastRoot = null;
  function getToastRoot() {
    if (!toastRoot) toastRoot = document.getElementById('toast-root');
    return toastRoot;
  }

  var TOAST_ICON = { success: 'checkCircle', danger: 'xCircle', warning: 'warning', info: 'info', '': 'info' };

  /** toast('Saved', 'success', 2600) */
  function toast(message, kind, ms) {
    var root = getToastRoot();
    if (!root) return;
    var node = U.el('div', { class: cx('toast', kind ? 'toast--' + kind : '') },
      icon(TOAST_ICON[kind || ''] || 'info', 18) + '<span>' + esc(message) + '</span>');
    root.appendChild(node);
    setTimeout(function () {
      node.classList.add('is-out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 260);
    }, ms || 2800);
  }

  /* --- modal --- */
  var modalRoot = null, lastFocused = null, escHandler = null;

  function getModalRoot() {
    if (!modalRoot) modalRoot = document.getElementById('modal-root');
    return modalRoot;
  }

  function closeModal() {
    var root = getModalRoot();
    if (!root) return;
    root.innerHTML = '';
    document.body.style.removeProperty('overflow');
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    if (lastFocused && lastFocused.focus) { lastFocused.focus(); lastFocused = null; }
  }

  /**
   * modal({ title, text, body, icon, tint, tone, confirm, cancel, variant,
   *         wide, onConfirm, onCancel, dismissable })
   * Returns nothing; resolve work inside onConfirm.
   */
  function modal(o) {
    o = o || {};
    var root = getModalRoot();
    if (!root) return;
    lastFocused = document.activeElement;

    var actions = '';
    if (o.confirm || o.cancel) {
      actions = '<div class="modal__actions">' +
        (o.cancel ? btn({ label: o.cancel, variant: 'secondary', act: 'modal-cancel' }) : '') +
        (o.confirm ? btn({ label: o.confirm, variant: o.variant || '', act: 'modal-confirm' }) : '') +
        '</div>';
    }

    root.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' +
      U.escAttr(o.title || 'Dialog') + '">' +
      '<div class="' + cx('modal__box', o.wide ? 'modal__box--wide' : '') + '">' +
        (o.icon ? '<div class="modal__icon" style="--tint:' + U.escAttr(o.tint || 'var(--warning-15)') +
          ';--tone:' + U.escAttr(o.tone || 'var(--warning)') + '">' + icon(o.icon, 27) + '</div>' : '') +
        (o.title ? '<h2 class="modal__title">' + esc(o.title) + '</h2>' : '') +
        (o.text ? '<p class="modal__text">' + esc(o.text) + '</p>' : '') +
        (o.body ? '<div class="mt-5">' + o.body + '</div>' : '') +
        actions +
      '</div></div>';

    var box = U.qs('.modal__box', root);
    var overlay = U.qs('.modal', root);

    function finish(confirmed) {
      var form = U.qs('form', box);
      var data = form ? U.formData(form) : null;
      if (confirmed && o.onConfirm && o.onConfirm(data, box) === false) return; // keep open
      if (!confirmed && o.onCancel) o.onCancel();
      closeModal();
    }

    U.on(root, 'click', '[data-act="modal-confirm"]', function () { finish(true); });
    U.on(root, 'click', '[data-act="modal-cancel"]', function () { finish(false); });

    if (o.dismissable !== false) {
      overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(false); });
      escHandler = function (e) { if (e.key === 'Escape') finish(false); };
      document.addEventListener('keydown', escHandler);
    }

    U.bindNav(root);
    bindReveal(root);
    bindStars(root);

    document.body.style.overflow = 'hidden';
    var focusable = U.qsa('button, [href], input, select, textarea', box)[0];
    if (focusable) focusable.focus();
  }

  /** Convenience: destructive confirm dialog. */
  function confirmDanger(o) {
    modal(Object.assign({
      icon: 'warning', tint: 'var(--danger-15)', tone: 'var(--danger)',
      confirm: 'Confirm', cancel: 'Cancel', variant: 'danger'
    }, o));
  }

  /* --- button loading state --- */
  function setLoading(node, on) {
    if (!node) return;
    node.classList.toggle('is-loading', !!on);
    node.disabled = !!on;
  }

  /** Run an async action with the button showing its spinner. */
  function withLoading(node, promise) {
    setLoading(node, true);
    return Promise.resolve(promise)
      .then(function (v) { setLoading(node, false); return v; })
      .catch(function (e) { setLoading(node, false); throw e; });
  }

  /* --- field errors --- */
  function showError(root, name, message) {
    var slot = U.qs('[data-error-for="' + name + '"]', root);
    var input = U.qs('[name="' + name + '"]', root);
    if (slot) { slot.textContent = message || ''; slot.hidden = !message; }
    if (input) input.classList.toggle('is-invalid', !!message);
  }

  function clearErrors(root) {
    U.qsa('[data-error-for]', root).forEach(function (s) { s.textContent = ''; s.hidden = true; });
    U.qsa('.is-invalid', root).forEach(function (i) { i.classList.remove('is-invalid'); });
  }

  /**
   * Validate a form against a { fieldName: validatorFn } map.
   * Returns the parsed values, or null when invalid (errors are painted in place).
   */
  function validateForm(form, rules) {
    clearErrors(form);
    var values = U.formData(form);
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      var msg = rules[name](values[name], values);
      if (msg) { showError(form, name, msg); if (!firstBad) firstBad = name; }
    });
    if (firstBad) {
      var node = U.qs('[name="' + firstBad + '"]', form);
      if (node) node.focus();
      return null;
    }
    return values;
  }

  /* --- password reveal --- */
  function bindReveal(root) {
    U.qsa('[data-reveal]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var input = U.qs('.input', b.parentNode);
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
  }

  /* --- interactive stars --- */
  function bindStars(root) {
    U.qsa('[data-stars]', root).forEach(function (group) {
      var name = group.getAttribute('data-stars');
      group.addEventListener('click', function (e) {
        var b = e.target.closest('[data-star]');
        if (!b) return;
        var v = Number(b.getAttribute('data-star'));
        U.qsa('[data-star]', group).forEach(function (s) {
          s.classList.toggle('is-on', Number(s.getAttribute('data-star')) <= v);
        });
        var hidden = U.qs('input[name="' + name + '"]', group.parentNode);
        if (hidden) hidden.value = v;
        group.setAttribute('aria-label', v + ' out of 5');
      });
    });
  }

  /* --- copy to clipboard (receipts, refs) --- */
  function copy(text, label) {
    function done() { toast((label || 'Copied') + ' to clipboard', 'success'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Could not copy', 'danger'); });
    } else {
      var ta = U.el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy', 'danger'); }
      document.body.removeChild(ta);
    }
  }

  /** Wire up the generic behaviours every rendered view wants. */
  function hydrate(root) {
    U.bindNav(root);
    bindReveal(root);
    bindStars(root);
  }

  /** Static inline banner (HTML string) for view-level notices. */
  function notify(o) {
    o = o || {};
    var tone = o.type === 'warning' ? '#F5A524' : (o.type === 'danger' ? '#FF3B30' : '#7C9CC4');
    var iconName = o.type === 'warning' ? 'warning' : (o.type === 'danger' ? 'xCircle' : 'info');
    return '<div class="notify-banner" style="display:flex;gap:10px;align-items:flex-start;' +
      'margin:0 0 14px;padding:12px 14px;border:1px solid ' + tone + '33;' +
      'background:' + tone + '14;border-radius:12px;color:#E4E4E7">' +
      '<span style="color:' + tone + ';flex:none;line-height:0;padding-top:2px">' + icon(iconName, 18) + '</span>' +
      '<div><div style="font-weight:700;font-size:13px;margin-bottom:2px">' + esc(o.title || '') + '</div>' +
      '<div style="font-size:13px;line-height:1.5;color:#A1A1AA">' + esc(o.text || '') + '</div></div></div>';
  }

  RA.ui = {
    /* builders */
    cx: cx, attrs: attrs,
    btn: btn, card: card, section: section, sectionHead: sectionHead, pageTitle: pageTitle,
    pill: pill, statusPill: statusPill, avatar: avatar, rating: rating, stars: stars,
    metachip: metachip, stat: stat, row: row, rows: rows, dl: dl,
    field: field, search: search, chipRow: chipRow, chips: chips, switchRow: switchRow,
    svcTile: svcTile, mechCard: mechCard, steps: steps,
    bars: bars, donut: donut, sparkline: sparkline, meter: meter,
    table: table, review: review, empty: empty, skeleton: skeleton,
    notify: notify,
    /* runtime */
    toast: toast, modal: modal, closeModal: closeModal, confirmDanger: confirmDanger,
    setLoading: setLoading, withLoading: withLoading,
    showError: showError, clearErrors: clearErrors, validateForm: validateForm,
    bindReveal: bindReveal, bindStars: bindStars, hydrate: hydrate, copy: copy
  };
})(window, document);
