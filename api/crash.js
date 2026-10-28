// Vercel Serverless Function pour l'API /api/crash reliée à Supabase Cloud
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';

let memoryCrashState = {
  id: Date.now(),
  status: 'waiting',
  countdownStartTime: 0,
  countdownDuration: 7000,
  launchTime: 0,
  crashPoint: 2.0,
  crashedAtTime: 0,
  bets: {},
  history: [2.45, 1.35, 4.10, 1.15, 3.20, 1.80],
  updatedAt: Date.now()
};

function progressCrashState(st) {
  const now = Date.now();
  if (!st) return;

  if (st.status === 'countdown') {
    if (now >= st.launchTime && st.launchTime > 0) {
      st.status = 'flying';
      st.updatedAt = now;
    }
  } else if (st.status === 'flying') {
    const elapsed = Math.max(0, (now - st.launchTime) / 1000);
    const curMult = Math.pow(Math.E, 0.15 * elapsed);
    if (curMult >= st.crashPoint) {
      st.status = 'crashed';
      st.crashedAtTime = now;
      st.updatedAt = now;
      if (!Array.isArray(st.history)) st.history = [];
      st.history.unshift(parseFloat(st.crashPoint.toFixed(2)));
      if (st.history.length > 8) st.history.pop();
    }
  } else if (st.status === 'crashed') {
    if (st.crashedAtTime > 0 && now - st.crashedAtTime >= 4000) {
      st.status = 'waiting';
      st.launchTime = 0;
      st.countdownStartTime = 0;
      st.crashedAtTime = 0;
      st.bets = {};
      st.updatedAt = now;
    }
  }
}

async function fetchSupabaseCrash() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?username=eq.__crash_game__`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.data?.crash) {
        return rows[0].data.crash;
      }
    }
  } catch (e) {
    console.warn('Erreur GET Supabase Crash:', e);
  }
  return null;
}

async function saveSupabaseCrash(st) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !st) return;
  try {
    const row = {
      username: '__crash_game__',
      password: 'sys',
      avatar: '🚀',
      balance: 0,
      data: { crash: st },
      updated_at: new Date().toISOString()
    };
    await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
  } catch (e) {
    console.warn('Erreur POST Supabase Crash:', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Charger l'état actuel
  let current = await fetchSupabaseCrash();
  if (!current) {
    current = memoryCrashState;
  } else {
    memoryCrashState = current;
  }

  // Avancement temporel automatique
  progressCrashState(current);

  if (req.method === 'GET') {
    return res.status(200).json(current);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    const now = Date.now();

    // ACTION : PLACER OU METTRE A JOUR UNE MISE
    if (body.action === 'bet' && body.bet && body.bet.name) {
      if (!current.bets) current.bets = {};
      const key = body.bet.name.trim();
      current.bets[key] = {
        name: key,
        bet: parseInt(body.bet.bet) || 100,
        cashedOut: false,
        cashMult: null,
        win: 0,
        avatar: body.bet.avatar || '🧑‍🚀'
      };
      current.updatedAt = now;
    }
    // ACTION : ANNULER UNE MISE
    else if (body.action === 'cancel' && body.name) {
      if ((current.status === 'waiting' || current.status === 'countdown') && current.bets) {
        const target = body.name.trim().toLowerCase();
        for (const k of Object.keys(current.bets)) {
          if (k.trim().toLowerCase() === target) {
            delete current.bets[k];
            break;
          }
        }
        current.updatedAt = now;
      }
    }
    // ACTION : DÉCOLLAGE (COMPTE À REBOURS 7S)
    else if (body.action === 'launch') {
      if (current.status === 'waiting') {
        current.id = body.id || now;
        current.status = 'countdown';
        current.countdownStartTime = now;
        current.countdownDuration = body.countdownDuration || 7000;
        current.launchTime = now + current.countdownDuration;
        current.crashPoint = body.crashPoint || parseFloat((Math.min(500, Math.max(1, Math.floor(95 / (1 - Math.random())) / 100))).toFixed(2));
        current.crashedAtTime = 0;
        current.updatedAt = now;

        // Si le parieur a envoyé sa mise avec le décollage
        if (body.bet && body.bet.name) {
          if (!current.bets) current.bets = {};
          current.bets[body.bet.name.trim()] = {
            name: body.bet.name.trim(),
            bet: parseInt(body.bet.bet) || 100,
            cashedOut: false,
            cashMult: null,
            win: 0,
            avatar: body.bet.avatar || '🧑‍🚀'
          };
        }
      }
    }
    // ACTION : S'ÉJECTER ET ENCAISSER
    else if (body.action === 'cashout' && body.name) {
      if (current.status === 'flying' && current.bets) {
        const target = body.name.trim().toLowerCase();
        for (const k of Object.keys(current.bets)) {
          if (k.trim().toLowerCase() === target) {
            const b = current.bets[k];
            if (!b.cashedOut) {
              b.cashedOut = true;
              b.cashMult = parseFloat(body.cashMult) || 1.0;
              b.win = parseInt(body.win) || Math.floor(b.bet * b.cashMult);
            }
            break;
          }
        }
        current.updatedAt = now;
      }
    }
    // FUSION D'UN ÉTAT COMPLET ENVOYÉ PAR LE CLIENT
    else if (body.status || body.bets) {
      if (body.status === 'waiting') {
        current.status = 'waiting';
        current.launchTime = 0;
        current.countdownStartTime = 0;
        current.crashedAtTime = 0;
        current.bets = body.bets || {};
      }
      // Si le client lance un décollage alors que le serveur était en attente
      else if (body.status === 'countdown' && current.status === 'waiting') {
        current.id = body.id || now;
        current.status = 'countdown';
        current.countdownStartTime = body.countdownStartTime || now;
        current.countdownDuration = body.countdownDuration || 7000;
        current.launchTime = body.launchTime || (now + 7000);
        current.crashPoint = body.crashPoint || 2.0;
        current.crashedAtTime = 0;
      }

      // Fusion intelligente des paris : on n'écrase pas les autres joueurs !
      if (body.bets && typeof body.bets === 'object') {
        if (!current.bets) current.bets = {};
        Object.keys(body.bets).forEach(bk => {
          const incomingBet = body.bets[bk];
          if (incomingBet && incomingBet.name) {
            const existing = current.bets[bk];
            if (!existing) {
              current.bets[bk] = incomingBet;
            } else {
              // Mettre à jour l'encaissement si validé
              if (incomingBet.cashedOut) {
                existing.cashedOut = true;
                existing.cashMult = incomingBet.cashMult;
                existing.win = incomingBet.win;
              }
            }
          }
        });
      }
      current.updatedAt = now;
    }

    memoryCrashState = current;
    await saveSupabaseCrash(current);

    return res.status(200).json({ ok: true, state: current });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
