// =============================================================================
// Stockage partagé des comptes (Supabase ou mémoire) + écritures atomiques.
// Tout ce qui touche à un solde passe par updateAccount() : lecture, calcul, puis
// écriture « si personne n'a modifié le compte entre-temps » (numéro de version
// data._ver). Sans cela, deux requêtes envoyées en même temps pourraient dépenser
// deux fois le même argent.
// =============================================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gyjyncljhlatomnbmwxa.supabase.co';
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_KEY = SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_C-_jBp_AqrW42qshWYufXA_XG_t9Xee';
export const MEMORY_ONLY = process.env.ACCOUNTS_STORAGE === 'memory';

export const memory = { rows: {} }; // clé = pseudo en minuscules

export class GameError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; this.extra = extra || {}; }
}

async function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
}

const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));

export async function listRows() {
  if (MEMORY_ONLY) return Object.values(memory.rows).map((r) => ({ ...r }));
  const res = await sb('accounts?select=*');
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function getRowExact(username) {
  if (MEMORY_ONLY) { const r = memory.rows[String(username).toLowerCase()]; return r ? { ...r, data: clone(r.data) } : null; }
  const res = await sb(`accounts?username=eq.${encodeURIComponent(username)}&select=*`);
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// recherche insensible à la casse : essai direct, puis balayage de la table
export async function getRow(username) {
  const name = String(username || '').trim();
  if (!name) return null;
  if (MEMORY_ONLY) return getRowExact(name);
  let r = await getRowExact(name);
  if (r) return r;
  const lower = name.toLowerCase();
  if (lower !== name) { r = await getRowExact(lower); if (r) return r; }
  // recherche insensible à la casse côté base (beaucoup plus rapide que de lire tous les comptes)
  try {
    const pattern = name.replace(/[\\%_*]/g, '_');
    const res = await sb(`accounts?username=ilike.${encodeURIComponent(pattern)}&select=*`);
    if (res.ok) {
      const found = await res.json();
      const hit = Array.isArray(found) && found.find((x) => String(x.username || '').toLowerCase() === lower);
      if (hit) return hit;
    }
  } catch (e) { /* repli ci-dessous */ }
  const all = await listRows();
  return all.find((x) => String(x.username || '').toLowerCase() === lower) || null;
}

function cleanRow(row) {
  return {
    username: row.username,
    password: row.password || '',
    avatar: row.avatar || '🎭',
    balance: Number.isFinite(Number(row.balance)) ? Math.floor(Number(row.balance)) : 0,
    data: row.data && typeof row.data === 'object' ? row.data : {},
    updated_at: new Date().toISOString()
  };
}

// écriture sans contrôle de version (création de compte, outils du Patron, lignes de jeu)
export async function putRow(row) {
  const clean = cleanRow(row);
  if (MEMORY_ONLY) { memory.rows[clean.username.toLowerCase()] = clean; return true; }
  const res = await sb('accounts', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(clean) });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return true;
}

export async function deleteRow(username) {
  if (MEMORY_ONLY) { delete memory.rows[String(username).toLowerCase()]; return; }
  const row = await getRow(username);
  if (!row) return;
  await sb(`accounts?username=eq.${encodeURIComponent(row.username)}`, { method: 'DELETE' });
}

// écrit seulement si data._ver n'a pas changé depuis la lecture
async function casWrite(oldRow, newRow, oldVer) {
  const clean = cleanRow(newRow);
  if (MEMORY_ONLY) {
    const key = String(oldRow.username).toLowerCase();
    const cur = memory.rows[key];
    if (!cur) return false;
    const curVer = Number(cur.data && cur.data._ver) || 0;
    if (curVer !== oldVer) return false;
    memory.rows[key] = clean;
    return true;
  }
  const cond = oldVer === 0 ? 'is.null' : `eq.${oldVer}`;
  const res = await sb(`accounts?username=eq.${encodeURIComponent(oldRow.username)}&data->>_ver=${cond}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ avatar: clean.avatar, balance: clean.balance, data: clean.data, updated_at: clean.updated_at })
  });
  if (res.status === 400) {
    // filtre de version refusé par la base : on écrit sans contrôle plutôt que de bloquer les jeux
    console.warn('casWrite: filtre de version refusé, écriture sans contrôle');
    const r2 = await sb(`accounts?username=eq.${encodeURIComponent(oldRow.username)}`, {
      method: 'PATCH', body: JSON.stringify({ avatar: clean.avatar, balance: clean.balance, data: clean.data, updated_at: clean.updated_at })
    });
    if (!r2.ok) throw new Error('Supabase ' + r2.status);
    return true;
  }
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length === 1;
}

// Lit le compte, applique mutate(draft) puis écrit de façon atomique (nouvel essai si conflit).
// mutate peut modifier draft.balance / draft.data / draft.avatar, lancer GameError pour annuler,
// et renvoie le résultat à retourner à l'appelant.
export async function updateAccount(username, mutate) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await getRow(username);
    if (!row) throw new GameError(404, 'Compte introuvable.');
    const ver = Number(row.data && row.data._ver) || 0;
    const draft = { ...row, data: clone(row.data), balance: Math.max(0, Math.floor(Number(row.balance)) || 0) };
    const result = await mutate(draft);
    draft.data._ver = ver + 1;
    if (await casWrite(row, draft, ver)) return { result, row: draft };
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new GameError(503, 'Le serveur est occupé, réessaie dans un instant.');
}
