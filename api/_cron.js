// ══════════════════════════════════════════════════════════════
// Autorizzazione dei job pianificati (cron) e dei loro trigger manuali
// ══════════════════════════════════════════════════════════════
// Accetta la richiesta solo se porta "Authorization: Bearer <segreto>", dove il
// segreto è uno di questi:
//   CRON_SECRET          → Vercel lo invia da solo nelle chiamate dei cron
//                          (basta che la variabile sia impostata sul progetto)
//   <segreto manuale>    → quello specifico dell'endpoint (FF_SYNC_SECRET,
//                          BACKUP_SECRET, SCADENZARIO_SECRET), per i pulsanti nell'app
//
// Gli header "x-vercel-cron" e "user-agent: vercel-cron" NON vengono più usati:
// chiunque può inviarli, quindi non provano che la chiamata arrivi da Vercel.
//
// Il prefisso "_" esclude questo file dalle funzioni pubblicate da Vercel.

import crypto from 'crypto';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function isAuthorizedJob(req, manualSecretEnv) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const secrets = [process.env.CRON_SECRET, manualSecretEnv && process.env[manualSecretEnv]];
  return secrets.some(s => s && safeEqual(token, s));
}
