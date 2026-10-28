// Vérification des jetons de connexion (les mêmes que ceux délivrés par api/accounts.js).
import { createHmac, timingSafeEqual } from 'node:crypto';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (SERVICE_KEY) return 'flambeurs-auth|' + SERVICE_KEY;
  return 'flambeurs-secret-par-defaut-A-CHANGER';
}

export function readToken(token) {
  if (!token || typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = createHmac('sha256', authSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p || typeof p.u !== 'string' || !(p.e > Date.now())) return null;
    return p;
  } catch (e) { return null; }
}

// pseudo (minuscules) du joueur connecté d'après la requête, ou '' si non connecté
export function actorOf(req, body) {
  const h = (req && req.headers) || {};
  const t = h['x-auth-token'] || (body && body.token) || '';
  const p = readToken(String(t));
  return p ? String(p.u).toLowerCase() : '';
}
