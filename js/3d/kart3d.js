/* =====================================================================
   kart3d.js — GRAND PRIX DE NUIT : course de voitures entre joueurs (PC uniquement, clavier ou manette)
   ---------------------------------------------------------------------
   • Salle « kart » : on y entre par la porte « COURSE » du salon des mini jeux. Un circuit de rue de nuit (inspiré du circuit de Singapour),
     tracé dans le code : 1,2 km, 3 tours, 8 points de contrôle, bordures, barrières, tribune, gratte-ciel, baie et grande roue.
   • Les courses s'enchaînent toutes seules, au rythme de l'horloge (même heure pour tout le monde, aucun serveur) :
     20 s de grille (choix de la voiture) → compte à rebours 3 s → course (135 s max) → résultats. Tous les joueurs présents courent ensemble.
   • Chaque joueur simule sa propre voiture et envoie sa position (~12 fois/s, message « kp ») ; les voitures se cognent entre elles : chacun
     repousse sa propre voiture quand elle touche celle d'un autre.
   • Commandes — clavier : ZQSD / flèches (accélérer, freiner, tourner), Espace : frein à main (dérapage : relâche après un long dérapage = turbo),
     R : replacer au dernier point de contrôle, C : changer de vue, L : regarder derrière.
     Manette : stick gauche (tourner), RT (accélérer), LT (freiner / marche arrière), A ou RB (frein à main), X (replacer), Y (vue), LB/RB sur la grille : voiture.
   • TOUT passe par le serveur (api/_doKart.js, WebSocket /ws/kart) : il fait avancer toutes les voitures, gère les chocs, les tours et le classement.
     Ici le navigateur envoie ses touches 30 fois par seconde, PRÉDIT sa propre voiture (pour qu'elle réponde tout de suite) et se recale sur le serveur.
   • Les voitures viennent de assets/voitures/*.glb (modèles allégés : voir le dossier « Voiture » des documents de l'utilisateur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var KS = F.kartSim;
  if (!KS) return;
  var LAPS = KS.LAPS, NCP = KS.NCP, ROAD_HALF = KS.ROAD_HALF, CURB_W = KS.CURB_W, WALL_OFF = KS.WALL_OFF, CAR_R = KS.CAR_R;
  var GRID_MS = KS.GRID_MS, COUNT_MS = KS.COUNT_MS, RACE_MS = KS.RACE_MS, CYC_MS = KS.CYC_MS, VMAX = KS.VMAX, ACC = KS.ACC, BRK = KS.BRK, CTRL = KS.CTRL;

  // les voitures (nose : vers où pointe le nez du modèle d'origine ; L : longueur en mètres dans le jeu)
  var CARS = [
    { id: 'eb110', name: 'Bugatti EB110', file: 'assets/voitures/eb110.glb', nose: '+z', L: 4.5 },
    { id: 'gt3r', name: 'Porsche 911 GT3 R', file: 'assets/voitures/gt3r.glb', nose: '+z', L: 4.6 },
    { id: 'ferrari', name: 'Ferrari 849 Testarossa', file: 'assets/voitures/ferrari.glb', nose: '+z', L: 4.6 },
    { id: 'rb22', name: 'Red Bull RB22', file: 'assets/voitures/rb22.glb', nose: '+z', L: 5.2 },
    { id: 'bolide', name: 'Bugatti Bolide', file: 'assets/voitures/bolide.glb', nose: '+z', L: 4.6 },
    { id: 'noire', name: 'Bugatti La Voiture Noire', file: 'assets/voitures/noire.glb', nose: '+z', L: 4.9 },
    { id: 'muscle', name: 'Muscle car', file: 'assets/voitures/muscle.glb', nose: '+z', L: 4.8 },
    { id: 'mystery', name: 'Mystery Machine', file: 'assets/voitures/mystery.glb', nose: '+z', L: 5.0 }
  ];
  var CAR_BY = {}; CARS.forEach(function (c, i) { c.i = i; CAR_BY[c.id] = c; });

  /* ------------------------------------------------------------------ le circuit ------------------------------------------------------------------ */
  var TRK = KS.TRK;

  /* ------------------------------------------------------------------ petits utilitaires ------------------------------------------------------------------ */
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var angDiff = KS.angDiff;
  function fmtT(ms) { if (!(ms >= 0)) return '--:--.-'; var s = ms / 1000, m = Math.floor(s / 60); return m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4); }
  var srvOff = 0;                                           // écart entre l'horloge du serveur et la mienne (mise à jour à chaque instantané)
  function nowMs() { return Date.now() + srvOff; }
  var AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function sfxVol() { try { var A = F.audio; return A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; } catch (e) { return 0.7; } }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a) return; var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol()), t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay) {
    var a = ac(); if (!a) return; var t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 2000; g.gain.value = vol * sfxVol();
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }

  /* ------------------------------------------------------------------ chargement des voitures (partagé par tous les clients de la page) ------------------------------------------------------------------ */
  var envTex = null, carCache = {}, carWait = {};
  function envMap() {
    if (envTex) return envTex;
    var c = mkCanvas(512, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1a2358'); g.addColorStop(0.45, '#4a4f9a'); g.addColorStop(0.55, '#c8a0c8'); g.addColorStop(0.6, '#2b2f5e'); g.addColorStop(1, '#10142b'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    var r = rng(5); for (var i = 0; i < 60; i++) { x.fillStyle = ['rgba(255,190,110,0.9)', 'rgba(255,110,190,0.9)', 'rgba(110,220,255,0.9)', 'rgba(255,255,255,0.9)'][i % 4]; x.fillRect(r() * 512, 112 + r() * 40, 2 + r() * 10, 3 + r() * 26); }
    envTex = new THREE.CanvasTexture(c); envTex.mapping = THREE.EquirectangularReflectionMapping; return envTex;
  }
  function prepCar(scene, cfg) {
    var root = new THREE.Group(), inner = scene;
    var rot = { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[cfg.nose || '-z'];
    var holder = new THREE.Group(); holder.add(inner); holder.rotation.y = rot; root.add(holder); root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root), sz = new THREE.Vector3(), c = new THREE.Vector3(); box.getSize(sz); box.getCenter(c);
    var k = cfg.L / Math.max(0.001, sz.z);
    holder.scale.setScalar(k); holder.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    root.traverse(function (o) {
      o.frustumCulled = false;
      if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.isMeshStandardMaterial) { m.envMap = envMap(); m.envMapIntensity = 0.9; if (m.metalness > 0.6) m.metalness = 0.6; m.needsUpdate = true; } });
    });
    root.userData.w = sz.x * k; root.userData.len = cfg.L; return root;
  }
  function loadCar(id, cb) {
    var cfg = CAR_BY[id] || CARS[0];
    if (carCache[cfg.id]) { cb(carCache[cfg.id].clone(true)); return; }
    (carWait[cfg.id] = carWait[cfg.id] || []).push(cb);
    if (carWait[cfg.id].length > 1 || !THREE.GLTFLoader) return;
    new THREE.GLTFLoader().load(cfg.file + '?v=1', function (gl) {
      carCache[cfg.id] = prepCar(gl.scene, cfg); var w = carWait[cfg.id]; carWait[cfg.id] = null; w.forEach(function (f) { try { f(carCache[cfg.id].clone(true)); } catch (e) { /* ok */ } });
    }, undefined, function () { carWait[cfg.id] = null; });
  }
  function placeholderCar(col) {
    var g = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.4), new THREE.MeshBasicMaterial({ color: col })); b.position.y = 0.6; g.add(b);
    var t = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2), new THREE.MeshBasicMaterial({ color: 0x223 })); t.position.set(0, 1.2, 0.3); g.add(t); return g;
  }

  /* ------------------------------------------------------------------ interface (CSS) ------------------------------------------------------------------ */
  function injectCss() {
    if (document.getElementById('kart3d-css')) return;
    var s = document.createElement('style'); s.id = 'kart3d-css';
    s.textContent =
      '.kt-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:#fff}' +
      '.kt-box{background:rgba(8,6,20,.78);border:1px solid rgba(255,255,255,.18);border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.kt-info{position:absolute;left:14px;top:14px;padding:9px 14px;min-width:190px}.kt-info .p{font-size:34px;font-weight:900;line-height:1}.kt-info .p small{font-size:16px;opacity:.7}.kt-info .l{font-size:15px;font-weight:800;margin-top:4px}.kt-info .t{font-size:13px;font-weight:700;opacity:.85;margin-top:3px;font-family:' + MONO + '}.kt-info .c{font-size:12px;font-weight:700;opacity:.7;margin-top:2px}' +
      '.kt-mini{position:absolute;right:14px;top:76px;padding:6px}.kt-mini canvas{display:block}' +
      '.kt-spd{position:absolute;right:20px;bottom:76px;text-align:right;padding:6px 16px}.kt-spd b{font-size:44px;font-weight:900;font-family:' + MONO + '}.kt-spd small{font-size:14px;opacity:.7;margin-left:4px}.kt-spd .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.15);margin-top:3px;overflow:hidden}.kt-spd .bar i{display:block;height:100%;background:linear-gradient(90deg,#3ddc84,#ffd23f,#ff4d4d)}' +
      '.kt-big{position:absolute;left:46%;top:24%;transform:translate(-50%,-50%);text-align:center;font-weight:900;text-shadow:0 4px 0 #000,0 0 30px rgba(0,0,0,.8);font-size:clamp(40px,7vw,84px);white-space:nowrap}.kt-big small{display:block;font-size:.28em;margin-top:6px;opacity:.95}' +
      '.kt-wrong{position:absolute;left:50%;top:44%;transform:translateX(-50%);color:#ff5050;font-weight:900;font-size:34px;text-shadow:0 2px 0 #000;display:none}' +
      '.kt-btns{position:absolute;left:14px;bottom:78px;display:flex;gap:7px;pointer-events:auto}.kt-btns button{padding:8px 13px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(8,6,20,.82);color:#fff;font-weight:800;font-size:13px;cursor:pointer}.kt-btns button:hover{background:rgba(40,30,80,.92)}' +
      '.kt-grid{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);display:none;align-items:center;gap:10px;padding:8px 14px;pointer-events:auto}.kt-grid.on{display:flex}.kt-grid button{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(40,30,80,.9);color:#fff;font-size:18px;font-weight:900;cursor:pointer}.kt-grid .n{min-width:230px;text-align:center;font-weight:900;font-size:17px}.kt-grid .n small{display:block;font-size:11px;opacity:.7;font-weight:700}' +
      '.kt-help{position:absolute;left:14px;bottom:128px;max-width:330px;background:rgba(8,6,20,.6);border-radius:12px;padding:6px 12px;font-size:12px;font-weight:700;opacity:.9}' +
      '.kt-res{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(8,6,20,.94);border:2px solid rgba(255,255,255,.25);border-radius:18px;padding:16px 20px;display:none;min-width:360px;max-width:94vw;max-height:80vh;overflow:auto}.kt-res.on{display:block}.kt-res h3{margin:0 0 10px;text-align:center;font-size:21px}.kt-res table{width:100%;border-collapse:collapse;font-size:14px;font-weight:800}.kt-res td,.kt-res th{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}.kt-res td:last-child,.kt-res th:last-child{text-align:right}.kt-res tr.me td{color:#ffd23f}.kt-res .ft{text-align:center;margin-top:10px;font-size:13px;opacity:.85}' +
      '.kt-toast{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(.8);opacity:0;transition:opacity .2s,transform .3s;font-weight:900;font-size:clamp(22px,4vw,40px);text-shadow:0 3px 0 #000;white-space:nowrap}.kt-toast.in{opacity:1;transform:translate(-50%,-50%) scale(1)}';
    document.head.appendChild(s);
  }

  /* ==================================================================
     LA SALLE : le circuit et la course
     ================================================================== */
  function createKart(world) {
    var room = { title: '🏎️ GRAND PRIX DE NUIT', subtitle: 'COURSE ENTRE JOUEURS · 3 TOURS', topic: 'flambeurs-kart-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [], hideSelf: true, noHand: true };
    var g = room.group, i, N = TRK.N, DS = TRK.DS;
    room.bounds = { xMin: -600, xMax: 600, zMin: -600, zMax: 600 };
    var rnd = rng(77);

    /* ---------- le circuit : route, bordures, barrières ---------- */
    function ribbon(off0, off1, y, vScale) {
      var pos = [], uv = [], idx = [], k;
      for (k = 0; k <= N; k++) {
        var i0 = k % N, rx = -TRK.TZ[i0], rz = TRK.TX[i0];
        pos.push(TRK.PX[i0] + rx * off0, y, TRK.PZ[i0] + rz * off0, TRK.PX[i0] + rx * off1, y, TRK.PZ[i0] + rz * off1); uv.push(0, k * DS / vScale, 1, k * DS / vScale);
        if (k < N) { var a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); return gg;
    }
    function wallStrip(off, h, vScale) {
      var pos = [], uv = [], idx = [], k;
      for (k = 0; k <= N; k++) {
        var i0 = k % N, rx = -TRK.TZ[i0], rz = TRK.TX[i0], px = TRK.PX[i0] + rx * off, pz = TRK.PZ[i0] + rz * off;
        pos.push(px, 0, pz, px, h, pz); uv.push(k * DS / vScale, 0, k * DS / vScale, 1);
        if (k < N) { var a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); return gg;
    }
    var rc = mkCanvas(256, 512), rx = rc.getContext('2d');
    rx.fillStyle = '#262c4a'; rx.fillRect(0, 0, 256, 512);
    for (i = 0; i < 5000; i++) { rx.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255' : '0,0,20') + ',' + (rnd() * 0.07) + ')'; rx.fillRect(rnd() * 256, rnd() * 512, 2, 2); }
    rx.fillStyle = 'rgba(255,255,255,0.92)'; rx.fillRect(6, 0, 5, 512); rx.fillRect(245, 0, 5, 512); rx.fillRect(125, 0, 6, 128); rx.fillRect(125, 256, 6, 128);
    var rt = mkTex(rc); rt.wrapS = rt.wrapT = THREE.RepeatWrapping; rt.anisotropy = 8;
    g.add(new THREE.Mesh(ribbon(-ROAD_HALF, ROAD_HALF, 0.02, 16), new THREE.MeshBasicMaterial({ map: rt })));
    var cc = mkCanvas(64, 64), cx = cc.getContext('2d'); cx.fillStyle = '#e62f2f'; cx.fillRect(0, 0, 64, 32); cx.fillStyle = '#f5f5f5'; cx.fillRect(0, 32, 64, 32);
    var ct = mkTex(cc); ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    var curbMat = new THREE.MeshBasicMaterial({ map: ct });
    g.add(new THREE.Mesh(ribbon(ROAD_HALF, ROAD_HALF + CURB_W, 0.03, 4.8), curbMat)); g.add(new THREE.Mesh(ribbon(-ROAD_HALF - CURB_W, -ROAD_HALF, 0.03, 4.8), curbMat));
    var wc = mkCanvas(512, 128), wx = wc.getContext('2d'); wx.fillStyle = '#12162e'; wx.fillRect(0, 0, 512, 128);
    wx.fillStyle = '#e8eaf2'; wx.fillRect(0, 0, 512, 10); wx.fillRect(0, 118, 512, 10);
    wx.textAlign = 'center'; wx.textBaseline = 'middle'; wx.font = '900 54px ' + SERIF; wx.fillStyle = '#ffd24a'; wx.fillText('LES FLAMBEURS', 256, 66, 480);
    var wt = mkTex(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.anisotropy = 8;
    var wallMat = new THREE.MeshBasicMaterial({ map: wt, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(wallStrip(WALL_OFF, 1.2, 8), wallMat)); g.add(new THREE.Mesh(wallStrip(-WALL_OFF, 1.2, 8), wallMat));
    var neonA = new THREE.Mesh(ribbon(WALL_OFF - 0.12, WALL_OFF + 0.12, 1.22, 8), new THREE.MeshBasicMaterial({ color: 0x22e5ff })), neonB = new THREE.Mesh(ribbon(-WALL_OFF - 0.12, -WALL_OFF + 0.12, 1.22, 8), new THREE.MeshBasicMaterial({ color: 0xff3df0 }));
    g.add(neonA); g.add(neonB);

    /* ---------- sol, baie, ciel ---------- */
    var skc = mkCanvas(64, 256), skx = skc.getContext('2d'), sg = skx.createLinearGradient(0, 0, 0, 256); sg.addColorStop(0, '#04051a'); sg.addColorStop(0.55, '#101a48'); sg.addColorStop(0.8, '#3a3a78'); sg.addColorStop(1, '#6a4a7a'); skx.fillStyle = sg; skx.fillRect(0, 0, 64, 256);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.MeshBasicMaterial({ map: mkTex(skc), side: THREE.BackSide, depthWrite: false, fog: false })); g.add(sky);
    var starP = []; for (i = 0; i < 400; i++) { var sa = rnd() * TAU, se = 0.15 + rnd() * 1.2; starP.push(Math.cos(sa) * Math.cos(se) * 850, Math.sin(se) * 850, Math.sin(sa) * Math.cos(se) * 850); }
    var sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.Float32BufferAttribute(starP, 3)); g.add(new THREE.Points(sgm, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })));
    var gnd = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshBasicMaterial({ color: 0x0d1128 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.06; g.add(gnd);
    var wtc = mkCanvas(256, 256), wtx = wtc.getContext('2d'); wtx.fillStyle = '#0a1a46'; wtx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 160; i++) { wtx.fillStyle = ['rgba(255,170,90,', 'rgba(255,100,190,', 'rgba(110,220,255,'][i % 3] + (0.1 + rnd() * 0.35) + ')'; wtx.fillRect(rnd() * 256, rnd() * 256, 6 + rnd() * 40, 1.5); }
    var wtt = mkTex(wtc); wtt.wrapS = wtt.wrapT = THREE.RepeatWrapping; wtt.repeat.set(14, 6);
    var water = new THREE.Mesh(new THREE.PlaneGeometry(1800, 640), new THREE.MeshBasicMaterial({ map: wtt })); water.rotation.x = -Math.PI / 2; water.position.set(0, -0.04, 410); g.add(water);

    /* ---------- gratte-ciel ---------- */
    function winTex(seed, cols) {
      var c = mkCanvas(128, 256), x = c.getContext('2d'), r = rng(seed); x.fillStyle = '#0a0f26'; x.fillRect(0, 0, 128, 256);
      for (var yy = 4; yy < 252; yy += 9) for (var xx = 4; xx < 124; xx += 9) { var v = r(); if (v < 0.55) { x.fillStyle = v < 0.2 ? cols[0] : v < 0.4 ? cols[1] : cols[2]; x.fillRect(xx, yy, 5, 6); } }
      var t = mkTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    }
    var winMats = [winTex(1, ['#ffd98a', '#fff3c4', '#9fd8ff']), winTex(2, ['#ffb0e0', '#ffe0f4', '#b0ffd8']), winTex(3, ['#8fd8ff', '#e0f4ff', '#ffd98a'])].map(function (t) { return new THREE.MeshBasicMaterial({ map: t }); });
    function tower(x, z, w, h, d, mi) {
      var geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, k;
      for (k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w + d) / 12, uv.getY(k) * h / 14);
      var m = new THREE.Mesh(geo, winMats[mi % 3]); m.position.set(x, h / 2, z); g.add(m); return m;
    }
    var placed = 0, tries = 0;
    while (placed < 90 && tries++ < 3000) {
      var bx = -420 + rnd() * 900, bz = -380 + rnd() * 700;
      if (bz > 95 && bz < 300) continue;                                  // la baie
      if (TRK.project(bx, bz).dist < 44) continue;
      var bw = 14 + rnd() * 28, bh = 25 + rnd() * (bz > 300 ? 150 : 85), bd = 14 + rnd() * 28;
      tower(bx, bz, bw, bh, bd, placed); placed++;
    }
    // le bâtiment à trois tours et son « bateau » sur le toit, au bord de la baie
    [-30, 0, 30].forEach(function (dx, k) { tower(110 + dx, 130, 20, 110, 28, 2); });
    var deck = new THREE.Mesh(new THREE.BoxGeometry(110, 7, 24), new THREE.MeshBasicMaterial({ color: 0xcfd3e6 })); deck.position.set(110, 113, 130); g.add(deck);
    var pool = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 10), new THREE.MeshBasicMaterial({ color: 0x3ad0ff })); pool.position.set(110, 117, 130); g.add(pool);
    // la grande roue
    var wheelG = new THREE.Group(); wheelG.position.set(-90, 52, 140); g.add(wheelG);
    var ringM = new THREE.MeshBasicMaterial({ color: 0xffd24a }); var ring1 = new THREE.Mesh(new THREE.TorusGeometry(46, 0.9, 8, 64), ringM); wheelG.add(ring1);
    for (i = 0; i < 16; i++) { var sp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 46, 0.25), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); sp.rotation.z = i / 16 * Math.PI; wheelG.add(sp); }
    var pods = new THREE.Group(); wheelG.add(pods); for (i = 0; i < 24; i++) { var pd = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5fa2 : 0x4de0ff })); var pa = i / 24 * TAU; pd.position.set(Math.cos(pa) * 46, Math.sin(pa) * 46, 0); pods.add(pd); }
    [-16, 16].forEach(function (dx) { var leg = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 2), new THREE.MeshBasicMaterial({ color: 0xc8cbe0 })); leg.position.set(-90 + dx * 0.5, 26, 140); leg.rotation.z = dx > 0 ? -0.2 : 0.2; g.add(leg); });

    /* ---------- tribune, lampadaires, arches ---------- */
    var crc = mkCanvas(256, 64), crx = crc.getContext('2d'); crx.fillStyle = '#1a1c30'; crx.fillRect(0, 0, 256, 64); for (i = 0; i < 700; i++) { crx.fillStyle = ['#ff6a6a', '#ffd24a', '#6ad0ff', '#ffffff', '#b46bff', '#6aff9a'][i % 6]; crx.fillRect(rnd() * 256, rnd() * 64, 3, 3); }
    var crt = mkTex(crc); crt.wrapS = crt.wrapT = THREE.RepeatWrapping; crt.repeat.set(8, 1);
    var stand = new THREE.Group(); stand.position.set(70, 0, 22); g.add(stand);
    for (i = 0; i < 5; i++) { var st = new THREE.Mesh(new THREE.BoxGeometry(110, 1.6, 3), i % 2 ? new THREE.MeshBasicMaterial({ map: crt }) : new THREE.MeshBasicMaterial({ color: 0x2a2f52 })); st.position.set(0, 1 + i * 1.6, i * 3); stand.add(st); }
    var roofM = new THREE.Mesh(new THREE.BoxGeometry(112, 0.5, 18), new THREE.MeshBasicMaterial({ color: 0x1c2040 })); roofM.position.set(0, 12, 8); stand.add(roofM);
    var lampPos = [], lampHeads = [];
    for (i = 0; i < N; i += 26) { var sd = (i / 26) % 2 ? 1 : -1, lx = TRK.PX[i] + (-TRK.TZ[i]) * sd * 13.5, lz = TRK.PZ[i] + TRK.TX[i] * sd * 13.5; lampPos.push([lx, lz]); }
    var poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 8, 0.25), new THREE.MeshBasicMaterial({ color: 0x555a78 }), lampPos.length), dm = new THREE.Object3D(), lp = [];
    lampPos.forEach(function (p, k) { dm.position.set(p[0], 4, p[1]); dm.updateMatrix(); poles.setMatrixAt(k, dm.matrix); lp.push(p[0], 8.2, p[1]); });
    g.add(poles);
    var glowC = mkCanvas(64, 64), glx = glowC.getContext('2d'), glg = glx.createRadialGradient(32, 32, 0, 32, 32, 32); glg.addColorStop(0, 'rgba(255,230,180,1)'); glg.addColorStop(0.3, 'rgba(255,200,120,0.5)'); glg.addColorStop(1, 'rgba(255,200,120,0)'); glx.fillStyle = glg; glx.fillRect(0, 0, 64, 64);
    var lgm = new THREE.BufferGeometry(); lgm.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    g.add(new THREE.Points(lgm, new THREE.PointsMaterial({ size: 22, map: mkTex(glowC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));

    var cpMats = [], cpFlash = [];
    function gate(frac, isStart) {
      var s = frac * N, p = TRK.at(s, {}), grp = new THREE.Group(); grp.position.set(p.x, 0, p.z); grp.rotation.y = -p.yaw; g.add(grp);
      var col = isStart ? 0xffffff : 0x22e5ff, mat = new THREE.MeshBasicMaterial({ color: col }), hw = WALL_OFF + 0.4;
      [-hw, hw].forEach(function (x) { var po = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 0.7), new THREE.MeshBasicMaterial({ color: 0x2a2f52 })); po.position.set(x, 4.25, 0); grp.add(po); });
      var beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.7, 1.4, 0.9), new THREE.MeshBasicMaterial({ color: 0x2a2f52 })); beam.position.y = 8.2; grp.add(beam);
      var neon = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.22, 1.0), mat); neon.position.set(0, 7.45, 0); grp.add(neon); cpMats.push(mat);
      if (isStart) {
        var bc = mkCanvas(1024, 128), bx2 = bc.getContext('2d'); for (var q = 0; q < 64; q++) { bx2.fillStyle = (q + Math.floor(q / 32)) % 2 ? '#fff' : '#111'; bx2.fillRect(q * 16, 0, 16, 16); bx2.fillRect(q * 16, 112, 16, 16); }
        bx2.fillStyle = '#0a0d22'; bx2.fillRect(0, 16, 1024, 96); bx2.fillStyle = '#ffd24a'; bx2.font = '900 70px ' + SERIF; bx2.textAlign = 'center'; bx2.textBaseline = 'middle'; bx2.fillText('DÉPART · ARRIVÉE', 512, 66, 980);
        var ban = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hw * 2 / 8), new THREE.MeshBasicMaterial({ map: mkTex(bc), side: THREE.DoubleSide })); ban.position.set(0, 8.2, 0.5); grp.add(ban);
        var lc = mkCanvas(64, 64), lx2 = lc.getContext('2d'); for (var a = 0; a < 8; a++) for (var b = 0; b < 8; b++) { lx2.fillStyle = (a + b) % 2 ? '#fff' : '#111'; lx2.fillRect(a * 8, b * 8, 8, 8); }
        var lt = mkTex(lc); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(ROAD_HALF, 1);
        var ln = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.6), new THREE.MeshBasicMaterial({ map: lt })); ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.05, 0); grp.add(ln);
      }
    }
    for (i = 0; i < NCP; i++) gate(i / NCP, i === 0);

    /* ---------- crédits des modèles (CC BY) : cachés sous la route de la ligne de départ ---------- */
    var cr2 = mkCanvas(1024, 128), crx2 = cr2.getContext('2d'); crx2.fillStyle = '#111'; crx2.fillRect(0, 0, 1024, 128); crx2.fillStyle = '#ddd'; crx2.font = '600 20px ' + SERIF; crx2.textAlign = 'center';
    ['Voitures : modèles Sketchfab (CC BY 4.0) — Bugatti EB110, Porsche 911 GT3 R, Ferrari 849 Testarossa, Red Bull RB22, Bugatti Bolide,', 'Bugatti La Voiture Noire, Muscle car, The Mystery Machine — voir les pages Sketchfab des modèles pour les auteurs.'].forEach(function (t, k) { crx2.fillText(t, 512, 50 + k * 30, 1000); });
    var credit = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: mkTex(cr2) })); credit.rotation.x = -Math.PI / 2; credit.position.set(40, -0.02, 0); g.add(credit);

    // lumières pour les voitures (le décor, lui, est en matériaux sans éclairage)
    g.add(new THREE.HemisphereLight(0xb8c4ff, 0x50506e, 1.5)); var carSun = new THREE.DirectionalLight(0xfff0e0, 1.1); carSun.position.set(60, 90, 40); g.add(carSun);

    /* ---------- état de la course ---------- */
    var me = KS.newCar(); me.name = ''; me.carId = CARS[0].id; me.cyc = -1; me.rc = -1; me.ready = false;
    var remotes = {}, active = false, ui = null, keys = {}, padPrev = [], camFar = true, lookBack = false, sendT = 0, hudT = 0, toastT = 0, resShown = false, lastPhase = '', lastCount = -1;
    var cam = { yaw: 0, shake: 0 }, carMesh = null, carMeshId = '', fx = [], eng = null, flame = null, tmp = {}, pcache = {};
    var myRoot = new THREE.Group(); g.add(myRoot);
    var shadowC = mkCanvas(64, 64), shx = shadowC.getContext('2d'), shg = shx.createRadialGradient(32, 32, 2, 32, 32, 32); shg.addColorStop(0, 'rgba(0,0,0,0.7)'); shg.addColorStop(1, 'rgba(0,0,0,0)'); shx.fillStyle = shg; shx.fillRect(0, 0, 64, 64);
    var shadowTex = mkTex(shadowC);
    function addShadow(parent) { var sh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.05; parent.add(sh); }
    var smokeTex = (function () { var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c); })();
    for (i = 0; i < 40; i++) { var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0xdde2f0 })); spr.visible = false; g.add(spr); fx.push({ s: spr, life: 0, max: 1 }); }
    var fxI = 0;
    function puff(x, y, z, vx, vz, size, life, col) { var p = fx[fxI]; fxI = (fxI + 1) % fx.length; p.life = life; p.max = life; p.vx = vx; p.vz = vz; p.size = size; p.s.position.set(x, y, z); p.s.material.color.setHex(col || 0xdde2f0); p.s.visible = true; }
    var flameTex = (function () { var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c); })();
    flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); flame.scale.set(2.2, 2.2, 1); flame.visible = false; g.add(flame);

    function myName() { try { return String(state.username || '').slice(0, 20) || 'Invité'; } catch (e) { return 'Invité'; } }
    function phaseInfo(t) { return KS.phaseInfo(t); }

    function setMyCar(id) {
      me.carId = id; try { localStorage.setItem('f3d_kartcar', id); } catch (e) { /* ok */ }
      if (ui) { var c = CAR_BY[id]; ui.gridName.innerHTML = esc(c.name) + '<small>' + (c.i + 1) + ' / ' + CARS.length + '</small>'; }
      if (carMeshId !== id && phaseInfo(nowMs()).p === 'grid') wsSend({ t: 'car', id: id });
      if (carMeshId === id) return;
      carMeshId = id; if (carMesh) { myRoot.remove(carMesh); carMesh = null; }
      var ph = placeholderCar(0x888888); myRoot.add(ph); carMesh = ph;
      loadCar(id, function (m) { if (carMeshId !== id) return; myRoot.remove(carMesh); carMesh = m; myRoot.add(m); });
    }
    function cycleCar(d) { var ph = phaseInfo(nowMs()); if (ph.p !== 'grid') return; setMyCar(CARS[(CAR_BY[me.carId].i + d + CARS.length) % CARS.length].id); }

    /* ---------- le serveur (WebSocket /ws/kart) ---------- */
    var ws = null, wsOk = false, seq = 0, pending = [], inpAcc = 0, netErr = '', myKey = '', reconnectT = 0, lastSh = 0;
    function wsSend(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* ok */ } } }
    function connect() {
      var tok = F.token();
      if (!tok) { netErr = 'Connecte-toi pour courir.'; return; }
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kart?token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(me.name) + '&car=' + encodeURIComponent(me.carId);
      try { ws = new WebSocket(url); } catch (e) { netErr = 'Serveur de course indisponible.'; return; }
      var mine = ws;
      ws.onopen = function () { if (ws !== mine) return; wsOk = true; netErr = ''; };
      ws.onmessage = function (ev) { if (ws !== mine) return; var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNet(m); };
      ws.onclose = function () { if (ws !== mine) return; wsOk = false; me.ready = false; if (active) { netErr = 'Connexion au serveur…'; reconnectT = 1.5; } };
      ws.onerror = function () { /* onclose suit */ };
    }
    function onNet(m) {
      if (m.t === 'welcome') { srvOff = m.now - Date.now(); applyCars(m.cars, null); }
      else if (m.t === 's') { srvOff += ((m.n - Date.now()) - srvOff) * 0.25; applyCars(m.cars, m.cyc); }
      else if (m.t === 'ev') {
        var e = m.e;
        if (e.k === 'lap') { toast('Tour ' + (e.lap + 1) + ' / ' + LAPS + ' · ' + fmtT(e.time), '#fff', 1.8); tone(660, 880, 0.2, 'sine', 0.16); }
        else if (e.k === 'cp') { cpFlash[e.cp] = 0.7; tone(880, 1100, 0.1, 'sine', 0.1); }
      } else if (m.t === 'fin') {
        if (m.k === myKey) {
          var pos = ranking(phaseInfo(nowMs())).findIndex(function (r) { return r.me; }) + 1;
          toast('🏁 Arrivée ! ' + pos + (pos === 1 ? 'er' : 'e') + ' · ' + fmtT(m.time), '#ffd24a', 3.5); tone(523, 523, 0.2, 'triangle', 0.18); tone(659, 659, 0.2, 'triangle', 0.18, 0.15); tone(784, 784, 0.4, 'triangle', 0.18, 0.3);
        }
      }
    }
    function upsertRemote(c, cyc) {
      var r = remotes[c.k];
      if (!r) {
        var grp = new THREE.Group(), ph = placeholderCar(0x888888); grp.add(ph); addShadow(grp); g.add(grp);
        var tag = (function (name) { var cv = mkCanvas(256, 64), x2 = cv.getContext('2d'); x2.fillStyle = 'rgba(8,6,20,0.72)'; F.roundRectPath(x2, 4, 8, 248, 48, 22); x2.fill(); x2.fillStyle = '#fff'; x2.font = '800 28px ' + SERIF; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(name.slice(0, 14), 128, 33, 230); var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkTex(cv), transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(2.2, 0.55, 1); sp.renderOrder = 30; return sp; })(String(c.n || c.k));
        g.add(tag); r = remotes[c.k] = { k: c.k, name: String(c.n || c.k).slice(0, 20), grp: grp, car: ph, tag: tag, carId: '', x: c.x, z: c.z, yaw: c.a || 0 };
      }
      r.tx = c.x; r.tz = c.z; r.ta = c.a || 0; r.vx = c.vx || 0; r.vz = c.vz || 0; r.prog = c.p || 0; r.fin = c.f || 0; r.best = c.b || 0; r.cy = cyc; r.recv = performance.now();
      var cid = CAR_BY[c.c] ? c.c : CARS[0].id;
      if (r.carId !== cid) { r.carId = cid; loadCar(cid, function (mm) { if (!remotes[r.k] || r.carId !== cid) return; r.grp.remove(r.car); r.car = mm; r.grp.add(mm); }); }
    }
    function applyCars(cars, cyc) {
      var seen = {};
      cars.forEach(function (c) {
        seen[c.k] = true;
        if (c.k === myKey) reconcile(c, cyc); else upsertRemote(c, cyc);
      });
      Object.keys(remotes).forEach(function (k) { if (!seen[k]) dropRemote(k); });
    }
    // le serveur a le dernier mot : je pars de SON état, puis je rejoue mes touches qu'il n'a pas encore prises en compte (« prédiction »)
    function reconcile(c, cyc) {
      me.prog = c.p; me.lap = c.l; me.fin = c.f; me.best = c.b; me.cp = c.cp; me.wrong = c.w ? 2 : 0;
      if (c.sh > me.shake && c.sh - lastSh > 0.25) { tone(200, 80, 0.12, 'square', 0.1); noise(0.08, 0.15, 2000); } lastSh = c.sh; me.shake = Math.max(me.shake, c.sh);
      if (c.rc !== me.rc || !me.ready) {                       // placement décidé par le serveur (grille, replacement) : on s'y met tout de suite
        me.rc = c.rc; me.ready = true; me.x = c.x; me.z = c.z; me.yaw = c.a; me.vx = c.vx; me.vz = c.vz; me.st = c.st; me.boost = c.bo; me.driftT = c.dr; me.spd = Math.hypot(c.vx, c.vz); pending = []; cam.yaw = c.a; return;
      }
      pending = pending.filter(function (p) { return p.seq > c.ack; });
      var pc = KS.newCar(); pc.x = c.x; pc.z = c.z; pc.yaw = c.a; pc.vx = c.vx; pc.vz = c.vz; pc.st = c.st; pc.boost = c.bo; pc.driftT = c.dr;
      var locked = (function (p) { return p === 'grid' || p === 'count'; })(phaseInfo(nowMs()).p), k, i;
      for (k = 0; k < pending.length; k++) { for (i = 0; i < 3; i++) KS.stepCar(pc, pending[k].inp, 1 / 90, locked); pc.ev.length = 0; }
      var err = Math.hypot(pc.x - me.x, pc.z - me.z);
      if (err > 2.5) { me.x = pc.x; me.z = pc.z; me.yaw = pc.yaw; me.vx = pc.vx; me.vz = pc.vz; }
      else { var f = 0.3; me.x += (pc.x - me.x) * f; me.z += (pc.z - me.z) * f; me.yaw += angDiff(pc.yaw, me.yaw) * f; me.vx += (pc.vx - me.vx) * f; me.vz += (pc.vz - me.vz) * f; }
      me.st = pc.st; me.boost = pc.boost; me.driftT = pc.driftT;
    }
    function respawn() {
      var pi = phaseInfo(nowMs()); if (pi.p === 'grid' || pi.p === 'count') return;
      wsSend({ t: 'respawn' }); toast('↺ Replacé', '#ffd24a', 1.2);
    }
    function presentList() { return Object.keys(remotes).map(function (k) { return remotes[k]; }); }
    function dropRemote(k) { var r = remotes[k]; if (!r) return; g.remove(r.grp); g.remove(r.tag); r.tag.material.map.dispose(); delete remotes[k]; }

    /* ---------- interface ---------- */
    function toast(t, col, dur) { if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.textContent = t; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 1.6; }
    function mmBuild() {
      var c = mkCanvas(220, 150), x = c.getContext('2d'), bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9, k;
      for (k = 0; k < N; k++) { bx0 = Math.min(bx0, TRK.PX[k]); bx1 = Math.max(bx1, TRK.PX[k]); bz0 = Math.min(bz0, TRK.PZ[k]); bz1 = Math.max(bz1, TRK.PZ[k]); }
      var sc = Math.min(200 / (bx1 - bx0), 130 / (bz1 - bz0)), ox = 10 - bx0 * sc + (200 - (bx1 - bx0) * sc) / 2, oz = 10 - bz0 * sc + (130 - (bz1 - bz0) * sc) / 2;
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 5; x.lineJoin = 'round'; x.beginPath(); for (k = 0; k <= N; k += 3) { var i0 = k % N; if (k === 0) x.moveTo(TRK.PX[i0] * sc + ox, TRK.PZ[i0] * sc + oz); else x.lineTo(TRK.PX[i0] * sc + ox, TRK.PZ[i0] * sc + oz); } x.closePath(); x.stroke();
      x.fillStyle = '#ffd24a'; x.fillRect(TRK.PX[0] * sc + ox - 4, TRK.PZ[0] * sc + oz - 4, 8, 8);
      return { c: c, sc: sc, ox: ox, oz: oz };
    }
    var mm = mmBuild();
    function buildUi() {
      injectCss();
      var el = document.createElement('div'); el.className = 'kt-hud';
      el.innerHTML = '<div class="kt-box kt-info"><div class="p"></div><div class="l"></div><div class="t"></div><div class="c"></div></div><div class="kt-box kt-mini"><canvas width="220" height="150"></canvas></div>' +
        '<div class="kt-box kt-spd"><b>0</b><small>km/h</small><div class="bar"><i></i></div></div><div class="kt-big"></div><div class="kt-wrong">⛔ MAUVAIS SENS</div><div class="kt-toast"></div>' +
        '<div class="kt-btns"><button data-a="reset">↺ Replacer <small>R</small></button><button data-a="view">👁 Vue <small>C</small></button><button data-a="quit">🚪 Quitter</button></div>' +
        '<div class="kt-box kt-grid"><button data-a="prev">◀</button><div class="n"></div><button data-a="next">▶</button></div>' +
        '<div class="kt-help">ZQSD / flèches : conduire · Espace : frein à main (dérape puis relâche = turbo) · R : replacer · C : vue · Manette : stick + RT / LT, A frein à main</div><div class="kt-box kt-res"></div>';
      world.container.appendChild(el);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var a = b.dataset.a;
        if (a === 'reset') respawn(); else if (a === 'view') camFar = !camFar; else if (a === 'prev') cycleCar(-1); else if (a === 'next') cycleCar(1); else if (a === 'quit') world.goRoom('minijeux', 'kart');
      });
      return { el: el, info: el.querySelector('.kt-info'), p: el.querySelector('.kt-info .p'), l: el.querySelector('.kt-info .l'), t: el.querySelector('.kt-info .t'), c: el.querySelector('.kt-info .c'), mini: el.querySelector('.kt-mini canvas'), spd: el.querySelector('.kt-spd b'), bar: el.querySelector('.kt-spd .bar i'), big: el.querySelector('.kt-big'), wrong: el.querySelector('.kt-wrong'), toast: el.querySelector('.kt-toast'), grid: el.querySelector('.kt-grid'), gridName: el.querySelector('.kt-grid .n'), res: el.querySelector('.kt-res'), help: el.querySelector('.kt-help') };
    }
    function ranking(pi) {
      var rows = [{ me: true, name: me.name, carId: me.carId, prog: me.prog, fin: me.fin, best: me.best }];
      presentList().forEach(function (r) { if (r.cy === pi.cyc) rows.push({ name: r.name, carId: r.carId, prog: r.prog || 0, fin: r.fin, best: r.best }); });
      rows.sort(function (a, b) { if (a.fin && b.fin) return a.fin - b.fin; if (a.fin) return -1; if (b.fin) return 1; return b.prog - a.prog; });
      return rows;
    }
    function refreshHud(pi) {
      if (!ui) return;
      if (!me.ready) { ui.big.innerHTML = esc(netErr || 'Connexion au serveur…'); ui.grid.classList.remove('on'); return; }
      var rows = ranking(pi), pos = rows.findIndex(function (r) { return r.me; }) + 1, lap = Math.min(LAPS, Math.max(1, Math.floor(Math.max(0, me.prog)) + 1));
      ui.p.innerHTML = pos + '<small>/' + rows.length + '</small>';
      ui.l.textContent = me.fin ? '🏁 Terminé · ' + fmtT(me.fin) : 'Tour ' + lap + ' / ' + LAPS;
      ui.t.textContent = pi.p === 'race' ? 'Temps ' + fmtT(nowMs() - pi.raceStart) + (me.best ? ' · Meilleur ' + fmtT(me.best) : '') : (pi.p === 'grid' ? 'Départ dans ' + Math.ceil(pi.left / 1000 + COUNT_MS / 1000) + ' s' : '');
      ui.c.textContent = 'Point de contrôle ' + Math.max(0, me.cp) % NCP + ' / ' + NCP;
      ui.spd.textContent = Math.round(me.spd * 3.6 * 1.25); ui.bar.style.width = Math.min(100, me.spd / VMAX * 100) + '%';
      ui.grid.classList.toggle('on', pi.p === 'grid');
      // grand texte : compte à rebours, GO
      var big = '';
      if (pi.p === 'grid') big = 'Prépare-toi<small>Choisis ta voiture · départ dans ' + Math.ceil((pi.left + COUNT_MS) / 1000) + ' s</small>';
      else if (pi.p === 'count') big = String(Math.ceil(pi.left / 1000));
      else if (pi.p === 'race' && nowMs() - pi.raceStart < 1200) big = '<span style="color:#3ddc84">GO !</span>';
      ui.big.innerHTML = big;
      // résultats
      if (pi.p === 'results') {
        var h = '<h3>🏁 Résultats</h3><table><tr><th>#</th><th>Pilote</th><th>Voiture</th><th>Temps</th></tr>';
        rows.forEach(function (r, k) { h += '<tr class="' + (r.me ? 'me' : '') + '"><td>' + (['🥇', '🥈', '🥉'][k] || (k + 1)) + '</td><td>' + esc(r.name) + '</td><td>' + esc((CAR_BY[r.carId] || CARS[0]).name) + '</td><td>' + (r.fin ? fmtT(r.fin) : 'Tour ' + Math.min(LAPS, Math.max(1, Math.floor(Math.max(0, r.prog)) + 1)) + ' · ' + Math.round(Math.max(0, Math.min(1, r.prog / LAPS)) * 100) + ' %') + '</td></tr>'; });
        ui.res.innerHTML = h + '</table><div class="ft">Prochaine course dans ' + Math.ceil((pi.left + GRID_MS + COUNT_MS) / 1000) + ' s</div>'; ui.res.classList.add('on');
      } else ui.res.classList.remove('on');
    }
    function drawMini() {
      if (!ui) return; var c = ui.mini, x = c.getContext('2d'); x.clearRect(0, 0, 220, 150); x.drawImage(mm.c, 0, 0);
      function dot(px, pz, col, r) { x.fillStyle = col; x.beginPath(); x.arc(px * mm.sc + mm.ox, pz * mm.sc + mm.oz, r, 0, TAU); x.fill(); }
      Object.keys(remotes).forEach(function (k) { dot(remotes[k].x, remotes[k].z, '#6ad0ff', 3.5); }); dot(me.x, me.z, '#ff4d4d', 5);
    }

    /* ---------- commandes ---------- */
    var GAME_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1, KeyQ: 1, KeyE: 1, KeyZ: 1, Space: 1, KeyR: 1, KeyC: 1, KeyL: 1, Tab: 1, KeyF: 1 };
    function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
    function onKey(e) {
      if (!active || world.mode !== 'seat' || typing() || !GAME_KEYS[e.code]) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if (e.repeat && keys[e.code]) return; keys[e.code] = true;
        if (e.code === 'KeyR') respawn(); else if (e.code === 'KeyC') camFar = !camFar;
        else if (e.code === 'KeyQ') cycleCar(-1); else if (e.code === 'KeyE') cycleCar(1);
      } else keys[e.code] = false;
    }
    function readInput() {
      var inp = { th: 0, br: 0, steer: 0, hand: false };
      if (keys.KeyW || keys.ArrowUp || keys.KeyZ) inp.th = 1; if (keys.KeyS || keys.ArrowDown) inp.br = 1;
      inp.steer = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0); inp.hand = !!keys.Space; lookBack = !!keys.KeyL;
      var pads = navigator.getGamepads ? navigator.getGamepads() : null, gp = null, k;
      if (pads) for (k = 0; k < pads.length; k++) if (pads[k] && pads[k].connected) { gp = pads[k]; break; }
      if (gp) {
        var ax = gp.axes || [], b = gp.buttons || [], lx = ax[0] || 0; lx = Math.abs(lx) < 0.12 ? 0 : (lx < 0 ? -1 : 1) * (Math.abs(lx) - 0.12) / 0.88;
        if (lx) inp.steer = lx; else if (b[14] && b[14].pressed) inp.steer = -1; else if (b[15] && b[15].pressed) inp.steer = 1;
        var rt = b[7] ? (b[7].value || (b[7].pressed ? 1 : 0)) : 0, lt = b[6] ? (b[6].value || (b[6].pressed ? 1 : 0)) : 0;
        if (rt > 0.05) inp.th = Math.max(inp.th, rt); if (lt > 0.05) inp.br = Math.max(inp.br, lt);
        if (b[0] && b[0].pressed) inp.hand = true; if (b[5] && b[5].pressed && !b[5].__p) inp.hand = inp.hand;
        function hit(n) { var now = !!(b[n] && b[n].pressed), was = !!padPrev[n]; padPrev[n] = now; return now && !was; }
        if (hit(2)) respawn(); if (hit(3)) camFar = !camFar; if (hit(4)) cycleCar(-1); if (hit(5)) cycleCar(1);
        if (world._pad && world._pad.xh) world._pad.xh.style.display = 'none';
      }
      return inp;
    }

    /* ---------- prédiction locale : la même physique que le serveur (kart-sim.js) ---------- */
    function stepLocal(inp, dt, locked) {
      var left = Math.min(dt, 0.1), sub;
      me.ev.length = 0;
      while (left > 1e-5) {
        sub = Math.min(left, 1 / 90); KS.stepCar(me, inp, sub, locked); left -= sub;
        me.ev.forEach(function (e) {
          if (e.k === 'smoke') puff(e.x, 0.3, e.z, e.vx, e.vz, 1.5, 0.9);
          else if (e.k === 'turbo') { toast('⚡ TURBO', '#ffb02e', 0.9); tone(300, 900, 0.3, 'sawtooth', 0.12); }
          else if (e.k === 'wall') { noise(0.12, 0.2 + Math.min(0.3, e.vn / 40), 1500); tone(120, 60, 0.15, 'square', 0.1); for (var q = 0; q < 4; q++) puff(e.x, 0.6, e.z, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.9, 0.5, 0xffb060); }
        });
        me.ev.length = 0;
      }
    }
    room.seatPos = function () { return null; };
    room.hint = function () { return 'ZQSD / flèches : conduire · Espace : frein à main · R : replacer · C : vue · manette : stick + RT / LT'; };
    room.spawn = function () { return { x: 0, z: 0, yaw: 0 }; };
    room.seatPose = function (dt) {
      var tgt = me.yaw + Math.atan2(me.vx * Math.cos(me.yaw) + me.vz * Math.sin(me.yaw), Math.max(8, me.spd)) * 0.35 + (lookBack ? Math.PI : 0);
      cam.yaw += angDiff(tgt, cam.yaw) * (1 - Math.exp(-dt * (lookBack ? 12 : 4.5)));
      var back = camFar ? 7.6 + me.spd * 0.03 : 4.3, h = camFar ? 3.1 : 1.7, a = cam.yaw, sk = me.shake * 0.18 * (Math.random() - 0.5);
      return { cx: me.x - Math.sin(a) * back + sk, cy: h + sk * 0.6, cz: me.z + Math.cos(a) * back + sk, tx: me.x + Math.sin(a) * 6 * (lookBack ? -1 : 1), ty: 1.2, tz: me.z - Math.cos(a) * 6 * (lookBack ? -1 : 1), fov: 62 + Math.min(20, me.spd * 0.35) + (me.boost > 0 ? 8 : 0) };
    };

    /* ---------- entrée / sortie ---------- */
    var oldFog = null, oldBg = null;
    room.onEnter = function (w) {
      active = true; me.name = myName(); me.cyc = -1; keys = {}; padPrev = [];
      oldFog = world.scene.fog; oldBg = world.scene.background; world.scene.fog = new THREE.FogExp2(0x0a0f2a, 0.0038); world.scene.background = new THREE.Color(0x070b1f);
      ui = buildUi(); var saved = ''; try { saved = localStorage.getItem('f3d_kartcar') || ''; } catch (e) { /* ok */ }
      carMeshId = ''; setMyCar(CAR_BY[saved] ? saved : CARS[Math.floor(Math.random() * CARS.length)].id);
      window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
      var a = ac(); if (a) { try { var o1 = a.createOscillator(), o2 = a.createOscillator(), fl = a.createBiquadFilter(), gn = a.createGain(); o1.type = 'sawtooth'; o2.type = 'square'; fl.type = 'lowpass'; fl.frequency.value = 700; gn.gain.value = 0; o1.connect(fl); o2.connect(fl); fl.connect(gn); gn.connect(a.destination); o1.start(); o2.start(); eng = { o1: o1, o2: o2, g: gn, f: fl }; } catch (e) { eng = null; } }
      myKey = F.me(); me.ready = false; me.rc = -1; pending = []; seq = 0; inpAcc = 0; netErr = ''; lastPhase = '';
      connect();
      w.sitDown(room);
      if (!F.token()) setTimeout(function () { if (active) world.goRoom('minijeux', 'kart'); }, 2500);
    };
    function cleanup() {
      if (!active) return; active = false; keys = {};
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
      if (eng) { try { eng.o1.stop(); eng.o2.stop(); eng.g.disconnect(); } catch (e) { /* ok */ } eng = null; }
      if (ws) { var old = ws; ws = null; wsOk = false; try { old.close(); } catch (e) { /* ok */ } }
      Object.keys(remotes).forEach(dropRemote);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      world.scene.fog = oldFog; if (oldBg) world.scene.background = oldBg;
      flame.visible = false;
    }
    room.forceStand = function () { cleanup(); world.standUp(0, 0, 0); };
    room.onLeave = function () { cleanup(); };
    room.onPageHide = function () { cleanup(); };

    /* ---------- la boucle ---------- */
    room.update = function (dt) {
      wheelG.rotation.z += dt * 0.03; pods.rotation.z -= dt * 0.03;
      cpMats.forEach(function (m, k) { if (cpFlash[k] > 0) { cpFlash[k] -= dt; m.color.setHex(k === 0 ? 0xffffff : 0x3dff7a); } else m.color.setHex(k === 0 ? 0xffffff : 0x22e5ff); });
      if (!active) return;
      var now = nowMs(), pi = phaseInfo(now);
      if (reconnectT > 0) { reconnectT -= dt; if (reconnectT <= 0 && active && (!ws || ws.readyState > 1)) connect(); }
      if (pi.cyc !== me.cyc) { me.cyc = pi.cyc; resShown = false; if (ui) ui.res.classList.remove('on'); lastCount = -1; }
      if (pi.p !== lastPhase) lastPhase = pi.p;
      if (pi.p === 'count') { var c = Math.ceil(pi.left / 1000); if (c !== lastCount) { lastCount = c; tone(c > 0 ? 440 : 880, c > 0 ? 440 : 880, 0.15, 'square', 0.12); } }
      var inp = readInput(), locked = pi.p === 'grid' || pi.p === 'count' || !me.ready;
      if (pi.p === 'results') { var vf1 = me.vx * Math.sin(me.yaw) - me.vz * Math.cos(me.yaw); inp = { th: 0, br: vf1 > 0.6 ? 0.6 : 0, steer: inp.steer, hand: false }; }
      // mes touches partent vers le serveur 30 fois par seconde ; ma voiture avance tout de suite (prédiction), le serveur la recale
      if (me.ready) {
        inpAcc += dt; var nsend = 0;
        while (inpAcc >= 1 / 30 && nsend++ < 3) { inpAcc -= 1 / 30; seq++; pending.push({ seq: seq, inp: { th: inp.th, br: inp.br, steer: inp.steer, hand: inp.hand } }); if (pending.length > 150) pending.shift(); wsSend({ t: 'in', seq: seq, th: +inp.th.toFixed(2), br: +inp.br.toFixed(2), st: +inp.steer.toFixed(2), h: inp.hand ? 1 : 0 }); }
        if (inpAcc > 0.2) inpAcc = 0;
        stepLocal(inp, dt, locked);
      }
      me.shake = Math.max(0, me.shake - dt * 2.5);
      // ma voiture
      var tilt = -me.st * Math.min(1, me.spd / 40) * 0.06, vf0 = me.vx * Math.sin(me.yaw) - me.vz * Math.cos(me.yaw);
      myRoot.position.set(me.x, 0, me.z); myRoot.rotation.set(0, -me.yaw, 0);
      if (carMesh) { carMesh.rotation.z = tilt + (Math.random() - 0.5) * 0.002 * me.spd * 0.02; carMesh.rotation.x = -Math.max(-0.05, Math.min(0.05, (inp.th - inp.br) * 0.03 * (locked ? 0 : 1))); carMesh.position.y = Math.sin(now / 90) * 0.004 * Math.min(1, me.spd / 20); }
      flame.visible = me.boost > 0; if (flame.visible) { flame.position.set(me.x - Math.sin(me.yaw) * 2.8, 0.5, me.z + Math.cos(me.yaw) * 2.8); flame.scale.setScalar(1.6 + Math.random() * 1.1); }
      // moteur
      if (eng) { var rv = Math.min(1, me.spd / VMAX), gearf = (rv * 4) % 1; eng.o1.frequency.value = 55 + rv * 150 + gearf * 40 + inp.th * 18; eng.o2.frequency.value = eng.o1.frequency.value * 0.5; eng.g.gain.value = (locked ? 0.012 : 0.02 + inp.th * 0.02) * sfxVol(); eng.f.frequency.value = 500 + rv * 900 + inp.th * 300; }
      // les autres voitures
      var kk = 1 - Math.exp(-dt * 12), nowP = performance.now();
      Object.keys(remotes).forEach(function (k) {
        var r = remotes[k], age = Math.min(0.3, (nowP - r.recv) / 1000), px = r.tx + (r.vx || 0) * age, pz = r.tz + (r.vz || 0) * age;
        r.x += (px - r.x) * kk; r.z += (pz - r.z) * kk; r.yaw += angDiff(r.ta, r.yaw) * kk; r.grp.position.set(r.x, 0, r.z); r.grp.rotation.y = -r.yaw; r.tag.position.set(r.x, 2.5, r.z);
      });
      // fumée
      fx.forEach(function (p) { if (p.life <= 0) return; p.life -= dt; if (p.life <= 0) { p.s.visible = false; return; } var u = 1 - p.life / p.max; p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt; p.s.position.y += dt * 0.8; var sz = p.size * (1 + u * 2); p.s.scale.set(sz, sz, 1); p.s.material.opacity = 0.55 * (1 - u); });
      // interface
      hudT -= dt; if (hudT <= 0) { hudT = 0.1; refreshHud(pi); drawMini(); if (ui) { ui.wrong.style.display = me.wrong > 1.5 ? 'block' : 'none'; } }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && ui) ui.toast.classList.remove('in'); }
    };
    room._dbg = { me: me, remotes: remotes, phaseInfo: phaseInfo, keys: function () { return keys; }, net: function () { return { wsOk: wsOk, srvOff: srvOff, pending: pending.length, netErr: netErr }; } };
    return room;
  }

  F.registerRoom('kart', createKart);
  F.kart = { CARS: CARS, TRK: TRK };
})();
