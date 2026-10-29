/* =====================================================================
   slots3d.js — Borne de machine à sous 3D « Les Flambeurs » (Three.js r128)
   ---------------------------------------------------------------------
   - createSlotCabinet(opts)  : fabrique UNE borne (réutilisable : position, rotation, qualité).
   - SlotsExperience          : une scène avec une borne, caméra, boutons (étape 1, solo).
   - window.Slots3D           : seule chose exposée (open/close/onSpinStart/onResult/onError).
   Tout le reste est privé (IIFE) : aucun nom global ne peut écraser ceux du gros script de la page.
   Les symboles, les gains et le solde restent gérés par le jeu existant (pullSlotLever + serveur) :
   ce fichier ne fait que MONTRER le tirage que le serveur a déjà décidé.
   ===================================================================== */
(function () {
  'use strict';

  var SYMS = ['🔥', '👑', '7️⃣', '💎', '🔔', '🍋', '🍒'];
  var EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  var SERIF = '"Cinzel",Georgia,serif';
  var MONO = '"Orbitron","JetBrains Mono",monospace';
  var TAU = Math.PI * 2;
  var BET_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  // Habillages de la boutique -> couleur des garnitures de la borne 3D
  var SKINS = { '': 0xc9a227, 'cab-neon': 0x35d4ff, 'cab-emerald': 0x20c585, 'cab-gold': 0xffd24a };
  // Niveaux de fête selon le multiplicateur de gain
  var PARTY = [
    { dur: 2.0, coins: 0, sparks: 24, shake: 0.0, rate: 0, title: 'GAGNÉ' },
    { dur: 3.5, coins: 25, sparks: 60, shake: 0.0015, rate: 14, title: 'BEAU GAIN' },
    { dur: 6.0, coins: 60, sparks: 110, shake: 0.004, rate: 24, title: 'GROS GAIN' },
    { dur: 9.0, coins: 100, sparks: 160, shake: 0.008, rate: 38, title: 'SUPER GAIN' },
    { dur: 14.0, coins: 170, sparks: 220, shake: 0.014, rate: 60, title: 'JACKPOT' }
  ];

  function fmtN(n) { return Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' '); }
  function levelFor(mult) { return mult >= 100 ? 4 : mult >= 30 ? 3 : mult >= 12 ? 2 : mult >= 3 ? 1 : 0; }
  function isMobile() {
    try { return window.matchMedia('(max-width: 767px)').matches || /Mobi|Android|iPhone/i.test(navigator.userAgent); } catch (e) { return false; }
  }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function mkTex(c) {
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function hash(i, k, salt) {
    var h = (Math.imul(k + 7919 * (i + 1) + salt * 131, 2654435761) ^ Math.imul(k * 31 + salt, 40503)) >>> 0;
    return SYMS[Math.floor(h / 4294967296 * SYMS.length)];
  }

  /* ===================================================================
     UNE BORNE  —  createSlotCabinet({ position, rotationY, low, lights })
     Origine = centre du sol, la façade regarde vers +Z.
     =================================================================== */
  function createSlotCabinet(opts) {
    opts = opts || {};
    var low = opts.low !== undefined ? !!opts.low : isMobile();
    var group = new THREE.Group();
    group.name = 'slotCabinet';
    if (opts.position) group.position.copy(opts.position);
    group.rotation.y = opts.rotationY || 0;
    var disposables = [];
    function track(o) { disposables.push(o); return o; }

    /* ---------- matières ---------- */
    var matBody = track(new THREE.MeshStandardMaterial({ color: 0x2a2038, roughness: 0.5, metalness: 0.3 }));
    var matTrim = track(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.6, emissive: 0x2a1d00 }));
    var matDark = track(new THREE.MeshStandardMaterial({ color: 0x050408, roughness: 0.7, metalness: 0.2 }));
    var matSeat = track(new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.55, metalness: 0.1 }));

    /* ---------- corps en forme de lyre ---------- */
    var outer = [[0.55, 0], [0.72, 0.5], [0.88, 1.2], [0.93, 1.9], [0.86, 2.5], [0.72, 2.85]];
    var outerCurve = new THREE.CatmullRomCurve3(outer.map(function (p) { return new THREE.Vector3(p[0], p[1], 0); }));
    var outerPts = outerCurve.getPoints(30);
    function wingGeo(s) {
      var sh = new THREE.Shape();
      sh.moveTo(s * 0.38, 0);
      outerPts.forEach(function (p) { sh.lineTo(s * p.x, p.y); });
      sh.lineTo(s * 0.6, 2.7); sh.lineTo(s * 0.6, 0.6); sh.lineTo(s * 0.38, 0);
      var g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, -0.35);
      return track(g);
    }
    group.add(new THREE.Mesh(wingGeo(1), matBody));
    group.add(new THREE.Mesh(wingGeo(-1), matBody));
    var core = new THREE.Mesh(track(new THREE.BoxGeometry(1.3, 2.85, 0.7)), matBody);
    core.position.set(0, 1.425, 0); group.add(core);
    var plinth = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.07, 0.95)), matDark);
    plinth.position.set(0, 0.035, 0.05); group.add(plinth);

    /* ---------- écran central (rouleaux dessinés en canvas) ---------- */
    var bezel = new THREE.Mesh(track(new THREE.BoxGeometry(1.26, 1.6, 0.06)), matTrim);
    bezel.position.set(0, 1.9, 0.36); group.add(bezel);
    var SW = low ? 400 : 576, SH = low ? 520 : 750;
    var scr = mkCanvas(SW, SH), sctx = scr.getContext('2d');
    var scrTex = track(mkTex(scr));
    var screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.14, 1.48)), track(new THREE.MeshBasicMaterial({ map: scrTex })));
    screen.position.set(0, 1.9, 0.395); group.add(screen);

    /* ---------- couronne ronde (tambour) avec bande qui défile ---------- */
    var ban = mkCanvas(2048, 128), bctx = ban.getContext('2d');
    var banTex = track(mkTex(ban));
    banTex.wrapS = THREE.RepeatWrapping;
    var matBanner = track(new THREE.MeshBasicMaterial({ map: banTex }));
    var crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.8, 0.55, low ? 36 : 64, 1, true)), matBanner);
    crown.position.set(0, 3.15, 0); group.add(crown);
    var neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 24)), matDark);
    neck.position.set(0, 2.9, 0); group.add(neck);
    var cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.8, 0.04, low ? 36 : 64)), matDark);
    cap.position.set(0, 3.445, 0); group.add(cap);
    var ringMat = [track(new THREE.MeshBasicMaterial({ color: 0xffffff })), track(new THREE.MeshBasicMaterial({ color: 0xffffff }))];
    [3.43, 2.87].forEach(function (y, i) {
      var r = new THREE.Mesh(track(new THREE.TorusGeometry(0.8, 0.022, 6, low ? 40 : 72)), ringMat[i]);
      r.rotation.x = Math.PI / 2; r.position.y = y; group.add(r);
    });
    var bulbs = [];
    var NB = low ? 12 : 22;
    var bulbGeo = track(new THREE.SphereGeometry(0.028, 8, 6));
    for (var bi = 0; bi < NB; bi++) {
      var bm = track(new THREE.MeshBasicMaterial({ color: 0xffd36a }));
      var bu = new THREE.Mesh(bulbGeo, bm);
      var ang = bi / NB * TAU;
      bu.position.set(Math.sin(ang) * 0.815, 2.83, Math.cos(ang) * 0.815);
      group.add(bu); bulbs.push({ m: bm, ph: bi / NB });
    }

    /* ---------- tubes néon (barres entre points, avec halo additif) ---------- */
    var unitCyl = track(new THREE.CylinderGeometry(1, 1, 1, 6, 1));
    var neon = [];
    var UP = new THREE.Vector3(0, 1, 0);
    function addBar(a, b, r, ph, off) {
      var dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
      var mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      var q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
      var coreM = track(new THREE.MeshBasicMaterial({ color: 0xff3d8a }));
      var c = new THREE.Mesh(unitCyl, coreM);
      c.position.copy(mid); c.quaternion.copy(q); c.scale.set(r, len * 1.04, r); group.add(c);
      var glowM = null;
      if (!low) {
        glowM = track(new THREE.MeshBasicMaterial({ color: 0xff3d8a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
        var g = new THREE.Mesh(unitCyl, glowM);
        g.position.copy(mid); g.quaternion.copy(q); g.scale.set(r * 3.2, len * 1.04, r * 3.2); group.add(g);
      }
      neon.push({ core: coreM, glow: glowM, ph: ph, off: off });
    }
    var nPts = outerCurve.getPoints(low ? 8 : 15);
    [1, -1].forEach(function (s, si) {
      for (var i = 0; i < nPts.length - 1; i++) {
        var a = nPts[i], b = nPts[i + 1];
        addBar(new THREE.Vector3(s * (a.x + 0.005), a.y, 0.34), new THREE.Vector3(s * (b.x + 0.005), b.y, 0.34), 0.016, i / (nPts.length - 1), si * 0.25);
      }
    });

    /* ---------- panneaux latéraux animés ---------- */
    // Bande lumineuse qui épouse la courbe de la lyre : la texture (motif répété) coule le long du meuble.
    var TW = low ? 64 : 96, TH = low ? 256 : 384;
    var tileCv = mkCanvas(TW, TH), tc = tileCv.getContext('2d');
    (function () {
      var g = tc.createLinearGradient(0, 0, 0, TH);
      g.addColorStop(0, '#2a0f3a'); g.addColorStop(0.5, '#12081c'); g.addColorStop(1, '#2a0f3a');
      tc.fillStyle = g; tc.fillRect(0, 0, TW, TH);
      tc.strokeStyle = 'rgba(255,255,255,0.55)'; tc.lineWidth = 3;
      for (var cy = 0; cy < TH; cy += TH / 4) {          // chevrons qui montent
        tc.beginPath(); tc.moveTo(TW * 0.15, cy + TH / 8); tc.lineTo(TW / 2, cy); tc.lineTo(TW * 0.85, cy + TH / 8); tc.stroke();
      }
      tc.textAlign = 'center'; tc.textBaseline = 'middle'; tc.font = Math.round(TW * 0.5) + 'px ' + EMOJI_FONT;
      for (var si2 = 0; si2 < 4; si2++) tc.fillText(SYMS[si2 * 2 % SYMS.length], TW / 2, (si2 + 0.5) * TH / 4 + TH / 8);
    })();
    var sideTex = track(mkTex(tileCv));
    sideTex.wrapS = THREE.RepeatWrapping; sideTex.wrapT = THREE.RepeatWrapping;
    var sideMat = track(new THREE.MeshBasicMaterial({ map: sideTex, side: THREE.DoubleSide }));
    function ribbonGeo(s) {
      var pts = outerCurve.getPoints(low ? 24 : 40).filter(function (p) { return p.y > 0.75 && p.y < 2.55; });
      var pos = [], uv = [], idx = [], len = 0, i;
      for (i = 0; i < pts.length; i++) {
        if (i) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        // largeur 0.17 vers l'intérieur, à partir du bord (juste sous le néon)
        pos.push(s * (pts[i].x - 0.04), pts[i].y, 0.353, s * (pts[i].x - 0.2), pts[i].y, 0.353);
        uv.push(0, len / 0.5, 1, len / 0.5);
        if (i) { var a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return track(g);
    }
    group.add(new THREE.Mesh(ribbonGeo(1), sideMat));
    group.add(new THREE.Mesh(ribbonGeo(-1), sideMat));

    /* ---------- rayons lumineux ---------- */
    var rayCv = mkCanvas(32, 256), rctx = rayCv.getContext('2d');
    var rg = rctx.createLinearGradient(0, 256, 0, 0);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 32, 256);
    var rayTex = track(mkTex(rayCv));
    var rayGeo = track(new THREE.PlaneGeometry(0.5, 3.2)); rayGeo.translate(0, 1.6, 0);
    var rays = [];
    [1, -1].forEach(function (s) {
      for (var k = 0; k < (low ? 1 : 2); k++) {
        var m = track(new THREE.MeshBasicMaterial({ map: rayTex, color: 0x3a8dff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        var r = new THREE.Mesh(rayGeo, m);
        r.position.set(s * 0.95, 2.4, 0.1); r.rotation.z = -s * 0.55; r.rotation.y = k * Math.PI / 2;
        group.add(r); rays.push({ m: m, mesh: r, s: s, ph: Math.random() * 6 });
      }
    });

    /* ---------- lueur au sol ---------- */
    var glCv = mkCanvas(128, 128), gctx = glCv.getContext('2d');
    var gg = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,255,255,0.9)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = gg; gctx.fillRect(0, 0, 128, 128);
    var glowMat = track(new THREE.MeshBasicMaterial({ map: track(mkTex(glCv)), color: 0xff3d8a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    var floorGlow = new THREE.Mesh(track(new THREE.PlaneGeometry(4.4, 3.6)), glowMat);
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.set(0, 0.012, 0.5); group.add(floorGlow);

    /* ---------- pupitre de boutons ---------- */
    var pupitre = new THREE.Group();
    pupitre.position.set(0, 1.02, 0.62); pupitre.rotation.x = 0.4; group.add(pupitre);
    pupitre.add(new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.09, 0.5)), matBody));
    var pEdge = new THREE.Mesh(track(new THREE.BoxGeometry(1.17, 0.025, 0.02)), matTrim);
    pEdge.position.set(0, 0.04, 0.25); pupitre.add(pEdge);
    var buttons = [];
    function addButton(action, x, z, r, color) {
      var m = track(new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 }));
      var b = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, 0.035, 24)), m);
      b.position.set(x, 0.065, z); b.userData.action = action; b.userData.baseY = 0.065;
      pupitre.add(b); buttons.push(b); return b;
    }
    var spinBtn = addButton('spin', 0, 0.02, 0.095, 0xe0182d);
    addButton('betDown', -0.36, 0.05, 0.05, 0xd8a928);
    addButton('betUp', -0.22, 0.05, 0.05, 0xd8a928);
    addButton('max', 0.34, 0.05, 0.055, 0x1fae6a);
    var spinRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.125, 0.012, 6, 28)), track(new THREE.MeshBasicMaterial({ color: 0xff4a5a })));
    spinRing.rotation.x = Math.PI / 2; spinRing.position.set(0, 0.052, 0.02); pupitre.add(spinRing);
    for (var li = 0; li < 5; li++) {
      var led = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.012, 0.02)), track(new THREE.MeshBasicMaterial({ color: 0x2a2a35 })));
      led.position.set(-0.3 + li * 0.15, 0.052, -0.17); pupitre.add(led);
    }

    /* ---------- siège rouge ---------- */
    var seat = new THREE.Group(); seat.position.set(0, 0, 1.6); group.add(seat);
    var sBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 20)), matDark); sBase.position.y = 0.02; seat.add(sBase);
    var sStem = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 10)), matTrim); sStem.position.y = 0.25; seat.add(sStem);
    var sCush = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.28, 0.13, 22)), matSeat); sCush.position.y = 0.5; seat.add(sCush);
    var sBack = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 14, 1, true, -Math.PI * 0.35, Math.PI * 0.7)),
      track(new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.55, side: THREE.DoubleSide })));
    sBack.position.y = 0.78; seat.add(sBack);

    /* ---------- lumières (peu et pas chères) ---------- */
    var pLights = [];
    if (opts.lights !== false) {
      var l1 = new THREE.PointLight(0xff3d8a, 0.9, 6); l1.position.set(-1.3, 2.0, 1.5); group.add(l1); pLights.push(l1);
      if (!low) { var l2 = new THREE.PointLight(0x3a8dff, 0.9, 6); l2.position.set(1.3, 2.0, 1.5); group.add(l2); pLights.push(l2); }
    }

    /* ---------- pièces qui tombent (InstancedMesh) ---------- */
    var NC = low ? 70 : 170;
    var coinGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 12));
    var coinMesh = new THREE.InstancedMesh(coinGeo, track(new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0x6a4200, roughness: 0.3, metalness: 0.75 })), NC);
    coinMesh.frustumCulled = false; group.add(coinMesh);
    var dummy = new THREE.Object3D();
    var coins = [];
    for (var ci = 0; ci < NC; ci++) {
      coins.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vr: 0, bounced: false, fade: 0 });
      dummy.scale.set(0, 0, 0); dummy.updateMatrix(); coinMesh.setMatrixAt(ci, dummy.matrix);
    }
    coinMesh.instanceMatrix.needsUpdate = true;

    /* ---------- étincelles (Points additifs) ---------- */
    var NS = low ? 70 : 220;
    var spPos = new Float32Array(NS * 3), spVel = new Float32Array(NS * 3), spLife = new Float32Array(NS);
    for (var si = 0; si < NS; si++) spPos[si * 3 + 1] = -100;
    var spGeo = track(new THREE.BufferGeometry());
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    var sparks = new THREE.Points(spGeo, track(new THREE.PointsMaterial({ color: 0xffe08a, size: 0.07, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
    sparks.frustumCulled = false; group.add(sparks);
    var spNext = 0;

    /* ===================== état de la borne ===================== */
    var reels = [0, 1, 2].map(function (i) {
      return { pos: 0, speed: 0, mode: 'idle', salt: i * 17 + 3, p0: 0, T: 0, t: 0, D: 1, finalK: null, finalSym: null, idleSyms: ['🔥', '👑', '7️⃣'][i] };
    });
    var S = {
      t: 0, spinning: false, msg: 'Tire le levier !', bet: 0, lastWin: 0, hl: [false, false, false],
      party: null, spawnAcc: 0, sparkAcc: 0, scrT: 0, banT: 0, sideT: 0, shake: 0, onStopped: null, banMode: '', hueShift: 0, pressT: 0, pressBtn: null, trim: 0xc9a227
    };

    function symAt(i, k) {
      var r = reels[i];
      if (r.finalK === k) return r.finalSym;
      if (r.finalK === null && Math.abs(k) < 3 && r.pos === 0) return k === 0 ? r.idleSyms : hash(i, k, 5);
      return hash(i, k, r.salt);
    }

    /* ---------- dessin de l'écran ---------- */
    function drawScreen() {
      var c = sctx, W = SW, H = SH, P = S.party;
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P ? '#2a1204' : '#14091f'); g.addColorStop(1, '#050308');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '800 ' + Math.round(H * 0.05) + 'px ' + SERIF;
      c.fillStyle = '#f3cf62'; c.shadowColor = '#ffb300'; c.shadowBlur = 12;
      c.fillText('LES FLAMBEURS', W / 2, H * 0.06); c.shadowBlur = 0;
      c.font = Math.round(H * 0.026) + 'px ' + EMOJI_FONT; c.fillStyle = '#c9a227';
      c.fillText('✦  ✦  ✦', W / 2, H * 0.105);

      var ax = W * 0.07, aw = W * 0.86, ay = H * 0.135, ah = H * 0.6, gap = W * 0.022;
      var rw = (aw - gap * 2) / 3, ch = ah / 3, i, k;
      for (i = 0; i < 3; i++) {
        var r = reels[i], rx = ax + i * (rw + gap);
        c.save(); c.beginPath(); c.rect(rx, ay, rw, ah); c.clip();
        var bg = c.createLinearGradient(rx, 0, rx + rw, 0);
        bg.addColorStop(0, '#0b0710'); bg.addColorStop(0.5, '#1d1328'); bg.addColorStop(1, '#0b0710');
        c.fillStyle = bg; c.fillRect(rx, ay, rw, ah);
        c.font = Math.round(Math.min(rw, ch) * 0.66) + 'px ' + EMOJI_FONT;
        var f0 = Math.floor(r.pos);
        for (k = f0 - 2; k <= f0 + 2; k++) {
          var y = ay + ah / 2 + (r.pos - k) * ch, sym = symAt(i, k);
          if (r.speed > 6) {
            c.globalAlpha = 0.35; c.fillText(sym, rx + rw / 2, y - ch * 0.13); c.fillText(sym, rx + rw / 2, y + ch * 0.13); c.globalAlpha = 1;
          }
          c.fillText(sym, rx + rw / 2, y);
        }
        var sh = c.createLinearGradient(0, ay, 0, ay + ah);
        sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(0.33, 'rgba(0,0,0,0)'); sh.addColorStop(0.67, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.75)');
        c.fillStyle = sh; c.fillRect(rx, ay, rw, ah);
        c.restore();
        c.strokeStyle = '#8a6d1a'; c.lineWidth = 3; c.strokeRect(rx, ay, rw, ah);
        if (S.hl[i]) {
          var pulse = 0.55 + 0.45 * Math.sin(S.t * 10);
          c.save(); c.strokeStyle = 'rgba(255,220,100,' + (0.5 + 0.5 * pulse) + ')'; c.lineWidth = 6; c.shadowColor = '#ffcc33'; c.shadowBlur = 20;
          c.strokeRect(rx + 4, ay + ch + 4, rw - 8, ch - 8); c.restore();
        }
      }
      // ligne de gain
      var ly = ay + ah / 2;
      c.save(); c.strokeStyle = 'rgba(255,60,70,0.85)'; c.lineWidth = 3; c.shadowColor = '#ff2a3a'; c.shadowBlur = 14;
      c.beginPath(); c.moveTo(ax - 4, ly); c.lineTo(ax + aw + 4, ly); c.stroke(); c.restore();
      c.fillStyle = '#ff3a48';
      c.beginPath(); c.moveTo(ax - 12, ly - 10); c.lineTo(ax - 2, ly); c.lineTo(ax - 12, ly + 10); c.fill();
      c.beginPath(); c.moveTo(ax + aw + 12, ly - 10); c.lineTo(ax + aw + 2, ly); c.lineTo(ax + aw + 12, ly + 10); c.fill();

      // bandeau d'état + mise / gain
      var fy = H * 0.77;
      c.save(); roundRectPath(c, W * 0.07, fy, W * 0.86, H * 0.075, 10); c.fillStyle = '#0a0710'; c.fill();
      c.strokeStyle = '#8a6d1a'; c.lineWidth = 2; c.stroke(); c.restore();
      c.font = '700 ' + Math.round(H * 0.032) + 'px ' + MONO;
      c.fillStyle = P ? '#ffe28a' : '#f4e3b0';
      c.fillText(S.msg, W / 2, fy + H * 0.0375, W * 0.82);
      var by = H * 0.87, bw = W * 0.415;
      [['MISE', fmtN(S.bet), '#f4e3b0', W * 0.07], ['GAIN', S.lastWin > 0 ? '+' + fmtN(S.lastWin) : '0', '#ffd24a', W * 0.07 + bw + W * 0.03]].forEach(function (b) {
        c.save(); roundRectPath(c, b[3], by, bw, H * 0.1, 10); c.fillStyle = '#0a0710'; c.fill(); c.strokeStyle = '#5c4a14'; c.lineWidth = 2; c.stroke(); c.restore();
        c.font = '600 ' + Math.round(H * 0.022) + 'px ' + MONO; c.fillStyle = '#9a8a58'; c.fillText(b[0], b[3] + bw / 2, by + H * 0.03);
        c.font = '800 ' + Math.round(H * 0.04) + 'px ' + MONO; c.fillStyle = b[2]; c.fillText(b[1], b[3] + bw / 2, by + H * 0.07, bw * 0.9);
      });
      scrTex.needsUpdate = true;
    }

    /* ---------- dessin de la bande de la couronne ---------- */
    function drawBanner() {
      var c = bctx, P = S.party, W = 2048, H = 128, x;
      if (P) {
        var flash = Math.floor(S.t * 6) % 2 === 0;
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, flash ? '#7a0a16' : '#4a0610'); g.addColorStop(1, '#14040a');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = flash ? '#fff2b0' : '#ffd24a'; c.shadowColor = '#ffb300'; c.shadowBlur = 16;
        c.font = '900 ' + (P.level >= 4 ? 70 : 62) + 'px ' + SERIF;
        var txt = PARTY[P.level].title + '  ' + fmtN(P.amount) + ' €';
        [0, W].forEach(function (cx) { c.fillText(txt, cx, H * 0.52); });
        c.shadowBlur = 0;
      } else {
        var bg = c.createLinearGradient(0, 0, W, 0);
        bg.addColorStop(0, '#12081c'); bg.addColorStop(0.5, '#220c2e'); bg.addColorStop(1, '#12081c');
        c.fillStyle = bg; c.fillRect(0, 0, W, H);
        c.textAlign = 'left'; c.textBaseline = 'middle';
        for (var rep = 0; rep < 2; rep++) {
          x = rep * 1024 + 20;
          c.font = '800 54px ' + SERIF; c.fillStyle = '#f3cf62'; c.shadowColor = '#ffb300'; c.shadowBlur = 10;
          c.fillText('★ LES FLAMBEURS ★', x, H * 0.52); c.shadowBlur = 0;
          c.font = '58px ' + EMOJI_FONT;
          c.fillText('🔥 👑 7️⃣ 💎 🔔 🍋 🍒', x + 520, H * 0.52);
          c.fillStyle = '#ff5a8a'; c.font = '800 40px ' + MONO;
          c.fillText('×200', x + 905, H * 0.52);
        }
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 6); c.lineTo(W, 6); c.moveTo(0, H - 6); c.lineTo(W, H - 6); c.stroke();
      }
      banTex.needsUpdate = true;
    }

    /* ---------- panneaux latéraux ---------- */
    function updateSides(dt) {
      var P = S.party;
      sideTex.offset.y -= dt * (P ? 1.2 : 0.18);
      if (P) sideMat.color.setHSL(0.12, 1, 0.75);
      else sideMat.color.setHSL((S.t * 0.07) % 1, 0.7, 0.8);
    }

    /* ---------- pièces & étincelles ---------- */
    function spawnCoin() {
      for (var i = 0; i < NC; i++) {
        var q = coins[i];
        if (!q.on) {
          q.on = true; q.bounced = false; q.fade = 0;
          q.x = (Math.random() - 0.5) * 1.7; q.y = 4.4 + Math.random() * 0.8; q.z = 0.2 + Math.random() * 1.4;
          q.vx = (Math.random() - 0.5) * 0.4; q.vy = -Math.random() * 1.2; q.vz = (Math.random() - 0.3) * 0.5;
          q.rx = Math.random() * 6; q.ry = Math.random() * 6; q.rz = Math.random() * 6; q.vr = 4 + Math.random() * 8;
          return;
        }
      }
    }
    function spawnSpark(cx, cy, cz, speed) {
      var i = spNext; spNext = (spNext + 1) % NS;
      var a = Math.random() * TAU, e = (Math.random() - 0.3) * 2, v = speed * (0.4 + Math.random() * 0.8);
      spPos[i * 3] = cx; spPos[i * 3 + 1] = cy; spPos[i * 3 + 2] = cz;
      spVel[i * 3] = Math.cos(a) * v * (1 - Math.abs(e) * 0.4); spVel[i * 3 + 1] = e * v + speed * 0.3; spVel[i * 3 + 2] = Math.sin(a) * v * (1 - Math.abs(e) * 0.4);
      spLife[i] = 0.7 + Math.random() * 0.9;
    }
    function updateParticles(dt) {
      var anyCoin = false, i;
      for (i = 0; i < NC; i++) {
        var q = coins[i];
        if (!q.on) continue;
        anyCoin = true;
        q.vy -= 6.5 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.rx += q.vr * dt; q.rz += q.vr * 0.6 * dt;
        if (q.y < 0.03) {
          if (!q.bounced) { q.bounced = true; q.y = 0.03; q.vy = -q.vy * 0.35; q.vx *= 0.4; q.vz *= 0.4; q.vr *= 0.3; }
          else { q.y = 0.03; q.vy = 0; q.fade += dt; if (q.fade > 1.0) { q.on = false; } }
        }
        var sc = q.on ? (q.fade > 0 ? Math.max(0, 1 - q.fade) : 1) : 0;
        dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(q.rx, q.ry, q.rz); dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
        coinMesh.setMatrixAt(i, dummy.matrix);
        if (!q.on) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); coinMesh.setMatrixAt(i, dummy.matrix); }
      }
      if (anyCoin) coinMesh.instanceMatrix.needsUpdate = true;
      var anySpark = false;
      for (i = 0; i < NS; i++) {
        if (spLife[i] <= 0) continue;
        anySpark = true;
        spLife[i] -= dt; spVel[i * 3 + 1] -= 2.2 * dt;
        spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        if (spLife[i] <= 0) spPos[i * 3 + 1] = -100;
      }
      if (anySpark || S.sparkDirty) { spGeo.attributes.position.needsUpdate = true; S.sparkDirty = anySpark; }
    }

    /* ---------- éclairage : néons, bulbes, rayons ---------- */
    var tmpC = new THREE.Color();
    function updateLights(dt) {
      var t = S.t, P = S.party, lvl = P ? P.level : -1, i;
      var strobe = lvl >= 3 && (P.t % 1.6) < 0.5 && Math.floor(t * 9) % 2 === 0;
      for (i = 0; i < neon.length; i++) {
        var n = neon[i], h, l = 0.55, glowOp = 0.22;
        if (!P) { h = (t * 0.07 + n.ph * 0.6 + n.off) % 1; }
        else {
          var lit = (((n.ph * 3 - t * (1.6 + lvl * 0.5) * 4) % 1) + 1) % 1 < 0.45;
          h = lvl >= 3 ? (lit ? 0.12 : (Math.floor(t * 6) % 2 ? 0.0 : 0.6)) : (lit ? 0.12 : 0.0);
          l = lit ? 0.62 : 0.28; glowOp = lit ? 0.55 : 0.08;
          if (strobe) { h = 0.12; l = 0.95; glowOp = 0.7; }
        }
        n.core.color.setHSL(h, 1, l);
        if (n.glow) { n.glow.color.setHSL(h, 1, 0.5); n.glow.opacity = glowOp; }
      }
      for (i = 0; i < ringMat.length; i++) ringMat[i].color.setHSL(P ? (strobe ? 0.12 : 0.1) : (t * 0.05 + i * 0.4) % 1, 1, P ? 0.65 : 0.55);
      for (i = 0; i < bulbs.length; i++) {
        var b = bulbs[i], on = P ? ((((b.ph - t * 1.8) % 1) + 1) % 1 < 0.4) : ((((b.ph - t * 0.25) % 1) + 1) % 1 < 0.5);
        b.m.color.setHex(on ? (P ? 0xffffff : 0xffd36a) : 0x4a3a12);
      }
      for (i = 0; i < rays.length; i++) {
        var ry = rays[i];
        ry.mesh.rotation.z = -ry.s * (0.55 + 0.12 * Math.sin(t * 0.8 + ry.ph) + (P ? 0.15 * Math.sin(t * 7 + ry.ph) : 0));
        if (P) { tmpC.setHSL(strobe ? 0.15 : 0.11, 1, 0.6); ry.m.color.copy(tmpC); ry.m.opacity = 0.5 + 0.3 * Math.sin(t * 9 + ry.ph); }
        else { ry.m.color.setHSL(0.6 + 0.04 * Math.sin(t * 0.5 + ry.ph), 0.9, 0.55); ry.m.opacity = 0.28 + 0.1 * Math.sin(t * 1.3 + ry.ph); }
      }
      var fh = P ? (strobe ? 0.15 : 0.1) : (t * 0.07) % 1;
      glowMat.color.setHSL(fh, 1, 0.5); glowMat.opacity = P ? 0.55 + 0.3 * Math.sin(t * 8) : 0.4;
      for (i = 0; i < pLights.length; i++) {
        pLights[i].color.setHSL(P ? 0.11 : (t * 0.07 + i * 0.5) % 1, 1, 0.55);
        pLights[i].intensity = P ? 1.2 + 0.6 * Math.sin(t * 9 + i) : 0.8;
      }
      spinRing.material.color.setHex(S.spinning || P ? 0x553030 : (Math.sin(t * 4) > 0 ? 0xff4a5a : 0xaa2a35));
    }

    /* ===================== mise à jour par image ===================== */
    function update(dt) {
      if (dt > 0.05) dt = 0.05;
      S.t += dt;
      var i, allStopped = true;
      for (i = 0; i < 3; i++) {
        var r = reels[i];
        if (r.mode === 'spin') { r.speed = Math.min(r.speed + 60 * dt, 15); r.pos += r.speed * dt; allStopped = false; }
        else if (r.mode === 'stop') {
          r.t += dt; var u = Math.min(1, r.t / r.D);
          r.pos = r.p0 + (r.T - r.p0) * (1 - Math.pow(1 - u, 3));
          r.speed = 3 * (r.T - r.p0) / r.D * Math.pow(1 - u, 2);
          if (u >= 1) { r.mode = 'idle'; r.pos = r.T; r.speed = 0; } else allStopped = false;
        }
      }
      if (S.onStopped && allStopped) { var cb = S.onStopped; S.onStopped = null; S.spinning = false; cb(); }

      var P = S.party;
      if (P) {
        P.t += dt;
        var cfg = PARTY[P.level];
        if (P.t < cfg.dur * 0.8) {
          S.spawnAcc += cfg.rate * dt;
          while (S.spawnAcc >= 1) { S.spawnAcc -= 1; if (cfg.coins) spawnCoin(); }
          S.sparkAcc += dt;
          if (S.sparkAcc > 0.5) { S.sparkAcc = 0; for (i = 0; i < Math.min(NS, cfg.sparks * (low ? 0.4 : 0.5)); i++) spawnSpark((Math.random() - 0.5) * 1.5, 3.2 + Math.random() * 0.4, 0.3 + Math.random() * 0.6, 2.2 + P.level * 0.5); }
        }
        var rem = cfg.dur - P.t;
        S.shake = cfg.shake * (rem < cfg.dur * 0.25 ? Math.max(0, rem / (cfg.dur * 0.25)) : 1);
        if (P.t >= cfg.dur) { S.party = null; S.hl = [false, false, false]; S.shake = 0; S.msg = 'Prêt à jouer.'; drawBanner(); banTex.offset.x = 0; }
      } else S.shake = 0;

      updateLights(dt);
      updateParticles(dt);

      // bande de la couronne
      if (S.party) { banTex.offset.x += (0 - banTex.offset.x) * Math.min(1, dt * 5); S.banT += dt; if (S.banT > 0.16) { S.banT = 0; drawBanner(); } }
      else { banTex.offset.x = (banTex.offset.x + dt * 0.035) % 1; }
      crown.rotation.y = S.party ? Math.sin(S.t * 3) * 0.04 : 0;

      // écran : à chaque image si ça bouge, sinon 6 fois par seconde
      S.scrT += dt;
      var moving = S.spinning || S.party || reels.some(function (r) { return r.mode !== 'idle'; });
      if (moving || S.scrT > 0.16 || S.dirty) { S.scrT = 0; S.dirty = false; drawScreen(); }
      updateSides(dt);

      // bouton enfoncé
      if (S.pressBtn) {
        S.pressT -= dt;
        S.pressBtn.position.y = S.pressBtn.userData.baseY - (S.pressT > 0 ? 0.018 : 0);
        if (S.pressT <= 0) S.pressBtn = null;
      }
    }

    /* ===================== commandes ===================== */
    function startSpin() {
      S.spinning = true; S.onStopped = null; S.party = null; S.hl = [false, false, false]; S.lastWin = 0; S.shake = 0;
      S.msg = 'Les rouleaux tournent…';
      reels.forEach(function (r) { r.mode = 'spin'; r.speed = 0; });
      banTex.offset.x = 0; drawBanner(); S.dirty = true;
    }
    function stopReels(finals, done) {
      S.onStopped = done || function () {};
      reels.forEach(function (r, i) {
        if (r.mode === 'idle') { r.mode = 'spin'; r.speed = 10; }
        var D = 1.0 + i * 0.9;
        r.p0 = r.pos; r.T = Math.ceil(r.pos + 4.67 * D); r.t = 0; r.D = D;
        r.finalK = r.T; r.finalSym = finals[i]; r.mode = 'stop';
      });
    }
    function abortSpin() {
      S.spinning = false; S.onStopped = null;
      reels.forEach(function (r) { r.mode = 'idle'; r.speed = 0; r.pos = Math.round(r.pos); });
      S.msg = 'Prêt à jouer.'; S.dirty = true;
    }
    function showResult(finals, mult, win, bet) {
      S.bet = bet || S.bet; S.lastWin = win || 0;
      if (!(mult > 0)) { S.msg = 'Pas de gain, retente !'; S.hl = [false, false, false]; S.dirty = true; return; }
      var lvl = levelFor(mult);
      var a = finals[0], b = finals[1], c = finals[2];
      S.hl = (a === b && b === c) ? [true, true, true] : [a === b || a === c, a === b || b === c, a === c || b === c];
      S.msg = PARTY[lvl].title + ' ×' + String(mult).replace('.', ',');
      S.party = { level: lvl, t: 0, amount: win || 0 };
      S.sparkAcc = 1; S.spawnAcc = 0; S.banT = 1;
      banTex.offset.x = 0;
      for (var i = 0; i < Math.min(NS, PARTY[lvl].sparks); i++) spawnSpark(0, 3.2, 0.5, 2.4 + lvl * 0.6);
      S.sparkDirty = true; drawBanner();
    }
    function setTrim(hex) { if (hex !== S.trim) { S.trim = hex; matTrim.color.setHex(hex); matTrim.emissive.setHex(hex).multiplyScalar(0.12); } }
    function pressButton(btn) { S.pressBtn = btn; S.pressT = 0.14; }

    drawBanner(); drawScreen(); updateSides(0);

    return {
      group: group,
      buttons: buttons,
      update: update,
      startSpin: startSpin,
      stopReels: stopReels,
      abortSpin: abortSpin,
      showResult: showResult,
      setTrim: setTrim,
      setBet: function (b) { if (b !== S.bet) { S.bet = b; S.dirty = true; } },
      pressButton: pressButton,
      isBusy: function () { return S.spinning || !!S.party || reels.some(function (r) { return r.mode !== 'idle'; }); },
      isSpinning: function () { return S.spinning; },
      getShake: function () { return S.shake; },
      dispose: function () {
        if (group.parent) group.parent.remove(group);
        disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
        coinMesh.dispose();
      }
    };
  }

  /* ===================================================================
     SCÈNE SOLO : une borne + caméra + commandes (étape 1)
     =================================================================== */
  var CSS_ID = 's3d-style';
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style'); st.id = CSS_ID;
    st.textContent =
      '.s3d-hud{position:absolute;inset:0;pointer-events:none;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#f4e3b0}' +
      '.s3d-hud button{pointer-events:auto;cursor:pointer;touch-action:manipulation;font-family:inherit}' +
      '.s3d-top{position:absolute;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;justify-content:space-between}' +
      '.s3d-bal{background:rgba(8,5,12,.78);border:1px solid rgba(201,162,39,.5);border-radius:12px;padding:6px 10px;font-weight:800;font-size:13px;white-space:nowrap}' +
      '.s3d-cam{background:rgba(8,5,12,.78);border:1px solid rgba(201,162,39,.5);border-radius:12px;padding:8px 12px;min-height:40px;color:#f3cf62;font-weight:800;font-size:12px}' +
      '.s3d-bottom{position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;align-items:stretch}' +
      '.s3d-chips{display:flex;gap:6px;justify-content:center}' +
      '.s3d-chips button{flex:1;max-width:72px;min-height:36px;border-radius:10px;border:1px solid rgba(201,162,39,.45);background:rgba(8,5,12,.78);color:#f4e3b0;font-weight:800;font-size:12px}' +
      '.s3d-row{display:flex;gap:8px;align-items:stretch}' +
      '.s3d-step{width:52px;min-height:52px;border-radius:14px;border:1px solid rgba(201,162,39,.55);background:rgba(8,5,12,.82);color:#f3cf62;font-size:24px;font-weight:900}' +
      '.s3d-bet{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,5,12,.82);border:1px solid rgba(201,162,39,.45);border-radius:14px;font-size:11px;color:#9a8a58;font-weight:700;letter-spacing:.08em}' +
      '.s3d-bet b{color:#ffd24a;font-size:19px;letter-spacing:0;font-family:"Orbitron",monospace}' +
      '.s3d-spin{flex:1.3;min-height:52px;border-radius:14px;border:2px solid #ffb3ba;background:linear-gradient(180deg,#ff4a5a,#b3101f);color:#fff;font-weight:900;font-size:17px;letter-spacing:.06em;box-shadow:0 0 18px rgba(255,60,80,.5)}' +
      '.s3d-spin[disabled]{filter:grayscale(.7) brightness(.6);box-shadow:none}' +
      '@media (min-width:768px){.s3d-bottom{left:50%;right:auto;transform:translateX(-50%);width:430px}}';
    document.head.appendChild(st);
  }

  function SlotsExperience(container, opts) {
    opts = opts || {};
    var self = this;
    this.container = container;
    this.low = opts.low !== undefined ? !!opts.low : isMobile();
    this.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 0);
    container.style.background = 'radial-gradient(ellipse at 50% 38%, #3a1a3f 0%, #1a0d22 45%, #07050c 100%)';
    var dom = this.dom = this.renderer.domElement;
    dom.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;outline:none';
    container.appendChild(dom);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    this.scene.add(new THREE.AmbientLight(0x8a7fb0, 0.75));
    var key = new THREE.DirectionalLight(0xfff0d0, 0.7); key.position.set(1.5, 4, 5); this.scene.add(key);

    // sol sombre
    var flc = mkCanvas(256, 256), fx = flc.getContext('2d'), fg = fx.createRadialGradient(128, 128, 10, 128, 128, 128);
    fg.addColorStop(0, 'rgba(60,30,70,0.95)'); fg.addColorStop(0.6, 'rgba(20,10,28,0.8)'); fg.addColorStop(1, 'rgba(7,5,12,0)');
    fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: mkTex(flc), transparent: true, depthWrite: false }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = 0.002; this.scene.add(fl);

    this.cab = createSlotCabinet({ low: this.low, position: new THREE.Vector3(0, 0, 0) });
    this.scene.add(this.cab.group);

    this.view = { yaw: 0, pitch: 0.06, yawG: 0, pitchG: 0.06, r: 3.2, rG: 3.2, ty: 1.95, tyG: 1.95, fov: 40, fovG: 40, mode: 'play', lastDrag: -99 };
    this.clock = 0; this.last = 0; this.w = 0; this.h = 0; this.running = true; this.dead = false; this.hudT = 0;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this._buildHud();
    this._bindPointer();
    this._frame = function (now) { self._loop(now); };
    this._raf = requestAnimationFrame(this._frame);
  }

  SlotsExperience.prototype._buildHud = function () {
    var self = this;
    injectCss();
    var hud = document.createElement('div'); hud.className = 's3d-hud';
    hud.innerHTML =
      '<div class="s3d-top"><div class="s3d-bal">💰 <span data-s3d="bal">0</span></div><button class="s3d-cam" data-s3d="cam">🔭 Reculer</button></div>' +
      '<div class="s3d-bottom"><div class="s3d-chips">' +
      '<button data-bet="50">50</button><button data-bet="500">500</button><button data-bet="5000">5k</button><button data-bet="25000">25k</button><button data-bet="100000">MAX</button></div>' +
      '<div class="s3d-row"><button class="s3d-step" data-d="-1" aria-label="Mise moins">−</button>' +
      '<div class="s3d-bet">MISE<b data-s3d="bet">50</b></div><button class="s3d-step" data-d="1" aria-label="Mise plus">+</button>' +
      '<button class="s3d-spin" data-s3d="spin">🔴 TIRER</button></div></div>';
    this.container.appendChild(hud);
    this.hud = hud;
    this.elBal = hud.querySelector('[data-s3d="bal"]'); this.elBet = hud.querySelector('[data-s3d="bet"]');
    this.elSpin = hud.querySelector('[data-s3d="spin"]'); this.elCam = hud.querySelector('[data-s3d="cam"]');
    this.elCam.addEventListener('click', function () { self.toggleCamera(); });
    this.elSpin.addEventListener('click', function (e) { self.doSpin(e); });
    hud.querySelectorAll('[data-bet]').forEach(function (b) {
      b.addEventListener('click', function () { self.setBet(parseInt(b.getAttribute('data-bet'), 10)); });
    });
    hud.querySelectorAll('[data-d]').forEach(function (b) {
      b.addEventListener('click', function () { self.stepBet(parseInt(b.getAttribute('data-d'), 10)); });
    });
  };

  SlotsExperience.prototype.getBetInput = function () { return document.getElementById('slotBetInput'); };
  SlotsExperience.prototype.setBet = function (n) {
    if (typeof window.setSlotQuickBet === 'function') window.setSlotQuickBet(n);
    else { var el = this.getBetInput(); if (el) el.value = n; }
    this.syncHud(true);
  };
  SlotsExperience.prototype.stepBet = function (d) {
    var el = this.getBetInput(); if (!el) return;
    var cur = parseInt(el.value, 10) || 50, i;
    if (d > 0) { for (i = 0; i < BET_STEPS.length; i++) if (BET_STEPS[i] > cur) { this.setBet(BET_STEPS[i]); return; } this.setBet(BET_STEPS[BET_STEPS.length - 1]); }
    else { for (i = BET_STEPS.length - 1; i >= 0; i--) if (BET_STEPS[i] < cur) { this.setBet(BET_STEPS[i]); return; } this.setBet(BET_STEPS[0]); }
  };
  SlotsExperience.prototype.doSpin = function (e) {
    if (this.cab.isBusy()) return;
    if (typeof window.pullSlotLever === 'function') window.pullSlotLever(e);
  };
  SlotsExperience.prototype.syncHud = function (force) {
    var el = this.getBetInput(), bet = el ? (parseInt(el.value, 10) || 0) : 0;
    this.elBet.textContent = fmtN(bet); this.cab.setBet(bet);
    try { if (typeof state !== 'undefined' && state && typeof state.balance === 'number') this.elBal.textContent = fmtN(state.balance); } catch (e) { /* solde pas encore chargé */ }
    var busy = this.cab.isBusy(); this.elSpin.disabled = busy;
    this.elSpin.textContent = busy ? '… EN COURS' : '🔴 TIRER';
    var box = document.getElementById('slotCabinetBox');
    if (box) {
      var skin = '';
      Object.keys(SKINS).forEach(function (k) { if (k && box.classList.contains(k)) skin = k; });
      this.cab.setTrim(SKINS[skin]);
    }
  };
  SlotsExperience.prototype.toggleCamera = function () {
    var v = this.view;
    v.mode = v.mode === 'play' ? 'far' : 'play';
    v.yawG = 0; v.lastDrag = -99;
    this.elCam.textContent = v.mode === 'play' ? '🔭 Reculer' : '🎯 Rapprocher';
    this._computeGoals();
  };
  SlotsExperience.prototype._computeGoals = function () {
    var v = this.view, aspect = this.w / Math.max(1, this.h), fov = aspect < 0.9 ? 50 : 38;
    var t = Math.tan(fov * Math.PI / 360);
    if (v.mode === 'play') {
      v.rG = Math.max(2.2 / 2 / t, 2.7 / 2 / (t * aspect)); v.tyG = 1.95; v.pitchG = 0.06;
    } else {
      v.rG = Math.max(5.2 / 2 / t, 4.4 / 2 / (t * aspect)); v.tyG = 1.65; v.pitchG = 0.2;
    }
    v.fovG = fov;
  };
  SlotsExperience.prototype._bindPointer = function () {
    var self = this, dom = this.dom, drag = null;
    dom.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, yaw: self.view.yawG, pitch: self.view.pitchG, moved: 0, mouse: e.pointerType === 'mouse', id: e.pointerId };
      try { dom.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
    });
    dom.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved < 6) return;
      var v = self.view, lim = v.mode === 'play' ? 0.9 : Math.PI;
      v.yawG = Math.max(-lim, Math.min(lim, drag.yaw - dx * 0.007));
      if (drag.mouse) v.pitchG = Math.max(-0.05, Math.min(0.75, drag.pitch + dy * 0.005));
      v.lastDrag = self.clock;
    });
    function up(e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.moved < 6) self._click(e);
    }
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', function () { drag = null; });
  };
  SlotsExperience.prototype._click = function (e) {
    var rc = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    var hit = this.ray.intersectObjects(this.cab.buttons, false)[0];
    if (!hit) return;
    var a = hit.object.userData.action;
    this.cab.pressButton(hit.object);
    if (a === 'spin') this.doSpin(e);
    else if (a === 'betDown') this.stepBet(-1);
    else if (a === 'betUp') this.stepBet(1);
    else if (a === 'max') this.setBet(100000);
  };

  SlotsExperience.prototype._resize = function () {
    var w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this._computeGoals();
    var v = this.view; v.r = v.rG; v.ty = v.tyG; v.fov = v.fovG;
  };

  SlotsExperience.prototype._loop = function (now) {
    if (this.dead) return;
    this._raf = requestAnimationFrame(this._frame);
    if (!this.running || !this.container.clientWidth) { this.last = 0; return; }
    var dt = this.last ? (now - this.last) / 1000 : 0.016; this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.clock += dt;
    this._resize();
    this.cab.update(dt);

    var v = this.view, k = 1 - Math.exp(-dt * 4);
    if (v.mode === 'play' && !this.dragging && this.clock - v.lastDrag > 3) { v.yawG = 0; v.pitchG = 0.06; }
    v.yaw += (v.yawG - v.yaw) * k; v.pitch += (v.pitchG - v.pitch) * k;
    v.r += (v.rG - v.r) * k; v.ty += (v.tyG - v.ty) * k; v.fov += (v.fovG - v.fov) * k;
    if (Math.abs(this.camera.fov - v.fov) > 0.01) { this.camera.fov = v.fov; this.camera.updateProjectionMatrix(); }
    var cp = Math.cos(v.pitch);
    this.camera.position.set(Math.sin(v.yaw) * cp * v.r, v.ty + Math.sin(v.pitch) * v.r, 0.3 + Math.cos(v.yaw) * cp * v.r);
    var sh = this.cab.getShake();
    if (sh > 0) this.camera.position.add(new THREE.Vector3(Math.sin(this.clock * 61) * sh * v.r, Math.cos(this.clock * 53) * sh * v.r, 0));
    this.camera.lookAt(0, v.ty, 0.3);
    this.renderer.render(this.scene, this.camera);

    this.hudT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.syncHud(); }
  };

  SlotsExperience.prototype.pause = function () { this.running = false; };
  SlotsExperience.prototype.resume = function () { this.running = true; this.last = 0; this.w = 0; this.syncHud(); };
  SlotsExperience.prototype.dispose = function () {
    this.dead = true; cancelAnimationFrame(this._raf);
    this.cab.dispose(); this.renderer.dispose();
    if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud);
  };

  /* ===================================================================
     PONT AVEC LA PAGE (branché sur pullSlotLever, sans toucher au jeu)
     =================================================================== */
  var exp = null, failed = false, bannerObs = null;

  function stage() { return document.getElementById('slot3dStage'); }
  function classicWrap() { return document.getElementById('slotClassicWrap'); }

  function open() {
    if (failed || typeof THREE === 'undefined') return false;
    var st = stage(); if (!st) return false;
    if (!exp) {
      try {
        st.classList.remove('hidden');
        exp = new SlotsExperience(st, {});
      } catch (err) {
        failed = true; exp = null; st.classList.add('hidden');
        if (window.console) console.warn('[Slots3D] WebGL indisponible, machine classique conservée.', err);
        return false;
      }
    } else { exp.resume(); }
    st.classList.remove('hidden');
    var cw = classicWrap(); if (cw) cw.classList.add('hidden');
    return true;
  }
  function close() { if (exp) exp.pause(); }

  window.Slots3D = {
    createSlotCabinet: createSlotCabinet,
    SlotsExperience: SlotsExperience,
    levelFor: levelFor,
    open: open,
    close: close,
    isActive: function () { return !!exp; },
    getExperience: function () { return exp; },
    onSpinStart: function () { if (exp) exp.cab.startSpin(); },
    onResult: function (finals, mult, win, bet) {
      if (!exp) return;
      var cab = exp.cab;
      cab.stopReels(finals, function () { cab.showResult(finals, mult || 0, win || 0, bet || 0); });
    },
    onError: function () { if (exp) exp.cab.abortSpin(); }
  };
})();
