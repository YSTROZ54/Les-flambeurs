// Relais vidéo du cinéma : sert les flux extraits (fsvid / uqload / vidzy, via tropistream.fr)
// depuis notre propre domaine. Un <video> du casino en appel direct vers tropistream.fr est
// refusé par leur liste blanche CORS (vérifié en direct) ; ce relais, lui, les appelle en
// serveur à serveur (aucun en-tête Origin envoyé, donc jamais bloqué) et reste la seule porte
// de sortie : il n'accepte que des cibles sur tropistream.fr, jamais une URL arbitraire.
export const config = { maxDuration: 30 };

const ALLOWED_HOSTS = ['tropistream.fr', 'www.tropistream.fr'];
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  let url;
  try { url = new URL(String(req.query.u || '')); } catch (e) { return res.status(400).send('URL invalide'); }
  if (!ALLOWED_HOSTS.includes(url.hostname)) return res.status(400).send('Hôte non autorisé');

  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(url.href, { headers });
  } catch (e) {
    return res.status(502).send('Source indisponible');
  }
  if (upstream.status >= 400) {
    try { await upstream.body?.cancel(); } catch (e) { /* ok */ }
    return res.status(upstream.status).type('text/plain').send('Source indisponible');
  }

  const contentType = upstream.headers.get('content-type') || '';
  // Playlist HLS : les segments qu'elle référence (/srv/...) doivent eux aussi repasser par
  // nous, sinon le navigateur les demanderait directement à tropistream.fr (bloqué par CORS).
  if (contentType.includes('mpegurl') || /\.m3u8(\?|$)/i.test(url.href)) {
    const text = await upstream.text();
    const rewritten = text.replace(/\/srv\/[^\s"]+/g, (m) => '/api/cinema-video?u=' + encodeURIComponent('https://tropistream.fr' + m));
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(rewritten);
  }

  res.status(upstream.status);
  for (const h of PASS_HEADERS) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
  if (!upstream.body) return res.end();
  const { Readable } = await import('node:stream');
  Readable.fromWeb(upstream.body).pipe(res);
}
