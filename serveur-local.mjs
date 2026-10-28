// Serveur local de développement (Node.js >= 18) : sert le site et les routes /api/*.
// Usage :  node serveur-local.mjs            (puis ouvrir http://localhost:8080)
// Les parties de poker sont gardées en mémoire (rien n'est envoyé à Supabase).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.POKER_STORAGE = process.env.POKER_STORAGE || 'memory';
process.env.ACCOUNTS_STORAGE = process.env.ACCOUNTS_STORAGE || 'memory';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};
const API = ['accounts', 'poker', 'blackjack', 'crash'];
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

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  const m = path.match(/^\/api\/([a-z]+)$/);
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
}).listen(PORT, () => console.log(`Les Flambeurs : http://localhost:${PORT}  (poker en mémoire)`));
