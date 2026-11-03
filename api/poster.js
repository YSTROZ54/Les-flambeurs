// Relais des affiches TMDB (image.tmdb.org) : ces images n'envoient aucun en-tête CORS, donc un <img crossorigin="anonymous">
// pointé dessus échoue toujours, et sans crossorigin le canvas qui la dessine devient « taintée » (plus utilisable comme
// texture WebGL — c'est le cas du panneau « à l'affiche » du hall, hall3d.js). Ce relais les sert depuis notre propre
// domaine (même origine, donc pas besoin de CORS, et le canvas reste propre) ; n'accepte que image.tmdb.org, jamais une URL arbitraire.
export const config = { maxDuration: 15 };

const ALLOWED_HOSTS = ['image.tmdb.org'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  let url;
  try { url = new URL(String(req.query.u || '')); } catch (e) { return res.status(400).send('URL invalide'); }
  if (!ALLOWED_HOSTS.includes(url.hostname)) return res.status(400).send('Hôte non autorisé');

  let upstream;
  try { upstream = await fetch(url.href); } catch (e) { return res.status(502).send('Source indisponible'); }
  if (!upstream.ok) { try { await upstream.body?.cancel(); } catch (e) { /* ok */ } return res.status(upstream.status).send('Source indisponible'); }

  res.status(200);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');   // les affiches TMDB ne changent jamais une fois publiées
  if (!upstream.body) return res.end();
  const { Readable } = await import('node:stream');
  Readable.fromWeb(upstream.body).pipe(res);
}
