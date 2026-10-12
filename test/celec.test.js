import test from 'node:test';
import assert from 'node:assert/strict';
import { celecUrl, fetchMrid } from '../celec.js';

const response = items => ({ status: 200, data: JSON.stringify({ items }) });

test('consulta el día de Ecuador después de las 19:00 aunque el servidor use UTC', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    for (const [instant, day] of [
      ['2026-10-11T23:59:00Z', '11/10/2026'],
      ['2026-10-12T00:00:00Z', '11/10/2026'],
      ['2026-10-12T04:59:00Z', '11/10/2026'],
      ['2026-10-12T05:00:00Z', '12/10/2026'],
      ['2027-01-01T00:30:00Z', '31/12/2026'],
    ]) {
      assert.equal(new URL(celecUrl(30031, new Date(instant))).searchParams.get('fecha'), `${day} 00:00:00`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('recupera el día anterior si el nuevo día no tiene lecturas', async () => {
  const reading = { loctimestamp: '2026-10-12T04:00:00Z', valueedit: 2125.1 };
  const dates = [];
  const value = await fetchMrid(30031, new Date('2026-10-12T05:05:00Z'), async url => {
    const date = new URL(url).searchParams.get('fecha');
    dates.push(date);
    return response(date.startsWith('12/') ? [{ valueedit: null }] : [reading]);
  });
  assert.deepEqual(value, reading);
  assert.deepEqual(dates, ['12/10/2026 00:00:00', '11/10/2026 00:00:00']);
});

test('conserva la última lectura por MRID y su timestamp ante un fallo', async () => {
  const now = new Date('2026-10-12T02:00:00Z');
  const reading = { loctimestamp: '2026-10-12T01:00:00Z', valueedit: 2125.2 };
  await fetchMrid(30538, now, async () => response([reading]));
  assert.deepEqual(await fetchMrid(30538, now, async () => { throw new Error('offline'); }), reading);
  assert.equal(await fetchMrid(30503, now, async () => response([])), null);
});

test('elige la lectura válida más reciente y acepta cero', async () => {
  const reading = { loctimestamp: '2026-10-12T01:00:00Z', valueedit: 0 };
  let requests = 0;
  const result = await fetchMrid(90919, new Date('2026-10-12T02:00:00Z'), async () => {
    requests++;
    return response([
      { loctimestamp: '2026-10-12T02:00:00Z', valueedit: null },
      { loctimestamp: '2026-10-12T00:00:00Z', valueedit: 1 },
      reading,
      { loctimestamp: '2026-10-12T03:00:00Z' },
    ]);
  });
  assert.deepEqual(result, reading);
  assert.equal(requests, 1);
});
