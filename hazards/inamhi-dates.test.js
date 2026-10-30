import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInamhiText} from './adapters.js';
const bulletin=validity=>`SYNTHETIC TEST\nBoletin Meteorologico Nro. 900\nFecha y hora de emision: miercoles, 28 de octubre de 2026, 15:00 horas\nVigencia: ${validity}\nNIVEL AMENAZA: MEDIO - MUY ALTO FENOMENO: LLUVIAS`;
test('explicit start month across October/November (synthetic regression)',()=>{
 const p=parseInamhiText(bulletin('desde 13H00 del 29 de octubre hasta las 23H00 del 01 de noviembre de 2026'));
 assert.equal(p.issuedAt,'2026-10-28T20:00:00.000Z');
 assert.equal(p.validFrom,'2026-10-29T18:00:00.000Z');assert.equal(p.validTo,'2026-11-02T04:00:00.000Z');
});
test('omitted start month must not roll over or invent a previous month',()=>{
 const p=parseInamhiText(bulletin('desde 13H00 del 29 hasta las 23H00 del 01 de noviembre de 2026'));
 assert.equal(p.validFrom,null);assert.equal(p.validTo,null);
});

import {parseInamhiValidity} from './inamhi-dates.js';
import {inspectWarningValidity} from './warning-validity.js';
import {joinPdfItems} from './pdf-layout.js';
const cases=[
 ['same month, shared start month/year','desde 00:00 del 01 hasta las 23:59 del 30 de abril de 2026','2026-04-01T05:00:00.000Z','2026-05-01T04:59:00.000Z'],
 ['explicit years','desde 23h59 del 31 de diciembre de 2026 hasta las 00h00 del 01 de enero de 2027','2027-01-01T04:59:00.000Z','2027-01-01T05:00:00.000Z'],
 ['shared end year across December/January','desde 23:59 del 31 de diciembre hasta las 00:00 del 01 de enero de 2027','2027-01-01T04:59:00.000Z','2027-01-01T05:00:00.000Z'],
 ['shared start year across December/January','desde 23:59 del 31 de diciembre de 2026 hasta las 00:00 del 01 de enero','2027-01-01T04:59:00.000Z','2027-01-01T05:00:00.000Z'],
 ['leap February','desde 00H00 del 29 de febrero hasta las 23H59 del 01 de marzo de 2028','2028-02-29T05:00:00.000Z','2028-03-02T04:59:00.000Z'],
 ['month 31 to month 30','desde 00:00 del 31 de marzo hasta las 23:59 del 01 de abril de 2026','2026-03-31T05:00:00.000Z','2026-04-02T04:59:00.000Z'],
 ['date before time','desde el 29 de octubre de 2026 a las 13:00 hasta el 01 de noviembre de 2026 a las 23:00','2026-10-29T18:00:00.000Z','2026-11-02T04:00:00.000Z'],
 ['PDF line/word/number fragments','desde 1 3 H 0 0 del 2 9 de octu\nbre hasta las 2 3 : 0 0 del 0 1 de noviem\nbre de 2 0 2 6','2026-10-29T18:00:00.000Z','2026-11-02T04:00:00.000Z'],
];
for(const [name,text,from,to] of cases)test(name,()=>{
 const p=parseInamhiValidity(`Vigencia: ${text}`);assert.equal(p.validFrom,from);assert.equal(p.validTo,to);
 assert.equal(p.originalValidityText,`Vigencia: ${text}`);assert.equal(p.validityParseStatus,'parsed');
});
for(const text of [
 '', 'desde 13:00 del 29 hasta las 23:00 del 01',
 'desde 00:00 del 29 de febrero hasta las 23:59 del 01 de marzo de 2027',
 'desde 00:00 del 31 de abril hasta las 23:59 del 01 de mayo de 2026',
 'desde 13:1 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026',
 'desde 24:00 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026',
 'desde 23:60 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026',
 'desde 13:00 del 29 de noviembre de 2026 hasta las 23:00 del 01 de octubre de 2026',
 'desde 13:00 del 29 hasta las 23:00 del 01 de enero de 2027',
 'desde 13:00 del 29 de noviembre hasta las 23:00 del 01 de octubre de 2026',
 'desde 13:00 del 29 de octubre de 2026 hasta las 13:00 del 29 de octubre de 2026',
 'desde 13:00 del 01 de enero hasta las 23:00 del 01 de noviembre de 2026',
 'desde 13:00 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026 o 2027',
 'desde 13:00 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026 Vigencia: otra',
])test(`reject incomplete/ambiguous/impossible: ${text}`,()=>{
 const p=parseInamhiValidity(`Vigencia: ${text}`);assert.equal(p.validFrom,null);assert.equal(p.validTo,null);
});
test('glyph fragments preserve validity and expired windows remain stale',()=>{
 const text='Vigencia: desde 13H00 del 29 de octubre hasta las 23H00 del 01 de noviembre de 2026';
 const p=parseInamhiValidity(joinPdfItems([...text].map(str=>({str}))));
 assert.equal(p.validFrom,'2026-10-29T18:00:00.000Z');
 const status=inspectWarningValidity({...p,issuedAt:'2026-10-28T20:00:00.000Z',retrievedAt:'2026-10-30T00:02:31.269Z'},new Date('2026-11-02T04:00:00Z'));
 assert.equal(status.dataStatus,'stale');assert.deepEqual(status.blockers,['warning_expired']);
});
test('unknown month on both ends and unsupported historical timezone never guessed',()=>{
 assert.equal(parseInamhiValidity('Vigencia: desde 13:00 del 29 de 2026 hasta las 23:00 del 30 de 2026').validFrom,null);
 assert.equal(parseInamhiValidity('Vigencia: desde 13:00 del 29 de octubre hasta las 23:00 del 30 de octubre de 1900').validFrom,null);
});

test('only explicit unqualified coverage lists establish provincial scope',()=>{
 const parse=text=>parseInamhiText(bulletin('desde 13:00 del 29 de octubre hasta las 23:00 del 01 de noviembre de 2026')+'\n'+text);
 for(const text of ['Leyenda: Guayas','ZONAS AFECTADAS: Guayas\nexcepto las zonas altas','ZONAS AFECTADAS: oeste de Guayas','ZONAS AFECTADAS: Guayas excepto zonas altas','ZONAS AFECTADAS\nRegion Litoral: Guayas y zonas del interior','ZONAS AFECTADAS: Guayas\nZONAS AFECTADAS: Chimborazo']) {
  assert.ok(parse(text).areaNames.includes('Guayas'));assert.deepEqual(parse(text).coveredAreaNames,[]);
 }
 assert.deepEqual(parse('ZONAS AFECTADAS: Guayas, Los Ríos.').coveredAreaNames,['Guayas','Los Ríos']);
});
