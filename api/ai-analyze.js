export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY non configurata' } });

  try {
    const { messages, model, max_tokens } = req.body;

    // Estrai documenti PDF e testo dal messaggio
    const userMsg = messages[0]?.content || [];
    const docs = userMsg.filter(m => m.type === 'document');
    const promptMsg = userMsg.find(m => m.type === 'text');

    // Calcola dimensione totale PDF
    const totalSizeMB = docs.reduce((s, d) => {
      return s + (d.source?.data ? Buffer.byteLength(d.source.data, 'base64') / (1024*1024) : 0);
    }, 0);

    const MAX_MB_PER_BATCH = 8; // max per chiamata API
    
    let finalResponse;

    if (totalSizeMB <= MAX_MB_PER_BATCH || docs.length <= 3) {
      // Tutto in una chiamata sola
      finalResponse = await callAnthropic(apiKey, messages, model, max_tokens);
    } else {
      // Batch: processa 2-3 PDF per volta e poi sintetizza
      const BATCH_SIZE = 2;
      const riassunti = [];

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const batchContent = [
          ...batch,
          { type: 'text', text: `Riassumi brevemente questi preventivi (batch ${Math.floor(i/BATCH_SIZE)+1}): 
          - Tipo: ${batch.map(d => d.title || 'documento').join(', ')}
          - Importo totale se presente
          - Condizioni di pagamento
          - Dettaglio servizi
          - Punti di forza o debolezza
          Rispondi in max 300 parole per documento.` }
        ];

        const batchResp = await callAnthropic(apiKey, [{ role: 'user', content: batchContent }], model, 800);
        if (batchResp.content?.[0]?.text) {
          riassunti.push(batchResp.content[0].text);
        }
      }

      // Chiamata finale di sintesi con i riassunti
      const sintesiContent = [
        { type: 'text', text: `Sei un consulente commerciale esperto nel settore Audio-Video.
        
Ecco i riassunti di ${docs.length} preventivi analizzati:

${riassunti.map((r, i) => `=== BATCH ${i+1} ===\n${r}`).join('\n\n')}

${promptMsg?.text || ''}

Basandoti su questi riassunti fornisci l'analisi completa con tutti i punti richiesti.` }
      ];

      finalResponse = await callAnthropic(apiKey, [{ role: 'user', content: sintesiContent }], model, max_tokens || 2000);
    }

    return res.status(200).json(finalResponse);
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } });
  }
}

async function callAnthropic(apiKey, messages, model, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-5',
      max_tokens: maxTokens || 2000,
      messages
    })
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch(e) {
    throw new Error('Risposta API non valida: ' + text.substring(0, 200));
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '50mb' } }
};
