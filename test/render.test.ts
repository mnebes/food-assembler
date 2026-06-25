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
