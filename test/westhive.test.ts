import { expect, test, describe } from 'bun:test';
import { parseWesthive, config } from '../src/restaurants/westhive.ts';

const html = await Bun.file(
  new URL('./fixtures/westhive.html', import.meta.url),
).text();

describe('parseWesthive', () => {
  test("extracts only today's lunch and weekly specials in German", () => {
    expect(parseWesthive(html)).toEqual([
      {
        name: 'Geschmortes Rindsgulasch mit Sauerrahm, Serviettenknödel & Ofenkürbis',
        price: '19.90',
        language: 'de',
      },
      {
        name: 'Suppe: Rübli-Ingwer',
        price: '7.00 / 11.50',
        language: 'de',
      },
    ]);
  });

  test('returns no items for an empty page', () => {
    expect(parseWesthive('<html><body></body></html>')).toEqual([]);
  });
});

describe('westhive config', () => {
  test('uses the German menu URL', () => {
    expect(config.url).toBe('https://www.westhive.com/de/eat-drink/westhive-kitchen-zuerich-hardturm/');
  });
});
