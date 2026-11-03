/* =====================================================================
   ludo3d.js — Le Ludo (petits chevaux) en 3D (monde 3D, PC et téléphone)
   ---------------------------------------------------------------------
   On y entre par l'ouverture à droite de la Chambre Forte, au fond de la salle des mini jeux (uno3d.js), et on en ressort par l'ouverture
   derrière soi. Deux tables (Table 1 et 2) de 2 à 4 joueurs, un joueur par côté du plateau : rouge à gauche, vert en haut, jaune à droite, bleu en
   bas. Le premier arrivé est le chef : il lance la partie. AUCUN argent n'est misé ni gagné.
   Les règles (api/ludo.js) : un 6 pour sortir un pion (3 essais si aucun pion n'est en jeu), un 6 fait rejouer (trois 6 d'affilée : le tour est
   perdu), nombre EXACT pour arriver à la maison, on renvoie un adversaire à l'écurie en tombant sur lui (sauf sur les cases de départ et les
   étoiles), le premier qui rentre ses 4 pions gagne. Le serveur tire le dé et valide les coups ; ici on affiche le plateau, les pions qui sautent
   case par case, le dé qui roule, et on envoie « lancer » ou « jouer ce pion ».
   Fichiers liés : f3d-core.js, world3d.js, uno3d.js (l'ouverture d'entrée), api/ludo.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 12, HZ = 9, H = 6.2, OG = 1.5, OPH = 3.3;
  var TABLES = [{ x: -5.4, z: -1 }, { x: 5.4, z: -1 }];
  var CS = 0.2, BS = CS * 15, TOP_Y = 0.84;                                  // cases de 20 cm : plateau de 3 m sur une table de 3,6 m
  var COLORS = ['rouge', 'vert', 'jaune', 'bleu'], CHEX = [0xe53935, 0x43a047, 0xfdd835, 0x1e88e5], CCSS = ['#e53935', '#43a047', '#fdd835', '#1e88e5'];
  var DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1]];                           // côté du plateau de chaque couleur (x, z)
  var START = [0, 13, 26, 39], SAFE = [0, 8, 13, 21, 26, 34, 39, 47], HOME = 56;

  // la boucle de 52 cases (ligne, colonne) dans la grille 15 x 15, dans le sens des aiguilles d'une montre depuis le départ du rouge
  var LOOP = (function () {
    var out = [], i;
    for (i = 1; i <= 5; i++) out.push([6, i]);
    for (i = 5; i >= 0; i--) out.push([i, 6]);
    out.push([0, 7]);
    for (i = 0; i <= 5; i++) out.push([i, 8]);
    for (i = 9; i <= 14; i++) out.push([6, i]);
    out.push([7, 14]);
    for (i = 14; i >= 9; i--) out.push([8, i]);
    for (i = 9; i <= 14; i++) out.push([i, 8]);
    out.push([14, 7]);
    for (i = 14; i >= 9; i--) out.push([i, 6]);
    for (i = 5; i >= 0; i--) out.push([8, i]);
    out.push([7, 0]); out.push([6, 0]);
    return out;
  })();
  var YARD = [[0, 0], [0, 9], [9, 9], [9, 0]];                              // coin (ligne, colonne) de l'écurie de chaque couleur
  // position d'un pion en unités de grille (x = colonne, z = ligne), SANS le décalage des pions empilés
  function gridPos(c, i, p) {
    if (p === -1) { var y = YARD[c]; return [y[1] + 1.8 + (i & 1) * 2.4, y[0] + 1.8 + (i >> 1) * 2.4]; }
    if (p <= 50) { var cell = LOOP[(START[c] + p) % 52]; return [cell[1] + 0.5, cell[0] + 0.5]; }
    if (p <= 55) { var k = p - 51; return [[1 + k + 0.5, 7.5], [7.5, 1 + k + 0.5], [13 - k + 0.5, 7.5], [7.5, 13 - k + 0.5]][c]; }
    var d = DIRS[c]; return [7.5 + d[0] * 0.62 + (-d[1]) * (i - 1.5) * 0.28, 7.5 + d[1] * 0.62 + d[0] * (i - 1.5) * 0.28];
  }

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrapPi(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function seatSpot(ti, c) { var T = TABLES[ti], d = DIRS[c]; return { x: T.x + d[0] * 2.75, z: T.z + d[1] * 2.75, yaw: Math.atan2(-d[0], d[1]) }; }

  // le plateau dessiné en haute définition
  function boardTexture() {
    var N = 2048, cell = N / 15, cv = mkCanvas(N, N), x = cv.getContext('2d'), i, j, k;
    x.fillStyle = '#f5efdf'; x.fillRect(0, 0, N, N);
    // écuries
    for (k = 0; k < 4; k++) {
      var y0 = YARD[k][0] * cell, x0 = YARD[k][1] * cell, g = x.createLinearGradient(x0, y0, x0 + 6 * cell, y0 + 6 * cell);
      g.addColorStop(0, CCSS[k]); g.addColorStop(1, shade(CCSS[k], -0.22)); x.fillStyle = g; x.fillRect(x0, y0, 6 * cell, 6 * cell);
      x.fillStyle = 'rgba(255,255,255,0.92)'; rr(x, x0 + cell * 0.9, y0 + cell * 0.9, cell * 4.2, cell * 4.2, cell * 0.5); x.fill();
      for (j = 0; j < 4; j++) { var gp = gridPos(k, j, -1); x.fillStyle = CCSS[k]; x.globalAlpha = 0.28; x.beginPath(); x.arc(gp[0] * cell, gp[1] * cell, cell * 0.7, 0, TAU); x.fill(); x.globalAlpha = 1; x.lineWidth = 6; x.strokeStyle = CCSS[k]; x.stroke(); }
    }
    // cases de la croix
    x.lineWidth = 4;
    for (i = 0; i < 15; i++) for (j = 0; j < 15; j++) {
      if ((i < 6 || i > 8) && (j < 6 || j > 8)) continue;
      if (i >= 6 && i <= 8 && j >= 6 && j <= 8) continue;
      x.fillStyle = '#fffdf6'; x.fillRect(j * cell, i * cell, cell, cell); x.strokeStyle = '#8a8272'; x.strokeRect(j * cell + 2, i * cell + 2, cell - 4, cell - 4);
    }
    // escaliers d'arrivée et cases de départ colorés
    for (k = 0; k < 4; k++) {
      for (j = 0; j < 5; j++) { var hp = gridPos(k, 0, 51 + j); x.fillStyle = CCSS[k]; x.fillRect((hp[0] - 0.5) * cell + 2, (hp[1] - 0.5) * cell + 2, cell - 4, cell - 4); x.strokeStyle = shade(CCSS[k], -0.3); x.strokeRect((hp[0] - 0.5) * cell + 2, (hp[1] - 0.5) * cell + 2, cell - 4, cell - 4); }
      var sp = gridPos(k, 0, 0); x.fillStyle = CCSS[k]; x.fillRect((sp[0] - 0.5) * cell + 2, (sp[1] - 0.5) * cell + 2, cell - 4, cell - 4); x.strokeStyle = shade(CCSS[k], -0.3); x.strokeRect((sp[0] - 0.5) * cell + 2, (sp[1] - 0.5) * cell + 2, cell - 4, cell - 4);
    }
    // étoiles sur les cases protégées (hors cases de départ) et flèches d'entrée
    SAFE.forEach(function (idx) {
      if (START.indexOf(idx) >= 0) return;
      var c2 = LOOP[idx], cx = (c2[1] + 0.5) * cell, cy = (c2[0] + 0.5) * cell; x.fillStyle = '#c9a227'; x.beginPath();
      for (var s = 0; s < 10; s++) { var a = -Math.PI / 2 + s * Math.PI / 5, r = s % 2 ? cell * 0.18 : cell * 0.4; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fill();
    });
    START.forEach(function (idx, k2) { var c3 = LOOP[idx], cx = (c3[1] + 0.5) * cell, cy = (c3[0] + 0.5) * cell; x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(cx, cy, cell * 0.2, 0, TAU); x.fill(); });
    // centre : quatre triangles
    var cx0 = 6 * cell, cy0 = 6 * cell, m = 7.5 * cell, ee = 9 * cell;
    [[[cx0, cy0], [cx0, ee], [m, m]], [[cx0, cy0], [ee, cy0], [m, m]], [[ee, cy0], [ee, ee], [m, m]], [[cx0, ee], [ee, ee], [m, m]]].forEach(function (tri, k3) {
      x.fillStyle = CCSS[k3]; x.beginPath(); x.moveTo(tri[0][0], tri[0][1]); x.lineTo(tri[1][0], tri[1][1]); x.lineTo(tri[2][0], tri[2][1]); x.closePath(); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 5; x.stroke();
    });
    var t = new THREE.CanvasTexture(cv); t.anisotropy = 16; t.minFilter = THREE.LinearMipMapLinearFilter; t.generateMipmaps = true; return t;
  }
  function shade(hex, f) { var c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return '#' + c.getHexString(); }

  function diceFaceTex(n) {
    var cv = mkCanvas(128, 128), x = cv.getContext('2d'); x.fillStyle = '#fbfaf5'; rr(x, 2, 2, 124, 124, 22); x.fill(); x.strokeStyle = '#cfcab9'; x.lineWidth = 3; x.stroke();
    var P = { 1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]], 4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], 5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]], 6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]] }[n];
    P.forEach(function (q) { x.fillStyle = n === 1 ? '#d62828' : '#15151a'; x.beginPath(); x.arc(q[0] * 128, q[1] * 128, n === 1 ? 17 : 13, 0, TAU); x.fill(); });
    var t = new THREE.CanvasTexture(cv); t.anisotropy = 8; return t;
  }

  function createLudoRoom(world) {
    var low = world.low;
    var room = { title: '🎲 LUDO', subtitle: 'PETITS CHEVAUX · SANS MISE', topic: 'flambeurs-ludo-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i, k;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- le salon : parquet, lambris vert, poutres, lampes --- */
    var woodM = new THREE.MeshStandardMaterial({ color: 0x5a3416, roughness: 0.6 }), woodD = new THREE.MeshStandardMaterial({ color: 0x2f1b0b, roughness: 0.7 }), brass = new THREE.MeshStandardMaterial({ color: 0xd9a830, roughness: 0.3, metalness: 0.8 });
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d'); fx.fillStyle = '#6e4423'; fx.fillRect(0, 0, 512, 512);
    for (i = 0; i < 8; i++) { fx.fillStyle = i % 2 ? '#7a4d29' : '#653c1d'; fx.fillRect(0, i * 64, 512, 62); fx.fillStyle = 'rgba(0,0,0,0.25)'; fx.fillRect(0, i * 64 + 62, 512, 2); for (var q = 0; q < 14; q++) { fx.fillStyle = 'rgba(255,255,255,0.05)'; fx.fillRect(Math.random() * 512, i * 64 + Math.random() * 60, 60 + Math.random() * 120, 2); } }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2.5, HZ / 2.5); ft.anisotropy = 8;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.05 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(512, 512), wx = wc.getContext('2d'); wx.fillStyle = '#17402c'; wx.fillRect(0, 0, 512, 512); wx.strokeStyle = 'rgba(217,168,48,0.35)'; wx.lineWidth = 3; for (i = 0; i < 4; i++) { wx.strokeRect(14 + i * 4, 14 + i * 4, 484 - i * 8, 484 - i * 8); }
    wx.fillStyle = 'rgba(217,168,48,0.4)'; [[256, 256]].forEach(function (p) { wx.beginPath(); wx.moveTo(p[0], p[1] - 40); wx.lineTo(p[0] + 26, p[1]); wx.lineTo(p[0], p[1] + 40); wx.lineTo(p[0] - 26, p[1]); wx.closePath(); wx.fill(); });
    var wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.anisotropy = 8;
    function wall(len, px, pz, ry, hh, py) { var t = wtex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.4, (hh || H) / 2.4); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, hh || H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); m.position.set(px, py || H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    wall(HX - OG, -(HX + OG) / 2, HZ, Math.PI); wall(HX - OG, (HX + OG) / 2, HZ, Math.PI); wall(OG * 2, 0, HZ, Math.PI, H - OPH, OPH + (H - OPH) / 2);     // mur d'entrée, ouvert au milieu
    [[HX * 2, 0, -HZ + 0.05, 0], [HZ * 2, -HX + 0.05, 0, Math.PI / 2], [HZ * 2, HX - 0.05, 0, -Math.PI / 2]].forEach(function (d) { var m = new THREE.Mesh(new THREE.PlaneGeometry(d[0], 1.1), woodM); m.position.set(d[1], 0.55, d[2]); m.rotation.y = d[3]; g.add(m); box(g, d[3] === 0 ? d[0] : 0.1, 0.07, d[3] === 0 ? 0.1 : d[0], brass, d[3] === 0 ? 0 : (d[3] > 0 ? -HX + 0.05 : HX - 0.05), 1.12, d[3] === 0 ? -HZ + 0.05 : 0); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x120a05 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    for (i = -3; i <= 3; i++) box(g, 0.3, 0.3, HZ * 2, woodD, i * 3.4, H - 0.15, 0);
    var sc0 = mkCanvas(1536, 256), sx0 = sc0.getContext('2d'); sx0.textAlign = 'center'; sx0.textBaseline = 'middle'; sx0.shadowColor = '#ffb300'; sx0.shadowBlur = 24; sx0.fillStyle = '#fff1b8'; sx0.font = '900 170px ' + SERIF; sx0.fillText('🎲 LUDO', 768, 120, 1480); sx0.shadowBlur = 0; sx0.fillStyle = '#e0c585'; sx0.font = '700 54px ' + SERIF; sx0.fillText('PETITS CHEVAUX', 768, 220, 1480);
    var banner = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.17), new THREE.MeshBasicMaterial({ map: mkTex(sc0), transparent: true, depthWrite: false })); banner.position.set(0, 4.7, -HZ + 0.08); g.add(banner);
    // ouverture d'entrée (derrière soi)
    [-1, 1].forEach(function (sd) { box(g, 0.3, OPH + 0.1, 0.28, woodM, sd * (OG + 0.15), (OPH + 0.1) / 2, HZ - 0.12); });
    box(g, OG * 2 + 0.6, 0.3, 0.32, woodM, 0, OPH + 0.1, HZ - 0.14); box(g, OG * 2 + 0.7, 0.05, 0.36, brass, 0, OPH + 0.28, HZ - 0.14);
    var ec = mkCanvas(1024, 256), ex = ec.getContext('2d'); ex.fillStyle = '#1c1008'; ex.fillRect(0, 0, 1024, 256); ex.strokeStyle = '#d9a830'; ex.lineWidth = 10; ex.strokeRect(6, 6, 1012, 244); ex.textAlign = 'center'; ex.textBaseline = 'middle'; ex.fillStyle = '#fff1b8'; ex.font = '800 92px ' + SERIF; ex.fillText('🎮 MINI JEUX', 512, 100, 960); ex.fillStyle = '#d9c88f'; ex.font = '600 44px ' + MONO; ex.fillText('RETOUR · UNO · PUISSANCE 4', 512, 190, 960);
    box(g, 2.7, 0.76, 0.08, woodD, 0, OPH + 0.62, HZ - 0.36);
    var es = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: mkTex(ec), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); es.position.set(0, OPH + 0.62, HZ - 0.42); es.rotation.y = Math.PI; g.add(es);
    var CL = 3.2, cf = new THREE.Mesh(new THREE.PlaneGeometry(OG * 2, CL), new THREE.MeshStandardMaterial({ color: 0x5a0f1c, roughness: 0.8 })); cf.rotation.x = -Math.PI / 2; cf.position.set(0, 0.02, HZ + CL / 2); g.add(cf);
    var cce = new THREE.Mesh(new THREE.PlaneGeometry(OG * 2, CL), woodD); cce.rotation.x = Math.PI / 2; cce.position.set(0, OPH, HZ + CL / 2); g.add(cce);
    [-1, 1].forEach(function (sd) { var cw = new THREE.Mesh(new THREE.PlaneGeometry(CL, OPH), new THREE.MeshStandardMaterial({ color: 0x4a1422, roughness: 0.85 })); cw.rotation.y = -sd * Math.PI / 2; cw.position.set(sd * OG, OPH / 2, HZ + CL / 2); g.add(cw); });
    box(g, OG * 2, OPH, 0.05, new THREE.MeshBasicMaterial({ color: 0x3a0c18 }), 0, OPH / 2, HZ + CL);

    /* --- les deux tables avec leur plateau, leurs pions, leur dé et leurs quatre chaises --- */
    var boardTex = boardTexture();
    var pawnGeo = new THREE.LatheGeometry([[0.001, 0], [0.075, 0], [0.08, 0.018], [0.06, 0.05], [0.036, 0.1], [0.03, 0.13], [0.045, 0.15], [0.05, 0.18], [0.04, 0.215], [0.02, 0.235], [0.001, 0.24]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 28);
    var ringGeo = new THREE.TorusGeometry(0.11, 0.012, 8, 32), faces = [3, 4, 1, 6, 2, 5].map(diceFaceTex);
    var diceMats = faces.map(function (t) { return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }); });
    var tables = [], seats = [];
    TABLES.forEach(function (T, ti) {
      var tg = new THREE.Group(); tg.position.set(T.x, 0, T.z); g.add(tg);
      var top = box(tg, 3.7, 0.12, 3.7, woodM, 0, 0.74, 0); box(tg, 3.82, 0.05, 3.82, brass, 0, 0.8, 0); box(tg, 3.2, 0.05, 3.2, woodD, 0, 0.8, 0);
      [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].forEach(function (l) { box(tg, 0.22, 0.72, 0.22, woodD, l[0], 0.36, l[1]); });
      var brd = new THREE.Mesh(new THREE.PlaneGeometry(BS, BS), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5, metalness: 0.02 })); brd.rotation.x = -Math.PI / 2; brd.position.y = TOP_Y; tg.add(brd);
      box(tg, BS + 0.12, 0.04, BS + 0.12, woodM, 0, TOP_Y - 0.021, 0);
      room.colliders.push({ x: T.x, z: T.z, r: 2.1 });
      var T3 = { ti: ti, group: tg, pawns: [[], [], [], []], hits: [], dice: null, diceT: 99, diceFinal: null, diceSpin: null, sig: '', board: null };
      for (var c = 0; c < 4; c++) for (var j = 0; j < 4; j++) {
        var pm = new THREE.MeshStandardMaterial({ color: CHEX[c], roughness: 0.28, metalness: 0.12 }), pg = new THREE.Group();
        var body = new THREE.Mesh(pawnGeo, pm); pg.add(body);
        var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.012; ring.visible = false; pg.add(ring);
        var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.2; hit.userData = { c: c, i: j, ti: ti }; pg.add(hit); T3.hits.push(hit);
        var nc = mkCanvas(64, 64), nx = nc.getContext('2d'); nx.fillStyle = '#ffffff'; nx.beginPath(); nx.arc(32, 32, 28, 0, TAU); nx.fill(); nx.lineWidth = 6; nx.strokeStyle = CCSS[c]; nx.stroke(); nx.fillStyle = '#15151a'; nx.font = '800 38px ' + SERIF; nx.textAlign = 'center'; nx.textBaseline = 'middle'; nx.fillText(String(j + 1), 32, 35);
        var num = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(nc), transparent: true, depthTest: false })); num.scale.set(0.16, 0.16, 1); num.position.y = 0.42; num.visible = false; pg.add(num);
        tg.add(pg); pg.position.set(0, TOP_Y, 0);
        T3.pawns[c][j] = { g: pg, ring: ring, num: num, p: -2, x: 0, z: 0, q: [], wait: 0, y: 0 };
      }
      var dice = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.17), diceMats); dice.position.set(0, TOP_Y + 0.09, 1.7); tg.add(dice); T3.dice = dice;
      tables.push(T3);
      // panneau de la table, au-dessus
      var bc = mkCanvas(1024, 400), bt = mkTex(bc), bm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.33), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      bm.position.set(T.x, 3.3, T.z - 2.9); g.add(bm); box(g, 3.5, 1.45, 0.08, woodD, T.x, 3.3, T.z - 2.97);
      T3.board = { cv: bc, c: bc.getContext('2d'), tex: bt, sig: '' };
      if (!low) { var pl = new THREE.PointLight(0xffe2b0, 1.0, 9); pl.position.set(T.x, 3.4, T.z); g.add(pl); }
      var lamp = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.35, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1008, side: THREE.DoubleSide })); lamp.position.set(T.x, 3.9, T.z); g.add(lamp); box(g, 0.03, 2.3, 0.03, woodD, T.x, 5.1, T.z);
      for (var cc = 0; cc < 4; cc++) {
        (function (cc) {
          var sp = seatSpot(ti, cc), d = DIRS[cc], n = ti * 4 + cc, s = { n: n, ti: ti, c: cc, x: sp.x, z: sp.z, yaw: sp.yaw, sx: sp.x + d[0] * 1.0, sz: sp.z + d[1] * 1.0 };
          seats.push(s);
          var ch = new THREE.Group(); ch.position.set(sp.x, 0, sp.z); ch.rotation.y = -sp.yaw; g.add(ch);
          box(ch, 0.55, 0.08, 0.55, woodM, 0, 0.45, 0); box(ch, 0.55, 0.6, 0.08, new THREE.MeshStandardMaterial({ color: CHEX[cc], roughness: 0.6 }), 0, 0.8, 0.3); [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(function (l) { box(ch, 0.06, 0.45, 0.06, woodD, l[0], 0.22, l[1]); });
          room.colliders.push({ x: sp.x + d[0] * 0.25, z: sp.z + d[1] * 0.25, r: 0.4 });
          var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sp.x, 0.7, sp.z); g.add(hit);
          room.interactables.push({ hit: hit, x: sp.x, z: sp.z, radius: 1.6, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S’asseoir — Table ' + (ti + 1) + ' · ' + COLORS[cc]; }, use: function (w) { sit(w, s); } });
        })(cc);
      }
    });
    g.add(new THREE.AmbientLight(0xffe9cc, 0.75));
    var key = new THREE.DirectionalLight(0xfff0dc, 0.3); key.position.set(3, 8, 5); g.add(key);

    /* --- l'état de la table (serveur) --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, standEl = null, S = null, off = 0, list = null, polling = false, listPolling = false, pollT = 0, listT = 0, busy = false, code = '', shownKey = '', flash = '', flashT = 0;
    var lastReady = false, epoch = 0, joined = false, joinedAt = 0, lastDiceAt = 0, lastMoves = -1, lastId = '', clockT = 0;
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (kk) { var r = world.remote[kk]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function nowS() { return Date.now() + off; }
    function api(body) {
      return world.post('/api/ludo', Object.assign({ code: code }, body)).then(function (r) {
        if (!r) return { ok: false, error: 'Connecte-toi pour jouer.' };
        if (r.state) applyState(r.state);
        return r;
      });
    }
    function poll() {
      if (polling || !code) return; polling = true; var ep = epoch;
      fetch('/api/ludo?code=' + encodeURIComponent(code), { cache: 'no-store', headers: { 'X-Auth-Token': F.token() || '' } }).then(function (r) { return r.json(); }).then(function (d) {
        polling = false; if (ep !== epoch || !seat) return;
        if (d && d.ok && d.state) { if (!d.state.you) { if (joined && Date.now() - joinedAt > 2500) { world.flash('Tu n’es plus à cette table.'); stand(); } } else applyState(d.state); }
      }).catch(function () { polling = false; });
    }
    function pollList() {
      if (listPolling) return; listPolling = true;
      fetch('/api/ludo', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { listPolling = false; if (d && d.ok) list = d.tables; }).catch(function () { listPolling = false; });
    }

    /* --- pions : positions, sauts case par case, dé qui roule --- */
    function worldXZ(T3, gx, gz) { return [(gx - 7.5) * CS, (gz - 7.5) * CS]; }
    function stackOffsets(pawns) {                                   // plusieurs pions sur la même case : on les écarte un peu
      var groups = {}, out = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], res = {};
      for (var c = 0; c < 4; c++) for (var j = 0; j < 4; j++) { var p = pawns[c][j]; if (p < 0 || p === HOME) continue; var gp = gridPos(c, j, p), key = gp[0].toFixed(2) + ',' + gp[1].toFixed(2); (groups[key] = groups[key] || []).push([c, j]); }
      Object.keys(groups).forEach(function (key) { var gr = groups[key]; if (gr.length < 2) return; var sc = gr.length > 2 ? 0.2 : 0.16; gr.forEach(function (e, idx) { var a = idx / gr.length * TAU + 0.6; res[e[0] + '_' + e[1]] = [Math.cos(a) * sc, Math.sin(a) * sc]; }); });
      return res;
    }
    function targetOf(pawns, c, j, offs) { var p = pawns[c][j], gp = gridPos(c, j, p), o = offs[c + '_' + j] || [0, 0], w = worldXZ(null, gp[0] + o[0], gp[1] + o[1]); return w; }
    function applyPawns(T3, s, snap) {
      var offs = stackOffsets(s.pawns), mover = s.last && !snap ? s.last : null, moverTime = 0;
      for (var c = 0; c < 4; c++) for (var j = 0; j < 4; j++) {
        var P = T3.pawns[c][j], p = s.pawns[c][j], tg = targetOf(s.pawns, c, j, offs);
        if (P.p === -2 || snap) { P.p = p; P.x = tg[0]; P.z = tg[1]; P.q = []; P.wait = 0; P.g.position.set(P.x, TOP_Y, P.z); P.tx = tg[0]; P.tz = tg[1]; continue; }
        if (p !== P.p) {
          var q = [];
          if (p === -1) { q.push({ x: tg[0], z: tg[1], fly: true }); }
          else if (P.p === -1) { q.push({ x: tg[0], z: tg[1] }); }
          else { for (var st2 = P.p + 1; st2 <= p; st2++) { var gp2 = gridPos(c, j, st2), w2 = worldXZ(null, gp2[0], gp2[1]); q.push({ x: st2 === p ? tg[0] : w2[0], z: st2 === p ? tg[1] : w2[1] }); } }
          if (p === -1) P.wait = 0.25 + (mover ? (mover.dice || 1) * 0.26 : 0); else P.wait = 0;
          P.q = q; P.p = p;
        } else if (!P.q.length) { P.tx = tg[0]; P.tz = tg[1]; if (Math.hypot(P.x - tg[0], P.z - tg[1]) > 0.001) P.q = [{ x: tg[0], z: tg[1] }]; }
      }
    }
    function diceEuler(v) {
      var q = new THREE.Quaternion(), e = new THREE.Euler();
      if (v === 6) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); else if (v === 3) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); else if (v === 4) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      else if (v === 2) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); else if (v === 5) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      var yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * TAU); q.premultiply(yq); e.setFromQuaternion(q); return e;
    }
    function diceHome(c) { var d = DIRS[c]; return [d[0] * 1.66 - d[1] * 1.05, d[1] * 1.66 + d[0] * 1.05]; }
    function applyState(s) {
      if (!s) return;
      var first = !S || s.id !== lastId, T3 = tables[seat ? seat.ti : 0];
      S = s; off = s.serverNow - Date.now(); lastId = s.id;
      if (seat && T3) {
        applyPawns(T3, s, first || s.status !== 'playing' && s.status !== 'finished');
        if (s.rollAt && s.rollAt !== lastDiceAt && s.dice > 0 && !first) { lastDiceAt = s.rollAt; T3.diceT = 0; T3.diceFinal = diceEuler(s.dice); T3.diceSpin = [(Math.random() + 1) * TAU * 1.3, (Math.random() + 1) * TAU * 1.1, (Math.random() + 1) * TAU]; var h = diceHome(s.turn >= 0 ? s.turn : 0); T3.diceFrom = [T3.dice.position.x, T3.dice.position.z]; T3.diceTo = h; }
        else if (first) { lastDiceAt = s.rollAt || 0; T3.diceT = 99; if (s.dice > 0) { T3.diceFinal = diceEuler(s.dice); T3.dice.rotation.copy(T3.diceFinal); } var hh = diceHome(s.turn >= 0 ? s.turn : 0); T3.dice.position.set(hh[0], TOP_Y + 0.09, hh[1]); }
      }
      refreshUi();
    }

    /* --- panneaux des tables --- */
    function drawBoard(T3, ti) {
      var info = list && list[ti], c = T3.board.c, W = 1024, Hh = 400, live = seat && seat.ti === ti && S;
      var n = live ? S.players.length : info ? info.players : 0, status = live ? S.status : info ? info.status : 'lobby';
      var sig = [n, status, live ? S.turn : '', live ? S.winner : ''].join('|'); if (T3.board.sig === sig) return; T3.board.sig = sig;
      c.fillStyle = '#1c1008'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#d9a830'; c.lineWidth = 10; c.strokeRect(8, 8, W - 16, Hh - 16);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff1b8'; c.font = '900 120px ' + SERIF; c.fillText('TABLE ' + (ti + 1), W / 2, 100, W - 80);
      c.fillStyle = '#fff'; c.font = '800 66px ' + SERIF; c.fillText(n + ' / 4 joueurs', W / 2, 215, W - 80);
      c.fillStyle = '#ffd98a'; c.font = '700 48px ' + SERIF; c.fillText(status === 'playing' ? '🎲 Partie en cours' : status === 'finished' ? '🏁 Partie terminée' : n ? '⏳ En attente du lancement' : '🪑 Assieds-toi pour ouvrir cette table', W / 2, 315, W - 80);
      T3.board.tex.needsUpdate = true;
    }

    /* --- interface --- */
    function injectCss() {
      if (document.getElementById('ld3d-css')) return;
      var s = document.createElement('style'); s.id = 'ld3d-css';
      s.textContent = '.ld3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(620px,96%);max-height:58%;overflow:auto;background:rgba(18,10,4,.93);border:1px solid rgba(217,168,48,.65);border-radius:16px;padding:10px 14px;color:#fff1d6;pointer-events:auto;display:flex;flex-direction:column;gap:7px;z-index:5;font-size:13px}' +
        '.ld3d .ld-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800}.ld3d .ld-time{font-family:' + MONO + ';font-size:15px;color:#ffd98a}.ld3d .ld-bar{height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}.ld3d .ld-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd24a,#f08a00);width:0}' +
        '.ld3d .ld-msg{text-align:center;font-weight:800;font-size:15px;min-height:18px}.ld3d .ld-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}' +
        '.ld3d .ld-b{padding:10px 20px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1005;background:linear-gradient(90deg,#ffd24a,#f08a00)}.ld3d .ld-b:disabled{opacity:.4;cursor:not-allowed}.ld3d .ld-b.alt{background:#3a2a17;color:#ffe6b0}' +
        '.ld3d .ld-p{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;border:2px solid #4b3a22;background:#241608;font-weight:800;font-size:13px}.ld3d .ld-p i{width:12px;height:12px;border-radius:50%;display:inline-block}.ld3d .ld-p.turn{border-color:#ffd24a;background:#3b2c0e}.ld3d .ld-p small{opacity:.7;font-weight:600}' +
        '.ld3d .ld-n{width:46px;height:46px;border-radius:50%;border:3px solid #ffd24a;background:#2a1b0a;color:#fff;font-weight:900;font-size:19px;cursor:pointer}.ld3d .ld-log{font-size:11px;color:#c9b88a;max-height:44px;overflow:hidden}.ld3d .ld-log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ld3d .ld-note{font-size:12px;color:#d9c88f;text-align:center}.ld3d kbd{opacity:.7;font-size:11px;margin-left:4px}' +
        '.ld3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.ld3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(217,168,48,.7);background:rgba(18,10,4,.88);color:#fff1d6;font-weight:800;cursor:pointer}' +
        '@media (max-height:520px){.ld3d{bottom:62px;width:min(600px,64%);padding:5px 8px;gap:3px;max-height:56%}.ld3d .ld-msg{font-size:12px}.ld3d .ld-b{padding:6px 14px;font-size:13px}.ld3d .ld-n{width:36px;height:36px;font-size:16px}.ld3d .ld-p{padding:3px 8px;font-size:12px}.ld3d-stand{bottom:auto;top:64px}}';
      document.head.appendChild(s);
    }
    function fmtT(ms) { var s2 = Math.max(0, Math.ceil(ms / 1000)); return s2 + ' s'; }
    function refreshUi() {
      if (!ui || !seat || !S) return;
      var s = S, y = s.you || {}, el = ui.el, body = el.querySelector('.ld-body'), host = !!y.host;
      var key = JSON.stringify([s.status, s.phase, s.turn, s.dice, s.players.map(function (p) { return [p.name, p.color, p.left, p.host]; }), s.pawns, y.canRoll, y.canMove, y.legal, s.winner, s.log.length, flash, host, rollReady()]);
      if (key !== shownKey) {
        shownKey = key;
        var h = '', colsHome = function (c) { return s.pawns[c].filter(function (p) { return p === HOME; }).length; };
        h += '<div class="ld-row">' + s.players.map(function (p) { return '<span class="ld-p' + (s.status === 'playing' && s.turn === p.color ? ' turn' : '') + '"><i style="background:' + CCSS[p.color] + '"></i>' + esc(p.avatar) + ' ' + esc(p.name) + (p.host ? ' 👑' : '') + (p.left ? ' 🤖' : '') + (s.status !== 'lobby' ? '<small>' + colsHome(p.color) + '/4 🏠</small>' : '') + '</span>'; }).join('') + '</div>';
        if (s.status === 'lobby') {
          h += '<div class="ld-note">' + s.players.length + ' joueur' + (s.players.length > 1 ? 's' : '') + ' (de 2 à 4). Il faut un 6 pour sortir un pion. Aucun argent n’est en jeu.</div>';
          h += host ? '<div class="ld-row"><button class="ld-b" data-a="start"' + (s.players.length >= s.min ? '' : ' disabled') + '>▶ Lancer la partie</button></div>' : '<div class="ld-note">En attente du chef (' + esc(s.hostName) + ')…</div>';
        } else if (s.status === 'finished') {
          var wn = s.players.filter(function (p) { return p.color === s.winner; })[0];
          h += '<div class="ld-msg" style="color:#ffd98a;font-size:17px">🏆 ' + (wn ? esc(wn.name) : '?') + ' (' + COLORS[s.winner] + ') gagne la partie !</div>';
          h += host ? '<div class="ld-row"><button class="ld-b" data-a="again">🔁 Rejouer</button></div>' : '<div class="ld-note">En attente du chef…</div>';
        } else {
          var tp = s.players.filter(function (p) { return p.color === s.turn; })[0], mine = y.color === s.turn;
          h += '<div class="ld-msg">' + (mine ? '👉 À toi de jouer !' : 'Au tour de ' + (tp ? esc(tp.name) : '…') + ' (' + COLORS[s.turn] + ')') + (s.dice ? ' — dé : <b>' + s.dice + '</b>' : '') + '</div>';
          if (y.canRoll) h += '<div class="ld-row"><button class="ld-b" data-a="roll"' + (rollReady() ? '' : ' disabled') + '>🎲 Lancer le dé <kbd>Espace</kbd></button></div>';
          else if (y.canMove) h += '<div class="ld-row">' + (y.legal || []).map(function (j) { return '<button class="ld-n" data-m="' + j + '" style="border-color:' + CCSS[y.color] + '">' + (j + 1) + '</button>'; }).join('') + '</div><div class="ld-note">Clique sur un pion qui brille (ou sur son numéro).</div>';
          else if (mine) h += '<div class="ld-note">Un instant…</div>';
        }
        if (flash) h += '<div class="ld-note" style="color:#ff9a8a">' + esc(flash) + '</div>';
        h += '<div class="ld-log">' + s.log.slice(-3).map(function (l) { return '<div>• ' + esc(l.t) + '</div>'; }).join('') + '</div>';
        body.innerHTML = h;
      }
      el.querySelector('.ld-ph').textContent = (s.name || '') + (s.status === 'playing' ? ' · en cours' : s.status === 'lobby' ? ' · en attente' : ' · terminée');
      var left = s.phaseEnd - nowS(), tot = Math.max(1, s.phaseEnd - s.phaseStart);
      el.querySelector('.ld-time').textContent = s.status === 'playing' && s.phaseEnd ? fmtT(left) : '';
      el.querySelector('.ld-bar i').style.width = s.status === 'playing' && s.phaseEnd ? Math.max(0, Math.min(100, left / tot * 100)) + '%' : '0';
    }
    function rollReady() { return !!(S && S.phaseStart && nowS() >= S.phaseStart - 20); }
    function act(a, extra) {
      if (busy) return; busy = true;
      return api(Object.assign({ action: a }, extra || {})).then(function (r) { busy = false; if (!r || r.ok === false) { flash = (r && r.error) || 'Action impossible.'; flashT = 3.5; shownKey = ''; } else { flash = ''; } refreshUi(); return r; });
    }
    function onClick(e) {
      var b = e.target.closest('button'); if (!b || b.disabled || !seat || !S) return;
      if (b.dataset.a === 'start') act('start'); else if (b.dataset.a === 'again') act('again'); else if (b.dataset.a === 'roll') act('roll');
      else if (b.dataset.m !== undefined) act('move', { pawn: parseInt(b.dataset.m, 10) });
    }
    function onSeatKey(e) {
      if (!seat) return;
      var tag = e.target && e.target.tagName;
      if (e.code === 'Escape' || (e.code === 'KeyF' && tag !== 'INPUT')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (e.code === 'Space' && S && S.you && S.you.canRoll && rollReady()) { e.stopImmediatePropagation(); e.preventDefault(); act('roll'); }
      else if (/^(Digit|Numpad)[1-4]$/.test(e.code) && S && S.you && S.you.canMove) { var j = +e.code.slice(-1) - 1; if (S.you.legal.indexOf(j) >= 0) { e.stopImmediatePropagation(); e.preventDefault(); act('move', { pawn: j }); } }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (!loggedIn()) { w.flash('Connecte-toi pour jouer au Ludo.'); return; }
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      epoch++; joined = false; w.sitDown(room); seat = s; view.yaw = view.pitch = 0; S = null; shownKey = ''; busy = false; code = String(s.ti + 1); flash = ''; lastId = ''; lastDiceAt = 0;
      injectCss();
      var el = document.createElement('div'); el.className = 'ld3d';
      el.innerHTML = '<div class="ld-top"><b class="ld-ph"></b><span class="ld-time"></span></div><div class="ld-bar"><i></i></div><div class="ld-body"></div>';
      w.container.appendChild(el); ui = { el: el }; el.addEventListener('click', onClick);
      standEl = document.createElement('div'); standEl.className = 'ld3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      api({ action: 'join', seat: s.c, avatar: (st() && st().avatarEmoji) || '🧑‍🎤' }).then(function (r) {
        if (!seat || seat !== s) return;
        if (!r || r.ok === false) { w.flash((r && r.error) || 'Impossible de rejoindre cette table.'); stand(); return; }
        joined = true; joinedAt = Date.now();
      });
    }
    function stand() {
      if (!seat) return;
      var s = seat, c = code; seat = null; S = null; code = ''; epoch++; joined = false; polling = false;
      try { world.post('/api/ludo', { action: 'leave', code: c }); } catch (e) { /* ok */ }
      window.removeEventListener('keydown', onSeatKey, true);
      [ui && ui.el, standEl].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); }); ui = null; standEl = null;
      Object.keys(world.remote).forEach(function (kk) { var r = world.remote[kk]; if (r && r.person && r.person.look) { r.person.look(0); r.person.poseStep(0.5); } });
      tables.forEach(function (T3) { T3.pawns.forEach(function (row) { row.forEach(function (P) { P.p = -2; P.ring.visible = false; P.num.visible = false; }); }); });
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.12, z: 0.28 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-1.0, Math.min(1.0, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.35, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.7; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.2; }
      var T = TABLES[s.ti], d = DIRS[s.c], ex = T.x + d[0] * 2.45, ez = T.z + d[1] * 2.45, ey = 1.95, touch = world.touch;
      var a = Math.atan2(T.x - ex, -(T.z - ez)) + view.yaw, p = Math.atan2(TOP_Y - ey, 2.1) + view.pitch + (touch ? -0.2 : 0);
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 6, ty: ey + Math.sin(p) * 6, tz: ez - Math.cos(a) * Math.cos(p) * 6, fov: touch ? 54 : 58 };
    };
    // clic (ou toucher) sur un pion qui peut jouer
    room.seatClick = function (ray) {
      if (!seat || !S || !S.you || !S.you.canMove) return;
      var T3 = tables[seat.ti], mine = T3.hits.filter(function (h) { return h.userData.c === S.you.color && S.you.legal.indexOf(h.userData.i) >= 0; });
      var hit = ray.intersectObjects(mine, false)[0];
      if (hit) act('move', { pawn: hit.object.userData.i });
    };
    room.syncHud = function () { refreshUi(); };

    /* --- animation : pions, dé, regards --- */
    function animate(dt) {
      tables.forEach(function (T3, ti) {
        var live = seat && seat.ti === ti && S;
        // pions : sauts case par case (ou vol de retour à l'écurie)
        T3.pawns.forEach(function (row, c) {
          row.forEach(function (P, j) {
            if (P.wait > 0) { P.wait -= dt; }
            else if (P.q.length) {
              var tg = P.q[0], dx = tg.x - P.x, dz = tg.z - P.z, dist = Math.hypot(dx, dz), step = (tg.fly ? 1.8 : 1.15) * dt * (P.q.length > 1 ? 1.25 : 1);
              if (dist <= step) { P.x = tg.x; P.z = tg.z; P.q.shift(); P.hopT = 0; } else { P.x += dx / dist * step; P.z += dz / dist * step; }
              var fullD = tg.fly ? 2.2 : CS, ph = Math.max(0, 1 - dist / fullD); P.y = Math.sin(Math.min(1, ph) * Math.PI) * (tg.fly ? 0.5 : 0.13);
            } else P.y += (0 - P.y) * Math.min(1, dt * 12);
            P.g.position.set(P.x, TOP_Y + P.y, P.z);
            // pions qui peuvent jouer : anneau + numéro
            var can = !!(live && S.you && S.you.canMove && S.you.color === c && S.you.legal.indexOf(j) >= 0);
            P.ring.visible = can; P.num.visible = can; if (can) { var pu = 0.5 + 0.5 * Math.sin(clockT * 6); P.ring.material.opacity = 0.5 + 0.5 * pu; P.ring.scale.setScalar(1 + 0.12 * pu); P.g.children[0].position.y = 0.02 * pu; } else P.g.children[0].position.y = 0;
          });
        });
        // dé : roule puis se pose sur la bonne face, près du joueur dont c'est le tour
        if (T3.diceT < 1.2 && T3.diceFinal) {
          T3.diceT += dt; var u = Math.min(1, T3.diceT / 1.0), e1 = 1 - u; e1 = e1 * e1;
          T3.dice.rotation.set(T3.diceFinal.x + T3.diceSpin[0] * e1, T3.diceFinal.y + T3.diceSpin[1] * e1, T3.diceFinal.z + T3.diceSpin[2] * e1);
          T3.dice.position.set(T3.diceFrom[0] + (T3.diceTo[0] - T3.diceFrom[0]) * (1 - e1), TOP_Y + 0.09 + Math.abs(Math.sin(u * Math.PI * 2.5)) * 0.35 * (1 - u), T3.diceFrom[1] + (T3.diceTo[1] - T3.diceFrom[1]) * (1 - e1));
          if (u >= 1) { T3.diceT = 99; T3.dice.rotation.copy(T3.diceFinal); }
        } else if (live && S.turn >= 0 && S.status === 'playing') { var hm = diceHome(S.turn); T3.dice.position.x += (hm[0] - T3.dice.position.x) * Math.min(1, dt * 4); T3.dice.position.z += (hm[1] - T3.dice.position.z) * Math.min(1, dt * 4); }
      });
      // regards des joueurs assis : vers le dernier pion qui a bougé
      if (seat && S && S.last) {
        var T = TABLES[seat.ti], lp = S.last, gp = gridPos(lp.c, lp.i, lp.to === -1 ? 0 : lp.to), w2 = worldXZ(null, gp[0], gp[1]);
        Object.keys(world.remote).forEach(function (kk) {
          var r = world.remote[kk]; if (!r || !r.person || !r.person.look || r.seat < seat.ti * 4 || r.seat >= seat.ti * 4 + 4) return;
          var sp = seatSpot(seat.ti, r.seat - seat.ti * 4), rel = wrapPi(Math.atan2(T.x + w2[0] - sp.x, -(T.z + w2[1] - sp.z)) - sp.yaw);
          r.person.look(-rel); r.person.poseStep(dt);
        });
      }
    }

    room.spawn = function () { return { x: 0, z: HZ - 2.6, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche une chaise pour t’asseoir à une table · derrière toi : retour aux mini jeux' : 'ZQSD / flèches : marcher · Maj : courir · avance vers une chaise (F ou clic) : tu rejoins la table de cette couleur · assis : Espace lance le dé, 1 à 4 ou clic joue un pion · F : se lever · derrière toi : retour aux mini jeux'; };
    room.onEnter = function () { pollList(); };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt; pollT += dt; listT += dt;
      if (world.mode === 'room' && !world.trans && world.blend === 0 && world.player.z > HZ - 1.15 && Math.abs(world.player.x) < OG - 0.2) world.goRoom('uno', 'ludo');     // on repasse l'ouverture : retour aux mini jeux
      if (seat && pollT > (S && S.status === 'playing' ? 0.6 : 1)) { pollT = 0; poll(); }
      if (listT > 3) { listT = 0; pollList(); }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flash = ''; shownKey = ''; refreshUi(); } }
      if (seat && S && ui) { var left = S.phaseEnd - nowS(); var tm = ui.el.querySelector('.ld-time'); if (tm && S.status === 'playing') { tm.textContent = fmtT(left); ui.el.querySelector('.ld-bar i').style.width = Math.max(0, Math.min(100, left / Math.max(1, S.phaseEnd - S.phaseStart) * 100)) + '%'; } var rdy = rollReady(); if (rdy !== lastReady) { lastReady = rdy; shownKey = ''; refreshUi(); } }
      tables.forEach(function (T3, ti) { drawBoard(T3, ti); if (T3.board.shown !== T3.board.sig) { T3.board.tex.needsUpdate = true; T3.board.shown = T3.board.sig; } });
      animate(dt);
    };
    room._dbg = { apply: function (s) { applyState(s); }, tables: tables, sit: sit };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('ludo', createLudoRoom);
})();
