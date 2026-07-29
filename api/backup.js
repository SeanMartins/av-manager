// ══════════════════════════════════════════════════════════════
// BACKUP AUTOMATICO — esporta le collezioni principali di Firestore
// ══════════════════════════════════════════════════════════════
// Chiamata da: Vercel Cron (vedi vercel.json, settimanale) + pulsante manuale
// "Esegui backup ora" nell'app (solo Admin/Responsabile).
//
// Cosa fa: legge le collezioni Firestore elencate sotto, le impacchetta in un
// unico file JSON e lo carica su Firebase Storage (bucket predefinito del
// progetto), in backups/backup-AAAA-MM-GG_HH-mm.json. Non tocca i dati originali:
// è una copia di sicurezza in sola lettura da Firestore + sola scrittura su Storage.
//
// Variabili d'ambiente richieste (stesse già usate da ff-sync.js):
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   (oppure FIREBASE_SERVICE_ACCOUNT come alternativa)
//   BACKUP_SECRET             → una password a piacere, protegge il trigger manuale/cron
//   FIREBASE_STORAGE_BUCKET   → opzionale; se non impostata usa "<project_id>.appspot.com"
//     (il bucket predefinito creato automaticamente da Firebase per il progetto)

import admin from 'firebase-admin';

function getCreds() {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
    return { projectId: svc.project_id, clientEmail: svc.client_email, privateKey: svc.private_key };
  }
  throw new Error('Credenziali Firebase mancanti: imposta FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY su Vercel');
}

function getApp() {
  if (!admin.apps.length) {
    const cred = getCreds();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${cred.projectId}.appspot.com`;
    admin.initializeApp({ credential: admin.credential.cert(cred), storageBucket: bucketName });
  }
  return admin.app();
}

// Collezioni considerate critiche per il backup. Escluse deliberatamente le
// collezioni puramente conversazionali (chat, forum, msgs) e quelle di sola
// cache/log poco utili da ripristinare (fcm_tokens).
const COLLECTIONS = [
  'magazzino', 'lavori', 'lavori_cal',
  'ces_nuovi', 'ces_venduti', 'ces_install',
  'preventivi', 'clienti', 'fornitori', 'listino', 'pacchetti',
  'team', 'presenze', 'ferie_permessi', 'straordinari',
  'agenda', 'locations',
];

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (!isCron) {
    const key = req.query.key;
    if (!process.env.BACKUP_SECRET || key !== process.env.BACKUP_SECRET) {
      return res.status(401).json({ error: 'Chiave mancante o errata (parametro ?key=)' });
    }
  }

  try {
    const app = getApp();
    const db = app.firestore();
    const bucket = app.storage().bucket();

    const dump = {};
    const conteggi = {};
    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      dump[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      conteggi[col] = dump[col].length;
    }

    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const path = `backups/backup-${stamp}.json`;
    const file = bucket.file(path);
    await file.save(JSON.stringify({ generatoIl: now.toISOString(), collezioni: dump }, null, 0), {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache' },
    });

    res.status(200).json({
      ok: true,
      file: path,
      bucket: bucket.name,
      generatoIl: now.toISOString(),
      conteggi,
    });
  } catch (e) {
    console.error('backup error:', e);
    res.status(500).json({ error: e.message });
  }
}
