// ══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR — avvio collegamento account
// ══════════════════════════════════════════════════════════════
// L'utente clicca "Collega Google Calendar" nell'app → il frontend fa un
// redirect completo del browser (non un fetch) verso questo endpoint,
// passando il proprio idToken Firebase come query string: in un redirect
// di navigazione non è possibile allegare un header Authorization.
//
// Questo endpoint verifica l'utente, firma il suo uid dentro il parametro
// "state" (HMAC — evita che qualcuno costruisca uno state falso e colleghi
// il proprio account Google a un altro utente AV Manager) e reindirizza a
// Google per la schermata di consenso OAuth2.
//
// Variabili d'ambiente richieste (Vercel → Settings → Environment Variables):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET → da Google Cloud Console
//   GOOGLE_REDIRECT_URI  → https://<tuo-dominio>/api/gcal-auth-callback
//   GCAL_STATE_SECRET    → una stringa lunga a piacere, usata solo per firmare lo state

import admin from 'firebase-admin';
import crypto from 'crypto';

function getAdmin() {
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
  return admin;
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.GCAL_STATE_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { idToken } = req.query;
  if (!idToken) return res.status(400).json({ error: 'idToken mancante nella query string' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const stateSecret = process.env.GCAL_STATE_SECRET;
  if (!clientId || !redirectUri || !stateSecret) {
    return res.status(500).json({ error: 'Configurazione Google Calendar mancante su Vercel (GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI / GCAL_STATE_SECRET)' });
  }

  let uid;
  try {
    const decoded = await getAdmin().auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'idToken non valido: rieffettua il login e riprova' });
  }

  const state = signState({ uid, ts: Date.now() });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('access_type', 'offline'); // necessario per ottenere un refresh_token
  authUrl.searchParams.set('prompt', 'consent'); // forza un nuovo refresh_token anche se l'utente aveva già acconsentito in passato
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
  authUrl.searchParams.set('state', state);

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}
