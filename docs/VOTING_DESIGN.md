# Food Assembler — Lunch Voting Design Document

Companion to [`DESIGN.md`](./DESIGN.md). This document describes the **lunch
voting** feature: letting each visitor mark the dish they're having today,
syncing that choice to a PocketBase backend, and showing everyone a live count
of how many colleagues picked each dish.

## 1. Overview

Today the site is a **static page** published to GitHub Pages with a small
progressive-enhancement layer in [`public/app.js`](../public/app.js). Voting
adds a thin, optional client-side feature on top of that:

- Each menu item gets a **"I'm having this"** control.
- A visitor can mark **one dish for the whole day** (across all restaurants).
- Their pick is **highlighted** on the page and remembered across reloads.
- Picks are written to **PocketBase**; every visitor sees a **live count** of
  how many *other* people picked each dish, updated in realtime.

There are **no user accounts**. A visitor is identified only by an opaque,
randomly generated `voterId` kept in `localStorage`.

### Decisions captured (from clarification)

| Question | Decision |
| --- | --- |
| Voting scope | **One pick total per visitor per day** (a single dish across all restaurants). |
| Change / un-mark | **Yes** — re-clicking changes or removes the pick; counts update live. |
| Count freshness | **Live realtime** via PocketBase subscriptions. |
| Backend | Existing PocketBase at `https://checkboxes.devinite.dev/` (same instance that serves the lunch facts). |
| Dish identity | **Derived stable key** from `restaurantId` + normalized dish name, computed at **build time** — no `data.json` / pipeline schema change. |

## 2. Goals & Non-Goals

### Goals
- One-tap "I'm having this" on any dish, with a clear highlight of the current
  visitor's pick.
- A single pick per visitor per day; re-picking moves the vote, re-tapping the
  same dish clears it.
- Live per-dish count of **other** people who picked it.
- Fully **progressive enhancement**: with no JS, or if PocketBase is
  unreachable, the page renders and reads exactly as today — voting is simply
  absent. No layout shift, no errors.
- No build-pipeline or `data.json` schema changes.

### Non-Goals (v1)
- No authentication, identity verification, or anti-abuse guarantees (internal,
  low-stakes tool — see §9).
- No historical vote archive — votes are scoped to **today** only, matching the
  today-only nature of the site.
- No per-restaurant or multi-dish voting (explicitly one pick per day).
- No server-side rendering of counts (counts are a client-only enhancement).

## 3. Dish Identity (stable key)

Menu items have **no stable ID** today — only a `name` that changes daily. To
attribute a vote to a dish we derive a deterministic key at **build time** in
the HTML renderer and embed it as a data attribute, so the markup stays the
single source of truth (same pattern as `data-hq` / `data-rank-*`).

```
dishKey = restaurantId + "::" + normalize(name)

normalize(name):
  - Unicode NFKD, strip diacritics
  - lowercase
  - trim, collapse internal whitespace to single "-"
  - drop characters outside [a-z0-9-]
  - collapse repeated "-"
```

Example: `westhive-hardturm::soup-asparagus`.

Each rendered `<li class="item">` gains:

```html
<li class="item"
    data-restaurant-id="westhive-hardturm"
    data-dish-key="westhive-hardturm::soup-asparagus"
    data-dish-name="Soup: Asparagus">
  ...
</li>
```

**Collisions:** if two dishes at the same restaurant normalize to the same key
(rare), append a 1-based index (`...::soup-asparagus-2`) during render so keys
stay unique within a page. The renderer already iterates items in order, so this
is a small, local change in `renderRestaurant`.

**Stability note:** the key changes if the restaurant renames a dish during the
day. That's acceptable — it just starts a fresh tally for the renamed dish, and
the day's data is ephemeral anyway.

## 4. PocketBase Schema

One regular collection: **`lunch_votes`**.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | auto | PocketBase record id. |
| `voter_id` | text (required) | Opaque client-generated UUID from `localStorage`. |
| `day` | text (required) | `YYYY-MM-DD` in **Europe/Zurich** (matches `todayInZurich()`). Stored as text, not `date`, to avoid TZ ambiguity. |
| `restaurant_id` | text (required) | The dish's restaurant slug. |
| `dish_key` | text (required) | The stable key from §3. |
| `dish_name` | text (optional) | Human-readable name, for debugging/analytics. |
| `created` | auto | PocketBase system field. |
| `updated` | auto | PocketBase system field. |

### Indexes
- **Unique** index on `(voter_id, day)` → enforces *one pick per visitor per
  day* at the database level. A second pick is an **update** of the same row,
  not a new row.
- Non-unique index on `(day, dish_key)` → fast count/tally queries.

### Why one collection (not a separate counts table)
The expected volume is small (an internal lunch tool: tens, maybe low hundreds
of votes per day). The client fetches **today's** rows once and tallies counts
in memory, then keeps the tally current from realtime events. No aggregation
table or PocketBase "view" collection is needed. If volume ever grows, a
read-only **view collection** (`SELECT day, dish_key, COUNT(*) ...`) can be
added without touching the client's data shape.

### API rules (anonymous access)
Because visitors are unauthenticated, rules are permissive by design. They are
*best-effort* (see §9 for the abuse discussion):

| Action | Rule | Rationale |
| --- | --- | --- |
| **List / View** | public (open) | Client must read today's votes to tally counts. Data is non-sensitive: opaque ids + dish keys. |
| **Create** | public (open) | Anonymous visitors cast votes. |
| **Update** | public (open) | Re-picking patches the visitor's own row (located by `voter_id` + `day`). |
| **Delete** | public (open) | Un-picking removes the row. |

> Optionally tighten List/View with a filter so only **today's** rows are
> returned by default, but counts still require reading all of a given day's
> rows, so a fully open read rule is simplest.

### CORS
The PocketBase REST + realtime endpoints must allow the GitHub Pages origin.
The same instance already serves `https://checkboxes.devinite.dev/facts/lunch`
to the page successfully, so cross-origin requests from Pages already work; we
only need to confirm the `/api/collections/lunch_votes/...` and realtime
(`/api/realtime`) routes are reachable from the Pages origin.

## 5. Client Architecture

A new self-contained IIFE in `public/app.js` (a third block alongside the
location toggle and lunch-fact garnish), or a small `public/voting.js` loaded
with `defer`. It is entirely **optional**: if anything fails it silently no-ops.

### Identity & local persistence (`localStorage`)
| Key | Value | Purpose |
| --- | --- | --- |
| `fa.voterId` | random UUID (`crypto.randomUUID()`) | Stable anonymous identity, created once. |
| `fa.vote` | `{ day, recordId, dishKey, restaurantId }` (JSON) | The visitor's last pick, to restore the highlight instantly on load and to know which record to patch/delete. |

On load, if `fa.vote.day !== todayKey`, the stored pick is stale → ignore it
(the new day starts unmarked). The day key is read from a `data-day` attribute
the renderer adds to `<body>` (sourced from `data.date`) so client and backend
agree on the Europe/Zurich day boundary.

### Configuration in markup
The renderer emits the backend base URL and collection name as data attributes
(single source of truth, mirroring `data-facts-url`):

```html
<body data-day="2026-06-26"
      data-pb-url="https://checkboxes.devinite.dev"
      data-votes-collection="lunch_votes">
```

### Counts model
The client keeps an in-memory map `counts: dishKey -> number` plus knowledge of
its own pick. For each dish it renders:

- **others** = `counts[dishKey] - (myPick === dishKey ? 1 : 0)`
- A badge like `🍴 3` ("3 colleagues") and, on the visitor's own pick, a
  distinct **highlighted** state with a "you" marker.

## 6. Data Flow

### Initial load
```
1. Read data-day, data-pb-url, data-votes-collection from <body>.
2. Ensure fa.voterId exists (create + persist if missing).
3. GET {pb}/api/collections/lunch_votes/records
        ?filter=(day='<today>')&perPage=500&fields=id,voter_id,dish_key
   → build counts map.
4. Reconcile own pick:
     - Find row where voter_id == fa.voterId (authoritative).
     - If found, adopt it (update fa.vote); else clear stale fa.vote.
5. Render badges + highlight current pick.
6. Open realtime subscription (§7).
```

### Casting / changing / clearing a pick
```
User taps dish D:
  if myPick == D:                      # toggle off
     DELETE my record  → optimistic count[D]--
     clear fa.vote
  elif I already have a pick P:        # move the vote
     PATCH my record { restaurant_id, dish_key=D, dish_name }
     optimistic: count[P]--, count[D]++
     update fa.vote
  else:                                # first pick of the day
     POST { voter_id, day, restaurant_id, dish_key, dish_name }
     optimistic: count[D]++
     store record id in fa.vote

On HTTP success: keep optimistic state.
On failure: roll back optimistic change + re-render (and, if the unique index
            rejected a stale POST, fall back to locating + patching the row).
```

Optimistic UI keeps the interaction snappy; realtime events (including the
echo of our own write) are **reconciled idempotently** by always trusting the
authoritative row for `voter_id == fa.voterId`.

## 7. Realtime

Use the PocketBase JS SDK (or a tiny hand-rolled SSE client against
`/api/realtime`) subscribed to the `lunch_votes` collection.

- Subscribe to `create` / `update` / `delete` events.
- Filter to today where supported; otherwise filter client-side on `day`.
- On each event, update the `counts` map and re-render only the affected
  dish badge(s). Events for the visitor's **own** `voter_id` are deduplicated
  against the optimistic state so the count never double-moves.
- On disconnect, the SDK reconnects automatically; on reconnect, re-run the
  initial tally (step 3) to heal any missed deltas.

Realtime is an **enhancement of an enhancement**: if the subscription can't be
established, counts still load once and the page is fully usable.

## 8. Rendering / Markup Changes

All additive, server-side, no `data.json` change:

1. `src/render/html.ts`
   - `<body>` gains `data-day`, `data-pb-url`, `data-votes-collection`.
   - `renderItem` / `renderRestaurant` add `data-restaurant-id`,
     `data-dish-key`, `data-dish-name` to each `<li class="item">`, plus a
     hidden-by-default vote control + count badge placeholder:
     ```html
     <button type="button" class="vote-btn" aria-pressed="false" hidden>
       I'm having this
     </button>
     <span class="vote-count" hidden></span>
     ```
   - The control is rendered `hidden`; `app.js` reveals it (progressive
     enhancement — no JS means no dangling buttons).
2. `public/styles.css` — styles for `.vote-btn`, `.vote-btn.is-picked`
   (the highlight), and `.vote-count`.
3. `public/app.js` (or new `public/voting.js`) — the logic in §5–§7.
4. A small key-normalization helper shared by the renderer (and unit-tested).

## 9. Privacy, Abuse & Limitations

- **Anonymous by design.** The only identifier is a random `voterId`; no IP,
  name, or device fingerprint is stored. The voter id is meaningless outside
  this feature.
- **No real enforcement of "one vote".** Without auth, a determined user can
  clear `localStorage`, use another browser, or call the API directly to vote
  multiple times. This is acceptable for a friendly internal lunch tool. The
  unique `(voter_id, day)` index prevents *accidental* duplicates, not
  deliberate ones.
- **Open write rules** mean anyone could, in principle, delete/modify others'
  rows. Mitigations if this matters later: move writes behind a thin
  authenticated proxy, use PocketBase auth (anonymous/device tokens), or add a
  server hook that checks `voter_id` ownership. Out of scope for v1.
- **Data is ephemeral.** Old days' rows can be purged by a scheduled PocketBase
  job / cron to keep the collection small (e.g. delete `day < today - 7`).

## 10. Testing Strategy

- **Unit**: dish-key normalization (diacritics, punctuation, whitespace,
  collision indexing) — pure function, deterministic.
- **Unit**: HTML renderer emits the new data attributes and hidden controls
  (extend existing `test/render.test.ts`).
- **Manual / integration**: against the live PocketBase dev instance —
  cast/change/clear a vote across two browsers and confirm live count updates.
- **Graceful degradation**: load the page with JS disabled and with the PB host
  blocked; verify the page is unchanged and error-free.

## 11. Rollout

1. Create the `lunch_votes` collection, indexes, and rules in PocketBase
   (`https://checkboxes.devinite.dev/_/`). Confirm CORS for the Pages origin.
2. Add the dish-key helper + renderer attributes (no behavior change yet).
3. Ship the client voting module behind the hidden-control progressive
   enhancement.
4. Verify realtime + degradation, then announce.

## 12. Open Questions / Future Work

- Show a small **leaderboard** ("most popular dish today") in the header stats.
- Optional **anonymous device auth** (PocketBase auth token) to make
  "one vote" enforceable without naming users.
- Per-restaurant **"X people heading here"** roll-up from individual dish counts.
- Scheduled **purge** of stale vote rows.
- Decide whether to surface counts **server-side** later (would require a build
  that reads PB at render time — currently intentionally avoided).
