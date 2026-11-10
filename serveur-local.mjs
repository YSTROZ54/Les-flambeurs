// Serveur local de développement (Node.js >= 18) : sert le site et les routes /api/*.
// Usage :  node serveur-local.mjs            (puis ouvrir http://localhost:8080)
// Les parties de poker sont gardées en mémoire (rien n'est envoyé à Supabase).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

process.env.POKER_STORAGE = process.env.POKER_STORAGE || 'memory';
process.env.ACCOUNTS_STORAGE = process.env.ACCOUNTS_STORAGE || 'memory';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};
const API = ['accounts', 'poker', 'blackjack', 'crash', 'blindtest', 'loupgarou', 'ludo', 'minijeux', 'musique', 'slots', 'cinema', 'cinema-video'];
const handlers = {};

async function loadHandler(name) {
  if (!handlers[name]) {
    const mod = await import(pathToFileURL(join(ROOT, 'api', `${name}.js`)).href);
    handlers[name] = mod.default;
  }
  return handlers[name];
}

function readBody(req) {
  return new Promise((resolveBody) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolveBody(raw ? JSON.parse(raw) : {}); } catch (e) { resolveBody({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  // outil réservé aux tests automatiques (inactif sauf si E2E_TEST_HOOKS=1) : fixe un solde en mémoire
  if (process.env.E2E_TEST_HOOKS === '1' && path === '/__test/balance') {
    const mod = await import(pathToFileURL(join(ROOT, 'api', 'accounts.js')).href);
    const row = mod.__test.memory.rows[String(url.searchParams.get('user') || '').toLowerCase()];
    if (row) row.balance = Number(url.searchParams.get('value')) || 0;
    res.end(row ? 'ok' : 'inconnu');
    return;
  }


  if (path === '/api/golf-info') {               // mini golf : joueurs par salle publique + classement, ou carte d'une partie privée
    const GR = (await import(pathToFileURL(join(ROOT, 'api', '_doGolf.js')).href)).GolfRoom;
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    res.setHeader('Content-Type', 'application/json');
    if (code) { const r = rooms['/ws/golf:priv-' + code]; if (!r || !r.players.size) { res.statusCode = 404; res.end('{}'); return; } res.end(JSON.stringify(r.info())); return; }
    const out = { rooms: {}, top: GR.topOf(globalThis.__golfHub ? globalThis.__golfHub.stats : {}) };
    for (const mp of ['prairie', 'automne', 'canyon', 'neige', 'ile']) { const r = rooms['/ws/golf:pub-' + mp]; out.rooms[mp] = r ? r.info() : { n: 0, ph: 'lobby' }; }
    res.end(JSON.stringify(out)); return;
  }
  if (path === '/api/prophunt-info') {          // nombre de joueurs par salle publique (comme sur Cloudflare)
    const out = {}; for (const mp of ['manoir', 'casino', 'marche', 'station', 'musee', 'port']) { const r = rooms['/ws/prophunt:pub-' + mp]; out[mp] = { n: r ? r.players.size : 0, ph: r ? r.ph : 'lobby' }; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out)); return;
  }
  const m = path.match(/^\/api\/([a-z-]+)$/);
  if (m && API.includes(m[1])) {
    try {
      const handler = await loadHandler(m[1]);
      const query = Object.fromEntries(url.searchParams.entries());
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const vres = {
        setHeader: (k, v) => res.setHeader(k, v),
        status(code) { res.statusCode = code; return vres; },
        json(obj) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); },
        end(chunk) { res.end(chunk); }
      };
      await handler({ method: req.method, query, body, headers: req.headers }, vres);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'Erreur serveur' }));
    }
    return;
  }

  let rel = path === '/' ? '/Les_Flambeurs.html' : path;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; res.end('Interdit'); return; }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    res.statusCode = 404;
    res.end('Fichier non trouvé : ' + path);
  }
});

// Salles temps réel (golf, course) : en production ce sont des Durable Objects Cloudflare ; ici on utilise les mêmes classes, branchées sur « ws »
const wss = new WebSocketServer({ noServer: true });
var rooms = {};
server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://' + req.headers.host);
    if (url.pathname !== '/ws/golf' && url.pathname !== '/ws/prophunt') { socket.destroy(); return; }
    let room, key = url.pathname;
    if (url.pathname === '/ws/prophunt') { key += ':' + (url.searchParams.get('room') || ''); if (!/^(pub-(manoir|casino|marche|station|musee|port)|priv-[A-Z0-9]{4,6})$/.test(url.searchParams.get('room') || '')) { socket.write('HTTP/1.1 404 Salon\r\n\r\n'); socket.destroy(); return; } if (!rooms[key]) rooms[key] = new (await import(pathToFileURL(join(ROOT, 'api', '_doProp.js')).href)).PropRoom({}, {}); room = rooms[key]; }
    else { key += ':' + url.searchParams.get('room'); if (!/^(pub-(prairie|automne|canyon|neige|ile)|priv-[A-Z0-9]{5})$/.test(url.searchParams.get('room') || '')) { socket.write('HTTP/1.1 404 Salle\r\n\r\n'); socket.destroy(); return; } if (!rooms[key]) rooms[key] = new (await import(pathToFileURL(join(ROOT, 'api', '_doGolf.js')).href)).GolfRoom({}, {}); room = rooms[key]; }
    const a = await room.admit(url);
    if (a.error) { socket.write('HTTP/1.1 ' + a.status + ' ' + a.error.replace(/[^a-zA-Z ]/g, '') + '\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const adapter = { send: (m) => { if (ws.readyState === 1) ws.send(m); }, close: () => { try { ws.close(); } catch (e) { /* ok */ } }, addEventListener: (ev, fn) => { if (ev === 'message') ws.on('message', (d) => fn({ data: d.toString() })); else ws.on(ev, fn); } };
      room.join(adapter, a.key, a.name);
    });
  } catch (e) { console.error(e); try { socket.destroy(); } catch (e2) { /* ok */ } }
});
server.listen(PORT, () => console.log(`Les Flambeurs : http://localhost:${PORT}  (poker en mémoire)`));
