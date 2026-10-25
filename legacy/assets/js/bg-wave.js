/* ==========================================================================
   RoadAssist Web — Particle-wave background
   Reference: black video loop of a white dotted undulating diamond mesh
   with expanding ripple rings (user-provided ref-bg.mp4).

   Vanilla canvas 2D, no dependencies, file:// safe. Draws a perspective
   dot-grid whose height field is a sum of travelling sines + an expanding
   ripple from the centre, diamond-masked by radial falloff. Theme-aware:
   deep-black canvas with neon-purple dots, crest dots glow bright purple.

   Motion rules (§37-38 of the blueprint): motion must explain system
   activity, 3D must be premium depth, not gaming. So: one slow ambient
   loop, GPU-cheap (capped DPR + adaptive grid), paused when tab hidden,
   single static frame when prefers-reduced-motion is set.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var RA = window.RA = window.RA || {};

  var canvas = null;
  var ctx = null;
  var raf = 0;
  var running = false;
  var t = Math.random() * 10;
  var last = 0;
  var W = 0;
  var H = 0;
  var DPR = 1;
  var inited = false;
  var reduceMotion = false;

  function themeIsDark() {
    var el = document.documentElement;
    var attr = el && el.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    if (window.matchMedia) {
      try { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
      catch (e) { return false; }
    }
    return false;
  }

  function resize() {
    if (!canvas) return;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* Height field: travelling waves + expanding ripple + soft centre bump. */
  function field(u, v, time) {
    var dist = Math.sqrt(u * u + v * v);
    var w = Math.sin(u * 3.1 + time * 0.9) * Math.cos(v * 2.7 - time * 0.7);
    var ripple = Math.sin(dist * 9.0 - time * 2.4) * Math.exp(-dist * 2.1);
    var bump = Math.exp(-dist * dist * 3.2) * Math.sin(time * 0.8) * 0.6;
    return w * 0.55 + ripple * 1.15 + bump;
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    var dark = themeIsDark();
    var cx = W * 0.5;
    var cy = H * 0.34;
    var scale = Math.min(W, H) * 0.46;
    var cols = Math.max(36, Math.min(104, Math.floor(W / 22)));
    var rows = Math.max(22, Math.min(56, Math.floor(H / 26)));
    var dot = dark ? '216,180,254' : '168,85,247';
    var warm = dark ? '192,132,252' : '168,85,247';

    for (var j = 0; j <= rows; j++) {
      var v = (j / rows) * 2 - 1;
      for (var i = 0; i <= cols; i++) {
        var u = (i / cols) * 2 - 1;
        var dist = Math.sqrt(u * u + v * v);
        if (dist > 1.15) continue;
        var z = field(u, v, time);
        /* Diamond falloff: corners fade, centre stays dense. */
        var mask = Math.max(0, 1 - Math.pow(dist / 1.15, 2.4));
        var x = cx + u * scale * 1.55;
        var y = cy + v * scale * 0.52 - z * scale * 0.16;
        var depth = 0.35 + 0.65 * ((z + 1.7) / 3.4);
        var a = (dark ? 0.62 : 0.30) * mask * depth;
        if (a < 0.02) continue;
        var r = (dark ? 1.5 : 1.3) * (0.7 + depth * 0.6);
        var crest = z > 0.95;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fillStyle = crest
          ? 'rgba(' + warm + ',' + Math.min(0.95, a + 0.25).toFixed(3) + ')'
          : 'rgba(' + dot + ',' + a.toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt * 0.9;
    /* Only paint when something can actually see the canvas. */
    if (!document.hidden) draw(t);
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running || !canvas) return;
    running = true;
    last = window.performance ? window.performance.now() : Date.now();
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { try { window.cancelAnimationFrame(raf); } catch (e) {} raf = 0; }
  }

  function init() {
    if (inited) return;
    inited = true;
    canvas = document.getElementById('bgwave');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      reduceMotion = !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduceMotion = false; }

    resize();
    var rz = null;
    window.addEventListener('resize', function () {
      if (rz) window.clearTimeout(rz);
      rz = window.setTimeout(resize, 160);
    });

    /* Re-tint when the user flips light/dark in Settings. */
    try {
      var mo = new MutationObserver(function () { if (!running) draw(t); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}

    document.addEventListener('visibilitychange', function () {
      if (reduceMotion) return;
      if (document.hidden) stop();
      else start();
    });

    if (reduceMotion) { draw(t); return; }  /* one static frame */
    draw(t);
    start();
  }

  RA.bgwave = { init: init, start: start, stop: stop };
})(window, document);
