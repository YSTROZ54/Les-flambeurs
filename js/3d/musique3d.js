/* =====================================================================
   musique3d.js — La salle de musique du casino 3D (Three.js r128)
   ---------------------------------------------------------------------
   On y entre par la porte violette du hall (mur de gauche). Le sol reprend le damier de marbre du hall, mais en verre :
   chaque dalle s'allume de la couleur du son qui joue (graves au centre, aigus vers les murs). Une bande d'égaliseur et deux enceintes
   répondent à la même musique. Sans musique, le sol respire doucement.
   JUKEBOX : un grand écran est plaqué en haut du mur d'en face de la porte, un PC trône au milieu de la salle. Chacun y ajoute un clip YouTube ;
   la file d'attente (api/musique.js, le serveur fait l'horloge) passe sur l'écran, avec « demandé par », et le son joue pour tous ceux qui sont dans la salle,
   synchronisé, au volume du curseur « musique » du téléphone (la musique d'ambiance se tait pendant un clip). Une trentaine de fauteuils cosy et des poufs.
   Sans clip, la musique d'ambiance vient de audio3d.js (F.audio.levels) : titres dans assets/musique/salle-musique/ puis « npm run playlist ».
   Fichiers liés : f3d-core.js, world3d.js, audio3d.js, hall3d.js (la porte), portes3d.js (le thème de la porte), api/musique.js (la file).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 12, HZ = 12, H = 8;             // demi-largeur, demi-profondeur et hauteur de la salle (mètres)
  var NB = 16;                              // bandes de fréquences suivies (graves -> aigus)
  var SW = 13.6, SH = 5.6, SCY = 4.7, SZ = -HZ + 0.12;   // grand écran : largeur, hauteur, hauteur du centre, profondeur (plaqué contre le mur du fond)
  var VW = SH * 16 / 9;                     // partie vidéo (16/9) à gauche ; la file d'attente occupe le reste de l'écran

  function createMusicRoom(world) {
    var low = world.low;
    var room = { title: 'SALLE DE MUSIQUE', subtitle: 'LE SOL VIBRE AU RYTHME DU SON', topic: 'flambeurs-musique-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };

    /* ---------- le sol : dalles LED en verre, une dalle lumineuse sur deux et l'autre en miroir infini ---------- */
    var TILE = low ? 1.5 : 1, NX = Math.round(HX * 2 / TILE), NZ = Math.round(HZ * 2 / TILE), N = NX * NZ;
    var base = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x05030a }));
    base.rotation.x = -Math.PI / 2; base.position.y = -0.34; g.add(base);
    function tileTex(kind) {
      var c = mkCanvas(128, 128), x = c.getContext('2d'), q, d;
      x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
      if (kind === 0) {                                      // dalle pleine : cadre clair, cœur qui rayonne
        var gr = x.createRadialGradient(64, 64, 4, 64, 64, 90); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#a8a8a8'); gr.addColorStop(1, '#383838');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#ffffff'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
      } else {                                               // miroir infini : des cadres qui s'enfoncent dans la dalle, points lumineux sur les bords
        for (q = 0; q < 9; q++) { var m = 5 + q * 6.5; x.strokeStyle = 'rgba(255,255,255,' + Math.pow(0.78, q).toFixed(2) + ')'; x.lineWidth = Math.max(1, 3.4 - q * 0.28); x.strokeRect(m, m, 128 - 2 * m, 128 - 2 * m); }
        x.fillStyle = 'rgba(255,255,255,0.95)';
        for (d = 0; d < 15; d++) { x.fillRect(9 + d * 7.5, 7, 3, 3); x.fillRect(9 + d * 7.5, 118, 3, 3); x.fillRect(7, 9 + d * 7.5, 3, 3); x.fillRect(118, 9 + d * 7.5, 3, 3); }
      }
      var t = mkTex(c); t.anisotropy = 4; return t;
    }
    var glowGeo = new THREE.PlaneGeometry(TILE - 0.07, TILE - 0.07); glowGeo.rotateX(-Math.PI / 2);
    var cnt = [0, 0], i, j, k = 0, dmax = Math.hypot(HX, HZ);
    for (i = 0; i < NX; i++) for (j = 0; j < NZ; j++) cnt[(i + j) % 2]++;
    function glowMesh(kind) { return new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: tileTex(kind), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), cnt[kind]); }
    var glowA = glowMesh(0), glowB = glowMesh(1);
    var glassGeo = new THREE.BoxGeometry(TILE - 0.04, 0.07, TILE - 0.04);
    var glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }), N);
    var dm = new THREE.Object3D(), tiles = [], kk = [0, 0];
    for (i = 0; i < NX; i++) for (j = 0; j < NZ; j++) {
      var tx = -HX + (i + 0.5) * TILE, tz = -HZ + (j + 0.5) * TILE, kind = (i + j) % 2, d = Math.hypot(tx, tz), gm = kind ? glowB : glowA;
      dm.position.set(tx, -0.18, tz); dm.updateMatrix(); gm.setMatrixAt(kk[kind], dm.matrix);
      dm.position.set(tx, -0.035, tz); dm.updateMatrix(); glass.setMatrixAt(k, dm.matrix);
      tiles.push({ kind: kind, k2: kk[kind], band: Math.min(NB - 1, Math.floor(Math.pow(d / dmax, 0.85) * NB)), d: d, ang: Math.atan2(tz, tx) });
      gm.setColorAt(kk[kind], new THREE.Color(0x000000)); glass.setColorAt(k, new THREE.Color(0x111111));
      kk[kind]++; k++;
    }
    [glowA, glowB, glass].forEach(function (m) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; g.add(m); });

    /* ---------- murs, moulures, plafond ---------- */
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x1d1038, roughness: 0.85 });
    var panelMat = new THREE.MeshStandardMaterial({ color: 0x120a24, roughness: 0.7 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 });
    function wall(w, h, px, py, pz, ry, mat) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || wallMat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, H, 0, H / 2, -HZ, 0); wall(HX * 2, H, 0, H / 2, HZ, Math.PI);
    wall(HZ * 2, H, -HX, H / 2, 0, Math.PI / 2); wall(HZ * 2, H, HX, H / 2, 0, -Math.PI / 2);
    wall(HX * 2, 1.1, 0, 0.55, -HZ + 0.02, 0, panelMat); wall(HX * 2, 1.1, 0, 0.55, HZ - 0.02, Math.PI, panelMat);
    wall(HZ * 2, 1.1, -HX + 0.02, 0.55, 0, Math.PI / 2, panelMat); wall(HZ * 2, 1.1, HX - 0.02, 0.55, 0, -Math.PI / 2, panelMat);
    [1.1, H - 0.2].forEach(function (y) {
      [[HX * 2, 0.08, 0.08, 0, y, -HZ + 0.05], [HX * 2, 0.08, 0.08, 0, y, HZ - 0.05], [0.08, 0.08, HZ * 2, -HX + 0.05, y, 0], [0.08, 0.08, HZ * 2, HX - 0.05, y, 0]].forEach(function (d) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), gold); m.position.set(d[3], d[4], d[5]); g.add(m);
      });
    });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x08050f }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* ---------- mur du fond : grand écran plaqué en haut du mur en face de la porte ---------- */
    var dark = new THREE.MeshStandardMaterial({ color: 0x15111c, roughness: 0.45, metalness: 0.35 });
    var frameBack = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.5, SH + 0.5, 0.1), gold); frameBack.position.set(0, SCY, SZ - 0.09); g.add(frameBack);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.3, SH + 0.3, 0.12), dark); frame.position.set(0, SCY, SZ - 0.03); g.add(frame);
    var SCW = 2048, SCH = Math.round(SCW * SH / SW), VWP = Math.round(SCW * VW / SW);   // canvas de l'écran, et largeur (en pixels) de la partie vidéo
    var scr = mkCanvas(SCW, SCH), sx = scr.getContext('2d'), scrTex = mkTex(scr); scrTex.anisotropy = 8;
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: scrTex })); screen.position.set(0, SCY, SZ + 0.05); g.add(screen);
    // les quatre coins de la vidéo (haut gauche, haut droit, bas droit, bas gauche) : le lecteur YouTube se plaque dessus
    var vL = -SW / 2, vR = -SW / 2 + VW, vT = SCY + SH / 2, vB = SCY - SH / 2, vZ = SZ + 0.052;
    // trou dans l'image : ce plan efface l'écran (alpha 0) là où il est visible ; le lecteur YouTube, placé DERRIÈRE le canvas, apparaît alors à cet endroit.
    // Tout ce qui est devant l'écran (PC, joueurs, boule, faisceaux…) se dessine par-dessus : la vidéo passe derrière.
    var holeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    holeMat.blending = THREE.CustomBlending; holeMat.blendEquation = THREE.AddEquation; holeMat.blendEquationAlpha = THREE.AddEquation;
    holeMat.blendSrc = THREE.ZeroFactor; holeMat.blendDst = THREE.ZeroFactor; holeMat.blendSrcAlpha = THREE.ZeroFactor; holeMat.blendDstAlpha = THREE.ZeroFactor;
    var hole = new THREE.Mesh(new THREE.PlaneGeometry(VW, SH), holeMat); hole.position.set(vL + VW / 2, SCY, vZ); hole.renderOrder = -10; hole.visible = false; g.add(hole);
    var VIDEO_CORNERS = [new THREE.Vector3(vL, vT, vZ), new THREE.Vector3(vR, vT, vZ), new THREE.Vector3(vR, vB, vZ), new THREE.Vector3(vL, vB, vZ)];

    /* ---------- bande d'égaliseur sous l'écran, enceintes de chaque côté ---------- */
    var NBAR = 24, bars = [], barMat = [];
    var back = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 1.5), new THREE.MeshBasicMaterial({ color: 0x06030c })); back.position.set(0, 1.0, -HZ + 0.12); g.add(back);
    var bw = 13.8 / NBAR;
    for (i = 0; i < NBAR; i++) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xb98cff }); barMat.push(mat);
      var bar = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 1, 0.08), mat);
      bar.position.set(-6.9 + (i + 0.5) * bw, 0.4, -HZ + 0.2); g.add(bar); bars.push(bar);
    }
    // enseigne, au-dessus de la porte
    var sc = mkCanvas(1024, 128), sxx = sc.getContext('2d');
    sxx.fillStyle = '#0c0618'; sxx.fillRect(0, 0, 1024, 128); sxx.strokeStyle = '#b98cff'; sxx.lineWidth = 8; sxx.shadowColor = '#b98cff'; sxx.shadowBlur = 24; sxx.strokeRect(8, 8, 1008, 112);
    sxx.shadowBlur = 16; sxx.fillStyle = '#f4e8ff'; sxx.font = '900 66px ' + SERIF; sxx.textAlign = 'center'; sxx.textBaseline = 'middle'; sxx.fillText('♪  SALLE DE MUSIQUE  ♪', 512, 68, 940);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(0, 6.0, HZ - 0.1); sign.rotation.y = Math.PI; g.add(sign);
    var woofers = [];
    [-8.9, 8.9].forEach(function (x) {
      var DZ = -HZ + 1.1;
      var sp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.0, 1.2), dark); sp.position.set(x, 1.5, DZ); g.add(sp);
      [[0.95, 0.45], [2.15, 0.3]].forEach(function (c) {
        var w = new THREE.Mesh(new THREE.CylinderGeometry(c[1], c[1], 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x1b1822, roughness: 0.5, metalness: 0.5 })); w.rotation.x = Math.PI / 2; w.position.set(x, c[0] + 0.1, DZ + 0.63); g.add(w);
        var cone = new THREE.Mesh(new THREE.SphereGeometry(c[1] * 0.7, 14, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a2e80 })); cone.rotation.x = Math.PI / 2; cone.position.set(x, c[0] + 0.1, DZ + 0.69); g.add(cone);
        woofers.push({ m: cone, z: DZ + 0.69, big: c[1] > 0.4 });
      });
      room.colliders.push({ x: x, z: DZ, r: 0.9 });
    });

    /* ---------- le PC du jukebox, au milieu de la salle ---------- */
    var PCX = 0, PCZ = 0;
    // console basse : le moniteur reste sous la ligne des yeux (1,65 m), sinon il masquerait le bas de l'écran vu depuis l'allée
    var pcBase = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.12, 28), gold); pcBase.position.set(PCX, 0.06, PCZ); g.add(pcBase);
    var pcCol = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.62, 20), dark); pcCol.position.set(PCX, 0.43, PCZ); g.add(pcCol);
    var pcTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.8), dark); pcTop.position.set(PCX, 0.78, PCZ); g.add(pcTop);
    var pcTrim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.03, 0.86), gold); pcTrim.position.set(PCX, 0.74, PCZ); g.add(pcTrim);
    var kb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.22), new THREE.MeshBasicMaterial({ color: 0x6a4fb0 })); kb.position.set(PCX, 0.835, PCZ + 0.22); g.add(kb);
    var pcStand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), dark); pcStand.position.set(PCX, 0.92, PCZ - 0.15); g.add(pcStand);
    var pcFrame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.72, 0.07), dark); pcFrame.position.set(PCX, 1.2, PCZ - 0.15); pcFrame.rotation.x = -0.18; g.add(pcFrame);
    var pcCv = mkCanvas(512, 320), pcx = pcCv.getContext('2d'), pcTex = mkTex(pcCv);
    var pcScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.62), new THREE.MeshBasicMaterial({ map: pcTex })); pcScreen.position.set(PCX, 1.2, PCZ - 0.15 + 0.037); pcScreen.rotation.x = -0.18; g.add(pcScreen);
    room.colliders.push({ x: PCX, z: PCZ, r: 1.0 });

    /* ---------- fauteuils cosy : des rangées face à l'écran, deux coins salon sur les côtés, des poufs devant ---------- */
    var CH_COLS = [0x8a3b5c, 0x2f6f73, 0xc98a2b, 0xb4533c, 0x4b5fa8, 0x5d8a4a];
    var chairs = [], seats = [];
    function addChair(x, z, yaw) {
      var n = chairs.length; chairs.push({ x: x, z: z, yaw: yaw, col: CH_COLS[(n * 5 + Math.floor(n / 4)) % CH_COLS.length] });
      seats.push({ n: n, x: x, z: z, yaw: yaw, sx: x + Math.sin(yaw) * 1.15, sz: z - Math.cos(yaw) * 1.15 });
      room.colliders.push({ x: x, z: z, r: 0.5 });
    }
    [[3.4, [-7.6, -5.8, -4.0, -2.2, 2.2, 4.0, 5.8, 7.6]], [6.1, [-8.5, -6.7, -4.9, -3.1, 3.1, 4.9, 6.7, 8.5]], [8.8, [-7.6, -5.8, -4.0, -2.2, 2.2, 4.0, 5.8, 7.6]]].forEach(function (row) {
      row[1].forEach(function (x) { addChair(x, row[0], 0); });
    });
    [-1, 1].forEach(function (sd) { [-6.0, -0.4].forEach(function (z) { addChair(sd * 9.7, z, Math.atan2(-sd * 9.7, -(SZ - z))); }); });   // salons des côtés : tournés vers l'écran
    [-1, 1].forEach(function (sd) { addChair(sd * 9.7, 5.2, Math.atan2(-sd * 9.7, -(SZ - 5.2))); });
    var NCH = chairs.length;
    var fabric = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), wood = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.6 });
    var armGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12); armGeo.rotateX(Math.PI / 2);
    var chairParts = [
      { geo: new THREE.BoxGeometry(0.94, 0.12, 0.94), mat: wood, pos: [0, 0.06, 0] },                      // socle
      { geo: new THREE.BoxGeometry(0.8, 0.26, 0.76), mat: fabric, pos: [0, 0.25, -0.04] },                  // assise (dessus à 0,38 m)
      { geo: new THREE.BoxGeometry(0.94, 0.82, 0.2), mat: fabric, pos: [0, 0.6, 0.38], rx: -0.14 },        // dossier
      { geo: armGeo, mat: fabric, pos: [-0.45, 0.42, -0.02] }, { geo: armGeo, mat: fabric, pos: [0.45, 0.42, -0.02] },   // accoudoirs arrondis
      { geo: new THREE.BoxGeometry(0.32, 0.3, 0.1), mat: fabric, pos: [0.18, 0.6, 0.22], rx: -0.3, rz: 0.25, pillow: true }   // coussin
    ];
    (function () {
      var mC = new THREE.Matrix4(), mP = new THREE.Matrix4(), mR = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
      chairParts.forEach(function (pt) { pt.mesh = new THREE.InstancedMesh(pt.geo, pt.mat, NCH); pt.mesh.frustumCulled = false; g.add(pt.mesh); });
      chairs.forEach(function (ch, n) {
        q.setFromEuler(e.set(0, -ch.yaw, 0)); mC.compose(v.set(ch.x, 0, ch.z), q, one);
        chairParts.forEach(function (pt) {
          q.setFromEuler(e.set(pt.rx || 0, 0, pt.rz || 0)); mP.compose(v.set(pt.pos[0], pt.pos[1], pt.pos[2]), q, one); mR.multiplyMatrices(mC, mP); pt.mesh.setMatrixAt(n, mR);
          if (pt.mat === fabric) { col.setHex(ch.col); if (pt.pillow) col.offsetHSL(0.1, 0, 0.2); pt.mesh.setColorAt(n, col); }
        });
      });
    })();
    // quelques plantes dans les coins
    [[-11, -10.9], [11, -10.9], [-11, 10.6], [11, 10.6]].forEach(function (p) {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.8 })); pot.position.set(p[0], 0.25, p[1]); g.add(pot);
      var bush = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshLambertMaterial({ color: 0x2f7d46 })); bush.position.set(p[0], 0.95, p[1]); bush.scale.y = 1.15; g.add(bush);
      room.colliders.push({ x: p[0], z: p[1], r: 0.4 });
    });

    /* =====================================================================
       JUKEBOX : file d'attente de clips YouTube partagée (api/musique.js : le serveur fait l'horloge).
       Chaque joueur présent dans la salle joue le même clip au même endroit, au volume de sa musique d'ambiance (téléphone › Réglages).
       Le clip s'affiche sur le grand écran : le lecteur YouTube est plaqué en perspective sur la partie vidéo, la file et « demandé par » sont dessinés à droite.
       ===================================================================== */
    var net = { state: null, off: 0, ver: 0, busy: false }, clip = { on: false }, active = false, paused = false, lastUpd = 0, W = null, timers = [];
    var yt = { ready: false, player: null, id: '', showing: false, vol: -1, state: -2, startedAt: 0, seekUntil: 0, blocked: false, bad: {}, err: '' };
    var ov = null, ovBox = null, ovHost = null, isoPrev = '', ovContainer = null;
    function srvNow() { return Date.now() + net.off; }
    function fmtT(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
    function adopt(st, t0) {
      if (!st || !st.ok) return;
      net.off = st.serverNow - (t0 != null ? (t0 + Date.now()) / 2 : Date.now()); net.state = st; net.ver++;
      if (desk) renderDesk();
    }
    function poll() {
      if (!active || paused || net.busy) return;
      net.busy = true; var t0 = Date.now();
      fetch('/api/musique', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (st) { net.busy = false; adopt(st, t0); }).catch(function () { net.busy = false; });
    }
    function apiPost(body) { return W ? W.post('/api/musique', body) : Promise.resolve(null); }

    /* --- lecteur YouTube (API IFrame) --- */
    function loadYtApi(cb) {
      if (window.YT && window.YT.Player) { cb(); return; }
      (window.__flYtQ = window.__flYtQ || []).push(cb);
      if (window.__flYtLoading) return;
      window.__flYtLoading = true;
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { try { if (prev) prev(); } catch (e) { /* ok */ } var q = window.__flYtQ || []; window.__flYtQ = []; q.forEach(function (f) { try { f(); } catch (e) { /* ok */ } }); };
      var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
      s.onerror = function () { window.__flYtLoading = false; yt.err = 'YouTube n\'a pas pu être chargé.'; };
      document.head.appendChild(s);
    }
    function ytVars() { var v = { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, cc_load_policy: 0 }; if (/^https?:$/.test(location.protocol)) v.origin = location.origin; return v; }
    function buildOverlay(w) {
      if (ov) return;
      ov = document.createElement('div'); ov.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1';       // derrière le canvas : l'écran 3D le laisse voir par son « trou »
      isoPrev = w.container.style.isolation; w.container.style.isolation = 'isolate';
      ovBox = document.createElement('div'); ovBox.style.cssText = 'position:absolute;left:0;top:0;width:960px;height:540px;transform-origin:0 0;background:#000;display:none;will-change:transform;pointer-events:none';
      ovHost = document.createElement('div'); ovHost.style.cssText = 'width:100%;height:100%'; ovBox.appendChild(ovHost); ov.appendChild(ovBox);
      w.container.insertBefore(ov, w.dom || null);
      loadYtApi(function () {
        if (!ov || yt.player) return;
        yt.player = new YT.Player(ovHost, { width: 960, height: 540, playerVars: ytVars(), events: {
          onReady: function () { yt.ready = true; try { yt.player.getIframe().style.pointerEvents = 'none'; } catch (e) { /* ok */ } syncClip(); },
          onStateChange: function (e) { yt.state = e.data; yt.showing = e.data === 1 || e.data === 3 || e.data === 2; if (e.data === 1) { yt.blocked = false; yt.started = true; } },
          onError: function (e) { if (yt.id) { yt.bad[yt.id] = e.data; yt.showing = false; } }
        } });
      });
    }
    function destroyOverlay() {
      if (yt.player) { try { yt.player.destroy(); } catch (e) { /* ok */ } }
      yt.player = null; yt.ready = false; yt.id = ''; yt.showing = false; yt.state = -2; yt.vol = -1;
      if (ov && ov.parentNode) { ov.parentNode.style.isolation = isoPrev; ov.parentNode.removeChild(ov); }
      ov = ovBox = ovHost = null; hole.visible = false;
    }
    function stopClip() {
      if (yt.id && yt.player && yt.ready) { try { yt.player.stopVideo(); } catch (e) { /* ok */ } }
      yt.id = ''; yt.showing = false; yt.started = false; yt.state = -2;
    }
    // appelé toutes les 0,4 s : place le lecteur sur le bon clip, au bon endroit, au bon volume
    function syncClip() {
      var st = net.state, cur = st && st.cur, now = srvNow(), pos = cur ? Math.max(0, (now - cur.startedAt) / 1000) : 0;
      var want = !!cur && pos < cur.dur && active && !paused && !yt.bad[cur.id];
      clip.on = want && yt.showing;
      if (F.audio && F.audio.setDuck) F.audio.setDuck(want && !yt.err ? 0 : 1);          // un clip joue : la musique d'ambiance se tait
      if (!yt.ready || !yt.player) return;
      if (!want) { if (yt.id) stopClip(); return; }
      try {
        var vol = Math.round(100 * (F.audio && F.audio.externalVol ? F.audio.externalVol() : 0.4));      // mêmes réglages de son que la musique d'ambiance
        if (vol !== yt.vol) { yt.vol = vol; yt.player.setVolume(vol); if (vol === 0) yt.player.mute(); else if (yt.player.isMuted()) yt.player.unMute(); }
        if (yt.id !== cur.id) {
          yt.id = cur.id; yt.started = false; yt.blocked = false; yt.startedAt = Date.now(); yt.seekUntil = 0; yt.showing = false;
          yt.player.loadVideoById({ videoId: cur.videoId, startSeconds: pos });
          return;
        }
        var s2 = yt.player.getPlayerState();
        if (s2 === 1) {
          if (Math.abs(yt.player.getCurrentTime() - pos) > 2.5 && Date.now() > yt.seekUntil) { yt.seekUntil = Date.now() + 2500; yt.player.seekTo(pos, true); }   // trop loin des autres : on se recale
        } else if (s2 === 2 || s2 === 5) yt.player.playVideo();
        else if (s2 === -1 && Date.now() - yt.startedAt > 3500) yt.blocked = true;                  // le navigateur refuse de démarrer le son tout seul : un clic suffira
      } catch (e) { /* lecteur pas prêt */ }
    }
    function onUserGesture() { if (yt.blocked && yt.player && yt.ready) { try { yt.player.unMute(); yt.player.playVideo(); } catch (e) { /* ok */ } } }

    // plaque le lecteur sur le coin de l'écran : homographie (4 coins projetés -> matrix3d), calculée après le rendu de l'image
    function homography(w, h, p) {
      var x0 = p[0][0], y0 = p[0][1], x1 = p[1][0], y1 = p[1][1], x2 = p[2][0], y2 = p[2][1], x3 = p[3][0], y3 = p[3][1];
      var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
      var den = dx1 * dy2 - dy1 * dx2; if (Math.abs(den) < 1e-6) return null;
      var gg = (dx3 * dy2 - dy3 * dx2) / den, hh = (dx1 * dy3 - dy1 * dx3) / den;
      var a = x1 - x0 + gg * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + gg * y1, e = y3 - y0 + hh * y3, f = y0;
      return 'matrix3d(' + [a / w, d / w, 0, gg / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1].join(',') + ')';
    }
    var tmpV = new THREE.Vector3(), tmpQ = new THREE.Vector3();
    function placeOverlay(w) {
      if (!ovBox) return;
      var show = active && !paused && yt.showing && w.room === room && !!w.camera;
      if (show) {
        var cam = w.camera, cw = w.container.clientWidth, chh = w.container.clientHeight, pts = [], k, out = 0;
        for (k = 0; k < 4; k++) {
          tmpV.copy(VIDEO_CORNERS[k]).applyMatrix4(cam.matrixWorldInverse);
          if (tmpV.z > -0.1) { show = false; break; }                               // un coin est derrière la caméra
          tmpQ.copy(tmpV).applyMatrix4(cam.projectionMatrix);
          var px = (tmpQ.x * 0.5 + 0.5) * cw, py = (-tmpQ.y * 0.5 + 0.5) * chh; pts.push([px, py]);
          if (px < 0 || px > cw || py < 0 || py > chh) out++;
        }
        if (show && out === 4) {                                                    // tout est hors champ : inutile de dessiner
          var minX = Math.min(pts[0][0], pts[1][0], pts[2][0], pts[3][0]), maxX = Math.max(pts[0][0], pts[1][0], pts[2][0], pts[3][0]), minY = Math.min(pts[0][1], pts[1][1], pts[2][1], pts[3][1]), maxY = Math.max(pts[0][1], pts[1][1], pts[2][1], pts[3][1]);
          if (maxX < 0 || minX > cw || maxY < 0 || minY > chh) show = false;
        }
        if (show) { var m = homography(960, 540, pts); if (m) { ovBox.style.transform = m; } else show = false; }
      }
      var disp = show ? 'block' : 'none';
      if (ovBox.style.display !== disp) ovBox.style.display = disp;
      hole.visible = show;                                                          // le trou n'existe que si la vidéo est là derrière
    }

    /* --- l'écran géant : vidéo à gauche (le lecteur YouTube la recouvre), « demandé par » et file d'attente à droite --- */
    function fit(c, text, maxW) { text = String(text || ''); if (c.measureText(text).width <= maxW) return text; while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1); return text + '…'; }
    function wrap(c, text, x, y, maxW, lh, maxLines) {
      var words = String(text || '').split(/\s+/), line = '', n = 0, i2;
      for (i2 = 0; i2 < words.length; i2++) {
        var t = line ? line + ' ' + words[i2] : words[i2];
        if (c.measureText(t).width > maxW && line) { if (++n >= maxLines) { c.fillText(fit(c, line + ' ' + words.slice(i2).join(' '), maxW), x, y); return y + lh; } c.fillText(line, x, y); y += lh; line = words[i2]; } else line = t;
      }
      if (line) { c.fillText(fit(c, line, maxW), x, y); y += lh; }
      return y;
    }
    function drawScreen() {
      var c = sx, st = net.state, cur = st && st.cur, q = (st && st.queue) || [], now = srvNow(), pos = cur ? Math.max(0, (now - cur.startedAt) / 1000) : 0;
      c.clearRect(0, 0, SCW, SCH); c.shadowBlur = 0;
      var vg = c.createLinearGradient(0, 0, 0, SCH); vg.addColorStop(0, '#1b0e36'); vg.addColorStop(1, '#07040d'); c.fillStyle = vg; c.fillRect(0, 0, VWP, SCH);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (!yt.showing) {
        var bn = 40, bwid = (VWP - 160) / bn, bi;
        for (bi = 0; bi < bn; bi++) { var lv = sm[Math.min(NB - 1, Math.floor(bi / bn * NB))] || 0, bh = 20 + lv * 330; c.fillStyle = 'hsl(' + Math.round(((clock * 0.05 + bi / bn * 0.85) % 1) * 360) + ',90%,' + Math.round(40 + lv * 20) + '%)'; c.fillRect(80 + bi * bwid + 2, SCH - 70 - bh, bwid - 4, bh); }
        if (cur) {
          c.fillStyle = '#f4e8ff'; c.font = '800 54px ' + SERIF; c.fillStyle = '#b98cff'; c.font = '700 30px ' + MONO; c.fillText(yt.bad[cur.id] ? 'CLIP INDISPONIBLE ICI' : yt.err ? yt.err.toUpperCase() : yt.blocked ? 'CLIQUE POUR ACTIVER LE SON' : 'CHARGEMENT DU CLIP…', VWP / 2, SCH * 0.32);
          c.fillStyle = '#fff3d6'; c.font = '800 58px ' + SERIF; wrap(c, cur.title, VWP / 2, SCH * 0.44, VWP - 220, 70, 2);
        } else {
          c.fillStyle = '#f4e8ff'; c.shadowColor = '#b98cff'; c.shadowBlur = 26; c.font = '900 120px ' + SERIF; c.fillText('♪ JUKEBOX ♪', VWP / 2, SCH * 0.3); c.shadowBlur = 0;
          c.fillStyle = '#b98cff'; c.font = '700 36px ' + MONO; c.fillText('AUCUN CLIP POUR L\'INSTANT', VWP / 2, SCH * 0.46);
          c.fillStyle = '#d9cbff'; c.font = '600 32px ' + SERIF; c.fillText('Va au PC, au milieu de la salle, pour ajouter une musique', VWP / 2, SCH * 0.55);
        }
      }
      // panneau de droite
      var px0 = VWP, PW = SCW - VWP, pad = 34, iw = PW - pad * 2;
      c.fillStyle = '#0d0719'; c.fillRect(px0, 0, PW, SCH); c.fillStyle = '#c9a227'; c.fillRect(px0, 0, 5, SCH);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = '#b98cff'; c.font = '700 26px ' + MONO; c.fillText(cur ? 'EN COURS' : 'EN ATTENTE', px0 + pad, 64);
      if (cur) {
        c.fillStyle = '#fff3d6'; c.font = '800 38px ' + SERIF; var ey = wrap(c, cur.title, px0 + pad, 116, iw, 46, 3);
        c.fillStyle = '#ffd36a'; c.font = '700 27px ' + MONO; c.fillText(fit(c, 'DEMANDÉ PAR ' + String(cur.by).toUpperCase(), iw), px0 + pad, Math.max(ey + 14, 262));
        var by = 300, pr = Math.min(1, pos / Math.max(1, cur.dur));
        c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(px0 + pad, by, iw, 12); c.fillStyle = '#b98cff'; c.fillRect(px0 + pad, by, iw * pr, 12);
        c.fillStyle = '#d9cbff'; c.font = '600 24px ' + MONO; c.fillText(fmtT(pos) + ' / ' + fmtT(cur.dur), px0 + pad, by + 44);
      } else { c.fillStyle = '#d9cbff'; c.font = '600 32px ' + SERIF; wrap(c, 'La salle attend votre prochain titre.', px0 + pad, 120, iw, 42, 3); }
      c.fillStyle = 'rgba(201,162,39,0.5)'; c.fillRect(px0 + pad, 372, iw, 2);
      c.fillStyle = '#b98cff'; c.font = '700 26px ' + MONO; c.fillText('FILE D\'ATTENTE' + (q.length ? ' · ' + q.length : ''), px0 + pad, 418);
      if (!q.length) { c.fillStyle = '#9a8fbf'; c.font = '600 28px ' + SERIF; wrap(c, cur ? 'Personne n\'attend : ajoute ton titre au PC !' : 'La file est vide.', px0 + pad, 470, iw, 38, 2); }
      var ri, rows = Math.min(q.length, 5);
      for (ri = 0; ri < rows; ri++) {
        var ry = 452 + ri * 70;
        c.fillStyle = 'rgba(185,140,255,0.18)'; c.beginPath(); c.arc(px0 + pad + 22, ry + 24, 22, 0, TAU); c.fill();
        c.fillStyle = '#f4e8ff'; c.font = '800 24px ' + MONO; c.textAlign = 'center'; c.fillText(String(ri + 1), px0 + pad + 22, ry + 33); c.textAlign = 'left';
        c.fillStyle = '#fff3d6'; c.font = '700 27px ' + SERIF; c.fillText(fit(c, q[ri].title, iw - 66), px0 + pad + 62, ry + 20);
        c.fillStyle = '#ffd36a'; c.font = '600 20px ' + MONO; c.fillText(fit(c, 'par ' + q[ri].by, iw - 66), px0 + pad + 62, ry + 48);
      }
      if (q.length > rows) { c.fillStyle = '#9a8fbf'; c.font = '600 24px ' + MONO; c.fillText('+ ' + (q.length - rows) + ' autre' + (q.length - rows > 1 ? 's' : ''), px0 + pad, 452 + rows * 70 + 24); }
      scrTex.needsUpdate = true;
    }
    function drawPc() {
      var c = pcx, st = net.state, cur = st && st.cur, nq = st && st.queue ? st.queue.length : 0;
      var gr = c.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#1b0e36'); gr.addColorStop(1, '#0a0614'); c.fillStyle = gr; c.fillRect(0, 0, 512, 320);
      c.strokeStyle = '#b98cff'; c.lineWidth = 4; c.strokeRect(6, 6, 500, 308);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f4e8ff'; c.font = '900 46px ' + SERIF; c.fillText('♪ JUKEBOX', 256, 52);
      c.fillStyle = '#b98cff'; c.font = '700 20px ' + MONO; c.fillText(cur ? 'EN COURS' : 'AUCUN CLIP', 256, 100);
      if (cur) { c.fillStyle = '#fff3d6'; c.font = '700 26px ' + SERIF; wrap(c, cur.title, 256, 138, 440, 32, 2); }
      c.fillStyle = '#ffd36a'; c.font = '600 20px ' + MONO; c.fillText(nq ? nq + ' TITRE' + (nq > 1 ? 'S' : '') + ' EN ATTENTE' : 'FILE VIDE', 256, 232);
      c.fillStyle = '#d9cbff'; c.font = '600 20px ' + SERIF; c.fillText('Appuie sur F pour ajouter une musique', 256, 280);
      pcTex.needsUpdate = true;
    }

    /* --- le panneau du PC (on s'assoit devant : Échap pour fermer) --- */
    var desk = null, seat = null, view = { yaw: 0, pitch: 0 }, standEl = null, cssDone = false;
    function injectCss() {
      if (cssDone) return; cssDone = true;
      var st = document.createElement('style');
      st.textContent =
        '.mus-ov{position:absolute;right:18px;top:64px;bottom:84px;width:min(430px,calc(100% - 28px));z-index:6;display:flex;flex-direction:column;gap:10px;background:rgba(12,6,24,.93);border:1.5px solid #b98cff;border-radius:16px;padding:14px;color:#f4e8ff;font-family:"Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.6);overflow:hidden}' +
        '.mus-ov *{box-sizing:border-box}.mus-h{display:flex;align-items:center;justify-content:space-between;font-size:17px;font-weight:800;letter-spacing:.04em}' +
        '.mus-ov button{cursor:pointer;font-family:inherit;font-weight:800;border-radius:10px;border:1.5px solid #b98cff;background:rgba(185,140,255,.18);color:#f4e8ff;padding:8px 12px;font-size:13px}.mus-ov button:hover{background:rgba(185,140,255,.35)}' +
        '.mus-ov button.red{border-color:#ff6a6a;background:rgba(255,90,90,.16)}.mus-add{display:flex;gap:8px}.mus-add input{flex:1;min-width:0;border-radius:10px;border:1.5px solid #6a4fb0;background:#07040f;color:#fff;padding:9px 11px;font-size:14px;font-family:inherit}' +
        '.mus-msg{min-height:18px;font-size:13px;font-weight:700}.mus-hint{font-size:12px;opacity:.65;line-height:1.35}' +
        '.mus-now,.mus-q{background:rgba(255,255,255,.05);border-radius:12px;padding:10px}.mus-q{flex:1;overflow-y:auto}.mus-lab{font-size:11px;font-weight:800;letter-spacing:.12em;color:#b98cff;margin-bottom:6px}' +
        '.mus-it{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}.mus-it:first-of-type{border-top:0}.mus-it img{width:64px;height:36px;object-fit:cover;border-radius:6px;background:#000;flex:none}' +
        '.mus-it div{min-width:0;flex:1;font-size:13px;font-weight:700;line-height:1.25}.mus-it small{display:block;font-size:11px;color:#ffd36a;font-weight:700}.mus-it span.t{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.mus-it button{padding:5px 9px;font-size:12px;flex:none}.mus-res{flex:1;overflow-y:auto;background:rgba(255,255,255,.05);border-radius:12px;padding:10px}.mus-res .mus-lab{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mus-res .mus-lab button{padding:4px 8px;font-size:11px}' +
        '.mus-stand{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6}.mus-stand button{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1.5px solid #b98cff;border-radius:12px;font-weight:800;font-size:13px;padding:10px 16px}.mus-stand kbd{opacity:.6;font-size:11px;margin-left:6px}' +
        '.mus-sound{position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:6;background:rgba(12,6,24,.92);border:1.5px solid #ffd36a;color:#ffe9a8;border-radius:12px;padding:8px 14px;font-weight:800;font-size:13px;pointer-events:none}';
      document.head.appendChild(st);
    }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
    function isMod() { try { var r = typeof roleOf === 'function' ? roleOf({ username: F.me() }) : null; return !!r && /patron|fondateur|staff/i.test(String(r[1] || '')); } catch (e) { return false; } }
    function setMsg(t, col) { if (!desk) return; var el = desk.el.querySelector('.mus-msg'); el.textContent = t || ''; el.style.color = col || '#d9cbff'; }
    function renderDesk() {
      if (!desk) return;
      var st = net.state, cur = st && st.cur, q = (st && st.queue) || [], me = F.me(), mod = isMod();
      var now = srvNow(), pos = cur ? Math.max(0, (now - cur.startedAt) / 1000) : 0;
      function item(it, canDo, a) { return '<div class="mus-it"><img src="https://i.ytimg.com/vi/' + esc(it.videoId) + '/default.jpg" alt=""><div><span class="t">' + esc(it.title) + '</span><small>par ' + esc(it.by) + '</small></div>' + (canDo ? '<button class="red" data-a="' + a + '" data-id="' + esc(it.id) + '">' + (a === 'skip' ? '⏭ Passer' : '✕') + '</button>' : '') + '</div>'; }
      desk.el.querySelector('.mus-now').innerHTML = '<div class="mus-lab">EN COURS</div>' + (cur ? item(cur, true, 'skip') + '<div class="mus-hint">' + fmtT(pos) + ' / ' + fmtT(cur.dur) + '</div>' : '<div class="mus-hint">Rien pour l\'instant : le premier titre ajouté démarre tout de suite.</div>');
      desk.el.querySelector('.mus-q').innerHTML = '<div class="mus-lab">FILE D\'ATTENTE' + (q.length ? ' · ' + q.length : '') + '</div>' + (q.length ? q.map(function (it) { return item(it, mod || String(it.by).toLowerCase() === me, 'remove'); }).join('') : '<div class="mus-hint">La file est vide.</div>');
    }
    function parseVideoId(raw) {
      var s2 = String(raw || '').trim(), id = '';
      if (/^[A-Za-z0-9_-]{11}$/.test(s2)) return s2;
      try {
        var u = new URL(/^https?:\/\//i.test(s2) ? s2 : 'https://' + s2), h = u.hostname.replace(/^(www|m|music)\./, '');
        if (h === 'youtu.be') id = u.pathname.slice(1, 12);
        else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = u.searchParams.get('v') || ((u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/) || [])[1] || '');
      } catch (e) { /* pas un lien */ }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }
    // vérifie le clip avec un lecteur caché (existe, peut être joué ici) et en lit le titre et la durée
    function probe(videoId, done) {
      loadYtApi(function () {
        var host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:113px;opacity:0;pointer-events:none';
        var inner = document.createElement('div'); host.appendChild(inner); document.body.appendChild(host);
        var p = null, fin = false, tries = 0, tm = 0;
        function end(err, info) { if (fin) return; fin = true; clearInterval(tm); try { if (p) p.destroy(); } catch (e) { /* ok */ } if (host.parentNode) host.parentNode.removeChild(host); done(err, info); }
        try {
          p = new YT.Player(inner, { width: 200, height: 113, videoId: videoId, playerVars: ytVars(), events: {
            onReady: function () { tm = setInterval(function () { tries++; var d = 0, t = ''; try { d = p.getDuration(); t = (p.getVideoData() || {}).title || ''; } catch (e) { /* ok */ } if (d > 0 && t) end(null, { dur: Math.round(d), title: t }); else if (tries > 30) end(d > 0 ? null : 'Durée introuvable (directs non acceptés).', { dur: Math.round(d), title: t || 'Sans titre' }); }, 300); },
            onError: function (e) { end(e.data === 100 ? 'Clip introuvable ou privé.' : (e.data === 101 || e.data === 150) ? 'Ce clip ne peut pas être lu ici (intégration bloquée par son auteur).' : 'Lien YouTube invalide.'); }
          } });
        } catch (e) { end('YouTube est indisponible pour le moment.'); }
        setTimeout(function () { end('YouTube ne répond pas, réessaie.'); }, 14000);
      });
    }
    var adding = false;
    function fmtDur(n) { return fmtT(n); }
    function showQueue() { if (!desk) return; desk.results = null; desk.tracks = null; desk.el.querySelector('.mus-res').style.display = 'none'; desk.el.querySelector('.mus-now').style.display = ''; desk.el.querySelector('.mus-q').style.display = ''; }
    function showResults(head, html) {
      var box = desk.el.querySelector('.mus-res'); box.style.display = ''; desk.el.querySelector('.mus-now').style.display = 'none'; desk.el.querySelector('.mus-q').style.display = 'none';
      box.innerHTML = '<div class="mus-lab"><button data-a="back">← File d\'attente</button> ' + esc(head) + '</div>' + html; box.scrollTop = 0;
    }
    function resultRow(r, i) {
      return '<div class="mus-it"><img src="https://i.ytimg.com/vi/' + esc(r.videoId) + '/default.jpg" alt=""><div><span class="t">' + esc(r.title) + '</span><small>' + esc(r.by) + ' · ' + fmtDur(r.dur) + '</small></div><button data-a="pick" data-i="' + i + '">＋ Ajouter</button></div>';
    }
    // vérifie le clip (il doit pouvoir être lu ici) puis l'ajoute à la file ; done(true) si ajouté
    function addVideo(id, done) {
      adding = true; setMsg('Vérification du clip…', '#d9cbff');
      probe(id, function (err, info) {
        if (err || !info) { adding = false; setMsg(err || 'Clip inutilisable.', '#ff8a80'); if (done) done(false); return; }
        apiPost({ action: 'add', videoId: id, title: info.title, dur: info.dur }).then(function (r) {
          adding = false;
          if (r && r.ok) {
            adopt(r); syncClip();
            if (desk) { desk.el.querySelector('input').value = ''; showQueue(); setMsg(r.playing ? '▶ C\'est parti : ton clip passe maintenant !' : '✅ Ajouté : position ' + r.position + ' dans la file.', '#7ee0a0'); }
            if (done) done(true);
          } else { setMsg((r && r.error) || 'Ajout impossible.', '#ff8a80'); if (done) done(false); }
        });
      });
    }
    // titre Spotify : on cherche sa version YouTube et on essaie les meilleurs résultats jusqu'à en trouver un qui se lit ici
    function addSpotifyTrack(t) {
      if (adding) return; adding = true; setMsg('Recherche de « ' + t.title + ' »…', '#d9cbff');
      apiPost({ action: 'search', q: (t.artist + ' ' + t.title).trim() }).then(function (r) {
        adding = false;
        if (!r || !r.ok || !r.results || !r.results.length) { setMsg((r && r.error) || 'Aucun clip trouvé pour ce titre.', '#ff8a80'); return; }
        var list = r.results.slice(0, 3), k = 0;
        (function next() {
          if (k >= list.length) { setMsg('Aucune version lisible ici pour ce titre : cherche-le par son nom.', '#ff8a80'); return; }
          var item = list[k++]; addVideo(item.videoId, function (ok) { if (!ok && desk) next(); });
        })();
      });
    }
    function go() {
      if (!desk || adding) return;
      var inp = desk.el.querySelector('input'), raw = inp.value.trim(), id = parseVideoId(raw);
      if (!F.token()) { setMsg('🔒 Connecte-toi pour ajouter une musique.', '#ff8a80'); return; }
      if (raw.length < 2) { setMsg('Écris un titre, un artiste, ou colle un lien YouTube / Spotify.', '#ff8a80'); return; }
      if (id) { addVideo(id); return; }
      adding = true; setMsg('Recherche…', '#d9cbff');
      apiPost({ action: 'search', q: raw }).then(function (r) {
        adding = false; if (!desk) return;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Recherche impossible.', '#ff8a80'); return; }
        setMsg('', '');
        if (r.tracks) {                                                   // album / playlist / artiste Spotify : on choisit les titres
          desk.tracks = r.tracks;
          showResults('Spotify · ' + (r.spotify.name || r.spotify.type) + ' (' + r.tracks.length + ' titres)', r.tracks.map(function (t, i) { return '<div class="mus-it"><div><span class="t">' + esc(t.title) + '</span><small>' + esc(t.artist) + '</small></div><button data-a="sp" data-i="' + i + '">＋ Ajouter</button></div>'; }).join(''));
        } else {
          desk.results = r.results || [];
          if (!desk.results.length) { showResults('Aucun résultat', '<div class="mus-hint">Rien trouvé : essaie avec le nom de l\'artiste et du titre.</div>'); return; }
          showResults(r.spotify ? 'Spotify · ' + r.spotify.title + ' — ' + r.spotify.artist : 'Résultats pour « ' + raw + ' »', desk.results.map(resultRow).join(''));
        }
      });
    }
    function onDeskEsc(e) { if (e.code === 'Escape' && desk) { e.stopImmediatePropagation(); e.preventDefault(); closeDesk(); } }
    function openDesk(w) {
      if (desk || seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      injectCss(); w.sitDown(room);
      var el = document.createElement('div'); el.className = 'mus-ov';
      el.innerHTML = '<div class="mus-h"><span>🎵 JUKEBOX</span><button data-a="close">Fermer ✕</button></div>' +
        '<div class="mus-add"><input type="text" maxlength="200" placeholder="Titre, artiste, lien YouTube ou Spotify…" autocomplete="off" spellcheck="false"><button data-a="go">Chercher</button></div>' +
        '<div class="mus-msg"></div><div class="mus-res" style="display:none"></div><div class="mus-now"></div><div class="mus-q"></div>' +
        '<div class="mus-hint">Tape le nom d\'une chanson, ou colle un lien YouTube ou Spotify (titre, album, playlist). Le clip passe sur le grand écran, avec le son, pour tous ceux qui sont dans la salle. 3 titres maximum par personne dans la file.</div>';
      w.container.appendChild(el); desk = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var a = b.dataset.a;
        if (a === 'close') closeDesk();
        else if (a === 'go') go();
        else if (a === 'back') showQueue();
        else if (a === 'pick' && desk.results && !adding) addVideo(desk.results[+b.dataset.i].videoId);
        else if (a === 'sp' && desk.tracks) addSpotifyTrack(desk.tracks[+b.dataset.i]);
        else if (a === 'skip' || a === 'remove') { b.disabled = true; apiPost({ action: a, id: b.dataset.id }).then(function (r) { if (r && r.ok) { adopt(r); syncClip(); setMsg(a === 'skip' ? '⏭ Titre passé.' : 'Titre retiré.', '#7ee0a0'); } else { b.disabled = false; setMsg((r && r.error) || 'Impossible.', '#ff8a80'); } }); }
      });
      el.querySelector('input').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') go(); });
      window.addEventListener('keydown', onDeskEsc, true);
      renderDesk(); poll(); setMsg(F.token() ? '' : '🔒 Connecte-toi pour ajouter une musique.', '#ff8a80');
      if (!w.touch) setTimeout(function () { try { el.querySelector('input').focus(); } catch (e) { /* ok */ } }, 400);
    }
    function closeDesk(instant) {
      if (!desk) return;
      window.removeEventListener('keydown', onDeskEsc, true);
      if (desk.el.parentNode) desk.el.parentNode.removeChild(desk.el);
      desk = null; adding = false;
      world.mode = 'room';
      if (instant) { world.blend = 0; world.seatRoom = null; }
    }
    // le PC : touche F ou clic sur l'écran du PC
    room.interactables.push({
      x: PCX, z: PCZ, radius: 2.8, hit: pcScreen,
      prompt: function () { return '🎵 Ajouter une musique — PC du jukebox  [F]'; },
      use: function (w) { if (Math.hypot(w.player.x - PCX, w.player.z - PCZ) > 6) { w.flash('Approche-toi du PC.'); return; } openDesk(w); }
    });

    /* --- s'asseoir dans un fauteuil --- */
    function seatTaken(s) {
      var now = performance.now();
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; });
    }
    function onSeatKey(e) { if (seat && (e.code === 'Escape' || e.code === 'KeyF')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); } }
    function sit(w, s) {
      if (seat || desk || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (Math.hypot(w.player.x - s.x, w.player.z - s.z) > 6) { w.flash('Approche-toi du fauteuil.'); return; }       // clic de loin : trop loin pour s\'asseoir
      if (seatTaken(s)) { w.flash('Ce fauteuil est occupé.'); return; }
      injectCss(); w.sitDown(room); seat = s; view.yaw = view.pitch = 0;
      standEl = document.createElement('div'); standEl.className = 'mus-stand'; standEl.innerHTML = '<button>🛋️ Se lever <kbd>Échap</kbd></button>';
      standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
    }
    function stand() {
      if (!seat) return;
      var s = seat; seat = null;
      window.removeEventListener('keydown', onSeatKey, true);
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    var chairHitGeo = new THREE.BoxGeometry(0.95, 1.0, 0.95), chairHitMat = new THREE.MeshBasicMaterial({ visible: false });
    seats.forEach(function (s) {
      var hm = new THREE.Mesh(chairHitGeo, chairHitMat); hm.position.set(s.x, 0.5, s.z); hm.rotation.y = -s.yaw; g.add(hm);     // zone de clic invisible : clic gauche sur le fauteuil pour s'asseoir
      room.interactables.push({
        x: s.x, z: s.z, radius: 1.35, hit: hm,
        enabled: function () { return !seat && !desk; },
        prompt: function () { return seatTaken(s) ? '🛋️ Fauteuil occupé' : '🛋️ S\'asseoir dans le fauteuil  [F] ou clic'; },
        use: function (w) { sit(w, s); }
      });
    });
    room.forceStand = function () { if (desk) closeDesk(true); else stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: -0.12, z: 0.28 };                                  // assise à 0,38 m
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-1.2, Math.min(1.2, drag.seat.yaw - dx * 0.006)); if (drag.mouse) view.pitch = Math.max(-0.4, Math.min(0.5, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      if (!seat) return { cx: PCX, cy: 1.65, cz: PCZ + 3.0, tx: PCX, ty: 1.15, tz: PCZ, fov: 56 };      // devant le PC
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.3; }
      var ex = seat.x, ey = 1.12, ez = seat.z, a = Math.atan2(0 - ex, -(SZ - ez)) + view.yaw, p = Math.atan2(SCY - ey, Math.hypot(ex, SZ - ez)) - 0.04 + view.pitch;   // on regarde le centre de l'écran
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 8, ty: ey + Math.sin(p) * 8, tz: ez - Math.cos(a) * Math.cos(p) * 8, fov: 64 };
    };

    /* --- cycle de vie : le jukebox ne tourne que quand on est dans la salle (et que le jeu n'est pas en pause) --- */
    function jukeStart(w) {
      W = w; active = true; paused = false; lastUpd = performance.now();
      if (!w.renderer.__musHook) {                                          // le lecteur se place juste après le rendu de chaque image (caméra à jour : pas de décalage)
        var orig = w.renderer.render.bind(w.renderer); w.renderer.__musHook = true;
        w.renderer.render = function (a, b) { orig(a, b); try { placeOverlay(w); } catch (e) { /* ok */ } };
      }
      buildOverlay(w); injectCss();
      timers.push(setInterval(poll, 2500), setInterval(syncClip, 400), setInterval(function () {
        if (active && !paused && performance.now() - lastUpd > 1500) { paused = true; stopClip(); if (F.audio && F.audio.setDuck) F.audio.setDuck(1); }   // le monde est en pause (menu, autre page) : on coupe le son
        drawPc();
      }, 1000));
      window.addEventListener('pointerdown', onUserGesture, true); window.addEventListener('keydown', onUserGesture, true);
      poll();
    }
    function jukeStop() {
      active = false; timers.forEach(clearInterval); timers = [];
      window.removeEventListener('pointerdown', onUserGesture, true); window.removeEventListener('keydown', onUserGesture, true);
      stopClip(); destroyOverlay();
      if (F.audio && F.audio.setDuck) F.audio.setDuck(1);
      clip.on = false;
    }
    room.onEnter = function (w) { jukeStart(w); };
    room.onLeave = function () { closeDesk(true); stand(); jukeStop(); };
    room.onPause = function () { paused = true; stopClip(); if (F.audio && F.audio.setDuck) F.audio.setDuck(1); };
    room.onResume = function () { paused = false; lastUpd = performance.now(); poll(); };
    var scrT = 0, lastVer = -1, noSoundT = 0;
    function jukeUpdate(dt) {
      lastUpd = performance.now();
      if (paused && active) { paused = false; poll(); }
      scrT -= dt;
      if (scrT <= 0 || lastVer !== net.ver) { lastVer = net.ver; scrT = yt.showing ? 0.5 : 0.09; drawScreen(); }
    }

    /* ---------- boule à facettes et bandeaux lumineux aux murs ---------- */
    // la boule : un noyau sombre recouvert de vraies facettes (petits carrés lumineux, chacun sa couleur qui suit la musique) ;
    // de chaque facette tournée vers le bas part un faisceau, dans la direction exacte de la facette : il tourne et change de couleur avec elle
    var BR = 0.8, ball = new THREE.Group(); ball.position.set(0, H - 1.6, 0); g.add(ball);
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(BR * 0.97, 24, 16), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.3, metalness: 0.9 })));
    var facets = [], NR = low ? 9 : 14, NSEG = low ? 14 : 22;
    for (i = 0; i < NR; i++) {
      var lat = -Math.PI / 2 + (i + 0.5) / NR * Math.PI, nseg = Math.max(4, Math.round(NSEG * Math.cos(lat)));
      for (var jj = 0; jj < nseg; jj++) {
        var lon = (jj + (i % 2) * 0.5) / nseg * TAU;
        facets.push({ n: new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), ph: Math.random() * TAU, sz: Math.min(TAU * BR * Math.cos(lat) / nseg, Math.PI * BR / NR) * 0.88 });
      }
    }
    var facetMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), facets.length);
    var fq = new THREE.Quaternion(), fm = new THREE.Matrix4(), fpos = new THREE.Vector3(), fsc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    facets.forEach(function (f, k) {
      fq.setFromUnitVectors(zAxis, f.n); fpos.copy(f.n).multiplyScalar(BR); fsc.set(f.sz, f.sz, 1); fm.compose(fpos, fq, fsc); facetMesh.setMatrixAt(k, fm); facetMesh.setColorAt(k, new THREE.Color(0xffffff));
    });
    facetMesh.frustumCulled = false; ball.add(facetMesh);
    function facetHue(k) { return clock * 0.05 + ((k * 0.618034) % 1) * 0.85; }
    var BVS = 'varying float vT; varying vec3 vN; varying vec3 vV; void main() { vT = clamp(-position.y / 11.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
    var BFS = 'uniform vec3 uColor; uniform float uOp; varying float vT; varying vec3 vN; varying vec3 vV; void main() { float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float g = pow(1.0 - vT, 1.3) * smoothstep(0.0, 0.03, vT); gl_FragColor = vec4(uColor, e * g * uOp); }';
    var beamMats = [], beamFacets = [], beamGeo = new THREE.CylinderGeometry(0.015, 0.34, 11, 14, 1, true); beamGeo.translate(0, -5.5, 0);
    var down = new THREE.Vector3(0, -1, 0), cand = [];
    facets.forEach(function (f, k) { if (f.n.y < -0.05 && f.n.y > -0.85) cand.push(k); });
    var NBEAM = Math.min(cand.length, low ? 10 : 24);
    for (i = 0; i < NBEAM; i++) {
      var fk = cand[Math.floor(i * cand.length / NBEAM)], bm = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0xb98cff) }, uOp: { value: 0.6 } }, vertexShader: BVS, fragmentShader: BFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      var bmesh = new THREE.Mesh(beamGeo, bm); bmesh.position.copy(facets[fk].n).multiplyScalar(BR); bmesh.quaternion.setFromUnitVectors(down, facets[fk].n); bmesh.frustumCulled = false;
      ball.add(bmesh); beamMats.push(bm); beamFacets.push(fk);
    }
    var chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), gold); chain.position.set(0, H - 0.6, 0); g.add(chain);
    /* ---------- LED des murs : bandeaux en haut et en bas, barres verticales ; chacune suit une bande de la musique ---------- */
    var ledList = [];
    function addLed(x, y, z, sx, sy, sz, band, ph) { ledList.push({ x: x, y: y, z: z, sx: sx, sy: sy, sz: sz, band: band, ph: ph }); }
    (function () {
      var n, x, z, sd, bd, LT = H - 0.55, LB = 1.3;
      for (n = 0; n < 23; n++) {
        x = -11.5 + n; z = -11.5 + n; bd = Math.floor(n / 23 * NB);
        if (Math.abs(x) > 7.6) { addLed(x, LT, -HZ + 0.07, 0.86, 0.1, 0.06, bd, n); addLed(x, LB, -HZ + 0.07, 0.86, 0.1, 0.06, (bd + 5) % NB, n + 3); }   // mur du fond : pas devant l'écran ni la bande d'égaliseur
        addLed(x, LT, HZ - 0.07, 0.86, 0.1, 0.06, (NB - 1 - bd), n);
        if (Math.abs(x) > 2.6) addLed(x, LB, HZ - 0.07, 0.86, 0.1, 0.06, (NB - 1 - bd + 5) % NB, n + 3);                                                // mur de la porte : pas devant la porte
        [-1, 1].forEach(function (s2) { addLed(s2 * (HX - 0.07), LT, z, 0.06, 0.1, 0.86, (bd + (s2 > 0 ? 8 : 0)) % NB, n); addLed(s2 * (HX - 0.07), LB, z, 0.06, 0.1, 0.86, (bd + 5 + (s2 > 0 ? 8 : 0)) % NB, n + 3); });
      }
      for (n = 0; n < 12; n++) [-1, 1].forEach(function (s2) { addLed(s2 * (HX - 0.07), 4.3, -10.2 + n * 1.85, 0.08, 3.0, 0.22, (n * 3 + (s2 > 0 ? 1 : 0)) % NB, n * 0.7); });   // barres sur les murs de côté
      for (n = 0; n < 5; n++) [-1, 1].forEach(function (s2) { addLed(s2 * (3.9 + n * 1.5), 3.9, HZ - 0.07, 0.22, 3.0, 0.08, (n * 3 + 2) % NB, n * 0.9); });                  // de chaque côté de l'enseigne et de la porte
      for (n = 0; n < 3; n++) [-1, 1].forEach(function (s2) { addLed(s2 * (8.0 + n * 1.4), 4.3, -HZ + 0.07, 0.22, 3.0, 0.08, (n * 5 + 1) % NB, n * 0.9); });               // et de chaque côté de l'écran
    })();
    var ledMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), ledList.length), ledCol = new THREE.Color();
    // halo : une copie plus épaisse en lumière additive autour de chaque LED (elle brille, la lumière déborde sur le mur)
    var ledGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), ledList.length);
    (function () {
      var m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc3 = new THREE.Vector3();
      function thick(d) { return d < 0.3 ? d * 1.7 : d; }
      function halo(d) { return d < 0.3 ? d + 0.34 : d; }
      ledList.forEach(function (l, n) {
        m.compose(v.set(l.x, l.y, l.z), q, sc3.set(thick(l.sx), thick(l.sy), thick(l.sz))); ledMesh.setMatrixAt(n, m); ledMesh.setColorAt(n, ledCol.setHex(0x000000));
        m.compose(v.set(l.x, l.y, l.z), q, sc3.set(halo(l.sx), halo(l.sy), halo(l.sz))); ledGlow.setMatrixAt(n, m); ledGlow.setColorAt(n, ledCol.setHex(0x000000));
      });
      ledMesh.frustumCulled = false; ledGlow.frustumCulled = false; g.add(ledMesh); g.add(ledGlow);
    })();
    function updateLeds() {
      var on = 1 - sil, nL = ledList.length, n;                              // sans musique : tout est éteint
      for (n = 0; n < nL; n++) {
        var l = ledList[n], lv = Math.max(0, Math.min(1, sm[l.band] * 1.35 * (0.75 + 0.25 * Math.sin(clock * 4 + l.ph)))) * on, hu = ((clock * 0.05 + n / nL * 0.9) % 1 + 1) % 1;
        ledCol.setHSL(hu, 1, 0.5).multiplyScalar(0.04 + 2.1 * lv);       // couleur pleine, poussée au-delà du blanc quand le son est fort
        ledMesh.setColorAt(n, ledCol);
        ledCol.setHSL(hu, 1, 0.5).multiplyScalar(1.4 * lv * lv);          // halo : seulement sur les temps forts
        ledGlow.setColorAt(n, ledCol);
      }
      ledMesh.instanceColor.needsUpdate = true; ledGlow.instanceColor.needsUpdate = true;
    }

    /* ---------- éclairage ---------- */
    g.add(new THREE.AmbientLight(0x8f7fc0, 0.75));
    var haloTex = (function () { var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c); })();
    var key = new THREE.DirectionalLight(0xf0e6ff, 0.35); key.position.set(3, 7, 6); g.add(key);
    var spotA = null, spotB = null;
    if (!low) {
      spotA = new THREE.PointLight(0xb98cff, 1.1, 16); spotA.position.set(-6, 5, 0); g.add(spotA);
      spotB = new THREE.PointLight(0x6ad0ff, 1.1, 16); spotB.position.set(6, 5, 0); g.add(spotB);
    }

    // porte de retour vers le hall
    world.addDoor(room, { x: 0, z: HZ - 0.02, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xb98cff, target: 'hall', theme: 'exitMusique', noSill: true });
    var doorLamps = [];
    [-1, 1].forEach(function (sd) {
      var lx = sd * 1.85, lz = HZ - 0.45;
      var lg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.08, 16), gold); lg.position.set(lx, 0.04, lz); g.add(lg);
      var lp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.3, 10), gold); lp.position.set(lx, 0.72, lz); g.add(lp);
      var lm = new THREE.MeshBasicMaterial({ color: 0xb98cff }), lb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), lm); lb.position.set(lx, 1.5, lz); g.add(lb);
      var lc = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.15, 16), gold); lc.position.set(lx, 1.72, lz); g.add(lc);
      var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xb98cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(1.6, 1.6, 1); halo.position.set(lx, 1.5, lz); g.add(halo);
      doorLamps.push({ m: lm, h: halo, i: sd > 0 ? 1 : 0 });
    });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · touche le PC au centre pour ajouter un clip · touche un fauteuil pour t\'asseoir'
        : 'ZQSD / flèches : marcher · Maj : courir · F ou clic sur le PC du milieu : chercher et ajouter un clip · F ou clic sur un fauteuil : t\'asseoir' + (w.full ? ' · Échap : quitter' : ' · clique-glisse : regarder');
    };

    /* ---------- vie de la salle : tout suit les niveaux de la musique ---------- */
    var bands = new Array(NB), sm = new Array(NB), pk = 0.05, sil = 1, clock = 0, frame2 = 0, bass = 0;
    for (i = 0; i < NB; i++) { bands[i] = 0; sm[i] = 0; }
    var c1 = new THREE.Color(), c2 = new THREE.Color(), cLight = new THREE.Color(0xd9d2c5), cDark = new THREE.Color(0x25202a);
    function neon(h, l, out) { return out.setHSL(((h % 1) + 1) % 1, 1, l); }
    room.update = function (dt) {
      clock += dt; jukeUpdate(dt); var hue0 = clock * 0.05;
      // niveaux : lus sur la musique (F.audio.levels) ; sans son, une vague lente qui garde le sol vivant
      var raw = 0, mx = 0;
      if (clip.on) {                                                       // un clip YouTube joue : son impossible à analyser ; on simule un rythme, calé sur la position dans le titre (donc identique chez tous)
        var cs = net.state && net.state.cur, tpos = cs ? Math.max(0, (srvNow() - cs.startedAt) / 1000) : clock, hs = 0;
        if (cs) for (i = 0; i < cs.videoId.length; i++) hs += cs.videoId.charCodeAt(i) * (i + 1);
        var ph = tpos * (88 + hs % 52) / 60;                               // tempo propre au clip : 88 à 139 pulsations par minute
        var kick = Math.pow(Math.max(0, Math.cos(ph * TAU)), 8), hat = Math.pow(Math.max(0, Math.cos((ph * 2 + 0.5) * TAU)), 10), snare = Math.pow(Math.max(0, Math.cos((ph * 0.5 + 0.25) * TAU)), 10);
        for (i = 0; i < NB; i++) {
          var fi = i / NB, wob = 0.5 + 0.5 * Math.sin(tpos * (1.3 + i * 0.37) + i * 2.1);
          bands[i] = Math.max(0, Math.min(1, fi < 0.25 ? 0.06 + 0.95 * kick * (1 - fi) : fi < 0.6 ? 0.08 + 0.55 * wob * (0.4 + 0.6 * snare) + 0.3 * kick : 0.05 + 0.7 * hat * (0.5 + 0.5 * wob) + 0.25 * snare));
        }
        raw = 0.3;
      } else raw = F.audio && F.audio.levels ? F.audio.levels(bands, NB) : 0;
      for (i = 0; i < NB; i++) if (bands[i] > mx) mx = bands[i];
      pk = Math.max(pk * 0.997, mx, 0.03);                                 // réglage automatique : le volume du joueur ne change pas l'effet
      var playing = raw > 0.012;
      sil += ((playing ? 0 : 1) - sil) * Math.min(1, dt * 1.5);
      for (i = 0; i < NB; i++) {
        var tgt = playing ? Math.min(1, bands[i] / pk) : 0;
        var idle = 0.16 + 0.12 * Math.sin(clock * 1.2 - i * 0.55);
        var v = tgt * (1 - sil) + idle * sil;
        sm[i] += (v - sm[i]) * Math.min(1, dt * (v > sm[i] ? 18 : 6));      // montée vive, descente douce
      }
      bass = (sm[0] + sm[1] + sm[2]) / 3;
      // une image sur deux : le sol (jusqu'à 576 dalles) n'a pas besoin d'être plus fluide
      frame2++;
      if (frame2 % 2 === 0) {
        for (k = 0; k < N; k++) {
          var t = tiles[k], lv = sm[t.band] * (0.8 + 0.35 * Math.sin(clock * 2.1 + t.d * 0.7 - t.ang * 2));   // petite onde qui part du centre
          lv = Math.max(0, Math.min(1, lv));
          neon(hue0 + t.band / NB * 0.85 + t.d * 0.02 + (t.kind ? 0.08 : 0), 0.5, c1);
          (t.kind ? glowB : glowA).setColorAt(t.k2, c2.copy(c1).multiplyScalar(0.02 + lv * (0.25 + 1.5 * (1 - sil))));
          glass.setColorAt(k, c2.copy(c1).multiplyScalar(0.03 + lv * (0.05 + 0.4 * (1 - sil))));
        }
        glowA.instanceColor.needsUpdate = true; glowB.instanceColor.needsUpdate = true; glass.instanceColor.needsUpdate = true;
      }
      // mur d'égaliseur
      for (i = 0; i < NBAR; i++) {
        var b = sm[Math.min(NB - 1, Math.floor(i / NBAR * NB))], hh = 0.1 + b * 1.25;
        bars[i].scale.y = hh; bars[i].position.y = 0.3 + hh / 2;
        neon(hue0b(i), 0.45 + b * 0.2, barMat[i].color);
      }
      function hue0b(n) { return clock * 0.05 + n / NBAR * 0.85; }
      // enceintes, boule, bandeaux
      var pulse = 1 + bass * 0.22;
      woofers.forEach(function (w) { w.m.scale.set(1, 1, 1 + (w.big ? bass : sm[8]) * 0.8); w.m.position.z = w.z + (w.big ? bass : sm[8]) * 0.03; });
      ball.rotation.y += dt * 0.5; ball.scale.setScalar(pulse * 0.97);                         // facettes et faisceaux sont dans le même groupe : ils tournent d'un seul bloc
      var fcol = ball._fc || (ball._fc = new THREE.Color()), nf = facets.length, k2;
      for (k2 = 0; k2 < nf; k2++) { var tw = 0.5 + 0.5 * Math.sin(clock * 3.2 + facets[k2].ph); neon(facetHue(k2), 0.22 + 0.3 * Math.min(1, tw * (0.5 + bass * 0.9 + sm[(k2 * 3) % NB] * 0.8)), fcol); facetMesh.setColorAt(k2, fcol); }
      beamMats.forEach(function (bm, n) { neon(facetHue(beamFacets[n]), 0.55, bm.uniforms.uColor.value); var bl = sm[(n * 5 + 2) % NB]; bm.uniforms.uOp.value = (1 - sil) * 1.5 * Math.pow(Math.max(0, bl - 0.28) / 0.72, 1.3); neon(facetHue(beamFacets[n]), 0.75, fcol); facetMesh.setColorAt(beamFacets[n], fcol); });
      if (facetMesh.instanceColor) facetMesh.instanceColor.needsUpdate = true;
      if (frame2 % 2 === 1) updateLeds();
            doorLamps.forEach(function (l) {                                                   // les lampes de la porte suivent la musique, une de chaque côté
        var lv = sm[l.i ? 5 : 2], mm = hue0b(l.i * 8 + 3);
        neon(mm, 0.35 + lv * 0.3, l.m.color); l.h.material.color.copy(l.m.color); l.h.material.opacity = 0.35 + lv * 0.65; l.h.scale.setScalar(1.2 + lv * 1.3);
      });
      if (spotA) {
        spotA.color.setHSL((hue0 + 0.0) % 1, 1, 0.55); spotB.color.setHSL((hue0 + 0.5) % 1, 1, 0.55);
        spotA.position.set(-6 * Math.cos(clock * 0.6), 5, 6 * Math.sin(clock * 0.6)); spotB.position.set(6 * Math.cos(clock * 0.6), 5, -6 * Math.sin(clock * 0.6));
        spotA.intensity = 0.2 + (1 - sil) * bass * 1.8; spotB.intensity = 0.2 + (1 - sil) * bass * 1.8;
      }
    };
    room.dispose = function () { closeDesk(true); jukeStop(); glowGeo.dispose(); glassGeo.dispose(); glowA.dispose(); glowB.dispose(); glass.dispose(); };
    drawScreen(); drawPc();
    return room;
  }
  F.registerRoom('musique', createMusicRoom);
})();
