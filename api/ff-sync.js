// ══════════════════════════════════════════════════════════════
// FANTACALCIO MMG — Sincronizzazione automatica punteggi Serie A
// ══════════════════════════════════════════════════════════════
// Chiamata da: Vercel Cron (vedi vercel.json) + pulsante manuale "Forza aggiornamento"
// nella sezione Fantacalcio dell'app (solo Admin/Responsabile).
//
// Variabili d'ambiente richieste (Vercel → Settings → Environment Variables):
//   FOOTBALL_DATA_TOKEN      → token gratuito da https://www.football-data.org/client/register
//   FIREBASE_SERVICE_ACCOUNT → JSON completo dell'account di servizio Firebase
//                              (Firebase Console → Impostazioni progetto → Account di servizio
//                               → Genera nuova chiave privata → incolla l'intero contenuto del file .json)
//   FF_SYNC_SECRET           → una password a piacere, usata per proteggere il trigger manuale
//
// NOTA IMPORTANTE SUI DATI: il piano gratuito di football-data.org fornisce sempre il
// risultato finale delle partite (usato per calcolare i clean sheet). I dettagli su
// marcatori/assist/cartellini possono non essere disponibili o essere parziali sul piano
// gratuito: il codice qui sotto è scritto per degradare in sicurezza (bonus = 0) se questi
// dati mancano, invece di bloccarsi.

import admin from 'firebase-admin';

function getDb() {
  if (!admin.apps.length) {
    let cred;
    // Metodo consigliato (più robusto): 3 variabili separate, evita il problema classico
    // dove il campo "private_key" (che contiene newline) rompe il JSON se incollato in
    // un'unica variabile d'ambiente su una riga sola.
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      cred = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Le \n letterali vanno riconvertite in newline reali
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Metodo alternativo: JSON intero in una sola variabile (più fragile — vedi sopra)
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const svc = JSON.parse(raw);
      cred = { projectId: svc.project_id, clientEmail: svc.client_email, privateKey: svc.private_key };
    } else {
      throw new Error('Credenziali Firebase mancanti: imposta FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY su Vercel');
    }
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
  return admin.firestore();
}

const FD_BASE = 'https://api.football-data.org/v4';

async function fdFetch(path) {
  const res = await fetch(FD_BASE + path, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Mappa la posizione testuale di football-data.org sul ruolo classico P/D/C/A
function mapRuolo(position) {
  const p = (position || '').toLowerCase();
  if (p.includes('keeper')) return 'P';
  if (p.includes('back') || p.includes('defence') || p.includes('defender')) return 'D';
  if (p.includes('midfield')) return 'C';
  if (p.includes('forward') || p.includes('winger') || p.includes('striker') || p.includes('offence')) return 'A';
  return 'C'; // fallback prudente
}

async function calcolaGiornata(db, numero) {
  const matchesData = await fdFetch(`/competitions/SA/matches?matchday=${numero}&status=FINISHED`);
  const matches = matchesData.matches || [];
  if (!matches.length) return { ok: false, motivo: 'Nessuna partita conclusa trovata per questa giornata' };

  // eventi per giocatore: {playerId: {goals,assists,yellow,red,ownGoals}}
  const eventi = {};
  const cleanSheet = {}; // teamId -> bool
  const golSubitiSquadra = {}; // teamId -> numero gol subiti

  for (const m of matches) {
    const homeId = m.homeTeam.id, awayId = m.awayTeam.id;
    const golHome = m.score?.fullTime?.home ?? 0;
    const golAway = m.score?.fullTime?.away ?? 0;
    cleanSheet[homeId] = golAway === 0;
    cleanSheet[awayId] = golHome === 0;
    golSubitiSquadra[homeId] = golAway;
    golSubitiSquadra[awayId] = golHome;

    // Dettaglio marcatori/cartellini: disponibile solo se il piano API lo fornisce.
    // Recupero il dettaglio partita per provare a leggere goals[]/bookings[].
    try {
      const dettaglio = await fdFetch(`/matches/${m.id}`);
      (dettaglio.goals || []).forEach(g => {
        const pid = g.scorer?.id;
        if (!pid) return;
        eventi[pid] = eventi[pid] || { goals: 0, assists: 0, yellow: 0, red: 0, ownGoals: 0, teamId: null };
        if (g.type === 'OWN') eventi[pid].ownGoals++; else eventi[pid].goals++;
        if (g.assist?.id) {
          const aid = g.assist.id;
          eventi[aid] = eventi[aid] || { goals: 0, assists: 0, yellow: 0, red: 0, ownGoals: 0, teamId: null };
          eventi[aid].assists++;
        }
      });
      (dettaglio.bookings || []).forEach(b => {
        const pid = b.player?.id;
        if (!pid) return;
        eventi[pid] = eventi[pid] || { goals: 0, assists: 0, yellow: 0, red: 0, ownGoals: 0, teamId: null };
        if (b.card === 'YELLOW_CARD') eventi[pid].yellow++;
        if (b.card === 'RED_CARD' || b.card === 'YELLOW_RED_CARD') eventi[pid].red++;
      });
    } catch (e) {
      // Piano gratuito senza dettaglio marcatori: proseguo comunque con clean sheet + presenza
      console.warn('Dettaglio non disponibile per match', m.id, e.message);
    }
  }

  // Carico l'elenco giocatori noti (da ff_giocatori) per assegnare ruolo/squadra e calcolare punteggio
  const giocatoriSnap = await db.collection('ff_giocatori').get();
  const giocatori = {};
  giocatoriSnap.forEach(d => { giocatori[d.id] = { id: d.id, ...d.data() }; });

  const puntiGiocatore = {}; // playerId -> punti giornata

  Object.entries(eventi).forEach(([pid, ev]) => {
    const g = giocatori[pid];
    if (!g) return;
    let punti = 1; // presenza semplificata (partecipazione all'evento)
    punti += ev.goals * 3;
    punti += ev.assists * 1;
    punti -= ev.yellow * 0.5;
    punti -= ev.red * 1;
    punti -= ev.ownGoals * 2;
    puntiGiocatore[pid] = punti;
  });

  // Bonus clean sheet e malus gol subiti per Portieri/Difensori (anche se non hanno eventi singoli)
  Object.values(giocatori).forEach(g => {
    if (!g.squadraId) return;
    const haCleanSheet = cleanSheet[g.squadraId];
    if (haCleanSheet === undefined) return; // squadra non ha giocato questa giornata
    if (!(g.id in puntiGiocatore)) puntiGiocatore[g.id] = 1; // presenza base
    if ((g.ruolo === 'P' || g.ruolo === 'D') && haCleanSheet) puntiGiocatore[g.id] += 1;
    if (g.ruolo === 'P') {
      const subiti = golSubitiSquadra[g.squadraId] || 0;
      puntiGiocatore[g.id] -= Math.floor(subiti / 2);
    }
  });

  // Calcolo punteggio di ogni rosa iscritta
  const roseSnap = await db.collection('ff_rose').get();
  const batch = db.batch();
  let squadreCalcolate = 0;

  roseSnap.forEach(doc => {
    const rosa = doc.data();
    const titolari = [
      ...(rosa.titolari?.P || []),
      ...(rosa.titolari?.D || []),
      ...(rosa.titolari?.C || []),
      ...(rosa.titolari?.A || []),
    ];
    if (!titolari.length) return;
    let totale = 0;
    const dettaglio = titolari.map(pid => {
      const punti = puntiGiocatore[pid] || 0;
      totale += punti;
      const g = giocatori[pid];
      return { playerId: pid, nome: g?.nome || pid, punti };
    });
    const ref = db.collection('ff_punteggi_giornata').doc(`${numero}_${doc.id}`);
    batch.set(ref, {
      giornata: numero, uid: doc.id, punti: totale, dettaglio,
      calcolatoAt: new Date().toISOString()
    });
    squadreCalcolate++;
  });

  batch.set(db.collection('ff_giornate').doc(String(numero)), {
    numero, stato: 'chiusa', sincronizzata: true, sincronizzatoAt: new Date().toISOString()
  }, { merge: true });

  await batch.commit();
  return { ok: true, giornata: numero, partite: matches.length, squadreCalcolate };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protezione trigger manuale: la cron di Vercel invia un header interno che salta questo controllo
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (!isCron) {
    const secret = req.query?.key || (req.body && req.body.key);
    if (secret !== process.env.FF_SYNC_SECRET) {
      return res.status(401).json({ error: 'Non autorizzato: parametro key mancante o errato' });
    }
  }

  try {
    const db = getDb();

    // Trova la giornata corrente da sincronizzare: la prima non ancora marcata "sincronizzata"
    const statoLega = await fdFetch('/competitions/SA');
    const giornataAttuale = statoLega.currentSeason?.currentMatchday || 1;

    const risultati = [];
    // Prova a sincronizzare tutte le giornate concluse non ancora calcolate, fino alla corrente
    for (let g = 1; g <= giornataAttuale; g++) {
      const doc = await db.collection('ff_giornate').doc(String(g)).get();
      if (doc.exists && doc.data().sincronizzata) continue;
      const r = await calcolaGiornata(db, g);
      risultati.push({ giornata: g, ...r });
    }

    res.status(200).json({ ok: true, giornataAttuale, risultati });
  } catch (e) {
    console.error('ff-sync error:', e);
    res.status(500).json({ error: e.message });
  }
}
