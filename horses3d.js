/* =====================================================================
   horses3d.js — Salle 3D « Courses de chevaux » des Flambeurs (Three.js r128)
   ---------------------------------------------------------------------
   Une grande table de jeu vitrée avec une piste ovale et 8 petits chevaux (comme les tables d'arcade
   de courses), un grand écran au bout, des bornes de pari et des chaises tout autour.
   On marche dans la salle, on s'assoit où on veut, et on regarde la course soit à travers la vitre
   (vue assise), soit d'en haut.
   Cette salle ne s'occupe que de ce qu'on VOIT : la course est décrite par un « état » (room.setState)
   { id, t0, finish:[8 durées en secondes] } ; le serveur de course le fournira. En attendant, un cycle
   provisoire tourne tout seul dans le navigateur (room.demo).
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  /* ---------- les 8 chevaux ---------- */
  var HORSES = [
    { n: 1, name: 'Éclair', silk: 0xf2f2f2, ink: '#222222', coat: 0x7a4a2a },
    { n: 2, name: 'Tempête', silk: 0x222222, ink: '#ffffff', coat: 0x3a2a22 },
    { n: 3, name: 'Pharaon', silk: 0xd63a3a, ink: '#ffffff', coat: 0xa0663a },
    { n: 4, name: 'Safran', silk: 0x2f6fe0, ink: '#ffffff', coat: 0xc08a50 },
    { n: 5, name: 'Orage', silk: 0xf2d12a, ink: '#222222', coat: 0x5a3a24 },
    { n: 6, name: 'Mirage', silk: 0x2fa050, ink: '#ffffff', coat: 0xd8c8a8 },
    { n: 7, name: 'Jackpot', silk: 0xf08a24, ink: '#222222', coat: 0x8a5a38 },
    { n: 8, name: 'Valkyrie', silk: 0xe86aa8, ink: '#222222', coat: 0x4a3a30 }
  ];
  F.HORSES = HORSES;

  /* ---------- la piste (mètres, table centrée en 0,0 ; le nord est vers -z, vers le grand écran) ---------- */
  var S = 5;                          // longueur des lignes droites
  var HS = S / 2;
  var R_OUT = 2.5, R_IN = 1.05;       // bord extérieur / île centrale
  var LANE0 = 1.32, LANE_STEP = 0.14; // rayon du couloir 1, écart entre couloirs
  var Z0 = 1.0;                       // ligne de départ = ligne d'arrivée (ligne droite est)
  var TY = 0.93;                      // hauteur du tapis vert
  var HX = 11, HZ = 13;               // demi-largeur / demi-profondeur de la salle
  var BET_MS = 12000, CLOSE_MS = 2000, RACE_MS = 30000, RESULT_MS = 10000;   // mêmes durées que api/horses.js

  function laneR(i) { return LANE0 + i * LANE_STEP; }
  function laneLen(r) { return 2 * S + 2 * Math.PI * r; }

  // position et direction sur un couloir de rayon r, à la distance d depuis la ligne de départ (sens : nord d'abord, côté est)
  function lanePos(r, d, out) {
    var L = laneLen(r), q1 = Z0 + HS, a = Math.PI * r, t;
    out = out || {};
    d = ((d % L) + L) % L;
    if (d < q1) { out.x = r; out.z = Z0 - d; out.hx = 0; out.hz = -1; return out; }
    d -= q1;
    if (d < a) { t = d / r; out.x = r * Math.cos(t); out.z = -HS - r * Math.sin(t); out.hx = -Math.sin(t); out.hz = -Math.cos(t); return out; }
    d -= a;
    if (d < S) { out.x = -r; out.z = -HS + d; out.hx = 0; out.hz = 1; return out; }
    d -= S;
    if (d < a) { t = d / r; out.x = -r * Math.cos(t); out.z = HS + r * Math.sin(t); out.hx = Math.sin(t); out.hz = Math.cos(t); return out; }
    d -= a;
    out.x = r; out.z = HS - d; out.hx = 0; out.hz = -1; return out;
  }

  // avancée d'un cheval (en tours : 0 = départ, 1 = arrivée) au bout de t secondes, sachant qu'il franchit la ligne à T secondes
  // (petites variations de rythme, toujours croissantes, qui ne changent pas l'ordre d'arrivée)
  function progress(i, t, T) {
    if (t <= 0) return 0;
    var s = t / T;
    if (s >= 1) return 1 + 0.1 * (1 - Math.exp(-(t - T) * 0.8));
    var k = 1 + (i % 3), ph = i * 1.7;
    return s + 0.022 * Math.sin(Math.PI * s) * Math.sin(TAU * k * s + ph);
  }

  // phase de la course à l'instant now (ms) : 'betting' | 'racing' | 'results' | 'done' + secondes écoulées dans la course
  function phaseOf(st, now) {
    var el = now - st.t0;
    if (!st.t0) return { phase: 'waiting', left: 0, t: 0, open: true };   // personne n'a encore parié : rien ne démarre
    // tant que le classement n'est pas arrivé du serveur (il l'envoie 2 s avant le départ), on reste en attente
    if (el < BET_MS || !st.finish) return { phase: 'betting', left: Math.max(0, (BET_MS - el) / 1000), t: 0, open: el < BET_MS - CLOSE_MS };
    if (el < BET_MS + RACE_MS) return { phase: 'racing', left: (BET_MS + RACE_MS - el) / 1000, t: (el - BET_MS) / 1000 };
    if (el < BET_MS + RACE_MS + RESULT_MS) return { phase: 'results', left: (BET_MS + RACE_MS + RESULT_MS - el) / 1000, t: (el - BET_MS) / 1000 };
    return { phase: 'done', left: 0, t: (el - BET_MS) / 1000 };
  }
  function orderOf(finish) {
    return finish.map(function (t, i) { return { i: i, t: t }; }).sort(function (a, b) { return a.t - b.t; }).map(function (o) { return o.i; });
  }
  F.HorseTrack = { lanePos: lanePos, progress: progress, phaseOf: phaseOf, orderOf: orderOf, laneR: laneR, laneLen: laneLen };

  /* ---------- outils de dessin ---------- */
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  function stadiumShape(R, hole) {
    var sh = hole ? new THREE.Path() : new THREE.Shape();
    sh.moveTo(R, -HS); sh.lineTo(R, HS); sh.absarc(0, HS, R, 0, Math.PI, false);
    sh.lineTo(-R, -HS); sh.absarc(0, -HS, R, Math.PI, TAU, false);
    return sh;
  }
  function flatExtrude(shape, depth, y, mat, bevel) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 20 });
    var m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
  }
  // bande verticale qui suit le contour de la table (vitre, néons…) : rayon rb en bas, rt en haut
  function ribbon(rb, rt, y0, y1, mat) {
    var n = 120, pts = [], p = {}, i, L = laneLen(rb), pos = [], idx = [];
    for (i = 0; i < n; i++) {
      lanePos(rb, i / n * L, p);
      // le haut de la bande est le même contour décalé vers l'extérieur de (rt - rb) ; la piste tourne à l'envers des aiguilles : l'extérieur est à droite
      pts.push([p.x, p.z, p.x - p.hz * (rt - rb), p.z + p.hx * (rt - rb)]);
    }
    for (i = 0; i < n; i++) { var q = pts[i]; pos.push(q[0], y0, q[1], q[2], y1, q[3]); }
    for (i = 0; i < n; i++) { var a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  // texture du tapis : herbe, couloirs, ligne de départ, numéros
  function trackTexture() {
    var K = 100, W = 2 * R_OUT + 0.2, Hh = S + 2 * R_OUT + 0.2, c = mkCanvas(Math.round(W * K), Math.round(Hh * K)), x = c.getContext('2d');
    var cx = c.width / 2, cy = c.height / 2;
    function path(R) {
      x.beginPath(); x.moveTo(cx - R * K, cy - HS * K); x.arc(cx, cy - HS * K, R * K, Math.PI, TAU, false);
      x.lineTo(cx + R * K, cy + HS * K); x.arc(cx, cy + HS * K, R * K, 0, Math.PI, false); x.closePath();
    }
    x.fillStyle = '#0b1220'; x.fillRect(0, 0, c.width, c.height);
    path(R_OUT); x.fillStyle = '#2e9a47'; x.fill();
    x.save(); path(R_OUT); x.clip();
    for (var rr = R_IN; rr < R_OUT; rr += 0.2) { path(rr + 0.1); x.strokeStyle = 'rgba(0,0,0,0.05)'; x.lineWidth = 0.1 * K; x.stroke(); }
    x.restore();
    path(R_IN); x.fillStyle = '#1d6b5a'; x.fill();
    var i;
    for (i = 0; i <= 8; i++) { path(LANE0 + (i - 0.5) * LANE_STEP); x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 1.5; x.stroke(); }
    path(R_OUT - 0.02); x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.stroke();
    path(R_IN + 0.02); x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.stroke();
    // ligne de départ / d'arrivée en damier
    var y0 = cy + Z0 * K, xa = cx + (LANE0 - LANE_STEP * 0.6) * K, xb = cx + (laneR(7) + LANE_STEP * 0.6) * K, sz = 7;
    for (var qx = xa, k = 0; qx < xb; qx += sz, k++) for (var qy = -1; qy < 1; qy++) { x.fillStyle = (k + qy) % 2 ? '#111' : '#fff'; x.fillRect(qx, y0 + qy * sz, sz, sz); }
    // numéros de couloir, juste derrière la ligne
    x.textAlign = 'center'; x.textBaseline = 'middle';
    HORSES.forEach(function (h, j) {
      var px = cx + laneR(j) * K, py = y0 + 0.2 * K;
      x.beginPath(); x.arc(px, py, 0.055 * K, 0, TAU); x.fillStyle = hex(h.silk); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = h.ink; x.font = '800 ' + Math.round(0.07 * K) + 'px ' + MONO; x.fillText(String(h.n), px, py + 1);
    });
    var t = mkTex(c); t.anisotropy = 4; return { tex: t, w: W, h: Hh };
  }

  function numTex(n, silk, ink) {
    var c = mkCanvas(128, 128), x = c.getContext('2d');
    x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.fillStyle = hex(silk); x.fill(); x.lineWidth = 8; x.strokeStyle = '#ffffff'; x.stroke();
    x.fillStyle = ink; x.font = '900 78px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 70);
    return mkTex(c);
  }

  /* ---------- panneau de paris (styles injectés une seule fois) ---------- */
  function injectBetCss() {
    if (document.getElementById('hb-style')) return;
    var st = document.createElement('style'); st.id = 'hb-style';
    st.textContent =
      '.hbet{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:min(580px,calc(100% - 16px));display:flex;flex-direction:column;gap:6px;pointer-events:none;font-family:"Plus Jakarta Sans",system-ui,sans-serif}' +
      '.hbet button{pointer-events:auto;cursor:pointer;color:#f4e3b0;background:rgba(8,12,22,.84);border:1px solid rgba(90,170,255,.45);border-radius:10px;font-weight:800;font-size:12px;min-height:34px}' +
      '.hbet button.on{border-color:#ffd24a;background:rgba(60,44,6,.92);box-shadow:0 0 12px rgba(255,200,60,.45)}' +
      '.hbet i{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-style:normal;font-weight:900;font-size:12px;border:1.5px solid #fff;box-sizing:border-box;vertical-align:middle}' +
      '.hb-horses{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}' +
      '.hb-horses button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 0}' +
      '.hb-horses b{font-size:10.5px;color:#9fd0ff;font-family:"Orbitron",monospace}' +
      '.hb-row{display:flex;gap:6px;align-items:stretch}.hb-row>button{flex:1}' +
      '.hb-row b{color:#ffd24a;margin-left:4px;font-family:"Orbitron",monospace}' +
      '.hb-places{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}' +
      '.hb-step{flex:none!important;width:46px;font-size:22px!important;color:#f3cf62!important}' +
      '.hb-amt{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,12,22,.84);border:1px solid rgba(90,170,255,.45);border-radius:10px;font-size:10px;color:#9a8a58;font-weight:700;letter-spacing:.08em}' +
      '.hb-amt b{color:#ffd24a;font-size:17px;letter-spacing:0;font-family:"Orbitron",monospace}' +
      '.hbet .hb-go{flex:1.6;border:2px solid #ffe08a;background:linear-gradient(180deg,#d8a928,#8a6410);color:#1a1000;font-size:14px;box-shadow:0 0 16px rgba(255,200,60,.4)}' +
      '.hbet .hb-go[disabled]{filter:grayscale(.7) brightness(.6);box-shadow:none}' +
      '.hb-mine{background:rgba(8,12,22,.78);border:1px solid rgba(90,170,255,.3);border-radius:10px;padding:5px 8px;font-size:11.5px;font-weight:700;color:#d9e6ff;display:flex;flex-direction:column;gap:3px}' +
      '.hb-mine .e{color:#7f8aa3}.hb-mine .w{color:#6dffa0}.hb-mine .l{color:#ff8a8a}.hb-mine u{color:#ffd24a;cursor:pointer;pointer-events:auto;margin-left:4px}' +
      '.hb-msg{text-align:center;font-weight:800;font-size:13px;color:#ffe08a;text-shadow:0 1px 4px #000;min-height:0}';
    document.head.appendChild(st);
  }

  /* ---------- un petit cheval de table (regarde vers +z) ---------- */
  var hGeo = null;
  function horseGeo() {
    if (!hGeo) hGeo = {
      body: new THREE.SphereGeometry(1, 14, 10), neck: new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8), head: new THREE.BoxGeometry(0.06, 0.07, 0.14),
      leg: new THREE.CylinderGeometry(0.014, 0.01, 0.17, 6), tail: new THREE.ConeGeometry(0.03, 0.15, 6), torso: new THREE.CylinderGeometry(0.045, 0.05, 0.11, 8),
      jhead: new THREE.SphereGeometry(0.032, 10, 8), cap: new THREE.SphereGeometry(0.036, 10, 6, 0, TAU, 0, Math.PI * 0.55), blanket: new THREE.PlaneGeometry(0.1, 0.09)
    };
    return hGeo;
  }
  function createHorse(h, idx) {
    var G = horseGeo(), coat = new THREE.MeshLambertMaterial({ color: h.coat }), dark = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
    var silk = new THREE.MeshLambertMaterial({ color: h.silk }), skin = new THREE.MeshLambertMaterial({ color: 0xe0ac82 });
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    function add(geom, mat, px, py, pz, parent) { var m = new THREE.Mesh(geom, mat); m.position.set(px, py, pz); (parent || body).add(m); return m; }
    var bd = add(G.body, coat, 0, 0.21, 0); bd.scale.set(0.065, 0.075, 0.17);
    var neck = add(G.neck, coat, 0, 0.29, 0.15); neck.rotation.x = 0.7;
    var head = add(G.head, coat, 0, 0.35, 0.22); head.rotation.x = 0.35;
    add(G.tail, dark, 0, 0.23, -0.19).rotation.x = -2.2;
    var legs = [];
    [[-0.04, 0.1], [0.04, 0.1], [-0.04, -0.11], [0.04, -0.11]].forEach(function (p, k) {
      var piv = new THREE.Group(); piv.position.set(p[0], 0.17, p[1]); body.add(piv);
      add(G.leg, dark, 0, -0.085, 0, piv); legs.push(piv); piv.userData.k = k;
    });
    // petit jockey aux couleurs du cheval
    add(G.torso, silk, 0, 0.33, -0.01).rotation.x = 0.5;
    add(G.jhead, skin, 0, 0.405, 0.03); add(G.cap, silk, 0, 0.412, 0.03);
    // numéro sur le tapis de selle (des deux côtés) et au-dessus du cheval (lisible d'en haut)
    var tex = numTex(h.n, h.silk, h.ink);
    [-1, 1].forEach(function (s) { var m = new THREE.Mesh(G.blanket, new THREE.MeshBasicMaterial({ map: tex, transparent: true })); m.position.set(s * 0.067, 0.22, -0.02); m.rotation.y = s * Math.PI / 2; body.add(m); });
    var tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    tag.scale.set(0.13, 0.13, 1); tag.position.set(0, 0.5, 0); g.add(tag);
    return { group: g, body: body, legs: legs, phase: idx * 1.3, mats: [coat, dark, silk, skin], tex: tex, tag: tag };
  }

  /* ===================== LA SALLE ===================== */
  function createHorsesRoom(world, cfg) {
    var low = world.low;
    var room = {
      title: 'COURSES DE CHEVAUX', subtitle: 'PARIE SUR TON FAVORI', topic: 'flambeurs-horses-room',
      group: new THREE.Group(), doors: [], interactables: [], colliders: [], seats: [], seatEntry: null,
      view: { yaw: 0, pitch: 0, yawG: 0, pitchG: 0, mode: 'glass', lastDrag: -99, cx: 0, cy: 3, cz: 8, fov: 55, fovG: 55 },
      state: null, demo: true, clockOffset: 0
    };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };
    function box(w, h, d, px, py, pz, mat, parent) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); (parent || g).add(m); return m; }

    var matDark = new THREE.MeshStandardMaterial({ color: 0x0c1119, roughness: 0.5, metalness: 0.5 });
    var matMetal = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.35, metalness: 0.7 });
    var neonB = new THREE.MeshBasicMaterial({ color: 0x3a8dff }), neonC = new THREE.MeshBasicMaterial({ color: 0x56e6ff });

    /* ----- salle : sol clair, murs verts, plafond sombre avec spots ----- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = '#cfd6d8'; fx.fillRect(0, 0, 256, 256); fx.strokeStyle = 'rgba(80,90,100,0.35)'; fx.lineWidth = 2;
    fx.strokeRect(1, 1, 254, 254); fx.beginPath(); fx.moveTo(128, 0); fx.lineTo(128, 256); fx.moveTo(0, 128); fx.lineTo(256, 128); fx.stroke();
    fx.globalAlpha = 0.06; for (var i = 0; i < 80; i++) { fx.fillStyle = i % 2 ? '#fff' : '#000'; fx.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 20, 1); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.4, metalness: 0.15 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x2f7a5a, roughness: 0.9 }), wallLow = new THREE.MeshStandardMaterial({ color: 0x14312a, roughness: 0.8 });
    function wall(w, h, px, py, pz, ry, mat) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 6, 0, 3, -HZ, 0); wall(HX * 2, 6, 0, 3, HZ, Math.PI); wall(HZ * 2, 6, -HX, 3, 0, Math.PI / 2); wall(HZ * 2, 6, HX, 3, 0, -Math.PI / 2);
    wall(HX * 2, 1, 0, 0.5, -HZ + 0.02, 0, wallLow); wall(HX * 2, 1, 0, 0.5, HZ - 0.02, Math.PI, wallLow);
    wall(HZ * 2, 1, -HX + 0.02, 0.5, 0, Math.PI / 2, wallLow); wall(HZ * 2, 1, HX - 0.02, 0.5, 0, -Math.PI / 2, wallLow);
    [[HX * 2, 0.06, 0.06, 0, 1, -HZ + 0.04], [HX * 2, 0.06, 0.06, 0, 1, HZ - 0.04], [0.06, 0.06, HZ * 2, -HX + 0.04, 1, 0], [0.06, 0.06, HZ * 2, HX - 0.04, 1, 0]].forEach(function (d) { box(d[0], d[1], d[2], d[3], d[4], d[5], neonC); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x080b12 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; g.add(ceil);
    var spotM = new THREE.MeshBasicMaterial({ color: 0xfff0d0 }), spotG = new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10), spots = new THREE.Group(); g.add(spots);
    for (var sx = -8; sx <= 8; sx += 4) for (var sz = -10; sz <= 10; sz += 4) { var sp = new THREE.Mesh(spotG, spotM); sp.position.set(sx, 5.9, sz); spots.add(sp); }

    /* ----- la table de jeu ----- */
    var tt = trackTexture();
    var felt = new THREE.Mesh(new THREE.PlaneGeometry(tt.w, tt.h), new THREE.MeshStandardMaterial({ map: tt.tex, roughness: 0.95, metalness: 0 }));
    felt.rotation.x = -Math.PI / 2; felt.position.y = TY; g.add(felt);
    g.add(flatExtrude(stadiumShape(R_OUT + 0.55), TY - 0.02, 0, matMetal));                                   // le coffre de la table
    var rimShape = stadiumShape(R_OUT + 0.9); rimShape.holes.push(stadiumShape(R_OUT + 0.06, true));
    g.add(flatExtrude(rimShape, 0.09, TY - 0.01, matDark));                                                 // le rebord qui porte les bornes
    var skirt = ribbon(R_OUT + 0.56, R_OUT + 0.56, 0.42, 0.5, neonB); skirt.material.side = THREE.DoubleSide; g.add(skirt);
    var edge = ribbon(R_OUT + 0.9, R_OUT + 0.9, TY + 0.06, TY + 0.1, neonC); edge.material.side = THREE.DoubleSide; g.add(edge);
    var glassMat = new THREE.MeshStandardMaterial({ color: 0xa8d8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
    g.add(ribbon(R_OUT + 0.08, R_OUT + 0.08, TY + 0.08, TY + 0.36, glassMat));                              // la vitre
    var glassTop = ribbon(R_OUT + 0.08, R_OUT + 0.08, TY + 0.36, TY + 0.38, neonC); glassTop.material.side = THREE.DoubleSide; g.add(glassTop);
    // l'île du milieu : un plateau vert arrondi avec un petit dôme
    var isl = flatExtrude(stadiumShape(R_IN - 0.02), 0.1, TY, new THREE.MeshStandardMaterial({ color: 0x1f7a62, roughness: 0.6 }), 0.03); g.add(isl);
    var pad = flatExtrude(stadiumShape(R_IN - 0.3), 0.07, TY + 0.13, new THREE.MeshStandardMaterial({ color: 0x2aa37e, roughness: 0.5 }), 0.02); g.add(pad);
    [[0, -1.7], [0, 1.7]].forEach(function (p) {
      var d = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 18), new THREE.MeshStandardMaterial({ color: 0x14533f, roughness: 0.5, metalness: 0.3 }));
      d.position.set(p[0], TY + 0.2, p[1] * 0.5); g.add(d);
      var l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), neonC); l.position.set(p[0], TY + 0.31, p[1] * 0.5); g.add(l);
    });
    // départ : une barrière légère qui se lève quand la course commence
    var gate = box(laneR(7) - laneR(0) + 0.35, 0.025, 0.025, (laneR(0) + laneR(7)) / 2, TY + 0.2, Z0 + 0.3, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    // grosse enseigne néon sur la face nord et colliders de la table (cercles qui recouvrent le rebord)
    for (var cz = -HS; cz <= HS + 0.01; cz += 0.85) room.colliders.push({ x: 0, z: cz, r: R_OUT + 1.0 });
    room.colliders.push({ x: 0, z: -HS, r: R_OUT + 1.05 }, { x: 0, z: HS, r: R_OUT + 1.05 });

    /* ----- grand écran au bout de la table ----- */
    var scr = mkCanvas(1024, 576), sctx = scr.getContext('2d'), scrTex = mkTex(scr);
    var SCZ = -(HS + R_OUT + 1.4);
    box(6.6, 3.9, 0.3, 0, 3.4, SCZ - 0.05, matDark);
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.49), new THREE.MeshBasicMaterial({ map: scrTex })); screen.position.set(0, 3.4, SCZ + 0.11); g.add(screen);
    box(0.12, 3.9, 0.12, -3.4, 3.4, SCZ + 0.12, neonB); box(0.12, 3.9, 0.12, 3.4, 3.4, SCZ + 0.12, neonB);
    box(6.8, 0.1, 0.12, 0, 5.4, SCZ + 0.12, neonC);
    box(0.25, 1.6, 0.25, -2.6, 0.8, SCZ - 0.05, matMetal); box(0.25, 1.6, 0.25, 2.6, 0.8, SCZ - 0.05, matMetal);
    var sg = mkCanvas(1024, 160), sgx = sg.getContext('2d');
    sgx.fillStyle = '#0b1220'; sgx.fillRect(0, 0, 1024, 160); sgx.textAlign = 'center'; sgx.textBaseline = 'middle'; sgx.fillStyle = '#7fd1ff'; sgx.shadowColor = '#2a9dff'; sgx.shadowBlur = 24;
    sgx.font = '900 84px ' + SERIF; sgx.fillText('GRAND PRIX', 512, 62); sgx.shadowBlur = 0; sgx.fillStyle = '#d9c88f'; sgx.font = '700 30px ' + MONO; sgx.fillText('✦  LES FLAMBEURS  ✦', 512, 126);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.96), new THREE.MeshBasicMaterial({ map: mkTex(sg) })); sign.position.set(0, 6 - 0.52, -HZ + 0.05); g.add(sign);
    room.colliders.push({ x: 0, z: SCZ - 0.05, r: 3.6 });

    /* ----- terminaux le long des murs, comme dans la salle d'arcade ----- */
    var termScreens = [];
    for (var v = 0; v < 3; v++) {
      var tc = mkCanvas(128, 96), tx = tc.getContext('2d'), grd = tx.createLinearGradient(0, 0, 0, 96);
      grd.addColorStop(0, ['#2a7bff', '#2fc27a', '#c84bff'][v]); grd.addColorStop(1, '#0b1a3a'); tx.fillStyle = grd; tx.fillRect(0, 0, 128, 96);
      tx.fillStyle = 'rgba(255,255,255,0.8)'; for (var l = 0; l < 6; l++) tx.fillRect(10, 10 + l * 13, 30 + Math.random() * 80, 6);
      termScreens.push(new THREE.MeshBasicMaterial({ map: mkTex(tc) }));
    }
    var termBody = new THREE.BoxGeometry(0.8, 1.4, 0.7), termScr = new THREE.PlaneGeometry(0.62, 0.42);
    [-1, 1].forEach(function (s) {
      for (var tz = -9; tz <= 9; tz += 3) {
        var tb = new THREE.Mesh(termBody, matDark); tb.position.set(s * (HX - 0.7), 0.7, tz); g.add(tb);
        var ts = new THREE.Mesh(termScr, termScreens[Math.abs(tz / 3) % 3]); ts.position.set(s * (HX - 0.7) - s * 0.36, 1.1, tz); ts.rotation.y = -s * Math.PI / 2; g.add(ts);
        room.colliders.push({ x: s * (HX - 0.7), z: tz, r: 0.75 });
      }
    });

    /* ----- bornes de pari et chaises hautes autour de la table ----- */
    var consoleTex = (function () {
      var c = mkCanvas(256, 128), x = c.getContext('2d'); x.fillStyle = '#071326'; x.fillRect(0, 0, 256, 128);
      x.strokeStyle = '#3a8dff'; x.lineWidth = 4; x.strokeRect(3, 3, 250, 122); x.fillStyle = '#9fd0ff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '800 30px ' + MONO; x.fillText('PARIS', 128, 38); x.fillStyle = '#f3cf62'; x.font = '700 18px ' + MONO; x.fillText('1  2  3  4  5  6  7  8', 128, 84); return mkTex(c);
    })();
    var chairM = new THREE.MeshStandardMaterial({ color: 0x151c2a, roughness: 0.6, metalness: 0.3 }), chairG = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16);
    var backG = new THREE.BoxGeometry(0.06, 0.42, 0.42), poleG = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), footG = new THREE.TorusGeometry(0.26, 0.014, 6, 18);
    var n = 0;
    [1, -1].forEach(function (s) {          // s = 1 : côté est (regarde vers -x) ; s = -1 : côté ouest
      for (var zz = -2.5; zz <= 2.5 + 0.01; zz += 1) {
        var cxp = s * 4.55, czp = zz, seat = { n: ++n, side: s, x: cxp, z: czp, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, occBy: null };
        // borne : bureau, pied et petit écran incliné
        box(0.8, 0.05, 0.5, s * 3.95, 0.8, czp, matDark); box(0.1, 0.78, 0.1, s * 3.95, 0.39, czp, matMetal);
        var cs = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: consoleTex })); cs.position.set(s * 3.8, 0.97, czp); cs.rotation.set(0, -s * Math.PI / 2, 0); cs.rotateX(-0.45); g.add(cs);
        box(0.52, 0.03, 0.02, s * 3.8, 1.1, czp, neonB).rotation.y = s * Math.PI / 2;
        // chaise haute avec repose-pieds
        var cg = new THREE.Group(); cg.position.set(cxp, 0, czp); g.add(cg);
        var ss = new THREE.Mesh(chairG, chairM); ss.position.y = 0.62; cg.add(ss);
        var pole = new THREE.Mesh(poleG, matMetal); pole.position.y = 0.3; cg.add(pole);
        var ring = new THREE.Mesh(footG, matMetal); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; cg.add(ring);
        var back = new THREE.Mesh(backG, chairM); back.position.set(s * 0.25, 0.86, 0); cg.add(back);
        seat.hit = back; seat.cg = cg;
        room.seats.push(seat);
        room.colliders.push({ x: cxp, z: czp, r: 0.42 });
        room.interactables.push({
          hit: back, x: s * 5.85, z: czp, radius: 1.5,
          enabled: function () { return !seat.occBy; },
          prompt: function () { return '🪑 S\'asseoir — Place ' + seat.n; },
          use: function () { room.sit(seat); }
        });
      }
    });
    // porte de sortie vers le hall
    if (cfg && cfg.hall) world.addDoor(room, { x: 0, z: HZ - 0.02, nx: 0, nz: -1, w: 1.8, h: 2.9, label: 'HALL', sub: 'Sortie', color: 0xffe9b0, target: 'hall' });

    /* ----- éclairage ----- */
    g.add(new THREE.AmbientLight(0xb8c4e0, 0.85));
    var key = new THREE.DirectionalLight(0xfff4e0, 0.55); key.position.set(4, 9, 6); g.add(key);
    var pl = new THREE.PointLight(0xfff0d8, 1.1, 22); pl.position.set(0, 5, 0); g.add(pl);
    if (!low) {
      var pb = new THREE.PointLight(0x3a8dff, 0.9, 12); pb.position.set(0, 0.6, 3.6); g.add(pb);
      var pb2 = new THREE.PointLight(0x3a8dff, 0.9, 12); pb2.position.set(0, 0.6, -3.6); g.add(pb2);
    }

    /* ----- les chevaux ----- */
    var horses = HORSES.map(function (h, i) { var o = createHorse(h, i); g.add(o.group); return o; });
    var pp = {}, rank = [];
    function placeHorses(dt, t, finish, moving) {
      for (var i = 0; i < 8; i++) {
        var o = horses[i], p = finish ? progress(i, t, finish[i]) : 0, r = laneR(i), d = p * laneLen(r);
        lanePos(r, d, pp);
        var px = o.group.position.x, pz = o.group.position.z;
        o.group.position.set(pp.x, TY, pp.z); o.group.rotation.y = Math.atan2(pp.hx, pp.hz);
        var sp = moving && dt > 0 ? Math.hypot(pp.x - px, pp.z - pz) / dt : 0;
        o.phase += dt * (sp > 0.05 ? 4 + sp * 9 : 0.8);
        var amp = sp > 0.05 ? Math.min(0.9, 0.35 + sp * 0.4) : 0.05;
        o.legs.forEach(function (lg) { lg.rotation.x = Math.sin(o.phase + (lg.userData.k % 2 ? Math.PI : 0) + (lg.userData.k > 1 ? 0.8 : 0)) * amp; });
        o.body.position.y = Math.abs(Math.sin(o.phase)) * (sp > 0.05 ? 0.012 : 0.002);
        o.pr = p;
      }
    }
    placeHorses(0, 0, null, false);

    /* ----- grand écran : ce qui s'affiche ----- */
    function drawScreen(info) {
      var c = sctx, W = 1024, H = 576, i;
      c.fillStyle = '#050b18'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#0d2a52'; c.fillRect(0, 0, W, 78);
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#7fd1ff'; c.font = '900 40px ' + SERIF; c.fillText('GRAND PRIX DES FLAMBEURS', 28, 40);
      c.textAlign = 'right'; c.fillStyle = '#f3cf62'; c.font = '800 34px ' + MONO;
      var head = info.phase === 'waiting' ? 'EN ATTENTE DE PARIS' : info.phase === 'betting' ? 'PARIS · ' + Math.ceil(Math.max(0, info.left - CLOSE_MS / 1000)) + ' s' : info.phase === 'racing' ? 'COURSE EN COURS' : info.phase === 'results' ? 'RÉSULTATS' : '…';
      c.fillText(head, W - 28, 40);
      var list = info.rows;
      for (i = 0; i < 8; i++) {
        var row = list[i], y = 100 + i * 58, h = HORSES[row.i];
        c.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'; c.fillRect(20, y, W - 40, 52);
        c.textAlign = 'center'; c.font = '900 30px ' + MONO; c.fillStyle = i === 0 && (info.phase === 'racing' || info.phase === 'results') ? '#f3cf62' : '#9fb4d6'; c.fillText(info.phase === 'betting' || info.phase === 'waiting' ? '' : String(i + 1), 62, y + 28);
        c.beginPath(); c.arc(130, y + 26, 20, 0, TAU); c.fillStyle = hex(h.silk); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
        c.fillStyle = h.ink; c.font = '900 24px ' + MONO; c.fillText(String(h.n), 130, y + 28);
        c.textAlign = 'left'; c.fillStyle = '#eaf2ff'; c.font = '800 30px "Plus Jakarta Sans",system-ui,sans-serif'; c.fillText(h.name, 175, y + 27);
        if (row.txt) { c.textAlign = 'right'; c.fillStyle = '#7fd1ff'; c.font = '700 26px ' + MONO; c.fillText(row.txt, W - 50, y + 28); }
      }
      scrTex.needsUpdate = true;
    }

    /* ----- la course : état + cycle provisoire ----- */
    room.now = function () { return Date.now() + room.clockOffset; };
    // le serveur de course (api/horses.js) fournit { id, t0 (ms, début des paris), finish: [8 durées en secondes] | absent pendant les paris }
    room.setState = function (st) {
      var cur = room.state;
      if (cur && cur.id === st.id) { cur.t0 = st.t0; if (st.finish) cur.finish = st.finish; }   // même course : on ne casse pas l'animation en cours
      else room.state = { id: st.id, t0: st.t0, finish: st.finish || null };
      room.demo = false;
    };
    // sans serveur (page ouverte hors ligne), un cycle d'essai tourne tout seul : on peut regarder mais pas parier
    function newDemoState() {
      var f = []; for (var i = 0; i < 8; i++) f.push(19 + Math.random() * 6);
      return { id: 'demo-' + Date.now(), t0: room.now(), finish: f };
    }
    room.info = { phase: 'betting', left: 0, t: 0, rows: [] };
    var lastDraw = -9, lastKey = '', gateY = 0;
    function updateRace(dt) {
      if (room.demo && (!room.state || phaseOf(room.state, room.now()).phase === 'done')) room.state = newDemoState();
      var st = room.state; if (!st) return;
      var ph = phaseOf(st, room.now()), rows = [], i;
      if (ph.phase === 'betting' || ph.phase === 'waiting') { placeHorses(dt, 0, null, false); for (i = 0; i < 8; i++) rows.push({ i: i, txt: room.odds ? 'x' + room.odds.group[i] : '' }); }
      else {
        placeHorses(dt, ph.t, st.finish, ph.phase === 'racing');
        var idx = [0, 1, 2, 3, 4, 5, 6, 7];
        if (ph.phase === 'results') { var ord = orderOf(st.finish); idx = ord; rows = ord.map(function (k) { return { i: k, txt: st.finish[k].toFixed(2) + ' s' }; }); }
        else { idx.sort(function (a, b) { return horses[b].pr - horses[a].pr; }); rows = idx.map(function (k) { return { i: k, txt: horses[k].pr >= 1 ? 'ARRIVÉ' : Math.min(99, Math.round(horses[k].pr * 100)) + ' %' }; }); }
      }
      room.info = { phase: ph.phase, left: ph.left, t: ph.t, rows: rows, id: st.id, open: !!ph.open };
      if (ph.phase !== room.lastPhase) { var prev = room.lastPhase; room.lastPhase = ph.phase; room.onPhase(ph.phase, prev); }
      gateY += ((ph.phase === 'betting' || ph.phase === 'waiting' ? 0 : 0.9) - gateY) * Math.min(1, dt * 5);
      gate.position.y = TY + 0.2 - gateY * 0.3;
      var key = ph.phase + ':' + (ph.phase === 'betting' ? Math.ceil(ph.left) : ph.phase === 'waiting' ? 0 : Math.floor(ph.t * 5)) + ':' + rows.map(function (r) { return r.i; }).join('');
      if (key !== lastKey) { lastKey = key; drawScreen(room.info); }
    }

    /* ----- interface propre à cette salle ----- */
    injectBetCss();
    var horseBtns = HORSES.map(function (h) { return '<button data-h="' + h.n + '" title="' + h.name + '"><i style="background:' + hex(h.silk) + ';color:' + h.ink + '">' + h.n + '</i><b data-o="' + h.n + '"></b></button>'; }).join('');
    var placeBtns = [1, 2, 3, 4, 5, 6, 7, 8].map(function (p) { return '<button data-p="' + p + '">' + (p === 1 ? '1ᵉʳ' : p + 'ᵉ') + '</button>'; }).join('');
    room.hudTop = '<button class="s3d-cam s3d-seat-only" data-s3d="stand">🚶 Se lever</button><button class="s3d-cam s3d-seat-only" data-s3d="cam">🔭 Vue d\'en haut</button>' +
      '<div class="s3d-hint" data-s3d="hbanner" style="top:52px;font-size:13px;letter-spacing:.08em"></div>';
    room.hudBottom =
      '<div class="hbet s3d-seat-only"><div class="hb-msg" data-s3d="hmsg"></div>' +
      '<div class="hb-horses">' + horseBtns + '</div>' +
      '<div class="hb-row"><button data-k="group">Dans les 4 premiers <b data-s3d="mg"></b></button><button data-k="place">Place précise <b data-s3d="mp"></b></button></div>' +
      '<div class="hb-places" data-s3d="hplaces">' + placeBtns + '</div>' +
      '<div class="hb-row"><button class="hb-step" data-d="-1">−</button><div class="hb-amt">MISE<b data-s3d="hamt">100</b></div><button class="hb-step" data-d="1">+</button>' +
      '<button class="hb-go" data-s3d="hgo">PARIER</button></div>' +
      '<div class="hb-mine" data-s3d="hmine"></div></div>';
    var AMOUNTS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    room.sel = { horse: 5, kind: 'group', place: 1, amount: 100 };
    room.odds = null; room.history = []; room.myBets = []; room.said = {};
    room.bindHud = function (hud) {
      function q(k) { return hud.querySelector('[data-s3d="' + k + '"]'); }
      room.elCam = q('cam'); room.elStand = q('stand'); room.elBanner = q('hbanner');
      room.elMsg = q('hmsg'); room.elPlaces = q('hplaces'); room.elAmt = q('hamt'); room.elGo = q('hgo'); room.elMine = q('hmine'); room.elMg = q('mg'); room.elMp = q('mp');
      room.elHud = hud;
      room.elCam.addEventListener('click', function () { room.toggleCamera(); });
      room.elStand.addEventListener('click', function () { room.stand(); });
      hud.querySelectorAll('.hb-horses [data-h]').forEach(function (b) { b.addEventListener('click', function () { room.sel.horse = +b.getAttribute('data-h'); room.syncHud(); }); });
      hud.querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { room.sel.kind = b.getAttribute('data-k'); room.syncHud(); }); });
      hud.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { room.sel.place = +b.getAttribute('data-p'); room.syncHud(); }); });
      hud.querySelectorAll('.hb-step').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = +b.getAttribute('data-d'), k = AMOUNTS.indexOf(room.sel.amount); if (k < 0) k = 2;
          room.sel.amount = AMOUNTS[Math.max(0, Math.min(AMOUNTS.length - 1, k + d))]; room.syncHud();
        });
      });
      room.elGo.addEventListener('click', function () { room.placeBet(); });
      room.elMine.addEventListener('click', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-c')) room.cancelBet(+t.getAttribute('data-c')); });
    };
    function fmt(n) { return F.fmtN(n); }
    function curMult() { var s = room.sel; return !room.odds ? 0 : s.kind === 'group' ? room.odds.group[s.horse - 1] : room.odds.place[s.horse - 1][s.place - 1]; }
    room.say = function (msg) { if (!room.elMsg) return; room.elMsg.textContent = msg; clearTimeout(room._sayT); room._sayT = setTimeout(function () { if (room.elMsg) room.elMsg.textContent = ''; }, 6000); };
    room.syncHud = function () {
      if (!room.elBanner) return;
      var i = room.info, s = room.sel, open = room.canBet();
      var t = i.phase === 'waiting' ? '🎟️ AUCUNE COURSE — LE PREMIER PARI LANCE 10 s DE PARIS' : i.phase === 'betting' ? (i.open ? '🎟️ PARIS OUVERTS — ' + Math.ceil(Math.max(0, i.left - CLOSE_MS / 1000)) + ' s' : '🔒 PARIS FERMÉS — DÉPART IMMINENT') : i.phase === 'racing' ? '🏇 COURSE EN COURS' : i.phase === 'results' ? '🏁 COURSE TERMINÉE' : '';
      if (room.demo) t += ' (hors ligne : paris indisponibles)';
      room.elBanner.textContent = t; room.elBanner.style.display = '';
      if (!room.elHud) return;
      room.elHud.querySelectorAll('.hb-horses [data-h]').forEach(function (b) {
        var n = +b.getAttribute('data-h'); b.classList.toggle('on', n === s.horse);
        b.querySelector('[data-o]').textContent = room.odds ? 'x' + room.odds.group[n - 1] : '';
      });
      room.elHud.querySelectorAll('[data-k]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === s.kind); });
      room.elHud.querySelectorAll('[data-p]').forEach(function (b) { var p = +b.getAttribute('data-p'); b.classList.toggle('on', p === s.place); b.title = room.odds ? 'x' + room.odds.place[s.horse - 1][p - 1] : ''; });
      room.elPlaces.style.display = s.kind === 'place' ? '' : 'none';
      room.elMg.textContent = room.odds ? 'x' + room.odds.group[s.horse - 1] : '';
      room.elMp.textContent = room.odds ? 'x' + room.odds.place[s.horse - 1][s.place - 1] : '';
      room.elAmt.textContent = fmt(s.amount);
      var m = curMult();
      room.elGo.disabled = !open;
      room.elGo.textContent = !room.odds ? 'HORS LIGNE' : !open ? (i.phase === 'betting' ? 'PARIS FERMÉS' : 'COURSE EN COURS…') : 'PARIER · gain ' + fmt(Math.floor(s.amount * m));
      room.elStand.disabled = false;
      var rows = room.myBets.map(function (b) {
        var h = HORSES[b.horse - 1], what = b.kind === 'group' ? '4 premiers' : (b.place === 1 ? '1ᵉʳ' : b.place + 'ᵉ');
        var st = b.win === undefined ? (room.canBet() ? '<u data-c="' + b.at + '">annuler</u>' : 'en jeu') : b.win > 0 ? '<span class="w">+' + fmt(b.win) + '</span>' : '<span class="l">perdu</span>';
        return '<div><i style="background:' + hex(h.silk) + ';color:' + h.ink + '">' + h.n + '</i> ' + h.name + ' · ' + what + ' · ' + fmt(b.amount) + ' (x' + b.mult + ') ' + st + '</div>';
      }).join('');
      if (rows !== room._minePaint) { room._minePaint = rows; room.elMine.innerHTML = rows || '<div class="e">Aucun pari sur cette course (3 maximum).</div>'; }
    };
    room.canBet = function () { return !room.demo && !!room.odds && (room.info.phase === 'waiting' || (room.info.phase === 'betting' && room.info.open)); };

    /* ----- liaison avec le serveur de course : état, paris, gains ----- */
    function balanceTo(v) {
      if (typeof v !== 'number') return;
      try { state.balance = v; state.lastBalanceChange = Date.now(); if (typeof saveState === 'function') saveState(); } catch (e) { /* solde de la page indisponible */ }
    }
    room.refreshMine = function (announce) {
      if (!F.token()) return Promise.resolve();
      return world.post('/api/horses', { action: 'mine' }).then(function (r) {
        if (!r || !r.ok) return;
        balanceTo(r.balance);
        room.myBets = r.mine || []; room._minePaint = null;
        var id = room.state && room.state.id;
        if (announce && room.myBets.length && room.myBets.every(function (b) { return b.win !== undefined; }) && !room.said[id]) {
          room.said[id] = true;
          var total = room.myBets.reduce(function (a, b) { return a + (b.win || 0); }, 0);
          room.say(total > 0 ? '🎉 Gagné ! +' + fmt(total) + ' €' : 'Pas de chance cette fois…');
        }
        room.syncHud();
      });
    };
    room.onPhase = function (ph, prev) {
      if (room.demo) return;
      if (ph === 'results' && room.myBets.length) { room.refreshMine(true); setTimeout(function () { if (!world.dead) room.refreshMine(true); }, 1500); }
      if (ph === 'waiting' && prev) { room.myBets = []; room._minePaint = null; room.say(''); }
    };
    room.placeBet = function () {
      var s = room.sel;
      if (!F.token()) { room.say('Connecte-toi pour parier.'); return; }
      if (!room.canBet()) { room.say('Les paris sont fermés.'); return; }
      if (room.myBets.length >= 3) { room.say('3 paris maximum par course.'); return; }
      var av = ''; try { av = state.avatarEmoji || ''; } catch (e) { /* pas connecté */ }
      room.elGo.disabled = true;
      world.post('/api/horses', { action: 'bet', horse: s.horse, kind: s.kind, place: s.kind === 'place' ? s.place : 0, amount: s.amount, avatar: av }).then(function (r) {
        if (r && r.ok) { balanceTo(r.balance); if (r.state && r.state.serverNow) { room.clockOffset = r.state.serverNow - Date.now(); room.setState(r.state); } room.say('✅ Pari enregistré : ' + HORSES[s.horse - 1].name + ' (x' + r.mult + ')'); return room.refreshMine(false); }
        room.say((r && r.error) || 'Pas de réponse du serveur.');
      }).then(function () { room.syncHud(); });
    };
    room.cancelBet = function (at) {
      world.post('/api/horses', { action: 'cancel', at: at }).then(function (r) {
        if (r && r.ok) { balanceTo(r.balance); room.say('Pari annulé, mise remboursée.'); return room.refreshMine(false); }
        room.say((r && r.error) || 'Impossible d\'annuler.');
      }).then(function () { room.syncHud(); });
    };
    function pollState() {
      if (!room.netOn || world.dead) return;
      var t1 = Date.now();
      fetch('/api/horses', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.id || !d.serverNow) throw new Error('réponse inattendue');
        var t2 = Date.now(), prevId = room.state && room.state.id;
        room.clockOffset = d.serverNow - (t1 + t2) / 2;
        room.odds = d.odds; room.history = d.history || [];
        room.setState(d);
        if (prevId !== d.id) { room.myBets = []; room._minePaint = null; room.refreshMine(false); }
      }).catch(function () { /* pas de serveur : le cycle d'essai continue */ }).then(function () {
        if (room.netOn && !world.dead) room.pollT = setTimeout(pollState, room.info.phase === 'racing' ? 2500 : 1200);
      });
    }
    room.netStart = function () { room.netOn = true; clearTimeout(room.pollT); pollState(); };
    room.netStop = function () { room.netOn = false; clearTimeout(room.pollT); };
    room.hint = function (w) {
      return 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder · approche-toi d\'une chaise pour t\'asseoir' + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };

    /* ----- s'asseoir / se lever / deux vues ----- */
    room.sit = function (seat) {
      if (world.mode === 'seat' || !seat || world.trans) return;
      if (seat.occBy) { world.flash('Place ' + seat.n + ' occupée par ' + seat.occBy); return; }
      room.seatEntry = seat; world.sitDown(room);
      var v = room.view; v.mode = 'glass'; v.yaw = v.yawG = 0; v.pitch = v.pitchG = 0; v.lastDrag = -99; v.init = false;
      if (room.elCam) room.elCam.textContent = '🔭 Vue d\'en haut';
    };
    room.stand = function () {
      if (world.mode !== 'seat' || !room.seatEntry) return;
      var e = room.seatEntry;
      world.standUp(e.side * 5.85, e.z, e.yaw);
      room.seatEntry = null;
    };
    room.forceStand = function () { room.stand(); };
    room.toggleCamera = function () {
      if (world.mode !== 'seat') return;
      var v = room.view; v.mode = v.mode === 'glass' ? 'top' : 'glass'; v.yawG = 0; v.pitchG = 0; v.lastDrag = -99;
      room.elCam.textContent = v.mode === 'glass' ? '🔭 Vue d\'en haut' : '🪑 Vue assise';
    };
    room.seatPose = function (dt, ctx) {
      var e = room.seatEntry; if (!e) return null;
      var v = room.view, k = 1 - Math.exp(-dt * 4), gx, gy, gz, tx, ty, tz, fov;
      if (ctx.mouseLook) {
        v.yawG = ctx.dz(ctx.ms.nx, 0.15) * (v.mode === 'glass' ? 0.9 : 2.4);
        v.pitchG = ctx.dz(ctx.ms.ny, 0.15) * (v.mode === 'glass' ? 0.35 : 0.3);
        v.lastDrag = ctx.clock;
      }
      if (v.mode === 'glass' && ctx.clock - v.lastDrag > 3) { v.yawG = 0; v.pitchG = 0; }
      v.yaw += (v.yawG - v.yaw) * k; v.pitch += (v.pitchG - v.pitch) * k;
      if (v.mode === 'glass') {
        gx = e.x + e.side * 0.3; gy = 1.5; gz = e.z;
        // cap vers le centre de la table (0 = regarder vers -z), puis on y ajoute le mouvement de tête du joueur
        var a = Math.atan2(-gx, gz) + v.yaw, p = Math.atan2(TY + 0.05 - gy, Math.hypot(gx, gz)) + v.pitch;
        tx = gx + Math.sin(a) * Math.cos(p) * 5; tz = gz - Math.cos(a) * Math.cos(p) * 5; ty = gy + Math.sin(p) * 5; fov = 55;
      } else {
        var th = v.yaw;
        gx = Math.sin(th) * 4.2; gz = Math.cos(th) * 4.2 + 3.2; gy = 10.4 + v.pitch * 4;
        tx = 0; ty = TY; tz = 0.4; fov = 54;
      }
      if (!v.init) { v.cx = gx; v.cy = gy; v.cz = gz; v.fov = fov; v.init = true; }
      v.cx += (gx - v.cx) * k; v.cy += (gy - v.cy) * k; v.cz += (gz - v.cz) * k; v.fov += (fov - v.fov) * k;
      return { cx: v.cx, cy: v.cy, cz: v.cz, tx: tx, ty: ty, tz: tz, fov: v.fov };
    };
    room.seatDragStart = function () { return { yaw: room.view.yawG, pitch: room.view.pitchG }; };
    room.seatDrag = function (drag, dx, dy, w) {
      var v = room.view, lim = v.mode === 'glass' ? 0.9 : Math.PI;
      v.yawG = Math.max(-lim, Math.min(lim, drag.seat.yaw - dx * 0.007));
      if (drag.mouse) v.pitchG = Math.max(-0.3, Math.min(0.4, drag.seat.pitch + dy * (v.mode === 'glass' ? -0.003 : 0.003)));
      v.lastDrag = w.clock;
    };

    /* ----- les autres joueurs (vus grâce au temps réel du monde) ----- */
    room.seatPos = function () { var e = room.seatEntry; return e ? { seat: e.n - 1, x: e.x, z: e.z, yaw: e.yaw } : null; };
    room.remotePose = function (r) { var e = room.seats[r.seat]; return e ? { x: e.x - e.side * 0.1, z: e.z, yaw: e.yaw } : null; };

    room.update = function (dt) {
      updateRace(dt);
      spots.visible = !(world.mode === 'seat' && room.view.mode === 'top');   // la vue d'en haut est au-dessus des spots du plafond
      // places occupées : celles où un autre joueur est assis
      var occ = {}, k;
      Object.keys(world.remote).forEach(function (key) { var r = world.remote[key]; if (r.seat >= 0) occ[r.seat] = r.name; });
      for (k = 0; k < room.seats.length; k++) room.seats[k].occBy = occ[k] || null;
    };
    room.dispose = function () {
      horses.forEach(function (o) { o.mats.forEach(function (m) { m.dispose(); }); o.tex.dispose(); o.tag.material.dispose(); });
    };
    return room;
  }
  F.registerRoom('horses', createHorsesRoom);
})();
