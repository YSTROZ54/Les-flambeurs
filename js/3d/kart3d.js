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
    { id: 'eb110', name: 'Bugatti EB110', file: 'assets/voitures/eb110.glb', nose: '+z', L: 4.5, axle: [-1.12, 1.5], R: [0.33, 0.34] },
    { id: 'gt3r', name: 'Porsche 911 GT3 R', file: 'assets/voitures/gt3r.glb', nose: '+z', L: 4.6, axle: [-1.3, 1.15], R: [0.34, 0.35] },
    { id: 'ferrari', name: 'Ferrari 849 Testarossa', file: 'assets/voitures/ferrari.glb', nose: '+z', L: 4.6, axle: [-1.2, 1.4], R: [0.34, 0.35] },
    { id: 'rb22', name: 'Red Bull RB22', file: 'assets/voitures/rb22.glb', nose: '+z', L: 5.2, axle: [-1.4, 1.87], R: [0.32, 0.34] },
    { id: 'bolide', name: 'Bugatti Bolide', file: 'assets/voitures/bolide.glb', nose: '+z', L: 4.6, axle: [-1.27, 1.4], R: [0.34, 0.35] },
    { id: 'noire', name: 'Bugatti La Voiture Noire', file: 'assets/voitures/noire.glb', nose: '-z', L: 4.9, axle: [-1.5, 1.4], R: [0.35, 0.36] },
    { id: 'muscle', name: 'Muscle car', file: 'assets/voitures/muscle.glb', nose: '+z', L: 4.8, axle: [-1.7, 1.15], R: [0.35, 0.36] },
    { id: 'mystery', name: 'Mystery Machine', file: 'assets/voitures/mystery.glb', nose: '+z', L: 5.0, axle: [-1.15, 1.1], R: [0.33, 0.34] }
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

  /* ------------------------------------------------------------------ roues : découpées dans le maillage pour tourner et braquer ------------------------------------------------------------------ */
  // Les modèles sont d'un seul bloc. On repère les deux essieux par un « vote » (cercle de pneu le plus fourni en sommets au ras du sol, devant et derrière),
  // puis on sort du maillage tous les triangles qui sont dans le disque d'une roue : chaque roue devient un petit objet qu'on peut faire tourner.
  function subGeo(geo, tris) {
    var g = new THREE.BufferGeometry(); Object.keys(geo.attributes).forEach(function (k) { g.setAttribute(k, geo.attributes[k]); });
    g.setIndex(new THREE.BufferAttribute(new (geo.attributes.position.count > 65535 ? Uint32Array : Uint16Array)(tris), 1)); return g;
  }
  function splitWheels(root, cfg) {
    try {
      root.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(root), hw = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), minY = box.min.y, meshes = [], v = new THREE.Vector3(), pts = [], i, j, q;
      root.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.attributes.position && !o.isSkinnedMesh) meshes.push(o); });
      var total = 0; meshes.forEach(function (m) { total += m.geometry.attributes.position.count; });
      var step = Math.max(1, Math.floor(total / 9000));
      meshes.forEach(function (m) { var pos = m.geometry.attributes.position, mw = m.matrixWorld; for (i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(mw); if (Math.abs(v.x) > hw * 0.45 && v.y - minY < 1.0) pts.push(v.z, v.y - minY, Math.abs(v.x)); } });
      // les points les plus bas (le dessous des pneus) donnent l'endroit de chaque essieu ; le « vote » du cercle de pneu donne ensuite le rayon
      function fit(zLo, zHi, fixed) {
        var n = pts.length, hist = {}, q, k, cands = [], best = { s: 0, cz: 0, R: 0.33 }, all = [], bins = new Float32Array(24);
        for (q = 0; q < n; q += 3) if (pts[q + 1] < 0.08 && pts[q] >= zLo && pts[q] <= zHi) { k = Math.round(pts[q] / 0.05); hist[k] = (hist[k] || 0) + 1; }
        Object.keys(hist).forEach(function (kk) { var c = +kk, sum = 0, j2; for (j2 = -5; j2 <= 5; j2++) sum += hist[c + j2] || 0; cands.push({ z: c * 0.05, sum: sum }); });
        cands.sort(function (a, b) { return b.sum - a.sum; });
        var chosen = []; if (fixed !== undefined) chosen.push({ z: fixed }); else cands.forEach(function (cd) { if (chosen.length < 4 && cd.sum >= 3 && chosen.every(function (o) { return Math.abs(o.z - cd.z) > 0.45; })) chosen.push(cd); });
        chosen.forEach(function (cd) {
          for (var cz = cd.z - 0.12; cz <= cd.z + 0.12; cz += 0.03) if (fixed === undefined || Math.abs(cz - fixed) < 0.05) for (var R = 0.27; R <= 0.46; R += 0.01) {
            bins.fill(0);
            for (q = 0; q < n; q += 3) { var dz = pts[q] - cz, dy = pts[q + 1] - R, d = Math.sqrt(dz * dz + dy * dy); if (d > R - 0.022 && d < R + 0.022) { var b = Math.floor((Math.atan2(dy, dz) + Math.PI) / (2 * Math.PI) * 24) % 24; bins[b]++; } }
            var sc = 0; for (var b2 = 0; b2 < 24; b2++) sc += Math.min(bins[b2], 14);
            all.push({ s: sc, cz: cz, R: R }); if (sc > best.s) best = { s: sc, cz: cz, R: R };
          }
        });
        // plusieurs cercles se valent (jante, pneu) : on garde le plus grand, c'est le pneu
        all.forEach(function (o) { if (Math.abs(o.cz - best.cz) < 0.07 && o.s >= best.s * 0.8 && o.R > best.R) best = { s: best.s, cz: o.cz, R: o.R }; });
        return best;
      }
      var Lz = box.max.z - box.min.z;
      var fixed = cfg.axle && cfg.R, fr = fixed ? { s: 999, cz: cfg.axle[0], R: cfg.R[0] } : fit(-0.4 * Lz, -0.2 * Lz), rr = fixed ? { s: 999, cz: cfg.axle[1], R: cfg.R[1] } : fit(0.2 * Lz, 0.4 * Lz);
      root.userData.fit = [fr, rr];
      if (fr.s < 60 || rr.s < 60) return false;
      var wheels = [], names = [['fl', fr, -1, true], ['fr', fr, 1, true], ['rl', rr, -1, false], ['rr', rr, 1, false]];
      names.forEach(function (nm) {
        var f = nm[1], sx = nm[2], sum = 0, cnt = 0, mn = 9;
        for (q = 0; q < pts.length; q += 3) { var dz = pts[q] - f.cz, dy = pts[q + 1] - f.R, d = Math.sqrt(dz * dz + dy * dy); if (d > f.R - 0.02 && d < f.R + 0.02) { sum += pts[q + 2]; cnt++; if (pts[q + 2] < mn) mn = pts[q + 2]; } }
        wheels.push({ n: nm[0], front: nm[3], sx: sx, cz: f.cz, cy: minY + f.R, R: f.R, sel: f.R * 1.03, xin: mn - 0.03, ax: sx * (cnt ? sum / cnt : hw * 0.85), parts: [], count: 0 });
      });
      var inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      meshes.forEach(function (m) {
        var geo = m.geometry, pos = geo.attributes.position, idx = geo.index ? geo.index.array : null, nt = (idx ? idx.length : pos.count) / 3, keep = [], per = [[], [], [], []], any = false, t, w;
        m.updateMatrixWorld(true); var mw = m.matrixWorld;
        for (t = 0; t < nt; t++) {
          var i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2, hit = -1;
          a.fromBufferAttribute(pos, i0).applyMatrix4(mw); b.fromBufferAttribute(pos, i1).applyMatrix4(mw); c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
          var cx2 = (a.x + b.x + c.x) / 3, cy2 = (a.y + b.y + c.y) / 3, cz2 = (a.z + b.z + c.z) / 3;
          for (w = 0; w < 4 && hit < 0; w++) {
            var W = wheels[w]; if (cx2 * W.sx < W.xin) continue;
            var dd = Math.hypot(cy2 - W.cy, cz2 - W.cz); if (dd > W.sel) continue;
            if (Math.hypot(a.y - W.cy, a.z - W.cz) > W.sel * 1.35 || Math.hypot(b.y - W.cy, b.z - W.cz) > W.sel * 1.35 || Math.hypot(c.y - W.cy, c.z - W.cz) > W.sel * 1.35) continue;
            hit = w;
          }
          if (hit < 0) keep.push(i0, i1, i2); else { per[hit].push(i0, i1, i2); any = true; wheels[hit].count++; }
        }
        if (!any) return;
        m.geometry = subGeo(geo, keep); if (!keep.length) m.visible = false;
        var rel = new THREE.Matrix4().multiplyMatrices(inv, mw);
        for (w = 0; w < 4; w++) if (per[w].length) wheels[w].parts.push({ geo: subGeo(geo, per[w]), mat: m.material, rel: rel });
      });
      var okW = 0;
      wheels.forEach(function (W) {
        if (W.count < 12) return; okW++;
        var steer = new THREE.Group(), spin = new THREE.Group(); steer.name = 'whl_' + W.n; steer.position.set(W.ax, W.cy, W.cz); steer.userData.R = W.R; steer.add(spin); root.add(steer);
        var off = new THREE.Matrix4().makeTranslation(-W.ax, -W.cy, -W.cz);
        W.parts.forEach(function (p) { var wm = new THREE.Mesh(p.geo, p.mat); wm.matrixAutoUpdate = false; wm.matrix.multiplyMatrices(off, p.rel); wm.frustumCulled = false; spin.add(wm); });
      });
      return okW > 0;
    } catch (e) { return false; }
  }
  function rigWheels(m) {
    m.userData.wh = [];
    ['fl', 'fr', 'rl', 'rr'].forEach(function (n) { var s = m.getObjectByName('whl_' + n); if (s) m.userData.wh.push({ steer: s, spin: s.children[0], R: s.userData.R || 0.34, front: n.charAt(0) === 'f', ang: 0 }); });
  }
  // vf : vitesse vers l'avant (m/s), st : braquage (-1 à 1)
  function animWheels(m, vf, st, dt) {
    var w = m && m.userData && m.userData.wh; if (!w) return;
    for (var i = 0; i < w.length; i++) { var o = w[i]; o.ang -= vf * dt / o.R; if (o.ang > 1e4 || o.ang < -1e4) o.ang = 0; o.spin.rotation.x = o.ang; if (o.front) o.steer.rotation.y = -st * 0.5; }
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
    root.userData.w = sz.x * k; root.userData.len = cfg.L; root.updateMatrixWorld(true);
    root.userData.wheels = splitWheels(root, cfg) ? 1 : 0; return root;
  }
  function loadCar(id, cb) {
    var cfg = CAR_BY[id] || CARS[0];
    function give(f) { var m = carCache[cfg.id].clone(true); rigWheels(m); f(m); }
    if (carCache[cfg.id]) { give(cb); return; }
    (carWait[cfg.id] = carWait[cfg.id] || []).push(cb);
    if (carWait[cfg.id].length > 1 || !THREE.GLTFLoader) return;
    new THREE.GLTFLoader().load(cfg.file + '?v=1', function (gl) {
      carCache[cfg.id] = prepCar(gl.scene, cfg); var w = carWait[cfg.id]; carWait[cfg.id] = null; w.forEach(function (f) { try { give(f); } catch (e) { /* ok */ } });
    }, undefined, function () { carWait[cfg.id] = null; });
  }
  /* ------------------------------------------------------------------ bruits de moteur (synthétisés) ------------------------------------------------------------------ */
  // chaque voiture a son timbre : { b : fréquence au ralenti (Hz), r : plage de régime, lp : filtre (brillance), sub : poids des graves, sq : poids du son « rauque » }
  var ENG = { rb22: { b: 120, r: 560, lp: 3600, sub: 0.15, sq: 0.1 }, gt3r: { b: 52, r: 300, lp: 2600, sub: 0.3, sq: 0.18 }, ferrari: { b: 56, r: 330, lp: 3000, sub: 0.25, sq: 0.14 }, eb110: { b: 50, r: 280, lp: 2300, sub: 0.35, sq: 0.2 },
    bolide: { b: 62, r: 360, lp: 3200, sub: 0.25, sq: 0.12 }, noire: { b: 40, r: 210, lp: 1700, sub: 0.45, sq: 0.25 }, muscle: { b: 34, r: 170, lp: 1500, sub: 0.55, sq: 0.4 }, mystery: { b: 36, r: 120, lp: 1100, sub: 0.5, sq: 0.3 } };
  function makeEngine(carId, withTires) {
    var a = ac(); if (!a) return null;
    try {
      var P = ENG[carId] || ENG.gt3r, o1 = a.createOscillator(), o2 = a.createOscillator(), o3 = a.createOscillator(), g1 = a.createGain(), g2 = a.createGain(), g3 = a.createGain(), lp = a.createBiquadFilter(), out = a.createGain();
      var pan = a.createStereoPanner ? a.createStereoPanner() : null, i;
      o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sawtooth'; g1.gain.value = 0.5; g2.gain.value = P.sq; g3.gain.value = P.sub; lp.type = 'lowpass'; lp.Q.value = 2.5; out.gain.value = 0;
      o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(lp); g2.connect(lp); g3.connect(lp); lp.connect(out);
      var dest = a.destination; if (pan) { pan.connect(dest); dest = pan; } out.connect(dest);
      o1.start(); o2.start(); o3.start();
      var ns = null, ng = null, bp = null;
      if (withTires) {                                       // crissement des pneus (dérapage, frein à main)
        var nb = a.createBuffer(1, a.sampleRate, a.sampleRate), nd = nb.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        ns = a.createBufferSource(); ns.buffer = nb; ns.loop = true; bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 4; ng = a.createGain(); ng.gain.value = 0;
        ns.connect(bp); bp.connect(ng); ng.connect(dest); ns.start();
      }
      return {
        id: carId,
        set: function (p) {                                  // rpm 0..1, thr 0..1, vol, pan -1..1, slip 0..1
          var t = a.currentTime, f = P.b + p.rpm * P.r + p.thr * 8;
          o1.frequency.setTargetAtTime(f, t, 0.03); o2.frequency.setTargetAtTime(f * 2, t, 0.03); o3.frequency.setTargetAtTime(f * 0.5 * 1.006, t, 0.03);
          lp.frequency.setTargetAtTime(P.lp * (0.35 + p.rpm * 0.65) * (0.6 + 0.5 * p.thr), t, 0.05);
          out.gain.setTargetAtTime(p.vol * (0.5 + 0.5 * p.thr) * sfxVol(), t, 0.05);
          if (pan) pan.pan.setTargetAtTime(p.pan || 0, t, 0.05);
          if (ng) { ng.gain.setTargetAtTime((p.slip || 0) * 0.1 * sfxVol(), t, 0.06); bp.frequency.setTargetAtTime(900 + (p.spd || 0) * 22, t, 0.1); }
        },
        stop: function () { try { o1.stop(); o2.stop(); o3.stop(); if (ns) ns.stop(); out.disconnect(); if (ng) ng.disconnect(); if (pan) pan.disconnect(); } catch (e) { /* ok */ } }
      };
    } catch (e) { return null; }
  }
  // régime moteur : on « passe les vitesses » (6 rapports) pour que le bruit monte et retombe comme une vraie boîte
  function calcRpm(st, spd, thr, dt, locked) {
    var rv = Math.min(1, spd / (VMAX * 1.05)), gr = Math.min(5, Math.floor(rv * 6)), fr = rv * 6 - gr, target;
    if (locked) target = 0.14 + thr * 0.6; else if (gr === 5) target = 0.55 + Math.min(1, fr) * 0.42; else target = 0.24 + fr * 0.7 + thr * 0.04;
    st.rpm += (target - st.rpm) * Math.min(1, dt * 12); return st.rpm;
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
      '.kt-lobby{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);padding:18px 26px;text-align:center;display:none;pointer-events:auto;min-width:340px;max-width:90vw}.kt-lobby.on{display:block}.kt-lobby h3{margin:0 0 8px;font-size:22px}.kt-lobby .s{font-size:14px;opacity:.85;font-weight:700;margin-bottom:10px;line-height:1.4}.kt-lobby .who{font-size:13px;font-weight:800;opacity:.9;margin-bottom:12px}.kt-lobby button{padding:11px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:linear-gradient(180deg,#2d7be0,#1a4fb0);color:#fff;font-weight:900;font-size:15px;cursor:pointer}.kt-lobby button:hover{filter:brightness(1.15)}' +
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
    var curbMat = new THREE.MeshBasicMaterial({ map: ct, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    g.add(new THREE.Mesh(ribbon(ROAD_HALF, ROAD_HALF + CURB_W, 0.03, 4.8), curbMat)); g.add(new THREE.Mesh(ribbon(-ROAD_HALF - CURB_W, -ROAD_HALF, 0.03, 4.8), curbMat));
    // barrières : de simples panneaux unis (bleu, blanc, rouge), sans aucune inscription
    var wc = mkCanvas(512, 128), wx = wc.getContext('2d'); wx.fillStyle = '#e9ecf4'; wx.fillRect(0, 0, 512, 128);
    ['#1c4fd0', '#f2f4fa', '#d42a22', '#f2f4fa'].forEach(function (col, q) { wx.fillStyle = col; wx.fillRect(q * 128 + 3, 14, 122, 100); });
    wx.fillStyle = '#2a2f48'; wx.fillRect(0, 0, 512, 10); wx.fillRect(0, 118, 512, 10);
    var wt = mkTex(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.anisotropy = 8;
    var wallMat = new THREE.MeshBasicMaterial({ map: wt, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(wallStrip(WALL_OFF, 1.2, 8), wallMat)); g.add(new THREE.Mesh(wallStrip(-WALL_OFF, 1.2, 8), wallMat));
    var neonA = new THREE.Mesh(ribbon(WALL_OFF - 0.12, WALL_OFF + 0.12, 1.22, 8), new THREE.MeshBasicMaterial({ color: 0x22e5ff })), neonB = new THREE.Mesh(ribbon(-WALL_OFF - 0.12, -WALL_OFF + 0.12, 1.22, 8), new THREE.MeshBasicMaterial({ color: 0xff3df0 }));
    g.add(neonA); g.add(neonB);

    /* ---------- sol (quadrillage de rues), baie, ciel ---------- */
    var skc = mkCanvas(64, 256), skx = skc.getContext('2d'), sg = skx.createLinearGradient(0, 0, 0, 256); sg.addColorStop(0, '#04051a'); sg.addColorStop(0.55, '#101a48'); sg.addColorStop(0.8, '#3a3a78'); sg.addColorStop(1, '#6a4a7a'); skx.fillStyle = sg; skx.fillRect(0, 0, 64, 256);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.MeshBasicMaterial({ map: mkTex(skc), side: THREE.BackSide, depthWrite: false, fog: false })); g.add(sky);
    var starP = []; for (i = 0; i < 400; i++) { var sa = rnd() * TAU, se = 0.15 + rnd() * 1.2; starP.push(Math.cos(sa) * Math.cos(se) * 1000, Math.sin(se) * 1000, Math.sin(sa) * Math.cos(se) * 1000); }
    var sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.Float32BufferAttribute(starP, 3)); g.add(new THREE.Points(sgm, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })));
    var gdc = mkCanvas(128, 128), gdx = gdc.getContext('2d'); gdx.fillStyle = '#0b0f26'; gdx.fillRect(0, 0, 128, 128); gdx.fillStyle = '#1b2250'; gdx.fillRect(0, 0, 128, 5); gdx.fillRect(0, 0, 5, 128); gdx.fillStyle = '#141a3a'; gdx.fillRect(5, 5, 123, 2); gdx.fillRect(5, 5, 2, 123);
    var gdt = mkTex(gdc); gdt.wrapS = gdt.wrapT = THREE.RepeatWrapping; gdt.repeat.set(1800 / 30, 1800 / 30); gdt.anisotropy = 4;
    var gnd = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshBasicMaterial({ map: gdt })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.06; g.add(gnd);
    var wtc = mkCanvas(256, 256), wtx = wtc.getContext('2d'); wtx.fillStyle = '#0a1a46'; wtx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 160; i++) { wtx.fillStyle = ['rgba(255,170,90,', 'rgba(255,100,190,', 'rgba(110,220,255,'][i % 3] + (0.1 + rnd() * 0.35) + ')'; wtx.fillRect(rnd() * 256, rnd() * 256, 6 + rnd() * 40, 1.5); }
    var wtt = mkTex(wtc); wtt.wrapS = wtt.wrapT = THREE.RepeatWrapping; wtt.repeat.set(14, 6);
    var water = new THREE.Mesh(new THREE.PlaneGeometry(1800, 640), new THREE.MeshBasicMaterial({ map: wtt, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); water.rotation.x = -Math.PI / 2; water.position.set(0, -0.04, 410); g.add(water);

    /* ---------- le décor : ville dense, lampadaires, panneaux de virage, portiques, tribunes, grande roue (kart-decor.js) ---------- */
    var decor = F.kartDecor ? F.kartDecor.build(g, { TRK: TRK, KS: KS, mkCanvas: mkCanvas, mkTex: mkTex, rng: rng, SERIF: SERIF }) : null;

    /* ---------- points de contrôle : de vrais portiques lumineux, avec leur numéro, une ligne au sol et deux colonnes de lumière visibles de loin ---------- */
    var cpMats = [], cpFlash = [], cpPos = [];
    function gate(frac, isStart) {
      var s = frac * N, p = TRK.at(s, {}), grp = new THREE.Group(); grp.position.set(p.x, 0, p.z); grp.rotation.y = -p.yaw; g.add(grp);
      var col = isStart ? 0xffffff : 0x22e5ff, mk = function (o) { var m = new THREE.MeshBasicMaterial(o); cpMats.push({ k: Math.round(frac * NCP) % NCP, m: m, start: isStart, add: !!o.blending }); return m; }, hw = WALL_OFF + 0.9, dark = new THREE.MeshBasicMaterial({ color: 0x2a2f52 });
      cpPos.push({ x: p.x, z: p.z });
      [-hw, hw].forEach(function (x) {
        var po = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.4, 0.9), dark); po.position.set(x, 4.7, 0); grp.add(po);
        var st = new THREE.Mesh(new THREE.BoxGeometry(0.18, 9.4, 0.95), mk({ color: col })); st.position.set(x, 4.7, 0); grp.add(st);
        if (!isStart) { var colm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 46, 10, 1, true), mk({ color: col, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); colm.position.set(x, 23, 0); grp.add(colm); }
      });
      var beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.9, 1.5, 1.0), dark); beam.position.y = 9.1; grp.add(beam);
      var neon = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.24, 1.06), mk({ color: col })); neon.position.set(0, 8.25, 0); grp.add(neon);
      var strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 0.9), mk({ color: col, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.06, 0); grp.add(strip);
      if (!isStart) {
        var pc = mkCanvas(512, 96), px2 = pc.getContext('2d'); px2.fillStyle = '#0a0d22'; px2.fillRect(0, 0, 512, 96); px2.strokeStyle = '#22e5ff'; px2.lineWidth = 6; px2.strokeRect(5, 5, 502, 86);
        px2.fillStyle = '#ffffff'; px2.font = '900 54px ' + SERIF; px2.textAlign = 'center'; px2.textBaseline = 'middle'; px2.fillText('CHECKPOINT ' + Math.round(frac * NCP), 256, 52, 480);
        var pn = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8), new THREE.MeshBasicMaterial({ map: mkTex(pc), side: THREE.DoubleSide })); pn.position.set(0, 10.9, 0.1); grp.add(pn);
      } else {
        var bc = mkCanvas(1024, 128), bx2 = bc.getContext('2d'); for (var q = 0; q < 64; q++) { bx2.fillStyle = (q + Math.floor(q / 32)) % 2 ? '#fff' : '#111'; bx2.fillRect(q * 16, 0, 16, 16); bx2.fillRect(q * 16, 112, 16, 16); }
        bx2.fillStyle = '#0a0d22'; bx2.fillRect(0, 16, 1024, 96); bx2.fillStyle = '#ffffff'; bx2.font = '900 70px ' + SERIF; bx2.textAlign = 'center'; bx2.textBaseline = 'middle'; bx2.fillText('DÉPART · ARRIVÉE', 512, 66, 980);
        var ban = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hw * 2 / 8), new THREE.MeshBasicMaterial({ map: mkTex(bc), side: THREE.DoubleSide })); ban.position.set(0, 10.7, 0.55); grp.add(ban);
        var lc = mkCanvas(64, 64), lx2 = lc.getContext('2d'); for (var a = 0; a < 8; a++) for (var b = 0; b < 8; b++) { lx2.fillStyle = (a + b) % 2 ? '#fff' : '#111'; lx2.fillRect(a * 8, b * 8, 8, 8); }
        var lt = mkTex(lc); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(ROAD_HALF, 1);
        var ln = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.6), new THREE.MeshBasicMaterial({ map: lt, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.07, 0); grp.add(ln);
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
    var cam = { yaw: 0, shake: 0 }, carMesh = null, carMeshId = '', fx = [], eng = null, engSt = { rpm: 0.2 }, flame = null, tmp = {}, pcache = {}, oldFar = 80, oldNear = 0.1;
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
    var srv = { cs: -1, cut: 0, cyc: 0 };                                    // la course en cours, telle que le serveur la décrit (départ, fin anticipée)
    function phaseInfo(t) { return KS.phaseAt(t, srv.cs, srv.cyc, srv.cut); }

    function setMyCar(id) {
      me.carId = id; try { localStorage.setItem('f3d_kartcar', id); } catch (e) { /* ok */ }
      if (ui) { var c = CAR_BY[id]; ui.gridName.innerHTML = esc(c.name) + '<small>' + (c.i + 1) + ' / ' + CARS.length + '</small>'; }
      if (carMeshId !== id && (phaseInfo(nowMs()).p === 'grid' || phaseInfo(nowMs()).p === 'wait')) wsSend({ t: 'car', id: id });
      if (eng && eng.id !== id) { eng.stop(); eng = makeEngine(id, true); }
      if (carMeshId === id) return;
      carMeshId = id; if (carMesh) { myRoot.remove(carMesh); carMesh = null; }
      var ph = placeholderCar(0x888888); myRoot.add(ph); carMesh = ph;
      loadCar(id, function (m) { if (carMeshId !== id) return; myRoot.remove(carMesh); carMesh = m; myRoot.add(m); });
    }
    function cycleCar(d) { var ph = phaseInfo(nowMs()); if (ph.p !== 'grid' && ph.p !== 'wait') return; setMyCar(CARS[(CAR_BY[me.carId].i + d + CARS.length) % CARS.length].id); }

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
      if (m.t === 'welcome') { srvOff = m.now - Date.now(); srv.cs = m.cs; srv.cut = m.cut || 0; srv.cyc = m.cyc | 0; applyCars(m.cars, srv.cyc); }
      else if (m.t === 's') { srvOff += ((m.n - Date.now()) - srvOff) * 0.25; srv.cs = m.cs; srv.cut = m.cut || 0; srv.cyc = m.cyc | 0; applyCars(m.cars, srv.cyc); }
      else if (m.t === 'car') { var rq = remotes[m.k]; if (rq && CAR_BY[m.c]) rq.carId = ''; }
      else if (m.t === 'ev') {
        var e = m.e;
        if (e.k === 'lap') { cpFlash[0] = 0.9; toast('Tour ' + (e.lap + 1) + ' / ' + LAPS + ' · ' + fmtT(e.time), '#fff', 1.8); tone(660, 880, 0.2, 'sine', 0.16); }
        else if (e.k === 'cp') { cpFlash[e.cp] = 0.9; toast('✔ Checkpoint ' + e.cp + ' / ' + NCP, '#3dff7a', 1.1); tone(880, 1320, 0.16, 'sine', 0.14); tone(1320, 1760, 0.12, 'sine', 0.08, 0.1); }
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
      r.tx = c.x; r.tz = c.z; r.ta = c.a || 0; r.vx = c.vx || 0; r.vz = c.vz || 0; r.st = c.st || 0; r.bot = !!c.bt; r.prog = c.p || 0; r.fin = c.f || 0; r.best = c.b || 0; r.cy = cyc; r.recv = performance.now();
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
      var locked = (function (p) { return p === 'grid' || p === 'count' || p === 'wait'; })(phaseInfo(nowMs()).p), k, i;
      for (k = 0; k < pending.length; k++) { for (i = 0; i < 3; i++) KS.stepCar(pc, pending[k].inp, 1 / 90, locked); pc.ev.length = 0; }
      var err = Math.hypot(pc.x - me.x, pc.z - me.z);
      if (err > 2.5) { me.x = pc.x; me.z = pc.z; me.yaw = pc.yaw; me.vx = pc.vx; me.vz = pc.vz; }
      else { var f = 0.3; me.x += (pc.x - me.x) * f; me.z += (pc.z - me.z) * f; me.yaw += angDiff(pc.yaw, me.yaw) * f; me.vx += (pc.vx - me.vx) * f; me.vz += (pc.vz - me.vz) * f; }
      me.st = pc.st; me.boost = pc.boost; me.driftT = pc.driftT;
    }
    function respawn() {
      var pi = phaseInfo(nowMs()); if (pi.p === 'grid' || pi.p === 'count' || pi.p === 'wait') return;
      wsSend({ t: 'respawn' }); toast('↺ Replacé', '#ffd24a', 1.2);
    }
    function presentList() { return Object.keys(remotes).map(function (k) { return remotes[k]; }); }
    function dropRemote(k) { var r = remotes[k]; if (!r) return; if (r.eng) { r.eng.stop(); r.eng = null; } g.remove(r.grp); g.remove(r.tag); r.tag.material.map.dispose(); delete remotes[k]; }

    /* ---------- interface ---------- */
    function toast(t, col, dur) { if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.textContent = t; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 1.6; }
    function mmBuild() {
      var c = mkCanvas(220, 150), x = c.getContext('2d'), bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9, k;
      for (k = 0; k < N; k++) { bx0 = Math.min(bx0, TRK.PX[k]); bx1 = Math.max(bx1, TRK.PX[k]); bz0 = Math.min(bz0, TRK.PZ[k]); bz1 = Math.max(bz1, TRK.PZ[k]); }
      var sc = Math.min(200 / (bx1 - bx0), 130 / (bz1 - bz0)), ox = 10 - bx0 * sc + (200 - (bx1 - bx0) * sc) / 2, oz = 10 - bz0 * sc + (130 - (bz1 - bz0) * sc) / 2;
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 5; x.lineJoin = 'round'; x.beginPath(); for (k = 0; k <= N; k += 3) { var i0 = k % N; if (k === 0) x.moveTo(TRK.PX[i0] * sc + ox, TRK.PZ[i0] * sc + oz); else x.lineTo(TRK.PX[i0] * sc + ox, TRK.PZ[i0] * sc + oz); } x.closePath(); x.stroke();
      x.fillStyle = '#22e5ff'; cpPos.forEach(function (q, qi) { if (qi) { x.beginPath(); x.arc(q.x * sc + ox, q.z * sc + oz, 3, 0, TAU); x.fill(); } });
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
        '<div class="kt-box kt-lobby"></div><div class="kt-box kt-grid"><button data-a="prev">◀</button><div class="n"></div><button data-a="next">▶</button></div>' +
        '<div class="kt-help">ZQSD / flèches : conduire · Espace : frein à main (dérape puis relâche = turbo) · R : replacer · C : vue · Manette : stick + RT / LT, A frein à main</div><div class="kt-box kt-res"></div>';
      world.container.appendChild(el);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var a = b.dataset.a;
        if (a === 'reset') respawn(); else if (a === 'view') camFar = !camFar; else if (a === 'prev') cycleCar(-1); else if (a === 'next') cycleCar(1); else if (a === 'quit') world.goRoom('minijeux', 'kart'); else if (a === 'solo') { wsSend({ t: 'solo' }); b.disabled = true; }
      });
      return { el: el, info: el.querySelector('.kt-info'), p: el.querySelector('.kt-info .p'), l: el.querySelector('.kt-info .l'), t: el.querySelector('.kt-info .t'), c: el.querySelector('.kt-info .c'), mini: el.querySelector('.kt-mini canvas'), spd: el.querySelector('.kt-spd b'), bar: el.querySelector('.kt-spd .bar i'), big: el.querySelector('.kt-big'), wrong: el.querySelector('.kt-wrong'), toast: el.querySelector('.kt-toast'), lobby: el.querySelector('.kt-lobby'), grid: el.querySelector('.kt-grid'), gridName: el.querySelector('.kt-grid .n'), res: el.querySelector('.kt-res'), help: el.querySelector('.kt-help') };
    }
    function ranking(pi) {
      var rows = [{ me: true, name: me.name, carId: me.carId, prog: me.prog, fin: me.fin, best: me.best }];
      presentList().forEach(function (r) { rows.push({ name: r.name, carId: r.carId, prog: r.prog || 0, fin: r.fin, best: r.best, bot: r.bot }); });
      rows.sort(function (a, b) { if (a.fin && b.fin) return a.fin - b.fin; if (a.fin) return -1; if (b.fin) return 1; return b.prog - a.prog; });
      return rows;
    }
    function refreshHud(pi) {
      if (!ui) return;
      if (!me.ready) { ui.big.innerHTML = esc(netErr || 'Connexion au serveur…'); ui.grid.classList.remove('on'); return; }
      var rows = ranking(pi), pos = rows.findIndex(function (r) { return r.me; }) + 1, lap = Math.min(LAPS, Math.max(1, Math.floor(Math.max(0, me.prog)) + 1));
      ui.p.innerHTML = pos + '<small>/' + rows.length + '</small>';
      ui.l.textContent = me.fin ? '🏁 Terminé · ' + fmtT(me.fin) : 'Tour ' + lap + ' / ' + LAPS;
      ui.t.textContent = pi.p === 'wait' ? 'En attente de pilotes' : pi.p === 'race' ? 'Temps ' + fmtT(nowMs() - pi.raceStart) + (me.best ? ' · Meilleur ' + fmtT(me.best) : '') : (pi.p === 'grid' ? 'Départ dans ' + Math.ceil(pi.left / 1000 + COUNT_MS / 1000) + ' s' : '');
      ui.c.textContent = 'Point de contrôle ' + Math.max(0, me.cp) % NCP + ' / ' + NCP;
      ui.spd.textContent = Math.round(me.spd * 3.6 * 1.25); ui.bar.style.width = Math.min(100, me.spd / VMAX * 100) + '%';
      ui.grid.classList.toggle('on', pi.p === 'grid' || pi.p === 'wait');
      if (pi.p === 'wait') {
        var nh = 1 + presentList().filter(function (r) { return !r.bot; }).length, names = [me.name].concat(presentList().filter(function (r) { return !r.bot; }).map(function (r) { return r.name; }));
        ui.lobby.innerHTML = '<h3>🏁 Salle d\'attente</h3><div class="s">' + (nh >= 2 ? 'Les pilotes sont là : la course démarre…' : 'La course démarre dès qu\'un 2e pilote arrive.<br>Tu peux aussi courir tout de suite contre des bots (6 voitures).') + '</div><div class="who">' + nh + ' pilote' + (nh > 1 ? 's' : '') + ' : ' + esc(names.join(', ')) + '</div>' + (nh === 1 ? '<button data-a="solo">🤖 Jouer contre des bots</button>' : '');
        if (!ui.lobbyOn) { ui.lobby.classList.add('on'); ui.lobbyOn = true; }
      } else if (ui.lobbyOn) { ui.lobby.classList.remove('on'); ui.lobbyOn = false; }
      // grand texte : compte à rebours, GO
      var big = '';
      if (pi.p === 'grid') big = 'Prépare-toi<small>Choisis ta voiture · départ dans ' + Math.ceil((pi.left + COUNT_MS) / 1000) + ' s</small>';
      else if (pi.p === 'count') big = String(Math.ceil(pi.left / 1000));
      else if (pi.p === 'race' && nowMs() - pi.raceStart < 1200) big = '<span style="color:#3ddc84">GO !</span>';
      else if (pi.p === 'wait') big = '';
      ui.big.innerHTML = big;
      // résultats
      if (pi.p === 'results') {
        var h = '<h3>🏁 Résultats</h3><table><tr><th>#</th><th>Pilote</th><th>Voiture</th><th>Temps</th></tr>';
        rows.forEach(function (r, k) { h += '<tr class="' + (r.me ? 'me' : '') + '"><td>' + (['🥇', '🥈', '🥉'][k] || (k + 1)) + '</td><td>' + esc(r.name) + '</td><td>' + esc((CAR_BY[r.carId] || CARS[0]).name) + '</td><td>' + (r.fin ? fmtT(r.fin) : 'Tour ' + Math.min(LAPS, Math.max(1, Math.floor(Math.max(0, r.prog)) + 1)) + ' · ' + Math.round(Math.max(0, Math.min(1, r.prog / LAPS)) * 100) + ' %') + '</td></tr>'; });
        ui.res.innerHTML = h + '</table><div class="ft">Retour à la salle d\'attente dans ' + Math.max(0, Math.ceil(pi.left / 1000)) + ' s</div>'; ui.res.classList.add('on');
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
      oldFar = world.camera.far; oldNear = world.camera.near; world.camera.far = 1500; world.camera.near = 0.3; world.camera.updateProjectionMatrix();
      engSt.rpm = 0.2; eng = makeEngine(me.carId, true); srv.cs = -1; srv.cut = 0;
      if (F.isStaff && !F.isStaff()) { w.flash('🏎️ Course en test', 'Réservée au Patron, au Co Fondateur et au Staff'); setTimeout(function () { world.goRoom('minijeux', 'kart'); }, 300); return; }
      myKey = F.me(); me.ready = false; me.rc = -1; pending = []; seq = 0; inpAcc = 0; netErr = ''; lastPhase = '';
      connect();
      w.sitDown(room);
      if (!F.token()) setTimeout(function () { if (active) world.goRoom('minijeux', 'kart'); }, 2500);
    };
    function cleanup() {
      if (!active) return; active = false; keys = {};
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
      if (eng) { eng.stop(); eng = null; }
      world.camera.far = oldFar; world.camera.near = oldNear; world.camera.updateProjectionMatrix();
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
      if (decor) decor.update(dt);
      for (var cq = 0; cq < NCP; cq++) if (cpFlash[cq] > 0) cpFlash[cq] -= dt;
      cpMats.forEach(function (e) { e.m.color.setHex(cpFlash[e.k] > 0 ? 0x3dff7a : (e.start ? 0xffffff : 0x22e5ff)); });
      if (!active) return;
      var now = nowMs(), pi = phaseInfo(now);
      if (reconnectT > 0) { reconnectT -= dt; if (reconnectT <= 0 && active && (!ws || ws.readyState > 1)) connect(); }
      if (pi.cyc !== me.cyc) { me.cyc = pi.cyc; resShown = false; if (ui) ui.res.classList.remove('on'); lastCount = -1; }
      if (pi.p !== lastPhase) lastPhase = pi.p;
      if (pi.p === 'count') { var c = Math.ceil(pi.left / 1000); if (c !== lastCount) { lastCount = c; tone(c > 0 ? 440 : 880, c > 0 ? 440 : 880, 0.15, 'square', 0.12); } }
      var inp = readInput(), locked = pi.p === 'grid' || pi.p === 'count' || pi.p === 'wait' || !me.ready;
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
      // roues de ma voiture
      animWheels(carMesh, vf0, me.st, dt);
      // moteur : régime lié à la vitesse et aux rapports, crissement des pneus quand ça dérape
      if (eng) { var rpm = calcRpm(engSt, me.spd, inp.th, dt, locked), vlat = me.vx * Math.cos(me.yaw) + me.vz * Math.sin(me.yaw), slip = (inp.hand && me.spd > 9) ? 1 : Math.max(0, Math.min(1, (Math.abs(vlat) - 3.5) / 7)); eng.set({ rpm: rpm, thr: locked ? inp.th * 0.5 : inp.th, vol: me.ready ? 0.3 : 0, pan: 0, slip: slip, spd: me.spd }); }
      // les autres voitures
      var kk = 1 - Math.exp(-dt * 12), nowP = performance.now();
      Object.keys(remotes).forEach(function (k) {
        var r = remotes[k], age = Math.min(0.3, (nowP - r.recv) / 1000), px = r.tx + (r.vx || 0) * age, pz = r.tz + (r.vz || 0) * age;
        r.x += (px - r.x) * kk; r.z += (pz - r.z) * kk; r.yaw += angDiff(r.ta, r.yaw) * kk; r.grp.position.set(r.x, 0, r.z); r.grp.rotation.y = -r.yaw; r.tag.position.set(r.x, 2.5, r.z);
        var rsp = Math.hypot(r.vx || 0, r.vz || 0), rvf = (r.vx || 0) * Math.sin(r.yaw) - (r.vz || 0) * Math.cos(r.yaw); animWheels(r.car, rvf, r.st || 0, dt);
        // moteur des autres voitures : plus fort quand elles sont proches, placé à gauche ou à droite selon leur position
        var dx = r.x - me.x, dz = r.z - me.z, dd = Math.hypot(dx, dz);
        if (dd < 95 && Object.keys(remotes).length) {
          if (!r.eng && r.carId && eng) { var nv = 0; Object.keys(remotes).forEach(function (kq) { if (remotes[kq].eng) nv++; }); if (nv < 6) { r.eng = makeEngine(r.carId, false); r.engSt = { rpm: 0.2 }; } }
          if (r.eng) { var rpm2 = calcRpm(r.engSt, rsp, 0.7, dt, pi.p !== 'race' && pi.p !== 'results'); r.eng.set({ rpm: rpm2, thr: pi.p === 'race' ? 0.8 : 0.2, vol: 0.22 * Math.pow(Math.max(0, 1 - dd / 95), 1.5), pan: Math.max(-0.9, Math.min(0.9, Math.sin(angDiff(Math.atan2(dx, -dz), cam.yaw)))), slip: 0, spd: rsp }); }
        } else if (r.eng) { r.eng.stop(); r.eng = null; }
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
  F.kart = { CARS: CARS, TRK: TRK, loadCar: loadCar };
})();
