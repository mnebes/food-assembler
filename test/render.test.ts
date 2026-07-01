import { expect, test, describe } from 'bun:test';
import { renderJson } from '../src/render/json.ts';
import { renderHtml } from '../src/render/html.ts';
import type { RawData } from '../src/types.ts';

const fixture: RawData = {
  date: '2024-06-15',
  generatedAt: '2024-06-15T06:00:00.000Z',
  results: [
    {
      restaurant: {
        id: 'westhive',
        name: 'Westhive Kitchen',
        url: 'https://example.com/westhive',
        distances: { 'com-west': 'near', westpark: 'medium' },
      },
      status: 'ok',
      crawledAt: '2024-06-15T06:00:00.000Z',
      items: [
        {
          name: 'Zürcher Geschnetzeltes',
          description: 'mit Rösti',
          price: 'CHF 18.50',
          tags: ['lunch'],
          language: 'de',
        },
        { name: 'Vegan Bowl', language: 'en' },
      ],
    },
    {
      restaurant: {
        id: 'roots',
        name: 'Roots Kitchen',
        url: 'https://example.com/roots',
        distances: { 'com-west': 'far', westpark: 'near' },
      },
      status: 'no-menu',
      crawledAt: '2024-06-15T06:00:00.000Z',
      items: [],
    },
    {
      restaurant: {
        id: 'zhdk',
        name: 'ZHdK Toni-Areal',
        url: 'https://example.com/zhdk',
        distances: { 'com-west': 'medium', westpark: 'far' },
      },
      status: 'error',
      error: 'site down',
      crawledAt: '2024-06-15T06:00:00.000Z',
      items: [],
    },
  ],
};

describe('renderJson', () => {
  test('round-trips to the same data', () => {
    expect(JSON.parse(renderJson(fixture))).toEqual(fixture);
  });

  test('is pretty-printed and newline-terminated', () => {
    const out = renderJson(fixture);
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('\n  "date"');
  });
});

describe('renderHtml', () => {
  const html = renderHtml(fixture);

  test('includes the date and restaurant names', () => {
    expect(html).toContain('2024-06-15');
    expect(html).toContain('Westhive Kitchen');
    expect(html).toContain('Roots Kitchen');
  });

  test('shows distances from both HQs in playful wording', () => {
    expect(html).toContain('com.West');
    expect(html).toContain('Westpark');
    expect(html).toContain('around the corner'); // near
    expect(html).toContain('a nice stroll'); // medium
    expect(html).toContain('a proper hike'); // far
  });

  test('renders a location toggle with a button per HQ, first active', () => {
    expect(html).toContain('class="hq-toggle"');
    expect(html).toContain('data-hq="com-west"');
    expect(html).toContain('data-hq="westpark"');
    // The first HQ button is the default-active one.
    expect(html).toContain(
      '<button type="button" class="hq-btn is-active" data-hq="com-west" aria-pressed="true">com.West</button>',
    );
    expect(html).toContain(
      '<button type="button" class="hq-btn" data-hq="westpark" aria-pressed="false">Westpark</button>',
    );
  });

  test('tags distance chips and cards with HQ data for the toggle', () => {
    // Each chip carries its HQ id so app.js can show only the selected one...
    expect(html).toContain('class="distance" data-hq="com-west"');
    expect(html).toContain('class="distance" data-hq="westpark"');
    // ...and each card exposes per-HQ proximity ranks for closest-first sorting.
    expect(html).toContain('data-rank-com-west="0"'); // westhive: near
    expect(html).toContain('data-rank-westpark="1"'); // westhive: medium
  });

  test('loads the toggle script', () => {
    expect(html).toContain('<script src="./app.js" defer></script>');
  });

  test('wires the body to the PocketBase voting backend', () => {
    expect(html).toContain('data-day="2024-06-15"');
    expect(html).toContain('data-pb-url="https://checkboxes.devinite.dev"');
    expect(html).toContain('data-votes-collection="lunch_votes"');
    expect(html).toContain('<script src="./voting.js" defer></script>');
  });

  test('wires TGIF party mode and loads its script', () => {
    // Schedule config exposed on <body> so the markup is the single source of
    // truth; the visitor's clock (or ?tgif) decides activation client-side.
    expect(html).toContain('data-tgif-param="tgif"');
    expect(html).toContain('data-tgif-day="5"'); // Friday
    expect(html).toContain('data-tgif-from-hour="16"'); // 16:00
    // Easter egg: 16:00–18:00 Europe/Zurich, any day.
    expect(html).toContain('data-tgif-tz="Europe/Zurich"');
    expect(html).toContain('data-tgif-egg-from-hour="16"');
    expect(html).toContain('data-tgif-egg-to-hour="18"');
    expect(html).toContain('<script src="./tgif.js" defer></script>');
  });

  test('tags each dish with a stable vote key and a hidden vote control', () => {
    // Stable key derived from restaurant id + normalized dish name.
    expect(html).toContain(
      'data-dish-key="westhive::zurcher-geschnetzeltes"',
    );
    expect(html).toContain('data-restaurant-id="westhive"');
    expect(html).toContain('data-dish-name="Zürcher Geschnetzeltes"');
    // Vote control rendered hidden (progressive enhancement, revealed by JS).
    expect(html).toContain('class="vote-btn" aria-pressed="false" hidden');
    expect(html).toContain('class="vote-count"');
  });

  test('renders a hidden lunch-fact line wired to the facts endpoint', () => {
    expect(html).toContain('class="lunch-fact"');
    expect(html).toContain(
      'data-facts-url="https://checkboxes.devinite.dev/facts/lunch"',
    );
    // Rendered hidden so it is pure progressive enhancement (revealed by app.js).
    expect(html).toContain('aria-live="polite" hidden');
    expect(html).toContain('class="lunch-fact-text"');
    expect(html).toContain('class="lunch-fact-source"');
  });

  test('renders dish details and a language badge', () => {
    expect(html).toContain('Zürcher Geschnetzeltes');
    expect(html).toContain('CHF 18.50');
    expect(html).toContain('>DE<');
  });

  test('shows the no-menu and error states', () => {
    expect(html).toContain('No menu published today.');
    expect(html).toContain('Menu unavailable today.');
  });

  test('escapes HTML in source text', () => {
    const evil: RawData = {
      ...fixture,
      results: [
        {
          restaurant: {
            id: 'x',
            name: 'X',
            url: 'https://example.com/x',
            distances: { 'com-west': 'near', westpark: 'near' },
          },
          status: 'ok',
          crawledAt: '2024-06-15T06:00:00.000Z',
          items: [{ name: '<script>alert(1)</script>', language: 'en' }],
        },
      ],
    };
    const out = renderHtml(evil);
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
