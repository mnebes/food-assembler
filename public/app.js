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
})();
