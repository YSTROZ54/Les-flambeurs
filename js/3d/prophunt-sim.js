/* =====================================================================
   prophunt-sim.js — PROP HUNT : les cartes, les objets, les déplacements et les tirs (aucun dessin, aucun réseau)
   ---------------------------------------------------------------------
   Utilisé par le navigateur (prophunt3d.js : dessin des cartes, prédiction de mon déplacement) ET par le serveur (api/_propSim.js, copie générée par
   scripts/sync-sims.mjs) : le serveur fait avancer tous les joueurs, décide des tirs et des dégâts avec ce code.
   Six cartes, construites par programme et toujours identiques (graine fixe) : le navigateur et le serveur obtiennent exactement la même liste d'objets.
   ===================================================================== */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------ les objets : demi-dimensions de la boîte de collision (largeur, hauteur, profondeur en mètres, divisées par 2) ------------------------------ */
  var PROPS = {
    // maison / manoir
    chair: [0.26, 0.48, 0.26], armchair: [0.45, 0.45, 0.45], sofa: [1.0, 0.42, 0.45], table_round: [0.6, 0.38, 0.6], table_long: [1.3, 0.38, 0.45], bookshelf: [0.6, 1.0, 0.18],
    wardrobe: [0.55, 1.05, 0.3], bed: [0.55, 0.3, 1.0], piano: [0.75, 0.55, 0.65], clock: [0.2, 1.0, 0.14], fireplace: [0.85, 0.65, 0.3], floorlamp: [0.16, 0.85, 0.16],
    vase: [0.16, 0.34, 0.16], bust: [0.18, 0.62, 0.18], armor: [0.28, 0.9, 0.22], globe: [0.28, 0.5, 0.28], dresser: [0.55, 0.45, 0.25], desk: [0.7, 0.4, 0.35], candelabra: [0.14, 0.55, 0.14],
    trunk: [0.4, 0.25, 0.25], bench: [0.7, 0.24, 0.2], stool: [0.2, 0.25, 0.2], teatable: [0.3, 0.3, 0.3], mirror: [0.4, 0.9, 0.12],
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
    fishbarrel: [0.3, 0.4, 0.3], pallet: [0.6, 0.15, 0.5], oildrum: [0.3, 0.45, 0.3], toolbox: [0.3, 0.18, 0.15], gascan: [0.2, 0.3, 0.12], woodcrate: [0.55, 0.5, 0.55]
  };
  var PROP_IDS = Object.keys(PROPS);

  /* ------------------------------ les cartes ------------------------------ */
  var MAPS = {
    manoir: { name: 'Le Manoir', icon: '🏠', style: 'manoir', indoor: true, desc: 'Un vieux manoir : salons, bibliothèque, cuisine et chambres', W: 64, D: 44, H: 4.6, seed: 11, cols: [18, 26, 20], rows: [[20, 24], [24, 20], [22, 22]], target: 80,
      kinds: [['bibliotheque', 'salle'], ['grandhall', 'salon', 'salle'], ['cuisine', 'chambre']] },
    casino: { name: 'Casino des Flambeurs', icon: '🎰', style: 'casino', indoor: true, desc: 'Machines à sous, roulettes, bar et salon VIP', W: 72, D: 48, H: 5.2, seed: 23, cols: [24, 24, 24], rows: [[24, 24], [48], [24, 24]], target: 95,
      kinds: [['slots', 'vip'], ['salle'], ['poker', 'bar']] },
    marche: { name: 'Marché de nuit', icon: '🌙', style: 'marche', indoor: false, desc: 'Ruelles, étals, lanternes et néons sous la pluie', W: 70, D: 56, H: 9, seed: 37, target: 110 },
    station: { name: 'Station Orion', icon: '🚀', style: 'station', indoor: true, desc: 'Une station orbitale : sas, labo, hangar et réacteur', W: 70, D: 50, H: 5.0, seed: 41, cols: [20, 30, 20], rows: [[25, 25], [50], [25, 25]], target: 90,
      kinds: [['cryo', 'labo'], ['reacteur'], ['hangar', 'quartiers']] },
    musee: { name: 'Musée des Merveilles', icon: '🏛️', style: 'musee', indoor: true, desc: 'Galeries de marbre : statues, vitrines, sarcophages et dinosaure', W: 68, D: 46, H: 6.4, seed: 53, cols: [22, 24, 22], rows: [[23, 23], [46], [23, 23]], target: 85,
      kinds: [['egypte', 'antique'], ['rotonde'], ['art', 'dino']] },
    port: { name: 'Le Port', icon: '⚓', style: 'port', indoor: false, desc: 'Quais, piles de conteneurs, entrepôts et grues au coucher du soleil', W: 80, D: 60, H: 12, seed: 67, target: 120 }
  };
  var MAP_IDS = Object.keys(MAPS);

  // quels objets pour quelle pièce (poids), densité (objets par 10 m²)
  var KIND = {
    bibliotheque: { w: { bookshelf: 6, armchair: 3, globe: 1, table_round: 1, floorlamp: 2, bust: 1, desk: 1, vase: 1, chair: 2, clock: 1, candelabra: 1 }, d: 1.3 },
    grandhall: { w: { armor: 3, vase: 2, bust: 2, clock: 1, sofa: 1, floorlamp: 2, table_round: 1, candelabra: 2, mirror: 1, bench: 1, piano: 1 }, d: 1.0 },
    salon: { w: { sofa: 2, armchair: 3, piano: 1, fireplace: 1, table_round: 2, teatable: 2, floorlamp: 2, vase: 2, mirror: 1, bust: 1, stool: 2 }, d: 1.3 },
    salle: { w: { table_long: 1, chair: 8, dresser: 2, candelabra: 2, vase: 2, mirror: 1, trunk: 1, clock: 1 }, d: 1.2 },
    cuisine: { w: { table_long: 2, chair: 4, barrel: 3, crate: 3, stool: 3, trunk: 1, dresser: 2, basket: 3, cartonbox: 1, vase: 1 }, d: 1.5 },
    chambre: { w: { bed: 3, wardrobe: 2, dresser: 2, trunk: 2, mirror: 1, armchair: 1, floorlamp: 2, stool: 1, desk: 1 }, d: 1.3 },
    slots: { w: { slot: 12, barstool: 4, atm: 1, floorlamp: 1, goldstatue: 1, trolley: 1, chips: 2 }, d: 1.8 },
    vip: { w: { sofa: 3, cocktail: 3, champagne: 3, goldstatue: 2, safe: 1, jukebox: 1, chips: 1, floorlamp: 2, armchair: 3 }, d: 1.2 },
    poker: { w: { poker: 4, blackjack: 3, chair: 6, chips: 3, barstool: 2, trolley: 1, dice: 1 }, d: 1.0 },
    bar: { w: { bar: 2, barstool: 10, champagne: 3, cocktail: 4, jukebox: 1, dice: 2, safe: 1, chips: 2 }, d: 1.5 },
    cryo: { w: { cryopod: 6, console: 2, locker: 3, terminal: 2, o2tank: 3, robot: 1, techcrate: 2 }, d: 1.3 },
    labo: { w: { holotable: 2, console: 3, monitors: 3, terminal: 3, locker: 2, robot: 1, cabledrum: 2, antenna: 1 }, d: 1.4 },
    reacteur: { w: { reactor: 2, console: 3, cabledrum: 4, o2tank: 3, techcrate: 4, monitors: 2, antenna: 2, container: 2, robot: 1 }, d: 0.9 },
    hangar: { w: { container: 6, techcrate: 6, cabledrum: 3, o2tank: 3, robot: 2, antenna: 1, locker: 2 }, d: 1.4 },
    quartiers: { w: { locker: 4, bed: 2, terminal: 3, techcrate: 2, o2tank: 1, console: 1, robot: 1, stool: 2, bench: 2 }, d: 1.5 },
    egypte: { w: { sarcophagus: 4, amphora: 4, pedestal: 3, showcase: 3, urn: 3, column: 3, museumbench: 1, stanchion: 5 }, d: 1.3 },
    antique: { w: { pedestal: 6, bust: 3, column: 4, amphora: 3, urn: 3, museumbench: 2, showcase: 2, stanchion: 5 }, d: 1.3 },
    rotonde: { w: { pedestal: 3, column: 5, museumbench: 3, bust: 2, urn: 2, globe: 1, goldstatue: 1, stanchion: 4 }, d: 1.0 },
    art: { w: { easel: 6, pedestal: 3, bust: 3, museumbench: 3, showcase: 3, vase: 2, stanchion: 6, floorlamp: 2 }, d: 1.2 },
    dino: { w: { dinoskull: 1, pedestal: 3, showcase: 3, museumbench: 2, column: 3, stanchion: 6, amphora: 1, globe: 2 }, d: 1.0 }
  };
  var OUTDOOR = {
    marche: { w: { stall: 6, lamppost: 3, basket: 6, sack: 4, crate: 6, barrel: 5, fishcrate: 4, parasol: 3, noodle: 3, stool: 6, cooler: 3, ricebag: 3, cartonbox: 5, trashbin: 3 }, d: 0.55 },
    port: { w: { shipcontainer: 3, crate: 4, woodcrate: 6, barrel: 4, bollard: 4, ropecoil: 3, anchor: 2, buoy: 3, netpile: 3, lifebuoy: 2, fishbarrel: 3, pallet: 5, oildrum: 5, toolbox: 2, gascan: 3, trolley: 1 }, d: 0.5 }
  };

  function pick(r, w) { var tot = 0, k; for (k in w) tot += w[k]; var x = r() * tot; for (k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; }

  function box(x0, z0, x1, z1, y1) { return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y1: y1 }; }

  // construit une carte (toujours la même pour un identifiant donné)
  var CACHE = {};
  function makeMap(id) {
    if (CACHE[id]) return CACHE[id];
    var M = MAPS[id]; if (!M) return null;
    var r = rng(M.seed), hw = M.W / 2, hd = M.D / 2, T = 0.3, walls = [], rooms = [], doors = [], blocks = [], props = [], spawnH = [], spawnS = [], i, j;
    function wallLine(x0, z0, x1, z1, gaps) {                    // un mur droit ; gaps : [[début, fin], …] le long du mur (portes)
      var horiz = Math.abs(z1 - z0) < 1e-6, a = horiz ? x0 : z0, b = horiz ? x1 : z1, cuts = (gaps || []).slice().sort(function (p, q) { return p[0] - q[0]; }), cur = a;
      cuts.forEach(function (g) { if (g[0] > cur) seg(cur, g[0]); cur = Math.max(cur, g[1]); });
      if (cur < b) seg(cur, b);
      function seg(s, e) { if (horiz) walls.push(box(s, z0 - T / 2, e, z0 + T / 2, M.H)); else walls.push(box(x0 - T / 2, s, x0 + T / 2, e, M.H)); }
    }
    if (M.indoor) {
      // la grille de pièces : des colonnes, chacune découpée en rangées
      var xs = [-hw], zsCol = [];
      M.cols.forEach(function (w, c) { xs.push(xs[c] + w); });
      M.cols.forEach(function (w, c) { var z = [-hd]; M.rows[c].forEach(function (d) { z.push(z[z.length - 1] + d); }); zsCol.push(z); });
      wallLine(-hw, -hd, hw, -hd); wallLine(-hw, hd, hw, hd); wallLine(-hw, -hd, -hw, hd); wallLine(hw, -hd, hw, hd);
      for (i = 0; i < M.cols.length; i++) for (j = 0; j < M.rows[i].length; j++) {
        var kind = M.kinds[i][Math.min(j, M.kinds[i].length - 1)];
        rooms.push({ x0: xs[i], z0: zsCol[i][j], x1: xs[i + 1], z1: zsCol[i][j + 1], kind: kind, col: i, row: j });
      }
      // les murs entre colonnes : une porte par pièce côté gauche
      for (i = 1; i < M.cols.length; i++) {
        var gaps = [];
        rooms.forEach(function (rm) {
          if (rm.col !== i - 1) return;
          var cz = (rm.z0 + rm.z1) / 2 + (r() - 0.5) * (rm.z1 - rm.z0) * 0.4; gaps.push([cz - 1.1, cz + 1.1]); doors.push({ x: xs[i], z: cz, axis: 'x' });
        });
        wallLine(xs[i], -hd, xs[i], hd, gaps);
      }
      // les murs entre rangées d'une même colonne : une porte
      for (i = 0; i < M.cols.length; i++) for (j = 1; j < M.rows[i].length; j++) {
        var zz = zsCol[i][j], cx = (xs[i] + xs[i + 1]) / 2 + (r() - 0.5) * (xs[i + 1] - xs[i]) * 0.3;
        wallLine(xs[i], zz, xs[i + 1], zz, [[cx - 1.1, cx + 1.1]]); doors.push({ x: cx, z: zz, axis: 'z' });
      }
      // les objets de chaque pièce
      var totalArea = 0; rooms.forEach(function (rm) { rm.area = (rm.x1 - rm.x0) * (rm.z1 - rm.z0); rm.n = Math.round(rm.area / 10 * KIND[rm.kind].d); totalArea += rm.n; });
      var scale = M.target / Math.max(1, totalArea);
      rooms.forEach(function (rm) { rm.n = Math.max(8, Math.round(rm.n * scale)); });
      rooms.forEach(function (rm) {
        var tries = 0, placed = 0, W = KIND[rm.kind].w;
        while (placed < rm.n && tries++ < rm.n * 40) {
          var t = pick(r, W), p = PROPS[t], hx = p[0], hz = p[2];
          var wallSide = r() < 0.55, x, z, yaw = 0, inset = 0.5;
          if (wallSide) {                                           // adossé à un mur, tourné vers l'intérieur
            var side = Math.floor(r() * 4);
            if (side === 0) { x = rm.x0 + inset + r() * (rm.x1 - rm.x0 - 2 * inset); z = rm.z0 + T / 2 + hz + 0.1; yaw = 0; }
            else if (side === 1) { x = rm.x0 + inset + r() * (rm.x1 - rm.x0 - 2 * inset); z = rm.z1 - T / 2 - hz - 0.1; yaw = Math.PI; }
            else if (side === 2) { z = rm.z0 + inset + r() * (rm.z1 - rm.z0 - 2 * inset); x = rm.x0 + T / 2 + hz + 0.1; yaw = Math.PI / 2; }
            else { z = rm.z0 + inset + r() * (rm.z1 - rm.z0 - 2 * inset); x = rm.x1 - T / 2 - hz - 0.1; yaw = -Math.PI / 2; }
          } else { x = rm.x0 + 1.4 + r() * (rm.x1 - rm.x0 - 2.8); z = rm.z0 + 1.4 + r() * (rm.z1 - rm.z0 - 2.8); yaw = Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.5; }
          var ext = Math.max(hx, hz);
          if (x - ext < rm.x0 + T || x + ext > rm.x1 - T || z - ext < rm.z0 + T || z + ext > rm.z1 - T) continue;
          if (doors.some(function (d) { return Math.hypot(d.x - x, d.z - z) < 1.9 + ext; })) continue;
          if (props.some(function (q) { var e2 = Math.max(PROPS[q.t][0], PROPS[q.t][2]); return Math.hypot(q.x - x, q.z - z) < ext + e2 + 0.25; })) continue;
          props.push({ t: t, x: +x.toFixed(2), z: +z.toFixed(2), y: 0, yaw: +yaw.toFixed(3), s: 1 }); placed++;
        }
      });
      // départs : les cachés dans toutes les pièces, les chasseurs dans la pièce du milieu de la première colonne
      rooms.forEach(function (rm) { for (var q = 0; q < 4; q++) spawnH.push([rm.x0 + 2 + r() * (rm.x1 - rm.x0 - 4), rm.z0 + 2 + r() * (rm.z1 - rm.z0 - 4)]); });
      var sr = rooms[0]; for (i = 0; i < 6; i++) spawnS.push([(sr.x0 + sr.x1) / 2 + (i % 3 - 1) * 1.6, (sr.z0 + sr.z1) / 2 + (Math.floor(i / 3) - 0.5) * 1.6]);
    } else {
      // plein air : un contour de façades, des blocs (bâtiments, piles de conteneurs) séparés par des ruelles, des objets partout dans les ruelles
      wallLine(-hw, -hd, hw, -hd); wallLine(-hw, hd, hw, hd); wallLine(-hw, -hd, -hw, hd); wallLine(hw, -hd, hw, hd);
      var cell = id === 'port' ? 20 : 16, ncx = Math.floor(M.W / cell), ncz = Math.floor(M.D / cell), ox = -ncx * cell / 2, oz = -ncz * cell / 2, bi, bj;
      var allowed = [];
      for (bi = 0; bi < ncx; bi++) for (bj = 0; bj < ncz; bj++) {
        var plaza = (bi === Math.floor(ncx / 2) && bj === Math.floor(ncz / 2)) || (id === 'marche' && bj === Math.floor(ncz / 2));
        if (plaza || (bi === 0 && bj === 0) || r() < 0.18) continue;
        var bw = cell - 6 - r() * 3, bd = cell - 6 - r() * 3, bx = ox + bi * cell + cell / 2, bz = oz + bj * cell + cell / 2;
        var bh = id === 'port' ? 3.2 + Math.floor(r() * 2) * 2.6 : 6 + r() * 4;
        blocks.push({ x0: +(bx - bw / 2).toFixed(2), z0: +(bz - bd / 2).toFixed(2), x1: +(bx + bw / 2).toFixed(2), z1: +(bz + bd / 2).toFixed(2), y1: +bh.toFixed(2), kind: id === 'port' ? (r() < 0.5 ? 'conteneurs' : 'entrepot') : (r() < 0.5 ? 'immeuble' : 'boutique') });
        walls.push(box(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, bh));
      }
      var OD = OUTDOOR[id], tries2 = 0, placed2 = 0, nwant = M.target;
      while (placed2 < nwant && tries2++ < nwant * 60) {
        var t2 = pick(r, OD.w), p2 = PROPS[t2], ext2 = Math.max(p2[0], p2[2]), x2 = -hw + 2 + r() * (M.W - 4), z2 = -hd + 2 + r() * (M.D - 4);
        if (walls.some(function (w) { return x2 > w.x0 - ext2 - 0.6 && x2 < w.x1 + ext2 + 0.6 && z2 > w.z0 - ext2 - 0.6 && z2 < w.z1 + ext2 + 0.6; })) continue;
        if (props.some(function (q) { var e3 = Math.max(PROPS[q.t][0], PROPS[q.t][2]); return Math.hypot(q.x - x2, q.z - z2) < ext2 + e3 + 0.5; })) continue;
        props.push({ t: t2, x: +x2.toFixed(2), z: +z2.toFixed(2), y: 0, yaw: +(r() * TAU).toFixed(3), s: 1 }); placed2++;
      }
      for (i = 0; i < 80; i++) {
        var sx = -hw + 3 + r() * (M.W - 6), sz = -hd + 3 + r() * (M.D - 6);
        if (!walls.some(function (w) { return sx > w.x0 - 1 && sx < w.x1 + 1 && sz > w.z0 - 1 && sz < w.z1 + 1; })) spawnH.push([sx, sz]);
      }
      for (i = 0; i < 6; i++) spawnS.push([-hw + 4 + (i % 3) * 1.6, -hd + 4 + Math.floor(i / 3) * 1.6]);
      rooms.push({ x0: -hw, z0: -hd, x1: hw, z1: hd, kind: 'dehors', col: 0, row: 0, area: M.W * M.D });
    }
    // un départ de cachés ne doit pas être dans un mur ni un objet
    spawnH = spawnH.filter(function (s) { return !walls.some(function (w) { return s[0] > w.x0 - 0.6 && s[0] < w.x1 + 0.6 && s[1] > w.z0 - 0.6 && s[1] < w.z1 + 0.6; }) && !props.some(function (q) { var e = Math.max(PROPS[q.t][0], PROPS[q.t][2]); return Math.hypot(q.x - s[0], q.z - s[1]) < e + 0.7; }); });
    // pour les chasseurs : on écarte les objets proches de la zone de départ (ils doivent apparaître dans un endroit dégagé)
    if (spawnS.length) {
      var cx0 = spawnS[0][0] + 0.8, cz0 = spawnS[0][1] + 0.4;
      for (i = props.length - 1; i >= 0; i--) { var pp = props[i], ee = Math.max(PROPS[pp.t][0], PROPS[pp.t][2]); if (Math.abs(pp.x - cx0) < 3.2 + ee && Math.abs(pp.z - cz0) < 2.4 + ee) props.splice(i, 1); }
    }
    var map = { id: id, name: M.name, style: M.style, indoor: M.indoor, W: M.W, D: M.D, H: M.H, walls: walls, blocks: blocks, rooms: rooms, doors: doors, props: props, spawnH: spawnH, spawnS: spawnS };
    props.forEach(function (p, k) { p.i = k; var b = PROPS[p.t]; p.hx = b[0] * p.s; p.hy = b[1] * p.s; p.hz = b[2] * p.s; });
    CACHE[id] = map; return map;
  }

  /* ------------------------------ les déplacements ------------------------------ */
  var RADIUS = 0.38, EYE = 1.62, WALK = 4.3, RUN = 6.6, JUMP = 4.7, GRAV = 14;
  function newPlayer() { return { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, air: false, r: RADIUS, h: 1.8, eye: EYE }; }
  // met un joueur en forme d'objet (cachés) ou à sa taille normale
  function setShape(c, propType) {
    if (!propType || !PROPS[propType]) { c.r = RADIUS; c.h = 1.8; c.eye = EYE; return; }
    var b = PROPS[propType]; c.r = Math.max(0.22, Math.min(1.0, Math.max(b[0], b[2]) * 0.92)); c.h = b[1] * 2; c.eye = Math.max(0.5, b[1] * 2 * 0.8);
  }
  function collideCircle(c, map, rects) {
    for (var pass = 0; pass < 3; pass++) {
      for (var k = 0; k < rects.length; k++) {
        var w = rects[k]; if (c.y + 0.32 >= w.y1) continue;                 // assez haut pour passer par-dessus (saut)
        var nx = Math.max(w.x0, Math.min(c.x, w.x1)), nz = Math.max(w.z0, Math.min(c.z, w.z1)), dx = c.x - nx, dz = c.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= c.r * c.r) continue;
        if (d2 > 1e-9) { var d = Math.sqrt(d2), push = c.r - d; c.x += dx / d * push; c.z += dz / d * push; }
        else { var l = c.x - w.x0, rr = w.x1 - c.x, t = c.z - w.z0, b = w.z1 - c.z, m = Math.min(l, rr, t, b); if (m === l) c.x = w.x0 - c.r; else if (m === rr) c.x = w.x1 + c.r; else if (m === t) c.z = w.z0 - c.r; else c.z = w.z1 + c.r; }
      }
    }
  }
  var PROP_RECTS = {};                                                        // les objets de la carte vus comme des rectangles (calculés une fois)
  function rectsOf(map) {
    if (PROP_RECTS[map.id]) return PROP_RECTS[map.id];
    var out = map.walls.slice();
    map.props.forEach(function (p) { var q = Math.abs(Math.sin(p.yaw)) > 0.7, hx = q ? p.hz : p.hx, hz = q ? p.hx : p.hz; out.push({ x0: p.x - hx, z0: p.z - hz, x1: p.x + hx, z1: p.z + hz, y1: p.hy * 2 }); });
    PROP_RECTS[map.id] = out; return out;
  }
  // un pas de déplacement : inp = { f, s, run, jump, yaw, pitch } ; extra = rectangles supplémentaires (autres joueurs-objets) facultatifs
  function stepPlayer(c, inp, dt, map, extra) {
    c.yaw = inp.yaw; c.pitch = inp.pitch;
    var sp = (inp.run ? RUN : WALK) * (c.r > RADIUS ? 0.85 : 1), f = Math.max(-1, Math.min(1, inp.f || 0)), s = Math.max(-1, Math.min(1, inp.s || 0)), len = Math.hypot(f, s) || 1;
    if (len > 1) { f /= len; s /= len; }
    var sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), tx = (sy * f + cy * s) * sp, tz = (-cy * f + sy * s) * sp;
    var k = 1 - Math.exp(-dt * (c.air ? 3 : 14)); c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
    if (inp.jump && !c.air) { c.vy = JUMP; c.air = true; }
    c.vy -= GRAV * dt; c.y += c.vy * dt; if (c.y <= 0) { c.y = 0; c.vy = 0; c.air = false; }
    c.x += c.vx * dt; c.z += c.vz * dt;
    var rects = rectsOf(map); collideCircle(c, map, rects); if (extra && extra.length) collideCircle(c, map, extra);
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
  // tire un rayon depuis l'œil : renvoie { t, kind: 'wall' | 'prop' | 'hider', ref } le plus proche ; hiders = [{ k, x, z, r, h }] (cachés, en forme d'objet)
  function raycast(map, ox, oy, oz, yaw, pitch, maxD, hiders) {
    var cp = Math.cos(pitch), dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp, best = { t: maxD, kind: '', ref: null }, t, k;
    map.walls.forEach(function (w) { t = rayBox(ox, oy, oz, dx, dy, dz, w.x0, 0, w.z0, w.x1, w.y1, w.z1); if (t >= 0 && t < best.t) best = { t: t, kind: 'wall', ref: w }; });
    map.props.forEach(function (p) { var q = Math.abs(Math.sin(p.yaw)) > 0.7, hx = q ? p.hz : p.hx, hz = q ? p.hx : p.hz; t = rayBox(ox, oy, oz, dx, dy, dz, p.x - hx, 0, p.z - hz, p.x + hx, p.hy * 2, p.z + hz); if (t >= 0 && t < best.t) best = { t: t, kind: 'prop', ref: p }; });
    (hiders || []).forEach(function (h) { t = rayBox(ox, oy, oz, dx, dy, dz, h.x - h.r, 0, h.z - h.r, h.x + h.r, h.h, h.z + h.r); if (t >= 0 && t < best.t) best = { t: t, kind: 'hider', ref: h }; });
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

  var API = { WEAPONS: WEAPONS, WEAPON_IDS: WEAPON_IDS, TIMES: TIMES, PROPS: PROPS, PROP_IDS: PROP_IDS, MAPS: MAPS, MAP_IDS: MAP_IDS, makeMap: makeMap, newPlayer: newPlayer, setShape: setShape, stepPlayer: stepPlayer, raycast: raycast, rectsOf: rectsOf, RADIUS: RADIUS, EYE: EYE, WALK: WALK, RUN: RUN, rng: rng };
  if (typeof window !== 'undefined') { window.F3D = window.F3D || {}; window.F3D.propSim = API; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
