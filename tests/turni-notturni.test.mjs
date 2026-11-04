// Turni oltre mezzanotte, pause dentro il turno, inserimento manuale senza doppioni.
// Le funzioni vengono lette da index.html, così il test segue sempre il codice vero.
// Esecuzione: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.TZ = 'Europe/Rome'; // orari come in Italia, ora legale compresa

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const estrai = nome => {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i >= 0, `funzione ${nome} non trovata in index.html`);
  return html.slice(i, html.indexOf('\n}\n', i) + 2);
};
const costante = nome => {
  const m = html.match(new RegExp(`const ${nome}=[^;]+;`));
  assert.ok(m, `costante ${nome} non trovata`);
  return m[0];
};
const NOMI = ['arrotondaA15Min', 'giornoLocale', 'pauseDentroTurno', 'pauseMsDentro', 'oreNetteMs', 'oreNetteGiorno',
  'costruisciTurnoManuale', 'turniSovrapposti', 'ultimaEntrataAperta', 'unaVoltaSola'];
const F = new Function(costante('TURNO_APERTO_MAX_MS') + '\n' + NOMI.map(estrai).join('\n') + `\nreturn {${NOMI.join(',')}};`)();

const ore = ms => Math.round(ms / 36e3) / 100;
const loc = (d, hm) => { const [y, m, g] = d.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, g, h, mi).toISOString(); };

// ── Timbratura live oltre mezzanotte ──
test('live: entrata alle 22:00, dopo mezzanotte con memoria vuota l\'entrata aperta viene ritrovata', () => {
  const entrata = F.arrotondaA15Min(new Date(loc('2026-11-04', '21:58'))).toISOString();
  assert.equal(entrata, loc('2026-11-04', '22:00'));
  const lista = [{ id: 'a', uid: 'u1', entrata, uscita: null }];
  const ora = new Date(loc('2026-11-05', '00:31')).getTime();
  assert.equal(F.ultimaEntrataAperta(lista, 'u1', ora)?.id, 'a');
  // altre persone, entrate chiuse e entrate più vecchie di 24 ore non contano
  assert.equal(F.ultimaEntrataAperta(lista, 'u2', ora), null);
  assert.equal(F.ultimaEntrataAperta([{ ...lista[0], uscita: loc('2026-11-05', '00:15') }], 'u1', ora), null);
  assert.equal(F.ultimaEntrataAperta(lista, 'u1', new Date(loc('2026-11-05', '22:01')).getTime()), null);
});

test('live: uscita arrotondata dopo mezzanotte → ore attribuite al giorno di inizio, pause dentro il turno', () => {
  const p = { entrata: loc('2026-11-04', '22:00'), uscita: F.arrotondaA15Min(new Date(loc('2026-11-05', '01:37'))).toISOString(),
    pause: [{ inizio: loc('2026-11-04', '23:00'), fine: loc('2026-11-04', '23:15') }] };
  assert.equal(p.uscita, loc('2026-11-05', '01:30'));
  assert.equal(ore(F.oreNetteMs(p)), 3.25);
  assert.equal(F.giornoLocale(p.entrata), '2026-11-04');
});

test('live: turno breve con uscita arrotondata prima della pausa reale → 0 ore, mai negative', () => {
  const p = { entrata: loc('2026-11-04', '06:45'), uscita: loc('2026-11-04', '06:45'), pause: [{ inizio: '2026-11-04T05:48:51.000Z', fine: '2026-11-04T05:48:52.000Z' }] };
  assert.deepEqual(F.pauseDentroTurno(p.entrata, p.uscita, p.pause), []);
  assert.equal(F.oreNetteMs(p), 0);
});

// ── Inserimento manuale oltre mezzanotte ──
test('manuale: 23:00–01:30 → uscita il giorno dopo, 2,5 ore, giorno di inizio', () => {
  const t = F.costruisciTurnoManuale('2026-08-04', '23:00', '01:30', []);
  assert.equal(t.entrata, loc('2026-08-04', '23:00'));
  assert.equal(t.uscita, loc('2026-08-05', '01:30'));
  assert.equal(t.oltreMezzanotte, true);
  assert.equal(ore(F.oreNetteMs(t)), 2.5);
  assert.equal(F.giornoLocale(t.entrata), '2026-08-04');
});

test('manuale: pausa dopo mezzanotte va sul giorno dopo e resta dentro il turno', () => {
  const t = F.costruisciTurnoManuale('2026-08-04', '23:00', '01:30', [{ inizio: '00:30', fine: '00:45' }]);
  assert.deepEqual(t.pause, [{ inizio: loc('2026-08-05', '00:30'), fine: loc('2026-08-05', '00:45') }]);
  assert.equal(ore(F.oreNetteMs(t)), 2.25);
});

test('manuale: pausa fuori dal turno viene tagliata, turno normale invariato', () => {
  const t = F.costruisciTurnoManuale('2026-09-10', '09:00', '18:30', [{ inizio: '13:00', fine: '14:30' }, { inizio: '18:00', fine: '19:00' }]);
  assert.equal(t.oltreMezzanotte, false);
  assert.equal(ore(F.oreNetteMs(t)), 7.5);
});

test('manuale: turno senza uscita resta aperto', () => {
  const t = F.costruisciTurnoManuale('2026-09-10', '09:00', '', []);
  assert.equal(t.uscita, null);
  assert.equal(F.oreNetteMs(t), null);
});

// ── Modifica di un turno oltre mezzanotte ──
test('modifica: un turno 22:00–01:30 riletto nel form e salvato resta identico', () => {
  const salvato = F.costruisciTurnoManuale('2026-11-04', '22:00', '01:30', [{ inizio: '00:00', fine: '00:30' }]);
  const hm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  // il form mostra data locale dell'entrata e gli orari
  const data = F.giornoLocale(salvato.entrata);
  assert.equal(data, '2026-11-04');
  const riletto = F.costruisciTurnoManuale(data, hm(salvato.entrata), hm(salvato.uscita), salvato.pause.map(p => ({ inizio: hm(p.inizio), fine: hm(p.fine) })));
  assert.deepEqual(riletto, salvato);
  assert.equal(ore(F.oreNetteMs(riletto)), 3);
});

test('modifica: turno iniziato alle 00:30 appartiene al suo giorno, non a quello prima (data UTC)', () => {
  const entrata = loc('2026-09-03', '00:30'); // 2026-09-02T22:30Z
  assert.equal(entrata.slice(0, 10), '2026-09-02'); // il vecchio calcolo sbagliava giorno
  assert.equal(F.giornoLocale(entrata), '2026-09-03');
});

// ── Doppio salvataggio ──
test('doppio click su Salva: il salvataggio parte una volta sola', async () => {
  let chiamate = 0;
  const salva = F.unaVoltaSola(async () => { chiamate++; await new Promise(r => setTimeout(r, 20)); });
  await Promise.all([salva(), salva(), salva()]);
  assert.equal(chiamate, 1);
  await salva(); // finito il primo, il successivo riparte
  assert.equal(chiamate, 2);
});

test('doppio click: se il salvataggio fallisce il pulsante torna utilizzabile', async () => {
  let chiamate = 0;
  const salva = F.unaVoltaSola(async () => { chiamate++; throw new Error('rete'); });
  await assert.rejects(salva());
  await assert.rejects(salva());
  assert.equal(chiamate, 2);
});

// ── Turni sovrapposti ──
test('sovrapposto: stesso turno 09:00–18:30 già presente → avviso', () => {
  const esistenti = [{ id: 'x', uid: 'u1', entrata: loc('2026-09-10', '09:00'), uscita: loc('2026-09-10', '18:30') }];
  const nuovo = F.costruisciTurnoManuale('2026-09-10', '09:00', '18:30', []);
  assert.equal(F.turniSovrapposti(esistenti, 'u1', nuovo.entrata, nuovo.uscita).length, 1);
  // in modifica il turno stesso non conta
  assert.equal(F.turniSovrapposti(esistenti, 'u1', nuovo.entrata, nuovo.uscita, 'x').length, 0);
  // altra persona o turno non sovrapposto: nessun avviso
  assert.equal(F.turniSovrapposti(esistenti, 'u2', nuovo.entrata, nuovo.uscita).length, 0);
  const sera = F.costruisciTurnoManuale('2026-09-10', '19:00', '23:00', []);
  assert.equal(F.turniSovrapposti(esistenti, 'u1', sera.entrata, sera.uscita).length, 0);
});

test('sovrapposto: turno notturno che invade il giorno dopo viene visto', () => {
  const esistenti = [{ id: 'n', uid: 'u1', entrata: loc('2026-08-04', '23:00'), uscita: loc('2026-08-05', '01:30') }];
  const t = F.costruisciTurnoManuale('2026-08-05', '01:00', '09:00', []);
  assert.equal(F.turniSovrapposti(esistenti, 'u1', t.entrata, t.uscita).length, 1);
});

// ── Export con turno notturno ──
test('export: giorno con turno 23:00–01:30 conta 2,5 ore sul giorno di inizio', () => {
  const righe = [
    F.costruisciTurnoManuale('2026-08-04', '09:30', '17:00', []),
    F.costruisciTurnoManuale('2026-08-04', '23:00', '01:30', []),
    F.costruisciTurnoManuale('2026-08-05', '09:00', '13:00', [])
  ];
  const perGiorno = {};
  righe.forEach(p => (perGiorno[F.giornoLocale(p.entrata)] ||= []).push(p));
  assert.deepEqual(Object.keys(perGiorno).sort(), ['2026-08-04', '2026-08-05']);
  assert.deepEqual(F.oreNetteGiorno(perGiorno['2026-08-04']), { ore: 10, complete: true });
  assert.deepEqual(F.oreNetteGiorno(perGiorno['2026-08-05']), { ore: 4, complete: true });
});

test('export: il dato salvato male del 04/08 non gonfia più le ore', () => {
  // uscita e fine pausa salvate sullo stesso giorno invece che sul successivo
  const giorno = [
    { entrata: '2026-08-04T07:30:00.000Z', uscita: '2026-08-04T15:00:00.000Z', pause: [{ inizio: '2026-08-04T21:00:00.000Z', fine: '2026-08-03T23:30:00.000Z' }] },
    { entrata: '2026-08-04T21:00:00.000Z', uscita: '2026-08-03T23:30:00.000Z', pause: [] }
  ];
  assert.deepEqual(F.oreNetteGiorno(giorno), { ore: 7.5, complete: true }); // prima: 29 ore
});

test('export: giorno con un turno ancora aperto risulta incompleto', () => {
  assert.equal(F.oreNetteGiorno([{ entrata: loc('2026-11-04', '22:00'), uscita: null, pause: [] }]).complete, false);
});
