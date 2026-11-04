// Nomi delle squadre del Fantacalcio: sono testo libero degli utenti e vanno escapati
// in classifica, ultima giornata e calendario delle sfide.
// Esecuzione: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const estrai = nome => {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i >= 0, `funzione ${nome} non trovata in index.html`);
  return html.slice(i, html.indexOf('\n}\n', i) + 2);
};
const NOMI = ['esc', 'ffPuntiGiornataUid', 'ffRenderClassifica', 'ffRenderGiornata', 'ffRenderCalendarioSfide'];

const MALEVOLO = '<img src=x onerror=alert(1)>FC';
function render() {
  const el = {};
  const $ = id => (el[id] ||= { innerHTML: '' });
  const f = new Function('$', 'USER', 'ffTeamNome', 'cacheFfPunteggi', 'cacheFfGiornate', 'cacheFfCalendario',
    NOMI.map(estrai).join('\n') + '\nffRenderClassifica();ffRenderGiornata();ffRenderCalendarioSfide();');
  f($, { id: 'u1' }, { u1: MALEVOLO, u2: 'Squadra B', u3: 'Squadra C' },
    [{ uid: 'u1', giornata: 1, punti: 70, dettaglio: [] }, { uid: 'u2', giornata: 1, punti: 60, dettaglio: [] }],
    [{ numero: 1, sincronizzata: true }],
    [{ numero: 1, coppie: [{ uid1: 'u1', uid2: 'u2' }], bye: 'u3' }, { numero: 2, coppie: [{ uid1: 'u2', uid2: 'u3' }], bye: 'u1' }]);
  return el;
}

test('il nome squadra con HTML compare come testo in classifica, giornata e calendario', () => {
  const el = render();
  for (const id of ['ffClassificaList', 'ffGiornataDettaglio', 'ffCalendarioSfideList', 'ffClassificaSfideList']) {
    const h = el[id]?.innerHTML || '';
    assert.ok(!h.includes('<img'), `${id}: HTML del nome non escapato`);
  }
  assert.ok(el.ffClassificaList.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;FC'));
  assert.ok(el.ffCalendarioSfideList.innerHTML.includes('Riposa: &lt;img'));
});
