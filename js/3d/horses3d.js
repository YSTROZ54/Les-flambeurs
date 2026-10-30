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
  var S = 2.8;                        // la table est un ovale : demi-axe ouest-est R, demi-axe nord-sud R + S / 2 (pas de côtés droits)
  var HS = S / 2;
  var R_OUT = 2.5, R_IN = 1.05;       // bord extérieur / île centrale
  var LANE0 = 1.32, LANE_STEP = 0.14; // rayon du couloir 1, écart entre couloirs
  var Z0 = 0;                         // ligne de départ = ligne d'arrivée (côté est de la table)
  var TY = 0.93;                      // hauteur du tapis vert
  var HX = 8.5, HZ = 10;              // demi-largeur / demi-profondeur de la salle
  var BET_MS = 12000, CLOSE_MS = 2000, RACE_MS = 30000, RESULT_MS = 10000;   // mêmes durées que api/horses.js

  function laneR(i) { return LANE0 + i * LANE_STEP; }
  // un couloir est une ellipse de demi-axes r (est-ouest) et r + HS (nord-sud) : on en garde une table de longueurs cumulées pour se repérer à la distance parcourue
  var laneCache = {};
  function laneTab(r) {
    var key = Math.round(r * 1000), t = laneCache[key];
    if (t) return t;
    var N = 720, rb = r + HS, cum = new Float32Array(N + 1), px = r, pz = 0, L = 0, i, a, x, z;
    for (i = 1; i <= N; i++) { a = i / N * TAU; x = r * Math.cos(a); z = -rb * Math.sin(a); L += Math.hypot(x - px, z - pz); cum[i] = L; px = x; pz = z; }
    return (laneCache[key] = { L: L, cum: cum, N: N, rb: rb });
  }
  function laneLen(r) { return laneTab(r).L; }

  // position et direction sur un couloir de rayon r, à la distance d depuis la ligne de départ (sens : nord d'abord, côté est)
  function lanePos(r, d, out) {
    var T = laneTab(r), L = T.L, lo = 0, hi = T.N, mid, f, a, hx, hz, len;
    out = out || {};
    d = ((d % L) + L) % L;
    while (hi - lo > 1) { mid = (lo + hi) >> 1; if (T.cum[mid] <= d) lo = mid; else hi = mid; }
    f = (d - T.cum[lo]) / Math.max(1e-9, T.cum[lo + 1] - T.cum[lo]); a = (lo + f) / T.N * TAU;
    out.x = r * Math.cos(a); out.z = -T.rb * Math.sin(a);
    hx = -r * Math.sin(a); hz = -T.rb * Math.cos(a); len = Math.hypot(hx, hz) || 1; out.hx = hx / len; out.hz = hz / len;
    return out;
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

  // contour de la table (même nombre de points pour tous les rayons) : une ellipse de demi-axes R et R + HS
  function stadiumPts(R) {
    var pts = [], N = 160, k, a;
    for (k = 0; k < N; k++) { a = k / N * TAU; pts.push([R * Math.cos(a), -(R + HS) * Math.sin(a)]); }
    return pts;
  }
  // plaque en forme de stade (pleine, ou percée si ri est donné) : dessus, dessous et côtés faits à la main (pas de découpe automatique, qui oubliait des triangles)
  function slab(ro, ri, y0, y1, mat) {
    var po = stadiumPts(ro), pi = ri ? stadiumPts(ri) : null, n = po.length, pos = [], i, a, b;
    function tri(p, q, r) { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); }
    function quad(p, q, r, t) { tri(p, q, r); tri(p, r, t); }
    for (i = 0; i < n; i++) {
      a = po[i]; b = po[(i + 1) % n];
      quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);                                   // paroi extérieure
      if (pi) {
        var c = pi[i], d = pi[(i + 1) % n];
        quad([c[0], y0, c[1]], [d[0], y0, d[1]], [d[0], y1, d[1]], [c[0], y1, c[1]]);                                 // paroi intérieure
        quad([a[0], y1, a[1]], [b[0], y1, b[1]], [d[0], y1, d[1]], [c[0], y1, c[1]]);                                 // dessus
        quad([a[0], y0, a[1]], [b[0], y0, b[1]], [d[0], y0, d[1]], [c[0], y0, c[1]]);                                 // dessous
      } else {
        tri([0, y1, 0], [a[0], y1, a[1]], [b[0], y1, b[1]]);
        tri([0, y0, 0], [a[0], y0, a[1]], [b[0], y0, b[1]]);
      }
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    var m = mat.clone(); m.side = THREE.DoubleSide;
    return new THREE.Mesh(g, m);
  }
  // bande verticale qui suit le contour de la table (vitre, néons…) : rayon rb en bas, rt en haut
  function ribbon(rb, rt, y0, y1, mat) {
    var n = 360, pts = [], p = {}, i, L = laneLen(rb), pos = [], idx = [];
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
      x.beginPath(); x.ellipse(cx, cy, R * K, (R + HS) * K, 0, 0, TAU); x.closePath();
    }
    // le fond reste transparent : les coins du rectangle de la texture dépassaient du rebord de la table (angles gris)
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

    /* ----- salle : parquet, tapis ovale, murs lambrissés, plafond à caissons ----- */
    var ledA = new THREE.MeshBasicMaterial({ color: 0x56e6ff }), ledB = new THREE.MeshBasicMaterial({ color: 0xc84bff }), ledDim = new THREE.MeshBasicMaterial({ color: 0x0b1d3d });   // bandeaux lumineux des murs, du plafond, du sol
    var goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.32, metalness: 0.65, emissive: 0x2a1d00 });
    var woodDark = new THREE.MeshStandardMaterial({ color: 0x2b170d, roughness: 0.55, metalness: 0.1 });
    function tile(c, rx, ry) { var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; }

    // sol : grandes dalles de marbre noir bleuté très brillant, joints et filets cyan / violet (comme la table)
    var pc = mkCanvas(512, 512), px = pc.getContext('2d');
    var fg = px.createLinearGradient(0, 0, 512, 512); fg.addColorStop(0, '#101a2e'); fg.addColorStop(0.5, '#0b1220'); fg.addColorStop(1, '#0e1730'); px.fillStyle = fg; px.fillRect(0, 0, 512, 512);
    for (var vi = 0; vi < 14; vi++) { px.strokeStyle = 'rgba(120,150,220,0.05)'; px.lineWidth = 1 + (vi % 3); px.beginPath(); px.moveTo(Math.random() * 512, 0); px.bezierCurveTo(Math.random() * 512, 170, Math.random() * 512, 340, Math.random() * 512, 512); px.stroke(); }   // veines du marbre
    px.strokeStyle = 'rgba(86,230,255,0.5)'; px.lineWidth = 3; px.strokeRect(1.5, 1.5, 509, 509);
    px.strokeStyle = 'rgba(200,75,255,0.35)'; px.lineWidth = 2; px.strokeRect(14, 14, 484, 484);
    px.fillStyle = 'rgba(86,230,255,0.7)'; [[14, 14], [498, 14], [14, 498], [498, 498]].forEach(function (q) { px.beginPath(); px.arc(q[0], q[1], 4, 0, TAU); px.fill(); });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: tile(pc, HX * 2 / 4, HZ * 2 / 4), roughness: 0.16, metalness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    // tapis ovale autour de la table : bordeaux, liseré et filet dorés
    g.add(slab(R_OUT + 3.0, 0, 0, 0.012, goldM));
    g.add(slab(R_OUT + 2.86, 0, 0, 0.018, new THREE.MeshStandardMaterial({ color: 0x4a0f1e, roughness: 0.95 })));
    g.add(slab(R_OUT + 2.4, R_OUT + 2.34, 0, 0.024, goldM));
    g.add(slab(R_OUT + 1.2, R_OUT + 1.16, 0, 0.024, goldM));

    // murs : lambris en noyer sur 1,2 m, tenture vert sapin à rayures et losanges dorés au-dessus
    var wallC = mkCanvas(512, 512), wx = wallC.getContext('2d'), wi;
    wx.fillStyle = '#0e3a33'; wx.fillRect(0, 0, 512, 512);
    for (wi = 0; wi < 8; wi++) { wx.fillStyle = wi % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)'; wx.fillRect(wi * 64, 0, 64, 512); }
    wx.strokeStyle = 'rgba(243,207,98,0.13)'; wx.lineWidth = 2;
    for (wi = -8; wi < 16; wi++) { wx.beginPath(); wx.moveTo(wi * 64, 0); wx.lineTo(wi * 64 + 512, 512); wx.moveTo(wi * 64 + 512, 0); wx.lineTo(wi * 64, 512); wx.stroke(); }
    var wnC = mkCanvas(256, 256), wn = wnC.getContext('2d');
    wn.fillStyle = '#3a2314'; wn.fillRect(0, 0, 256, 256);
    var wng = wn.createLinearGradient(0, 0, 0, 256); wng.addColorStop(0, '#5a3820'); wng.addColorStop(1, '#3a2314'); wn.fillStyle = wng; wn.fillRect(22, 22, 212, 212);
    wn.strokeStyle = 'rgba(0,0,0,0.6)'; wn.lineWidth = 4; wn.strokeRect(22, 22, 212, 212); wn.strokeStyle = 'rgba(255,220,170,0.18)'; wn.lineWidth = 2; wn.strokeRect(30, 30, 196, 196);
    var wallUp = new THREE.MeshStandardMaterial({ map: tile(wallC, 1, 1), roughness: 0.9, metalness: 0.02 }), wallDn = new THREE.MeshStandardMaterial({ map: tile(wnC, 1, 1), roughness: 0.5, metalness: 0.08 });
    function wall(w, y0, y1, px0, pz0, ry, mat, rep) {
      var m = mat.clone(); m.map = mat.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(w / rep, 1);
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), m); mesh.position.set(px0, (y0 + y1) / 2, pz0); mesh.rotation.y = ry; g.add(mesh);
    }
    [[HX * 2, 0, -HZ, 0], [HX * 2, 0, HZ, Math.PI], [HZ * 2, -HX, 0, Math.PI / 2], [HZ * 2, HX, 0, -Math.PI / 2]].forEach(function (d) {
      var ax = d[3] === 0 || d[3] === Math.PI;
      wall(d[0], 1.2, 6, ax ? 0 : d[1], ax ? d[2] : 0, d[3], wallUp, 2.5); wall(d[0], 0, 1.2, ax ? 0 : d[1], ax ? d[2] : 0, d[3], wallDn, 1.4);
    });
    // moulures : plinthe, cimaise dorée, filet à 4,6 m, corniche
    function trim(y, h, d, mat) {
      [[HX * 2, h, d, 0, y, -HZ + d / 2], [HX * 2, h, d, 0, y, HZ - d / 2], [d, h, HZ * 2, -HX + d / 2, y, 0], [d, h, HZ * 2, HX - d / 2, y, 0]].forEach(function (q) { box(q[0], q[1], q[2], q[3], q[4], q[5], mat); });
    }
    trim(0.12, 0.24, 0.07, woodDark); trim(1.2, 0.09, 0.1, goldM); trim(4.6, 0.05, 0.05, goldM); trim(5.86, 0.22, 0.2, woodDark); trim(5.72, 0.05, 0.12, goldM);

    // plafond : caissons d'acajou liserés d'or et grand ovale de lumière chaude au-dessus de la table
    var ceilTex = (function () {
      var W = 1024, H = Math.round(W * HZ / HX), c = mkCanvas(W, H), x = c.getContext('2d'), ppm = W / (HX * 2), cx = W / 2, cy = H / 2, i, j, cell = 2.2 * ppm;
      var bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1b0f0a'); bg.addColorStop(0.5, '#26150d'); bg.addColorStop(1, '#1b0f0a'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
      for (i = -5; i <= 5; i++) for (j = -6; j <= 6; j++) {
        var px0 = cx + (i - 0.5) * cell, py0 = cy + (j - 0.5) * cell, ex = (px0 + cell / 2 - cx) / (4.8 * ppm), ey = (py0 + cell / 2 - cy) / (6.4 * ppm);
        if (ex * ex + ey * ey < 1) continue;
        x.fillStyle = 'rgba(255,200,140,0.05)'; x.fillRect(px0 + 6, py0 + 6, cell - 12, cell - 12);
        x.strokeStyle = 'rgba(243,207,98,0.55)'; x.lineWidth = 2.5; x.strokeRect(px0 + 6, py0 + 6, cell - 12, cell - 12);
        x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 6; x.strokeRect(px0 + 2, py0 + 2, cell - 4, cell - 4);
      }
      var og = x.createRadialGradient(cx, cy, 0, cx, cy, 6.2 * ppm); og.addColorStop(0, 'rgba(255,236,200,0.95)'); og.addColorStop(0.7, 'rgba(255,214,150,0.7)'); og.addColorStop(1, 'rgba(255,190,110,0.35)');
      x.save(); x.beginPath(); x.ellipse(cx, cy, 4.6 * ppm, 6.2 * ppm, 0, 0, TAU); x.clip(); x.fillStyle = og; x.fillRect(0, 0, W, H); x.restore();
      x.strokeStyle = '#e9c65a'; x.lineWidth = 0.09 * ppm; x.beginPath(); x.ellipse(cx, cy, 4.62 * ppm, 6.22 * ppm, 0, 0, TAU); x.stroke();
      x.strokeStyle = 'rgba(243,207,98,0.5)'; x.lineWidth = 0.04 * ppm; x.beginPath(); x.ellipse(cx, cy, 5.0 * ppm, 6.6 * ppm, 0, 0, TAU); x.stroke();
      return mkTex(c);
    })();
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ map: ceilTex }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; g.add(ceil);
    var ceilFx = new THREE.Group(); g.add(ceilFx);                                  // masqué quand on regarde d'en haut (la caméra est au-dessus du plafond)
    var haloM = new THREE.MeshBasicMaterial({ color: 0xffe3b0, side: THREE.DoubleSide });
    [[R_OUT + 1.7, 5.46, 5.54], [R_OUT + 2.1, 5.7, 5.76]].forEach(function (hr) { ceilFx.add(ribbon(hr[0], hr[0], hr[1], hr[2], haloM)); });   // deux anneaux lumineux suspendus au-dessus de la table

    /* ----- de quoi remplir la salle : fanions des chevaux, vitrines à trophées, palmiers, salons, bar, statue, affiches ----- */
    // fanions : un par cheval, à ses couleurs, avec son numéro (4 sur chaque mur latéral)
    HORSES.forEach(function (h, k) {
      var bc = mkCanvas(128, 256), bx = bc.getContext('2d');
      bx.fillStyle = hex(h.silk); bx.beginPath(); bx.moveTo(0, 0); bx.lineTo(128, 0); bx.lineTo(128, 256); bx.lineTo(64, 214); bx.lineTo(0, 256); bx.closePath(); bx.fill();
      bx.fillStyle = 'rgba(255,255,255,0.2)'; bx.beginPath(); bx.moveTo(0, 60); bx.lineTo(128, 20); bx.lineTo(128, 70); bx.lineTo(0, 110); bx.closePath(); bx.fill();
      bx.strokeStyle = '#e9c65a'; bx.lineWidth = 6; bx.stroke();
      bx.beginPath(); bx.arc(64, 112, 38, 0, TAU); bx.fillStyle = '#fff'; bx.fill(); bx.fillStyle = h.ink; bx.font = '900 54px ' + MONO; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText(String(h.n), 64, 116);
      var side = k < 4 ? 1 : -1, zz = [-6.6, -3.5, 3.5, 6.6][k % 4];
      var bn = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.44), new THREE.MeshBasicMaterial({ map: mkTex(bc), transparent: true, side: THREE.DoubleSide }));
      bn.position.set(side * (HX - 0.07), 3.2, zz); bn.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(bn);
      var rod = box(0.04, 0.04, 0.9, side * (HX - 0.08), 3.96, zz, goldM);
    });
    // vitrines à trophées au milieu des murs latéraux
    function trophy(parent, x, y, z, s) {
      box(0.1 * s, 0.03 * s, 0.1 * s, x, y + 0.015 * s, z, woodDark, parent);
      var st = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.1 * s, 8), goldM); st.position.set(x, y + 0.08 * s, z); parent.add(st);
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.03 * s, 0.11 * s, 14), goldM); cup.position.set(x, y + 0.185 * s, z); parent.add(cup);
    }
    [1, -1].forEach(function (side) {
      var vg = new THREE.Group(); vg.position.set(side * (HX - 0.01), 0, 0); vg.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(vg);   // z local = vers l'intérieur de la salle
      box(1.9, 2.5, 0.04, 0, 1.45, -0.18, new THREE.MeshStandardMaterial({ color: 0x4a0f1e, roughness: 0.9 }), vg);
      box(0.06, 2.5, 0.5, -0.97, 1.45, 0, woodDark, vg); box(0.06, 2.5, 0.5, 0.97, 1.45, 0, woodDark, vg);
      box(2.0, 0.08, 0.5, 0, 2.74, 0, woodDark, vg); box(2.0, 0.2, 0.5, 0, 0.1, 0, woodDark, vg);
      [0.62, 1.2, 1.78].forEach(function (sy, si) { box(1.88, 0.03, 0.4, 0, sy, 0, new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.1, transparent: true, opacity: 0.35 }), vg); for (var t = -2; t <= 2; t++) trophy(vg, t * 0.34, sy + 0.015, 0, 0.9 + (t + si) % 2 * 0.25); });
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 2.4), new THREE.MeshBasicMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })); gl.position.set(0, 1.45, 0.24); vg.add(gl);
      box(1.9, 0.04, 0.5, 0, 2.62, 0, ledDim, vg);
      var lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe9bf })); lamp.position.set(0, 2.6, 0.24); lamp.rotation.x = Math.PI / 2; vg.add(lamp);
    });
    // palmiers en pot
    function palm(x, z, s) {
      var pg = new THREE.Group(); pg.position.set(x, 0, z); pg.scale.set(s, s, s); g.add(pg);
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.4, metalness: 0.4 })); pot.position.y = 0.3; pg.add(pot);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 20), goldM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; pg.add(rim);
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.5, 8), new THREE.MeshLambertMaterial({ color: 0x5a3a1c })); trunk.position.y = 1.3; pg.add(trunk);
      var leafM = new THREE.MeshLambertMaterial({ color: 0x2c8a4a, side: THREE.DoubleSide });
      for (var f = 0; f < 8; f++) {
        var fa = f / 8 * TAU, fr = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.25, 4), leafM);
        fr.scale.set(1, 1, 0.25); fr.position.set(Math.cos(fa) * 0.5, 2.0, Math.sin(fa) * 0.5); fr.rotation.set(Math.sin(fa) * 1.15, 0, -Math.cos(fa) * 1.15); pg.add(fr);
      }
      room.colliders.push({ x: x, z: z, r: 0.4 });
    }
    palm(-(HX - 0.9), HZ - 0.9, 1.1); palm(HX - 0.9, HZ - 0.9, 1.1); palm(-(HX - 0.9), 5.2, 1); palm(HX - 0.9, 5.2, 1); palm(-(HX - 0.9), -5.2, 1); palm(HX - 0.9, -5.2, 1);
    // salons : un canapé chesterfield bordeaux de chaque côté de l'écran, avec sa petite table et sa lampe
    var sofaM = new THREE.MeshStandardMaterial({ color: 0x6a1226, roughness: 0.7, metalness: 0.05 });
    function sofa(x, z) {
      var sg = new THREE.Group(); sg.position.set(x, 0, z); g.add(sg);          // face à +z
      box(2.0, 0.42, 0.9, 0, 0.36, 0, sofaM, sg); box(2.0, 0.78, 0.2, 0, 0.78, -0.36, sofaM, sg);
      box(0.2, 0.62, 0.9, -1.0, 0.5, 0, sofaM, sg); box(0.2, 0.62, 0.9, 1.0, 0.5, 0, sofaM, sg);
      box(1.84, 0.1, 0.8, 0, 0.62, 0.02, new THREE.MeshStandardMaterial({ color: 0x7e1a30, roughness: 0.65 }), sg);
      [-0.9, 0.9].forEach(function (fx) { box(0.08, 0.14, 0.08, fx, 0.07, 0.38, goldM, sg); box(0.08, 0.14, 0.08, fx, 0.07, -0.38, goldM, sg); });
      room.colliders.push({ x: x - 0.55, z: z, r: 0.8 }, { x: x + 0.55, z: z, r: 0.8 });
    }
    function sideTable(x, z) {
      var tt2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), woodDark); tt2.position.set(x, 0.62, z); g.add(tt2);
      var tl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 8), goldM); tl.position.set(x, 0.3, z); g.add(tl);
      var lampB = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe3b0 })); lampB.position.set(x, 0.82, z); g.add(lampB);
      room.colliders.push({ x: x, z: z, r: 0.38 });
    }
    sofa(-6.0, -HZ + 1.0); sofa(6.0, -HZ + 1.0); sideTable(-4.3, -HZ + 0.9); sideTable(4.3, -HZ + 0.9);
    // bar au sud-ouest : comptoir, tabourets, étagères de bouteilles éclairées
    var barG = new THREE.Group(); barG.position.set(-5.2, 0, HZ - 1.5); g.add(barG);
    box(3.4, 1.0, 0.7, 0, 0.5, 0, woodDark, barG); box(3.5, 0.06, 0.8, 0, 1.03, 0, goldM, barG); box(3.3, 0.05, 0.05, 0, 0.85, 0.36, ledB, barG);
    [-1.2, -0.4, 0.4, 1.2].forEach(function (sx) {
      var sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), goldM); sp.position.set(sx, 0.3, -0.9); barG.add(sp);
      var ss = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x6a1226, roughness: 0.6 })); ss.position.set(sx, 0.62, -0.9); barG.add(ss);
    });
    var mirror = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshBasicMaterial({ color: 0x2a1c12 })); mirror.position.set(0, 1.9, 1.17); mirror.rotation.y = Math.PI; barG.add(mirror);
    [1.35, 1.9].forEach(function (sy) {
      box(3.4, 0.04, 0.22, 0, sy, 1.06, goldM, barG);
      for (var bt = 0; bt < 11; bt++) {
        var bcol = [0x2c8a4a, 0xc8412b, 0xe9c65a, 0x3a8dff, 0xb04bd0][(bt + (sy > 1.5 ? 2 : 0)) % 5];
        var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8), new THREE.MeshBasicMaterial({ color: bcol })); bot.position.set(-1.5 + bt * 0.3, sy + 0.16, 1.06); barG.add(bot);
      }
    });
    room.colliders.push({ x: -6.4, z: HZ - 1.5, r: 0.9 }, { x: -5.2, z: HZ - 1.5, r: 0.9 }, { x: -4.0, z: HZ - 1.5, r: 0.9 });
    // statue de cheval en or sur un socle de marbre, au sud-est
    var pedM = new THREE.MeshStandardMaterial({ color: 0xe9e1d2, roughness: 0.3, metalness: 0.1 });
    box(1.1, 0.9, 1.1, 5.3, 0.45, HZ - 1.5, pedM); box(1.2, 0.08, 1.2, 5.3, 0.94, HZ - 1.5, goldM); box(1.2, 0.08, 1.2, 5.3, 0.04, HZ - 1.5, goldM);
    var stat = createHorse({ n: 1, silk: 0xffd24a, coat: 0xd9a227, ink: '#222222' }, 0);
    stat.tag.visible = false; stat.group.scale.set(4.2, 4.2, 4.2); stat.group.position.set(5.3, 0.98, HZ - 1.5); stat.group.rotation.y = -2.5; g.add(stat.group);
    room.colliders.push({ x: 5.3, z: HZ - 1.5, r: 0.95 });
    // affiches encadrées
    function poster(x, y, z, ry, l1, l2, hue) {
      var cp = mkCanvas(420, 280), cx2 = cp.getContext('2d'), gg = cx2.createLinearGradient(0, 0, 0, 280);
      gg.addColorStop(0, hue[0]); gg.addColorStop(1, hue[1]); cx2.fillStyle = gg; cx2.fillRect(0, 0, 420, 280);
      cx2.strokeStyle = '#e9c65a'; cx2.lineWidth = 6; cx2.strokeRect(14, 14, 392, 252);
      cx2.strokeStyle = '#e9c65a'; cx2.lineWidth = 12; cx2.lineCap = 'round'; cx2.beginPath(); cx2.arc(210, 118, 46, -Math.PI * 0.82, Math.PI * 0.82 - Math.PI); cx2.stroke();
      cx2.beginPath(); cx2.arc(210, 118, 46, Math.PI * 0.18 + Math.PI, Math.PI * 1.82 + Math.PI); cx2.stroke();
      cx2.fillStyle = '#fff3d6'; cx2.textAlign = 'center'; cx2.font = '900 34px ' + SERIF; cx2.fillText(l1, 210, 205, 360);
      cx2.fillStyle = '#e9c65a'; cx2.font = '700 18px ' + MONO; cx2.fillText(l2, 210, 238, 360);
      box(1.55, 1.05, 0.06, x, y, z, goldM);
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.93), new THREE.MeshBasicMaterial({ map: mkTex(cp) })); pl.position.set(x + Math.sin(ry) * 0.04, y, z + Math.cos(ry) * 0.04); pl.rotation.y = ry; g.add(pl);
    }
    poster(-6.6, 3.5, -HZ + 0.05, 0, 'GRAND PRIX', 'LES FLAMBEURS', ['#5a1020', '#240a12']); poster(6.6, 3.5, -HZ + 0.05, 0, 'TIERCÉ GAGNANT', 'HIPPODROME VIP', ['#0e4a3c', '#06201a']);
    poster(-3.4, 3.2, HZ - 0.05, Math.PI, 'DERBY', 'PARIEZ SUR LE FAVORI', ['#1b3a7a', '#0b1630']); poster(3.4, 3.2, HZ - 0.05, Math.PI, 'PHOTO FINISH', 'TOUS LES SOIRS', ['#6a4a10', '#2a1a05']);
    /* ----- la table de jeu ----- */
    var tt = trackTexture();
    var felt = new THREE.Mesh(new THREE.PlaneGeometry(tt.w, tt.h), new THREE.MeshStandardMaterial({ map: tt.tex, roughness: 0.95, metalness: 0, transparent: true, alphaTest: 0.4 }));
    felt.rotation.x = -Math.PI / 2; felt.position.y = TY; g.add(felt);
    g.add(slab(R_OUT + 0.88, 0, 0, TY - 0.02, new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.85, metalness: 0.05 })));                                   // le coffre de la table
    g.add(slab(R_OUT + 0.9, R_OUT + 0.06, TY - 0.01, TY + 0.08, matDark));                                                 // le rebord qui porte les bornes
    var base1 = ribbon(R_OUT + 0.895, R_OUT + 0.895, 0.1, 0.17, ledB); base1.material.side = THREE.DoubleSide; g.add(base1);       // lignes de couleur au bas de la table
    var base2 = ribbon(R_OUT + 0.895, R_OUT + 0.895, 0.03, 0.06, ledA); base2.material.side = THREE.DoubleSide; g.add(base2);
    var edge = ribbon(R_OUT + 0.915, R_OUT + 0.915, TY + 0.02, TY + 0.075, neonC); edge.material.side = THREE.DoubleSide; g.add(edge);
    var glassMat = new THREE.MeshStandardMaterial({ color: 0xa8d8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
    g.add(ribbon(R_OUT + 0.08, R_OUT + 0.08, TY + 0.08, TY + 0.36, glassMat));                              // la vitre
    var glassTop = ribbon(R_OUT + 0.08, R_OUT + 0.08, TY + 0.36, TY + 0.38, neonC); glassTop.material.side = THREE.DoubleSide; g.add(glassTop);
    // l'île du milieu : un plateau vert arrondi avec un petit dôme
    var isl = slab(R_IN - 0.02, 0, TY, TY + 0.1, new THREE.MeshStandardMaterial({ color: 0x1f7a62, roughness: 0.6 })); g.add(isl);
    var pad = slab(R_IN - 0.3, 0, TY + 0.13, TY + 0.2, new THREE.MeshStandardMaterial({ color: 0x2aa37e, roughness: 0.5 })); g.add(pad);
    [[0, -1.7], [0, 1.7]].forEach(function (p) {
      var d = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 18), new THREE.MeshStandardMaterial({ color: 0x14533f, roughness: 0.5, metalness: 0.3 }));
      d.position.set(p[0], TY + 0.2, p[1] * 0.5); g.add(d);
      var l = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), neonC); l.position.set(p[0], TY + 0.31, p[1] * 0.5); g.add(l);
    });
    // départ : une barrière légère qui se lève quand la course commence
    var gate = box(laneR(7) - laneR(0) + 0.35, 0.025, 0.025, (laneR(0) + laneR(7)) / 2, TY + 0.2, Z0 + 0.3, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    // les LED : de vraies petites diodes qui brillent (points lumineux avec halo), deux rangées sur le rebord qui courent en sens inverse
    var glowTex = (function () {
      var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.38, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c);
    })();
    var ledRows = [];
    function ledRow(r, y, step, size, dir, parent) {
      var L = laneLen(r), cnt = Math.round(L / step), bp = {}, pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), k, geo = new THREE.BufferGeometry();
      for (k = 0; k < cnt; k++) { lanePos(r, k / cnt * L, bp); pos[k * 3] = bp.x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = bp.z; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: size, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false; (parent || g).add(pts); ledRows.push({ geo: geo, col: col, cnt: cnt, dir: dir });
    }
    ledRow(R_OUT + 0.78, TY + 0.09, low ? 0.12 : 0.065, 0.16, 1); ledRow(R_OUT + 0.5, TY + 0.09, low ? 0.12 : 0.065, 0.16, -1);
    // plafond : des anneaux néon qui reprennent la forme de la table, avec des LED qui courent entre eux
    // (le plafond est maintenant une texture : caissons et oculus, voir ceilTex)
    // grosse enseigne néon sur la face nord et colliders de la table (cercles qui recouvrent le rebord)
    for (var cz = -HS; cz <= HS + 0.01; cz += 0.85) room.colliders.push({ x: 0, z: cz, r: R_OUT + 1.0 });
    room.colliders.push({ x: 0, z: -HS, r: R_OUT + 1.05 }, { x: 0, z: HS, r: R_OUT + 1.05 });

    /* ----- grand écran collé au mur du fond (il ne prend plus de place dans la salle) ----- */
    var scr = mkCanvas(1024, 576), sctx = scr.getContext('2d'), scrTex = mkTex(scr);
    var SCW = 8.9, SCH = 5, SCY = 3.2, SCZ = -HZ + 0.22;
    box(SCW + 0.5, SCH + 0.5, 0.2, 0, SCY, -HZ + 0.1, matDark);
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SCW, SCH), new THREE.MeshBasicMaterial({ map: scrTex })); screen.position.set(0, SCY, SCZ + 0.01); g.add(screen);
    box(SCW + 0.7, 0.1, 0.1, 0, SCY + SCH / 2 + 0.25, SCZ, ledA); box(SCW + 0.7, 0.1, 0.1, 0, SCY - SCH / 2 - 0.25, SCZ, ledA);
    box(0.1, SCH + 0.6, 0.1, -SCW / 2 - 0.3, SCY, SCZ, ledA); box(0.1, SCH + 0.6, 0.1, SCW / 2 + 0.3, SCY, SCZ, ledA);

    /* ----- postes de pari : une petite table par chaise (6 de chaque côté de la table) ----- */
    var deckTex = (function () {                 // la partie « boutons » de la table
      var c = mkCanvas(512, 288), x = c.getContext('2d'), k, r, cc, gr = x.createLinearGradient(0, 0, 0, 288);
      gr.addColorStop(0, '#1a2a4a'); gr.addColorStop(1, '#0b1426'); x.fillStyle = gr; x.fillRect(0, 0, 512, 288);
      x.strokeStyle = '#56e6ff'; x.lineWidth = 4; x.strokeRect(4, 4, 504, 280);
      for (k = 0; k < 8; k++) {
        r = Math.floor(k / 4); cc = k % 4; x.beginPath(); x.arc(70 + cc * 92, 70 + r * 84, 33, 0, TAU); x.fillStyle = hex(HORSES[k].silk); x.fill();
        x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.stroke(); x.fillStyle = HORSES[k].ink; x.font = '900 34px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(k + 1), 70 + cc * 92, 72 + r * 84);
      }
      x.fillStyle = '#07101e'; x.fillRect(376, 30, 124, 44); x.strokeStyle = '#3a8dff'; x.lineWidth = 2; x.strokeRect(376, 30, 124, 44);
      x.fillStyle = '#7fd1ff'; x.font = '800 22px ' + MONO; x.fillText('MISE', 438, 52);
      x.fillStyle = '#1fae5a'; x.beginPath(); x.moveTo(386, 98); x.lineTo(490, 98); x.lineTo(490, 156); x.lineTo(386, 156); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.font = '900 24px ' + MONO; x.fillText('PARIER', 438, 128);
      x.fillStyle = '#d63a3a'; x.fillRect(386, 176, 104, 46); x.fillStyle = '#fff'; x.font = '800 18px ' + MONO; x.fillText('ANNULER', 438, 200);
      return mkTex(c);
    })();
    var chairM = new THREE.MeshStandardMaterial({ color: 0x151c2a, roughness: 0.6, metalness: 0.3 }), chairG = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16);
    var backG = new THREE.BoxGeometry(0.06, 0.42, 0.42), poleG = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), footG = new THREE.TorusGeometry(0.26, 0.014, 6, 18);
    var counterTop = new THREE.MeshStandardMaterial({ color: 0x101a30, roughness: 0.2, metalness: 0.6 });
    var n = 0;
    // deskX / chairX / standX : où sont la table, la chaise et l'endroit où l'on se relève (côté s : 1 = est, -1 = ouest)
    var STATIONS = [
      { deskX: 3.95, chairX: 5.0, standX: 6.4, zs: [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5] }
    ];
    STATIONS.forEach(function (st) {
      [1, -1].forEach(function (s) {          // s = 1 : côté est (regarde vers -x) ; s = -1 : côté ouest
        st.zs.forEach(function (czp) {
          var dx = s * st.deskX, cxp = s * st.chairX, seat = { n: ++n, side: s, x: cxp, z: czp, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, occBy: null, standX: s * st.standX };
          // la table : meuble, plateau, liseré et lueur au pied (une table à part pour chaque joueur)
          box(0.74, 0.82, 0.82, dx, 0.41, czp, matMetal);
          box(0.9, 0.05, 0.9, dx + s * 0.02, 0.845, czp, counterTop);
          box(0.04, 0.05, 0.9, dx + s * 0.49, 0.86, czp, ledA);
          box(0.04, 0.06, 0.82, dx - s * 0.38, 0.05, czp, ledB);
          room.colliders.push({ x: dx, z: czp, r: 0.55 });
          // panneau de boutons posé sur le plateau
          var dk = new THREE.Group(); dk.position.set(dx + s * 0.15, 0.874, czp); dk.rotation.y = s * Math.PI / 2; g.add(dk);
          var dp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.35), new THREE.MeshBasicMaterial({ map: deckTex })); dp.rotation.x = -Math.PI / 2; dk.add(dp);
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
            hit: back, x: seat.standX, z: czp, radius: 1.2,
            enabled: function () { return !seat.occBy; },
            prompt: function () { return '🪑 S\'asseoir — Place ' + seat.n; },
            use: function () { room.sit(seat); }
          });
        });
      });
    });
    // porte de sortie vers le hall
    if (cfg && cfg.hall) world.addDoor(room, { x: 0, z: HZ - 0.02, nx: 0, nz: -1, w: 1.8, h: 2.9, label: 'HALL', sub: 'Sortie', color: 0xffe9b0, target: 'hall' });

    /* ----- éclairage ----- */
    g.add(new THREE.AmbientLight(0xf0dcc4, 0.95));
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

    /* ----- sons (fabriqués avec WebAudio : aucun fichier à charger) ----- */
    var snd = { ctx: null, nb: null, on: true, beat: -1, crowd: 0, tick: -1 };
    try { if (localStorage.getItem('f3d_horses_snd') === '0') snd.on = false; } catch (e) { /* stockage bloqué : son activé */ }
    function ac() {
      if (!snd.on) return null;
      if (!snd.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return null;   // le navigateur exige un clic avant tout son
        try { snd.ctx = new AC(); } catch (e) { return null; }
      }
      if (snd.ctx.state === 'suspended') snd.ctx.resume();
      return snd.ctx;
    }
    function tone(f, dur, type, vol, delay, slide) {
      var c = ac(); if (!c) return;
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), v = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.012); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(v); v.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, ftype, freq, delay, q, swell) {
      var c = ac(); if (!c) return;
      if (!snd.nb) { var n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (var k = 0; k < n; k++) d[k] = Math.random() * 2 - 1; snd.nb = b; }
      var t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
      src.buffer = snd.nb; f.type = ftype || 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol || 0.1, t + (swell || 0.01)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(v); v.connect(c.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }
    var SND = {
      chip: function () { tone(1900, 0.05, 'sine', 0.07); noise(0.05, 0.08, 'highpass', 4000); tone(1300, 0.08, 'sine', 0.05, 0.05); },
      tick: function (last) { tone(last ? 1320 : 880, 0.09, 'square', 0.05); },
      start: function () { noise(0.25, 0.18, 'bandpass', 1800, 0, 4); tone(660, 0.9, 'triangle', 0.12); tone(990, 0.9, 'triangle', 0.08); tone(440, 0.5, 'sawtooth', 0.04, 0.05); },
      hoof: function (v) { noise(0.09, 0.22 * v, 'lowpass', 260, 0, 1); tone(75, 0.1, 'sine', 0.16 * v, 0, 45); },
      crowd: function (v) { noise(0.7, 0.05 * v, 'bandpass', 700 + Math.random() * 500, 0, 0.7, 0.3); },
      cheer: function () { noise(2.2, 0.22, 'bandpass', 1100, 0, 0.6, 0.35); noise(1.6, 0.12, 'bandpass', 2600, 0.1, 0.8, 0.3); tone(523, 0.18, 'square', 0.06); tone(659, 0.18, 'square', 0.06, 0.16); tone(784, 0.5, 'square', 0.06, 0.32); },
      win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, k) { tone(f, 0.28, 'triangle', 0.1, k * 0.11); }); for (var k = 0; k < 6; k++) { noise(0.05, 0.1, 'highpass', 5000, 0.5 + k * 0.07); tone(2100 + k * 120, 0.06, 'sine', 0.04, 0.5 + k * 0.07); } },
      lose: function () { tone(262, 0.35, 'sawtooth', 0.06, 0, 200); tone(196, 0.6, 'sawtooth', 0.06, 0.3, 140); }
    };
    room.sndToggle = function () {
      snd.on = !snd.on; try { localStorage.setItem('f3d_horses_snd', snd.on ? '1' : '0'); } catch (e) { /* sans importance */ }
      if (room.elSnd) room.elSnd.textContent = snd.on ? '🔊 Son' : '🔇 Muet';
      if (snd.on) SND.chip();
    };
    // appelée à chaque image : décompte, galop, foule
    function raceSounds(ph, st) {
      if (!snd.on) return;
      if (ph.phase === 'betting') {
        var sec = Math.ceil(ph.left - CLOSE_MS / 1000);
        if (sec !== snd.tick) { snd.tick = sec; if (sec >= 1 && sec <= 5) SND.tick(sec <= 2); }
      } else snd.tick = -1;
      if (ph.phase !== 'racing') { snd.beat = -1; return; }
      var b = Math.floor(ph.t / 0.125), best = Math.min.apply(null, st.finish), near = ph.t > best - 4 ? 1.6 : 1;
      if (b !== snd.beat) { snd.beat = b; if (b % 4 !== 3) SND.hoof((b % 4 === 0 ? 1 : 0.7) * (0.7 + 0.3 * Math.min(1, ph.t / 6))); }
      if (ph.t - snd.crowd > 0.45) { snd.crowd = ph.t; SND.crowd(near * (0.5 + ph.t / 40)); }
    }

    /* ----- grand écran : ce qui s'affiche ----- */
    function drawScreen(info) {
      var c = sctx, W = 1024, H = 576, i;
      c.fillStyle = '#050b18'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#0d2a52'; c.fillRect(0, 0, W, 78);
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#7fd1ff'; c.font = '900 34px ' + SERIF; c.fillText('GRAND PRIX · FLAMBEURS', 28, 40);
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
      if (st.finish || ph.phase === 'betting') raceSounds(ph, st);
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
    room.hudTop = '<button class="s3d-cam" data-s3d="snd">🔊 Son</button><button class="s3d-cam s3d-seat-only" data-s3d="stand">🚶 Se lever</button><button class="s3d-cam s3d-seat-only" data-s3d="cam">🔭 Vue d\'en haut</button>' +
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
      room.elSnd = q('snd'); room.elSnd.textContent = snd.on ? '🔊 Son' : '🔇 Muet'; room.elSnd.addEventListener('click', function () { room.sndToggle(); }); room.elCam = q('cam'); room.elStand = q('stand'); room.elBanner = q('hbanner');
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
          if (total > 0) SND.win(); else SND.lose();
        }
        room.syncHud();
      });
    };
    room.onPhase = function (ph, prev) {
      if (ph === 'racing' && prev) SND.start();
      if (ph === 'results' && prev) SND.cheer();
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
        if (r && r.ok) { SND.chip(); balanceTo(r.balance); if (r.state && r.state.serverNow) { room.clockOffset = r.state.serverNow - Date.now(); room.setState(r.state); } room.say('✅ Pari enregistré : ' + HORSES[s.horse - 1].name + ' (x' + r.mult + ')'); return room.refreshMine(false); }
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
      world.standUp(e.standX, e.z, e.yaw);
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
        tx = gx + Math.sin(a) * Math.cos(p) * 5; tz = gz - Math.cos(a) * Math.cos(p) * 5; ty = gy + Math.sin(p) * 5; fov = Math.abs(e.x) > 6 ? 38 : 55;
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
    room.sit = { y: 0.16, z: 0.3 };   // hauteur et recul du personnage assis (persona3d.js) : tabouret à 0,66 m
    room.remotePose = function (r) { var e = room.seats[r.seat]; return e ? { x: e.x - e.side * 0.1, z: e.z, yaw: e.yaw } : null; };

    var ledT = 0, ledCol = new THREE.Color();
    room.update = function (dt) {
      updateRace(dt);
      ledT += dt;
      ledRows.forEach(function (row) {          // arc-en-ciel qui défile + vague de luminosité qui court le long de la rangée
        var k, h, wv, v;
        for (k = 0; k < row.cnt; k++) {
          wv = 0.5 + 0.5 * Math.sin(k / row.cnt * TAU * 14 - ledT * 6 * row.dir);
          h = (k / row.cnt * 2 + ledT * 0.07) % 1; v = 0.12 + 0.88 * wv * wv;
          ledCol.setHSL(h, 1, 0.5); row.col[k * 3] = ledCol.r * v; row.col[k * 3 + 1] = ledCol.g * v; row.col[k * 3 + 2] = ledCol.b * v;
        }
        row.geo.attributes.color.needsUpdate = true;
      });
      ledA.color.copy(ledCol.setHSL(0.5 + 0.12 * Math.sin(ledT * 0.9), 1, 0.52 + 0.1 * Math.sin(ledT * 3)));
      ledB.color.copy(ledCol.setHSL(0.78 + 0.1 * Math.sin(ledT * 0.7 + 1), 1, 0.5 + 0.12 * Math.sin(ledT * 2.2)));
      ceilFx.visible = !(world.mode === 'seat' && room.view.mode === 'top');   // la vue d'en haut est au-dessus du plafond
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
