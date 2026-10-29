// Serveur de développement (npm run dev) : Vite sert le site et recharge la page dès qu'un fichier change.
// Les routes /api/* appellent les mêmes fonctions que sur Vercel ; une fonction modifiée est relue au prochain appel.
// Comme avec serveur-local.mjs, les parties de poker et les comptes restent en mémoire (rien n'est envoyé à Supabase).
import { execFile } from 'node:child_process';
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

// Dès qu'il y a un nouveau push sur GitHub, ta copie le récupère toute seule (toutes les 30 s) en gardant tes modifs en cours.
// Rien n'est touché si une modif en cours touche les mêmes lignes qu'un nouveau commit, ou s'il reste des commits pas poussés :
// le terminal le signale et le Pull se fait à la main. SYNCHRO_GIT=0 coupe la synchro, SYNCHRO_GIT=<secondes> change le rythme.
function synchroGit() {
  return {
    name: 'flambeurs-synchro-git',
    configureServer(server) {
      const secondes = Number(process.env.SYNCHRO_GIT ?? 30);
      if (!secondes) return;
      const log = server.config.logger;
      const git = (...args) => new Promise((resolve, reject) => {
        execFile('git', args, { cwd: server.config.root, windowsHide: true, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
          (err, stdout, stderr) => (err ? reject(Object.assign(err, { detail: String(stderr || stdout || err.message).trim() })) : resolve(stdout.trim())));
      });
      let enCours = false;
      let dernierAvertissement = '';
      const avertir = (cle, message) => {
        if (cle === dernierAvertissement) return;
        dernierAvertissement = cle;
        log.warn(`[git] ${message}`, { timestamp: true });
      };

      async function synchroniser() {
        if (enCours) return;
        enCours = true;
        try {
          await git('fetch', '--quiet', 'origin');
          const amont = await git('rev-parse', '@{u}');
          const nouveaux = await git('log', '--format=%h %s (%an)', 'HEAD..@{u}');
          if (!nouveaux) {
            dernierAvertissement = '';
            return;
          }
          const pasPousses = Number(await git('rev-list', '--count', '@{u}..HEAD'));
          if (pasPousses) {
            avertir(`local:${amont}`, `Nouveaux commits sur GitHub, mais tu as ${pasPousses} commit(s) pas encore poussé(s) : fais le Pull à la main.`);
            return;
          }
          // Tes modifs en cours se recollent-elles sans conflit sur les nouveaux commits ? Test à blanc, sans toucher aux fichiers.
          const modifs = await git('stash', 'create');
          if (modifs) {
            try {
              await git('merge-tree', '--write-tree', '--merge-base', 'HEAD', '@{u}', modifs);
            } catch {
              avertir(`conflit:${amont}`, 'Nouveaux commits sur GitHub, mais ils touchent les mêmes lignes que tes modifs en cours : fais le Pull à la main.');
              return;
            }
          }
          const fichiers = (await git('diff', '--name-only', 'HEAD', '@{u}')).split('\n');
          await git('merge', '--ff-only', '--autostash', '--quiet', '@{u}');
          dernierAvertissement = '';
          log.info(`[git] Nouveaux commits récupérés :\n${nouveaux.replace(/^/gm, '        ')}`, { timestamp: true });
          if (fichiers.includes('package.json') || fichiers.includes('package-lock.json')) {
            log.warn('[git] package.json a changé : arrête npm run dev (Ctrl+C), lance npm install, puis relance npm run dev.', { timestamp: true });
          }
        } catch (e) {
          avertir(`erreur:${e.detail}`, `Mise à jour automatique impossible : ${String(e.detail).split('\n')[0]}`);
        } finally {
          enCours = false;
        }
      }

      synchroniser();
      const minuteur = setInterval(synchroniser, secondes * 1000);
      server.httpServer?.on('close', () => clearInterval(minuteur));
    }
  };
}

export default defineConfig({
  plugins: [apiLocale(), synchroGit()],
  // Pas de repli sur index.html : une adresse inconnue répond 404, comme serveur-local.mjs et Vercel.
  appType: 'mpa',
  server: {
    port: 8080,
    strictPort: true,
    // Le dossier est dans OneDrive : comme pour Tropi Site, on surveille les fichiers par sondage, sinon des modifs passent inaperçues.
    watch: { usePolling: true, interval: 100, ignored: ['**/blindtest/img/**'] }
  }
});
