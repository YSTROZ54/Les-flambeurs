import { Buffer } from 'node:buffer';
import { PassThrough, Readable } from 'node:stream';

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

import accountsHandler from './api/accounts.js';
import blackjackHandler from './api/blackjack.js';
import blindtestHandler from './api/blindtest.js';
import cinemaHandler from './api/cinema.js';
import cinemaVideoHandler from './api/cinema-video.js';
import crashHandler from './api/crash.js';
import loupgarouHandler from './api/loupgarou.js';
import ludoHandler from './api/ludo.js';
import pokerHandler from './api/poker.js';
import posterHandler from './api/poster.js';
import slotsHandler from './api/slots.js';

const ROUTE_HANDLERS = {
  accounts: accountsHandler,
  blackjack: blackjackHandler,
  blindtest: blindtestHandler,
  cinema: cinemaHandler,
  'cinema-video': cinemaVideoHandler,
  crash: crashHandler,
  loupgarou: loupgarouHandler,
  ludo: ludoHandler,
  poker: pokerHandler,
  poster: posterHandler,
  slots: slotsHandler,
};

function createResponseAdapter() {
  let resolveResponse;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  let statusCode = 200;
  const headers = new Headers();
  const chunks = [];
  let resolved = false;

  const finish = (body) => {
    if (resolved) return;
    resolved = true;
    resolveResponse(new Response(body, { status: statusCode, headers }));
  };

  const res = new PassThrough();
  res.statusCode = statusCode;

  res.status = (code) => {
    statusCode = code;
    res.statusCode = code;
    return res;
  };

  res.setHeader = (k, v) => {
    headers.set(k, v);
    return res;
  };

  res.getHeader = (k) => headers.get(k);

  res.type = (t) => {
    headers.set('Content-Type', t);
    return res;
  };

  res.json = (obj) => {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    finish(JSON.stringify(obj));
    return res;
  };

  res.send = (data) => {
    if (typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
      return res.json(data);
    }
    finish(data);
    return res;
  };

  // Streaming : dès qu'un handler écrit (ou pipe) des données, on répond tout de suite avec un flux, au lieu de tout garder en mémoire
  // (un film de 1,5 Go du cinéma ne tiendrait pas, et le navigateur attendait indéfiniment le début de la réponse).
  let streaming = false;
  const origWrite = res.write.bind(res);
  res.write = (chunk, encoding, cb) => {
    if (!resolved && !streaming) {
      streaming = true;
      resolved = true;
      const stream = new ReadableStream({
        start(controller) {
          res.on('data', (c) => {
            controller.enqueue(new Uint8Array(c));
            if (controller.desiredSize !== null && controller.desiredSize <= 0) res.pause();
          });
          res.on('end', () => { try { controller.close(); } catch (e) { /* déjà fermé */ } });
          res.on('error', (e) => { try { controller.error(e); } catch (e2) { /* ok */ } });
        },
        pull() { res.resume(); },
        cancel() { res.destroy(); },
      });
      resolveResponse(new Response(stream, { status: statusCode, headers }));
    }
    return origWrite(chunk, encoding, cb);
  };

  res.on('finish', () => {
    if (!resolved) {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      finish(body);
    }
  });

  const origEnd = res.end.bind(res);
  res.end = (chunk, encoding, cb) => {
    if (streaming) return origEnd(chunk, encoding, cb);
    if (chunk !== undefined && typeof chunk !== 'function') {
      if (typeof chunk === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'text/plain; charset=utf-8');
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    origEnd(typeof chunk === 'function' ? chunk : undefined, encoding, cb);
    if (!resolved) {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      finish(body);
    }
    return res;
  };

  return { res, responsePromise };
}

// Relais vidéo du cinéma, passé directement au moteur de Cloudflare : le film (1 à 2 Go) n'est plus recopié morceau par morceau en JavaScript.
// Avant, chaque morceau coûtait du temps de calcul au Worker, et au-delà de sa limite le flux était coupé net : le film s'arrêtait pour quelqu'un, ou pour tout le monde.
const CINEMA_HOSTS = ['tropistream.fr', 'www.tropistream.fr'];
const CINEMA_PASS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'];
async function cinemaVideo(request, url) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: cors });
  let target;
  try { target = new URL(url.searchParams.get('u') || ''); } catch (e) { return new Response('URL invalide', { status: 400, headers: cors }); }
  if (!CINEMA_HOSTS.includes(target.hostname)) return new Response('Hôte non autorisé', { status: 400, headers: cors });
  const h = {};
  const range = request.headers.get('range');
  if (range) h.Range = range;
  let up = null;
  for (let attempt = 0; attempt < 2 && !up; attempt++) {                // un second essai si la source ne répond pas du premier coup
    try {
      const r = await fetch(target.href, { headers: h });
      if (r.status < 500 || attempt === 1) up = r;
      else { try { await r.body?.cancel(); } catch (e) { /* ok */ } }
    } catch (e) {
      if (attempt === 1) return new Response('Source indisponible', { status: 502, headers: cors });
    }
  }
  if (up.status >= 400) { try { await up.body?.cancel(); } catch (e) { /* ok */ } return new Response('Source indisponible', { status: up.status, headers: { ...cors, 'Content-Type': 'text/plain' } }); }
  const ct = up.headers.get('content-type') || '';
  if (ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(target.href)) {     // liste HLS : ses segments repassent aussi par ce relais
    const text = await up.text();
    const rewritten = text.replace(/\/srv\/[^\s"]+/g, (m) => '/api/cinema-video?u=' + encodeURIComponent('https://tropistream.fr' + m));
    return new Response(rewritten, { status: 200, headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  }
  const out = new Headers(cors);
  for (const k of CINEMA_PASS) { const v = up.headers.get(k); if (v) out.set(k, v); }
  if (!range && up.status === 200 && !ct.includes('text')) out.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(up.body, { status: up.status, headers: out });
}

export default {
  async fetch(request, env, ctx) {
    // Propager les variables d'environnement Cloudflare dans process.env
    if (env) {
      for (const [k, v] of Object.entries(env)) {
        if (typeof v === 'string') {
          process.env[k] = v;
        }
      }
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/cinema-video') return cinemaVideo(request, url);

    // Gestion des routes /api/*
    const apiMatch = pathname.match(/^\/api\/([a-z0-9_-]+)$/);
    if (apiMatch) {
      const routeName = apiMatch[1];
      const handler = ROUTE_HANDLERS[routeName];
      if (handler) {
        // En-têtes en minuscules comme Node.js http
        const headers = {};
        for (const [k, v] of request.headers.entries()) {
          headers[k.toLowerCase()] = v;
        }

        // Lecture du corps de requête pour POST/PUT/PATCH
        let body;
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
          const contentType = request.headers.get('content-type') || '';
          try {
            if (contentType.includes('application/json')) {
              body = await request.json();
            } else {
              const text = await request.text();
              try {
                body = text ? JSON.parse(text) : {};
              } catch {
                body = text;
              }
            }
          } catch {
            body = {};
          }
        }

        const query = Object.fromEntries(url.searchParams.entries());
        const { res, responsePromise } = createResponseAdapter();

        try {
          await handler({ method: request.method, query, body, headers, url: request.url }, res);
          return await responsePromise;
        } catch (err) {
          console.error(`Erreur /api/${routeName}:`, err);
          return new Response(JSON.stringify({ ok: false, error: 'Erreur serveur' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          });
        }
      }
    }

    // Fichiers statiques via Workers Static Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
