// Location toggle. Lets the visitor choose which HQ the per-restaurant
// distances are shown for, syncs that choice to the `?hq=` query param (so the
// view is shareable), and re-orders the restaurant cards closest-first.
//
// Progressive enhancement: the page is fully usable without this script — every
// HQ's distance is rendered server-side and simply stays visible.
(function () {
  'use strict';

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.hq-btn'));
  if (buttons.length === 0) return;

  var grid = document.querySelector('.grid');
  var ids = buttons.map(function (b) {
    return b.getAttribute('data-hq');
  });

  var PARAM = 'hq';

  function selected() {
    var params = new URLSearchParams(window.location.search);
    var hq = params.get(PARAM);
    return ids.indexOf(hq) !== -1 ? hq : ids[0];
  }

  function rank(card, hq) {
    var value = card.getAttribute('data-rank-' + hq);
    return value === null ? Number.MAX_SAFE_INTEGER : Number(value);
  }

  function apply(hq, history_) {
    document.documentElement.setAttribute('data-hq', hq);

    buttons.forEach(function (button) {
      var on = button.getAttribute('data-hq') === hq;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    document.querySelectorAll('.distance').forEach(function (chip) {
      chip.hidden = chip.getAttribute('data-hq') !== hq;
    });

    if (grid) {
      var cards = Array.prototype.slice.call(
        grid.querySelectorAll('.restaurant'),
      );
      cards
        .sort(function (a, b) {
          return rank(a, hq) - rank(b, hq);
        })
        .forEach(function (card) {
          grid.appendChild(card);
        });
    }

    var params = new URLSearchParams(window.location.search);
    params.set(PARAM, hq);
    var url = window.location.pathname + '?' + params.toString();
    if (history_) {
      window.history.pushState(null, '', url);
    } else {
      window.history.replaceState(null, '', url);
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      apply(button.getAttribute('data-hq'), true);
    });
  });

  window.addEventListener('popstate', function () {
    apply(selected(), false);
  });

  apply(selected(), false);

  // Tap/click-to-expand for descriptions that overflow their 3-line clamp.
  // Works the same on desktop and touch (no hover dependency). Only descriptions
  // that are actually truncated get a toggle; without JS they simply stay clamped.
  var descs = Array.prototype.slice.call(
    document.querySelectorAll('.item-desc'),
  );

  function isTruncated(el) {
    return el.scrollHeight - el.clientHeight > 1;
  }

  descs.forEach(function (desc) {
    var toggle = null;

    function sync() {
      var expanded = desc.classList.contains('is-expanded');
      if (expanded) return;
      if (isTruncated(desc)) {
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'desc-toggle';
          toggle.textContent = 'more';
          toggle.setAttribute('aria-expanded', 'false');
          toggle.addEventListener('click', function () {
            var open = desc.classList.toggle('is-expanded');
            toggle.textContent = open ? 'less' : 'more';
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
          desc.parentNode.insertBefore(toggle, desc.nextSibling);
        }
        toggle.hidden = false;
      } else if (toggle) {
        toggle.hidden = true;
      }
    }

    sync();
    window.addEventListener('resize', sync);
  });
})();

// Lunch fact, typed out live. Fetches a random fact from the
// "Facts-as-a-Service" endpoint and reveals it character by character at the
// top of the page. Pure garnish and fully optional: the element is rendered
// hidden server-side and only shown once a fact arrives, so a slow or down
// service (or no JS) leaves the page untouched.
(function () {
  'use strict';

  var box = document.querySelector('.lunch-fact');
  if (!box) return;

  var url = box.getAttribute('data-facts-url');
  if (!url) return;

  var textEl = box.querySelector('.lunch-fact-text');
  if (!textEl) return;

  var sourceEl = box.querySelector('.lunch-fact-source');

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal() {
    box.hidden = false;
  }

  function showSource(url) {
    if (!sourceEl || !url) return;
    sourceEl.setAttribute('href', url);
    sourceEl.hidden = false;
  }

  function type(text, source) {
    reveal();
    if (reduceMotion) {
      textEl.textContent = text;
      showSource(source);
      return;
    }

    box.classList.add('is-typing');
    var i = 0;
    (function step() {
      textEl.textContent = text.slice(0, i);
      if (i < text.length) {
        i += 1;
        window.setTimeout(step, 28);
      } else {
        box.classList.remove('is-typing');
        showSource(source);
      }
    })();
  }

  fetch(url, { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) throw new Error('bad status ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var fact = data && typeof data.fact === 'string' ? data.fact.trim() : '';
      var source =
        data && typeof data.source === 'string' ? data.source.trim() : '';
      if (fact) type(fact, source);
    })
    .catch(function () {
      // Service unavailable: leave the line hidden, no harm done.
    });
})();
