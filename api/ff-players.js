// ══════════════════════════════════════════════════════════════
// FANTACALCIO MMG — Elenco giocatori Serie A (rose aggiornate)
// ══════════════════════════════════════════════════════════════
// GET /api/ff-players → restituisce l'elenco di tutte le squadre di Serie A con le
// rispettive rose (giocatori). Il client (index.html) scrive poi questi dati in
// Firestore (collezione ff_giocatori) con le normali chiamate autenticate — questa
// funzione NON scrive nulla, serve solo a nascondere il token football-data.org
// e ad evitare problemi di CORS chiamando l'API direttamente dal browser.
//
// Variabile d'ambiente richiesta: FOOTBALL_DATA_TOKEN

function mapRuolo(position) {
  const p = (position || '').toLowerCase();
  if (p.includes('keeper')) return 'P';
  if (p.includes('back') || p.includes('defence') || p.includes('defender')) return 'D';
  if (p.includes('midfield')) return 'C';
  if (p.includes('forward') || p.includes('winger') || p.includes('striker') || p.includes('offence')) return 'A';
  return 'C';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return res.status(500).json({ error: 'FOOTBALL_DATA_TOKEN non configurata su Vercel' });

  try {
    const r = await fetch('https://api.football-data.org/v4/competitions/SA/teams', {
      headers: { 'X-Auth-Token': token }
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = await r.json();
    const teams = data.teams || [];
    const giocatori = [];
    teams.forEach(team => {
      (team.squad || []).forEach(p => {
        giocatori.push({
          id: String(p.id),
          nome: p.name,
          squadra: team.shortName || team.name,
          squadraId: team.id,
          ruolo: mapRuolo(p.position),
          ruoloOriginale: p.position || ''
        });
      });
    });

    if (!giocatori.length) {
      // Diagnostica: capiamo se il problema è "zero squadre" o "squadre senza rosa"
      const squadreConRosaVuota = teams.filter(t => !t.squad || !t.squad.length).length;
      return res.status(200).json({
        ok: true,
        aggiornatoAt: new Date().toISOString(),
        totale: 0,
        giocatori: [],
        diagnostica: {
          squadreTrovate: teams.length,
          squadreConRosaVuota,
          nomiSquadre: teams.map(t => t.name),
          messaggio: teams.length === 0
            ? 'La competizione SA (Serie A) non ha restituito nessuna squadra: controlla che il token sia valido e che il piano includa questa competizione.'
            : 'Le squadre sono state trovate ma il campo "squad" (rosa) è vuoto per tutte — probabile limite del piano gratuito su questo endpoint. Serve un fallback per-squadra o un piano superiore.'
        }
      });
    }

    res.status(200).json({ ok: true, aggiornatoAt: new Date().toISOString(), totale: giocatori.length, giocatori });
  } catch (e) {
    console.error('ff-players error:', e);
    res.status(500).json({ error: e.message });
  }
}
