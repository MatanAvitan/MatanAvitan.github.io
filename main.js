// Theme switch, top bar state, active section link, and the hero manifold.
(function () {
  "use strict";

  var root = document.documentElement;
  var mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---- Theme ----

  function storedTheme() {
    try {
      var t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null;
    }
  }

  var toggle = document.querySelector(".theme-toggle");

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (toggle) {
      toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
    document.dispatchEvent(new Event("themechange"));
  }

  applyTheme(storedTheme() || (mqDark.matches ? "dark" : "light"));

  mqDark.addEventListener("change", function (e) {
    if (!storedTheme()) applyTheme(e.matches ? "dark" : "light");
  });

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
      applyTheme(next);
    });
  }

  // ---- Top bar: show the name after the hero title scrolls away ----

  var topbar = document.querySelector(".topbar");
  var title = document.querySelector(".hero h1");
  if (topbar && title && "IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        topbar.classList.toggle("past-hero", !entries[0].isIntersecting);
      },
      { rootMargin: "-64px 0px 0px 0px" }
    ).observe(title);
  }

  // ---- Active section link ----

  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) {
      byId[a.hash.slice(1)] = a;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (a) {
            a.removeAttribute("aria-current");
          });
          var link = byId[entry.target.id];
          if (link) link.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  // ---- Hero manifold ----
  // Points on a Swiss roll, seen along its axis, so the roll forms a spiral
  // around the portrait. The roll turns slowly and tilts toward the pointer.

  var hero = document.querySelector(".hero");
  var canvas = document.querySelector(".hero-canvas");
  var ring = document.querySelector(".portrait-ring");
  if (!hero || !canvas || !ring || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var T0 = 1.5 * Math.PI;
  var T1 = 4.5 * Math.PI;
  var DEPTH = 7;
  var CAMERA = 38;

  var points = [];
  var colorA = [79, 70, 229];
  var colorB = [13, 148, 136];
  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, scale = 1;
  var spin = 0.6, tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
  var running = false, heroVisible = true, rafId = 0, lastFrame = 0, clock = 0;

  function parseHex(value, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function readColors() {
    var cs = getComputedStyle(root);
    colorA = parseHex(cs.getPropertyValue("--accent"), colorA);
    colorB = parseHex(cs.getPropertyValue("--accent-2"), colorB);
    points.forEach(function (p) {
      var r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * p.c);
      var g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * p.c);
      var b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * p.c);
      p.rgb = "rgb(" + r + "," + g + "," + b + ")";
    });
  }

  function build(count) {
    points = [];
    for (var i = 0; i < count; i++) {
      // Sample t so that points spread evenly along the arc length of the spiral.
      var u = Math.random();
      var t = Math.sqrt(T0 * T0 + u * (T1 * T1 - T0 * T0));
      var h = Math.random() * 2 - 1;
      points.push({
        x: t * Math.cos(t),
        y: t * Math.sin(t),
        z: h * DEPTH * 0.5,
        c: (t - T0) / (T1 - T0),
        rgb: ""
      });
    }
    readColors();
  }

  function smoothstep(a, b, x) {
    var k = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return k * k * (3 - 2 * k);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var t = clock / 1000;
    var ax = 0.55 + 0.16 * Math.sin(t * 0.23) + tiltY;
    var ay = 0.22 * Math.sin(t * 0.17) + tiltX;
    var cz = Math.cos(spin), sz = Math.sin(spin);
    var cxr = Math.cos(ax), sxr = Math.sin(ax);
    var cyr = Math.cos(ay), syr = Math.sin(ay);
    var dark = root.dataset.theme === "dark";
    var base = dark ? 0.95 : 0.8;

    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var x1 = p.x * cz - p.y * sz;
      var y1 = p.x * sz + p.y * cz;
      var y2 = y1 * cxr - p.z * sxr;
      var z2 = y1 * sxr + p.z * cxr;
      var x3 = x1 * cyr + z2 * syr;
      var z3 = -x1 * syr + z2 * cyr;

      var f = CAMERA / (CAMERA + z3);
      var near = Math.min(Math.max((15 - z3) / 30, 0), 1);
      var radial = Math.sqrt(x3 * x3 + y2 * y2) / T1;
      var fade = 1 - 0.65 * smoothstep(0.55, 1.05, radial);

      ctx.globalAlpha = (0.15 + 0.6 * near) * fade * base;
      ctx.fillStyle = p.rgb;
      ctx.beginPath();
      ctx.arc(cx + x3 * scale * f, cy + y2 * scale * f, (0.6 + 1.3 * near) * f, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    var box = hero.getBoundingClientRect();
    var r = ring.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width;
    H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cx = r.left - box.left + r.width / 2;
    cy = r.top - box.top + r.height / 2;
    scale = (r.width / 2 + 16) / T0;
    var count = W < 700 ? 900 : 1500;
    if (points.length !== count) build(count);
    draw();
  }

  function frame(now) {
    var dt = lastFrame ? Math.min(now - lastFrame, 50) : 16;
    lastFrame = now;
    clock += dt;
    spin += (dt / 1000) * 0.07;
    tiltX += (targetX - tiltX) * 0.04;
    tiltY += (targetY - tiltY) * 0.04;
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || mqReduce.matches || !heroVisible || document.hidden) return;
    running = true;
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  window.addEventListener(
    "pointermove",
    function (e) {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.5;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.35;
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  document.addEventListener("themechange", function () {
    readColors();
    draw();
  });

  mqReduce.addEventListener("change", function () {
    if (mqReduce.matches) {
      stop();
      draw();
    } else {
      start();
    }
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) start();
      else stop();
    }).observe(hero);
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(hero);
  } else {
    window.addEventListener("resize", resize);
  }

  resize();
  start();
})();
