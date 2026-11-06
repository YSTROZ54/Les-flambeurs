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
import horsesHandler from './api/horses.js';
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
  horses: horsesHandler,
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

  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  res.on('finish', () => {
    if (!resolved) {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      finish(body);
    }
  });

  const origEnd = res.end.bind(res);
  res.end = (chunk, encoding, cb) => {
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
