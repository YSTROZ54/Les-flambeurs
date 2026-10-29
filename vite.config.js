// Serveur de développement (npm run dev) : Vite sert le site et recharge la page dès qu'un fichier change.
// Les routes /api/* appellent les mêmes fonctions que sur Vercel ; une fonction modifiée est relue au prochain appel.
// Comme avec serveur-local.mjs, les parties de poker et les comptes restent en mémoire (rien n'est envoyé à Supabase).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

process.env.POKER_STORAGE = process.env.POKER_STORAGE || 'memory';
process.env.ACCOUNTS_STORAGE = process.env.ACCOUNTS_STORAGE || 'memory';

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

// /api/<nom> → api/<nom>.js, comme sur Vercel (les fichiers qui commencent par _ ne sont pas des routes).
function apiLocale() {
  return {
    name: 'flambeurs-api',
    configureServer(server) {
      const apiDir = join(server.config.root, 'api');
      // Le terminal annonce le backend sous l'adresse du site (Vite signale déjà lui-même une fonction rechargée).
      const printUrls = server.printUrls;
      server.printUrls = () => {
        printUrls();
        const routes = readdirSync(apiDir).filter((f) => /^[a-z]+\.js$/.test(f)).map((f) => f.slice(0, -3));
        server.config.logger.info(`  ➜  Backend: /api/${routes.join(', /api/')} (en mémoire)`);
      };

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const m = url.pathname.match(/^\/api\/([a-z]+)$/);
        if (!m || !existsSync(join(server.config.root, 'api', `${m[1]}.js`))) return next();
        try {
          const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`);
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
          server.ssrFixStacktrace(e);
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: 'Erreur serveur' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [apiLocale()],
  // Pas de repli sur index.html : une adresse inconnue répond 404, comme serveur-local.mjs et Vercel.
  appType: 'mpa',
  server: {
    port: 8080,
    strictPort: true,
    // Le dossier est dans OneDrive : comme pour Tropi Site, on surveille les fichiers par sondage, sinon des modifs passent inaperçues.
    watch: { usePolling: true, interval: 100, ignored: ['**/blindtest/img/**'] }
  }
});
