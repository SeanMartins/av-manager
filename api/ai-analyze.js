// Serverless function - NO edge runtime (più tempo disponibile)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY non configurata' } });

  try {
    const body = req.body;

    // Limita dimensione payload — comprime i PDF se troppo grandi
    const bodyStr = JSON.stringify(body);
    const sizeMB = Buffer.byteLength(bodyStr, 'utf8') / (1024 * 1024);
    
    if (sizeMB > 20) {
      return res.status(413).json({ 
        error: { message: `Payload troppo grande (${sizeMB.toFixed(1)}MB). Riduci il numero o la dimensione dei PDF.` } 
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: bodyStr
    });

    const text = await response.text();
    
    try {
      const data = JSON.parse(text);
      return res.status(response.status).json(data);
    } catch(e) {
      return res.status(500).json({ 
        error: { message: 'Risposta non valida: ' + text.substring(0, 300) } 
      });
    }
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};
