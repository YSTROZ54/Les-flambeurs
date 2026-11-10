// Prépare les fichiers 3D du mini golf (outil hors ligne, à lancer une seule fois) :
//   node scripts/golf-assets.mjs <dossier du pack nature Quaternius (glTF)> <dossier des fichiers Poly Haven>
// - rassemble les modèles choisis du « Stylized Nature MegaKit » (Quaternius, CC0) dans UN seul fichier assets/golf/nature.glb
//   (textures réduites et partagées : un seul téléchargement pour toutes les cartes) ;
// - copie les textures de bois et les ciels HDR (Poly Haven, CC0) dans assets/golf/tex et assets/golf/sky.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SRC = process.argv[2], PH = process.argv[3];
const OUT = fileURLToPath(new URL('../assets/golf/', import.meta.url));
mkdirSync(join(OUT, 'tex'), { recursive: true }); mkdirSync(join(OUT, 'sky'), { recursive: true });

const MODELS = [
  'CommonTree_1', 'CommonTree_3', 'CommonTree_5',
  'TwistedTree_1', 'TwistedTree_3', 'TwistedTree_5',
  'Pine_1', 'Pine_3', 'Pine_5',
  'DeadTree_1', 'DeadTree_3', 'DeadTree_5',
  'Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big', 'Clover_1', 'Clover_2',
  'Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single',
  'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall',
  'Mushroom_Common', 'Mushroom_Laetiporus',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5', 'Pebble_Square_1', 'Pebble_Square_3', 'Pebble_Square_5'
];
// taille maximale et format de chaque texture (les feuilles gardent leur transparence)
const TEX = {
  'Bark_NormalTree.png': [512, 'jpg'], 'Bark_TwistedTree.png': [512, 'jpg'], 'Bark_DeadTree.png': [512, 'jpg'],
  'Leaves_NormalTree_C.png': [512, 'png'], 'Leaves_TwistedTree_C.png': [512, 'png'], 'Leaf_Pine_C.png': [512, 'png'], 'Leaves.png': [512, 'png'],
  'Flowers.png': [512, 'png'], 'Grass.png': [128, 'png'], 'Mushrooms.png': [512, 'jpg'], 'Rocks_Diffuse.png': [1024, 'jpg'], 'PathRocks_Diffuse.png': [512, 'jpg']
};

const out = { asset: { version: '2.0', generator: 'les-flambeurs golf-assets' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] };
const chunks = []; let binLen = 0;
function addBytes(buf) { const pad = (4 - (binLen % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); binLen += pad; } const off = binLen; chunks.push(buf); binLen += buf.length; return off; }
const imgMap = {}, matMap = {};

async function image(uri) {
  if (imgMap[uri] !== undefined) return imgMap[uri];
  const rule = TEX[uri] || [512, 'png'];
  let s = sharp(join(SRC, uri)).resize(rule[0], rule[0], { fit: 'inside', withoutEnlargement: true });
  const buf = rule[1] === 'jpg' ? await s.flatten({ background: '#808080' }).jpeg({ quality: 84 }).toBuffer() : await s.png({ compressionLevel: 9, palette: rule[0] <= 512, quality: 92 }).toBuffer();
  const off = addBytes(buf);
  out.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
  out.images.push({ name: uri.replace(/\.png$/, ''), bufferView: out.bufferViews.length - 1, mimeType: rule[1] === 'jpg' ? 'image/jpeg' : 'image/png' });
  out.textures.push({ sampler: 0, source: out.images.length - 1 });
  imgMap[uri] = out.textures.length - 1;
  console.log('  texture', uri, '→', rule[0], rule[1], (buf.length / 1024).toFixed(0) + ' Ko');
  return imgMap[uri];
}

for (const name of MODELS) {
  const g = JSON.parse(readFileSync(join(SRC, name + '.gltf'), 'utf8'));
  const bin = readFileSync(join(SRC, g.buffers[0].uri));
  const colorBV = new Set(); g.meshes.forEach((me) => me.primitives.forEach((p) => { if (p.attributes.COLOR_0 !== undefined) colorBV.add(g.accessors[p.attributes.COLOR_0].bufferView); }));
  const bvMap = g.bufferViews.map((bv, bi) => { if (colorBV.has(bi)) return -1; const slice = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); const off = addBytes(Buffer.from(slice)); const nb = { buffer: 0, byteOffset: off, byteLength: bv.byteLength }; if (bv.byteStride) nb.byteStride = bv.byteStride; if (bv.target) nb.target = bv.target; out.bufferViews.push(nb); return out.bufferViews.length - 1; });
  const colorAcc = new Set(); g.meshes.forEach((me) => me.primitives.forEach((p) => { if (p.attributes.COLOR_0 !== undefined) colorAcc.add(p.attributes.COLOR_0); }));
  const accMap = g.accessors.map((a, ai) => {
    if (colorAcc.has(ai)) {                                   // couleurs de sommets (ombrage) : 8 bits au lieu de 16 octets, ou rien si tout est blanc
      const bv = g.bufferViews[a.bufferView], comp = a.type === 'VEC4' ? 4 : 3, csz = a.componentType === 5126 ? 4 : 2, stride = bv.byteStride || comp * csz, o0 = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const u8 = Buffer.alloc(a.count * 4); let white = true;
      for (let i = 0; i < a.count; i++) for (let c = 0; c < 4; c++) { let v = 1; if (c < comp) { const off = o0 + i * stride + c * csz; v = csz === 4 ? bin.readFloatLE(off) : bin.readUInt16LE(off) / 65535; } if (v < 0.985) white = false; u8[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v * 255))); }
      if (white) return -1;
      const off = addBytes(u8); out.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: u8.length, byteStride: 4, target: 34962 });
      out.accessors.push({ bufferView: out.bufferViews.length - 1, componentType: 5121, normalized: true, count: a.count, type: 'VEC4' }); return out.accessors.length - 1;
    }
    const na = { ...a, bufferView: bvMap[a.bufferView] }; out.accessors.push(na); return out.accessors.length - 1;
  });
  const mMap = [];
  for (const m of g.materials || []) {
    if (matMap[m.name] === undefined) {
      const nm = JSON.parse(JSON.stringify(m));
      const pbr = nm.pbrMetallicRoughness || (nm.pbrMetallicRoughness = {});
      if (pbr.baseColorTexture) { const src = g.images[g.textures[pbr.baseColorTexture.index].source].uri; pbr.baseColorTexture = { index: await image(src) }; }
      delete pbr.metallicRoughnessTexture; delete nm.normalTexture; delete nm.occlusionTexture; delete nm.emissiveTexture;
      pbr.metallicFactor = 0; pbr.roughnessFactor = 0.9;
      out.materials.push(nm); matMap[m.name] = out.materials.length - 1;
    }
    mMap.push(matMap[m.name]);
  }
  const meshMap = g.meshes.map((me) => { out.meshes.push({ name: me.name, primitives: me.primitives.map((p) => { const np = { attributes: {}, indices: accMap[p.indices], material: mMap[p.material], mode: p.mode }; if (np.mode === undefined) delete np.mode; for (const k of Object.keys(p.attributes)) { const ai = accMap[p.attributes[k]]; if (ai >= 0) np.attributes[k] = ai; } return np; }) }); return out.meshes.length - 1; });
  const base = out.nodes.length;
  g.nodes.forEach((n) => { const nn = { ...n }; if (n.mesh !== undefined) nn.mesh = meshMap[n.mesh]; if (n.children) nn.children = n.children.map((c) => c + base); delete nn.skin; out.nodes.push(nn); });
  if (process.env.DEBUG) console.log(name);
  const roots = g.scenes[g.scene || 0].nodes.map((i) => i + base);
  out.nodes.push({ name: name, children: roots });
  out.scenes[0].nodes.push(out.nodes.length - 1);
  console.log(name);
}
out.buffers[0].byteLength = binLen;
const binBuf = Buffer.concat(chunks);
let json = Buffer.from(JSON.stringify(out), 'utf8'); const jpad = (4 - (json.length % 4)) % 4; json = Buffer.concat([json, Buffer.alloc(jpad, 0x20)]);
const bpad = (4 - (binBuf.length % 4)) % 4; const binAll = Buffer.concat([binBuf, Buffer.alloc(bpad)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + binAll.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binAll.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(join(OUT, 'nature.glb'), Buffer.concat([head, jh, json, bh, binAll]));
console.log('nature.glb', ((12 + 16 + json.length + binAll.length) / 1048576).toFixed(2) + ' Mo');

// textures à part : bois des bordures (coated_pine), planches des côtés (wood_planks), roche du désert (Quaternius)
await sharp(join(PH, 'w_coated_pine.jpg')).resize(1024, 1024).jpeg({ quality: 82 }).toFile(join(OUT, 'tex', 'bois.jpg'));
await sharp(join(PH, 'n_coated_pine.jpg')).resize(512, 512).jpeg({ quality: 86 }).toFile(join(OUT, 'tex', 'bois_n.jpg'));
await sharp(join(PH, 'w_wood_planks.jpg')).resize(1024, 1024).jpeg({ quality: 82 }).toFile(join(OUT, 'tex', 'planches.jpg'));
await sharp(join(PH, 'n_wood_planks.jpg')).resize(512, 512).jpeg({ quality: 86 }).toFile(join(OUT, 'tex', 'planches_n.jpg'));
await sharp(join(SRC, 'Rocks_Desert_Diffuse.png')).resize(1024, 1024).jpeg({ quality: 84 }).toFile(join(OUT, 'tex', 'roche_desert.jpg'));
await sharp(join(SRC, 'Rocks_Diffuse.png')).resize(1024, 1024).jpeg({ quality: 84 }).toFile(join(OUT, 'tex', 'roche.jpg'));
await sharp(join(SRC, 'Bark_NormalTree.png')).resize(512, 512).flatten({ background: '#808080' }).jpeg({ quality: 84 }).toFile(join(OUT, 'tex', 'ecorce.jpg'));
// ciels (HDR, 1k pour les téléphones, 2k pour les ordinateurs)
const SKIES = { prairie: 'kloofendal_48d_partly_cloudy_puresky', automne: 'autumn_field_puresky', canyon: 'drackenstein_quarry_puresky', neige: 'snow_field_puresky', ile: 'qwantani_sunset_puresky' };
for (const [k, id] of Object.entries(SKIES)) for (const r of ['1k', '2k']) copyFileSync(join(PH, id + '_' + r + '.hdr'), join(OUT, 'sky', k + '_' + r + '.hdr'));
console.log('textures et ciels copiés');
