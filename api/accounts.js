// Vercel Serverless Function pour l'API /api/accounts
let inMemoryAccounts = {};

export default async function handler(req, res) {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Si une base de données cloud (ex: Firebase RTDB ou KV) est configurée dans l'environnement Vercel
  const cloudDbUrl = process.env.FIREBASE_DATABASE_URL || process.env.DATABASE_URL;

  if (cloudDbUrl) {
    try {
      const cleanUrl = cloudDbUrl.replace(/\/+$/, '');
      if (req.method === 'GET') {
        const fetchRes = await fetch(`${cleanUrl}/accounts.json`);
        const data = await fetchRes.json();
        return res.status(200).json(data || {});
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (body && body.username) {
          const key = body.username.toLowerCase();
          await fetch(`${cleanUrl}/accounts/${key}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }
        return res.status(200).json({ ok: true });
      }
      if (req.method === 'DELETE') {
        const target = req.query.username;
        if (target) {
          await fetch(`${cleanUrl}/accounts/${target.toLowerCase()}.json`, {
            method: 'DELETE'
          });
        }
        return res.status(200).json({ ok: true });
      }
    } catch (e) {
      // Fallback in-memory
    }
  }

  // Mode par défaut en mémoire
  if (req.method === 'GET') {
    return res.status(200).json(inMemoryAccounts);
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body && body.username) {
      inMemoryAccounts[body.username.toLowerCase()] = body;
    }
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const target = req.query.username;
    if (target) {
      delete inMemoryAccounts[target.toLowerCase()];
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
