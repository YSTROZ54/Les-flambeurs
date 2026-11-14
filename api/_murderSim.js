// FICHIER GÉNÉRÉ par scripts/sync-sims.mjs à partir de js/3d/murder-sim.js : ne pas modifier à la main.
const SIM = (function () {
  'use strict';
  var T = 0.2, WALL_H = 2.8, DOOR_H = 2.15;

  /* ------------------------------ les réglages du jeu ------------------------------ */
  var CFG = {
    min: 3, max: 6,                   // joueurs par salon
    lobby: 15, intro: 7, play: 420, results: 11,        // secondes
    reload: 1.8,                      // rechargement du revolver
    gunBan: 15,                       // après avoir tué un innocent, le policier ne peut pas reprendre son arme pendant ce temps
    stabCd: 0.8, stabRange: 1.75, stabArc: 0.75,        // coup de couteau : délai, portée (m), demi-angle (rad)
    chargeMax: 1.2,                   // temps (s) pour remplir la barre de force du lancer
    throwMin: 5, throwMax: 22, knifeSpeed: 26, throwCd: 0.4,   // portée du lancer selon la force, vitesse du couteau
    gunRange: 45, hitR: 0.42,         // portée du revolver, « largeur » d'un joueur pour les tirs
    reach: 2.0, pickR: 1.0,           // portée pour ouvrir une porte, pour ramasser
    blockH: 1.0                       // les meubles plus hauts arrêtent les tirs et le couteau
  };
  var RADIUS = 0.35, WALK = 4.2, RUN = 6.3, EYE = 1.6;
  var WORLD = { x0: -21.6, x1: 21.6, z0: -15.6, z1: 15.6 };

  /* ------------------------------ la carte : « La Maison » ------------------------------ */
  var MAP_CACHE = null;
  function buildMap() {
    if (MAP_CACHE) return MAP_CACHE;
    var walls = [], doors = [], gaps = [], furn = [], rooms = [], i;
    function addWall(x0, z0, x1, z1, h) { if (x1 - x0 > 0.001 && z1 - z0 > 0.001) walls.push({ x0: x0, z0: z0, x1: x1, z1: z1, h: h || WALL_H }); }
    // mur horizontal (le long de x) à z, de x0 à x1, avec des trous [centre, largeur, idPorte|-1]
    function wallH(z, x0, x1, holes, h) {
      var cur = x0; (holes || []).slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (g) {
        var g0 = g[0] - g[1] / 2, g1 = g[0] + g[1] / 2; if (g0 > cur) addWall(cur, z - T / 2, g0, z + T / 2, h); cur = g1; gaps.push({ axis: 'x', x: g[0], z: z, w: g[1] });
      });
      if (cur < x1) addWall(cur, z - T / 2, x1, z + T / 2, h);
    }
    function wallV(x, z0, z1, holes, h) {
      var cur = z0; (holes || []).slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (g) {
        var g0 = g[0] - g[1] / 2, g1 = g[0] + g[1] / 2; if (g0 > cur) addWall(x - T / 2, cur, x + T / 2, g0, h); cur = g1; gaps.push({ axis: 'z', x: x, z: g[0], w: g[1] });
      });
      if (cur < z1) addWall(x - T / 2, cur, x + T / 2, z1, h);
    }
    // une porte (battant) : axis 'x' = dans un mur horizontal, 'z' = dans un mur vertical ; charnière côté « petit » (x ou z le plus faible)
    function door(x, z, axis, w) { doors.push({ id: doors.length, x: x, z: z, axis: axis, w: w }); }
    function room(id, name, x0, z0, x1, z1, floor) { rooms.push({ id: id, name: name, x0: x0, z0: z0, x1: x1, z1: z1, floor: floor }); }

    // la maison : x -13..13, z -8..8
    room('ch1', 'Chambre', -13, -8, -6, -1, 'parquet'); room('bain', 'Salle de bain', -6, -8, -2, -1, 'carrelage'); room('bureau', 'Bureau', -2, -8, 3, -1, 'parquet');
    room('enfant', 'Chambre d\'enfant', 3, -8, 8, -1, 'moquette'); room('buan', 'Buanderie', 8, -8, 13, -1, 'carrelage'); room('couloir', 'Couloir', -13, -1, 13, 1, 'parquet');
    room('cuisine', 'Cuisine', -13, 1, -5, 8, 'carrelage'); room('salle', 'Salle à manger', -5, 1, 2, 8, 'parquet'); room('entree', 'Entrée', 2, 1, 6, 8, 'carrelage'); room('salon', 'Salon', 6, 1, 13, 8, 'parquet');
    // murs extérieurs
    wallH(-8, -13, 13, []); wallH(8, -13, 13, [[4, 1.4]]); wallV(-13, -8, 8, [[0, 1.2]]); wallV(13, -8, 8, [[0, 1.2]]);
    // murs du couloir (une porte par pièce)
    wallH(-1, -13, 13, [[-9.5, 1.0], [-4, 1.0], [0.5, 1.0], [5.5, 1.0], [10.5, 1.0]]);
    wallH(1, -13, 13, [[-9, 1.0], [-1.5, 1.0], [4, 1.0], [9.5, 1.0]]);
    // cloisons des pièces du nord
    [-6, -2, 3, 8].forEach(function (x) { wallV(x, -8, -1, []); });
    // cloisons du sud : grandes ouvertures (cuisine / salle à manger / entrée / salon)
    wallV(-5, 1, 8, [[4.75, 2.6]]); wallV(2, 1, 8, [[4.5, 2.4]]); wallV(6, 1, 8, [[4.5, 2.6]]);
    // les portes (dans l'ordre : nord 0-4, sud 5-8, entrée 9, ouest 10, est 11)
    door(-9.5, -1, 'x', 1.0); door(-4, -1, 'x', 1.0); door(0.5, -1, 'x', 1.0); door(5.5, -1, 'x', 1.0); door(10.5, -1, 'x', 1.0);
    door(-9, 1, 'x', 1.0); door(-1.5, 1, 'x', 1.0); door(4, 1, 'x', 1.0); door(9.5, 1, 'x', 1.0);
    door(4, 8, 'x', 1.4); door(-13, 0, 'z', 1.2); door(13, 0, 'z', 1.2);
    // le cabanon du jardin (x 15.5..20.5, z -14.5..-9.5) et sa porte
    wallH(-14.5, 15.5, 20.5, []); wallH(-9.5, 15.5, 20.5, [[18, 1.0]], 2.4); wallV(15.5, -14.5, -9.5, [], 2.4); wallV(20.5, -14.5, -9.5, [], 2.4);
    door(18, -9.5, 'x', 1.0); room('cabanon', 'Cabanon', 15.5, -14.5, 20.5, -9.5, 'beton');
    room('jardin', 'Jardin', WORLD.x0, WORLD.z0, WORLD.x1, WORLD.z1, 'herbe');

    // le mobilier : [type, x, z, largeur(x), profondeur(z), hauteur, face (n|s|e|w : côté « avant »), couleur]
    function F(t, x, z, w, d, h, f, c) { furn.push({ t: t, x: x, z: z, w: w, d: d, h: h, f: f || 's', c: c === undefined ? 0 : c }); }
    // chambre
    F('bed', -10.5, -6.8, 2.0, 2.2, 0.6, 's', 0x6a2a3a); F('nightstand', -12.0, -7.6, 0.5, 0.5, 0.55, 's', 0x5a3a24); F('nightstand', -9.0, -7.6, 0.5, 0.5, 0.55, 's', 0x5a3a24);
    F('wardrobe', -12.45, -3.5, 0.8, 2.0, 2.1, 'e', 0x6a4a2c); F('dresser', -6.55, -5.5, 0.5, 1.4, 0.9, 'w', 0x5a3a24); F('plant', -12.4, -1.7, 0.5, 0.5, 1.1, 's', 0x2f7a35);
    // salle de bain
    F('bathtub', -4.9, -7.5, 1.8, 0.8, 0.6, 's', 0xf0f2f4); F('toilet', -2.5, -6.0, 0.7, 0.5, 0.8, 'w', 0xf0f2f4); F('sink', -2.5, -4.3, 0.6, 0.5, 0.9, 'w', 0xf0f2f4); F('cabinet', -5.55, -5.0, 0.5, 1.0, 1.7, 'e', 0x8a6a46);
    // bureau
    F('desk', 0.5, -7.1, 1.8, 0.8, 0.75, 's', 0x5a3a24); F('chair', 0.5, -6.1, 0.5, 0.5, 0.9, 'n', 0x2a2a30); F('bookshelf', -1.65, -4.5, 0.4, 2.4, 2.0, 'e', 0x5a3a24); F('bookshelf', 2.65, -5.5, 0.4, 2.0, 2.0, 'w', 0x5a3a24);
    F('armchair', 1.8, -2.7, 0.9, 0.9, 0.9, 'w', 0x3a4a6a); F('plant', -1.5, -1.7, 0.5, 0.5, 1.0, 's', 0x2f7a35);
    // chambre d'enfant
    F('bed', 4.2, -6.85, 1.0, 2.0, 0.55, 's', 0x3a7ad0); F('wardrobe', 7.55, -5.5, 0.7, 1.6, 1.9, 'w', 0xc8a878); F('desk', 6.5, -7.55, 1.2, 0.6, 0.75, 's', 0xc8a878); F('chair', 6.5, -6.7, 0.45, 0.45, 0.85, 'n', 0xd04a3a);
    F('chest', 4.0, -3.4, 0.9, 0.5, 0.5, 's', 0xd0a030); F('shelf', 3.3, -4.6, 0.3, 1.5, 1.2, 'e', 0xc8a878);
    // buanderie
    F('washer', 12.5, -7.45, 0.7, 0.7, 0.95, 's', 0xe8eaee); F('washer', 11.6, -7.45, 0.7, 0.7, 0.95, 's', 0xe8eaee); F('sinkunit', 9.4, -7.5, 1.2, 0.6, 0.9, 's', 0x8a8a92);
    F('shelf', 12.65, -4.5, 0.4, 2.4, 1.9, 'w', 0x7a5a34); F('basket', 9.0, -3.4, 0.6, 0.6, 0.6, 's', 0xc8a060); F('crate', 11.5, -3.2, 0.7, 0.7, 0.6, 's', 0x9a7a44);
    // cuisine
    F('fridge', -12.4, 7.5, 0.8, 0.8, 1.9, 'n', 0xe8eaee); F('counter', -10.8, 7.55, 2.4, 0.7, 0.9, 'n', 0xb8a080); F('stove', -8.8, 7.55, 0.8, 0.7, 0.9, 'n', 0x2a2a30); F('sinkunit', -7.3, 7.55, 1.4, 0.7, 0.9, 'n', 0xb8a080);
    F('island', -9.5, 4.8, 2.0, 0.9, 0.9, 's', 0x6a4a2c); F('stool', -10.3, 5.7, 0.4, 0.4, 0.65, 's', 0x3a2a1a); F('stool', -8.7, 5.7, 0.4, 0.4, 0.65, 's', 0x3a2a1a); F('cabinet', -12.65, 3.0, 0.5, 1.6, 1.9, 'e', 0x8a6a46);
    // salle à manger
    F('table', -1.5, 5.0, 2.4, 1.1, 0.78, 's', 0x6a4220);
    [-2.4, -1.5, -0.6].forEach(function (x) { F('chair', x, 3.85, 0.45, 0.45, 0.9, 's', 0x8a2a2a); F('chair', x, 6.15, 0.45, 0.45, 0.9, 'n', 0x8a2a2a); });
    F('chair', -3.2, 5.0, 0.45, 0.45, 0.9, 'e', 0x8a2a2a); F('chair', 0.2, 5.0, 0.45, 0.45, 0.9, 'w', 0x8a2a2a);
    F('dresser', -1.5, 7.65, 2.0, 0.5, 0.9, 'n', 0x5a3a24); F('plant', 1.5, 7.4, 0.5, 0.5, 1.2, 's', 0x2f7a35); F('cabinet', -4.65, 7.25, 0.5, 1.3, 1.9, 'e', 0x5a3a24);
    // entrée
    F('bench', 2.8, 7.6, 0.8, 0.4, 0.45, 'n', 0x5a3a24); F('coatrack', 5.5, 7.5, 0.4, 0.4, 1.8, 's', 0x3a2a1a); F('plant', 5.5, 1.7, 0.5, 0.5, 1.2, 's', 0x2f7a35);
    // salon
    F('sofa', 9.5, 3.7, 2.4, 1.0, 0.9, 's', 0x3a4a5a); F('tv', 9.5, 7.65, 1.6, 0.4, 0.6, 'n', 0x1a1a1e); F('coffee', 9.5, 5.5, 1.2, 0.6, 0.4, 's', 0x6a4220);
    F('armchair', 7.3, 5.2, 0.9, 0.9, 0.9, 'e', 0x7a3a3a); F('bookshelf', 12.65, 5.2, 0.4, 2.2, 2.0, 'w', 0x5a3a24); F('piano', 12.3, 2.6, 1.0, 1.6, 1.2, 'w', 0x15151a);
    F('plant', 6.6, 7.4, 0.5, 0.5, 1.2, 's', 0x2f7a35); F('plant', 12.5, 7.4, 0.5, 0.5, 1.2, 's', 0x2f7a35); F('lamp', 6.9, 2.2, 0.35, 0.35, 1.6, 's', 0xf0d890);
    // le jardin
    F('tree', -18, -12, 0.7, 0.7, 4.5, 's', 0x2f6a30); F('tree', -19, 10, 0.7, 0.7, 4.5, 's', 0x2f6a30); F('tree', 20, 3, 0.7, 0.7, 4.5, 's', 0x2f6a30); F('tree', 8, -13, 0.7, 0.7, 4.5, 's', 0x2f6a30); F('tree', -4, -13, 0.7, 0.7, 4.5, 's', 0x2f6a30);
    F('bush', -10, -9.3, 1.6, 0.9, 0.9, 's', 0x2f7a35); F('bush', 5, -9.3, 1.6, 0.9, 0.9, 's', 0x2f7a35); F('bush', 11, 9.4, 1.6, 0.9, 0.9, 's', 0x2f7a35); F('bush', -16, -4, 1.0, 1.0, 1.0, 's', 0x2f7a35);
    F('barbecue', -17, 3, 0.8, 0.5, 1.0, 's', 0x2a2a30); F('gtable', -17, 6.5, 1.6, 1.0, 0.75, 's', 0x8a6a46);
    F('chair', -17, 5.3, 0.45, 0.45, 0.9, 's', 0xc8c8cc); F('chair', -17, 7.7, 0.45, 0.45, 0.9, 'n', 0xc8c8cc); F('chair', -15.7, 6.5, 0.45, 0.45, 0.9, 'w', 0xc8c8cc);
    F('pool', 17, 9.5, 6.0, 4.0, 0.3, 's', 0x3aa8d8); F('car', -9, 13, 4.4, 1.9, 1.4, 'e', 0x8a1a1a); F('bench', 4, 12.5, 1.5, 0.5, 0.45, 'n', 0x5a3a24);
    F('shelf', 16.0, -12.0, 0.3, 2.0, 1.8, 'e', 0x7a5a34); F('workbench', 18, -13.9, 2.0, 0.6, 0.9, 's', 0x5a3a24); F('crate', 20.0, -10.6, 0.7, 0.7, 0.7, 's', 0x9a7a44); F('crate', 19.3, -10.7, 0.5, 0.5, 0.5, 's', 0x9a7a44);

    var solids = walls.map(function (w) { return { x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1, h: w.h, k: 'wall' }; });
    furn.forEach(function (f, k) { f.i = k; f.x0 = f.x - f.w / 2; f.x1 = f.x + f.w / 2; f.z0 = f.z - f.d / 2; f.z1 = f.z + f.d / 2; solids.push({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, h: f.h, k: 'furn' }); });
    doors.forEach(function (d) { var hw = d.w / 2; d.x0 = d.axis === 'x' ? d.x - hw : d.x - 0.06; d.x1 = d.axis === 'x' ? d.x + hw : d.x + 0.06; d.z0 = d.axis === 'x' ? d.z - 0.06 : d.z - hw; d.z1 = d.axis === 'x' ? d.z + 0.06 : d.z + hw; });
    // les points de départ des joueurs (au moins un par pièce principale)
    var spawns = [[-9, -3], [0.5, -3.8], [5.5, -3.8], [8.5, 2.2], [-9.5, 2.6], [-3, 2.5], [4, 5], [0, 12], [10.5, -4.5]];
    MAP_CACHE = { walls: walls, doors: doors, gaps: gaps, furn: furn, rooms: rooms, solids: solids, spawns: spawns, world: WORLD, house: { x0: -13, z0: -8, x1: 13, z1: 8 } };
    return MAP_CACHE;
  }
  var MAP = buildMap();

  /* ------------------------------ les déplacements ------------------------------ */
  function newPlayer() { return { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0 }; }
  function collideCircle(c, list, r) {
    for (var pass = 0; pass < 3; pass++) {
      for (var k = 0; k < list.length; k++) {
        var w = list[k], nx = Math.max(w.x0, Math.min(c.x, w.x1)), nz = Math.max(w.z0, Math.min(c.z, w.z1)), dx = c.x - nx, dz = c.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) { var d = Math.sqrt(d2), push = r - d; c.x += dx / d * push; c.z += dz / d * push; }
        else { var l = c.x - w.x0, rr = w.x1 - c.x, t = c.z - w.z0, b = w.z1 - c.z, m = Math.min(l, rr, t, b); if (m === l) c.x = w.x0 - r; else if (m === rr) c.x = w.x1 + r; else if (m === t) c.z = w.z0 - r; else c.z = w.z1 + r; }
      }
    }
  }
  // open : tableau de booléens (porte i ouverte ?) ; inp = { f, s, run, yaw, pitch }
  function stepPlayer(c, inp, dt, open) {
    c.yaw = inp.yaw; c.pitch = inp.pitch || 0;
    var sp = inp.run ? RUN : WALK, f = Math.max(-1, Math.min(1, inp.f || 0)), s = Math.max(-1, Math.min(1, inp.s || 0)), len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    var sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), tx = (sy * f + cy * s) * sp, tz = (-cy * f + sy * s) * sp, k = 1 - Math.exp(-dt * 14);
    c.vx += (tx - c.vx) * k; c.vz += (tz - c.vz) * k;
    c.x += c.vx * dt; c.z += c.vz * dt;
    collideCircle(c, MAP.solids, RADIUS);
    var closed = []; for (var i = 0; i < MAP.doors.length; i++) if (!open[i]) closed.push(MAP.doors[i]);
    collideCircle(c, closed, RADIUS);
    c.x = Math.max(WORLD.x0 + RADIUS, Math.min(WORLD.x1 - RADIUS, c.x)); c.z = Math.max(WORLD.z0 + RADIUS, Math.min(WORLD.z1 - RADIUS, c.z));
  }

  /* ------------------------------ les rayons (couteau lancé, balle, coup de couteau) ------------------------------ */
  // rayon 2D contre un rectangle : distance ou -1
  function rayRect(ox, oz, dx, dz, r) {
    var tmin = 0, tmax = 1e9;
    if (Math.abs(dx) < 1e-9) { if (ox < r.x0 || ox > r.x1) return -1; } else { var a = (r.x0 - ox) / dx, b = (r.x1 - ox) / dx; if (a > b) { var t = a; a = b; b = t; } if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) return -1; }
    if (Math.abs(dz) < 1e-9) { if (oz < r.z0 || oz > r.z1) return -1; } else { var a2 = (r.z0 - oz) / dz, b2 = (r.z1 - oz) / dz; if (a2 > b2) { var t2 = a2; a2 = b2; b2 = t2; } if (a2 > tmin) tmin = a2; if (b2 < tmax) tmax = b2; if (tmin > tmax) return -1; }
    return tmin;
  }
  // distance jusqu'au premier obstacle qui arrête un tir (murs, portes fermées, meubles hauts) ; maxD si rien
  function rayWorld(ox, oz, yaw, maxD, open) {
    var dx = Math.sin(yaw), dz = -Math.cos(yaw), best = maxD, t, k;
    for (k = 0; k < MAP.solids.length; k++) { var s = MAP.solids[k]; if (s.h < CFG.blockH) continue; t = rayRect(ox, oz, dx, dz, s); if (t >= 0 && t < best) best = t; }
    for (k = 0; k < MAP.doors.length; k++) { if (open && open[k]) continue; t = rayRect(ox, oz, dx, dz, MAP.doors[k]); if (t >= 0 && t < best) best = t; }
    return best;
  }
  // distance le long du rayon où il touche un cercle (centre cx, cz ; rayon r), ou -1
  function rayCircle(ox, oz, yaw, cx, cz, r) {
    var dx = Math.sin(yaw), dz = -Math.cos(yaw), mx = cx - ox, mz = cz - oz, b = mx * dx + mz * dz; if (b < 0) return -1;
    var d2 = mx * mx + mz * mz - b * b; if (d2 > r * r) return -1; return b - Math.sqrt(r * r - d2);
  }
  // la porte la plus proche devant moi (index) ou -1
  function nearestDoor(x, z, yaw) {
    var best = -1, bd = CFG.reach, fx = Math.sin(yaw), fz = -Math.cos(yaw);
    MAP.doors.forEach(function (d, i) { var dx = d.x - x, dz = d.z - z, dist = Math.hypot(dx, dz); if (dist > bd) return; if (dist > 0.9 && (dx * fx + dz * fz) / dist < 0.35) return; bd = dist; best = i; });
    return best;
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  var API = { CFG: CFG, MAP: MAP, WALL_H: WALL_H, DOOR_H: DOOR_H, RADIUS: RADIUS, WALK: WALK, RUN: RUN, EYE: EYE, WORLD: WORLD, newPlayer: newPlayer, stepPlayer: stepPlayer, rayWorld: rayWorld, rayCircle: rayCircle, nearestDoor: nearestDoor, angDiff: angDiff };
  return API;
})();
export default SIM;
