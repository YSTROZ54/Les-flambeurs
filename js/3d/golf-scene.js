/* =====================================================================
   golf-scene.js — Le DÉCOR des 5 parcours du mini golf (aucune règle de jeu ici, voir golf3d.js)
   ---------------------------------------------------------------------
   • Ciel : vraie photo HDR (Poly Haven, CC0) qui éclaire aussi la scène ; le soleil est placé là où il est sur la photo.
   • Terrain : sculpté autour des pistes (collines, étangs sous les sauts, ravins sous les passerelles, mer autour de l'île).
   • Pistes : gazon à carreaux, bordures en vrai bois (Poly Haven) avec poteaux, côtés en planches, ponts sur pilotis, boucles.
   • Végétation : modèles du « Stylized Nature MegaKit » (Quaternius, CC0) — arbres, buissons, fleurs, herbes, champignons,
     rochers — posés par milliers (une seule copie de chaque modèle en mémoire), qui bougent doucement au vent.
   • Eau animée (vagues, reflets du ciel, éclat du soleil), ombres douces, neige / feuilles qui tombent.
   F3D.golfScene.build(world, mapId, onProgress, onReady) → { group, holes, update(dt, t, focus), pickFloor(ray, hole), dispose() }
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F) return;
  var GS = F.golfSim;
  if (!GS) return;
  var TAU = Math.PI * 2, BASE = 'assets/golf/', R = GS.R, WALL_H = GS.WALL_H, GROUND = GS.GROUND;
  var WIND = { value: 0 };

  /* ------------------------------------------------------------------ outils ------------------------------------------------------------------ */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function tex(c, rep, srgb) {
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (rep) t.repeat.set(rep, rep);
    if (srgb !== false) t.encoding = THREE.sRGBEncoding; return t;
  }
  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  // bruit doux (valeurs aléatoires interpolées) + plusieurs octaves
  function makeNoise(seed) {
    var r = rng(seed), P = new Float32Array(256 * 256); for (var i = 0; i < P.length; i++) P[i] = r();
    function v(ix, iz) { return P[((ix & 255) << 8) | (iz & 255)]; }
    function n(x, z) { var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz); return (v(ix, iz) * (1 - ux) + v(ix + 1, iz) * ux) * (1 - uz) + (v(ix, iz + 1) * (1 - ux) + v(ix + 1, iz + 1) * ux) * uz; }
    return function (x, z, oct) { var s = 0, a = 0.5, f = 1, t = 0; for (var o = 0; o < (oct || 4); o++) { s += n(x * f, z * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
  }
  // carte de relief → carte de normales (pour le gazon, le sable…)
  function normalFrom(hc, strength) {
    var w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data, c = canvas(w, h), x = c.getContext('2d'), out = x.createImageData(w, h), d = out.data;
    function H(i, j) { i = (i + w) % w; j = (j + h) % h; return src[(j * w + i) * 4] / 255; }
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var dx = (H(i + 1, j) - H(i - 1, j)) * strength, dy = (H(i, j + 1) - H(i, j - 1)) * strength, l = Math.sqrt(dx * dx + dy * dy + 1), k = (j * w + i) * 4;
      d[k] = (-dx / l * 0.5 + 0.5) * 255; d[k + 1] = (-dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
    x.putImageData(out, 0, 0); return tex(c, 1, false);
  }

  /* ------------------------------------------------------------------ chargement des fichiers (partagés par les 5 cartes) ------------------------------------------------------------------ */
  var NAT = null, natCbs = [], natGo = false, TEXC = {};
  function loadNature(cb) {
    if (NAT) { cb(NAT); return; }
    natCbs.push(cb); if (natGo) return; natGo = true;
    function done(lib) { NAT = lib; var l = natCbs; natCbs = []; l.forEach(function (f) { f(lib); }); }
    if (!THREE.GLTFLoader) { done({}); return; }
    new THREE.GLTFLoader().load(BASE + 'nature.glb?v=1', function (gl) {
      var lib = {};
      gl.scene.updateMatrixWorld(true);
      gl.scene.children.forEach(function (root) {
        var parts = [], bb = new THREE.Box3();
        root.traverse(function (o) {
          if (!o.isMesh) return;
          var geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); bb.union(geo.boundingBox);
          var m = o.material; if (m.map) m.map.anisotropy = 4;
          if (m.alphaTest > 0 || /Leaves|Leaf|Grass|Flowers/.test(m.name)) { m.side = THREE.DoubleSide; if (!m.alphaTest && /Leaves|Leaf|Flowers/.test(m.name)) m.alphaTest = 0.5; }
          parts.push({ geo: geo, mat: m });
        });
        lib[root.name] = { parts: parts, box: bb };
      });
      done(lib);
    }, undefined, function () { done({}); });
  }
  function loadTex(name, srgb, cb) {
    var k = name + (srgb ? 's' : 'l');
    if (TEXC[k]) { cb(TEXC[k]); return; }
    new THREE.TextureLoader().load(BASE + 'tex/' + name + '?v=1', function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; TEXC[k] = t; cb(t); }, undefined, function () { cb(null); });
  }
  // le ciel HDR (1k sur téléphone, 2k sur ordinateur) ; on décode la photo pour trouver le soleil et la couleur de l'horizon
  function halfToFloat(h) { var s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF; if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024); if (e === 0x1F) return f ? NaN : (s ? -1 : 1) * Infinity; return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024); }
  function loadSky(name, low, cb) {
    if (!THREE.RGBELoader) { cb(null); return; }
    var L = new THREE.RGBELoader(); if (L.setDataType) L.setDataType(THREE.HalfFloatType);
    L.load(BASE + 'sky/' + name + '_' + (low ? '1k' : '2k') + '.hdr?v=1', function (t) {
      var img = t.image, W = img.width, Hh = img.height, d = img.data, best = -1, bi = 0, j, i, k, hor = [0, 0, 0], hn = 0, zen = [0, 0, 0], zn = 0;
      for (j = 0; j < Hh; j += 2) for (i = 0; i < W; i += 2) {
        k = (j * W + i) * 4; var r = halfToFloat(d[k]), g = halfToFloat(d[k + 1]), b = halfToFloat(d[k + 2]), lum = r * 0.3 + g * 0.6 + b * 0.1;
        if (lum > best) { best = lum; bi = k / 4; }
        var el = 0.5 - (j + 0.5) / Hh;                                  // +0.5 en haut de l'image, -0.5 en bas
        if (el > 0.005 && el < 0.03) { hor[0] += r; hor[1] += g; hor[2] += b; hn++; }
        if (el > 0.25 && el < 0.4) { zen[0] += Math.min(r, 4); zen[1] += Math.min(g, 4); zen[2] += Math.min(b, 4); zn++; }
      }
      var si = bi % W, sj = Math.floor(bi / W), phi = ((si + 0.5) / W - 0.5) * TAU, th = (0.5 - (sj + 0.5) / Hh) * Math.PI;
      t.mapping = THREE.EquirectangularReflectionMapping;
      cb({ tex: t, sun: new THREE.Vector3(Math.cos(th) * Math.cos(phi), Math.sin(th), Math.cos(th) * Math.sin(phi)).normalize(), horizon: hor.map(function (v) { return v / Math.max(1, hn); }), zenith: zen.map(function (v) { return v / Math.max(1, zn); }) });
    }, undefined, function () { cb(null); });
  }

  /* ------------------------------------------------------------------ les 5 ambiances ------------------------------------------------------------------ */
  var THEMES = {
    prairie: { sky: 'prairie', expo: 0.88, ground: 'grass', rock: 'roche.jpg', hills: 2.4, gapDepth: -1.0, turf: ['#2f7f3c', '#2b7537'], bump: 0xd63a2e, post: 'wood', particles: null, sunCol: 0xfff2dd, sunI: 2.6,
      decor: [['CommonTree_1', 46, 0.9, 1.35, 5, 40], ['CommonTree_3', 40, 0.9, 1.3, 5, 40], ['CommonTree_5', 34, 0.9, 1.3, 5, 40], ['Bush_Common_Flowers', 90, 0.7, 1.2, 1.6, 22], ['Bush_Common', 60, 0.7, 1.2, 1.6, 22], ['Flower_3_Group', 160, 0.8, 1.4, 0.7, 14], ['Flower_4_Group', 160, 0.8, 1.4, 0.7, 14], ['Grass_Common_Tall', 700, 0.7, 1.3, 0.35, 10], ['Grass_Common_Short', 900, 0.7, 1.3, 0.3, 12], ['Grass_Wispy_Tall', 300, 0.7, 1.2, 0.5, 12], ['Clover_1', 140, 0.8, 1.3, 0.4, 10], ['Fern_1', 80, 0.8, 1.3, 1, 16], ['Mushroom_Common', 40, 0.6, 1.1, 0.8, 10], ['Rock_Medium_1', 26, 0.6, 1.6, 2, 30], ['Rock_Medium_2', 26, 0.6, 1.6, 2, 30], ['Pebble_Round_2', 90, 0.6, 1.5, 0.5, 12], ['Pebble_Round_4', 90, 0.6, 1.5, 0.5, 12]] },
    automne: { sky: 'automne', expo: 0.9, ground: 'autumn', rock: 'roche.jpg', hills: 2.8, gapDepth: -1.0, turf: ['#3a7434', '#356a2f'], bump: 0xe0782f, post: 'stump', particles: 'leaves', sunCol: 0xffd7a8, sunI: 2.4, tint: { Leaves_NormalTree: 0xffa14a },
      decor: [['TwistedTree_1', 40, 0.9, 1.3, 5, 40], ['TwistedTree_3', 40, 0.9, 1.3, 5, 40], ['TwistedTree_5', 34, 0.9, 1.3, 5, 40], ['CommonTree_3', 34, 0.9, 1.3, 5, 40], ['DeadTree_3', 14, 0.8, 1.2, 5, 40], ['Bush_Common', 110, 0.7, 1.25, 1.6, 22], ['Fern_1', 160, 0.8, 1.4, 0.8, 16], ['Mushroom_Common', 120, 0.6, 1.3, 0.6, 12], ['Mushroom_Laetiporus', 40, 0.6, 1.1, 1, 14], ['Grass_Wispy_Tall', 500, 0.7, 1.3, 0.4, 12], ['Grass_Wispy_Short', 700, 0.7, 1.3, 0.3, 12], ['Plant_7', 120, 0.8, 1.3, 0.6, 12], ['Rock_Medium_1', 30, 0.7, 1.8, 2, 30], ['Rock_Medium_3', 30, 0.7, 1.8, 2, 30], ['Pebble_Round_1', 120, 0.6, 1.5, 0.5, 12]] },
    canyon: { sky: 'canyon', expo: 0.85, ground: 'desert', rock: 'roche_desert.jpg', hills: 0, mesa: true, gapDepth: -7, turf: ['#3f7a3a', '#3a7135'], bump: 0x2f7fd0, post: 'wood', particles: 'dust', sunCol: 0xffe8c8, sunI: 3.0, rockTint: 0xffffff, tint: { Grass: 0xd9b86a },
      decor: [['DeadTree_1', 30, 0.8, 1.3, 4, 40], ['DeadTree_3', 30, 0.8, 1.3, 4, 40], ['DeadTree_5', 24, 0.8, 1.3, 4, 40], ['Rock_Medium_1', 60, 0.9, 3.2, 2.5, 45], ['Rock_Medium_2', 60, 0.9, 3.2, 2.5, 45], ['Rock_Medium_3', 60, 0.9, 3.2, 2.5, 45], ['Grass_Wispy_Short', 500, 0.7, 1.3, 0.4, 14], ['Grass_Wispy_Tall', 200, 0.7, 1.2, 0.6, 14], ['Plant_1', 90, 0.8, 1.4, 0.7, 14], ['Pebble_Round_3', 200, 0.6, 1.8, 0.5, 16], ['Pebble_Square_3', 120, 0.6, 1.6, 0.5, 16]], desertRocks: true },
    neige: { sky: 'neige', expo: 0.8, ground: 'snow', rock: 'roche.jpg', hills: 4.5, peaks: true, gapDepth: -6, turf: ['#2f7448', '#2a6a41'], bump: 0x3f8fe0, post: 'ice', particles: 'snow', sunCol: 0xffffff, sunI: 2.6, tint: { Leaves_Pine: 0xcfe6dc, Rocks: 0xe2ecf5 },
      decor: [['Pine_1', 70, 0.9, 1.5, 4, 45], ['Pine_3', 70, 0.9, 1.5, 4, 45], ['Pine_5', 60, 0.9, 1.5, 4, 45], ['DeadTree_5', 16, 0.8, 1.2, 4, 40], ['Rock_Medium_1', 40, 0.8, 2.6, 2, 35], ['Rock_Medium_2', 40, 0.8, 2.6, 2, 35], ['Pebble_Round_5', 100, 0.6, 1.5, 0.6, 14]] },
    ile: { sky: 'ile', expo: 0.85, ground: 'sand', rock: 'roche.jpg', hills: 1.2, island: true, gapDepth: -1.2, turf: ['#2f7d3a', '#2b7336'], bump: 0xffc23d, post: 'bollard', particles: null, sunCol: 0xffc48a, sunI: 2.7, tint: { Leaves: 0x9fe07a },
      decor: [['TwistedTree_1', 30, 0.9, 1.3, 5, 34], ['TwistedTree_5', 26, 0.9, 1.3, 5, 34], ['CommonTree_1', 26, 0.9, 1.3, 5, 34], ['Plant_1_Big', 120, 0.8, 1.5, 1, 20], ['Plant_7_Big', 120, 0.8, 1.5, 1, 20], ['Fern_1', 120, 0.9, 1.5, 0.8, 16], ['Bush_Common_Flowers', 70, 0.7, 1.2, 1.5, 20], ['Grass_Wispy_Tall', 400, 0.7, 1.2, 0.5, 14], ['Grass_Common_Short', 400, 0.7, 1.2, 0.4, 12], ['Rock_Medium_2', 40, 0.6, 2.2, 2, 30], ['Rock_Medium_3', 40, 0.6, 2.2, 2, 30], ['Pebble_Round_1', 140, 0.6, 1.5, 0.5, 12], ['Flower_4_Group', 90, 0.8, 1.3, 0.8, 14]] }
  };

  // Le Repaire du Kraken (île de pirates au crépuscule) et Le Volcan : décor en modèles 3D de vrais créateurs (Quaternius / Kenney, CC0) rangés dans assets/golf/deco
  //  props : { m: modèle, n: nombre, size: [min, max] (mètres), where: 'rim' (mer autour de l'île) | 'pit' (dans l'eau / la lave près des sauts) | 'land' (sur la terre) | 'sky' (vole) | 'hover' (flotte près des pistes),
  //            clip: expression qui choisit l'animation, ships: bascule sur les vagues }
  THEMES.kraken = { sky: 'kraken', expo: 0.74, terrainTint: 0x9aa4ac, ground: 'wet', rock: 'roche.jpg', hills: 1.4, island: true, gapDepth: -1.2, turf: ['#2c6d68', '#27635e'], bump: 0xd9a441, post: 'bollard', particles: null, sunCol: 0xffc9a0, sunI: 1.6, tint: { Leaves: 0x7fb070, Rocks: 0xb7b2b0 },
    liquid: { deep: 0x0b2a3a, shallow: 0x1d5f70, sky: 0x8d86b0 },
    decor: [['Rock_Medium_1', 40, 0.8, 2.2, 2, 34], ['Rock_Medium_2', 40, 0.8, 2.2, 2, 34], ['Rock_Medium_3', 40, 0.8, 2.2, 2, 34], ['DeadTree_1', 14, 0.8, 1.2, 4, 36], ['DeadTree_3', 14, 0.8, 1.2, 4, 36], ['Plant_7_Big', 70, 0.8, 1.4, 1, 20], ['Fern_1', 80, 0.9, 1.5, 0.8, 16], ['Grass_Wispy_Short', 300, 0.7, 1.2, 0.4, 14], ['Pebble_Round_1', 160, 0.6, 1.5, 0.5, 12], ['Pebble_Round_4', 160, 0.6, 1.5, 0.5, 12]],
    props: [
      { m: 'tentacule', n: 18, size: [11, 17], where: 'rim', clip: 'Idle|Poke|Attack' },
      { m: 'tentacule', n: 10, size: [3.4, 5.2], where: 'pit', clip: 'Idle|Poke|Attack' },
      { m: 'voilier', n: 3, size: [11, 17], where: 'rim', ships: true, far: 1 },
      { m: 'barque', n: 3, size: [6, 9], where: 'rim', ships: true },
      { m: 'epave', n: 4, size: [4, 7], where: 'rim', ships: true },
      { m: 'palmier', n: 34, size: [3.2, 5.2], where: 'land', dist: [2.6, 16] },
      { m: 'canon', n: 10, size: [0.9, 1.1], where: 'land', dist: [1.6, 4] },
      { m: 'caisse', n: 26, size: [0.5, 0.7], where: 'land', dist: [1.5, 5] }
    ] };
  THEMES.volcan = { sky: 'volcan', expo: 0.9, ground: 'basalt', rock: 'roche_volcan.jpg', desertRocks: true, rockColor: 0xc8b4aa, hills: 3.2, peaks: true, gapDepth: -1.2, turf: ['#5a2d24', '#52281f'], cone: true, bump: 0xe5502a, post: 'bollard', particles: 'embers', sunCol: 0xffb98a, sunI: 2.3, tint: { Rocks: 0x5e3a30, Leaves: 0x6a5a40 }, terrainTint: 0xd0c0b8,
    liquid: { lava: true, deep: 0x5a0d02, shallow: 0xd9480f, sky: 0xffa060 },
    decor: [['Rock_Medium_1', 70, 0.9, 3.0, 2, 40], ['Rock_Medium_2', 70, 0.9, 3.0, 2, 40], ['Rock_Medium_3', 70, 0.9, 3.0, 2, 40], ['DeadTree_1', 26, 0.8, 1.3, 4, 40], ['DeadTree_3', 26, 0.8, 1.3, 4, 40], ['DeadTree_5', 20, 0.8, 1.3, 4, 40], ['Pebble_Round_3', 200, 0.6, 1.6, 0.5, 14], ['Pebble_Square_3', 140, 0.6, 1.5, 0.5, 14], ['Grass_Wispy_Short', 120, 0.7, 1.1, 0.4, 12]],
    props: [
      { m: 'dragon', n: 2, size: [6, 8], where: 'sky', clip: 'Fast_Flying', radius: [26, 46] },
      { m: 'crane', n: 8, size: [1.2, 1.8], where: 'hover', clip: 'Flying_Idle' },
      { m: 'demon', n: 5, size: [2, 2.8], where: 'pit', clip: 'Flying_Idle', hover: [1.4, 2.6] },
      { m: 'golem', n: 8, size: [1.8, 2.6], where: 'land', clip: 'Yes', dist: [3, 14] },
      { m: 'dragon', n: 1, size: [5, 6], where: 'land', clip: 'Flying_Idle', dist: [14, 30] }
    ] };

  /* ------------------------------------------------------------------ textures dessinées (gazon, sol, bout des poteaux…) ------------------------------------------------------------------ */
  function turfTextures(cols, seed) {
    var S = 512, c = canvas(S), x = c.getContext('2d'), r = rng(seed), hc = canvas(S), hx = hc.getContext('2d'), i;
    // 1 m de gazon = 2 × 2 carreaux de 50 cm, deux verts qui alternent, fines fibres et léger joint entre les carreaux
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) { x.fillStyle = (a + b) % 2 ? cols[0] : cols[1]; x.fillRect(a * S / 2, b * S / 2, S / 2, S / 2); }
    hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
    for (i = 0; i < 26000; i++) {
      var px = r() * S, py = r() * S, l = 1 + r() * 2.2, an = r() * TAU, lv = r();
      x.strokeStyle = lv < 0.5 ? 'rgba(10,40,12,' + (0.08 + r() * 0.12) + ')' : 'rgba(150,220,120,' + (0.05 + r() * 0.08) + ')';
      x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * l, py + Math.sin(an) * l); x.stroke();
      hx.fillStyle = 'rgba(' + (lv < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.12 + r() * 0.2) + ')'; hx.fillRect(px, py, 1.4, 1.4);
    }
    x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 2; x.strokeRect(1, 1, S / 2 - 2, S / 2 - 2); x.strokeRect(S / 2 + 1, 1, S / 2 - 2, S / 2 - 2); x.strokeRect(1, S / 2 + 1, S / 2 - 2, S / 2 - 2); x.strokeRect(S / 2 + 1, S / 2 + 1, S / 2 - 2, S / 2 - 2);
    hx.strokeStyle = 'rgba(0,0,0,0.5)'; hx.lineWidth = 2; hx.strokeRect(0, 0, S / 2, S / 2); hx.strokeRect(S / 2, S / 2, S / 2, S / 2); hx.strokeRect(S / 2, 0, S / 2, S / 2); hx.strokeRect(0, S / 2, S / 2, S / 2);
    return { map: tex(c), nrm: normalFrom(hc, 2.2) };
  }
  function groundTexture(kind, seed) {
    var S = 512, c = canvas(S), x = c.getContext('2d'), r = rng(seed), i;
    function blot(cols, n, rmin, rmax, a) { for (var k = 0; k < n; k++) { var px = r() * S, py = r() * S, rr = rmin + r() * (rmax - rmin); x.fillStyle = cols[Math.floor(r() * cols.length)]; x.globalAlpha = a; for (var ox = -S; ox <= S; ox += S) for (var oy = -S; oy <= S; oy += S) { x.beginPath(); x.ellipse(px + ox, py + oy, rr, rr * (0.6 + r() * 0.5), r() * TAU, 0, TAU); x.fill(); } } x.globalAlpha = 1; }
    function strokes(cols, n, len, w, a) { x.lineCap = 'round'; for (var k = 0; k < n; k++) { var px = r() * S, py = r() * S, an = -Math.PI / 2 + (r() - 0.5) * 0.9, l = len * (0.5 + r()); x.strokeStyle = cols[Math.floor(r() * cols.length)]; x.globalAlpha = a; x.lineWidth = w * (0.6 + r() * 0.8); for (var ox = -S; ox <= S; ox += S) for (var oy = -S; oy <= S; oy += S) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(an) * l, py + oy + Math.sin(an) * l); x.stroke(); } } x.globalAlpha = 1; }
    if (kind === 'grass' || kind === 'autumn') {
      x.fillStyle = kind === 'grass' ? '#4f8636' : '#6f8a37'; x.fillRect(0, 0, S, S);
      blot(kind === 'grass' ? ['#46793a', '#5f9a42', '#6c9f48', '#3f7032', '#7a9a4a'] : ['#7a8f38', '#8f8a3a', '#5f7d32', '#a08a3c'], 110, 20, 70, 0.4);
      strokes(kind === 'grass' ? ['#3f7a2a', '#80c157', '#5a9a3a', '#99d16a'] : ['#5d7a2c', '#9fae4c', '#b89a45', '#6f8f35'], 5200, 7, 1.6, 0.55);
      if (kind === 'autumn') for (i = 0; i < 260; i++) { var lx = r() * S, ly = r() * S; x.save(); x.translate(lx, ly); x.rotate(r() * TAU); x.fillStyle = ['#d9682a', '#e8a33a', '#b8422a', '#c98a2e'][Math.floor(r() * 4)]; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(0, 0, 5 + r() * 3, 2.5 + r() * 1.5, 0, 0, TAU); x.fill(); x.restore(); }
    } else if (kind === 'desert') {
      x.fillStyle = '#c98f57'; x.fillRect(0, 0, S, S); blot(['#b97d48', '#d9a46a', '#c28650', '#e0b07a'], 120, 14, 60, 0.4);
      x.strokeStyle = 'rgba(110,60,30,0.25)'; x.lineWidth = 1.2; for (i = 0; i < 70; i++) { var cx2 = r() * S, cy2 = r() * S; x.beginPath(); x.moveTo(cx2, cy2); for (var q = 0; q < 5; q++) { cx2 += (r() - 0.5) * 30; cy2 += (r() - 0.5) * 30; x.lineTo(cx2, cy2); } x.stroke(); }
      for (i = 0; i < 4000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(90,50,25,0.25)' : 'rgba(255,230,190,0.25)'; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
    } else if (kind === 'basalt') {
      x.fillStyle = '#3a312d'; x.fillRect(0, 0, S, S); blot(['#2f2724', '#4a3d37', '#3f3430', '#554841'], 130, 14, 60, 0.45);
      x.strokeStyle = 'rgba(255,120,40,0.16)'; x.lineWidth = 1.4; for (i = 0; i < 46; i++) { var bx2 = r() * S, by2 = r() * S; x.beginPath(); x.moveTo(bx2, by2); for (var q2 = 0; q2 < 6; q2++) { bx2 += (r() - 0.5) * 36; by2 += (r() - 0.5) * 36; x.lineTo(bx2, by2); } x.stroke(); }
      for (i = 0; i < 4200; i++) { x.fillStyle = r() < 0.5 ? 'rgba(15,10,8,0.35)' : 'rgba(140,110,95,0.22)'; x.fillRect(r() * S, r() * S, 1.6, 1.6); }
    } else if (kind === 'wet') {
      x.fillStyle = '#6b6a62'; x.fillRect(0, 0, S, S); blot(['#5d5d56', '#7a786d', '#4f5651', '#85826f'], 130, 12, 55, 0.45);
      for (i = 0; i < 3000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(30,40,40,0.3)' : 'rgba(210,205,185,0.3)'; x.beginPath(); x.ellipse(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, TAU); x.fill(); }
    } else if (kind === 'snow') {
      x.fillStyle = '#eef3f9'; x.fillRect(0, 0, S, S); blot(['#dfe8f3', '#f8fbff', '#d5e2f0', '#e9f0f8'], 140, 18, 70, 0.5);
      for (i = 0; i < 1500; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')'; x.fillRect(r() * S, r() * S, 1, 1); }
    } else {                                                     // sable
      x.fillStyle = '#e6cb93'; x.fillRect(0, 0, S, S); blot(['#dcbd83', '#efd8a6', '#d6b47a'], 110, 16, 60, 0.45);
      x.strokeStyle = 'rgba(160,120,70,0.18)'; x.lineWidth = 2; for (i = 0; i < 26; i++) { var yy = r() * S; x.beginPath(); for (var xx = 0; xx <= S; xx += 8) x.lineTo(xx, yy + Math.sin(xx / 30 + i) * 5); x.stroke(); }
      for (i = 0; i < 5000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(140,100,60,0.3)' : 'rgba(255,250,230,0.35)'; x.fillRect(r() * S, r() * S, 1.3, 1.3); }
    }
    return tex(c);
  }
  function endGrain() {                                       // le dessus des poteaux : les cernes du bois
    var S = 128, c = canvas(S), x = c.getContext('2d'), r = rng(7);
    x.fillStyle = '#c98a4a'; x.fillRect(0, 0, S, S);
    for (var k = 14; k > 0; k--) { x.strokeStyle = k % 2 ? 'rgba(120,70,30,0.55)' : 'rgba(230,170,100,0.35)'; x.lineWidth = 2.2; x.beginPath(); for (var a = 0; a <= TAU + 0.01; a += 0.2) { var rr = k * 4.2 + Math.sin(a * 3 + k) * 1.2; x.lineTo(S / 2 + 4 + Math.cos(a) * rr, S / 2 - 3 + Math.sin(a) * rr); } x.stroke(); }
    x.strokeStyle = 'rgba(80,40,15,0.5)'; x.lineWidth = 1.5; for (k = 0; k < 4; k++) { var an = r() * TAU; x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S / 2 + Math.cos(an) * 50, S / 2 + Math.sin(an) * 50); x.stroke(); }
    x.strokeStyle = 'rgba(90,50,20,0.7)'; x.lineWidth = 6; x.strokeRect(3, 3, S - 6, S - 6);
    return tex(c);
  }
  function stripes(c1, c2) { var c = canvas(32, 256), x = c.getContext('2d'); for (var i = 0; i < 8; i++) { x.fillStyle = i % 2 ? c1 : c2; x.fillRect(0, i * 32, 32, 32); } return tex(c); }
  function plaster() {
    var S = 256, c = canvas(S), x = c.getContext('2d'), r = rng(11), i;
    x.fillStyle = '#efe4cf'; x.fillRect(0, 0, S, S);
    for (i = 0; i < 60; i++) { x.fillStyle = 'rgba(' + (180 + r() * 40) + ',' + (165 + r() * 40) + ',' + (140 + r() * 30) + ',0.35)'; x.beginPath(); x.ellipse(r() * S, r() * S, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, TAU); x.fill(); }
    for (i = 0; i < 22; i++) { var sx = r() * S, sy = r() * S, w = 14 + r() * 16, h = 9 + r() * 8; x.fillStyle = 'rgba(150,135,115,0.55)'; x.fillRect(sx, sy, w, h); x.strokeStyle = 'rgba(90,80,70,0.4)'; x.strokeRect(sx, sy, w, h); }
    return tex(c);
  }
  function shingles(col) {
    var S = 256, c = canvas(S), x = c.getContext('2d'), r = rng(5);
    x.fillStyle = col; x.fillRect(0, 0, S, S);
    for (var row = 0; row < 12; row++) for (var k = 0; k < 9; k++) { var ox = (row % 2) * 14 + k * 28; x.fillStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.15) + ')'; x.fillRect(ox, row * 22, 26, 20); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(ox, row * 22, 26, 3); }
    return tex(c);
  }
  function sailCloth() {
    var S = 128, c = canvas(S), x = c.getContext('2d');
    x.fillStyle = '#f3ead6'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(120,90,50,0.6)'; x.lineWidth = 3;
    for (var i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * S / 4, 0); x.lineTo(i * S / 4, S); x.stroke(); x.beginPath(); x.moveTo(0, i * S / 4); x.lineTo(S, i * S / 4); x.stroke(); }
    return tex(c);
  }
  function softDot(col, edge) { var c = canvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 1, 32, 32, 31); g.addColorStop(0, col); g.addColorStop(edge || 0.6, col.replace(/[\d.]+\)$/, '0.5)')); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(0, 0, 64, 64); var t = new THREE.CanvasTexture(c); return t; }
  function leafSprite() { var c = canvas(64), x = c.getContext('2d'); x.translate(32, 32); x.rotate(0.6); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(0, 0, 26, 12, 0, 0, TAU); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-24, 0); x.lineTo(24, 0); x.stroke(); return new THREE.CanvasTexture(c); }

  /* ------------------------------------------------------------------ vent dans le feuillage (sommets déplacés dans le shader) ------------------------------------------------------------------ */
  function windify(mat, amp) {
    if (mat.userData.wind) return mat; mat.userData.wind = amp;
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uWind = WIND;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vec3 wp0 = vec3(0.0);\n#ifdef USE_INSTANCING\n  wp0 = instanceMatrix[3].xyz;\n#endif\n  float wk = max(0.0, position.y) * ' + amp.toFixed(4) + ';\n  transformed.x += sin(uWind * 1.7 + wp0.x * 0.35 + wp0.z * 0.21 + position.y * 0.9) * wk;\n  transformed.z += cos(uWind * 1.33 + wp0.z * 0.31 + position.x * 0.7) * wk * 0.7;');
    };
    mat.customProgramCacheKey = function () { return 'wind' + amp; };
    return mat;
  }

  /* ==================================================================
     CONSTRUCTION D'UNE CARTE
     ================================================================== */
  function build(world, mapId, onProgress, onReady) {
    var TH = THEMES[mapId], course = GS.buildCourse(mapId), low = !!world.low, seed = hashStr(mapId);
    var root = new THREE.Group(), api = { group: root, course: course, holes: [], ready: false, sun: null, theme: TH, hdr: null, env: null, fogCol: new THREE.Color(0xbfd6ea), floorMeshes: [], dyn: [], flags: [], bumpers: [], mills: [], gates: [], slides: [], logs: [], props: [], disposables: [] };
    var need = 6, got = 0, A = {};
    function step(k, v) { A[k] = v; got++; if (onProgress) onProgress(got / need); if (got === need) assemble(); }
    loadNature(function (lib) { step('nat', lib); });
    loadSky(TH.sky, low, function (s) { step('sky', s); });
    loadTex('bois.jpg', true, function (t) { step('bois', t); });
    loadTex('planches.jpg', true, function (t) { step('planches', t); });
    loadTex(TH.rock, true, function (t) { step('rock', t); });
    loadTex('ecorce.jpg', true, function (t) { step('bark', t); });

    function assemble() {
      try { assemble2(); } catch (e) { console.error('golf : décor', e); }
      api.ready = true; if (onReady) onReady(api);
    }
    function assemble2() {
      var renderer = world.renderer, i;
      /* ---------- ciel, lumière d'ambiance, soleil ---------- */
      var sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
      if (A.sky) {
        var pm = new THREE.PMREMGenerator(renderer); pm.compileEquirectangularShader();
        api.env = pm.fromEquirectangular(A.sky.tex).texture; pm.dispose();
        api.hdr = A.sky.tex; sunDir.copy(A.sky.sun);
        var zc = A.sky.zenith; api.zenith = new THREE.Color(Math.min(1, zc[0] * 0.8), Math.min(1, zc[1] * 0.8), Math.min(1, zc[2] * 0.8));
        var hc = A.sky.horizon; api.fogCol = new THREE.Color(Math.min(1, hc[0] * TH.expo), Math.min(1, hc[1] * TH.expo), Math.min(1, hc[2] * TH.expo));
      }
      if (sunDir.y < 0.17) { sunDir.y = 0.17; sunDir.normalize(); }               // soleil couchant : on le remonte un peu pour garder des ombres lisibles
      api.sun = sunDir;
      var sun = new THREE.DirectionalLight(TH.sunCol, TH.sunI * 0.55); sun.position.copy(sunDir).multiplyScalar(60); root.add(sun); root.add(sun.target);
      if (!low) {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); var sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 140; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      }
      api.sunLight = sun;
      root.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a3f, A.sky ? 0.25 : 0.8));

      /* ---------- matériaux ---------- */
      var M = {}, turfT = turfTextures(TH.turf, seed), groundT = groundTexture(TH.ground, seed + 1), sandT = groundTexture('sand', seed + 2);
      turfT.map.repeat.set(1, 1); turfT.nrm.repeat.set(1, 1);
      M.turf = new THREE.MeshStandardMaterial({ map: turfT.map, normalMap: turfT.nrm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, metalness: 0 });
      M.sand = new THREE.MeshStandardMaterial({ map: sandT, roughness: 1, color: 0xf3e2b8 });
      M.ice = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.4 });
      var bois = A.bois ? A.bois.clone() : null; if (bois) { bois.needsUpdate = true; bois.repeat.set(1, 1); }
      M.rail = new THREE.MeshStandardMaterial({ map: bois, color: bois ? 0xffffff : 0xb06a32, roughness: 0.62, metalness: 0 });
      var pl = A.planches ? A.planches.clone() : null; if (pl) { pl.needsUpdate = true; }
      M.fascia = new THREE.MeshStandardMaterial({ map: pl, color: pl ? 0xd8b48c : 0x8a5a33, roughness: 0.85 });
      var pl2 = A.planches ? A.planches.clone() : null; if (pl2) { pl2.needsUpdate = true; }
      M.deck = new THREE.MeshStandardMaterial({ map: pl2, color: pl2 ? 0xf0d2a8 : 0x9a6a3a, roughness: 0.8 });
      M.grain = new THREE.MeshStandardMaterial({ map: endGrain(), roughness: 0.7 });
      M.post = M.rail;
      M.bark = new THREE.MeshStandardMaterial({ map: A.bark, color: A.bark ? 0xffffff : 0x6a4a2a, roughness: 0.95 });
      M.white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35 });
      M.metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.9 });
      M.dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
      M.rock = new THREE.MeshStandardMaterial({ map: A.rock, color: TH.rockColor || (A.rock ? 0xffffff : 0x8a8580), roughness: 0.95 });
      M.plaster = new THREE.MeshStandardMaterial({ map: plaster(), roughness: 0.95 });
      M.roof = new THREE.MeshStandardMaterial({ map: shingles(mapId === 'neige' ? '#5b6b7a' : '#a8432f'), roughness: 0.85 });
      M.cloth = new THREE.MeshStandardMaterial({ map: sailCloth(), side: THREE.DoubleSide, roughness: 0.95 });
      M.iceObj = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, envMapIntensity: 1.6 });
      M.bumper = new THREE.MeshStandardMaterial({ color: TH.bump, roughness: 0.38, metalness: 0.05 });
      M.rubber = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.75 });
      M.rope = new THREE.MeshStandardMaterial({ color: 0xc7a873, roughness: 0.95 });
      M.boulder = new THREE.MeshStandardMaterial({ map: A.rock, color: 0x9a4a38, roughness: 0.95, flatShading: true });
      M.mat = new THREE.MeshStandardMaterial({ color: 0x0f2a17, roughness: 1, envMapIntensity: 0.3 });
      api.M = M;
      Object.keys(M).forEach(function (k) { api.disposables.push(M[k]); });

      /* ---------- les trous ---------- */
      var postGeo = postGeometry(), posts = [];
      course.holes.forEach(function (H, hi) {
        var hg = new THREE.Group(); root.add(hg);
        var o = buildHole(H, hi, hg, M, TH, mapId, posts, A.nat);
        api.holes.push({ H: H, group: hg, turf: o.turf, flag: o.flag, cupY: o.cupY });
        if (o.turf) api.floorMeshes.push(o.turf);
      });
      // tous les poteaux de la carte d'un coup (une seule copie du modèle)
      if (posts.length) {
        var pim = new THREE.InstancedMesh(postGeo, [M.grain, M.post], posts.length), dm = new THREE.Object3D();
        posts.forEach(function (p, k) { dm.position.set(p.x, p.y, p.z); dm.rotation.set(0, -p.a, 0); dm.scale.set(1, p.hs, 1); dm.updateMatrix(); pim.setMatrixAt(k, dm.matrix); });
        pim.castShadow = !low; pim.receiveShadow = !low; root.add(pim);
      }

      /* ---------- le terrain ---------- */
      var terr = buildTerrain(course, TH, mapId, low, seed, groundT, sandT, A.rock);
      root.add(terr.mesh); api.terrain = terr;
      if (terr.water) root.add(terr.water);
      if (terr.far) root.add(terr.far);
      api.water = terr.waterMat;

      /* ---------- la végétation ---------- */
      if (A.nat && Object.keys(A.nat).length) scatter(root, A.nat, TH, terr, course, low, seed, api);

      /* ---------- particules : neige, feuilles, poussière ---------- */
      if (TH.particles) api.particles = makeParticles(TH.particles, low, root);
      if (TH.props) { var names = {}; TH.props.forEach(function (d) { names[d.m] = 1; }); loadDecoSet(Object.keys(names), function () { try { placeProps(root, TH, terr, course, low, seed, api); } catch (e) { console.error('golf : décor 3D', e); } }); }
      root.traverse(function (o) { if (o.isMesh && o !== terr.mesh && !o.userData.noShadow) { o.castShadow = o.castShadow || (!low && !o.isInstancedMesh); o.receiveShadow = !low; } });
      terr.mesh.receiveShadow = !low; terr.mesh.castShadow = false;
    }

    /* ---------- chaque image ---------- */
    api.update = function (dt, t, focus, camPos) {
      WIND.value = t;
      if (!api.ready) return;
      // le soleil suit ce qu'on regarde (ombres nettes autour de la balle), calé sur les texels pour ne pas scintiller
      if (focus && api.sunLight) {
        var s = api.sunLight, k = 34 / 2048, fx = Math.round(focus.x / k) * k, fz = Math.round(focus.z / k) * k;
        s.target.position.set(fx, focus.y, fz); s.position.set(fx + api.sun.x * 60, focus.y + api.sun.y * 60, fz + api.sun.z * 60); s.target.updateMatrixWorld();
      }
      if (api.water) api.water.uniforms.uTime.value = t;
      api.flags.forEach(function (f) { waveFlag(f, t); });
      api.mills.forEach(function (m) { m.arms.rotation.y = -(m.o.speed || 1.4) * t; if (m.sails) m.sails.rotation.z = t * 0.9 * Math.sign(m.o.speed || 1); });
      api.slides.forEach(function (m) { var o = m.o, sv = Math.sin((o.speed || 1.4) * t) * (o.amp || 0.45); m.g.position.set(m.x + Math.cos(o.a) * sv, m.h, m.z + Math.sin(o.a) * sv); });
      api.gates.forEach(function (m) { var op = GS.gateOpen(m.o, t); m.door.position.y = 0.2 + op * 0.5; });
      api.bumpers.forEach(function (b) { if (b.c.flash > 0) { b.c.flash = Math.max(0, b.c.flash - dt * 3); } var s2 = 1 + (b.c.flash || 0) * 0.3; b.m.scale.set(s2, 1, s2); });
      api.logs.forEach(function (e) { updateLogs(e, t); });
      if (api.props.length) updateProps(api.props, dt, t, camPos || focus);
      if (api.particles) api.particles.update(dt, camPos || focus);
    };
    api.dispose = function () {
      root.traverse(function (o) { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
      api.disposables.forEach(function (m) { if (m.map && !m.map.image.src) m.map.dispose(); if (m.dispose) m.dispose(); });
      if (api.env) api.env.dispose();
    };
    return api;

    /* ==================================================================
       UN TROU : gazon, bordures, côtés, boucles, coupe, drapeau, départ, panneau, obstacles
       ================================================================== */
    function buildHole(H, hi, hg, M, TH, mapId, posts, nat) {
      var S = H.S, L = H.L, Rr = H.Rr, n = S.length, i, k;
      var buf = { turf: [], sand: [], ice: [], deck: [], fascia: [], under: [] };
      function quad(arr, a, b, c, d, ua, ub, uc, ud) { arr.push([a, b, c, ua, ub, uc], [a, c, d, ua, uc, ud]); }
      var hasFloor = []; for (i = 1; i < n; i++) hasFloor[i] = !S[i].seg.skip && !S[i].seg.gap;
      for (i = 1; i < n; i++) {
        if (!hasFloor[i]) continue;
        var A0 = S[i - 1], B0 = S[i], sg = B0.seg, aL = L[i - 1], bL = L[i], bR = Rr[i], aR = Rr[i - 1];
        var kind = sg.nw ? 'deck' : sg.zone === 'sand' ? 'sand' : sg.zone === 'ice' ? 'ice' : 'turf';
        var pA = [aL[0], A0.h, aL[1]], pB = [bL[0], B0.h, bL[1]], pC = [bR[0], B0.h, bR[1]], pD = [aR[0], A0.h, aR[1]];
        // gazon : u en travers (0 → largeur), v le long de la piste (les carreaux suivent les virages)
        var vA = A0.s, vB = B0.s;
        if (kind === 'deck') quad(buf.deck, pA, pB, pC, pD, [0, vA * 1.4], [0, vB * 1.4], [1, vB * 1.4], [1, vA * 1.4]);
        else quad(buf[kind], pA, pB, pC, pD, [0, vA], [0, vB], [B0.w, vB], [A0.w, vA]);
        // les côtés : planches sous la bordure (posées un peu à l'extérieur), jusqu'au sol ou, en hauteur, juste une poutre
        if (!sg.nw) {
          [[aL, bL, 1], [aR, bR, -1]].forEach(function (sd) {
            var a = sd[0], b = sd[1], oa = outDir(i - 1, sd[2]), ob = outDir(i, sd[2]), T = 0.088;
            var bot = function (h) { return h > 0.32 ? h - 0.24 : GROUND - 0.12; };
            var qa = [a[0] + oa[0] * T, A0.h - 0.03, a[1] + oa[1] * T], qb = [b[0] + ob[0] * T, B0.h - 0.03, b[1] + ob[1] * T];
            var la = Math.hypot(b[0] - a[0], b[1] - a[1]);
            quad(buf.fascia, qa, qb, [qb[0], bot(B0.h), qb[2]], [qa[0], bot(A0.h), qa[2]], [A0.s * 0.6, 0], [(A0.s + la) * 0.6, 0], [(A0.s + la) * 0.6, (B0.h - 0.03 - bot(B0.h)) * 0.6], [A0.s * 0.6, (A0.h - 0.03 - bot(A0.h)) * 0.6]);
          });
        } else {                                                  // passerelle : poutres de rive
          [[aL, bL, 1], [aR, bR, -1]].forEach(function (sd) {
            var a = sd[0], b = sd[1];
            quad(buf.fascia, [a[0], A0.h + 0.02, a[1]], [b[0], B0.h + 0.02, b[1]], [b[0], B0.h - 0.12, b[1]], [a[0], A0.h - 0.12, a[1]], [0, 0], [1, 0], [1, 0.1], [0, 0.1]);
          });
        }
        // dessous des parties en hauteur
        if (A0.h > 0.32 || B0.h > 0.32 || sg.nw) quad(buf.under, [aR[0], A0.h - (sg.nw ? 0.12 : 0.24), aR[1]], [bR[0], B0.h - (sg.nw ? 0.12 : 0.24), bR[1]], [bL[0], B0.h - (sg.nw ? 0.12 : 0.24), bL[1]], [aL[0], A0.h - (sg.nw ? 0.12 : 0.24), aL[1]], [0, 0], [1, 0], [1, 1], [0, 1]);
        // bouts de piste (avant un saut, après une boucle, départ, arrivée) : on ferme l'épaisseur
        var endA = i === 1 || !hasFloor[i - 1], endB = i === n - 1 || !hasFloor[i + 1];
        if (endA) endFace(aL, aR, A0.h);
        if (endB) endFace(bL, bR, B0.h);
      }
      function endFace(p, q, h) { var bt = h > 0.32 ? h - 0.24 : GROUND - 0.12; quad(buf.fascia, [p[0], h, p[1]], [q[0], h, q[1]], [q[0], bt, q[1]], [p[0], bt, p[1]], [0, 0], [1, 0], [1, 0.3], [0, 0.3]); }
      function outDir(j, sgn) { var dx = (L[j][0] - Rr[j][0]) * sgn, dz = (L[j][1] - Rr[j][1]) * sgn, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
      var turfMesh = null;
      Object.keys(buf).forEach(function (kk) {
        if (!buf[kk].length) return;
        var mat = kk === 'turf' ? M.turf : kk === 'sand' ? M.sand : kk === 'ice' ? M.ice : kk === 'deck' ? M.deck : kk === 'under' ? M.fascia : M.fascia;
        var mesh = new THREE.Mesh(triGeo(buf[kk]), mat); hg.add(mesh);
        if (kk === 'turf' || kk === 'sand' || kk === 'ice' || kk === 'deck') { mesh.userData.floor = true; if (!turfMesh) turfMesh = new THREE.Group(); turfMesh.add(mesh.clone()); }
        if (kk === 'turf') { mesh.receiveShadow = true; }
      });
      // les bordures : on suit chaque côté tant qu'il y a un mur, en un seul « boudin » de bois arrondi
      var runs = [];
      [1, -1].forEach(function (sgn) {
        var cur = null;
        for (i = 1; i < n; i++) {
          var wall = hasFloor[i] && !S[i].seg.nw;
          if (wall) { if (!cur) { cur = { sgn: sgn, idx: [i - 1] }; runs.push(cur); } cur.idx.push(i); } else cur = null;
        }
      });
      runs.forEach(function (run) {
        var P = run.idx.map(function (j) { var e = run.sgn > 0 ? L[j] : Rr[j], od = outDir(j, run.sgn); return { x: e[0], z: e[1], h: S[j].h, ox: od[0], oz: od[1], joint: S[j].joint, s: S[j].s }; });
        hg.add(new THREE.Mesh(railGeo(P), M.rail));
        // poteaux : aux deux bouts, aux jonctions des pièces, et au moins tous les 2,6 m
        var last = -1e9;
        P.forEach(function (p, q) {
          var endp = q === 0 || q === P.length - 1;
          if (endp || (p.joint && p.s - last > 1.4) || p.s - last > 2.6) { addPost(p); last = p.s; }
        });
      });
      // les fonds (départ, arrivée, sortie de boucle) : une bordure en travers
      var caps = [[Rr[0], L[0], S[0].h, 0]], cap2 = [L[n - 1], Rr[n - 1], S[n - 1].h, n - 1];
      caps.push(cap2);
      for (i = 1; i < n; i++) if (S[i].seg.cap) caps.push([Rr[i], L[i], S[i].h, i]);
      caps.forEach(function (c) {
        var a = c[0], b = c[1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, j = c[3];
        // vers l'extérieur du trou : à l'opposé de la piste
        var nb = j === 0 ? 1 : -1, nx2 = S[Math.min(n - 1, Math.max(0, j + nb))].x - S[j].x, nz2 = S[Math.min(n - 1, Math.max(0, j + nb))].z - S[j].z, nl = Math.hypot(nx2, nz2) || 1;
        var ox = -nx2 / nl, oz = -nz2 / nl;
        if (S[j].seg.cap) { ox = -ox; oz = -oz; ox = -(S[Math.min(n - 1, j + 1)].x - S[j].x) / nl; oz = -(S[Math.min(n - 1, j + 1)].z - S[j].z) / nl; }
        var P = [{ x: a[0], z: a[1], h: c[2], ox: ox, oz: oz }, { x: b[0], z: b[1], h: c[2], ox: ox, oz: oz }];
        hg.add(new THREE.Mesh(railGeo(P), M.rail));
      });
      function addPost(p) { posts.push({ x: p.x + p.ox * 0.044, y: p.h - 0.05, z: p.z + p.oz * 0.044, a: Math.atan2(p.oz, p.ox), hs: 1 }); }
      // pilotis sous les parties en hauteur
      var legM = M.post, legGeo = new THREE.BoxGeometry(0.11, 1, 0.11);
      var lastLeg = -9;
      for (i = 0; i < n; i++) {
        var p0 = S[i]; if (p0.h < 0.34 || p0.s - lastLeg < 1.7 || !(hasFloor[i] || hasFloor[i + 1])) continue;
        lastLeg = p0.s;
        [L[i], Rr[i]].forEach(function (e) {
          var top = p0.h - 0.22, bot = p0.seg.nw || (S[i + 1] && S[i + 1].seg.nw) ? GROUND - 6 : GROUND - 0.2, leg = new THREE.Mesh(legGeo, legM);
          leg.scale.y = top - bot; leg.position.set(e[0], (top + bot) / 2, e[1]); hg.add(leg);
        });
      }
      // les boucles
      H.loops.forEach(function (Lp) { buildLoop(Lp, hg, M); });
      // la coupe : trou noir, intérieur dégradé, anneau blanc ; le drapeau qui flotte
      var cupY = H.cupH, c = H.cup;
      var hc = canvas(128), hx = hc.getContext('2d'), gr = hx.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#0b0b0b'); gr.addColorStop(0.92, '#3a3a36'); gr.addColorStop(1, '#6a6a62'); hx.fillStyle = gr; hx.fillRect(0, 0, 128, 128);
      var holeM = new THREE.MeshBasicMaterial({ map: tex(hc), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var hole = new THREE.Mesh(new THREE.CircleGeometry(GS.CUP, 32), holeM); hole.rotation.x = -Math.PI / 2; hole.position.set(c[0], cupY + 0.002, c[1]); hole.userData.noShadow = true; hg.add(hole);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(GS.CUP + 0.004, 0.009, 8, 40), M.white); rim.rotation.x = Math.PI / 2; rim.position.set(c[0], cupY + 0.004, c[1]); hg.add(rim);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 10), new THREE.MeshStandardMaterial({ map: stripes('#f4f4f4', '#d63a2e'), roughness: 0.4 })); pole.position.set(c[0], cupY + 0.62, c[1]); hg.add(pole);
      var fc = canvas(256, 160), fx = fc.getContext('2d'); fx.fillStyle = TH.bump === 0xffc23d ? '#e8392f' : '#ffd23f'; fx.fillRect(0, 0, 256, 160); fx.fillStyle = 'rgba(0,0,0,0.12)'; fx.fillRect(0, 140, 256, 20);
      fx.fillStyle = '#1a1208'; fx.font = '900 108px Georgia, serif'; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.fillText(String(hi + 1), 128, 82);
      var flagGeo = new THREE.PlaneGeometry(0.42, 0.27, 10, 4); flagGeo.translate(0.21, 0, 0);
      var flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex(fc), side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(c[0] + 0.012, cupY + 1.1, c[1]);
      flag.userData.base = flagGeo.attributes.position.array.slice(0); flag.userData.ph = hi; hg.add(flag); api.flags.push(flag);
      // le départ : un tapis de caoutchouc et deux plots
      var tee = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.5), M.mat); tee.position.set(H.tee[0], H.teeH + 0.004, H.tee[1]); tee.rotation.y = -H.teeYaw; hg.add(tee);
      [-1, 1].forEach(function (sd) { var mk = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); var rx = Math.cos(H.teeYaw), rz = Math.sin(H.teeYaw); mk.position.set(H.tee[0] + rx * sd * 0.32, H.teeH + 0.03, H.tee[1] + rz * sd * 0.32); hg.add(mk); });
      // panneau en bois du trou
      var d0x = Math.sin(H.teeYaw), d0z = -Math.cos(H.teeYaw), rx0 = Math.cos(H.teeYaw), rz0 = Math.sin(H.teeYaw), side = -(S[0].w / 2 + 1.25);
      var sx = S[0].x + rx0 * side + d0x * 2.2, sz = S[0].z + rz0 * side + d0z * 2.2;
      var sc = canvas(512, 320), sx2 = sc.getContext('2d'); sx2.fillStyle = '#8a5a2e'; sx2.fillRect(0, 0, 512, 320);
      for (k = 0; k < 6; k++) { sx2.fillStyle = k % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; sx2.fillRect(0, k * 54, 512, 54); sx2.fillStyle = 'rgba(40,20,5,0.4)'; sx2.fillRect(0, k * 54, 512, 3); }
      sx2.strokeStyle = '#4a2d12'; sx2.lineWidth = 14; sx2.strokeRect(7, 7, 498, 306);
      sx2.textAlign = 'center'; sx2.textBaseline = 'middle'; sx2.fillStyle = '#fff4dc'; sx2.shadowColor = 'rgba(0,0,0,0.5)'; sx2.shadowBlur = 6;
      sx2.font = '900 84px Georgia, serif'; sx2.fillText('TROU ' + (hi + 1), 256, 92); sx2.font = '700 44px Georgia, serif'; sx2.fillText(H.name, 256, 178, 470); sx2.fillStyle = '#ffd36b'; sx2.font = '800 46px Georgia, serif'; sx2.fillText('PAR ' + H.par, 256, 254);
      var sign = new THREE.Group(); sign.position.set(sx, 0, sz); sign.rotation.y = -H.teeYaw; hg.add(sign);
      var board = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.05), [M.rail, M.rail, M.rail, M.rail, new THREE.MeshStandardMaterial({ map: tex(sc), roughness: 0.8 }), M.rail]); board.position.y = 0.95; sign.add(board);
      [-0.3, 0.3].forEach(function (lx) { var lg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), M.rail); lg.position.set(lx, 0.45 + GROUND, -0.01); sign.add(lg); });
      // les obstacles
      H.circles.forEach(function (cc) {
        var o = cc.o, g2 = new THREE.Group(); g2.position.set(cc.x, cc.h, cc.z); hg.add(g2);
        if (o.t === 'bump') {
          var body = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(cc.r, 0), new THREE.Vector2(cc.r * 1.02, 0.05), new THREE.Vector2(cc.r * 0.96, 0.17), new THREE.Vector2(cc.r * 0.7, 0.21), new THREE.Vector2(0, 0.22)], 28), M.bumper);
          g2.add(body); var band = new THREE.Mesh(new THREE.TorusGeometry(cc.r * 1.01, 0.022, 8, 28), M.white); band.rotation.x = Math.PI / 2; band.position.y = 0.09; g2.add(band);
          var cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.metal); cap.position.y = 0.22; g2.add(cap);
          api.bumpers.push({ c: cc, m: g2 });
        } else if (o.t === 'rock' && nat && nat.Rock_Medium_2) {
          var rk = modelMesh(nat['Rock_Medium_' + (1 + (hi + Math.round(cc.x * 7)) % 3)], TH.desertRocks ? M.rock : null);
          var bb = nat.Rock_Medium_2.box, w0 = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), ks = cc.r * 2.3 / w0; rk.scale.set(ks, ks * 1.1, ks); rk.rotation.y = cc.x * 3; rk.position.y = -0.04; g2.add(rk);
        } else {
          var pm = TH.post === 'ice' ? M.iceObj : TH.post === 'stump' ? M.bark : TH.post === 'bollard' ? M.rail : M.rail;
          var pg = new THREE.Mesh(new THREE.CylinderGeometry(cc.r, cc.r * 1.05, 0.36, 18), [pm, M.grain, M.grain]); pg.position.y = 0.18; g2.add(pg);
          if (TH.post === 'bollard') { var rp = new THREE.Mesh(new THREE.TorusGeometry(cc.r * 1.03, 0.016, 6, 20), M.rope); rp.rotation.x = Math.PI / 2; rp.position.y = 0.26; g2.add(rp); }
        }
      });
      H.obs.forEach(function (o) {
        if (o.t !== 'block') return;
        var g3 = new THREE.Group(); g3.position.set(o.x, o.h, o.z); g3.rotation.y = -o.a; hg.add(g3);
        if (o.log) { var lg2 = new THREE.Mesh(new THREE.CylinderGeometry(o.bh / 2 + 0.02, o.bh / 2 + 0.03, o.bw, 16), [M.bark, M.grain, M.grain]); lg2.rotation.z = Math.PI / 2; lg2.position.y = o.bh / 2; g3.add(lg2); }
        else { var bx = new THREE.Mesh(new THREE.BoxGeometry(o.bw, o.bh || 0.24, o.bd), M.fascia); bx.position.y = (o.bh || 0.24) / 2; g3.add(bx); var tp = new THREE.Mesh(new THREE.BoxGeometry(o.bw + 0.02, 0.03, o.bd + 0.02), M.rail); tp.position.y = (o.bh || 0.24); g3.add(tp); }
      });
      H.dyn.forEach(function (d) {
        var o = d.o;
        if (o.t === 'mill' || o.t === 'spinner') {
          var arms = new THREE.Group(); arms.position.set(d.x, d.h, d.z); hg.add(arms);
          var nA = o.n || (o.t === 'spinner' ? 2 : 4), len = o.len || 0.7;
          var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 14), M.rail); hub.position.y = 0.15; arms.add(hub);
          var hcap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8, 0, TAU, 0, Math.PI / 2), M.metal); hcap.position.y = 0.3; arms.add(hcap);
          for (k = 0; k < nA; k++) { var arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.13, 0.05), M.rail); arm.position.set(len / 2, 0.1, 0); var pv = new THREE.Group(); pv.rotation.y = -k * TAU / nA; pv.add(arm); arms.add(pv); }
          var entry = { o: o, arms: arms };
          if (o.house) entry.sails = windmillHouse(d, hg, M);
          api.mills.push(entry);
        } else if (o.t === 'slide') {
          var crate = new THREE.Group(); hg.add(crate); crate.rotation.y = -o.a;
          var cb = new THREE.Mesh(new THREE.BoxGeometry(o.bw || 0.42, 0.24, o.bd || 0.32), M.fascia); cb.position.y = 0.12; crate.add(cb);
          [-1, 1].forEach(function (sd) { var fr = new THREE.Mesh(new THREE.BoxGeometry((o.bw || 0.42) + 0.02, 0.04, 0.04), M.rail); fr.position.set(0, 0.12 + sd * 0.1, ((o.bd || 0.32) / 2 + 0.005)); crate.add(fr); var fr2 = fr.clone(); fr2.position.z = -fr.position.z; crate.add(fr2); });
          api.slides.push({ o: o, g: crate, x: d.x, z: d.z, h: d.h });
        } else if (o.t === 'logs') {
          var meshes = [], rock = mapId === 'volcan', bwL = o.bw || 0.6, bdL = o.bd || 0.3;
          for (k = 0; k < (o.n || 2); k++) {
            var lg = new THREE.Group(), body;
            if (rock) { body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), M.boulder); body.scale.set(bwL, (o.bh || 0.3) * 1.05, bdL * 1.15); body.rotation.y = k * 1.7; body.userData.spin = 1; }
            else {
              var rr = (o.bh || 0.3) / 2, prof = []; for (var pi = 0; pi <= 10; pi++) { var u = pi / 10 - 0.5; prof.push(new THREE.Vector2(rr * (1 - 0.14 * 4 * u * u * 1.0), u * bwL)); }
              var bg = new THREE.LatheGeometry(prof, 20); bg.rotateZ(Math.PI / 2); body = new THREE.Mesh(bg, M.rail);
              [-0.3, 0.3].forEach(function (bx) { var band = new THREE.Mesh(new THREE.TorusGeometry(rr * 1.0, 0.012, 6, 20), M.metal); band.rotation.y = Math.PI / 2; band.position.x = bx * bwL * 1.2; body.add(band); });
              body.userData.spin = 1;
            }
            body.position.y = (o.bh || 0.3) / 2; lg.add(body); lg.rotation.y = -o.a; hg.add(lg); meshes.push({ g: lg, body: body, r: (o.bh || 0.3) / 2 });
          }
          api.logs.push({ H: H, d: d, o: o, meshes: meshes, tmp: [] });
        } else if (o.t === 'gate') {
          var gg = new THREE.Group(); gg.position.set(d.x, d.h, d.z); gg.rotation.y = -o.a; hg.add(gg);
          var hw = (o.w0 || 1.4) / 2 + 0.14;
          var pm2 = mapId === 'canyon' || mapId === 'neige' ? M.rock : M.plaster;
          [-1, 1].forEach(function (sd) { var pil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.05, 0.26), pm2); pil.position.set(sd * hw, 0.5, 0); gg.add(pil); var ca = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.32), M.rail); ca.position.set(sd * hw, 1.05, 0); gg.add(ca); });
          var lint = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.3, 0.14, 0.3), M.rail); lint.position.y = 1.12; gg.add(lint);
          var door = new THREE.Group(); gg.add(door);
          var dw = hw * 2 - 0.22;
          for (k = 0; k < 7; k++) { var bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), M.metal); bar.position.set(-dw / 2 + (k + 0.5) * dw / 7, 0, 0); door.add(bar); }
          [-0.16, 0.16].forEach(function (y2) { var cr = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.05, 0.05), M.rail); cr.position.y = y2; door.add(cr); });
          api.gates.push({ o: o, door: door });
        }
      });
      return { turf: turfMesh, flag: flag, cupY: cupY };
    }
    function windmillHouse(d, hg, M) {
      var o = d.o, rx = Math.cos(o.a), rz = Math.sin(o.a), off = (o.w0 || 1.4) / 2 + 1.5;
      var g = new THREE.Group(); g.position.set(d.x + rx * off, GROUND, d.z + rz * off); g.rotation.y = -o.a + Math.PI / 2; hg.add(g);
      var body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 2.6, 16), M.plaster); body.position.y = 1.3; g.add(body);
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.1, 16), M.rail); band.position.y = 2.55; g.add(band);
      var roof = new THREE.Mesh(new THREE.ConeGeometry(0.84, 1.0, 16), M.roof); roof.position.y = 3.1; g.add(roof);
      var door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.06), M.rail); door.position.set(0, 0.35, 0.78); g.add(door);
      var win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.05), M.dark); win.position.set(0, 1.7, 0.66); g.add(win);
      var sails = new THREE.Group(); sails.position.set(0, 2.2, 0.82); g.add(sails);
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 12), M.rail); hub.rotation.x = Math.PI / 2; sails.add(hub);
      for (var k = 0; k < 4; k++) {
        var arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; sails.add(arm);
        var spar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.05), M.rail); spar.position.y = 0.9; arm.add(spar);
        var cl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.3), M.cloth); cl.position.set(0.24, 1.05, 0.01); arm.add(cl);
      }
      return sails;
    }
    function buildLoop(Lp, hg, M) {
      // la surface intérieure : un anneau de rayon r + R autour du centre (même trajet que la balle sur le serveur)
      var N = 72, rr = Lp.r + R + 0.004, cy = Lp.h + R + Lp.r, W = GS.LOOP_W, pos = [], uv = [], idx = [], pos2 = [], idx2 = [], k;
      for (k = 0; k <= N; k++) {
        var th = k / N * TAU, f = Math.max(0, Math.min(1, (th - Math.PI) / Math.PI));
        var cx = Lp.x + Lp.sx * Lp.shift * f, cz = Lp.z + Lp.sz * Lp.shift * f;
        var px = Math.sin(th) * rr, py = -Math.cos(th) * rr, px2 = Math.sin(th) * (rr + 0.05), py2 = -Math.cos(th) * (rr + 0.05);
        [-1, 1].forEach(function (sd) {
          pos.push(cx + Lp.dx * px + Lp.sx * sd * W / 2, cy + py, cz + Lp.dz * px + Lp.sz * sd * W / 2); uv.push((sd + 1) / 2 * W, th * rr);
          pos2.push(cx + Lp.dx * px2 + Lp.sx * sd * (W / 2 + 0.07), cy + py2, cz + Lp.dz * px2 + Lp.sz * sd * (W / 2 + 0.07));
        });
        if (k < N) { var a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); idx2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      var g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g1.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g1.setIndex(idx); g1.computeVertexNormals();
      var turf2 = M.turf.clone(); turf2.side = THREE.DoubleSide; api.disposables.push(turf2);   // pleine des deux côtés : on ne voit plus à travers la boucle
      var m1 = new THREE.Mesh(g1, turf2); hg.add(m1);
      var g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.setIndex(idx2); g2.computeVertexNormals();
      var fas2 = M.fascia.clone(); fas2.side = THREE.DoubleSide; api.disposables.push(fas2); hg.add(new THREE.Mesh(g2, fas2));
      // les bords de la boucle (petits murs de bois de chaque côté)
      [-1, 1].forEach(function (sd) {
        var P = [];
        for (k = 0; k <= N; k++) {
          var th = k / N * TAU, f = Math.max(0, Math.min(1, (th - Math.PI) / Math.PI)), cx = Lp.x + Lp.sx * Lp.shift * f, cz = Lp.z + Lp.sz * Lp.shift * f;
          P.push({ th: th, cx: cx, cz: cz });
        }
        var gp = [], gi = [], prof = [[0, 0.02], [0, -0.11], [0.05, -0.12], [0.05, 0.04]];
        P.forEach(function (p, q) {
          prof.forEach(function (pr) {
            var lat = sd * (W / 2 + pr[0]), r2 = rr + pr[1];
            gp.push(p.cx + Lp.dx * Math.sin(p.th) * r2 + Lp.sx * lat, cy - Math.cos(p.th) * r2, p.cz + Lp.dz * Math.sin(p.th) * r2 + Lp.sz * lat);
          });
          if (q < P.length - 1) for (var e = 0; e < 3; e++) { var a = q * 4 + e; gi.push(a, a + 4, a + 1, a + 1, a + 4, a + 5); }
        });
        var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setIndex(gi); gg.computeVertexNormals();
        var mm = new THREE.Mesh(gg, M.rail); mm.material = new THREE.MeshStandardMaterial({ color: 0xb8743a, roughness: 0.6, side: THREE.DoubleSide }); hg.add(mm); api.disposables.push(mm.material);
      });
      // deux pieds en bois qui tiennent la boucle
      [-1, 1].forEach(function (sd) {
        var cx = Lp.x + Lp.sx * Lp.shift * 0.5 + Lp.sx * sd * (W / 2 + 0.16 + (sd > 0 ? Lp.shift * 0.5 : 0)), cz = Lp.z + Lp.sz * Lp.shift * 0.5 + Lp.sz * sd * (W / 2 + 0.16 + (sd > 0 ? Lp.shift * 0.5 : 0));
        var h = cy - GROUND, leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), M.rail); leg.position.set(cx, GROUND + h / 2, cz); hg.add(leg);
        var ax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.abs(sd * (W / 2 + 0.16)) + 0.2, 8), M.metal); ax.rotation.z = Math.PI / 2; ax.rotation.y = -Math.atan2(Lp.sz, Lp.sx); ax.position.set((cx + Lp.x + Lp.sx * Lp.shift * 0.5) / 2, cy, (cz + Lp.z + Lp.sz * Lp.shift * 0.5) / 2); hg.add(ax);
      });
    }
  }

  /* ------------------------------------------------------------------ géométries ------------------------------------------------------------------ */
  function triGeo(tris) {
    var pos = new Float32Array(tris.length * 9), uv = new Float32Array(tris.length * 6);
    tris.forEach(function (t, k) { for (var v = 0; v < 3; v++) { pos[k * 9 + v * 3] = t[v][0]; pos[k * 9 + v * 3 + 1] = t[v][1]; pos[k * 9 + v * 3 + 2] = t[v][2]; uv[k * 6 + v * 2] = t[3 + v][0]; uv[k * 6 + v * 2 + 1] = t[3 + v][1]; } });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // la normale doit regarder vers le haut / l'extérieur : on retourne les triangles qui regardent en bas (sols)
    var nrm = g.attributes.normal.array, flip = false;
    for (var i = 0; i < tris.length; i++) { var ny = nrm[i * 9 + 1]; if (Math.abs(ny) > 0.5 && ny < 0) { flip = true; break; } }
    if (flip) {
      for (i = 0; i < tris.length; i++) { var ny2 = nrm[i * 9 + 1]; if (ny2 < -0.5) { for (var c2 = 0; c2 < 3; c2++) { var t0 = pos[i * 9 + 3 + c2]; pos[i * 9 + 3 + c2] = pos[i * 9 + 6 + c2]; pos[i * 9 + 6 + c2] = t0; } var u0 = uv[i * 6 + 2], u1 = uv[i * 6 + 3]; uv[i * 6 + 2] = uv[i * 6 + 4]; uv[i * 6 + 3] = uv[i * 6 + 5]; uv[i * 6 + 4] = u0; uv[i * 6 + 5] = u1; } }
      g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    }
    return g;
  }
  // la bordure : un profil arrondi (8 points) tiré le long du côté de la piste ; o = vers l'extérieur
  function railGeo(P) {
    var T = 0.088, Hh = WALL_H, prof = [[0, -0.05], [0, Hh - 0.03], [0.009, Hh - 0.009], [0.03, Hh], [T - 0.03, Hh], [T - 0.009, Hh - 0.009], [T, Hh - 0.03], [T, -0.05]];
    var NP = prof.length, pos = [], uv = [], idx = [], acc = 0, pl = [0];
    for (var k = 1; k < NP; k++) pl.push(pl[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
    P.forEach(function (p, q) {
      if (q) acc += Math.hypot(p.x - P[q - 1].x, p.z - P[q - 1].z);
      prof.forEach(function (pr, k2) { pos.push(p.x + p.ox * pr[0], p.h + pr[1], p.z + p.oz * pr[0]); uv.push(acc * 0.8, pl[k2] * 2.2); });
      if (q < P.length - 1) for (var e = 0; e < NP - 1; e++) { var a = q * NP + e, b = a + NP; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // sens des faces : on vérifie que la face du dessus regarde vers le haut
    var n = g.attributes.normal.array; if (n[4 * 3 + 1] < 0) { for (var i = 0; i < idx.length; i += 3) { var t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  // un poteau chanfreiné (dessus en bois de bout, côtés en bois) : groupe 0 = dessus/dessous, groupe 1 = côtés
  function postGeometry() {
    var s = 0.085, r = 0.025, sh = new THREE.Shape();
    sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
    var g = new THREE.ExtrudeGeometry(sh, { depth: WALL_H + 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 3 });
    g.rotateX(-Math.PI / 2);
    // les UV du dessus : on recadre sur la texture des cernes
    var uv = g.attributes.uv.array; for (var i = 0; i < uv.length; i += 2) { uv[i] = uv[i] * 4 + 0.5; uv[i + 1] = uv[i + 1] * 4 + 0.5; }
    return g;
  }
  function modelMesh(m, matOverride) {
    var g = new THREE.Group();
    m.parts.forEach(function (p) { g.add(new THREE.Mesh(p.geo, matOverride || p.mat)); });
    return g;
  }
  function waveFlag(f, t) {
    var pa = f.geometry.attributes.position, base = f.userData.base, ph = f.userData.ph;
    for (var i = 0; i < pa.count; i++) { var x = base[i * 3], y = base[i * 3 + 1]; pa.array[i * 3 + 2] = Math.sin(x * 14 - t * 5 + ph) * 0.03 * (x / 0.42) + Math.sin(y * 9 + t * 3) * 0.006 * (x / 0.42); }
    pa.needsUpdate = true; f.geometry.computeVertexNormals();
  }

  /* ==================================================================
     LE TERRAIN : une grande grille dont la hauteur dépend de la distance aux pistes
     ================================================================== */
  function buildTerrain(course, TH, mapId, low, seed, groundT, sandT, rockT) {
    var M0 = TH.island ? 70 : 55, box = course.box, x0 = box[0] - M0, z0 = box[1] - M0, x1 = box[2] + M0, z1 = box[3] + M0;
    var res = low ? 1.0 : 0.5, nx = Math.ceil((x1 - x0) / res) + 1, nz = Math.ceil((z1 - z0) / res) + 1, N = nx * nz;
    var track = new Uint8Array(N), gap = new Uint8Array(N), gapDeep = new Uint8Array(N), i, j, k;
    function cell(x, z) { return [Math.round((x - x0) / res), Math.round((z - z0) / res)]; }
    function stampPoly(poly, arr, v) {
      var xs = poly.map(function (p) { return p[0]; }), zs = poly.map(function (p) { return p[1]; }), a = cell(Math.min.apply(0, xs), Math.min.apply(0, zs)), b = cell(Math.max.apply(0, xs), Math.max.apply(0, zs));
      for (var jj = Math.max(0, a[1] - 1); jj <= Math.min(nz - 1, b[1] + 1); jj++) for (var ii = Math.max(0, a[0] - 1); ii <= Math.min(nx - 1, b[0] + 1); ii++) if (GS.inPoly(poly, x0 + ii * res, z0 + jj * res)) arr[jj * nx + ii] = v;
    }
    course.holes.forEach(function (H) {
      H.floors.forEach(function (f) { stampPoly(f.poly, track, 1); });
      H.gaps.forEach(function (g) { stampPoly(g.poly, gap, 1); if (!g.side) stampPoly(g.poly, gapDeep, 1); });
      H.loops.forEach(function (Lp) { var c = cell(Lp.x, Lp.z); if (c[0] >= 0 && c[0] < nx && c[1] >= 0 && c[1] < nz) track[c[1] * nx + c[0]] = 1; });
    });
    // les cases de piste qui sont sur une passerelle sans bordure : on creuse aussi dessous
    for (k = 0; k < N; k++) if (track[k] && gap[k]) track[k] = 2;
    function dist(src, pred) {                                            // distance (en cases) à la case la plus proche qui vérifie pred
      var d = new Float32Array(N), BIG = 1e6;
      for (k = 0; k < N; k++) d[k] = pred(src[k]) ? 0 : BIG;
      var D1 = 1, D2 = 1.414;
      for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) { k = j * nx + i; var v = d[k]; if (i) v = Math.min(v, d[k - 1] + D1); if (j) { v = Math.min(v, d[k - nx] + D1); if (i) v = Math.min(v, d[k - nx - 1] + D2); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D2); } d[k] = v; }
      for (j = nz - 1; j >= 0; j--) for (i = nx - 1; i >= 0; i--) { k = j * nx + i; var w = d[k]; if (i < nx - 1) w = Math.min(w, d[k + 1] + D1); if (j < nz - 1) { w = Math.min(w, d[k + nx] + D1); if (i < nx - 1) w = Math.min(w, d[k + nx + 1] + D2); if (i) w = Math.min(w, d[k + nx - 1] + D2); } d[k] = w; }
      for (k = 0; k < N; k++) d[k] *= res;
      return d;
    }
    var dT = dist(track, function (v) { return v === 1; }), dG = dist(gap, function (v) { return v > 0; });
    var noise = makeNoise(seed), noise2 = makeNoise(seed + 9), hgt = new Float32Array(N);
    var cxm = (box[0] + box[2]) / 2, czm = (box[1] + box[3]) / 2, rIsl = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 10;
    var deep = TH.gapDepth;
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      k = j * nx + i; var x = x0 + i * res, z = z0 + j * res, h, far = smooth(1.4, 9, dT[k]);
      var n1 = noise(x * 0.035, z * 0.035, 4), n2 = noise2(x * 0.12, z * 0.12, 3);
      if (TH.mesa) {                                                         // plateaux de roche en terrasses
        var m = noise(x * 0.02, z * 0.02, 3), lv = Math.floor(m * 6) / 6, fr2 = m * 6 - Math.floor(m * 6);
        h = (Math.max(0, lv - 0.33) * 22 + smooth(0.82, 0.96, fr2) * 3.6 * (lv > 0.2 ? 1 : 0)) * smooth(6, 22, dT[k]) + (n2 - 0.5) * 0.5 * far;
      } else if (TH.peaks) {
        h = Math.pow(n1, 1.6) * TH.hills * 2.2 * smooth(4, 26, dT[k]) + n2 * 0.6 * far + Math.max(0, dT[k] - 30) * 0.18 * n1;
      } else {
        h = (n1 - 0.38) * TH.hills * 2 * far + (n2 - 0.5) * 0.35 * far;
      }
      if (TH.island) { var rd = Math.hypot(x - cxm, z - czm) - rIsl; h = Math.max(h, 0) * (1 - smooth(0, 14, rd)) - smooth(4, 26, rd) * 2.6 + smooth(-6, 6, rd) * 0; }
      h = GROUND - 0.03 + (TH.island ? h : Math.max(h, -0.05));
      if (TH.liquid && TH.liquid.lava) {                                   // lacs de lave loin des pistes et un grand volcan au bord de la carte
        var lk = smooth(0.6, 0.7, noise2(x * 0.03 + 11, z * 0.03 + 5, 2)) * smooth(7, 12, dT[k]); h = h + (-1.3 - h) * lk;
        var cdx = x - (box[2] + 26), cdz = z - czm, cdd = Math.hypot(cdx, cdz);
        if (TH.cone) { h += 46 * Math.pow(Math.max(0, 1 - cdd / 62), 1.6) * (1 - lk) * smooth(16, 36, dT[k]) - 9 * smooth(9, 0, cdd) * (cdd < 9 ? 1 : 0); }
      }
      // pistes : sol bien plat juste dessous
      if (dT[k] < 1.2 && !TH.island) h = Math.min(h, GROUND - 0.03 + dT[k] * 0.08);
      if (TH.island && dT[k] < 1.6) h = Math.max(GROUND - 0.06, Math.min(h, GROUND - 0.03));
      // sous les sauts et les passerelles : un étang ou un ravin (pas sous la piste elle-même)
      if (track[k] !== 1 && dG[k] < 2.2) { var c2 = gap[k] ? 1 : 1 - smooth(0.0, 2.2, dG[k]); h = h + (deep - h) * c2 * (dT[k] < 0.4 ? 0.2 : 1); }
      hgt[k] = h;
    }
    // la grille
    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), idx = [];
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) { k = j * nx + i; pos[k * 3] = x0 + i * res; pos[k * 3 + 1] = hgt[k]; pos[k * 3 + 2] = z0 + j * res; var ao = Math.max(0.55, Math.min(1, 1 + (hgt[k] - GROUND) * 0.12)); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao; }
    for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++) { k = j * nx + i; idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(N > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); g.computeVertexNormals();
    var mat = terrainMaterial(groundT, rockT, sandT, TH);
    var mesh = new THREE.Mesh(g, mat);
    var out = { mesh: mesh, height: function (x, z) { var ii = Math.round((x - x0) / res), jj = Math.round((z - z0) / res); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return -9; return hgt[jj * nx + ii]; }, dTrack: function (x, z) { var ii = Math.round((x - x0) / res), jj = Math.round((z - z0) / res); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return 99; return dT[jj * nx + ii]; }, dGap: function (x, z) { var ii = Math.round((x - x0) / res), jj = Math.round((z - z0) / res); if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return 99; return dG[jj * nx + ii]; }, x0: x0, z0: z0, x1: x1, z1: z1 };
    // l'eau (cartes avec étangs et l'île) ; le lointain : un grand sol qui file jusqu'à l'horizon
    if (GS.MAPS[mapId].water) { var W2 = waterMesh(TH, x0, z0, x1, z1, !!TH.island); out.water = W2.mesh; out.waterMat = W2.mat; }
    if (!TH.island) {
      var ft = groundT.clone(); ft.needsUpdate = true; ft.repeat.set(160, 160);
      var far = new THREE.Mesh(new THREE.RingGeometry(Math.max(x1 - x0, z1 - z0) * 0.55, 900, 64, 1), new THREE.MeshStandardMaterial({ map: ft, roughness: 1, color: 0xdddddd }));
      far.rotation.x = -Math.PI / 2; far.position.set(cxm, GROUND - 0.6 + (TH.mesa ? 1.5 : TH.peaks ? 2 : 0.3), czm); far.userData.noShadow = true; out.far = far;
    }
    return out;
  }
  function terrainMaterial(groundT, rockT, sandT, TH) {
    var mat = new THREE.MeshStandardMaterial({ color: TH.terrainTint || 0xffffff, roughness: 0.97, metalness: 0, vertexColors: true });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.tGround = { value: groundT }; sh.uniforms.tRock = { value: rockT || groundT }; sh.uniforms.tSand = { value: sandT };
      sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = 'uniform sampler2D tGround;\nuniform sampler2D tRock;\nuniform sampler2D tSand;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n' +
        '  vec3 gC = sRGBToLinear(texture2D(tGround, vWPos.xz * 0.16)).rgb * 0.6 + sRGBToLinear(texture2D(tGround, vWPos.xz * 0.037 + 0.31)).rgb * 0.4;\n' +
        '  vec3 an = abs(vWNrm);\n' +
        '  vec3 rC = sRGBToLinear(texture2D(tRock, vWPos.zy * 0.11)).rgb * an.x + sRGBToLinear(texture2D(tRock, vWPos.xy * 0.11)).rgb * an.z + sRGBToLinear(texture2D(tRock, vWPos.xz * 0.11)).rgb * an.y;\n' +
        '  rC /= max(0.001, an.x + an.y + an.z);\n' +
        '  vec3 sC = sRGBToLinear(texture2D(tSand, vWPos.xz * 0.2)).rgb;\n' +
        '  float rk = smoothstep(0.86, 0.62, vWNrm.y);\n' +
        '  float sd = ' + (TH.island ? 'smoothstep(0.55, -0.2, vWPos.y)' : (TH.ground === 'grass' || TH.ground === 'autumn' ? 'smoothstep(-0.32, -0.6, vWPos.y) * 0.9' : '0.0')) + ';\n' +
        '  vec3 base = mix(mix(gC, sC, sd), rC, rk);\n' +
        '  diffuseColor.rgb *= base;\n');
    };
    mat.customProgramCacheKey = function () { return 'terrain-' + (TH.island ? 'i' : TH.ground); };
    return mat;
  }
  function waterMesh(TH, x0, z0, x1, z1, sea) {
    var size = sea ? 1800 : Math.max(x1 - x0, z1 - z0) + 40, geo = new THREE.PlaneGeometry(size, size, 1, 1); geo.rotateX(-Math.PI / 2);
    var mat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 0.7, 0.3) }, uDeep: { value: new THREE.Color(TH.liquid ? TH.liquid.deep : sea ? 0x0a3d55 : 0x123a44) }, uShallow: { value: new THREE.Color(TH.liquid ? TH.liquid.shallow : sea ? 0x1f7f96 : 0x24606a) }, uSky: { value: new THREE.Color(TH.liquid ? TH.liquid.sky : 0x9fc6e8) }, uSunCol: { value: new THREE.Color(TH.sunCol) }, uLava: { value: TH.liquid && TH.liquid.lava ? 1 : 0 } }]),
      vertexShader: 'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: 'uniform float uTime; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunCol; uniform float uLava; varying vec3 vW;\n#include <common>\n#include <fog_pars_fragment>\n' +
        'vec2 wv(vec2 p, vec2 d, float k, float w, float a){ float ph = dot(d,p)*k + uTime*w; return d * cos(ph) * k * a; }\n' +
        'void main(){ vec2 p = vW.xz; vec2 g = wv(p, vec2(0.8,0.6), 1.3, 1.1, 0.05) + wv(p, vec2(-0.5,0.86), 2.1, 1.7, 0.03) + wv(p, vec2(0.2,-0.98), 3.7, 2.3, 0.015) + wv(p, vec2(-0.92,-0.3), 6.1, 3.1, 0.008) + wv(p, vec2(0.6,-0.8), 11.0, 4.2, 0.004);\n' +
        '  vec3 N = normalize(vec3(-g.x, 1.0, -g.y)); vec3 V = normalize(cameraPosition - vW); float fr = 0.02 + 0.7 * pow(1.0 - max(dot(N, V), 0.0), 5.0);\n' +
        '  vec3 Rf = reflect(-V, N); vec3 sky = mix(uSky * 0.85, uSky * 1.15, clamp(Rf.y, 0.0, 1.0));\n' +
        '  float sp = pow(max(dot(Rf, normalize(uSun)), 0.0), 260.0) * 6.0 + pow(max(dot(Rf, normalize(uSun)), 0.0), 30.0) * 0.25;\n' +
        '  vec3 body = mix(uShallow, uDeep, clamp(length(cameraPosition - vW) * 0.02, 0.0, 1.0));\n' +
        '  vec3 col = mix(body, sky, fr) + uSunCol * sp;\n' +
        '  float lv = sin(p.x * 0.9 + uTime * 0.35) + sin(p.y * 1.1 - uTime * 0.28) + sin((p.x + p.y) * 0.55 + uTime * 0.2) + sin(length(p - vec2(7.0, 3.0)) * 1.3 - uTime * 0.4) + sin(p.x * 2.3 - p.y * 1.7 + uTime * 0.5) * 0.5;\n' +
        '  if (uLava > 0.5) { float v = smoothstep(-1.5, 3.2, lv); col = mix(uDeep, uShallow, v * v) + vec3(0.5, 0.18, 0.02) * smoothstep(1.8, 3.4, lv); gl_FragColor = vec4(col, 1.0); } else\n' +
        '  gl_FragColor = vec4(col, mix(0.9, 0.98, fr));\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n#include <fog_fragment>\n}'
    });
    var m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, GS.WATER_Y + 0.01, (z0 + z1) / 2); m.renderOrder = 2; m.userData.noShadow = true;
    return { mesh: m, mat: mat };
  }

  /* ==================================================================
     LA VÉGÉTATION : modèles copiés par milliers (« instances »), rangés par zones de 40 m pour ne dessiner que ce qu'on voit
     ================================================================== */
  function scatter(root, nat, TH, terr, course, low, seed, api) {
    var r = rng(seed + 77), CH = 40, scale = low ? 0.3 : 1;
    var dm = new THREE.Object3D(), tintMats = {};
    function matFor(m) {
      if (!TH.tint) return foliage(m);
      var t = null; Object.keys(TH.tint).forEach(function (k) { if (m.name.indexOf(k) >= 0) t = TH.tint[k]; });
      if (t === null) return foliage(m);
      if (!tintMats[m.uuid]) { var c = m.clone(); c.color = new THREE.Color(t); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; tintMats[m.uuid] = foliage(c); api.disposables.push(c); }
      return tintMats[m.uuid];
    }
    function foliage(m) {
      if (/Leaves|Leaf/.test(m.name)) return windify(m, 0.011);
      if (/Grass|Flowers/.test(m.name) || m.alphaTest > 0) return windify(m, 0.1);
      return m;
    }
    TH.decor.forEach(function (d) {
      var mdl = nat[d[0]]; if (!mdl) return;
      var count = Math.round(d[1] * scale), smin = d[2], smax = d[3], dmin = d[4], dmax = d[5], tries = 0, placed = [];
      var big = /Tree|Pine/.test(d[0]), x0 = terr.x0, z0 = terr.z0, W = terr.x1 - terr.x0, Hh = terr.z1 - terr.z0;
      while (placed.length < count && tries++ < count * 30) {
        var x = x0 + r() * W, z = z0 + r() * Hh, dt = terr.dTrack(x, z);
        var s = (smin + r() * (smax - smin)) * (big || /Rock_/.test(d[0]) ? 1 : 0.42);
        // on garde la place de tout le modèle (feuillage compris) : rien ne déborde sur une piste
        var rad = Math.max(mdl.box.max.x - mdl.box.min.x, mdl.box.max.z - mdl.box.min.z) / 2 * s;
        if (dt < Math.max(dmin, rad * (big ? 0.95 : 1) + 0.45) || dt > dmax + (big ? 25 : 0)) continue;
        if (terr.dGap(x, z) < rad + (big ? 2 : 0.8)) continue;
        var h = terr.height(x, z); if (h < GS.GROUND - 0.12 || (TH.island && h < GS.GROUND - 0.05)) continue;
        placed.push([x, h - (big ? 0.05 : 0.02), z, s, r() * TAU]);
      }
      if (!placed.length) return;
      // rangement par zones
      var chunks = {};
      placed.forEach(function (p) { var key = Math.floor(p[0] / CH) + ',' + Math.floor(p[2] / CH); (chunks[key] || (chunks[key] = [])).push(p); });
      Object.keys(chunks).forEach(function (key) {
        var list = chunks[key];
        mdl.parts.forEach(function (part) {
          var mat = TH.desertRocks && /Rocks/.test(part.mat.name) ? api.M.rock : matFor(part.mat);
          var im = new THREE.InstancedMesh(part.geo, mat, list.length);
          list.forEach(function (p, q) { dm.position.set(p[0], p[1], p[2]); dm.rotation.set(0, p[4], 0); dm.scale.setScalar(p[3]); dm.updateMatrix(); im.setMatrixAt(q, dm.matrix); });
          im.instanceMatrix.needsUpdate = true;
          // boîte englobante de la zone (pour ne pas dessiner ce qui est hors de l'écran)
          var bb = new THREE.Box3(); list.forEach(function (p) { bb.expandByPoint(new THREE.Vector3(p[0], p[1], p[2])); });
          var ext = Math.max(mdl.box.max.x - mdl.box.min.x, mdl.box.max.y - mdl.box.min.y, mdl.box.max.z - mdl.box.min.z) * smax * (big || /Rock_/.test(d[0]) ? 1 : 0.42);
          bb.expandByScalar(ext);
          // même géométrie (mêmes tampons sur la carte graphique), mais avec la sphère englobante de toute la zone
          var g2 = new THREE.BufferGeometry(); g2.setIndex(part.geo.index); Object.keys(part.geo.attributes).forEach(function (an) { g2.setAttribute(an, part.geo.attributes[an]); });
          g2.boundingSphere = bb.getBoundingSphere(new THREE.Sphere()); g2.boundingBox = bb; im.geometry = g2; im.frustumCulled = true;
          im.castShadow = !low && (big || /Bush|Rock/.test(d[0]));
          im.receiveShadow = !low && !big;
          if (im.castShadow && mat.alphaTest > 0) im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 });
          im.userData.noShadow = true;
          root.add(im);
        });
      });
    });
  }

  /* ------------------------------------------------------------------ rondins, tonneaux et rochers qui dévalent ------------------------------------------------------------------ */
  function updateLogs(e, t) {
    var L = GS.logsAt(e.H, e.d, t, e.tmp);
    for (var k = 0; k < e.meshes.length; k++) {
      var m = e.meshes[k], lg = L[k]; if (!lg) continue;
      m.g.visible = lg.sc > 0.02; m.g.position.set(lg.x, lg.h, lg.z); m.g.scale.setScalar(Math.max(0.01, lg.sc));
      m.body.rotation.x = -lg.along / m.r;            // il roule vers l'avant de la piste (sens de la pente)
    }
  }

  /* ------------------------------------------------------------------ décor 3D (modèles de vrais créateurs, CC0) ------------------------------------------------------------------ */
  var DECO = {}, decoWait = {};
  function loadDecoSet(names, cb) {
    var left = names.length; if (!left) { cb(); return; }
    names.forEach(function (n) {
      loadDeco(n, function () { if (--left === 0) cb(); });
    });
  }
  function loadDeco(name, cb) {
    if (DECO[name] !== undefined) { cb(DECO[name]); return; }
    (decoWait[name] = decoWait[name] || []).push(cb); if (decoWait[name].length > 1) return;
    function done(v) { DECO[name] = v; var l = decoWait[name]; decoWait[name] = null; l.forEach(function (f) { f(v); }); }
    if (!THREE.GLTFLoader) { done(null); return; }
    new THREE.GLTFLoader().load(BASE + 'deco/' + name + '.glb?v=1', function (gl) {
      gl.scene.updateMatrixWorld(true);
      var bb = new THREE.Box3().setFromObject(gl.scene), sz = new THREE.Vector3(); bb.getSize(sz);
      gl.scene.traverse(function (o) { if (o.isMesh && o.material && /Unlit/.test(o.material.name)) o.visible = false; });
      gl.scene.traverse(function (o) { if (o.isMesh) { o.frustumCulled = !o.isSkinnedMesh; if (o.material) { o.material.side = o.material.side; if (o.material.map) o.material.map.anisotropy = 4; o.material.metalness = Math.min(o.material.metalness || 0, 0.2); } } });
      done({ scene: gl.scene, anims: gl.animations || [], box: bb, max: Math.max(sz.x, sz.y, sz.z) || 1 });
    }, undefined, function () { done(null); });
  }
  function placeProps(root, TH, terr, course, low, seed, api) {
    var gapPts = [], trkPts = [];
    course.holes.forEach(function (H) {
      H.gaps.forEach(function (g) { if (g.side) return; var sx = 0, sz = 0; g.poly.forEach(function (p) { sx += p[0]; sz += p[1]; }); gapPts.push([sx / g.poly.length, sz / g.poly.length]); });
      for (var q = 0; q < H.S.length; q += 2) trkPts.push([H.S[q].x, H.S[q].z]);
    });
    var r = rng(seed + 501), box = course.box, cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2, rIsl = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 10;
    TH.props.forEach(function (d) {
      var mdl = DECO[d.m]; if (!mdl) return;
      var n = Math.max(1, Math.round(d.n * (low ? 0.4 : 1))), tries = 0, placed = 0, skinned = mdl.anims.length > 0;
      while (placed < n && tries++ < n * 60) {
        var size = d.size[0] + r() * (d.size[1] - d.size[0]), s = size / mdl.max, x, z, y, kind = d.where, ang, rad;
        if (kind === 'rim' || kind === 'sky') {
          ang = r() * TAU; rad = kind === 'sky' ? (d.radius ? d.radius[0] + r() * (d.radius[1] - d.radius[0]) : 30) : rIsl + 4 + r() * (d.far ? 55 : 22);
          x = cx + Math.cos(ang) * rad; z = cz + Math.sin(ang) * rad;
          if (kind === 'rim' && (terr.height(x, z) > GS.WATER_Y - 0.25 && !TH.island)) continue;
          if (kind === 'rim' && terr.height(x, z) > GS.WATER_Y - 0.05) continue;
        } else if (kind === 'pit') {
          if (!gapPts.length) break;
          var gp = gapPts[Math.floor(r() * gapPts.length)], pa = r() * TAU, pr = 1.7 + r() * 1.3;
          x = gp[0] + Math.cos(pa) * pr; z = gp[1] + Math.sin(pa) * pr;
          if (terr.dTrack(x, z) < 1.0 || terr.height(x, z) > GS.WATER_Y - 0.1) continue;
        } else if (kind === 'hover') {
          var tp = trkPts[Math.floor(r() * trkPts.length)], ha = r() * TAU, hr = 2 + r() * 8;
          x = tp[0] + Math.cos(ha) * hr; z = tp[1] + Math.sin(ha) * hr;
          var dt2 = terr.dTrack(x, z); if (dt2 < 1.6 || dt2 > 12) continue;
        } else {
          var lp = trkPts[Math.floor(r() * trkPts.length)], la = r() * TAU, dd = d.dist || [3, 14], lr = dd[0] + r() * (dd[1] - dd[0]);
          x = lp[0] + Math.cos(la) * lr; z = lp[1] + Math.sin(la) * lr;
          var dt3 = terr.dTrack(x, z), rd = size * 0.35;
          if (dt3 < Math.max(dd[0], rd) || dt3 > dd[1] || terr.dGap(x, z) < rd + 1.2 || terr.height(x, z) < GS.GROUND - 0.1) continue;
        }
        var th = terr.height(x, z);
        if (kind === 'sky') y = 6 + r() * 7; else if (kind === 'hover') y = (th > GS.GROUND - 0.2 ? GS.GROUND : GS.WATER_Y) + 1.4 + r() * 1.8; else if (kind === 'pit') y = d.hover ? GS.WATER_Y + d.hover[0] + r() * (d.hover[1] - d.hover[0]) : GS.WATER_Y - 0.15; else if (kind === 'rim') y = GS.WATER_Y - 0.12; else y = th - 0.03;
        var inst = skinned ? THREE.SkeletonUtils.clone(mdl.scene) : mdl.scene.clone(true), g = new THREE.Group();
        inst.scale.setScalar(s); inst.position.y = -mdl.box.min.y * s; g.add(inst);
        g.position.set(x, y, z); g.rotation.y = r() * TAU; root.add(g);
        var entry = { g: g, base: y, ph: r() * TAU, kind: kind, ships: !!d.ships, cx: cx, cz: cz, ang: ang, rad: rad, sp: (0.04 + r() * 0.05) * (r() < 0.5 ? 1 : -1), mixer: null, size: size };
        if (kind === 'sky') { entry.rad = rad; entry.y0 = y; }
        if (skinned && d.clip) {
          var re = new RegExp(d.clip), clips = mdl.anims.filter(function (c) { return re.test(c.name); }); if (!clips.length) clips = mdl.anims.slice(0, 1);
          var clip = clips[Math.floor(r() * clips.length)], mx = new THREE.AnimationMixer(inst), ac = mx.clipAction(clip); ac.time = r() * clip.duration; ac.timeScale = 0.8 + r() * 0.5; ac.play(); entry.mixer = mx;
        }
        api.props.push(entry); placed++;
      }
    });
  }
  function updateProps(list, dt, t, cam) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], dx = cam ? cam.x - e.g.position.x : 0, dz = cam ? cam.z - e.g.position.z : 0, near = !cam || dx * dx + dz * dz < 3600;
      if (e.mixer && near) e.mixer.update(dt);
      if (e.kind === 'sky') {                                                       // les dragons tournent autour du volcan
        e.ang += e.sp * dt * 2.2; var rr = e.rad; e.g.position.set(e.cx + Math.cos(e.ang) * rr, e.y0 + Math.sin(t * 0.7 + e.ph) * 0.8, e.cz + Math.sin(e.ang) * rr); var sg = e.sp > 0 ? 1 : -1; e.g.rotation.y = Math.atan2(-sg * Math.sin(e.ang), sg * Math.cos(e.ang));
      } else if (e.kind === 'hover' || (e.kind === 'pit' && e.base > GS.WATER_Y + 0.5)) e.g.position.y = e.base + Math.sin(t * 1.3 + e.ph) * 0.18;
      else if (e.ships) { e.g.position.y = e.base + Math.sin(t * 0.8 + e.ph) * 0.07; e.g.rotation.z = Math.sin(t * 0.6 + e.ph) * 0.03; e.g.rotation.x = Math.sin(t * 0.5 + e.ph * 2) * 0.02; }
    }
  }

  /* ------------------------------------------------------------------ particules (neige, feuilles, poussière) qui suivent la caméra ------------------------------------------------------------------ */
  function makeParticles(kind, low, root) {
    var n = low ? 300 : 900, B = 36, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), r = rng(31), i;
    for (i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * B; pos[i * 3 + 1] = r() * 16; pos[i * 3 + 2] = (r() - 0.5) * B; vel[i * 3] = (r() - 0.5) * 0.4; vel[i * 3 + 1] = kind === 'dust' ? (r() - 0.5) * 0.1 : kind === 'embers' ? 0.3 + r() * 0.8 : -(0.4 + r() * (kind === 'snow' ? 0.6 : 0.9)); vel[i * 3 + 2] = (r() - 0.5) * 0.4; }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ size: kind === 'snow' ? 0.09 : kind === 'leaves' ? 0.16 : kind === 'embers' ? 0.07 : 0.05, map: kind === 'leaves' ? leafSprite() : softDot('rgba(255,255,255,1)'), color: kind === 'leaves' ? 0xe0782f : kind === 'dust' ? 0xf0d8b0 : kind === 'embers' ? 0xff8a3a : 0xffffff, transparent: true, opacity: kind === 'dust' ? 0.45 : 0.9, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 });
    var pts = new THREE.Points(g, m); pts.frustumCulled = false; root.add(pts);
    var t = 0, ox = 0, oz = 0;
    return {
      update: function (dt, c) {
        if (!c) return; t += dt;
        for (i = 0; i < n; i++) {
          var k = i * 3; pos[k] += (vel[k] + Math.sin(t * 0.8 + i) * 0.25) * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += (vel[k + 2] + Math.cos(t * 0.6 + i * 1.3) * 0.2) * dt;
          var rx = pos[k] - c.x, rz = pos[k + 2] - c.z;
          if (rx > B / 2) pos[k] -= B; else if (rx < -B / 2) pos[k] += B;
          if (rz > B / 2) pos[k + 2] -= B; else if (rz < -B / 2) pos[k + 2] += B;
          if (pos[k + 1] < c.y - 3) pos[k + 1] += 16; else if (pos[k + 1] > c.y + 13) pos[k + 1] -= 16;
        }
        g.attributes.position.needsUpdate = true;
      }
    };
  }

  F.golfScene = { build: build, THEMES: THEMES, loadNature: loadNature };
})();
