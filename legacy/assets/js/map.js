/* ==========================================================================
   RoadAssist Web — Map
   Leaflet + CartoDB dark_all raster tiles: the same free OpenStreetMap-derived
   tiles the Flutter app pulled through flutter_map's TileLayer.

   Two things the Flutter version didn't have to worry about, handled here:
     1. Leaflet itself comes from a CDN, so `L` may be undefined offline.
     2. Tiles may fail even when Leaflet loads (offline, blocked, file://).
   Both fall back to the CSS grid placeholder (.map__fallback) instead of
   leaving an empty grey box.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA;
  var U = RA.util;

  var TILE_PROVIDERS = [
    { name: 'CARTO dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attrib: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' },
    { name: 'OSM standard', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attrib: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
  ];

  var instances = {};   // containerId -> { map, layers… }

  function available() { return typeof window.L !== 'undefined'; }

  /** Diagnose map readiness for the user/console: leaflet + providers. */
  function diagnose() {
    return {
      leaflet: available(),
      providers: TILE_PROVIDERS.map(function (p) { return p.name; }),
      hint: available()
        ? 'Leaflet OK. If tiles are blank, the network is blocking tile hosts.'
        : 'Leaflet FAILED to load (CDN blocked or offline). Map shows fallback grid.'
    };
  }

  /* ---------------------------------------------------------------------
     Markup helper — call this from a view, then mount() after insertion.
     --------------------------------------------------------------------- */
  function shell(id, o) {
    o = o || {};
    return '<div class="' + RA.ui.cx('mapwrap', o.size ? 'mapwrap--' + o.size : 'mapwrap--tall',
      o.sheet ? 'has-sheet' : '', o.cls) + '" id="' + U.escAttr(id) + '-wrap">' +
      '<div class="map" id="' + U.escAttr(id) + '" role="application" aria-label="' +
        U.escAttr(o.aria || 'Map of nearby mechanics') + '"></div>' +
      '<div class="map__fallback">' +
        RA.icon('map', 34) +
        '<div class="map__fallbacktitle">' + U.esc(o.fallbackTitle || 'Map preview unavailable') + '</div>' +
        '<p class="map__fallbacktext">' + U.esc(o.fallbackText ||
          'Map tiles need an internet connection (CARTO/OSM). Your lists, distances and ETAs still work offline — reconnect to see the live map.') + '</p>' +
        '<p class="map__fallbacktext mono" style="opacity:.75">Leaflet: ' +
        (typeof window.L !== 'undefined' ? 'loaded' : 'NOT loaded — CDN blocked/offline') + '</p>' +
      '</div>' +
      (o.recenter === false ? '' :
        '<button type="button" class="map__recenter" data-map-recenter="' + U.escAttr(id) +
        '" aria-label="Re-centre map">' + RA.icon('crosshair', 20) + '</button>') +
      (o.sheet || '') +
      '</div>';
  }

  function markOffline(id) {
    var wrap = document.getElementById(id + '-wrap');
    if (wrap) wrap.classList.add('is-offline');
  }

  /* ---------------------------------------------------------------------
     Custom markers
     --------------------------------------------------------------------- */
  function userIcon() {
    return window.L.divIcon({
      className: '', html: '<div class="marker-user"></div>',
      iconSize: [22, 22], iconAnchor: [11, 11]
    });
  }

  function mechIcon(m, selected) {
    var badge = m.etaMin !== undefined ? U.mins(m.etaMin) : (m.rating ? m.rating.toFixed(1) + '★' : '');
    return window.L.divIcon({
      className: '',
      html: '<div class="marker-mech' + (selected ? ' is-selected' : '') + '">' +
        '<span class="marker-mech__pin">' + RA.icon('truck', 18) + '</span>' +
        (badge ? '<span class="marker-mech__badge">' + U.esc(badge) + '</span>' : '') +
        '</div>',
      iconSize: [56, 50], iconAnchor: [28, 44], popupAnchor: [0, -42]
    });
  }

  /* ---------------------------------------------------------------------
     mount(id, options)
       center, zoom, user {lat,lng}, mechanics [], route [{lat,lng}],
       selectedId, onSelect(id), interactive
     --------------------------------------------------------------------- */
  function mount(id, o) {
    o = o || {};
    var node = document.getElementById(id);
    if (!node) return null;

    if (!available()) { markOffline(id); return null; }

    destroy(id);

    var center = o.center || o.user || RA.seed.HOME;
    var map;
    try {
      map = window.L.map(node, {
        center: [center.lat, center.lng],
        zoom: o.zoom || 13,
        zoomControl: o.interactive !== false,
        scrollWheelZoom: o.scrollWheelZoom !== undefined ? o.scrollWheelZoom : false,
        dragging: o.interactive !== false,
        attributionControl: true
      });
    } catch (e) {
      console.warn('[map] init failed', e);
      markOffline(id);
      return null;
    }

    /* Tile health check with auto-fallback: CARTO dark -> OSM standard ->
       CSS grid fallback only if both fail. */
    var errors = 0, loaded = false, providerIdx = 0;
    var tiles = window.L.tileLayer(TILE_PROVIDERS[0].url, {
      subdomains: 'abcd', maxZoom: 19, attribution: TILE_PROVIDERS[0].attrib, detectRetina: true
    });
    tiles.on('tileload', function () { loaded = true; });
    tiles.on('tileerror', function () {
      errors++;
      if (loaded || errors < 3) return;
      if (providerIdx < TILE_PROVIDERS.length - 1) {
        // Switch provider once instead of giving up.
        try { map.removeLayer(tiles); } catch (e) {}
        providerIdx++;
        errors = 0;
        console.warn('[map] ' + TILE_PROVIDERS[providerIdx - 1].name + ' failing, trying ' + TILE_PROVIDERS[providerIdx].name);
        tiles = window.L.tileLayer(TILE_PROVIDERS[providerIdx].url, {
          maxZoom: 19, attribution: TILE_PROVIDERS[providerIdx].attrib, detectRetina: true
        });
        tiles.on('tileload', function () { loaded = true; });
        tiles.on('tileerror', function () {
          errors++;
          if (!loaded && errors >= 3) markOffline(id);
        });
        tiles.addTo(map);
        var inst0 = instances[id];
        if (inst0) inst0.tiles = tiles;
      } else if (!loaded && errors >= 3) {
        markOffline(id);
      }
    });
    tiles.addTo(map);
    setTimeout(function () { if (!loaded && providerIdx >= TILE_PROVIDERS.length - 1) markOffline(id); }, 9000);

    var inst = { map: map, tiles: tiles, mechMarkers: {}, route: null, userMarker: null, center: center };
    instances[id] = inst;

    if (o.user) {
      inst.userMarker = window.L.marker([o.user.lat, o.user.lng], {
        icon: userIcon(), zIndexOffset: 500, keyboard: false
      }).addTo(map);
      if (o.userLabel !== false) inst.userMarker.bindPopup('<strong>Your location</strong>');
    }

    setMechanics(id, o.mechanics || [], o.selectedId, o.onSelect);
    if (o.route) setRoute(id, o.route);
    if (o.fit !== false && (o.mechanics || []).length) fit(id);

    /* Leaflet needs a nudge when it is mounted inside a container that was
       still being laid out (very common with CSS grid + clamp heights). */
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 60);
    setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 400);

    return map;
  }

  function setMechanics(id, list, selectedId, onSelect) {
    var inst = instances[id];
    if (!inst) return;
    Object.keys(inst.mechMarkers).forEach(function (k) {
      inst.map.removeLayer(inst.mechMarkers[k]);
    });
    inst.mechMarkers = {};

    list.forEach(function (m) {
      var mk = window.L.marker([m.lat, m.lng], {
        icon: mechIcon(m, m.id === selectedId),
        title: m.name
      }).addTo(inst.map);

      mk.bindPopup(
        '<strong>' + U.esc(m.name) + '</strong><br>' + U.esc(m.shop) +
        (m.etaMin !== undefined ? '<br>' + U.esc(U.mins(m.etaMin) + ' · ' + U.miles(m.distanceMi || 0)) : '')
      );
      if (onSelect) mk.on('click', function () { onSelect(m.id, m); });
      inst.mechMarkers[m.id] = mk;
    });
  }

  function select(id, mechanicId, list) {
    var inst = instances[id];
    if (!inst) return;
    (list || []).forEach(function (m) {
      var mk = inst.mechMarkers[m.id];
      if (mk) mk.setIcon(mechIcon(m, m.id === mechanicId));
    });
    var target = (list || []).filter(function (m) { return m.id === mechanicId; })[0];
    if (target) inst.map.panTo([target.lat, target.lng], { animate: true });
  }

  /** Draw the route polyline (dashed casing + solid line, like the app). */
  function setRoute(id, points) {
    var inst = instances[id];
    if (!inst || !points || points.length < 2) return;
    if (inst.route) { inst.map.removeLayer(inst.route); }
    if (inst.routeCasing) { inst.map.removeLayer(inst.routeCasing); }
    var latlngs = points.map(function (p) { return [p.lat, p.lng]; });
    inst.routeCasing = window.L.polyline(latlngs, {
      color: '#0A0614', weight: 9, opacity: .8, lineCap: 'round'
    }).addTo(inst.map);
    inst.route = window.L.polyline(latlngs, {
      color: '#A855F7', weight: 4, opacity: .95, dashArray: '1 9', lineCap: 'round'
    }).addTo(inst.map);
  }

  /** Move a single marker along the route (live tracking animation). */
  function moveMechanic(id, mechanicId, point) {
    var inst = instances[id];
    if (!inst) return;
    var mk = inst.mechMarkers[mechanicId];
    if (mk) mk.setLatLng([point.lat, point.lng]);
  }

  function fit(id, pad) {
    var inst = instances[id];
    if (!inst) return;
    var pts = [];
    if (inst.userMarker) pts.push(inst.userMarker.getLatLng());
    Object.keys(inst.mechMarkers).forEach(function (k) { pts.push(inst.mechMarkers[k].getLatLng()); });
    if (pts.length < 2) return;
    try {
      inst.map.fitBounds(window.L.latLngBounds(pts), { padding: [pad || 56, pad || 56], maxZoom: 15 });
    } catch (e) {}
  }

  function recenter(id) {
    var inst = instances[id];
    if (!inst) return;
    if (Object.keys(inst.mechMarkers).length) fit(id);
    else inst.map.setView([inst.center.lat, inst.center.lng], 13, { animate: true });
  }

  function destroy(id) {
    var inst = instances[id];
    if (!inst) return;
    /* Halt any in-flight pan/zoom animation first: letting a transition
       callback fire after remove() surfaces Leaflet's internal
       '_leaflet_pos' dereference as an uncaught window error. */
    try { inst.map.stop(); } catch (e) {}
    try { inst.map.remove(); } catch (e) {}
    delete instances[id];
  }

  function destroyAll() { Object.keys(instances).forEach(destroy); }

  /* Delegated recentre button — works for every map on the page. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-map-recenter]');
    if (b) recenter(b.getAttribute('data-map-recenter'));
  });

  RA.map = {
    available: available,
    shell: shell, mount: mount, destroy: destroy, destroyAll: destroyAll,
    setMechanics: setMechanics, select: select, setRoute: setRoute,
    moveMechanic: moveMechanic, fit: fit, recenter: recenter,
    instances: instances
  };
})(window, document);
