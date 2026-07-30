// ══════════════════════════════════════════════════════════════
// FANTACALCIO MMG — Congela le formazioni al fischio d'inizio
// ══════════════════════════════════════════════════════════════
// Chiamata da: Vercel Cron (ogni ora, vedi vercel.json) + trigger manuale con
// ?key=FF_SYNC_SECRET per test (riusa lo stesso segreto di ff-sync.js).
//
// Cosa fa: controlla l'orario di inizio della PRIMA partita della giornata Serie A
// in corso. Se è già iniziata e non è stata ancora fatta una "fotografia" delle
// formazioni per questa giornata, salva lo stato ATTUALE dei titolari di ogni
// squadra iscritta in una collezione separata (ff_titolari_giornata), che poi
// ff-sync.js userà per calcolare i punti — così un cambio fatto DOPO il fischio
// d'inizio non altera mai il punteggio della giornata già in corso.

import admin from 'firebase-admin';

function getDb() {
  if (!admin.apps.length) {
    let cred;
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      cred = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
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

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (!isCron) {
    const key = req.query?.key;
    if (key !== process.env.FF_SYNC_SECRET) {
      return res.status(401).json({ error: 'Non autorizzato: parametro key mancante o errato' });
    }
  }

  try {
    const db = getDb();

    const statoLega = await fdFetch('/competitions/SA');
    const numero = statoLega.currentSeason?.currentMatchday || 1;

    const giornataRef = db.collection('ff_giornate').doc(String(numero));
    const giornataDoc = await giornataRef.get();
    if (giornataDoc.exists && giornataDoc.data().congelata) {
      return res.status(200).json({ ok: true, giornata: numero, messaggio: 'Già congelata in precedenza' });
    }

    const matchesData = await fdFetch(`/competitions/SA/matches?matchday=${numero}`);
    const matches = matchesData.matches || [];
    if (!matches.length) {
      return res.status(200).json({ ok: true, giornata: numero, messaggio: 'Nessuna partita trovata per questa giornata' });
    }

    const primoFischio = matches
      .map(m => new Date(m.utcDate).getTime())
      .sort((a, b) => a - b)[0];

    if (Date.now() < primoFischio) {
      return res.status(200).json({
        ok: true, giornata: numero, congelata: false,
        messaggio: 'Non ancora iniziata', primoFischio: new Date(primoFischio).toISOString()
      });
    }

    // È iniziata: fotografo i titolari attuali di ogni rosa iscritta
    const roseSnap = await db.collection('ff_rose').get();
    const batch = db.batch();
    let squadreCongelate = 0;

    roseSnap.forEach(doc => {
      const rosa = doc.data();
      if (!rosa.titolari) return;
      const ref = db.collection('ff_titolari_giornata').doc(`${numero}_${doc.id}`);
      batch.set(ref, {
        giornata: numero, uid: doc.id,
        titolari: rosa.titolari,
        congelatoAt: new Date().toISOString()
      });
      squadreCongelate++;
    });

    batch.set(giornataRef, { numero, congelata: true, congelataAt: new Date().toISOString() }, { merge: true });

    await batch.commit();
    res.status(200).json({ ok: true, giornata: numero, congelata: true, squadreCongelate });
  } catch (e) {
    console.error('ff-freeze error:', e);
    res.status(500).json({ error: e.message });
  }
}
