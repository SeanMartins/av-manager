// ══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR — sincronizza un lavoro AV Manager come evento
// ══════════════════════════════════════════════════════════════
// Chiamata dal frontend via fetch con l'idToken nell'header Authorization,
// come tutti gli altri endpoint di questo progetto (vedi scheda-tecnica.js).
// Crea l'evento su Google Calendar la prima volta, lo aggiorna le volte
// successive: idempotente, perché l'id evento Google viene salvato sul
// documento del lavoro (campo gcalEventId).
//
// Body atteso: { lavoroId: "<id documento in lavori>" }
// Variabili d'ambiente richieste: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// (lo stesso client OAuth usato da gcal-auth-start.js / gcal-auth-callback.js)

import { requireUser } from './_auth.js';
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

// Scambia il refresh_token salvato con un access_token fresco, ogni volta,
// invece di fidarsi della scadenza salvata: più semplice e robusto di tenere
// una cache che può disallinearsi, e questo endpoint non è chiamato
// abbastanza spesso perché il giro extra sia un problema reale.
async function getFreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Rinnovo token Google fallito');
    // invalid_grant = il refresh_token è stato revocato (l'utente ha tolto
    // l'accesso dal proprio account Google): va ricollegato, non ritentato.
    err.needsReconnect = data.error === 'invalid_grant';
    throw err;
  }
  return data.access_token;
}

// I lavori hanno solo una data (YYYY-MM-DD), non un orario: li trattiamo come
// eventi "tutto il giorno". end.date in Google Calendar è esclusivo, quindi
// se il lavoro dura più giorni (data → dataFine) va aggiunto un giorno alla fine.
function toAllDayEvent(lavoro) {
  if (!lavoro.data) throw Object.assign(new Error('Il lavoro non ha una data impostata'), { statusCode: 400 });
  const endBase = lavoro.dataFine || lavoro.data;
  const endDate = new Date(endBase + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);

  return {
    summary: lavoro.nome || 'Lavoro AV Manager',
    location: lavoro.location || '',
    description: [
      lavoro.tecnico ? `Tecnico: ${lavoro.tecnico}` : '',
      lavoro.note ? `Note: ${lavoro.note}` : ''
    ].filter(Boolean).join('\n'),
    start: { date: lavoro.data },
    end: { date: endDate.toISOString().slice(0, 10) }
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try {
    user = await requireUser(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const { lavoroId } = req.body || {};
  if (!lavoroId) return res.status(400).json({ error: 'lavoroId mancante' });

  const db = getDb();

  try {
    const integrationRef = db.collection('users').doc(user.uid).collection('integrations').doc('google_calendar');
    const integrationSnap = await integrationRef.get();
    if (!integrationSnap.exists) {
      return res.status(409).json({ error: 'Google Calendar non collegato', needsConnect: true });
    }

    const lavoroRef = db.collection('lavori').doc(lavoroId);
    const lavoroSnap = await lavoroRef.get();
    if (!lavoroSnap.exists) return res.status(404).json({ error: 'Lavoro non trovato' });
    const lavoro = lavoroSnap.data();

    const { refreshToken } = integrationSnap.data();
    let accessToken;
    try {
      accessToken = await getFreshAccessToken(refreshToken);
    } catch (e) {
      if (e.needsReconnect) {
        await integrationRef.delete();
        return res.status(409).json({ error: 'Accesso Google revocato: ricollega Google Calendar', needsConnect: true });
      }
      throw e;
    }

    const event = toAllDayEvent(lavoro);
    const existingEventId = lavoro.gcalEventId;
    const url = existingEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEventId}`
      : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    const gcalRes = await fetch(url, {
      method: existingEventId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(event)
    });
    const gcalData = await gcalRes.json();
    if (!gcalRes.ok) throw new Error(gcalData.error?.message || 'Chiamata Google Calendar fallita');

    await lavoroRef.update({ gcalEventId: gcalData.id, gcalSyncedAt: new Date().toISOString() });

    res.status(200).json({ ok: true, eventId: gcalData.id, htmlLink: gcalData.htmlLink });
  } catch (e) {
    console.error('gcal-sync error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
}
