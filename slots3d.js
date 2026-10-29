/* =====================================================================
   slots3d.js — Machines à sous 3D « Les Flambeurs » (Three.js r128)
   ---------------------------------------------------------------------
   - createSlotCabinet(opts) : UNE borne réutilisable (position, rotation, qualité).
   - salle « slots » : 6 bornes en arc, tableau des meilleurs gains, règles sur les murs,
     branchée sur le monde commun (f3d-core.js + world3d.js).
   - window.Slots3D : pont avec la page (pullSlotLever). Les symboles, gains et le solde restent
     gérés par le jeu existant : ce fichier ne fait que MONTRER le tirage que le serveur a décidé.
   Tout est dans une IIFE : aucun nom global ne peut écraser ceux du gros script de la page.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  var EMOJI_FONT = F.EMOJI_FONT, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;
  var fmtN = F.fmtN, isMobile = F.isMobile, mkCanvas = F.mkCanvas, mkTex = F.mkTex, roundRectPath = F.roundRectPath;
  var SYMS = ['🔥', '👑', '7️⃣', '💎', '🔔', '🍋', '🍒'];
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

  function levelFor(mult) { return mult >= 100 ? 4 : mult >= 30 ? 3 : mult >= 12 ? 2 : mult >= 3 ? 1 : 0; }
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
      t: 0, spinning: false, msg: opts.message || 'Tire le levier !', label: opts.label || '', bet: 0, lastWin: 0, hl: [false, false, false],
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
      c.font = S.label ? '700 ' + Math.round(H * 0.03) + 'px ' + MONO : Math.round(H * 0.026) + 'px ' + EMOJI_FONT; c.fillStyle = '#c9a227';
      c.fillText(S.label || '✦  ✦  ✦', W / 2, H * 0.105);

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

    // zone invisible pour cliquer sur la borne depuis la salle
    var hit = new THREE.Mesh(track(new THREE.BoxGeometry(2.0, 3.7, 1.3)), track(new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.set(0, 1.85, 0.35); group.add(hit);

    drawBanner(); drawScreen(); updateSides(0);

    return {
      group: group,
      hit: hit,
      setMessage: function (m) { if (m !== S.msg) { S.msg = m; S.dirty = true; } },
      setLabel: function (l) { S.label = l || ''; S.dirty = true; },
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


  var ROOM = { xMax: 8.4, zMin: -2.6, zMax: 10.4, wall: 9, back: -3.2, front: 11 };
  var ARC = { cx: 0, cz: 4, r: 5.5, stepDeg: 26 };

  function buildRoom(scene, low) {
    var carpet = mkCanvas(256, 256), x = carpet.getContext('2d');
    x.fillStyle = '#2a0a16'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(201,162,39,0.38)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(128, 6); x.lineTo(250, 128); x.lineTo(128, 250); x.lineTo(6, 128); x.closePath(); x.stroke();
    x.strokeStyle = 'rgba(201,162,39,0.2)';
    x.beginPath(); x.moveTo(128, 56); x.lineTo(200, 128); x.lineTo(128, 200); x.lineTo(56, 128); x.closePath(); x.stroke();
    x.fillStyle = 'rgba(201,162,39,0.35)';
    [[0, 0], [256, 0], [0, 256], [256, 256], [128, 128]].forEach(function (p) { x.beginPath(); x.arc(p[0], p[1], 7, 0, TAU); x.fill(); });
    var cTex = new THREE.CanvasTexture(carpet);
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping; cTex.repeat.set(9, 8); cTex.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14.2), new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.85, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 3.9); scene.add(floor);

    var wallMat = new THREE.MeshStandardMaterial({ color: 0x24141e, roughness: 0.9 });
    var goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6, emissive: 0x2a1d00 });
    function wall(w, h, px, py, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); m.position.set(px, py, pz); m.rotation.y = ry; scene.add(m); return m; }
    wall(18, 7.5, 0, 3.75, ROOM.back, 0);
    wall(14.2, 7.5, -ROOM.wall, 3.75, 3.9, Math.PI / 2);
    wall(14.2, 7.5, ROOM.wall, 3.75, 3.9, -Math.PI / 2);
    wall(18, 7.5, 0, 3.75, ROOM.front, Math.PI);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(18, 14.2), new THREE.MeshBasicMaterial({ color: 0x0b060c }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 7.5, 3.9); scene.add(ceil);
    // moulures dorées
    [1.0, 7.35].forEach(function (y) {
      [[18, 0.07, 0.07, 0, y, ROOM.back + 0.04], [18, 0.07, 0.07, 0, y, ROOM.front - 0.04],
       [0.07, 0.07, 14.2, -ROOM.wall + 0.04, y, 3.9], [0.07, 0.07, 14.2, ROOM.wall - 0.04, y, 3.9]].forEach(function (d) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), goldMat); m.position.set(d[3], d[4], d[5]); scene.add(m);
      });
    });
    // enseigne au fond
    var sg = mkCanvas(1024, 160), sx = sg.getContext('2d');
    sx.fillStyle = '#12080f'; sx.fillRect(0, 0, 1024, 160);
    sx.strokeStyle = '#c9a227'; sx.lineWidth = 6; sx.strokeRect(6, 6, 1012, 148);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#f3cf62'; sx.shadowColor = '#ffb300'; sx.shadowBlur = 18;
    sx.font = '800 64px ' + SERIF; sx.fillText('LES FLAMBEURS', 512, 62);
    sx.font = '600 30px ' + MONO; sx.shadowBlur = 8; sx.fillText('✦  SALLE DES MACHINES  ✦', 512, 118);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.09), new THREE.MeshBasicMaterial({ map: mkTex(sg) }));

    // tableau des meilleurs gains (mur du fond, au-dessus de l'enseigne)
    var bc = mkCanvas(1024, 420), bx = bc.getContext('2d'), bTex = mkTex(bc);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.5, 0.08), goldMat); frame.position.set(0, 5.5, ROOM.back + 0.06); scene.add(frame);
    var board = new THREE.Mesh(new THREE.PlaneGeometry(8.3, 3.4), new THREE.MeshBasicMaterial({ map: bTex }));
    board.position.set(0, 5.5, ROOM.back + 0.11); scene.add(board);
    var boardSig = '';
    function drawBoard(list) {
      var sigNew = JSON.stringify(list);
      if (sigNew === boardSig) return;
      boardSig = sigNew;
      var g = bx.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, '#1d0a1c'); g.addColorStop(1, '#0a0510');
      bx.fillStyle = g; bx.fillRect(0, 0, 1024, 420);
      bx.textBaseline = 'middle'; bx.textAlign = 'center';
      bx.fillStyle = '#f3cf62'; bx.shadowColor = '#ffb300'; bx.shadowBlur = 14; bx.font = '800 42px ' + SERIF;
      bx.fillText('🏆 LES FLAMBEURS · MEILLEURS GAINS 🏆', 512, 44); bx.shadowBlur = 0;
      bx.strokeStyle = 'rgba(201,162,39,0.5)'; bx.lineWidth = 2; bx.beginPath(); bx.moveTo(60, 82); bx.lineTo(964, 82); bx.stroke();
      if (!list.length) {
        bx.fillStyle = '#d9c88f'; bx.font = '600 38px ' + MONO; bx.fillText('Aucun gain enregistré', 512, 220);
        bx.font = '500 28px ' + MONO; bx.fillStyle = '#9a8a58'; bx.fillText('Sois le premier au classement !', 512, 280);
      }
      var medals = ['🥇', '🥈', '🥉', '4', '5'], rowH = 64;
      list.forEach(function (p, i) {
        var y = 124 + i * rowH;
        if (p.me) { bx.fillStyle = 'rgba(243,207,98,0.14)'; bx.fillRect(50, y - 29, 924, 58); }
        bx.textAlign = 'center'; bx.font = (i < 3 ? '40px ' + EMOJI_FONT : '700 34px ' + MONO); bx.fillStyle = '#d9c88f'; bx.fillText(medals[i], 100, y);
        bx.textAlign = 'left'; bx.font = '700 36px ' + MONO; bx.fillStyle = p.me ? '#ffe28a' : '#f4e3b0';
        bx.fillText(((p.emoji ? p.emoji + ' ' : '') + p.name).slice(0, 22), 170, y);
        bx.textAlign = 'right'; bx.font = '800 38px ' + MONO; bx.fillStyle = i === 0 ? '#ffd24a' : '#f3cf62';
        bx.fillText(fmtN(p.win) + ' €', 960, y);
      });
      bTex.needsUpdate = true;
    }
    drawBoard([]);
    // colonnes
    [[-7.2, 0.2], [7.2, 0.2], [-7.2, 8.2], [7.2, 8.2]].forEach(function (p) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7.5, 16), new THREE.MeshStandardMaterial({ color: 0x1a0f18, roughness: 0.6, metalness: 0.2 }));
      c.position.set(p[0], 3.75, p[1]); scene.add(c);
      [0.3, 7.2].forEach(function (y) { var r = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 20), goldMat); r.rotation.x = Math.PI / 2; r.position.set(p[0], y, p[1]); scene.add(r); });
    });
    // bandeaux lumineux au plafond
    var stripMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    [0.5, 4.5, 8.5].forEach(function (z) { var s = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 0.18), stripMat); s.position.set(0, 7.46, z); scene.add(s); });

    scene.add(new THREE.AmbientLight(0x9a8cc0, 0.85));
    var key = new THREE.DirectionalLight(0xfff0d0, 0.55); key.position.set(2, 5, 9); scene.add(key);
    var pl = new THREE.PointLight(0xffd9a0, 0.9, 16); pl.position.set(0, 4.4, 6); scene.add(pl);
    if (!low) { var pl2 = new THREE.PointLight(0xffc890, 0.6, 14); pl2.position.set(0, 4.4, 1); scene.add(pl2); }

    // Règles et gains sur les murs de gauche et de droite (valeurs lues dans le jeu pour rester identiques)
    var rcv = mkCanvas(1400, 720), rx = rcv.getContext('2d'), rTex = mkTex(rcv);
    (function () {
      var P3 = typeof SLOT_PAY_3 !== 'undefined' ? SLOT_PAY_3 : { '🔥': 200, '👑': 100, '7️⃣': 50, '💎': 30, '🔔': 12, '🍋': 5, '🍒': 3 };
      var P2 = typeof SLOT_PAY_2 !== 'undefined' ? SLOT_PAY_2 : { '🔥': 2.5, '👑': 2.0, '7️⃣': 1.8, '💎': 1.5, '🔔': 1.1, '🍋': 0.8, '🍒': 0.4 };
      var NAMES = { '🔥': 'Flammes', '👑': 'Couronnes', '7️⃣': 'Sept', '💎': 'Diamants', '🔔': 'Cloches', '🍋': 'Citrons', '🍒': 'Cerises' };
      function mx(v) { return '×' + String(v).replace('.', ','); }
      var g = rx.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#1d0a1c'); g.addColorStop(1, '#0a0510');
      rx.fillStyle = g; rx.fillRect(0, 0, 1400, 720);
      rx.strokeStyle = '#c9a227'; rx.lineWidth = 6; rx.strokeRect(8, 8, 1384, 704);
      rx.textBaseline = 'middle'; rx.textAlign = 'center';
      rx.fillStyle = '#f3cf62'; rx.shadowColor = '#ffb300'; rx.shadowBlur = 14; rx.font = '800 64px ' + SERIF;
      rx.fillText('RÈGLES & GAINS', 700, 62); rx.shadowBlur = 0;
      rx.fillStyle = '#d9c88f'; rx.font = '600 28px ' + MONO; rx.fillText('Aligne les symboles sur la ligne rouge · gain = mise × multiplicateur', 700, 122);
      [['🏆 3 SYMBOLES IDENTIQUES', 50, P3, 'Trois '], ['✨ 2 SYMBOLES IDENTIQUES', 720, P2, '2 ']].forEach(function (col, ci) {
        rx.textAlign = 'left'; rx.fillStyle = '#ffb3c8'; rx.font = '800 34px ' + SERIF; rx.fillText(col[0], col[1], 180);
        SYMS.forEach(function (s, i) {
          var y = 240 + i * 62;
          if (ci === 0 && i === 0) { rx.fillStyle = 'rgba(239,68,68,0.22)'; rx.fillRect(col[1] - 10, y - 28, 640, 56); }
          rx.fillStyle = 'rgba(255,255,255,0.05)'; if (!(ci === 0 && i === 0)) rx.fillRect(col[1] - 10, y - 28, 640, 56);
          rx.font = '34px ' + EMOJI_FONT; rx.fillStyle = '#fff';
          rx.fillText(ci === 0 ? s + s + s : s + s, col[1], y);
          rx.font = '700 30px ' + MONO; rx.fillStyle = '#f4e3b0'; rx.fillText(col[3] + NAMES[s] + (ci === 0 && i === 0 ? ' (Jackpot)' : ''), col[1] + (ci === 0 ? 150 : 100), y, ci === 0 ? 330 : 380);
          rx.textAlign = 'right'; rx.font = '800 34px ' + MONO; rx.fillStyle = '#ffd24a'; rx.fillText(mx(col[2][s]), col[1] + 620, y); rx.textAlign = 'left';
        });
      });
      rx.textAlign = 'center'; rx.fillStyle = '#9a8a58'; rx.font = '600 26px ' + MONO; rx.fillText('Mise maximale : 100 000 €', 700, 692);
      rTex.needsUpdate = true;
    })();
    var rulesMat = new THREE.MeshBasicMaterial({ map: rTex });
    var pcv = mkCanvas(768, 192), px = pcv.getContext('2d'), pTex = mkTex(pcv);
    function drawPlaque(full) {
      var W = 768, H = 192, col = full ? '#ff8a8a' : '#f3cf62', col2 = full ? '#b83a3a' : '#a07d1a';
      px.clearRect(0, 0, W, H);
      px.save(); px.shadowColor = full ? 'rgba(255,90,90,0.8)' : 'rgba(255,200,60,0.8)'; px.shadowBlur = 22;
      roundRectPath(px, 22, 22, W - 44, H - 44, 48);
      var g = px.createLinearGradient(0, 22, 0, H - 22); g.addColorStop(0, 'rgba(34,20,12,0.96)'); g.addColorStop(1, 'rgba(10,6,6,0.96)');
      px.fillStyle = g; px.fill(); px.restore();
      var bg = px.createLinearGradient(0, 0, W, 0); bg.addColorStop(0, col2); bg.addColorStop(0.5, col); bg.addColorStop(1, col2);
      roundRectPath(px, 22, 22, W - 44, H - 44, 48); px.strokeStyle = bg; px.lineWidth = 5; px.stroke();
      // icône : coins (agrandir) ou coins rentrants (quitter)
      px.strokeStyle = col; px.lineWidth = 7; px.lineCap = 'round'; px.lineJoin = 'round';
      var cx = 120, cy = H / 2, r = 34, k = 16;
      px.beginPath();
      if (!full) {
        px.moveTo(cx - r, cy - r + k); px.lineTo(cx - r, cy - r); px.lineTo(cx - r + k, cy - r);
        px.moveTo(cx + r, cy - r + k); px.lineTo(cx + r, cy - r); px.lineTo(cx + r - k, cy - r);
        px.moveTo(cx - r, cy + r - k); px.lineTo(cx - r, cy + r); px.lineTo(cx - r + k, cy + r);
        px.moveTo(cx + r, cy + r - k); px.lineTo(cx + r, cy + r); px.lineTo(cx + r - k, cy + r);
      } else {
        px.moveTo(cx - r, cy - r + k + 6); px.lineTo(cx - r + k + 6, cy - r + k + 6); px.lineTo(cx - r + k + 6, cy - r);
        px.moveTo(cx + r, cy - r + k + 6); px.lineTo(cx + r - k - 6, cy - r + k + 6); px.lineTo(cx + r - k - 6, cy - r);
        px.moveTo(cx - r, cy + r - k - 6); px.lineTo(cx - r + k + 6, cy + r - k - 6); px.lineTo(cx - r + k + 6, cy + r);
        px.moveTo(cx + r, cy + r - k - 6); px.lineTo(cx + r - k - 6, cy + r - k - 6); px.lineTo(cx + r - k - 6, cy + r);
      }
      px.stroke();
      px.fillStyle = col; px.textAlign = 'left'; px.textBaseline = 'middle'; px.font = '700 ' + (full ? 40 : 50) + 'px ' + SERIF;
      try { px.letterSpacing = '3px'; } catch (e) { /* ancien navigateur */ }
      px.fillText(full ? 'QUITTER LE GRAND ÉCRAN' : 'GRAND ÉCRAN', 190, H / 2 + 3, 520);
      try { px.letterSpacing = '0px'; } catch (e) { /* ok */ }
      pTex.needsUpdate = true;
    }
    drawPlaque(false);
    var plaques = [];
    [[-1, Math.PI / 2], [1, -Math.PI / 2]].forEach(function (s) {
      var x = s[0] * (ROOM.wall - 0.06);
      var fr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.5, 8.7), goldMat); fr.position.set(x - s[0] * 0.01, 4.0, 4.5); scene.add(fr);
      var rb = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.32), rulesMat); rb.position.set(x + (-s[0]) * 0.06, 4.0, 4.5); rb.rotation.y = s[1]; scene.add(rb);
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: pTex, transparent: true }));
      pl.position.set(x + (-s[0]) * 0.09, 1.45, 4.5); pl.rotation.y = s[1]; pl.userData.action = 'fs'; scene.add(pl); plaques.push(pl);
    });
    return { drawBoard: drawBoard, drawPlaque: drawPlaque, plaques: plaques };
  }

  // Meilleur gain de chaque joueur (comptes connus du navigateur), du plus gros au plus petit
  function topSlotWins() {
    var out = [];
    try {
      var db = typeof getAccountsDB === 'function' ? getAccountsDB() : {};
      var meKey = (typeof state !== 'undefined' && state && state.username ? state.username : '').toLowerCase().trim();
      var seenMe = false;
      Object.keys(db).forEach(function (k) {
        var a = db[k];
        if (k.indexOf('__') === 0 || !a || !a.username) return;
        if (typeof isUsernameBanned === 'function' && isUsernameBanned(k)) return;
        var isMe = !!meKey && a.username.toLowerCase().trim() === meKey;
        var best = Math.max(a.slotBestWin || 0, (a.data && a.data.slotBestWin) || 0, isMe && state ? state.slotBestWin || 0 : 0);
        if (isMe) seenMe = true;
        if (best > 0) out.push({ name: a.username, emoji: a.avatarEmoji || '', win: best, me: isMe });
      });
      if (!seenMe && meKey && state.slotBestWin > 0) out.push({ name: state.username, emoji: state.avatarEmoji || '', win: state.slotBestWin, me: true });
    } catch (e) { /* données pas encore chargées */ }
    out.sort(function (x, y) { return y.win - x.win; });
    return out.slice(0, 5);
  }

  /* ===================================================================
     LA SALLE DES MACHINES (branchée sur le monde commun world3d.js)
     6 bornes en arc de cercle ; on s'assoit sur une seule, c'est elle que le jeu fait tourner.
     =================================================================== */
  function createSlotsRoom(world, cfg) {
    var low = world.low;
    var room = {
      title: 'SALLE DES MACHINES', subtitle: 'CHOISIS TA BORNE', topic: 'flambeurs-slots-room',
      group: new THREE.Group(), doors: [], interactables: [], colliders: [], cabs: [],
      seatCab: null, view: { yaw: 0, pitch: 0.06, yawG: 0, pitchG: 0.06, r: 3.2, rG: 3.2, ty: 1.95, tyG: 1.95, fov: 40, fovG: 40, mode: 'play', lastDrag: -99 },
      aspect: 1
    };
    var built = buildRoom(room.group, low);
    built.drawBoard(topSlotWins());
    room.bounds = { xMin: -ROOM.xMax, xMax: ROOM.xMax, zMin: ROOM.zMin, zMax: ROOM.zMax };

    // bornes en arc de cercle, tournées vers le centre (même salle sur PC et téléphone)
    var n = 6;
    for (var i = 0; i < n; i++) {
      (function (i) {
        var th = (i - (n - 1) / 2) * ARC.stepDeg * Math.PI / 180;
        var px = ARC.cx + ARC.r * Math.sin(th), pz = ARC.cz - ARC.r * Math.cos(th);
        var cab = createSlotCabinet({ low: low, lights: false, position: new THREE.Vector3(px, 0, pz), rotationY: -th, label: 'BORNE ' + (i + 1), message: 'Libre — viens jouer !' });
        room.group.add(cab.group);
        var e = { cab: cab, x: px, z: pz, rotY: -th, n: i + 1, occBy: null };
        room.cabs.push(e);
        room.colliders.push({ x: px, z: pz, r: 1.15 });
        room.interactables.push({
          hit: cab.hit, x: px + Math.sin(-th) * 2.1, z: pz + Math.cos(-th) * 2.1, radius: 1.8,
          enabled: function () { return !e.occBy; },
          prompt: function () { return '🪑 S\'asseoir — Borne ' + e.n; },
          use: function () { room.sit(e); }
        });
      })(i);
    }
    room.cab = room.cabs[Math.floor(n / 2)].cab;   // borne « active » (celle de l'assise)
    built.plaques.forEach(function (pl) { room.interactables.push({ hit: pl, use: function () { world.setFull(!world.full); } }); });

    // porte de sortie vers le hall (seulement dans le monde complet)
    if (cfg && cfg.hall) world.addDoor(room, { x: 0, z: ROOM.front - 0.02, nx: 0, nz: -1, w: 1.7, label: 'HALL', sub: 'Sortie', color: 0xffe9b0, target: 'hall' });

    room.spawn = function () { return { x: 0, z: 8.2, yaw: 0 }; };
    room.hint = function (w) {
      return w.touch ? 'Joystick : marcher · glisse : regarder · touche une borne pour t\'asseoir · règles sur les murs de côté'
        : w.full ? 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · la souris tourne la vue (bords de l\'écran) · clic sur une borne : s\'asseoir · Échap : quitter'
        : 'ZQSD / flèches : marcher · Maj : courir · Espace : sauter · clique-glisse : regarder · clic sur une borne : s\'asseoir · règles sur les murs de côté';
    };

    /* ---------- interface propre aux machines ---------- */
    room.hudTop = '<button class="s3d-cam s3d-seat-only" data-s3d="stand">🚶 Se lever</button><button class="s3d-cam s3d-seat-only" data-s3d="cam">🔭 Reculer</button>';
    room.hudBottom =
      '<div class="s3d-bottom s3d-seat-only"><div class="s3d-chips">' +
      '<button data-bet="50">50</button><button data-bet="500">500</button><button data-bet="5000">5k</button><button data-bet="25000">25k</button><button data-bet="100000">MAX</button></div>' +
      '<div class="s3d-row"><button class="s3d-step" data-d="-1" aria-label="Mise moins">−</button>' +
      '<div class="s3d-bet">MISE<b data-s3d="bet">50</b></div><button class="s3d-step" data-d="1" aria-label="Mise plus">+</button>' +
      '<button class="s3d-spin" data-s3d="spin">🔴 TIRER</button></div></div>';
    room.bindHud = function (hud) {
      function q(k) { return hud.querySelector('[data-s3d="' + k + '"]'); }
      room.elBet = q('bet'); room.elSpin = q('spin'); room.elCam = q('cam'); room.elStand = q('stand');
      room.elCam.addEventListener('click', function () { room.toggleCamera(); });
      room.elStand.addEventListener('click', function () { room.stand(); });
      room.elSpin.addEventListener('click', function (e) { room.doSpin(e); });
      hud.querySelectorAll('[data-bet]').forEach(function (b) { b.addEventListener('click', function () { room.setBet(parseInt(b.getAttribute('data-bet'), 10)); }); });
      hud.querySelectorAll('[data-d]').forEach(function (b) { b.addEventListener('click', function () { room.stepBet(parseInt(b.getAttribute('data-d'), 10)); }); });
    };
    function betInput() { return document.getElementById('slotBetInput'); }
    room.setBet = function (v) {
      if (typeof window.setSlotQuickBet === 'function') window.setSlotQuickBet(v);
      else { var el = betInput(); if (el) el.value = v; }
      room.syncHud();
    };
    room.stepBet = function (d) {
      var el = betInput(); if (!el) return;
      var cur = parseInt(el.value, 10) || 50, k;
      if (d > 0) { for (k = 0; k < BET_STEPS.length; k++) if (BET_STEPS[k] > cur) { room.setBet(BET_STEPS[k]); return; } room.setBet(BET_STEPS[BET_STEPS.length - 1]); }
      else { for (k = BET_STEPS.length - 1; k >= 0; k--) if (BET_STEPS[k] < cur) { room.setBet(BET_STEPS[k]); return; } room.setBet(BET_STEPS[0]); }
    };
    room.doSpin = function (e) {
      if (world.mode !== 'seat' || world.blend < 1 || room.cab.isBusy()) return;
      if (typeof window.pullSlotLever === 'function') window.pullSlotLever(e);
    };
    room.syncHud = function () {
      if (!room.elBet) return;
      var el = betInput(), bet = el ? (parseInt(el.value, 10) || 0) : 0;
      room.elBet.textContent = fmtN(bet);
      if (world.mode === 'seat') room.cab.setBet(bet);
      var busy = room.cab.isBusy(); room.elSpin.disabled = busy; room.elStand.disabled = busy;
      room.elSpin.textContent = busy ? '… EN COURS' : '🔴 TIRER';
      var box = document.getElementById('slotCabinetBox'), trim = SKINS[''];
      if (box) Object.keys(SKINS).forEach(function (k) { if (k && box.classList.contains(k)) trim = SKINS[k]; });
      room.cabs.forEach(function (c) { c.cab.setTrim(trim); });
    };

    /* ---------- s'asseoir / se lever / caméra à la borne ---------- */
    room.computeGoals = function () {
      var v = room.view, aspect = room.aspect, fov = aspect < 0.9 ? 50 : 38, t = Math.tan(fov * Math.PI / 360);
      if (v.mode === 'play') { v.rG = Math.max(2.2 / 2 / t, 2.7 / 2 / (t * aspect)); v.tyG = 1.95; v.pitchG = 0.06; }
      else { v.rG = Math.max(5.2 / 2 / t, 4.4 / 2 / (t * aspect)); v.tyG = 1.65; v.pitchG = 0.2; }
      v.fovG = fov;
    };
    room.onResize = function (w, h) { room.aspect = w / h; room.computeGoals(); var v = room.view; v.r = v.rG; v.ty = v.tyG; v.fov = v.fovG; };
    room.sit = function (entry) {
      if (world.mode === 'seat' || !entry || world.trans) return;
      if (entry.occBy) { world.flash('Borne ' + entry.n + ' occupée par ' + entry.occBy + ' — choisis-en une autre'); return; }
      room.seatCab = entry; room.cab = entry.cab; world.sitDown(room);
      var v = room.view; v.mode = 'play'; v.yaw = v.yawG = 0; v.lastDrag = -99;
      if (room.elCam) room.elCam.textContent = '🔭 Reculer';
      entry.cab.setMessage('Tire le levier !');
      room.computeGoals(); v.r = v.rG; v.ty = v.tyG; v.fov = v.fovG; v.pitch = v.pitchG;
      room.syncHud();
      world.post('/api/slots', { action: 'sit', seat: entry.n - 1 }).then(function (r) {
        if (r && r.ok === false && r._status === 409 && room.seatCab === entry) { room.stand(true); world.flash(r.error || 'Borne occupée.'); }
      });
    };
    room.stand = function (force) {
      if (world.mode !== 'seat' || !room.seatCab || (room.cab.isBusy() && !force)) return;
      world.post('/api/slots', { action: 'stand' });
      var e = room.seatCab;
      world.standUp(e.x + Math.sin(e.rotY) * 2.3, e.z + Math.cos(e.rotY) * 2.3, -e.rotY);
      e.cab.setMessage('Libre — viens jouer !');
      room.seatCab = null;
    };
    room.forceStand = function () { room.stand(true); };
    room.toggleCamera = function () {
      if (world.mode !== 'seat') return;
      var v = room.view;
      v.mode = v.mode === 'play' ? 'far' : 'play'; v.yawG = 0; v.lastDrag = -99;
      room.elCam.textContent = v.mode === 'play' ? '🔭 Reculer' : '🎯 Rapprocher';
      room.computeGoals();
    };
    room.seatPose = function (dt, ctx) {
      var e = room.seatCab; if (!e) return null;
      var v = room.view, k = 1 - Math.exp(-dt * 4);
      room.aspect = ctx.aspect;
      if (ctx.mouseLook) {
        v.yawG = ctx.dz(ctx.ms.nx, 0.15) * (v.mode === 'play' ? 0.9 : 2.4);
        v.pitchG = (v.mode === 'play' ? 0.06 : 0.2) + ctx.dz(ctx.ms.ny, 0.15) * 0.22;
        v.lastDrag = ctx.clock;
      }
      if (v.mode === 'play' && ctx.clock - v.lastDrag > 3) { v.yawG = 0; v.pitchG = 0.06; }
      v.yaw += (v.yawG - v.yaw) * k; v.pitch += (v.pitchG - v.pitch) * k;
      v.r += (v.rG - v.r) * k; v.ty += (v.tyG - v.ty) * k; v.fov += (v.fovG - v.fov) * k;
      var cp = Math.cos(v.pitch), lx = Math.sin(v.yaw) * cp * v.r, lz = 0.3 + Math.cos(v.yaw) * cp * v.r;
      var sn = Math.sin(e.rotY), cs = Math.cos(e.rotY);
      var sx = e.x + lx * cs + lz * sn, sz = e.z - lx * sn + lz * cs, sy = v.ty + Math.sin(v.pitch) * v.r;
      var sh = room.cab.getShake();
      if (sh > 0) { sx += Math.sin(ctx.clock * 61) * sh * v.r; sy += Math.cos(ctx.clock * 53) * sh * v.r; }
      return { cx: sx, cy: sy, cz: sz, tx: e.x + 0.3 * sn, ty: v.ty, tz: e.z + 0.3 * cs, fov: v.fov };
    };
    room.seatDragStart = function () { return { yaw: room.view.yawG, pitch: room.view.pitchG }; };
    room.seatDrag = function (drag, dx, dy, w) {
      var v = room.view, lim = v.mode === 'play' ? 0.9 : Math.PI;
      v.yawG = Math.max(-lim, Math.min(lim, drag.seat.yaw - dx * 0.007));
      if (drag.mouse) v.pitchG = Math.max(-0.05, Math.min(0.75, drag.seat.pitch + dy * 0.005));
      v.lastDrag = w.clock;
    };
    room.seatClick = function (ray, e) {
      var hit = ray.intersectObjects(room.cab.buttons, false)[0];
      if (!hit) return;
      var a = hit.object.userData.action;
      room.cab.pressButton(hit.object);
      if (a === 'spin') room.doSpin(e);
      else if (a === 'betDown') room.stepBet(-1);
      else if (a === 'betUp') room.stepBet(1);
      else if (a === 'max') room.setBet(100000);
    };

    /* ---------- les autres joueurs ---------- */
    room.seatPos = function () {
      var e = room.seatCab;
      return e ? { seat: e.n - 1, x: e.x + Math.sin(e.rotY) * 2.2, z: e.z + Math.cos(e.rotY) * 2.2, yaw: -e.rotY } : null;
    };
    room.remotePose = function (r) {
      var e = room.cabs[r.seat];
      return e ? { x: e.x + Math.sin(e.rotY) * 1.6, z: e.z + Math.cos(e.rotY) * 1.6, yaw: -e.rotY } : null;
    };
    room.remoteFx = function (r, fx) {
      var key = fx.id + ':' + fx.phase, e = room.cabs[r.seat];
      if (r.lastFx === key || !e) return;
      r.lastFx = key;
      var cab = e.cab;
      if (fx.phase === 'start') { if (!cab.isSpinning()) cab.startSpin(); }
      else if (fx.finals) {
        if (!cab.isSpinning()) cab.startSpin();
        cab.stopReels(fx.finals, function () { cab.showResult(fx.finals, fx.mult || 0, fx.win || 0, fx.bet || 0); });
      }
    };
    room.onRtMsg = function (ev, m, r) { if (ev === 'fx' && m.fx && r && r.seat >= 0) room.remoteFx(r, m.fx); };

    // serveur du site : qui est assis où (autorité sur les places) + secours si le temps réel est coupé
    room.netStart = function () { room.netOn = true; room.netTick(); };
    room.netStop = function () {
      room.netOn = false; clearTimeout(room.netTimer);
      world.post('/api/slots', { action: 'leave' });
      room.occ = {};
      room.cabs.forEach(function (e) { if (e.occBy) { e.occBy = null; if (e !== room.seatCab) e.cab.setMessage('Libre — viens jouer !'); } });
    };
    room.onPause = function () { /* netStop est appelé par le monde */ };
    room.netTick = function () {
      if (!room.netOn || world.dead) return;
      var next = function () { if (room.netOn && !world.dead) room.netTimer = setTimeout(room.netTick, (world.rt && world.rt.ready) ? 800 : 220); };
      if (document.hidden) { next(); return; }
      var p = world.player, sp = room.seatPos(), x = p.x, z = p.z, yaw = p.yaw;
      if (sp) { x = sp.x; z = sp.z; yaw = sp.yaw; }
      var pv = world.pv, moving = !sp && (Math.hypot(pv.x, pv.z) > 0.15 || p.air || Math.abs(yaw - (room._lastYaw || 0)) > 0.02);
      var nowT = performance.now(), rtOk = world.rt && world.rt.ready;
      var due = rtOk ? (!room._lastSend || nowT - room._lastSend > 1200) : (moving || room._wasMoving || !room._lastSend || nowT - room._lastSend > 1800);
      room._wasMoving = moving; room._lastYaw = yaw;
      var req;
      if (F.token() && due) {
        room._lastSend = nowT;
        req = world.post('/api/slots', { action: 'presence', x: x, z: z, yaw: yaw, vx: sp ? 0 : pv.x, vz: sp ? 0 : pv.z, run: !!world.running2, jmp: p.jmp || 0 });
      } else req = fetch('/api/slots').then(function (r) { return r.json(); }).catch(function () { return null; });
      req.then(function (d) { if (d && d.players) room.applyNet(d); next(); });
    };
    room.applyNet = function (d) {
      var me = F.me(), seen = {}, i;
      room.occ = {};
      Object.keys(d.players).forEach(function (k) {
        var p = d.players[k];
        if (k === me) {
          // le serveur m'a oublié alors que je suis assis (coupure réseau) : je reprends ma place
          if (world.mode === 'seat' && room.seatCab && p.seat !== room.seatCab.n - 1 && !room._resitting) {
            room._resitting = true;
            world.post('/api/slots', { action: 'sit', seat: room.seatCab.n - 1 }).then(function (r) {
              room._resitting = false;
              if (r && r.ok === false && r._status === 409) { room.stand(true); world.flash(r.error || 'Borne occupée.'); }
            });
          }
          return;
        }
        seen[k] = true;
        if (p.seat >= 0) room.occ[p.seat] = p.name;
        var r = world.ensureRemote(k, p.name, p.avatar, p.x, p.z, p.yaw);
        r.seat = p.seat;
        if (!(r.rtT && performance.now() - r.rtT < 1500)) {      // le temps réel est plus précis : on ne le contredit pas
          r.tx = p.x; r.tz = p.z; r.tyaw = p.yaw; r.vx = p.vx || 0; r.vz = p.vz || 0; r.recv = performance.now();
          if ((p.jmp || 0) !== r.jmp) { if (!r.fresh) r.jt = 0; r.jmp = p.jmp || 0; }
        }
        var fx = p.fx;
        if (fx && p.seat >= 0 && room.cabs[p.seat]) {
          if (r.lastFx !== fx.id + ':' + fx.phase && !r.fresh) room.remoteFx(r, fx);
          else if (r.fresh) r.lastFx = fx.id + ':' + fx.phase;
        }
        r.fresh = false;
      });
      Object.keys(world.remote).forEach(function (k) { var rr = world.remote[k]; if (!seen[k] && !(rr.rtT && performance.now() - rr.rtT < 4000)) world.removeRemote(k); });
      for (i = 0; i < room.cabs.length; i++) {      // étiquette « occupée / libre » sur l'écran de chaque borne
        var ent = room.cabs[i], who = room.occ[i] || null;
        if (ent.occBy !== who) {
          ent.occBy = who;
          if (ent !== room.seatCab) ent.cab.setMessage(who ? 'Occupée — ' + who : 'Libre — viens jouer !');
        }
      }
    };

    /* ---------- le tirage (appelé par la page, voir Slots3D plus bas) ---------- */
    room.sendFx = function (phase, finals, mult, win, bet) {
      if (phase === 'start') room.fxId = Date.now().toString(36) + Math.floor(Math.random() * 99);
      var fxo = { id: room.fxId || String(Date.now()), phase: phase, finals: finals, mult: mult, win: win, bet: bet };
      if (world.rt && room.seatCab) world.rt.send('fx', { k: F.me(), fx: fxo });
      world.post('/api/slots', Object.assign({ action: 'fx' }, fxo));
    };
    room.spinStart = function () { room.cab.startSpin(); room.sendFx('start'); };
    room.spinResult = function (finals, mult, win, bet) {
      var cab = room.cab;
      cab.stopReels(finals, function () { cab.showResult(finals, mult || 0, win || 0, bet || 0); });
      room.sendFx('result', finals, mult || 0, win || 0, bet || 0);
    };
    room.spinError = function () { room.cab.abortSpin(); };

    /* ---------- vie de la salle ---------- */
    room.update = function (dt) {
      for (var i = 0; i < room.cabs.length; i++) room.cabs[i].cab.update(dt);
      room.boardT = (room.boardT || 0) + dt;
      if (room.boardT > 5) { room.boardT = 0; built.drawBoard(topSlotWins()); }
    };
    room.onFull = function (on) { built.drawPlaque(on); };
    room.onEnter = function () { setTimeout(function () { if (!world.dead) built.drawPlaque(world.full); }, 1500); };   // polices chargées
    room.dispose = function () { room.cabs.forEach(function (e) { e.cab.dispose(); }); };
    return room;
  }
  F.registerRoom('slots', createSlotsRoom);

  /* ===================================================================
     PONT AVEC LA PAGE (branché sur pullSlotLever, sans toucher au jeu)
     =================================================================== */
  function stage() { return document.getElementById('slot3dStage'); }
  function classicWrap() { return document.getElementById('slotClassicWrap'); }
  function showRulesPanelOnPc() { var p = document.getElementById('slotRulesPanel'); if (p) p.classList.remove('lg:hidden'); }

  window.Slots3D = {
    createSlotCabinet: createSlotCabinet,
    levelFor: levelFor,
    // vue « Machine à sous » de la page : téléphone = salle 3D seule ; PC = machine classique (le PC passe par le monde 3D)
    open: function () {
      var cw = classicWrap(), st = stage();
      if (!F.isMobile() && !F.isTouch()) {
        if (st) st.classList.add('hidden');
        if (cw) cw.classList.remove('hidden');
        showRulesPanelOnPc();
        return false;
      }
      if (!F.openSolo()) { showRulesPanelOnPc(); return false; }
      if (cw) cw.classList.add('hidden');
      return true;
    },
    close: function () { F.closeSolo(); },
    isActive: function () { return !!F.getSlotsRoom(); },
    getExperience: function () { return F.getWorld(); },
    onSpinStart: function () { var r = F.getSlotsRoom(); if (r) r.spinStart(); },
    onResult: function (finals, mult, win, bet) { var r = F.getSlotsRoom(); if (r) r.spinResult(finals, mult, win, bet); },
    onError: function () { var r = F.getSlotsRoom(); if (r) r.spinError(); }
  };
})();
