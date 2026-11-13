// FICHIER GÉNÉRÉ par scripts/sync-sims.mjs à partir de js/3d/prophunt-sim.js : ne pas modifier à la main.
const SIM = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------ les objets : demi-dimensions de la boîte de collision [largeur, hauteur, profondeur] / 2, en mètres ------------------------------ */
  var PROPS = {
    // maison / manoir
    chair: [0.26, 0.48, 0.26], armchair: [0.45, 0.45, 0.45], sofa: [1.0, 0.42, 0.45], table_round: [0.6, 0.38, 0.6], table_long: [1.3, 0.38, 0.45], bookshelf: [0.6, 1.0, 0.18],
    wardrobe: [0.55, 1.05, 0.3], bed: [0.55, 0.3, 1.0], piano: [0.75, 0.55, 0.65], clock: [0.2, 1.0, 0.14], fireplace: [0.85, 0.65, 0.3], floorlamp: [0.16, 0.85, 0.16],
    vase: [0.16, 0.34, 0.16], bust: [0.18, 0.62, 0.18], armor: [0.28, 0.9, 0.22], globe: [0.28, 0.5, 0.28], dresser: [0.55, 0.45, 0.25], desk: [0.7, 0.4, 0.35], candelabra: [0.14, 0.55, 0.14],
    trunk: [0.4, 0.25, 0.25], bench: [0.7, 0.24, 0.2], stool: [0.2, 0.25, 0.2], teatable: [0.3, 0.3, 0.3], mirror: [0.4, 0.9, 0.12], plant: [0.38, 0.85, 0.38], tvunit: [0.7, 0.57, 0.35],
    // casino
    slot: [0.35, 0.95, 0.3], roulette: [0.85, 0.5, 0.85], blackjack: [1.0, 0.45, 0.6], poker: [0.85, 0.42, 0.85], chips: [0.18, 0.2, 0.18], barstool: [0.22, 0.38, 0.22],
    bar: [1.2, 0.55, 0.3], atm: [0.32, 0.9, 0.25], champagne: [0.28, 0.42, 0.28], dice: [0.35, 0.35, 0.35], safe: [0.38, 0.5, 0.35], trolley: [0.4, 0.55, 0.28],
    goldstatue: [0.3, 0.8, 0.3], cocktail: [0.3, 0.55, 0.3], jukebox: [0.42, 0.8, 0.3],
    // marché de nuit
    stall: [1.1, 1.1, 0.8], lamppost: [0.14, 1.5, 0.14], basket: [0.3, 0.22, 0.3], sack: [0.28, 0.3, 0.22], crate: [0.4, 0.4, 0.4], barrel: [0.32, 0.45, 0.32], fishcrate: [0.35, 0.22, 0.25],
    parasol: [0.9, 1.2, 0.9], noodle: [0.7, 0.8, 0.45], cooler: [0.4, 0.3, 0.28], ricebag: [0.3, 0.35, 0.2], cartonbox: [0.35, 0.3, 0.3], trashbin: [0.3, 0.45, 0.3],
    // station spatiale
    cryopod: [0.55, 1.0, 0.55], console: [0.7, 0.55, 0.4], holotable: [0.75, 0.55, 0.75], container: [0.9, 0.7, 0.7], reactor: [0.9, 1.4, 0.9], antenna: [0.3, 1.3, 0.3],
    monitors: [0.55, 0.65, 0.3], cabledrum: [0.45, 0.45, 0.35], o2tank: [0.25, 0.7, 0.25], techcrate: [0.45, 0.4, 0.45], robot: [0.4, 0.8, 0.35], locker: [0.3, 0.9, 0.25], terminal: [0.3, 0.7, 0.3],
    // musée
    pedestal: [0.3, 0.9, 0.3], sarcophagus: [0.55, 0.45, 1.1], amphora: [0.3, 0.65, 0.3], showcase: [0.6, 0.55, 0.4], column: [0.3, 1.4, 0.3], urn: [0.3, 0.4, 0.3], easel: [0.4, 0.8, 0.4],
    dinoskull: [0.7, 0.55, 1.0], stanchion: [0.1, 0.45, 0.1], museumbench: [0.8, 0.22, 0.3],
    // port
    shipcontainer: [1.25, 1.3, 3.0], bollard: [0.2, 0.3, 0.2], ropecoil: [0.5, 0.2, 0.5], anchor: [0.5, 0.8, 0.15], buoy: [0.4, 0.55, 0.4], netpile: [0.6, 0.35, 0.6], lifebuoy: [0.4, 0.45, 0.1],
    fishbarrel: [0.3, 0.4, 0.3], pallet: [0.6, 0.15, 0.5], oildrum: [0.3, 0.45, 0.3], toolbox: [0.3, 0.18, 0.15], gascan: [0.2, 0.3, 0.12], woodcrate: [0.55, 0.5, 0.55],
    // salles de bain, cuisines, bureaux, chambres, magasins
    toilet: [0.2, 0.4, 0.36], sink: [0.3, 0.45, 0.24], urinal: [0.2, 0.45, 0.18], bathtub: [0.42, 0.3, 0.9], shower: [0.45, 1.0, 0.45], wcstall: [0.45, 1.0, 0.5],
    fridge: [0.4, 0.95, 0.36], stove: [0.4, 0.46, 0.34], kcounter: [0.55, 0.46, 0.32], kisland: [0.9, 0.46, 0.5], sinkunit: [0.55, 0.46, 0.32],
    ochair: [0.27, 0.5, 0.27], printer: [0.24, 0.2, 0.2], cabinet: [0.3, 0.65, 0.26], waterdisp: [0.2, 0.55, 0.2], vending: [0.45, 0.95, 0.4], coatrack: [0.25, 0.9, 0.25], meetingtable: [1.6, 0.38, 0.7],
    nightstand: [0.25, 0.3, 0.22], bunk: [0.5, 0.95, 1.0], medbed: [0.45, 0.4, 1.0], winerack: [0.5, 0.9, 0.3], ladder: [0.3, 1.0, 0.12], reception: [1.0, 0.55, 0.4], shelfunit: [0.6, 1.0, 0.25], brochure: [0.22, 0.6, 0.2],
    // objets accrochés au mur (la hauteur de pose est dans WALLY)
    painting: [0.5, 0.36, 0.04], bigpainting: [0.95, 0.65, 0.05], wallclock: [0.24, 0.24, 0.04], wmirror: [0.38, 0.58, 0.04], sconce: [0.1, 0.16, 0.1], exitsign: [0.3, 0.1, 0.04], wcsign: [0.18, 0.18, 0.03],
    extinguisher: [0.1, 0.3, 0.1], wallshelf: [0.5, 0.18, 0.14], tapestry: [0.5, 0.9, 0.04], neonsign: [0.9, 0.28, 0.04], poster: [0.3, 0.42, 0.02], ac: [0.4, 0.25, 0.3], banner: [0.3, 0.7, 0.03],
    whiteboard: [0.9, 0.55, 0.05], tv: [0.65, 0.4, 0.05], projscreen: [1.0, 0.8, 0.05],
    // petits objets (posés sur les meubles)
    books: [0.14, 0.1, 0.11], bottles: [0.1, 0.15, 0.06], plate: [0.13, 0.02, 0.13], mug: [0.05, 0.055, 0.05], lamp_desk: [0.1, 0.22, 0.1], fruitbowl: [0.16, 0.1, 0.16], teapot: [0.13, 0.1, 0.1],
    papers: [0.15, 0.015, 0.2], trophy: [0.09, 0.2, 0.09], cashstack: [0.12, 0.06, 0.1], pot: [0.18, 0.12, 0.14], tray: [0.2, 0.03, 0.14], radio: [0.2, 0.12, 0.08], candlesm: [0.04, 0.13, 0.04],
    giftbox: [0.15, 0.1, 0.12], laptop: [0.17, 0.1, 0.13], computer: [0.28, 0.22, 0.2]
  };
  var PROP_IDS = Object.keys(PROPS);
  // hauteur (du sol) où un objet accroché au mur est posé (le bas de l'objet)
  var WALLY = { painting: 1.5, bigpainting: 1.4, wallclock: 2.3, wmirror: 1.25, sconce: 2.1, exitsign: 2.8, wcsign: 1.75, extinguisher: 0.8, wallshelf: 1.5, tapestry: 1.4, neonsign: 2.9, poster: 1.3, ac: 3.2, banner: 2.0, whiteboard: 1.0, tv: 1.3, projscreen: 1.3, urinal: 0.55 };
  PROPS.urinal = PROPS.urinal; var WALLT = {}; Object.keys(WALLY).forEach(function (k) { WALLT[k] = 1; });
  // quels petits objets peuvent être posés sur quel meuble
  var ITEMS = {
    table_round: ['books', 'plate', 'mug', 'fruitbowl', 'teapot', 'candlesm', 'vase'], table_long: ['plate', 'mug', 'candlesm', 'bottles', 'fruitbowl', 'plate', 'teapot'], meetingtable: ['papers', 'laptop', 'mug', 'bottles', 'papers', 'mug'],
    desk: ['laptop', 'lamp_desk', 'books', 'papers', 'mug', 'trophy', 'computer'], dresser: ['lamp_desk', 'vase', 'books', 'trophy', 'radio', 'giftbox', 'candlesm'], teatable: ['teapot', 'mug', 'books', 'candlesm'],
    kcounter: ['pot', 'plate', 'mug', 'bottles', 'tray', 'fruitbowl'], kisland: ['pot', 'plate', 'mug', 'bottles', 'tray', 'fruitbowl', 'pot'], sinkunit: ['plate', 'mug', 'bottles'], stove: ['pot', 'pot'],
    bar: ['bottles', 'mug', 'tray', 'cashstack', 'plate', 'bottles'], reception: ['computer', 'papers', 'tray', 'trophy', 'radio'], nightstand: ['lamp_desk', 'books', 'mug', 'radio'], cabinet: ['books', 'papers', 'pot', 'giftbox'],
    fridge: ['giftbox', 'pot'], bookshelf: ['vase', 'books', 'trophy', 'giftbox'], poker: ['chips', 'cashstack'], blackjack: ['chips', 'cashstack'], trunk: ['books', 'giftbox'], cooler: ['mug', 'giftbox'],
    crate: ['cartonbox', 'crate', 'basket'], woodcrate: ['cartonbox', 'toolbox', 'crate'], pallet: ['cartonbox', 'oildrum', 'woodcrate', 'ricebag'], barrel: ['basket', 'toolbox'], shipcontainer: ['shipcontainer', 'woodcrate', 'oildrum'],
    cartonbox: ['cartonbox'], techcrate: ['techcrate', 'cabledrum'], container: ['techcrate'], console: ['mug', 'laptop'], sink: ['mug'], bench: ['books'], museumbench: ['books'], sofa: ['giftbox'], stall: []
  };

  /* ------------------------------ les cartes ------------------------------ */
  var MAPS = {
    // une seule carte pour l'instant : le manoir, reconstruit pièce par pièce (pour l'instant : le hall d'entrée)
    manoir: { name: 'Le Manoir', icon: '🏠', style: 'manoir', indoor: true, desc: 'Le hall d\'entrée : salon, grand lustre et mezzanine. Les autres pièces arrivent une par une.', W: 24, D: 16, H: 6.4, seed: 11, spawn: 'hall' }
  };
  var MAP_IDS = Object.keys(MAPS);

  // les plans : [identifiant, type de pièce, x0, z0, x1, z1] depuis le coin haut-gauche ; portes : [pièce A, pièce B, position 0..1 le long du mur commun, largeur]
  var LAYOUT = {
    manoir: {
      // pour l'instant une seule pièce : le hall d'entrée (24 × 16 m, 6,4 m de haut) ; on ajoutera les autres pièces au fur et à mesure
      rooms: [['hall', 'hall', 0, 0, 24, 16]],
      doors: [], windows: null,
      // la grande porte d'entrée (mur sud) et les piliers qui portent la mezzanine (au nord)
      entry: { w: 3.2, h: 3.4 }, pillars: [[-9, -3.95], [-3, -3.95], [3, -3.95], [9, -3.95]], mezz: 4.2, mezzY: 3.3
    }
  };

  function boxOf(t, x, z, yaw, y) {
    var b = PROPS[t], c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = b[0] * c + b[2] * s, ez = b[0] * s + b[2] * c;
    return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez, y0: y, y1: y + b[1] * 2 };
  }
  function overlap(a, b, m) { return a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m && a.y0 < b.y1 - 0.001 && a.y1 > b.y0 + 0.001; }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }
  function wpick(r, w) { var tot = 0, k; for (k in w) tot += w[k]; var x = r() * tot; for (k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; }

  /* ------------------------------ plan d'un bâtiment : pièces, murs, portes, fenêtres, mobilier ------------------------------ */
  var CACHE = {};
  function indoorMap(id, M, L) {
    var r = rng(M.seed), W = M.W, D = M.D, H = M.H, T = 0.3, ox = -W / 2, oz = -D / 2, rooms = [], byId = {}, doors = [], walls = [], deco = [], props = [], reg = [], i, j;
    L.rooms.forEach(function (a) { var rm = { id: a[0], kind: a[1], x0: a[2] + ox, z0: a[3] + oz, x1: a[4] + ox, z1: a[5] + oz }; rm.ix0 = rm.x0 + T / 2; rm.ix1 = rm.x1 - T / 2; rm.iz0 = rm.z0 + T / 2; rm.iz1 = rm.z1 - T / 2; rm.cx = (rm.x0 + rm.x1) / 2; rm.cz = (rm.z0 + rm.z1) / 2; rm.area = (rm.x1 - rm.x0) * (rm.z1 - rm.z0); rooms.push(rm); byId[rm.id] = rm; });
    // les portes : au milieu (ou à la position voulue) du mur commun
    L.doors.forEach(function (d) {
      var a = byId[d[0]], b = byId[d[1]], fr = d[2] === undefined ? 0.5 : d[2], w = d[3] || 1.8, lo, hi;
      if (Math.abs(a.x1 - b.x0) < 1e-6 || Math.abs(b.x1 - a.x0) < 1e-6) { var x = Math.abs(a.x1 - b.x0) < 1e-6 ? a.x1 : a.x0; lo = Math.max(a.z0, b.z0); hi = Math.min(a.z1, b.z1); var zc = Math.max(lo + w / 2 + 0.5, Math.min(hi - w / 2 - 0.5, lo + (hi - lo) * fr)); doors.push({ x: x, z: zc, axis: 'x', w: w, a: a.id, b: b.id }); }
      else { var z = Math.abs(a.z1 - b.z0) < 1e-6 ? a.z1 : a.z0; lo = Math.max(a.x0, b.x0); hi = Math.min(a.x1, b.x1); var xc = Math.max(lo + w / 2 + 0.5, Math.min(hi - w / 2 - 0.5, lo + (hi - lo) * fr)); doors.push({ x: xc, z: z, axis: 'z', w: w, a: a.id, b: b.id }); }
    });
    // les murs : union des bords de pièces, moins les portes
    function addIv(map, k, a, b) { var key = k.toFixed(3); (map[key] = map[key] || []).push([a, b]); }
    var vs = {}, hs = {};
    rooms.forEach(function (rm) { addIv(vs, rm.x0, rm.z0, rm.z1); addIv(vs, rm.x1, rm.z0, rm.z1); addIv(hs, rm.z0, rm.x0, rm.x1); addIv(hs, rm.z1, rm.x0, rm.x1); });
    function runs(map, isV) {
      Object.keys(map).forEach(function (key) {
        var k = +key, ivs = map[key].sort(function (p, q) { return p[0] - q[0]; }), merged = [];
        ivs.forEach(function (iv) { var last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]); else merged.push([iv[0], iv[1]]); });
        merged.forEach(function (m) {
          var gaps = doors.filter(function (d) { return isV ? (d.axis === 'x' && Math.abs(d.x - k) < 1e-6 && d.z > m[0] && d.z < m[1]) : (d.axis === 'z' && Math.abs(d.z - k) < 1e-6 && d.x > m[0] && d.x < m[1]); }).map(function (d) { var c = isV ? d.z : d.x; return [c - d.w / 2, c + d.w / 2]; }).sort(function (p, q) { return p[0] - q[0]; });
          var cur = m[0] - T / 2, segs = [];
          gaps.forEach(function (g) { if (g[0] > cur) segs.push([cur, g[0]]); cur = g[1]; });
          segs.push([cur, m[1] + T / 2]);
          segs.forEach(function (sg) { if (sg[1] - sg[0] < 0.02) return; walls.push(isV ? { x0: k - T / 2, z0: sg[0], x1: k + T / 2, z1: sg[1], y0: 0, y1: H } : { x0: sg[0], z0: k - T / 2, x1: sg[1], z1: k + T / 2, y0: 0, y1: H }); });
        });
      });
    }
    runs(vs, true); runs(hs, false);

    /* --- le registre des boîtes occupées (meubles, portes, fenêtres) : rien ne se recouvre, rien ne traverse un mur --- */
    var cur = null;
    doors.forEach(function (d) { var hw = d.w / 2 + 0.25; reg.push(d.axis === 'x' ? { x0: d.x - 1.3, x1: d.x + 1.3, z0: d.z - hw, z1: d.z + hw, y0: 0, y1: 2.6, door: 1 } : { x0: d.x - hw, x1: d.x + hw, z0: d.z - 1.3, z1: d.z + 1.3, y0: 0, y1: 2.6, door: 1 }); });
    function tryPlace(t, x, z, yaw, y, v) {
      var b = boxOf(t, x, z, yaw, y); if (!cur || b.x0 < cur.ix0 - 0.001 || b.x1 > cur.ix1 + 0.001 || b.z0 < cur.iz0 - 0.001 || b.z1 > cur.iz1 + 0.001) return null;
      for (var q = 0; q < reg.length; q++) if (overlap(b, reg[q], y > 0 || WALLT[t] ? 0.0 : 0.05)) return null;
      var p = { t: t, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), yaw: +yaw.toFixed(3), s: 1, v: v || 0, room: cur.id, box: b }; props.push(p); reg.push(b); return p;
    }
    function rangeOf(side) { return side === 'n' || side === 's' ? [cur.ix0, cur.ix1] : [cur.iz0, cur.iz1]; }
    function along(side, f) { var g = rangeOf(side); return g[0] + (g[1] - g[0]) * f; }
    // posé contre un mur (le dos au mur, face vers la pièce) ; side : n s w e ; f : position le long du mur 0..1
    function A(side, t, f, gap, v) {
      var b = PROPS[t], hz = b[2], a = along(side, f), g = gap === undefined ? 0.03 : gap;
      if (side === 'n') return tryPlace(t, a, cur.iz0 + hz + g, 0, 0, v); if (side === 's') return tryPlace(t, a, cur.iz1 - hz - g, Math.PI, 0, v);
      if (side === 'w') return tryPlace(t, cur.ix0 + hz + g, a, Math.PI / 2, 0, v); return tryPlace(t, cur.ix1 - hz - g, a, -Math.PI / 2, 0, v);
    }
    // accroché à un mur
    function Mt(side, t, f, y, v) {
      var hz = PROPS[t][2], a = along(side, f), yy = y === undefined ? WALLY[t] : y;
      if (side === 'n') return tryPlace(t, a, cur.iz0 + hz, 0, yy, v); if (side === 's') return tryPlace(t, a, cur.iz1 - hz, Math.PI, yy, v);
      if (side === 'w') return tryPlace(t, cur.ix0 + hz, a, Math.PI / 2, yy, v); return tryPlace(t, cur.ix1 - hz, a, -Math.PI / 2, yy, v);
    }
    function C(t, fx, fz, yawDeg, v, y) { return tryPlace(t, cur.ix0 + (cur.ix1 - cur.ix0) * fx, cur.iz0 + (cur.iz1 - cur.iz0) * fz, (yawDeg || 0) * Math.PI / 180, y || 0, v); }
    function repeat(fn, from, to, n) { for (var k = 0; k < n; k++) fn(n === 1 ? (from + to) / 2 : from + (to - from) * k / (n - 1)); }
    // des chaises tout autour d'une table (côtés longs : nl de chaque côté, bouts : ne)
    function chairsAround(tp, nl, ne, ct) {
      if (!tp) return; var b = PROPS[tp.t], c = Math.cos(tp.yaw), s = Math.sin(tp.yaw), k, sd, ch = PROPS[ct || 'chair'];
      function Wd(lx, lz) { return [tp.x + lx * c + lz * s, tp.z - lx * s + lz * c]; }
      for (sd = -1; sd <= 1; sd += 2) for (k = 0; k < nl; k++) { var lx = (nl === 1 ? 0 : -b[0] * 0.78 + (b[0] * 1.56) * k / (nl - 1)), p = Wd(lx, sd * (b[2] + ch[2] + 0.06)); tryPlace(ct || 'chair', p[0], p[1], tp.yaw + (sd > 0 ? Math.PI : 0), 0); }
      for (sd = -1; sd <= 1; sd += 2) for (k = 0; k < ne; k++) { var q = Wd(sd * (b[0] + ch[2] + 0.06), 0); tryPlace(ct || 'chair', q[0], q[1], tp.yaw + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), 0); }
    }
    function ring(tp, n, ct, rad) {
      if (!tp) return; var b = PROPS[tp.t], R = rad || (Math.max(b[0], b[2]) + 0.32), k; for (k = 0; k < n; k++) { var a = TAU * k / n + 0.4; tryPlace(ct || 'chair', tp.x + Math.sin(a) * R, tp.z + Math.cos(a) * R, a + Math.PI, 0); }
    }
    function topOn(host, count) {
      var list = ITEMS[host.t]; if (!list || !list.length || host.y + PROPS[host.t][1] * 2 > 2.4) return; var hb = PROPS[host.t], top = host.y + hb[1] * 2, n = 0, tries = 0;
      var cs = Math.cos(host.yaw), sn = Math.sin(host.yaw);
      while (n < count && tries++ < count * 6) {
        var t = pick(r, list), ib = PROPS[t]; if (ib[0] > hb[0] - 0.02 || ib[2] > hb[2] - 0.02) continue;
        var lx = (r() * 2 - 1) * (hb[0] - ib[0] - 0.02), lz = (r() * 2 - 1) * (hb[2] - ib[2] - 0.02);
        if (tryPlace(t, host.x + lx * cs + lz * sn, host.z - lx * sn + lz * cs, host.yaw + (r() - 0.5) * 1.2, top)) n++;
      }
    }
    function dineSet(fx, fz, yaw, table, nl, ne) { var tp = C(table || 'table_long', fx, fz, yaw); chairsAround(tp, nl, ne); return tp; }
    function row(side, t, n, f0, f1) { var out = []; repeat(function (f) { var p = A(side, t, f); if (p) out.push(p); }, f0 === undefined ? 0.08 : f0, f1 === undefined ? 0.92 : f1, n); return out; }
    function mrow(side, t, n, f0, f1, y, vv) { repeat(function (f) { Mt(side, t, f, y, vv === undefined ? Math.floor(r() * 6) : vv); }, f0 === undefined ? 0.12 : f0, f1 === undefined ? 0.88 : f1, n); }
    function paint(side, n) { mrow(side, r() < 0.4 ? 'bigpainting' : 'painting', n, 0.15, 0.85, undefined); }

    /* --- fenêtres sur les murs extérieurs (réservées avant les meubles) --- */
    var WN = L.windows;
    if (WN) rooms.forEach(function (rm) {
      if (WN.no.indexOf(rm.id) >= 0) return; cur = rm;
      ['n', 's', 'w', 'e'].forEach(function (side) {
        var outer = side === 'n' ? Math.abs(rm.z0 - oz) < 1e-6 : side === 's' ? Math.abs(rm.z1 - (oz + D)) < 1e-6 : side === 'w' ? Math.abs(rm.x0 - ox) < 1e-6 : Math.abs(rm.x1 - (ox + W)) < 1e-6;
        if (!outer) return; var g = rangeOf(side), len = g[1] - g[0], n = Math.floor((len - 1) / WN.step); if (n < 1) return;
        for (var k = 0; k < n; k++) {
          var a = g[0] + (k + 0.5) * len / n, hw = WN.w / 2, x, z, yaw, bx;
          if (side === 'n') { x = a; z = rm.iz0 + 0.02; yaw = 0; bx = { x0: a - hw, x1: a + hw, z0: rm.iz0, z1: rm.iz0 + 0.1 }; } else if (side === 's') { x = a; z = rm.iz1 - 0.02; yaw = Math.PI; bx = { x0: a - hw, x1: a + hw, z0: rm.iz1 - 0.1, z1: rm.iz1 }; }
          else if (side === 'w') { x = rm.ix0 + 0.02; z = a; yaw = Math.PI / 2; bx = { x0: rm.ix0, x1: rm.ix0 + 0.1, z0: a - hw, z1: a + hw }; } else { x = rm.ix1 - 0.02; z = a; yaw = -Math.PI / 2; bx = { x0: rm.ix1 - 0.1, x1: rm.ix1, z0: a - hw, z1: a + hw }; }
          bx.y0 = WN.y - 0.1; bx.y1 = WN.y + WN.h + 0.1; if (reg.some(function (q) { return q.door && overlap(bx, q, 0); })) continue;
          reg.push(bx); deco.push({ t: 'window', x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), y: WN.y, w: WN.w, h: WN.h, kind: WN.kind, room: rm.id });
        }
      });
    });
    // la porte d'entrée (décor, au milieu du mur sud) et les piliers de la mezzanine (pleins : on ne passe pas à travers)
    if (L.entry) {
      var er = rooms[0], ew = L.entry.w;
      reg.push({ x0: er.cx - ew / 2 - 0.4, x1: er.cx + ew / 2 + 0.4, z0: er.iz1 - 1.1, z1: er.iz1, y0: 0, y1: L.entry.h + 0.1, door: 1 });
      deco.push({ t: 'entry', x: +er.cx.toFixed(2), z: +er.iz1.toFixed(2), yaw: Math.PI, w: ew, h: L.entry.h, room: er.id });
    }
    (L.pillars || []).forEach(function (pc) {
      var pw = 0.25, bx = { x0: pc[0] - pw, x1: pc[0] + pw, z0: pc[1] - pw, z1: pc[1] + pw };
      walls.push({ x0: bx.x0, z0: bx.z0, x1: bx.x1, z1: bx.z1, y0: 0, y1: L.mezzY || 3.3 }); reg.push({ x0: bx.x0, x1: bx.x1, z0: bx.z0, z1: bx.z1, y0: 0, y1: L.mezzY || 3.3 });
    });
    // la zone de départ des chasseurs reste libre
    var sp = byId[M.spawn]; reg.push({ x0: sp.cx - 2.6, x1: sp.cx + 2.6, z0: sp.cz - 2.0, z1: sp.cz + 2.0, y0: 0, y1: 2.5 });

    /* --- les gabarits de pièces --- */
    var TPL = {
      // le hall d'entrée du manoir : coin salon (télé, canapés, table basse) à l'ouest, salon de thé à l'est, plantes partout, mezzanine au nord (décor dans prophunt-maps.js)
      hall: function () {
        var tv = A('w', 'tvunit', 0.6); var tt = C('teatable', 0.25, 0.6, 0); C('sofa', 0.335, 0.6, -90); C('sofa', 0.25, 0.51, 0); C('sofa', 0.25, 0.69, 180); C('armchair', 0.355, 0.74, -140); C('armchair', 0.355, 0.46, -40);
        if (tt) topOn(tt, 2); if (tv) topOn(tv, 0);
        A('w', 'plant', 0.1); A('w', 'plant', 0.94); A('e', 'plant', 0.1); A('e', 'plant', 0.94); A('s', 'plant', 0.22); A('s', 'plant', 0.78); A('n', 'plant', 0.04); A('n', 'plant', 0.96); C('plant', 0.1, 0.4, 0);
        A('n', 'bookshelf', 0.2); A('n', 'bookshelf', 0.8); A('n', 'fireplace', 0.5); Mt('n', 'bigpainting', 0.5, 1.7); A('n', 'armor', 0.35); A('n', 'armor', 0.65); A('n', 'coatrack', 0.12);
        row('s', 'bench', 2, 0.3, 0.7); A('s', 'coatrack', 0.06); A('s', 'dresser', 0.14); A('s', 'dresser', 0.9); A('s', 'mirror', 0.5, 4.0); Mt('s', 'bigpainting', 0.3, 1.6); Mt('s', 'bigpainting', 0.72, 1.6);
        var et = C('table_round', 0.78, 0.62, 0); if (et) { ring(et, 4, 'chair', 1.12); topOn(et, 2); } C('armchair', 0.9, 0.45, 90); C('sofa', 0.7, 0.8, 180); A('e', 'piano', 0.45); A('e', 'clock', 0.2); row('e', 'vase', 2, 0.65, 0.75);
        C('stool', 0.3, 0.8, 20); C('stool', 0.345, 0.83, -20); C('candelabra', 0.62, 0.55, 0); C('urn', 0.9, 0.7, 0); C('urn', 0.6, 0.88, 0); C('amphora', 0.07, 0.84, 0); A('s', 'wardrobe', 0.62); C('floorlamp', 0.15, 0.3, 0); C('floorlamp', 0.4, 0.78, 0); C('floorlamp', 0.6, 0.35, 0); C('bust', 0.62, 0.7, 0); C('trunk', 0.42, 0.34, 0); C('globe', 0.8, 0.35, 0);
        Mt('w', 'painting', 0.2, 1.6); Mt('w', 'painting', 0.9, 1.6); Mt('w', 'sconce', 0.38, 2.1); Mt('w', 'sconce', 0.82, 2.1); Mt('e', 'sconce', 0.3, 2.1); Mt('e', 'sconce', 0.8, 2.1); Mt('e', 'wallclock', 0.5, 2.6); Mt('e', 'bigpainting', 0.62, 1.6); Mt('s', 'wallclock', 0.12, 2.6);
      },
      salon: function () { A('n', 'fireplace', 0.5); Mt('n', 'bigpainting', 0.5, 2.1); Mt('n', 'sconce', 0.3); Mt('n', 'sconce', 0.7); C('sofa', 0.5, 0.62, 180); C('teatable', 0.5, 0.5, 0); C('armchair', 0.25, 0.5, 90); C('armchair', 0.75, 0.5, -90); A('w', 'piano', 0.5); A('e', 'bookshelf', 0.25); A('e', 'bookshelf', 0.75); A('s', 'mirror', 0.2); A('s', 'dresser', 0.8); row('s', 'floorlamp', 2, 0.04, 0.96); C('stool', 0.4, 0.8, 0); C('stool', 0.62, 0.8, 0); paint('w', 2); paint('e', 2); Mt('s', 'tapestry', 0.5); },
      salle: function () { var t = dineSet(0.5, 0.5, 0, 'table_long', 4, 1); A('n', 'dresser', 0.3); A('n', 'dresser', 0.7); A('n', 'candelabra', 0.5); A('s', 'mirror', 0.5); A('w', 'clock', 0.5); A('e', 'bust', 0.5); mrow('n', 'bigpainting', 2, 0.3, 0.7, 2.0); mrow('s', 'painting', 3, 0.2, 0.8); Mt('w', 'sconce', 0.25); Mt('w', 'sconce', 0.75); Mt('e', 'sconce', 0.3); Mt('e', 'sconce', 0.7); A('s', 'dresser', 0.12); A('s', 'dresser', 0.88); C('floorlamp', 0.08, 0.5, 0); if (t) topOn(t, 6); },
      cuisine: function () { A('n', 'fridge', 0.07); A('n', 'stove', 0.26); A('n', 'kcounter', 0.43); A('n', 'sinkunit', 0.6); A('n', 'kcounter', 0.77); A('n', 'kcounter', 0.93); mrow('n', 'wallshelf', 2, 0.42, 0.78, 1.55, 0); Mt('n', 'wallclock', 0.12, 2.6); A('w', 'kcounter', 0.5); A('w', 'cabinet', 0.2); C('kisland', 0.5, 0.52, 0); C('stool', 0.3, 0.78, 0); C('stool', 0.5, 0.78, 0); C('stool', 0.7, 0.78, 0); A('s', 'barrel', 0.1); A('s', 'barrel', 0.2); A('s', 'crate', 0.9); A('s', 'basket', 0.8); A('e', 'shelfunit', 0.3); A('e', 'trashbin', 0.8); Mt('e', 'extinguisher', 0.5); Mt('s', 'poster', 0.5); },
      garde: function () { row('n', 'winerack', 3, 0.2, 0.8); row('s', 'winerack', 3, 0.2, 0.8); A('e', 'shelfunit', 0.3); A('e', 'shelfunit', 0.7); C('barrel', 0.3, 0.5, 0); C('barrel', 0.45, 0.5, 0); C('crate', 0.65, 0.45, 0); C('crate', 0.65, 0.58, 0); C('trunk', 0.5, 0.7, 0); A('w', 'sack', 0.3); A('w', 'sack', 0.7); Mt('w', 'sconce', 0.5); Mt('e', 'wallclock', 0.5); },
      bureau: function () { var d = C('desk', 0.5, 0.42, 0); if (d) tryPlace('chair', d.x, d.z - 0.78, 0, 0); A('w', 'bookshelf', 0.3); A('w', 'bookshelf', 0.7); A('e', 'bookshelf', 0.25); A('e', 'cabinet', 0.65); A('s', 'safe', 0.85); A('s', 'dresser', 0.3); C('armchair', 0.78, 0.78, 200); C('globe', 0.2, 0.2, 0); C('floorlamp', 0.12, 0.85, 0); mrow('n', 'painting', 2, 0.2, 0.8); Mt('s', 'wmirror', 0.55); Mt('e', 'wallclock', 0.9); if (d) topOn(d, 4); },
      bibliotheque: function () { row('w', 'bookshelf', 5, 0.1, 0.9); row('e', 'bookshelf', 5, 0.1, 0.9); row('n', 'bookshelf', 2, 0.3, 0.7); A('s', 'bookshelf', 0.15); A('s', 'bookshelf', 0.85); A('w', 'ladder', 0.5); var t = C('table_round', 0.5, 0.3, 0); C('armchair', 0.5, 0.18, 0); C('armchair', 0.3, 0.3, 90); C('armchair', 0.7, 0.3, -90); C('desk', 0.5, 0.75, 180); C('ochair', 0.5, 0.86, 180); C('globe', 0.2, 0.6, 0); C('floorlamp', 0.2, 0.9, 0); C('floorlamp', 0.8, 0.9, 0); C('bust', 0.8, 0.55, 0); Mt('s', 'wallclock', 0.5); Mt('n', 'wmirror', 0.15); if (t) topOn(t, 2); },
      bain: function () { A('n', 'bathtub', 0.3); A('e', 'toilet', 0.55); A('w', 'sink', 0.5); Mt('w', 'wmirror', 0.5, 1.3); A('s', 'shower', 0.8); A('s', 'cabinet', 0.2); A('e', 'trashbin', 0.9); A('n', 'stool', 0.75); Mt('n', 'wallshelf', 0.7, 1.4, 0); Mt('e', 'wcsign', 0.3); Mt('s', 'wallclock', 0.5); Mt('e', 'poster', 0.8); },
      toilettes: function () { var ww = cur.ix1 - cur.ix0, ns = Math.max(2, Math.min(6, Math.floor(ww / 1.1))); row('n', 'wcstall', ns, 0.1, 0.9); row('s', 'sink', Math.max(2, Math.floor(ww / 2.2)), 0.1, 0.7); mrow('s', 'wmirror', Math.max(2, Math.floor(ww / 2.2)), 0.1, 0.7, 1.3, 0); A('s', 'trashbin', 0.92); A('e', 'urinal', 0.3); A('e', 'urinal', 0.6); A('w', 'trashbin', 0.5); Mt('w', 'wcsign', 0.5, 1.75); Mt('n', 'wallclock', 0.5, 2.5); Mt('s', 'extinguisher', 0.96); },
      chambre: function () { var b = A('n', 'bed', 0.5); A('n', 'nightstand', 0.5 - 0.17); A('n', 'nightstand', 0.5 + 0.17); A('e', 'wardrobe', 0.5); A('w', 'dresser', 0.5); A('s', 'mirror', 0.3); A('s', 'desk', 0.72); C('ochair', 0.72, 0.84, 180); C('armchair', 0.25, 0.7, 45); C('trunk', 0.5, 0.36, 0); C('floorlamp', 0.12, 0.88, 0); mrow('w', 'painting', 2, 0.25, 0.75, 1.7); Mt('e', 'wallclock', 0.15); Mt('n', 'tapestry', 0.2); if (b) b.v = 0; },
      enfant: function () { A('w', 'bunk', 0.3); A('e', 'bed', 0.4); A('n', 'wardrobe', 0.5); A('s', 'desk', 0.3); C('ochair', 0.25, 0.85, 180); A('s', 'bookshelf', 0.75); C('trunk', 0.5, 0.5, 0); C('globe', 0.3, 0.45, 0); C('stool', 0.7, 0.5, 0); A('e', 'nightstand', 0.9); mrow('n', 'poster', 3, 0.2, 0.8, 1.5); Mt('w', 'wallclock', 0.8); },
      bal: function () { A('n', 'piano', 0.5); row('w', 'museumbench', 3, 0.15, 0.85); row('e', 'museumbench', 3, 0.15, 0.85); row('s', 'pedestal', 3, 0.15, 0.85); A('n', 'pedestal', 0.15); A('n', 'pedestal', 0.85); A('n', 'mirror', 0.3); A('n', 'mirror', 0.7); var t = A('s', 'table_long', 0.5); C('champagne', 0.3, 0.45, 0); C('champagne', 0.7, 0.45, 0); C('stanchion', 0.4, 0.3, 0); C('stanchion', 0.6, 0.3, 0); mrow('w', 'bigpainting', 2, 0.25, 0.75, 2.1); mrow('e', 'bigpainting', 2, 0.25, 0.75, 2.1); Mt('s', 'tapestry', 0.2); Mt('s', 'tapestry', 0.8); C('floorlamp', 0.1, 0.5, 0); C('floorlamp', 0.9, 0.5, 0); if (t) topOn(t, 6); },
      // casino
      entree: function () { A('n', 'reception', 0.5); A('w', 'sofa', 0.3); A('w', 'sofa', 0.75); A('e', 'atm', 0.2); A('e', 'atm', 0.34); A('e', 'jukebox', 0.7); C('goldstatue', 0.5, 0.62, 0); C('floorlamp', 0.08, 0.1, 0); C('floorlamp', 0.92, 0.1, 0); A('s', 'brochure', 0.2); A('s', 'brochure', 0.8); Mt('n', 'neonsign', 0.5, 2.9, 7); Mt('w', 'neonsign', 0.5, 2.7, 6); Mt('e', 'tv', 0.5, 1.6); Mt('s', 'sconce', 0.35); Mt('s', 'sconce', 0.65); A('s', 'trashbin', 0.9); },
      vestiaire: function () { A('n', 'reception', 0.5); row('s', 'coatrack', 5, 0.1, 0.9); A('w', 'trolley', 0.5); A('e', 'trunk', 0.3); A('e', 'trunk', 0.7); C('trolley', 0.5, 0.65, 0); Mt('n', 'wcsign', 0.1, 1.8); Mt('w', 'wallshelf', 0.5, 1.6, 0); Mt('e', 'wallclock', 0.5); },
      cage: function () { A('n', 'reception', 0.3); A('n', 'reception', 0.72); A('n', 'safe', 0.1); A('n', 'safe', 0.92); A('w', 'atm', 0.3); A('w', 'atm', 0.7); A('s', 'cabinet', 0.2); A('s', 'cabinet', 0.4); A('s', 'trolley', 0.7); C('trolley', 0.5, 0.55, 0); A('e', 'desk', 0.5); Mt('e', 'wallclock', 0.5, 2.4); Mt('n', 'tv', 0.5, 1.6); },
      slots: function () {
        var rz = [cur.iz0 + 3.2, cur.iz0 + 11.4], x, k, g;
        rz.forEach(function (z) { x = cur.ix0 + 2.2; k = 0; while (x < cur.ix1 - 2.2) { if (k % 7 === 6) { x += 1.4; k++; continue; } tryPlace('slot', x, z, Math.PI, 0); tryPlace('slot', x, z + 0.64, 0, 0); tryPlace('barstool', x, z - 0.8, 0, 0); tryPlace('barstool', x, z + 1.45, 0, 0); x += 0.88; k++; } });
        C('goldstatue', 0.5, 0.36, 0); C('atm', 0.5, 0.95, 0); row('n', 'floorlamp', 3, 0.1, 0.9); mrow('n', 'neonsign', 3, 0.2, 0.8, 3.0, undefined); mrow('s', 'neonsign', 3, 0.2, 0.8, 3.0, undefined);
      },
      tables: function () {
        var k, t; for (k = 0; k < 3; k++) { t = C('roulette', 0.17 + k * 0.33, 0.28, 0); if (t) { ring(t, 5, 'barstool', 1.3); topOn(t, 2); } }
        for (k = 0; k < 4; k++) { t = C('blackjack', 0.14 + k * 0.24, 0.72, 180); if (t) { for (var q = 0; q < 4; q++) tryPlace('barstool', t.x + (q - 1.5) * 0.62, t.z - 1.0, 0, 0); topOn(t, 2); } }
        A('n', 'bar', 0.5); A('w', 'cocktail', 0.5); A('e', 'cocktail', 0.5); A('s', 'champagne', 0.05); A('s', 'champagne', 0.95); mrow('n', 'neonsign', 2, 0.25, 0.75, 2.9, undefined); mrow('s', 'neonsign', 2, 0.25, 0.75, 2.9, undefined); C('floorlamp', 0.5, 0.5, 0); C('dice', 0.5, 0.5, 20);
      },
      bar: function () { row('n', 'bar', 5, 0.14, 0.86); var k; for (k = 0; k < 11; k++) tryPlace('barstool', cur.ix0 + 2.4 + k * 2.4, cur.iz0 + 1.35, 0, 0); mrow('n', 'wallshelf', 4, 0.15, 0.85, 1.55, 0); A('e', 'jukebox', 0.5); var sf = A('s', 'sofa', 0.2); A('s', 'sofa', 0.5); A('s', 'sofa', 0.8); C('cocktail', 0.2, 0.62, 0); C('cocktail', 0.5, 0.62, 0); C('cocktail', 0.8, 0.62, 0); A('w', 'trolley', 0.5); mrow('s', 'neonsign', 2, 0.35, 0.65, 2.9, 2); Mt('e', 'tv', 0.2, 1.7); C('champagne', 0.5, 0.45, 0); },
      poker: function () { var k, t; for (k = 0; k < 6; k++) { t = C('poker', 0.2 + (k % 3) * 0.3, 0.3 + Math.floor(k / 3) * 0.4, 0); if (t) { ring(t, 6, 'chair'); topOn(t, 2); } } A('n', 'bar', 0.5); A('s', 'cocktail', 0.2); A('s', 'cocktail', 0.5); A('s', 'cocktail', 0.8); A('w', 'trolley', 0.5); A('e', 'jukebox', 0.5); mrow('n', 'tv', 2, 0.2, 0.8, 1.7); Mt('s', 'neonsign', 0.5, 2.9, 5); Mt('w', 'neonsign', 0.5, 2.9, 3); row('s', 'floorlamp', 2, 0.04, 0.96); },
      vip: function () { var k; for (k = 0; k < 3; k++) { var tb = C('table_round', 0.2 + k * 0.3, 0.45, 0); if (tb) { chairsAround(tb, 0, 0); } } C('sofa', 0.2, 0.25, 0); C('sofa', 0.5, 0.25, 0); C('sofa', 0.8, 0.25, 0); C('cocktail', 0.35, 0.52, 0); C('cocktail', 0.65, 0.52, 0); A('s', 'bar', 0.25); A('s', 'goldstatue', 0.6); A('s', 'goldstatue', 0.95); A('e', 'safe', 0.5); A('w', 'jukebox', 0.5); row('s', 'champagne', 2, 0.4, 0.5); C('armchair', 0.12, 0.7, 90); C('armchair', 0.88, 0.7, -90); mrow('n', 'bigpainting', 3, 0.2, 0.8, 2.0); Mt('s', 'tapestry', 0.8); C('floorlamp', 0.5, 0.9, 0); Mt('e', 'wallclock', 0.2); Mt('w', 'wallclock', 0.2); },
      direction: function () { var d = C('desk', 0.5, 0.4, 0); if (d) tryPlace('ochair', d.x, d.z - 0.8, 0, 0); A('w', 'safe', 0.8); A('e', 'bookshelf', 0.3); A('e', 'cabinet', 0.75); A('s', 'sofa', 0.4); A('s', 'dresser', 0.85); C('armchair', 0.15, 0.55, 90); C('globe', 0.85, 0.5, 0); mrow('n', 'painting', 2, 0.2, 0.8); Mt('w', 'wallclock', 0.3); if (d) topOn(d, 4); },
      securite: function () { mrow('n', 'tv', Math.max(2, Math.floor((cur.ix1 - cur.ix0) / 1.6)), 0.15, 0.85, 1.4, 0); var d = A('n', 'desk', 0.3), d2 = A('n', 'desk', 0.7); if (d) tryPlace('ochair', d.x, d.z + 0.85, Math.PI, 0); if (d2) tryPlace('ochair', d2.x, d2.z + 0.85, Math.PI, 0); A('w', 'cabinet', 0.4); A('w', 'cabinet', 0.6); A('e', 'waterdisp', 0.3); A('e', 'locker', 0.6); A('s', 'locker', 0.3); A('s', 'locker', 0.5); C('ochair', 0.5, 0.55, 20); C('printer', 0.8, 0.45, 0); Mt('s', 'extinguisher', 0.8); Mt('e', 'wallclock', 0.5); Mt('w', 'whiteboard', 0.5); if (d) topOn(d, 3); if (d2) topOn(d2, 3); },
      // station
      quartiers: function () { var side; ['w', 'e'].forEach(function (sd) { row(sd, 'bunk', 3, 0.15, 0.85); }); A('n', 'locker', 0.3); A('n', 'locker', 0.42); A('n', 'locker', 0.54); A('n', 'locker', 0.66); var t = C('table_round', 0.5, 0.55, 0); if (t) { ring(t, 3, 'stool'); topOn(t, 2); } A('s', 'trunk', 0.2); A('s', 'trunk', 0.5); A('s', 'o2tank', 0.8); Mt('s', 'tv', 0.5, 1.6); mrow('n', 'poster', 2, 0.2, 0.8, 1.7); Mt('e', 'wallclock', 0.5); Mt('w', 'wcsign', 0.5); },
      cantine: function () { var k, t; for (k = 0; k < 2; k++) { t = C('table_long', 0.3 + k * 0.4, 0.5, 90); if (t) { var cs = Math.cos(t.yaw), sn = Math.sin(t.yaw); [-1, 1].forEach(function (sd) { [-0.8, 0, 0.8].forEach(function (lx) { tryPlace('stool', t.x + lx * cs + sd * 0.7 * sn, t.z - lx * sn + sd * 0.7 * cs, 0, 0); }); }); topOn(t, 4); } }
        A('n', 'vending', 0.1); A('n', 'vending', 0.25); A('n', 'kcounter', 0.5); A('n', 'kcounter', 0.65); A('n', 'sinkunit', 0.8); A('n', 'fridge', 0.93); A('w', 'waterdisp', 0.5); A('s', 'trashbin', 0.1); A('s', 'trashbin', 0.9); Mt('s', 'tv', 0.5, 1.5); mrow('n', 'wallshelf', 2, 0.55, 0.85, 1.55, 0); Mt('e', 'wallclock', 0.5); Mt('e', 'extinguisher', 0.9); C('robot', 0.85, 0.85, 200); },
      infirmerie: function () { row('w', 'medbed', 3, 0.15, 0.85); A('n', 'cabinet', 0.3); A('n', 'cabinet', 0.45); A('n', 'cabinet', 0.6); A('n', 'sink', 0.85); A('e', 'console', 0.3); A('e', 'locker', 0.55); A('e', 'locker', 0.7); A('s', 'trolley', 0.3); A('s', 'o2tank', 0.6); A('s', 'o2tank', 0.7); C('robot', 0.6, 0.5, 90); C('medbed', 0.55, 0.3, 0); C('terminal', 0.55, 0.8, 180); Mt('e', 'wcsign', 0.1); Mt('s', 'poster', 0.8); Mt('n', 'tv', 0.2, 1.5); },
      reunion: function () { var t = C('meetingtable', 0.5, 0.5, 0); chairsAround(t, 4, 1, 'ochair'); A('n', 'whiteboard', 0.5, 0.04); A('n', 'cabinet', 0.08); A('n', 'cabinet', 0.92); A('s', 'waterdisp', 0.1); A('s', 'cabinet', 0.9); A('s', 'printer', 0.7); A('w', 'tv', 0.5); A('e', 'coatrack', 0.15); A('e', 'trashbin', 0.85); Mt('s', 'projscreen', 0.5, 1.5); Mt('w', 'tv', 0.5, 1.5); Mt('e', 'wallclock', 0.5); Mt('e', 'extinguisher', 0.9); mrow('n', 'poster', 2, 0.15, 0.85, 1.5); if (t) topOn(t, 7); },
      cryo: function () { row('w', 'cryopod', 4, 0.12, 0.88); row('e', 'cryopod', 4, 0.12, 0.88); C('console', 0.5, 0.25, 0); C('console', 0.5, 0.75, 180); A('n', 'locker', 0.3); A('n', 'locker', 0.7); A('s', 'o2tank', 0.3); A('s', 'o2tank', 0.45); A('s', 'techcrate', 0.7); C('terminal', 0.5, 0.5, 0); C('robot', 0.5, 0.12, 0); Mt('n', 'exitsign', 0.5); Mt('s', 'wcsign', 0.5); Mt('w', 'extinguisher', 0.5); },
      labo: function () { C('holotable', 0.5, 0.3, 0); C('holotable', 0.5, 0.7, 0); var k; for (k = 0; k < 3; k++) { var d = A('w', 'desk', 0.2 + k * 0.3); if (d) { tryPlace('ochair', d.x + 0.78, d.z, Math.PI / 2, 0); topOn(d, 3); } } A('e', 'console', 0.2); A('e', 'monitors', 0.5); A('e', 'terminal', 0.8); A('n', 'locker', 0.5); A('s', 'cabinet', 0.3); A('s', 'cabinet', 0.6); A('s', 'cabledrum', 0.9); C('robot', 0.85, 0.5, 90); Mt('n', 'whiteboard', 0.3); Mt('n', 'tv', 0.75); Mt('s', 'poster', 0.5); Mt('w', 'exitsign', 0.5); },
      reacteur: function () { C('reactor', 0.5, 0.5, 0); var k; for (k = 0; k < 4; k++) { var a = TAU * k / 4 + 0.78; tryPlace('console', cur.cx + Math.sin(a) * 4.8, cur.cz + Math.cos(a) * 4.8, a + Math.PI, 0); } row('w', 'cabledrum', 3, 0.15, 0.85); row('e', 'o2tank', 4, 0.1, 0.9); A('n', 'techcrate', 0.2); A('n', 'techcrate', 0.8); A('s', 'techcrate', 0.2); A('s', 'techcrate', 0.8); A('n', 'antenna', 0.5); A('s', 'container', 0.5); C('robot', 0.2, 0.2, 0); Mt('n', 'extinguisher', 0.35); Mt('s', 'extinguisher', 0.35); Mt('w', 'exitsign', 0.5); },
      passerelle: function () { row('n', 'console', 5, 0.12, 0.88); mrow('n', 'tv', 3, 0.25, 0.75, 1.5, 0); C('armchair', 0.5, 0.3, 180); C('holotable', 0.5, 0.58, 0); row('w', 'terminal', 2, 0.3, 0.7); row('e', 'terminal', 2, 0.3, 0.7); A('s', 'monitors', 0.3); A('s', 'monitors', 0.7); A('s', 'locker', 0.1); A('s', 'locker', 0.9); C('robot', 0.85, 0.75, 220); Mt('w', 'wallclock', 0.5); Mt('e', 'exitsign', 0.5); },
      hangar: function () { row('n', 'container', 5, 0.1, 0.9); A('n', 'techcrate', 0.02); row('s', 'locker', 5, 0.1, 0.5); A('s', 'cabledrum', 0.62); A('s', 'cabledrum', 0.7); A('s', 'o2tank', 0.8); A('s', 'o2tank', 0.86); A('s', 'antenna', 0.95); var k; for (k = 0; k < 6; k++) C('techcrate', 0.15 + k * 0.13, 0.5, 0); C('trolley', 0.5, 0.3, 0); C('robot', 0.3, 0.75, 10); C('robot', 0.7, 0.75, -10); Mt('n', 'exitsign', 0.5); Mt('s', 'extinguisher', 0.6); },
      machines: function () { row('n', 'cabledrum', 4, 0.1, 0.9); row('s', 'o2tank', 5, 0.1, 0.9); C('console', 0.5, 0.5, 0); C('console', 0.3, 0.5, 0); A('w', 'techcrate', 0.5); A('e', 'container', 0.3); A('e', 'techcrate', 0.8); C('robot', 0.7, 0.5, 0); A('n', 'locker', 0.02); Mt('w', 'extinguisher', 0.2); Mt('e', 'wcsign', 0.5); },
      douches: function () { var ns = 4; row('n', 'wcstall', ns, 0.08, 0.9); row('s', 'shower', 4, 0.1, 0.8); row('w', 'sink', 3, 0.2, 0.8); mrow('w', 'wmirror', 3, 0.2, 0.8, 1.3, 0); A('e', 'locker', 0.3); A('e', 'locker', 0.45); A('e', 'trashbin', 0.8); Mt('e', 'wcsign', 0.6); Mt('n', 'wallclock', 0.5, 2.6); },
      // musée
      accueil: function () { A('n', 'reception', 0.5); A('n', 'brochure', 0.2); A('n', 'brochure', 0.8); row('w', 'coatrack', 4, 0.15, 0.85); A('s', 'museumbench', 0.3); A('s', 'museumbench', 0.7); A('e', 'sofa', 0.4); C('pedestal', 0.5, 0.58, 0); C('stanchion', 0.35, 0.65, 0); C('stanchion', 0.65, 0.65, 0); A('e', 'trashbin', 0.9); mrow('e', 'poster', 2, 0.15, 0.55, 1.5); Mt('n', 'neonsign', 0.5, 3.4, 8); Mt('w', 'tapestry', 0.5); Mt('s', 'wallclock', 0.5, 2.6); Mt('e', 'tv', 0.78, 1.6); },
      egypte: function () { row('n', 'sarcophagus', 3, 0.2, 0.8); C('showcase', 0.3, 0.55, 0); C('showcase', 0.5, 0.55, 0); C('showcase', 0.7, 0.55, 0); row('s', 'amphora', 4, 0.1, 0.9); row('w', 'urn', 2, 0.3, 0.7); row('e', 'urn', 2, 0.3, 0.7); C('column', 0.15, 0.4, 0); C('column', 0.85, 0.4, 0); C('column', 0.15, 0.8, 0); C('column', 0.85, 0.8, 0); C('museumbench', 0.5, 0.82, 0); C('stanchion', 0.2, 0.6, 0); C('stanchion', 0.8, 0.6, 0); mrow('n', 'tapestry', 4, 0.1, 0.9, 1.6, undefined); mrow('s', 'painting', 3, 0.2, 0.8, 2.1); Mt('w', 'poster', 0.5); },
      antique: function () { row('n', 'pedestal', 6, 0.08, 0.92); row('s', 'column', 6, 0.06, 0.94); C('showcase', 0.35, 0.5, 0); C('showcase', 0.65, 0.5, 0); C('amphora', 0.15, 0.5, 0); C('amphora', 0.85, 0.5, 0); C('urn', 0.5, 0.3, 0); C('museumbench', 0.5, 0.75, 0); A('w', 'bust', 0.5); A('e', 'bust', 0.5); mrow('n', 'bigpainting', 3, 0.2, 0.8, 2.3); mrow('s', 'painting', 3, 0.2, 0.8, 2.2); Mt('w', 'poster', 0.3); Mt('e', 'poster', 0.7); },
      boutique: function () { row('n', 'shelfunit', 3, 0.2, 0.8); row('s', 'shelfunit', 3, 0.2, 0.8); C('shelfunit', 0.5, 0.35, 90); C('shelfunit', 0.5, 0.65, 90); A('w', 'reception', 0.5); A('e', 'brochure', 0.2); A('e', 'brochure', 0.5); A('e', 'brochure', 0.8); C('globe', 0.3, 0.5, 0); C('giftbox', 0.7, 0.5, 0); A('w', 'trashbin', 0.1); mrow('e', 'poster', 3, 0.15, 0.85, 1.6); Mt('n', 'neonsign', 0.5, 3.4, 4); Mt('s', 'wallclock', 0.5, 2.6); },
      dino: function () { C('dinoskull', 0.5, 0.5, 90); C('dinoskull', 0.5, 0.25, 90); C('pedestal', 0.15, 0.2, 0); C('pedestal', 0.85, 0.2, 0); row('w', 'showcase', 3, 0.2, 0.8); row('e', 'showcase', 3, 0.2, 0.8); C('museumbench', 0.5, 0.82, 0); C('column', 0.15, 0.85, 0); C('column', 0.85, 0.85, 0); A('s', 'amphora', 0.3); A('s', 'amphora', 0.7); C('stanchion', 0.3, 0.38, 0); C('stanchion', 0.7, 0.38, 0); mrow('n', 'bigpainting', 3, 0.2, 0.8, 2.3); mrow('s', 'poster', 3, 0.2, 0.8, 1.6); },
      rotonde: function () { C('goldstatue', 0.5, 0.5, 0); var k; for (k = 0; k < 8; k++) { var a = TAU * k / 8; tryPlace('column', cur.cx + Math.sin(a) * 5.5, cur.cz + Math.cos(a) * 5.5, 0, 0); } for (k = 0; k < 6; k++) { var b = TAU * (k + 0.5) / 6; tryPlace('museumbench', cur.cx + Math.sin(b) * 3.2, cur.cz + Math.cos(b) * 3.2, b + Math.PI / 2, 0); } row('n', 'pedestal', 3, 0.2, 0.8); row('s', 'pedestal', 3, 0.2, 0.8); mrow('n', 'bigpainting', 3, 0.2, 0.8, 2.6); mrow('s', 'bigpainting', 3, 0.2, 0.8, 2.6); A('w', 'bust', 0.4); A('e', 'bust', 0.4); A('w', 'showcase', 0.7); A('e', 'showcase', 0.7); C('stanchion', 0.38, 0.5, 0); C('stanchion', 0.62, 0.5, 0); },
      art: function () { var k; for (k = 0; k < 6; k++) C('easel', 0.12 + (k % 3) * 0.38, 0.3 + Math.floor(k / 3) * 0.4, 0); mrow('n', 'bigpainting', 3, 0.2, 0.8, 2.3); mrow('s', 'bigpainting', 3, 0.2, 0.8, 2.3); mrow('w', 'painting', 3, 0.2, 0.8, 2.2); mrow('e', 'painting', 3, 0.2, 0.8, 2.2); C('museumbench', 0.5, 0.5, 90); C('pedestal', 0.28, 0.58, 0); C('pedestal', 0.72, 0.58, 0); A('s', 'showcase', 0.2); A('s', 'showcase', 0.8); A('n', 'pedestal', 0.05); A('n', 'pedestal', 0.95); C('stanchion', 0.45, 0.35, 0); C('stanchion', 0.55, 0.35, 0); },
      cafe: function () { var k; for (k = 0; k < 6; k++) { var t = C('table_round', 0.2 + (k % 3) * 0.3, 0.45 + Math.floor(k / 3) * 0.33, 0); if (t) { ring(t, 3, 'chair'); topOn(t, 2); } } A('n', 'bar', 0.3); A('n', 'bar', 0.62); A('n', 'fridge', 0.9); A('n', 'stove', 0.04); mrow('n', 'wallshelf', 3, 0.2, 0.7, 1.55, 0); var q; for (q = 0; q < 5; q++) tryPlace('barstool', cur.ix0 + 2.2 + q * 1.4, cur.iz0 + 1.3, 0, 0); A('w', 'trashbin', 0.5); A('s', 'showcase', 0.5); Mt('n', 'neonsign', 0.78, 3.0, 1); Mt('e', 'tv', 0.5, 1.8); Mt('s', 'wallclock', 0.5); mrow('w', 'poster', 2, 0.2, 0.8, 1.6); },
      reserve: function () { row('n', 'shelfunit', 3, 0.2, 0.8); var k; for (k = 0; k < 4; k++) C('crate', 0.15 + k * 0.1, 0.4, 0); A('w', 'woodcrate', 0.3); A('w', 'woodcrate', 0.7); C('sarcophagus', 0.55, 0.62, 90); C('easel', 0.85, 0.35, 0); C('table_long', 0.5, 0.85, 0); A('e', 'cabinet', 0.3); A('e', 'ladder', 0.6); A('s', 'trolley', 0.1); C('cartonbox', 0.8, 0.7, 0); C('trashbin', 0.9, 0.9, 0); Mt('s', 'extinguisher', 0.7); Mt('e', 'wallclock', 0.5); Mt('w', 'whiteboard', 0.5); }
    };
    // aliases : musée / casino réutilisent les gabarits communs
    TPL.cuisineC = TPL.cuisine;
    // le mobilier de chaque pièce, puis des petits objets sur les meubles
    rooms.forEach(function (rm) { cur = rm; var f = TPL[rm.kind]; if (f) { try { f(); } catch (e) { /* gabarit incomplet : on garde ce qui est placé */ } } });
    props.slice().forEach(function (p) { cur = byId[p.room]; if (ITEMS[p.t] && p.y === 0 && ITEMS[p.t].length && r() < 0.8) topOn(p, 1 + Math.floor(r() * 2)); });
    // quelques objets en plus dans les grandes pièces vides (au sol, libres)
    rooms.forEach(function (rm) { cur = rm; var extra = Math.floor(rm.area / (M.style === 'station' || M.style === 'musee' ? 45 : 80)), tries = 0, n = 0, filler = { bibliotheque: ['floorlamp', 'vase'], salon: ['vase', 'floorlamp'], hall: ['vase', 'bust'], bal: ['vase', 'candelabra'], slots: ['goldstatue'], tables: ['floorlamp'], vip: ['champagne'], cantine: ['trashbin'], hangar: ['techcrate', 'o2tank', 'cabledrum'], machines: ['o2tank', 'cabledrum', 'techcrate'], egypte: ['urn', 'amphora', 'stanchion'], antique: ['amphora', 'urn', 'stanchion'], art: ['pedestal', 'stanchion'], dino: ['pedestal', 'stanchion', 'museumbench'], rotonde: ['pedestal', 'stanchion'],
      quartiers: ['locker', 'trunk', 'o2tank'], infirmerie: ['o2tank', 'trolley', 'robot'], reunion: ['ochair', 'trashbin', 'floorlamp'], cryo: ['o2tank', 'techcrate'], labo: ['techcrate', 'cabledrum', 'robot'], reacteur: ['cabledrum', 'techcrate', 'o2tank'], passerelle: ['terminal', 'robot', 'techcrate'], douches: ['trashbin'],
      accueil: ['pedestal', 'stanchion', 'museumbench'], boutique: ['giftbox', 'globe'], cafe: ['trashbin', 'stool', 'barstool'], reserve: ['crate', 'cartonbox', 'woodcrate'], salle: ['floorlamp'], bureau: ['floorlamp'], chambre: ['floorlamp', 'stool'] }[rm.kind];
      if (!filler) return; while (n < extra && tries++ < 40) { var t = pick(r, filler); if (tryPlace(t, cur.ix0 + 1 + r() * (cur.ix1 - cur.ix0 - 2), cur.iz0 + 1 + r() * (cur.iz1 - cur.iz0 - 2), r() * TAU, 0)) n++; } });

    /* --- points de départ : les chasseurs dans la pièce de départ, les cachés un peu partout (toujours dans un endroit dégagé) --- */
    function freeSpot(x, z, rad) { var b = { x0: x - rad, x1: x + rad, z0: z - rad, z1: z + rad, y0: 0.05, y1: 1.6 }; for (var q = 0; q < reg.length; q++) if (!reg[q].door && overlap(b, reg[q], 0)) return false; for (q = 0; q < walls.length; q++) if (b.x0 < walls[q].x1 && b.x1 > walls[q].x0 && b.z0 < walls[q].z1 && b.z1 > walls[q].z0) return false; return true; }
    var spawnS = [], spawnH = [], k2;
    for (i = 0; i < 6; i++) spawnS.push([sp.cx + (i % 3 - 1) * 1.7, sp.cz + (Math.floor(i / 3) - 0.5) * 1.7]);
    rooms.forEach(function (rm) { var n = 0, tr = 0, want = Math.max(5, Math.round(rm.area / 25)); while (n < want && tr++ < 200) { var x = rm.ix0 + 0.8 + r() * (rm.ix1 - rm.ix0 - 1.6), z = rm.iz0 + 0.8 + r() * (rm.iz1 - rm.iz0 - 1.6); if (freeSpot(x, z, 0.5)) { spawnH.push([+x.toFixed(2), +z.toFixed(2)]); n++; } } });
    props.forEach(function (p) { delete p.box; });
    return { id: id, name: M.name, style: M.style, indoor: true, W: W, D: D, H: H, walls: walls, blocks: [], rooms: rooms, doors: doors, deco: deco, props: props, spawnH: spawnH, spawnS: spawnS };
  }

  /* ------------------------------ plein air : marché de nuit et port ------------------------------ */
  function outdoorMap(id, M) {
    var r = rng(M.seed), hw = M.W / 2, hd = M.D / 2, T = 0.3, walls = [], blocks = [], rooms = [], props = [], reg = [], i;
    function wallBox(x0, z0, x1, z1, h) { walls.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: 0, y1: h }); }
    wallBox(-hw - T / 2, -hd - T / 2, hw + T / 2, -hd + T / 2, M.H); wallBox(-hw - T / 2, hd - T / 2, hw + T / 2, hd + T / 2, M.H); wallBox(-hw - T / 2, -hd, -hw + T / 2, hd, M.H); wallBox(hw - T / 2, -hd, hw + T / 2, hd, M.H);
    var cell = id === 'port' ? 20 : 16, ncx = Math.floor(M.W / cell), ncz = Math.floor(M.D / cell), ox = -ncx * cell / 2, oz = -ncz * cell / 2, bi, bj;
    for (bi = 0; bi < ncx; bi++) for (bj = 0; bj < ncz; bj++) {
      var plaza = (bi === Math.floor(ncx / 2) && bj === Math.floor(ncz / 2)) || (id === 'marche' && bj === Math.floor(ncz / 2));
      if (plaza || (bi === 0 && bj === 0) || r() < 0.18) continue;
      var bw = cell - 6 - r() * 3, bd = cell - 6 - r() * 3, bx = ox + bi * cell + cell / 2, bz = oz + bj * cell + cell / 2, bh = id === 'port' ? 3.2 + Math.floor(r() * 2) * 2.6 : 6 + r() * 4;
      var bl = { x0: +(bx - bw / 2).toFixed(2), z0: +(bz - bd / 2).toFixed(2), x1: +(bx + bw / 2).toFixed(2), z1: +(bz + bd / 2).toFixed(2), y1: +bh.toFixed(2), kind: id === 'port' ? (r() < 0.5 ? 'conteneurs' : 'entrepot') : (r() < 0.5 ? 'immeuble' : 'boutique') };
      blocks.push(bl); wallBox(bl.x0, bl.z0, bl.x1, bl.z1, bl.y1); reg.push({ x0: bl.x0, x1: bl.x1, z0: bl.z0, z1: bl.z1, y0: 0, y1: bl.y1 });
    }
    reg.push({ x0: -hw + 1, x1: -hw + 7.5, z0: -hd + 1, z1: -hd + 6.5, y0: 0, y1: 3 });                    // le départ des chasseurs reste libre
    function tryPlace(t, x, z, yaw, y, margin, v) {
      var b = boxOf(t, x, z, yaw, y); if (b.x0 < -hw + 0.8 || b.x1 > hw - 0.8 || b.z0 < -hd + 0.8 || b.z1 > hd - 0.8) return null;
      for (var q = 0; q < reg.length; q++) if (overlap(b, reg[q], y > 0 || WALLT[t] ? 0.0 : margin)) return null;
      var p = { t: t, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), yaw: +yaw.toFixed(3), s: 1, v: v || 0, room: 'dehors' }; props.push(p); reg.push(b); return p;
    }
    var ZONES = id === 'marche' ? {
      food: { noodle: 5, stall: 4, stool: 7, parasol: 5, cooler: 3, trashbin: 2, barrel: 2, basket: 1 }, produce: { basket: 6, sack: 4, crate: 7, ricebag: 4, stall: 4, cartonbox: 5, barrel: 2 }, fish: { fishcrate: 7, barrel: 4, cooler: 4, crate: 5, ricebag: 2, stall: 2, trashbin: 1 }, street: { lamppost: 3, trashbin: 3, crate: 3, barrel: 2, cartonbox: 3, stool: 2 }
    } : {
      containers: { shipcontainer: 9, woodcrate: 2, oildrum: 2, pallet: 2 }, dock: { bollard: 5, ropecoil: 4, anchor: 2, buoy: 4, netpile: 4, lifebuoy: 2, fishbarrel: 3, barrel: 2 }, cargo: { pallet: 7, woodcrate: 6, crate: 5, oildrum: 5, cartonbox: 3, barrel: 3 }, workshop: { toolbox: 4, gascan: 4, oildrum: 4, trolley: 2, woodcrate: 2, pallet: 2, barrel: 2 }
    };
    var zn = Object.keys(ZONES);
    function zoneAt(x, z) { if (id === 'port' && z > hd - 14) return 'dock'; var h = Math.abs(Math.floor(x / 15) * 7 + Math.floor(z / 15) * 13 + M.seed) % zn.length; return zn[h]; }
    var tries = 0, ground = Math.floor(M.target * 0.75);
    while (props.length < ground && tries++ < ground * 40) {
      var x = -hw + 2 + r() * (M.W - 4), z = -hd + 2 + r() * (M.D - 4), t = wpick(r, ZONES[zoneAt(x, z)]), yaw = (t === 'shipcontainer' ? (r() < 0.5 ? 0 : Math.PI / 2) : (r() < 0.6 ? Math.floor(r() * 4) * Math.PI / 2 : r() * TAU)), p;
      if (t === 'shipcontainer') { p = tryPlace(t, x, z, yaw, 0, 0.5); if (p) { var lv = 1; while (lv < 3 && r() < 0.6) { if (!tryPlace(t, x, z, yaw, lv * 2.6, 0)) break; lv++; } } }
      else p = tryPlace(t, x, z, yaw, 0, 0.5);
    }
    // des objets posés sur d'autres objets (caisses empilées, paniers sur des caisses, bidons sur des palettes…)
    props.slice().forEach(function (p) { var list = ITEMS[p.t]; if (!list || !list.length || p.y > 0 || p.t === 'shipcontainer' || r() > 0.55) return; var hb = PROPS[p.t], top = hb[1] * 2, t = pick(r, list), ib = PROPS[t]; if (ib[0] > hb[0] - 0.02 || ib[2] > hb[2] - 0.02) return; tryPlace(t, p.x + (r() - 0.5) * (hb[0] - ib[0]) * 1.2, p.z + (r() - 0.5) * (hb[2] - ib[2]) * 1.2, r() * TAU, top, 0); });
    // objets accrochés aux façades des bâtiments (climatiseurs, enseignes, affiches, bannières, lampes…)
    var MOUNTS = id === 'marche' ? ['ac', 'neonsign', 'neonsign', 'banner', 'poster', 'sconce', 'wallclock'] : ['sconce', 'banner', 'ac', 'exitsign', 'extinguisher', 'poster', 'wcsign'];
    blocks.forEach(function (b) {
      [['n', b.x1 - b.x0], ['s', b.x1 - b.x0], ['w', b.z1 - b.z0], ['e', b.z1 - b.z0]].forEach(function (sd) {
        var len = sd[1], n = Math.floor(len / 3.2), k;
        for (k = 0; k < n; k++) {
          if (r() < 0.25) continue; var t = pick(r, MOUNTS), hz = PROPS[t][2], a = (k + 0.5) / n * len, y = WALLY[t] + (r() < 0.3 ? 0.3 : 0), v = Math.floor(r() * 8);
          if (sd[0] === 'n') tryPlace(t, b.x0 + a, b.z0 - hz - 0.01, Math.PI, y, 0, v); else if (sd[0] === 's') tryPlace(t, b.x0 + a, b.z1 + hz + 0.01, 0, y, 0, v);
          else if (sd[0] === 'w') tryPlace(t, b.x0 - hz - 0.01, b.z0 + a, -Math.PI / 2, y, 0, v); else tryPlace(t, b.x1 + hz + 0.01, b.z0 + a, Math.PI / 2, y, 0, v);
        }
      });
    });
    function freeSpot(x, z, rad) { var b = { x0: x - rad, x1: x + rad, z0: z - rad, z1: z + rad, y0: 0.05, y1: 1.6 }; for (var q = 0; q < reg.length; q++) if (overlap(b, reg[q], 0)) return false; return true; }
    var spawnH = [], spawnS = [];
    for (i = 0; i < 90; i++) { var sx = -hw + 3 + r() * (M.W - 6), sz = -hd + 3 + r() * (M.D - 6); if (freeSpot(sx, sz, 0.5)) spawnH.push([+sx.toFixed(2), +sz.toFixed(2)]); }
    for (i = 0; i < 6; i++) spawnS.push([-hw + 3 + (i % 3) * 1.8, -hd + 3 + Math.floor(i / 3) * 1.8]);
    rooms.push({ x0: -hw, z0: -hd, x1: hw, z1: hd, ix0: -hw, ix1: hw, iz0: -hd, iz1: hd, cx: 0, cz: 0, kind: 'dehors', id: 'dehors', area: M.W * M.D });
    return { id: id, name: M.name, style: M.style, indoor: false, W: M.W, D: M.D, H: M.H, walls: walls, blocks: blocks, rooms: rooms, doors: [], deco: [], props: props, spawnH: spawnH, spawnS: spawnS };
  }

  function makeMap(id) {
    if (CACHE[id]) return CACHE[id];
    var M = MAPS[id]; if (!M) return null;
    var map = M.indoor ? indoorMap(id, M, LAYOUT[id]) : outdoorMap(id, M);
    map.props.forEach(function (p, k) { p.i = k; var b = PROPS[p.t]; p.hx = b[0]; p.hy = b[1]; p.hz = b[2]; });
    CACHE[id] = map; return map;
  }

  /* ------------------------------ les déplacements ------------------------------ */
  var RADIUS = 0.38, EYE = 1.62, WALK = 4.3, RUN = 6.6, JUMP = 4.7, GRAV = 14, STEP = 0.35;
  function newPlayer() { return { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, air: false, r: RADIUS, h: 1.8, eye: EYE }; }
  // met un joueur en forme d'objet (cachés) ou à sa taille normale
  function setShape(c, propType) {
    if (!propType || !PROPS[propType]) { c.r = RADIUS; c.h = 1.8; c.eye = EYE; return; }
    var b = PROPS[propType]; c.r = Math.max(0.22, Math.min(1.0, Math.max(b[0], b[2]) * 0.92)); c.h = b[1] * 2; c.eye = Math.max(0.5, b[1] * 2 * 0.8);
  }
  // les rectangles solides de la carte : murs et objets (avec leur hauteur de pose y0 et leur sommet y1)
  var PROP_RECTS = {};
  function rectsOf(map) {
    if (PROP_RECTS[map.id]) return PROP_RECTS[map.id];
    var out = { walls: map.walls, props: [] };
    map.props.forEach(function (p) { var b = boxOf(p.t, p.x, p.z, p.yaw, p.y); out.props.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y0: b.y0, y1: b.y1 }); });
    PROP_RECTS[map.id] = out; return out;
  }
  function collideCircle(c, list) {
    for (var pass = 0; pass < 3; pass++) {
      for (var k = 0; k < list.length; k++) {
        var w = list[k], wy0 = w.y0 || 0; if (c.y + 0.32 >= w.y1 || c.y + c.h <= wy0 + 0.01) continue;             // on passe par-dessus (saut) ou par-dessous (objet accroché haut)
        var nx = Math.max(w.x0, Math.min(c.x, w.x1)), nz = Math.max(w.z0, Math.min(c.z, w.z1)), dx = c.x - nx, dz = c.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= c.r * c.r) continue;
        if (d2 > 1e-9) { var d = Math.sqrt(d2), push = c.r - d; c.x += dx / d * push; c.z += dz / d * push; }
        else { var l = c.x - w.x0, rr = w.x1 - c.x, t = c.z - w.z0, b = w.z1 - c.z, m = Math.min(l, rr, t, b); if (m === l) c.x = w.x0 - c.r; else if (m === rr) c.x = w.x1 + c.r; else if (m === t) c.z = w.z0 - c.r; else c.z = w.z1 + c.r; }
      }
    }
  }
  // la hauteur du sol sous un joueur : le dessus du plus haut objet sur lequel il se trouve et qu'il peut atteindre (on peut monter sur les meubles en sautant)
  function floorAt(c, props) {
    var best = 0;
    for (var k = 0; k < props.length; k++) { var w = props[k]; if (w.y1 <= best || w.y1 > c.y + STEP + 0.001) continue; if (c.x > w.x0 - 0.05 && c.x < w.x1 + 0.05 && c.z > w.z0 - 0.05 && c.z < w.z1 + 0.05) best = w.y1; }
    return best;
  }
  // un pas de déplacement : inp = { f, s, run, jump, yaw, pitch }
  function stepPlayer(c, inp, dt, map) {
    c.yaw = inp.yaw; c.pitch = inp.pitch;
    var sp = (inp.run ? RUN : WALK) * (c.r > RADIUS ? 0.85 : 1), f = Math.max(-1, Math.min(1, inp.f || 0)), s = Math.max(-1, Math.min(1, inp.s || 0)), len = Math.hypot(f, s) || 1;
    if (len > 1) { f /= len; s /= len; }
    var sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), tx = (sy * f + cy * s) * sp, tz = (-cy * f + sy * s) * sp, R = rectsOf(map);
    var k = 1 - Math.exp(-dt * (c.air ? 3 : 14)); c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
    if (inp.jump && !c.air) { c.vy = JUMP; c.air = true; }
    c.vy -= GRAV * dt; c.y += c.vy * dt;
    c.x += c.vx * dt; c.z += c.vz * dt;
    collideCircle(c, R.walls); collideCircle(c, R.props);
    var fl = floorAt(c, R.props);
    if (c.y <= fl && c.vy <= 0) { c.y = fl; c.vy = 0; c.air = false; } else if (c.y > fl + 0.005) c.air = true;
    var hw = map.W / 2 - c.r, hd = map.D / 2 - c.r; c.x = Math.max(-hw, Math.min(hw, c.x)); c.z = Math.max(-hd, Math.min(hd, c.z));
  }

  /* ------------------------------ les tirs ------------------------------ */
  // intersection rayon / boîte ; renvoie la distance ou -1
  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    var tmin = 0, tmax = 1e9, a;
    var O = [ox, oy, oz], D = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (a = 0; a < 3; a++) {
      if (Math.abs(D[a]) < 1e-9) { if (O[a] < lo[a] || O[a] > hi[a]) return -1; }
      else { var t1 = (lo[a] - O[a]) / D[a], t2 = (hi[a] - O[a]) / D[a]; if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    }
    return tmin;
  }
  // tire un rayon depuis l'œil : renvoie { t, kind: 'wall' | 'prop' | 'hider', ref } le plus proche ; hiders = [{ k, x, y0, z, r, h }] (cachés, en forme d'objet)
  function raycast(map, ox, oy, oz, yaw, pitch, maxD, hiders) {
    var cp = Math.cos(pitch), dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp, best = { t: maxD, kind: '', ref: null }, t, R = rectsOf(map);
    map.walls.forEach(function (w) { t = rayBox(ox, oy, oz, dx, dy, dz, w.x0, 0, w.z0, w.x1, w.y1, w.z1); if (t >= 0 && t < best.t) best = { t: t, kind: 'wall', ref: w }; });
    map.props.forEach(function (p, i) { var b = R.props[i]; t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t >= 0 && t < best.t) best = { t: t, kind: 'prop', ref: p }; });
    (hiders || []).forEach(function (h) { t = rayBox(ox, oy, oz, dx, dy, dz, h.x - h.r, h.y0 || 0, h.z - h.r, h.x + h.r, h.h, h.z + h.r); if (t >= 0 && t < best.t) best = { t: t, kind: 'hider', ref: h }; });
    return best;
  }

  // les armes des chasseurs : dégâts, cadence (s entre deux tirs), chargeur, rechargement (s), dispersion (rad), tir en rafale
  var WEAPONS = {
    pistolet: { name: 'Pistolet', dmg: 34, cd: 0.34, mag: 12, reload: 1.5, spread: 0.006, auto: false },
    revolver: { name: 'Revolver', dmg: 75, cd: 0.85, mag: 6, reload: 2.4, spread: 0.003, auto: false },
    fusil: { name: 'Fusil d\'assaut', dmg: 22, cd: 0.11, mag: 30, reload: 2.0, spread: 0.014, auto: true },
    carabine: { name: 'Carabine', dmg: 55, cd: 0.62, mag: 8, reload: 2.2, spread: 0.0015, auto: false },
    // une seule grenade (pas de rechargement) : elle explose là où elle tombe et blesse tous les cachés autour (rayon en mètres)
    lance: { name: 'Lance-grenade', dmg: 120, cd: 1.0, mag: 1, reload: 0, spread: 0.002, auto: false, radius: 4.2 }
  };
  var WEAPON_IDS = ['pistolet', 'revolver', 'fusil', 'carabine', 'lance'];
  var TIMES = { lobby: 20, hide: 30, hunt: 240, results: 12 };

  var API = { WEAPONS: WEAPONS, WEAPON_IDS: WEAPON_IDS, TIMES: TIMES, PROPS: PROPS, PROP_IDS: PROP_IDS, WALLY: WALLY, WALLT: WALLT, MAPS: MAPS, MAP_IDS: MAP_IDS, makeMap: makeMap, newPlayer: newPlayer, setShape: setShape, stepPlayer: stepPlayer, raycast: raycast, rectsOf: rectsOf, boxOf: boxOf, RADIUS: RADIUS, EYE: EYE, WALK: WALK, RUN: RUN, rng: rng };
  return API;
})();
export default SIM;
