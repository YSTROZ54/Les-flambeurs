// Fabrique assets/cinema/playlist.json à partir de la base de données Tropi Stream.
// Filtre les films ayant des liens premium Fsvid ou Vidzy valides (non morts) avec affiche.
// Usage :
//   npm run cinema-playlist             (génère les ~600 meilleurs films récents, cultes et populaires)
//   npm run cinema-playlist -- --all    (génère l'intégralité des films compatibles, ~13 400 films)
//   npm run cinema-playlist -- --limit 1000

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const racine = resolve(__dirname, '..');

// Chemins vers la base Tropi Stream
const possibleDbPaths = [
  resolve(__dirname, '..', '..', 'Tropi Stream', 'database'),
  resolve('C:/Users/yohan/OneDrive/Documents/mes bots/Tropi Stream/database')
];

let tropiDb = possibleDbPaths.find((p) => existsSync(join(p, 'film.json')));
if (!tropiDb) {
  console.error('❌ Dossier database de Tropi Stream introuvable.');
  process.exit(1);
}

const filmFile = join(tropiDb, 'film.json');
const deadFile = join(tropiDb, 'dead_links.json');
const vuesFile = join(tropiDb, 'vues.json');
const outFile = join(racine, 'assets', 'cinema', 'playlist.json');

console.log(`🎬 Lecture de la base Tropi Stream (${filmFile})...`);
const films = JSON.parse(readFileSync(filmFile, 'utf8'));

// Liens morts à exclure
const dead = new Set();
if (existsSync(deadFile)) {
  try {
    const deadList = JSON.parse(readFileSync(deadFile, 'utf8'));
    if (Array.isArray(deadList)) {
      for (const d of deadList) if (d.link) dead.add(d.link);
    }
  } catch (e) {
    console.warn('⚠️ Impossible de lire dead_links.json, ignoré.');
  }
}

// Vues et popularité sur Tropi Stream
const vuesMap = {};
if (existsSync(vuesFile)) {
  try {
    const vues = JSON.parse(readFileSync(vuesFile, 'utf8'));
    if (vues.currentWeek?.films) {
      for (const [k, v] of Object.entries(vues.currentWeek.films)) {
        vuesMap[k] = (vuesMap[k] || 0) + (v.viewers?.length || 0);
      }
    }
    if (Array.isArray(vues.history)) {
      for (const h of vues.history) {
        if (h.films) {
          for (const [k, v] of Object.entries(h.films)) {
            vuesMap[k] = (vuesMap[k] || 0) + (v.viewers?.length || 0);
          }
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Impossible de lire vues.json, ignoré.');
  }
}

const isVidzyOrFsvid = (url) => url && /vidzy|fsvid|fs\d+\./i.test(url) && !dead.has(url);

const CULT_KEYWORDS = [
  'harry potter', 'seigneur des anneaux', 'hobbit', 'star wars', 'spider-man', 'spiderman', 'avengers',
  'batman', 'dark knight', 'iron man', 'interstellar', 'inception', 'matrix', 'gladiator', 'titanic',
  'le parrain', 'pulp fiction', 'fight club', 'forrest gump', 'jurassic', 'fast & furious', 'john wick',
  'mission: impossible', 'james bond', 'shrek', 'le roi lion', 'toy story', 'dune', 'deadpool',
  'avatar', 'pirates des caraïbes', 'hunger games', 'alien', 'blade runner', 'terminator', 'indiana jones',
  'astérix', 'asterix', 'oss 117', 'les visiteurs', 'taxi', 'dîner de cons', 'intouchables', 'la cité de la peur'
];

function scoreFilm(nom, titre, annee, views) {
  let score = 0;
  if (views > 0) score += 200 + views * 60;
  if (annee >= 2025 && annee <= 2026) score += 120;
  else if (annee === 2024) score += 90;
  else if (annee === 2023) score += 60;
  else if (annee >= 2020) score += 30;

  const low = (nom + ' ' + titre).toLowerCase();
  for (const kw of CULT_KEYWORDS) {
    if (low.includes(kw)) {
      score += 150;
      break;
    }
  }
  return score;
}

const candidates = [];
for (const f of films) {
  const vf = isVidzyOrFsvid(f.premium_VF) ? f.premium_VF : null;
  const vo = isVidzyOrFsvid(f.premium_VO) ? f.premium_VO : null;
  if (!vf && !vo) continue;

  // Affiche valide requise pour un rendu propre dans la régie
  if (!f.image || !f.image.startsWith('http')) continue;

  const m = f.nom ? f.nom.match(/\((\d{4})\)/) : null;
  const annee = m ? parseInt(m[1], 10) : null;
  // Ignore les années d'anticipation erronées (ex: 2033)
  if (annee && annee > 2026) continue;

  const titre = f.nom ? f.nom.replace(/\s*\(\d{4}\)\s*$/, '').trim() : 'Sans titre';
  const cleanGenres = (f.genre || [])
    .map((g) => g.replace(/^[^\w\sÀ-ÿ]+/u, '').trim())
    .filter(Boolean);

  const mainUrl = vf || vo;
  const version = vf ? 'VF' : 'VO';
  const host = /vidzy/i.test(mainUrl) ? 'Vidzy' : 'Fsvid';
  const views = vuesMap[f.nom] || vuesMap[titre] || 0;
  const score = scoreFilm(f.nom, titre, annee, views);

  candidates.push({
    id: f.id,
    titre,
    nom: f.nom,
    annee,
    genres: cleanGenres,
    poster: f.image,
    url: mainUrl,
    version,
    host,
    vf,
    vo,
    score
  });
}

// Arguments CLI
const args = process.argv.slice(2);
const exportAll = args.includes('--all');
let limit = 600;
const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  limit = parseInt(args[limitIdx + 1], 10) || 600;
}

// Tri par score (vues + récence + cultes) puis année puis ID
candidates.sort((a, b) => b.score - a.score || (b.annee || 0) - (a.annee || 0) || a.id - b.id);

const selected = exportAll ? candidates : candidates.slice(0, limit);

// Nettoyage de la clé de score interne avant écriture
const outputData = selected.map(({ score, ...rest }) => rest);

writeFileSync(outFile, JSON.stringify(outputData, null, 2) + '\n', 'utf8');

const kb = (JSON.stringify(outputData).length / 1024).toFixed(1);
console.log(`✅ Playlist générée avec succès : ${outFile}`);
console.log(`📊 ${outputData.length} films enregistrés (${kb} Ko).`);
console.log(`   VF dispo: ${outputData.filter((f) => f.vf).length} | VO dispo: ${outputData.filter((f) => f.vo).length}`);
console.log(`   Fsvid: ${outputData.filter((f) => f.host === 'Fsvid').length} | Vidzy: ${outputData.filter((f) => f.host === 'Vidzy').length}`);
