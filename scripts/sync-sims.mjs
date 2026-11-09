// Copie les simulations partagées (js/3d/golf-sim.js, js/3d/kart-sim.js), écrites pour le navigateur, vers des modules que le serveur peut importer
// (api/_golfSim.js, api/_kartSim.js). À relancer après toute modification :  node scripts/sync-sims.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const jobs = [['golf-sim.js', '_golfSim.js', 'golf-sim'], ['kart-sim.js', '_kartSim.js', 'kart-sim']];
for (const [from, to, label] of jobs) {
  const src0 = new URL('../js/3d/' + from, import.meta.url);
  if (!existsSync(src0)) { console.log('absent :', from); continue; }
  const src = readFileSync(src0, 'utf8').replace(/\r\n/g, '\n');
  const i0 = src.indexOf('(function () {'), i1 = src.indexOf("  if (typeof window !== 'undefined')");
  if (i0 < 0 || i1 < 0) throw new Error('structure inattendue de ' + from);
  const out = '// FICHIER GÉNÉRÉ par scripts/sync-sims.mjs à partir de js/3d/' + from + ' : ne pas modifier à la main.\nconst SIM = ' + src.slice(i0, i1) + '  return API;\n})();\nexport default SIM;\n';
  writeFileSync(new URL('../api/' + to, import.meta.url), out);
  console.log('api/' + to + ' écrit (' + out.length + ' octets)');
}
