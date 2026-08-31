// ══════════════════════════════════════════════════════════════
// Helper condiviso: verifica che la richiesta arrivi da un utente
// autenticato dell'app (Firebase Auth), non da uno sconosciuto su
// internet che ha trovato l'URL dell'endpoint.
// ══════════════════════════════════════════════════════════════
// Il prefisso "_" nel nome del file dice a Vercel di non trattarlo
// come una route: è un modulo importato dalle altre function in questa cartella.

import admin from 'firebase-admin';

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

// Lancia un errore con statusCode 401 se manca un Authorization: Bearer <idToken>
// valido. Il client lo ottiene con firebase.auth().currentUser.getIdToken().
export async function requireUser(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    const err = new Error('Autenticazione mancante: effettua il login nell\'app');
    err.statusCode = 401;
    throw err;
  }
  try {
    return await getAdmin().auth().verifyIdToken(idToken);
  } catch (e) {
    const err = new Error('Sessione scaduta o non valida: rieffettua il login');
    err.statusCode = 401;
    throw err;
  }
}
