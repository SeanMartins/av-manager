// ══════════════════════════════════════════════════════════════
// FANTACALCIO MMG — Elenco giocatori Serie A (rose aggiornate)
// ══════════════════════════════════════════════════════════════
// Il piano gratuito di football-data.org NON include il dettaglio delle rose (squad)
// nell'endpoint collettivo /competitions/SA/teams — lo fornisce solo per singola
// squadra, /teams/{id}. Per questo la funzione lavora in due modalità, chiamate in
// sequenza dal client (index.html) con una piccola pausa tra una squadra e l'altra,
// per rispettare il limite di 10 richieste/minuto del piano gratuito:
//
//   GET /api/ff-players?mode=teams          → elenco {id, nome} delle 20 squadre di Serie A
//   GET /api/ff-players?mode=squad&teamId=X → rosa completa della squadra X
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

async function fdFetch(path, token) {
  const r = await fetch('https://api.football-data.org/v4' + path, {
    headers: { 'X-Auth-Token': token }
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return res.status(500).json({ error: 'FOOTBALL_DATA_TOKEN non configurata su Vercel' });

  const mode = req.query.mode || 'teams';

  try {
    if (mode === 'teams') {
      const data = await fdFetch('/competitions/SA/teams', token);
      const squadre = (data.teams || []).map(t => ({ id: t.id, nome: t.shortName || t.name }));
      return res.status(200).json({ ok: true, squadre });
    }

    if (mode === 'squad') {
      const teamId = req.query.teamId;
      if (!teamId) return res.status(400).json({ error: 'Parametro teamId mancante' });
      const team = await fdFetch(`/teams/${teamId}`, token);
      const giocatori = (team.squad || []).map(p => ({
        id: String(p.id),
        nome: p.name,
        squadra: team.shortName || team.name,
        squadraId: team.id,
        ruolo: mapRuolo(p.position),
        ruoloOriginale: p.position || ''
      }));
      return res.status(200).json({ ok: true, squadra: team.shortName || team.name, totale: giocatori.length, giocatori });
    }

    return res.status(400).json({ error: 'Parametro mode non valido (usa "teams" o "squad")' });
  } catch (e) {
    console.error('ff-players error:', e);
    res.status(500).json({ error: e.message });
  }
}
