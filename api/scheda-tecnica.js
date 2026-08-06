// ══════════════════════════════════════════════════════════════
// SCHEDA TECNICA AI — genera i dati tecnici di un articolo di magazzino
// (peso, potenza, consumo, alimentazione, dimensioni) cercando il modello
// reale sul web, invece di doverli inserire a mano uno per uno.
// ══════════════════════════════════════════════════════════════
// Variabile d'ambiente richiesta: ANTHROPIC_API_KEY (già usata da ai-analyze.js)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurata su Vercel' });

  try {
    const { nome, marca, modello, categoria } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome articolo mancante' });

    const descrizione = [nome, marca, modello, categoria].filter(Boolean).join(' — ');

    const systemPrompt = `Sei un tecnico specializzato in attrezzature audio/video/luci professionali per eventi
(amplificatori, videoproiettori, ledwall, mixer, casse, ecc.). Ti viene dato il nome/marca/modello di un
articolo di magazzino di un'azienda AV. Cerca sul web la scheda tecnica REALE del prodotto (sito del
produttore o rivenditori affidabili) e rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo,
con questa struttura esatta:
{
  "peso_kg": "numero o intervallo, es. 12.5 — null se non trovato",
  "dimensioni_cm": "LxAxP in cm — null se non trovato",
  "potenza_w": "potenza assorbita/erogata in Watt — null se non trovato",
  "alimentazione": "es. 230V 50/60Hz — null se non trovato",
  "consumo": "consumo tipico se diverso dalla potenza — null se non trovato",
  "altre_specifiche": "2-3 righe con le info tecniche più rilevanti per il tipo di prodotto (es. per un
     videoproiettore: luminosità ANSI lumen, risoluzione, throw ratio; per un ledwall: passo pixel,
     luminosità nit; per un ampli: canali, potenza per canale) — riassunte con parole tue, non copiate
     testualmente dal sito",
  "fonte": "nome del sito da cui hai preso i dati (es. 'sito ufficiale produttore') — null se non trovato",
  "affidabilita": "alta / media / bassa — quanto sei sicuro di aver trovato il modello ESATTO e non uno simile"
}
Se non trovi il modello esatto, imposta i campi non trovati a null e "affidabilita":"bassa", non inventare
numeri. Non copiare frasi intere dal sito, riassumi con parole tue.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Articolo da cercare: ${descrizione}` }]
      })
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('Risposta API non valida: ' + raw.slice(0, 200)); }
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    // Estrae il blocco di testo finale (dopo eventuali blocchi di ricerca web)
    const testoBlocchi = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const match = testoBlocchi.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Nessun JSON trovato nella risposta');
    const scheda = JSON.parse(match[0]);

    res.status(200).json({ ok: true, scheda, generatoIl: new Date().toISOString() });
  } catch (e) {
    console.error('scheda-tecnica error:', e);
    res.status(500).json({ error: e.message });
  }
}
