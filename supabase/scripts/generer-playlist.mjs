// Fabrique assets/musique/playlist.json : la liste des musiques de chaque salle du casino 3D.
// Dépose tes fichiers (.mp3, .ogg, .m4a ou .wav) dans les dossiers de assets/musique/ puis lance :  npm run playlist
// Plusieurs titres par dossier : le jeu en tire un au hasard à chaque entrée dans la salle et à la fin de chaque titre.
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'musique');
// dossier -> salle du casino 3D (cinema est joué par cinema3d.js, qui le coupe pendant le film)
const SALLES = {
  'hall': 'hall', 'machines-a-sous': 'slots', 'poker': 'pokerroom', 'tropi-shop': 'shop3d', 'pmu': 'pmu',
  'blackjack': 'blackjack', 'blind-test': 'blindtest', 'crash': 'crash', 'mini-jeux': 'minijeux', 'loup-garou': 'loupgarou',
  'cinema': 'cinema', 'cinema-premium': 'cinemapremium', 'salle-musique': 'musique'
};
const EXT = /\.(mp3|ogg|m4a|wav)$/i;

// salles dont la musique est jouée EN MÊME TEMPS chez tous les joueurs (le titre en cours se déduit de l'horloge) : il faut la durée exacte de chaque titre (.mp3)
const SYNC = ['hall'];
function dureeMp3(chemin) {                      // additionne la durée de chaque trame MPEG (marche aussi pour les fichiers à débit variable)
  const b = readFileSync(chemin);
  let p = 0, total = 0;
  if (b.length > 10 && b.toString('latin1', 0, 3) === 'ID3') p = 10 + (((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127));
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  while (p + 4 < b.length) {
    if (b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) { p++; continue; }
    const ver = (b[p + 1] >> 3) & 3, layer = (b[p + 1] >> 1) & 3, bi = b[p + 2] >> 4, si = (b[p + 2] >> 2) & 3, pad = (b[p + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) { p++; continue; }
    const sr = SR[ver][si], kbps = (ver === 3 ? BR1 : BR2)[bi], spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((ver === 3 ? 144 : 72) * kbps * 1000 / sr) + pad;
    total += spf / sr; p += Math.max(len, 4);
  }
  return Math.round(total * 1000) / 1000;
}

const liste = {};
for (const [dossier, salle] of Object.entries(SALLES)) {
  const chemin = join(racine, dossier);
  if (!existsSync(chemin)) continue;
  const fichiers = readdirSync(chemin).filter((f) => EXT.test(f)).sort();
  if (fichiers.length) liste[salle] = fichiers.map((f) => `${dossier}/${f}`);
}
const sync = {};
for (const salle of SYNC) {
  if (!liste[salle]) continue;
  const durees = liste[salle].map((f) => (f.toLowerCase().endsWith('.mp3') ? dureeMp3(join(racine, f)) : 0));
  if (durees.every((d) => d > 5)) sync[salle] = durees;     // sinon : lecture au hasard comme les autres salles
}
if (Object.keys(sync).length) liste._sync = sync;
writeFileSync(join(racine, 'playlist.json'), JSON.stringify(liste, null, 2) + '\n');
const total = Object.entries(liste).reduce((n, [k, l]) => n + (k === '_sync' ? 0 : l.length), 0);
console.log(`playlist.json : ${total} titre(s) dans ${Object.keys(liste).length} salle(s)`);
for (const [salle, l] of Object.entries(liste)) if (salle !== '_sync') console.log(`  ${salle} : ${l.length}${sync[salle] ? ' (synchronisée : ' + Math.round(sync[salle].reduce((a, c) => a + c, 0)) + ' s)' : ''}`);
if (!total) console.log('Aucun fichier trouvé : le jeu garde la musique synthétisée.');
