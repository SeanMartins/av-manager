// ══════════════════════════════════════════════════════════════
// SCADENZARIO — controllo giornaliero scadenze + notifica push
// ══════════════════════════════════════════════════════════════
// Chiamata da: Vercel Cron (vedi vercel.json, ogni giorno alle 7:00) + trigger
// manuale con ?key=SCADENZARIO_SECRET per test.
//
// Cosa fa: legge tutte le scadenze attive in Firestore (collezione
// "scadenzario"), individua quelle scadute o in arrivo entro i giorni di
// preavviso impostati su ciascuna, e manda una notifica push a tutti gli
// Admin/Responsabile/Project Manager che hanno un token FCM registrato.
//
// Variabili d'ambiente richieste (stesse già usate da ff-sync.js / backup.js):
//   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//   (oppure FIREBASE_SERVICE_ACCOUNT come alternativa)
//   SCADENZARIO_SECRET → una password a piacere, protegge il trigger manuale

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
    admin.initializeApp({ credential: admin.credential.cert(getCreds()) });
  }
  return admin.app();
}

function giorniA(dataISO) {
  const d = new Date(dataISO + 'T00:00:00');
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return Math.ceil((d - oggi) / 86400000);
}

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (!isCron) {
    const key = req.query.key;
    if (!process.env.SCADENZARIO_SECRET || key !== process.env.SCADENZARIO_SECRET) {
      return res.status(401).json({ error: 'Chiave mancante o errata (parametro ?key=)' });
    }
  }

  try {
    const app = getApp();
    const db = app.firestore();

    const snap = await db.collection('scadenzario').where('stato', '==', 'attivo').get();
    const daAvvisare = [];
    snap.forEach(doc => {
      const s = doc.data();
      const g = giorniA(s.dataScadenza);
      const soglia = s.promemoriaGiorni || 30;
      if (g <= soglia) daAvvisare.push({ ...s, giorni: g });
    });

    // Include anche le manutenzioni impostate sugli articoli del Magazzino
    const magSnap = await db.collection('magazzino').get();
    magSnap.forEach(doc => {
      const m = doc.data();
      if (m.eliminatoAt || !m.manutIntervallo || !m.manutUltima) return;
      const ultima = new Date(m.manutUltima + 'T00:00:00');
      const prossima = new Date(ultima);
      prossima.setDate(prossima.getDate() + parseInt(m.manutIntervallo));
      const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      const g = Math.ceil((prossima - oggi) / 86400000);
      if (g <= 14) daAvvisare.push({ titolo: `🔧 Verifica: ${m.nome}`, giorni: g });
    });

    if (!daAvvisare.length) {
      return res.status(200).json({ ok: true, notificati: 0, messaggio: 'Nessuna scadenza da segnalare oggi' });
    }

    // Trova i manager (Admin/Responsabile/Project Manager) con token FCM registrato
    const teamSnap = await db.collection('team').where('approvato', '==', true).get();
    const managerUids = teamSnap.docs
      .filter(d => { const t = d.data(); return t.isAdmin === true || t.ruolo === 'Responsabile' || t.ruolo === 'Project Manager'; })
      .map(d => d.id);

    const tokens = [];
    for (const uid of managerUids) {
      const tDoc = await db.collection('fcm_tokens').doc(uid).get();
      if (tDoc.exists) (tDoc.data().tokens || []).forEach(t => tokens.push(t));
    }

    let inviati = 0;
    if (tokens.length) {
      const scadute = daAvvisare.filter(s => s.giorni < 0).length;
      const titolo = scadute > 0
        ? `⚠️ ${scadute} scadenza/e MMG scaduta/e`
        : `📅 ${daAvvisare.length} scadenza/e MMG in arrivo`;
      const corpo = daAvvisare.slice(0, 3).map(s =>
        `${s.titolo} — ${s.giorni < 0 ? `scaduta da ${Math.abs(s.giorni)}gg` : `tra ${s.giorni}gg`}`
      ).join(' · ') + (daAvvisare.length > 3 ? ` (+${daAvvisare.length - 3} altre)` : '');

      const resp = await app.messaging().sendEachForMulticast({
        tokens,
        notification: { title: titolo, body: corpo },
        webpush: { fcmOptions: { link: '/' } },
      });
      inviati = resp.successCount;
    }

    res.status(200).json({
      ok: true,
      scadenzeSegnalate: daAvvisare.length,
      destinatari: tokens.length,
      notificheInviate: inviati,
    });
  } catch (e) {
    console.error('scadenzario-check error:', e);
    res.status(500).json({ error: e.message });
  }
}
