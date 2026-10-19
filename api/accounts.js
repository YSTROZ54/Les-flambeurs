// Vercel Serverless Function pour l'API /api/accounts reliée à Supabase Cloud
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';

let inMemoryFallback = {};

export default async function handler(req, res) {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Essai via Supabase Cloud
  if (SUPABASE_URL && SUPABASE_KEY) {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    };

    try {
      if (req.method === 'GET') {
        const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/accounts?select=*`, { headers });
        if (fetchRes.ok) {
          const rows = await fetchRes.json();
          const map = {};
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              if (r && r.username) {
                map[r.username.toLowerCase()] = {
                  username: r.username,
                  password: r.password || '',
                  avatarEmoji: r.avatar || '🎭',
                  balance: typeof r.balance === 'number' ? r.balance : parseInt(r.balance) || 5500,
                  ...(r.data || {})
                };
              }
            });
          }
          return res.status(200).json(map);
        }
      }

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (body && body.username) {
          const row = {
            username: body.username,
            password: body.password || '',
            avatar: body.avatarEmoji || '🎭',
            balance: body.balance ?? 5500,
            data: {
              equipped: body.equipped || {},
              ownedSkins: body.ownedSkins || [],
              buildingsOwned: body.buildingsOwned || {},
              chestStreak: body.chestStreak || 1,
              lastChestTime: body.lastChestTime || 0,
              friends: body.friends || [],
              friendBalances: body.friendBalances || {},
              bankTransfers: body.bankTransfers || [],
              pendingTransfers: body.pendingTransfers || [],
              pendingFriendRequests: body.pendingFriendRequests || [],
              pendingGameInvites: body.pendingGameInvites || [],
              bannedUsers: body.bannedUsers || [],
              currentTable: body.currentTable || {}
            },
            updated_at: new Date().toISOString()
          };

          await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
            method: 'POST',
            headers: {
              ...headers,
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(row)
          });
        }
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const target = req.query.username;
        if (target) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=eq.${encodeURIComponent(target)}`, {
              method: 'DELETE',
              headers
            });
            await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=ilike.${encodeURIComponent(target)}`, {
              method: 'DELETE',
              headers
            });
          } catch (delErr) {
            console.warn('Erreur DELETE Supabase:', delErr);
          }
        }
        return res.status(200).json({ ok: true });
      }
    } catch (e) {
      console.warn('Erreur Supabase dans /api/accounts:', e);
    }
  }

  // Fallback mémoire locale
  if (req.method === 'GET') {
    return res.status(200).json(inMemoryFallback);
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body && body.username) {
      inMemoryFallback[body.username.toLowerCase()] = body;
    }
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const target = req.query.username;
    if (target) {
      delete inMemoryFallback[target.toLowerCase()];
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
