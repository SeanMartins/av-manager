// ══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR — callback OAuth2
// ══════════════════════════════════════════════════════════════
// Google reindirizza qui dopo che l'utente ha dato (o negato) il consenso.
// Scambia il "code" con un access_token + refresh_token e salva quest'ultimo
// su Firestore, legato all'uid firmato nello state da gcal-auth-start.js.
//
// Il refresh_token è l'unica cosa che conta salvare: l'access_token scade
// dopo un'ora, il refresh_token no (finché l'utente non revoca l'accesso da
// myaccount.google.com) e serve per ottenerne uno nuovo ogni volta senza
// richiedere di nuovo il login (vedi getFreshAccessToken in gcal-sync.js).
//
// Variabili d'ambiente richieste: le stesse di gcal-auth-start.js, più
//   GOOGLE_CLIENT_SECRET → da Google Cloud Console (mai esposto al frontend)
//   APP_URL              → dominio dell'app, dove reindirizzare l'utente a fine flusso

import admin from 'firebase-admin';
import crypto from 'crypto';

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

function verifyState(state, secret) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (Date.now() - payload.ts > 10 * 60 * 1000) return null; // state valido 10 minuti: oltre, l'utente deve ricliccare "Collega"
  return payload;
}

export default async function handler(req, res) {
  const appUrl = process.env.APP_URL || '/';
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    res.writeHead(302, { Location: `${appUrl}?gcal=denied` });
    return res.end();
  }

  const stateSecret = process.env.GCAL_STATE_SECRET;
  const payload = code && state && stateSecret ? verifyState(state, stateSecret) : null;
  if (!payload) {
    res.writeHead(302, { Location: `${appUrl}?gcal=error` });
    return res.end();
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error || 'Scambio token fallito');
    if (!tokens.refresh_token) {
      // Succede se l'utente aveva già dato consenso in passato: Google non
      // riemette un refresh_token a meno di revocare l'accesso e ripetere il
      // flusso. prompt=consent in gcal-auth-start.js dovrebbe evitarlo, ma un
      // fallback esplicito è più onesto di un token silenziosamente assente.
      throw new Error('Google non ha restituito un refresh_token: revoca l\'accesso dell\'app da myaccount.google.com/permissions e riprova');
    }

    await getDb().collection('users').doc(payload.uid)
      .collection('integrations').doc('google_calendar')
      .set({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiry: Date.now() + (tokens.expires_in * 1000),
        connectedAt: new Date().toISOString()
      });

    res.writeHead(302, { Location: `${appUrl}?gcal=connected` });
    res.end();
  } catch (e) {
    console.error('gcal-auth-callback error:', e);
    res.writeHead(302, { Location: `${appUrl}?gcal=error` });
    res.end();
  }
}
