import type { DistanceCategory, Language, MenuItem, MenuResult, RawData } from '../types.ts';
import { HQS, distanceWording, hqName } from '../hq.ts';
import { nowInZurich } from '../util/date.ts';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Playful glyph per distance category, paired with the wording from hq.ts. */
const DISTANCE_ICON: Record<DistanceCategory, string> = {
  near: '🚶',
  medium: '🥾',
  far: '🧗',
};

/** Proximity rank used for client-side "closest first" sorting (near = 0). */
const DISTANCE_RANK: Record<DistanceCategory, number> = {
  near: 0,
  medium: 1,
  far: 2,
};

const STATUS_LABEL: Record<MenuResult['status'], string> = {
  ok: 'open',
  'no-menu': 'idle',
  error: 'offline',
};

function languageBadge(language: Language): string {
  if (language === 'unknown') return '';
  return `<span class="lang-badge" title="source language">${escapeHtml(language.toUpperCase())}</span>`;
}

function renderItem(item: MenuItem): string {
  const parts: string[] = [];
  parts.push(
    `<div class="item-head"><span class="item-name">${escapeHtml(item.name)}</span>${languageBadge(item.language)}</div>`,
  );
  if (item.description) {
    parts.push(`<p class="item-desc">${escapeHtml(item.description)}</p>`);
  }
  const meta: string[] = [];
  if (item.price) meta.push(`<span class="item-price">${escapeHtml(item.price)}</span>`);
  if (item.tags && item.tags.length > 0) {
    meta.push(
      item.tags
        .map((t) => `<span class="item-tag">${escapeHtml(t)}</span>`)
        .join(''),
    );
  }
  if (meta.length > 0) parts.push(`<div class="item-meta">${meta.join('')}</div>`);
  return `<li class="item">${parts.join('')}</li>`;
}

function renderDistances(result: MenuResult): string {
  const chips = HQS.map((hq) => {
    const category = result.restaurant.distances[hq.id];
    return `<span class="distance" data-hq="${escapeHtml(hq.id)}" data-distance="${escapeHtml(category)}">
        <span class="distance-icon" aria-hidden="true">${DISTANCE_ICON[category]}</span>
        <span class="hq">${escapeHtml(hqName(hq.id))}</span>
        <span class="distance-word">${escapeHtml(distanceWording(category))}</span>
      </span>`;
  });
  return `<div class="distances">${chips.join('')}</div>`;
}

/** Per-HQ proximity ranks, emitted as data-attributes for client-side sorting. */
function distanceRankAttrs(result: MenuResult): string {
  return HQS.map(
    (hq) => `data-rank-${escapeHtml(hq.id)}="${DISTANCE_RANK[result.restaurant.distances[hq.id]]}"`,
  ).join(' ');
}

/**
 * The location toggle. Lets the visitor pick which HQ the distances are shown
 * for; the choice is synced to the `?hq=` query param by app.js so links are
 * shareable. Without JS this is inert and every HQ's distance stays visible.
 */
function renderHqToggle(): string {
  const buttons = HQS.map(
    (hq, i) =>
      `<button type="button" class="hq-btn${i === 0 ? ' is-active' : ''}" data-hq="${escapeHtml(hq.id)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${escapeHtml(hq.name)}</button>`,
  ).join('');
  return `<div class="hq-toggle" role="group" aria-label="Your location">
      <span class="hq-toggle-label" aria-hidden="true">📍 location</span>
      ${buttons}
    </div>`;
}

function renderBody(result: MenuResult): string {
  switch (result.status) {
    case 'ok':
      return `<ul class="items">${result.items.map(renderItem).join('')}</ul>`;
    case 'no-menu':
      return `<p class="note note-no-menu"><span class="note-glyph" aria-hidden="true">// </span>No menu published today.</p>`;
    case 'error':
      return `<p class="note note-error"><span class="note-glyph" aria-hidden="true">⚠ </span>Menu unavailable today.</p>`;
  }
}

function renderRestaurant(result: MenuResult): string {
  const { restaurant } = result;
  const name = restaurant.url
    ? `<a href="${escapeHtml(restaurant.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(restaurant.name)}</a>`
    : escapeHtml(restaurant.name);
  const count = result.status === 'ok' ? result.items.length : 0;
  const badgeText =
    STATUS_LABEL[result.status] + (result.status === 'ok' ? ` · ${count}` : '');
  const statusBadge = `<span class="status-badge status-${escapeHtml(result.status)}"><span class="status-dot" aria-hidden="true"></span>${badgeText}</span>`;
  return `<section class="restaurant restaurant-${escapeHtml(result.status)}" ${distanceRankAttrs(result)}>
      <header class="restaurant-head">
        <div class="restaurant-title">
          <h2>${name}</h2>
          ${statusBadge}
        </div>
        ${renderDistances(result)}
      </header>
      ${renderBody(result)}
    </section>`;
}

/** Render the full static summary page HTML for the given RawData. */
export function renderHtml(data: RawData): string {
  const updated = nowInZurich(new Date(data.generatedAt));
  const restaurants = data.results.map(renderRestaurant).join('\n');

  const servingCount = data.results.filter((r) => r.status === 'ok').length;
  const dishCount = data.results.reduce(
    (sum, r) => sum + (r.status === 'ok' ? r.items.length : 0),
    0,
  );

  const stats = `<dl class="stats">
      <div class="stat"><dt>restaurants</dt><dd>${data.results.length}</dd></div>
      <div class="stat"><dt>serving</dt><dd>${servingCount}</dd></div>
      <div class="stat"><dt>dishes</dt><dd>${dishCount}</dd></div>
    </dl>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Food Assembler — Lunch for ${escapeHtml(data.date)}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main>
    <header class="page-head">
      <p class="prompt"><span class="prompt-sigil">~/lunch&nbsp;$</span> ./assemble --today<span class="cursor" aria-hidden="true"></span></p>
      <h1><img class="title-logo" src="./logo.png" alt="" width="48" height="45" /> Today's Lunch</h1>
      <div class="page-meta">
        <span class="date" title="Europe/Zurich">${escapeHtml(data.date)}</span>
        <span class="updated">last updated ${escapeHtml(updated)}</span>
      </div>
      ${stats}
    </header>
    ${renderHqToggle()}
    <div class="grid">
      ${restaurants}
    </div>
    <footer class="page-foot">
      <p><code>assemble()</code> ran successfully · <a href="./data.json">raw data (JSON)</a></p>
    </footer>
  </main>
  <script src="./app.js" defer></script>
</body>
</html>
`;
}
