// Copie js/3d/minijeux-regles.js (règles UNO / Puissance 4, écrites pour le navigateur) vers api/_minijeuxRules.js (module que le serveur peut importer).
// À relancer après toute modification des règles :  node scripts/sync-minijeux-regles.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../js/3d/minijeux-regles.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const i0 = src.indexOf('(function () {'), i1 = src.indexOf("  if (typeof window !== 'undefined')");
if (i0 < 0 || i1 < 0) throw new Error('structure inattendue de minijeux-regles.js');
const body = src.slice(i0, i1);
const out = '// FICHIER GÉNÉRÉ par scripts/sync-minijeux-regles.mjs à partir de js/3d/minijeux-regles.js : ne pas modifier à la main.\n' +
  'const MJ = ' + body.replace(/^\(function \(\) \{/, '(function () {') + '  return API;\n})();\nexport default MJ;\n';
writeFileSync(new URL('../api/_minijeuxRules.js', import.meta.url), out);
console.log('api/_minijeuxRules.js écrit (' + out.length + ' octets)');
