// Fabrique assets/musique/playlist.json : la liste des musiques de chaque salle du casino 3D.
// Dépose tes fichiers (.mp3, .ogg, .m4a ou .wav) dans les dossiers de assets/musique/ puis lance :  npm run playlist
// Plusieurs titres par dossier : le jeu en tire un au hasard à chaque entrée dans la salle et à la fin de chaque titre.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'musique');
// dossier -> salle du casino 3D (le cinéma garde sa propre musique)
const SALLES = { 'hall': 'hall', 'machines-a-sous': 'slots', 'poker': 'pokerroom', 'courses': 'horses', 'tropi-shop': 'shop3d', 'pmu': 'pmu' };
const EXT = /\.(mp3|ogg|m4a|wav)$/i;

const liste = {};
for (const [dossier, salle] of Object.entries(SALLES)) {
  const chemin = join(racine, dossier);
  if (!existsSync(chemin)) continue;
  const fichiers = readdirSync(chemin).filter((f) => EXT.test(f)).sort();
  if (fichiers.length) liste[salle] = fichiers.map((f) => `${dossier}/${f}`);
}
writeFileSync(join(racine, 'playlist.json'), JSON.stringify(liste, null, 2) + '\n');
const total = Object.values(liste).reduce((n, l) => n + l.length, 0);
console.log(`playlist.json : ${total} titre(s) dans ${Object.keys(liste).length} salle(s)`);
for (const [salle, l] of Object.entries(liste)) console.log(`  ${salle} : ${l.length}`);
if (!total) console.log('Aucun fichier trouvé : le jeu garde la musique synthétisée.');
