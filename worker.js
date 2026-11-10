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
import minijeuxHandler from './api/minijeux.js';
import musiqueHandler from './api/musique.js';
import pokerHandler from './api/poker.js';
import posterHandler from './api/poster.js';
import slotsHandler from './api/slots.js';
import { GolfRoom } from './api/_doGolf.js';
import { KartRoom } from './api/_doKart.js';

// Les salles temps réel (golf, course) sont des Durable Objects : un petit programme toujours allumé par salle, relié aux joueurs par WebSocket.
import { PropRoom } from './api/_doProp.js';
export { GolfRoom, KartRoom, PropRoom };

const ROUTE_HANDLERS = {
  accounts: accountsHandler,
  blackjack: blackjackHandler,
  blindtest: blindtestHandler,
  cinema: cinemaHandler,
  'cinema-video': cinemaVideoHandler,
  crash: crashHandler,
  loupgarou: loupgarouHandler,
  ludo: ludoHandler,
  minijeux: minijeuxHandler,
  musique: musiqueHandler,
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

    // Prop Hunt : combien de joueurs dans chaque salle publique (affiché sur les murs de l'accueil), mis en cache 4 s
    if (pathname === '/api/prophunt-info') {
      if (!env.PROP) return new Response('{}', { status: 503 });
      if (!globalThis.__prInfo || Date.now() - globalThis.__prInfo.t > 4000) {
        const out = {};
        await Promise.all(['manoir', 'casino', 'marche', 'station', 'musee', 'port'].map(async (m) => { try { const r = await env.PROP.get(env.PROP.idFromName('pub-' + m)).fetch('https://prop/?info=1'); out[m] = await r.json(); } catch (e) { out[m] = { n: 0, ph: 'lobby' }; } }));
        globalThis.__prInfo = { t: Date.now(), d: out };
      }
      return new Response(JSON.stringify(globalThis.__prInfo.d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // Mini golf : joueurs dans chaque salle publique + classement (accueil du golf), ou carte d'une partie privée (?code=XXXXX), mis en cache 4 s
    if (pathname === '/api/golf-info') {
      if (!env.GOLF) return new Response('{}', { status: 503 });
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      if (code) {
        if (!/^[A-Z0-9]{5}$/.test(code)) return new Response('{}', { status: 404 });
        const r = await env.GOLF.get(env.GOLF.idFromName('priv-' + code)).fetch('https://golf/?info=1'); const j = await r.json();
        return new Response(JSON.stringify(j), { status: j.n ? 200 : 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
      if (!globalThis.__gfInfo || Date.now() - globalThis.__gfInfo.t > 4000) {
        const rooms = {};
        await Promise.all(['prairie', 'automne', 'canyon', 'neige', 'ile'].map(async (m) => { try { const r = await env.GOLF.get(env.GOLF.idFromName('pub-' + m)).fetch('https://golf/?info=1'); rooms[m] = await r.json(); } catch (e) { rooms[m] = { n: 0, ph: 'lobby' }; } }));
        let top = []; try { top = await (await env.GOLF.get(env.GOLF.idFromName('hub')).fetch('https://golf/hub/top')).json(); } catch (e) { /* vide */ }
        globalThis.__gfInfo = { t: Date.now(), d: { rooms, top } };
      }
      return new Response(JSON.stringify(globalThis.__gfInfo.d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    // WebSocket des jeux temps réel : /ws/kart (la course) et /ws/golf?room=pub-<carte>|priv-<CODE>
    if (pathname === '/ws/kart' || pathname === '/ws/golf' || pathname === '/ws/prophunt') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
      if (pathname === '/ws/prophunt') {
        if (!env.PROP) return new Response('Prop Hunt indisponible', { status: 503 });
        const prRoom = url.searchParams.get('room') || '';
        if (!/^(pub-(manoir|casino|marche|station|musee|port)|priv-[A-Z0-9]{4,6})$/.test(prRoom)) return new Response('Salon invalide', { status: 404 });
        return env.PROP.get(env.PROP.idFromName(prRoom)).fetch(request);          // une salle (Durable Object) par carte publique et par salon privé
      }
      if (pathname === '/ws/kart') { if (!env.KART) return new Response('Course indisponible', { status: 503 }); return env.KART.get(env.KART.idFromName('main')).fetch(request); }
      const gRoom = String(url.searchParams.get('room') || '');
      if (!env.GOLF || !/^(pub-(prairie|automne|canyon|neige|ile)|priv-[A-Z0-9]{5})$/.test(gRoom)) return new Response('Salle inconnue', { status: 404 });
      return env.GOLF.get(env.GOLF.idFromName(gRoom)).fetch(request);           // une salle (Durable Object) par carte publique et par partie privée
    }

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
