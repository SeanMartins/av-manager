// Pause dentro il turno e ore nette mai negative.
// Le funzioni vengono lette da index.html, così il test segue sempre il codice vero.
// Esecuzione: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const estrai = nome => {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i >= 0, `funzione ${nome} non trovata in index.html`);
  const j = html.indexOf('\n}\n', i);
  return html.slice(i, j + 2);
};
const { arrotondaA15Min, pauseDentroTurno, pauseMsDentro, oreNetteMs } = new Function(
  ['arrotondaA15Min', 'pauseDentroTurno', 'pauseMsDentro', 'oreNetteMs'].map(estrai).join('\n') +
  '\nreturn { arrotondaA15Min, pauseDentroTurno, pauseMsDentro, oreNetteMs };'
)();

const T = hm => `2026-11-04T${hm}.000Z`;
const ore = ms => ms / 3600000;

test('turno breve: uscita arrotondata prima della pausa reale → ore nette non negative', () => {
  // Caso della prova: entrata 06:45, pausa 06:48:51–06:48:52, uscita arrotondata 06:45
  const entrata = T('06:45:00'), uscita = arrotondaA15Min(new Date(T('06:49:10'))).toISOString();
  assert.equal(uscita, T('06:45:00'));
  const pause = [{ inizio: T('06:48:51'), fine: T('06:48:52') }];
  assert.deepEqual(pauseDentroTurno(entrata, uscita, pause), []);
  assert.equal(oreNetteMs({ entrata, uscita, pause }), 0);
});

test('pausa che sborda oltre l\'uscita conta solo fino all\'uscita', () => {
  const p = { entrata: T('09:00:00'), uscita: T('13:00:00'), pause: [{ inizio: T('12:30:00'), fine: T('13:20:00') }] };
  assert.deepEqual(pauseDentroTurno(p.entrata, p.uscita, p.pause), [{ inizio: T('12:30:00'), fine: T('13:00:00') }]);
  assert.equal(ore(oreNetteMs(p)), 3.5);
});

test('pausa prima dell\'entrata non conta', () => {
  const p = { entrata: T('09:00:00'), uscita: T('17:00:00'), pause: [{ inizio: T('08:30:00'), fine: T('08:50:00') }] };
  assert.equal(pauseMsDentro(p), 0);
  assert.equal(ore(oreNetteMs(p)), 8);
});

test('pausa con fine prima dell\'inizio (inserita male) non aggiunge ore', () => {
  // Caso del 04/08: pausa 23:00 → 01:30 salvata sullo stesso giorno
  const p = { entrata: T('07:30:00'), uscita: T('15:00:00'), pause: [{ inizio: T('21:00:00'), fine: '2026-11-03T23:30:00.000Z' }] };
  assert.equal(pauseMsDentro(p), 0);
  assert.equal(ore(oreNetteMs(p)), 7.5);
});

test('uscita prima dell\'entrata → 0 ore, mai negative', () => {
  const p = { entrata: T('21:00:00'), uscita: '2026-11-03T23:30:00.000Z', pause: [] };
  assert.equal(oreNetteMs(p), 0);
});

test('pause sovrapposte contano una volta', () => {
  const p = { entrata: T('09:00:00'), uscita: T('17:00:00'), pause: [
    { inizio: T('13:00:00'), fine: T('14:00:00') }, { inizio: T('13:30:00'), fine: T('14:30:00') }] };
  assert.equal(ore(pauseMsDentro(p)), 1.5);
  assert.equal(ore(oreNetteMs(p)), 6.5);
});

test('turno normale invariato', () => {
  const p = { entrata: T('09:00:00'), uscita: T('18:30:00'), pause: [{ inizio: T('13:00:00'), fine: T('14:30:00') }] };
  assert.equal(ore(oreNetteMs(p)), 8);
});

test('turno senza uscita → null', () => {
  assert.equal(oreNetteMs({ entrata: T('09:00:00'), uscita: null, pause: [] }), null);
});
