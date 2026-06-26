// Lunch voting. Lets each visitor mark the one dish they're having today,
// remembers it across reloads, syncs it to PocketBase, and shows everyone a
// live count of how many *other* colleagues picked each dish.
//
// No accounts: a visitor is just a random id kept in localStorage. One pick per
// visitor per day — re-tapping the same dish clears it, tapping another moves
// it. Counts update in realtime via PocketBase's SSE stream.
//
// Pure progressive enhancement: the vote controls are rendered hidden and only
// revealed here. If JS is off, PocketBase is unreachable, or anything throws,
// the page is exactly the static menu it was before — no errors, no layout shift.
(function () {
  'use strict';

  var body = document.body;
  var DAY = body.getAttribute('data-day');
  var PB_URL = body.getAttribute('data-pb-url');
  var COLLECTION = body.getAttribute('data-votes-collection');
  if (!DAY || !PB_URL || !COLLECTION) return;

  var items = Array.prototype.slice.call(
    document.querySelectorAll('.item[data-dish-key]'),
  );
  if (items.length === 0) return;

  var BASE = PB_URL.replace(/\/+$/, '') + '/api/collections/' + COLLECTION + '/records';

  // ---- local identity + remembered pick -----------------------------------

  var VOTER_KEY = 'fa.voterId';
  var VOTE_KEY = 'fa.vote';

  function store(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* private mode / disabled storage: fall back to in-memory only */
    }
  }
  function load(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var voterId = load(VOTER_KEY);
  if (!voterId) {
    voterId = uuid();
    store(VOTER_KEY, voterId);
  }

  // The visitor's pick for *today*: { day, recordId, dishKey, restaurantId }.
  // A stored pick from an earlier day is stale and ignored.
  var myVote = null;
  (function () {
    var raw = load(VOTE_KEY);
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.day === DAY) myVote = parsed;
    } catch (e) {
      /* ignore corrupt cache */
    }
  })();

  function rememberVote() {
    if (myVote) store(VOTE_KEY, JSON.stringify(myVote));
    else store(VOTE_KEY, JSON.stringify({ day: DAY }));
  }

  // ---- state ---------------------------------------------------------------

  // Authoritative server view: recordId -> dishKey. Counts are derived from it
  // so create/update/delete events (and our own optimistic edits) reconcile
  // idempotently by record id.
  var recordKeys = Object.create(null);
  // Optimistic create rows not yet confirmed (tempId -> dishKey).
  var pending = Object.create(null);

  // dishKey -> array of .item elements (a dish can repeat? keys are unique, but
  // keep it a list for safety).
  var byKey = Object.create(null);
  items.forEach(function (el) {
    var key = el.getAttribute('data-dish-key');
    (byKey[key] || (byKey[key] = [])).push(el);
  });

  function counts() {
    var c = Object.create(null);
    var id;
    for (id in recordKeys) c[recordKeys[id]] = (c[recordKeys[id]] || 0) + 1;
    for (id in pending) c[pending[id]] = (c[pending[id]] || 0) + 1;
    return c;
  }

  function myDishKey() {
    return myVote ? myVote.dishKey : null;
  }

  // ---- rendering -----------------------------------------------------------

  function render() {
    var c = counts();
    var mine = myDishKey();
    items.forEach(function (el) {
      var key = el.getAttribute('data-dish-key');
      var picked = key === mine;
      var others = (c[key] || 0) - (picked ? 1 : 0);
      if (others < 0) others = 0;

      var btn = el.querySelector('.vote-btn');
      if (btn) {
        btn.hidden = false;
        btn.classList.toggle('is-picked', picked);
        btn.setAttribute('aria-pressed', picked ? 'true' : 'false');
        btn.textContent = picked ? "You're having this" : "I'm having this!";
      }

      var count = el.querySelector('.vote-count');
      if (count) {
        if (others > 0) {
          count.hidden = false;
          while (count.firstChild) count.removeChild(count.firstChild);

          var icon = document.createElement('span');
          icon.className = 'vote-count-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = '🍴';

          var num = document.createElement('span');
          num.className = 'vote-count-num';
          num.textContent = String(others);

          var label = document.createElement('span');
          label.className = 'vote-count-label';
          label.textContent =
            (others === 1 ? 'other' : 'others') +
            (picked ? ' too' : ' having this');

          count.appendChild(icon);
          count.appendChild(num);
          count.appendChild(label);
          count.setAttribute(
            'title',
            others +
              (others === 1 ? ' colleague is' : ' colleagues are') +
              ' having this' +
              (picked ? ' too' : ''),
          );
        } else {
          count.hidden = true;
          while (count.firstChild) count.removeChild(count.firstChild);
        }
      }
    });
  }

  // ---- backend calls -------------------------------------------------------

  function listToday() {
    var url =
      BASE +
      '?perPage=500&fields=id,voter_id,dish_key&filter=' +
      encodeURIComponent("day='" + DAY + "'");
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('list ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var rows = (data && data.items) || [];
        rows.forEach(function (row) {
          recordKeys[row.id] = row.dish_key;
          if (row.voter_id === voterId) {
            myVote = {
              day: DAY,
              recordId: row.id,
              dishKey: row.dish_key,
              restaurantId: row.dish_key.split('::')[0],
            };
          }
        });
        // If we cached a pick the server no longer has, drop it.
        if (myVote && myVote.recordId && !(myVote.recordId in recordKeys)) {
          myVote = null;
        }
        rememberVote();
      });
  }

  function createVote(restaurantId, key, name) {
    return fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voter_id: voterId,
        day: DAY,
        restaurant_id: restaurantId,
        dish_key: key,
        dish_name: name,
      }),
    }).then(function (res) {
      if (res.ok) return res.json();
      // A 400 here usually means the unique (voter_id, day) index rejected us
      // because a row already exists (e.g. cleared localStorage). Recover by
      // locating and patching that row.
      if (res.status === 400) return recoverAndPatch(restaurantId, key, name);
      throw new Error('create ' + res.status);
    });
  }

  function recoverAndPatch(restaurantId, key, name) {
    var url =
      BASE +
      '?perPage=1&fields=id&filter=' +
      encodeURIComponent("voter_id='" + voterId + "' && day='" + DAY + "'");
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('recover ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var row = data && data.items && data.items[0];
        if (!row) throw new Error('recover: no row');
        return patchVote(row.id, restaurantId, key, name);
      });
  }

  function patchVote(recordId, restaurantId, key, name) {
    return fetch(BASE + '/' + recordId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        dish_key: key,
        dish_name: name,
      }),
    }).then(function (res) {
      if (!res.ok) throw new Error('patch ' + res.status);
      return res.json();
    });
  }

  function deleteVote(recordId) {
    return fetch(BASE + '/' + recordId, { method: 'DELETE' }).then(function (
      res,
    ) {
      if (!res.ok && res.status !== 404) throw new Error('delete ' + res.status);
    });
  }

  // ---- interaction ---------------------------------------------------------

  var inFlight = false;

  function onPick(el) {
    if (inFlight) return;
    var key = el.getAttribute('data-dish-key');
    var restaurantId = el.getAttribute('data-restaurant-id');
    var name = el.getAttribute('data-dish-name') || '';

    var snapshot = {
      recordKeys: assign({}, recordKeys),
      pending: assign({}, pending),
      myVote: myVote,
    };

    function rollback() {
      recordKeys = snapshot.recordKeys;
      pending = snapshot.pending;
      myVote = snapshot.myVote;
      rememberVote();
      render();
    }

    inFlight = true;
    var action;

    if (myVote && myVote.dishKey === key) {
      // Toggle off.
      var removedId = myVote.recordId;
      if (removedId) delete recordKeys[removedId];
      myVote = null;
      render();
      action = deleteVote(removedId);
    } else if (myVote && myVote.recordId) {
      // Move the existing vote to a new dish.
      recordKeys[myVote.recordId] = key;
      myVote = {
        day: DAY,
        recordId: myVote.recordId,
        dishKey: key,
        restaurantId: restaurantId,
      };
      render();
      action = patchVote(myVote.recordId, restaurantId, key, name);
    } else {
      // First pick of the day.
      var tempId = 'tmp-' + uuid();
      pending[tempId] = key;
      myVote = {
        day: DAY,
        recordId: null,
        dishKey: key,
        restaurantId: restaurantId,
      };
      render();
      action = createVote(restaurantId, key, name).then(function (record) {
        delete pending[tempId];
        if (record && record.id) {
          recordKeys[record.id] = record.dish_key || key;
          if (myVote) myVote.recordId = record.id;
        }
      });
    }

    Promise.resolve(action)
      .then(function () {
        rememberVote();
        render();
      })
      .catch(function () {
        rollback();
      })
      .then(function () {
        inFlight = false;
      });
  }

  items.forEach(function (el) {
    var btn = el.querySelector('.vote-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      onPick(el);
    });
  });

  // ---- realtime (PocketBase SSE) ------------------------------------------

  function delta(action, record) {
    if (!record || record.day !== DAY) return;
    var id = record.id;
    if (action === 'create' || action === 'update') {
      recordKeys[id] = record.dish_key;
    } else if (action === 'delete') {
      delete recordKeys[id];
    }
    // Keep our own pointer honest if someone/the server changed our row.
    if (myVote && myVote.recordId === id) {
      if (action === 'delete') myVote = null;
      else
        myVote = {
          day: DAY,
          recordId: id,
          dishKey: record.dish_key,
          restaurantId: record.restaurant_id || record.dish_key.split('::')[0],
        };
      rememberVote();
    }
    render();
  }

  function connectRealtime() {
    if (typeof window.EventSource !== 'function') return;
    var es;
    try {
      es = new EventSource(PB_URL.replace(/\/+$/, '') + '/api/realtime');
    } catch (e) {
      return;
    }

    es.addEventListener('PB_CONNECT', function (e) {
      var clientId;
      try {
        clientId = JSON.parse(e.data).clientId;
      } catch (err) {
        return;
      }
      if (!clientId) return;
      // Subscribe to the collection and re-tally to heal any missed events
      // (e.g. across a reconnect).
      fetch(PB_URL.replace(/\/+$/, '') + '/api/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId,
          subscriptions: [COLLECTION],
        }),
      })
        .then(function () {
          return listToday();
        })
        .then(render)
        .catch(function () {});
    });

    es.addEventListener(COLLECTION, function (e) {
      var msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (msg && msg.action && msg.record) delta(msg.action, msg.record);
    });
  }

  function assign(target, src) {
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    return target;
  }

  // ---- boot ----------------------------------------------------------------

  render(); // reveal controls + restore cached highlight immediately
  listToday()
    .then(render)
    .catch(function () {
      /* counts unavailable: controls still work optimistically/offline */
    })
    .then(connectRealtime);
})();
