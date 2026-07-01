// TGIF mode. Once the work week is basically over (Friday afternoon, when lunch
// stops being the main event), the page can transform itself into a bonkers,
// beer-soaked celebration: raining pints, drifting balloons, confetti, a disco
// banner and a wobbling title.
//
// Activation, in priority order:
//   1. `?tgif`  / `?tgif=1|on|true|party`  -> force ON  (works any day, for demos)
//      `?tgif=0|off|false`                 -> force OFF (mutes the auto-trigger)
//   2. otherwise auto-ON when either:
//        a. it's the configured day (Friday) at/after the configured hour
//           (16:00), using the visitor's local clock; or
//        b. (easter egg) it's between 16:00 and 18:00 in Europe/Zurich on ANY
//           day — measured in Zurich time via Intl, so it fires no matter where
//           the visitor's own clock is set.
//
// Pure progressive enhancement: the page is fully usable without this script and
// nothing here touches the menu data. All config lives on <body data-tgif-*> so
// the markup stays the single source of truth (mirroring the other features).
//
// The celebration assets default to emoji so the effect is self-contained with
// zero external requests. To rain real beer GIFs/images instead, point
// `data-tgif-assets` at a JSON array of image URLs, e.g.
//   data-tgif-assets='["./beer.gif","https://cdn.example/cheers.gif"]'
(function () {
  'use strict';

  var body = document.body;
  if (!body) return;

  var PARAM = body.getAttribute('data-tgif-param') || 'tgif';
  var DAY = toInt(body.getAttribute('data-tgif-day'), 5); // 0=Sun … 5=Fri
  var FROM_HOUR = toInt(body.getAttribute('data-tgif-from-hour'), 16); // 16:00

  // Easter-egg window, measured in a fixed timezone (Zurich) rather than the
  // visitor's local clock.
  var TZ = body.getAttribute('data-tgif-tz') || 'Europe/Zurich';
  var EGG_FROM = toInt(body.getAttribute('data-tgif-egg-from-hour'), 16); // 16:00
  var EGG_TO = toInt(body.getAttribute('data-tgif-egg-to-hour'), 18); // 18:00 (exclusive)

  // Celebration glyphs. Heavy on beer, as requested — the pints are repeated so
  // they dominate the pour and don't get drowned out by the other party emoji.
  var GLYPHS = [
    '🍺', '🍺', '🍺', '🍺', '🍺', '🍺',
    '🍻', '🍻', '🍻', '🍻', '🍻',
    '🥳', '🎉', '🎊', '🍾', '🥂', '🪩', '🕺', '💃', '🌭', '🥨', '🤘',
  ];
  var IMAGE_ASSETS = parseAssets(body.getAttribute('data-tgif-assets'));

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function parseAssets(raw) {
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(function (u) {
        return typeof u === 'string' && u.length > 0;
      }) : [];
    } catch (e) {
      return [];
    }
  }

  // Returns true/false to force a state, or null to fall back to the schedule.
  function paramOverride() {
    var raw = new URLSearchParams(window.location.search).get(PARAM);
    if (raw === null) return null;
    var v = raw.toLowerCase();
    if (v === '0' || v === 'off' || v === 'false' || v === 'no') return false;
    return true; // bare `?tgif` or any truthy value
  }

  function scheduledOn(now) {
    return now.getDay() === DAY && now.getHours() >= FROM_HOUR;
  }

  // Current hour (0–23) in the configured timezone, independent of the visitor's
  // own clock — so the 16:00–18:00 easter egg fires on Zurich time worldwide.
  // Falls back to the local hour if Intl/timezone data is unavailable.
  function hourInTz(tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') return parseInt(parts[i].value, 10) % 24;
      }
    } catch (e) {
      // Unknown timezone or no Intl support: fall through to local time.
    }
    return new Date().getHours();
  }

  // Easter egg: any day, when it's late afternoon (16:00–18:00) in Zurich.
  function eggActive() {
    var h = hourInTz(TZ);
    return h >= EGG_FROM && h < EGG_TO;
  }

  function shouldActivate() {
    var override = paramOverride();
    if (override !== null) return override;
    return scheduledOn(new Date()) || eggActive();
  }

  // --- DOM helpers ---------------------------------------------------------

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // A single falling celebration token: either a random emoji or, if image
  // assets were configured, a random one of those.
  function makeFaller() {
    var node;
    if (IMAGE_ASSETS.length > 0 && Math.random() < 0.6) {
      node = el('img', 'tgif-faller tgif-faller-img');
      node.src = pick(IMAGE_ASSETS);
      node.alt = '';
      node.setAttribute('aria-hidden', 'true');
    } else {
      node = el('span', 'tgif-faller');
      node.textContent = pick(GLYPHS);
    }
    var size = 1.4 + Math.random() * 2.6; // rem
    node.style.left = Math.random() * 100 + 'vw';
    node.style.fontSize = size + 'rem';
    node.style.width = size + 'rem';
    node.style.animationDuration = 4 + Math.random() * 5 + 's';
    node.style.animationDelay = -(Math.random() * 6) + 's';
    node.style.setProperty('--spin', (Math.random() < 0.5 ? '-' : '') + (180 + Math.random() * 540) + 'deg');
    return node;
  }

  function makeConfetti() {
    var bit = el('span', 'tgif-confetti');
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.background = 'hsl(' + Math.floor(Math.random() * 360) + ', 90%, 60%)';
    bit.style.animationDuration = 3 + Math.random() * 4 + 's';
    bit.style.animationDelay = -(Math.random() * 5) + 's';
    return bit;
  }

  function makeBalloon() {
    var b = el('span', 'tgif-balloon');
    b.textContent = '🎈';
    b.style.left = Math.random() * 100 + 'vw';
    b.style.fontSize = 2 + Math.random() * 2.5 + 'rem';
    b.style.animationDuration = 7 + Math.random() * 6 + 's';
    b.style.animationDelay = -(Math.random() * 8) + 's';
    return b;
  }

  function buildBanner(layer) {
    var banner = el('div', 'tgif-banner');
    banner.setAttribute('role', 'status');

    var marquee = el('div', 'tgif-marquee');
    var msg = '🍺 T G I F ! 🍻 IT\'S BEER O\'CLOCK 🥳 THE WEEK IS DONE 🎉 GO GET A COLD ONE 🍾 ';
    var track = el('div', 'tgif-marquee-track');
    track.textContent = msg + msg + msg;
    var track2 = track.cloneNode(true);
    track2.setAttribute('aria-hidden', 'true');
    marquee.appendChild(track);
    marquee.appendChild(track2);

    var off = el('button', 'tgif-off');
    off.type = 'button';
    off.textContent = '🥱 not now, I\'m still working';
    off.addEventListener('click', function () {
      deactivate();
      var params = new URLSearchParams(window.location.search);
      params.set(PARAM, '0');
      window.history.replaceState(
        null,
        '',
        window.location.pathname + '?' + params.toString(),
      );
    });

    banner.appendChild(marquee);
    banner.appendChild(off);
    layer.appendChild(banner);
  }

  // Occasional "CHEERS!" pop somewhere on screen for extra chaos.
  var popTimer = null;
  function startPops(layer) {
    if (reduceMotion) return;
    popTimer = window.setInterval(function () {
      var pop = el('span', 'tgif-pop');
      pop.textContent = pick(['CHEERS! 🍻', 'PROST! 🍺', 'SANTÉ! 🥂', 'WOOO! 🎉', '🍻🍻🍻']);
      pop.style.left = 5 + Math.random() * 80 + 'vw';
      pop.style.top = 20 + Math.random() * 60 + 'vh';
      pop.style.setProperty('--hue', Math.floor(Math.random() * 360));
      layer.appendChild(pop);
      window.setTimeout(function () {
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      }, 1400);
    }, 1200);
  }

  // --- activate / deactivate ----------------------------------------------

  var layerRef = null;

  function activate() {
    if (document.documentElement.classList.contains('tgif')) return;
    document.documentElement.classList.add('tgif');

    var layer = el('div', 'tgif-layer');
    layer.setAttribute('aria-hidden', 'true');

    buildBanner(layer);

    if (!reduceMotion) {
      var rain = el('div', 'tgif-rain');
      var fallerCount = 60;
      var confettiCount = 50;
      var balloonCount = 10;
      var i;
      for (i = 0; i < fallerCount; i++) rain.appendChild(makeFaller());
      for (i = 0; i < confettiCount; i++) rain.appendChild(makeConfetti());
      for (i = 0; i < balloonCount; i++) rain.appendChild(makeBalloon());
      layer.appendChild(rain);
      startPops(layer);
    }

    document.body.appendChild(layer);
    layerRef = layer;

    // A celebratory jolt on entry (skipped when motion is reduced).
    if (!reduceMotion) {
      document.documentElement.classList.add('tgif-shake');
      window.setTimeout(function () {
        document.documentElement.classList.remove('tgif-shake');
      }, 900);
    }
  }

  function deactivate() {
    document.documentElement.classList.remove('tgif', 'tgif-shake');
    if (popTimer) {
      window.clearInterval(popTimer);
      popTimer = null;
    }
    if (layerRef && layerRef.parentNode) {
      layerRef.parentNode.removeChild(layerRef);
    }
    layerRef = null;
  }

  if (shouldActivate()) activate();
})();
