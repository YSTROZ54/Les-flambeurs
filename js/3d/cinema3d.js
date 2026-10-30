/* =====================================================================
   cinema3d.js — Le cinéma de Tropi Stream, dans le casino 3D des Flambeurs (PC seulement)
   ---------------------------------------------------------------------
   On y entre par la grande porte « Cinéma » du hall (hall3d.js) et on en ressort vers le hall.
   Décor : grand écran entouré de rideaux de velours rouge, scène avec rampe de lumières, cinq rangées de fauteuils
   (deux blocs de quatre, allée au milieu), appliques, cabine de projection, comptoir à pop-corn, citrouilles d'Halloween.
   - On s'assoit sur n'importe quel fauteuil libre (F ou clic) : la caméra passe à hauteur d'yeux, face à l'écran, et on
     garde le HUD du joueur (barre du bas, téléphone, emotes). Les autres joueurs nous voient assis (canal temps réel du monde).
   - Le film est la présentation Premium de Tropi Stream (video/tropistream-presentation.mp4, 58 s). Chacun la lance pour soi :
     bouton « Lancer la séance », clic sur l'écran ou touche P. Pendant la séance les lumières baissent et la musique se tait.
   - La musique de fond est fabriquée à la volée (WebAudio, un petit air de jazz lent qui boucle) : aucun fichier son à charger.
     Elle démarre à l'arrivée, se coupe avec le bouton « Musique » (choix gardé d'une visite à l'autre) et quitte la salle avec nous.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), video/tropistream-presentation.mp4.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 8, HZ = 11, H = 9;                       // demi-largeur, demi-profondeur, hauteur (mètres)
  var VIDEO_SRC = 'video/tropistream-presentation.mp4?v=1';
  var POSTER_SRC = 'assets/bannieres/tropistream.jpg';  // 16/9 : sert d'affiche sur l'écran avant la séance
  var SCR_W = 10, SCR_H = SCR_W * 9 / 16, SCR_Y = 2.0;   // l'écran : largeur, hauteur, bas de l'écran
  var ROWS = [-4.6, -2.7, -0.8, 1.1, 3.0];           // z de chaque rangée
  var COLS = [-5.2, -4.1, -3.0, -1.9, 1.9, 3.0, 4.1, 5.2];
  var VELVET = 0x8c1a26;
  var MUSIC_KEY = 'f3d_cinema_music';

  /* ---------- petits outils ---------- */
  var cache = {};
  function lam(c) { var k = 'l' + c; return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({ color: c })); }
  function bas(c) { var k = 'b' + c; return cache[k] || (cache[k] = new THREE.MeshBasicMaterial({ color: c })); }
  function std(c, rough, metal, emi) { var k = 's' + c + '_' + rough + '_' + metal + '_' + (emi || 0); return cache[k] || (cache[k] = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: emi || 0 })); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), m); o.position.set(x, y, z); p.add(o); return o; }
  function sph(p, r, m, x, y, z) { var o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); o.position.set(x, y, z); p.add(o); return o; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmtT(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /* ===================== LA MUSIQUE DE FOND (WebAudio) ===================== */
  // Petit air de jazz lent à 66 pulsations par minute : piano électrique, basse douce, balai, quelques notes qui se baladent.
  // Quatre mesures qui bouclent : Ré mineur 9, Sol 13, Do majeur 9, La 7.
  var CHORDS = [
    { bass: 38, notes: [53, 57, 60, 64] },
    { bass: 43, notes: [53, 59, 64, 67] },
    { bass: 36, notes: [52, 55, 59, 62] },
    { bass: 45, notes: [55, 61, 65, 67] }
  ];
  var SCALE = [62, 65, 69, 72, 76, 79];             // pentatonique de Ré : les notes de mélodie sonnent bien sur tous les accords
  var BEAT = 60 / 66, EIGHTH = BEAT / 2;
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function createMusic() {
    var AC = window.AudioContext || window.webkitAudioContext;
    var m = { ctx: null, master: null, dry: null, wet: null, noise: null, timer: 0, nextT: 0, step: 0, level: 1, on: true, up: false, lastTarget: -1 };
    try { if (localStorage.getItem(MUSIC_KEY) === '0') m.on = false; } catch (e) { /* stockage bloqué : musique activée */ }

    function build() {
      if (!AC || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return false;   // le navigateur exige un geste avant tout son
      try { m.ctx = new AC(); } catch (e) { m.ctx = null; return false; }
      var c = m.ctx;
      m.master = c.createGain(); m.master.gain.value = 0; m.master.connect(c.destination);
      m.dry = c.createGain(); m.dry.gain.value = 1; m.dry.connect(m.master);
      // réverbération : un bruit qui s'éteint en 2,4 s
      var len = Math.floor(c.sampleRate * 2.4), imp = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = imp.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      var conv = c.createConvolver(); conv.buffer = imp;
      m.wet = c.createGain(); m.wet.gain.value = 0.42; m.wet.connect(conv); conv.connect(m.master);
      // écho de la mélodie
      var dl = c.createDelay(1.5); dl.delayTime.value = EIGHTH * 3; var fb = c.createGain(); fb.gain.value = 0.32;
      m.echo = c.createGain(); m.echo.gain.value = 0.5; m.echo.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(m.wet); dl.connect(m.dry);
      var nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
      for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      m.noise = nb;
      return true;
    }
    // un son de piano électrique : deux oscillateurs + une « dent » aiguë qui s'éteint vite, filtrés
    function epiano(t, note, dur, vol, echo) {
      var c = m.ctx, f = mtof(note), g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [['sine', f, 1], ['triangle', f * 2.003, 0.35]].forEach(function (o) {
        var os = c.createOscillator(), og = c.createGain(); os.type = o[0]; os.frequency.value = o[1]; og.gain.value = o[2];
        os.connect(og); og.connect(g); os.start(t); os.stop(t + dur + 0.05);
      });
      var tine = c.createOscillator(), tg = c.createGain(); tine.type = 'sine'; tine.frequency.value = f * 4;
      tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.16, t + 0.008); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      tine.connect(tg); tg.connect(g); tine.start(t); tine.stop(t + 0.4);
      g.connect(lp); lp.connect(m.dry); lp.connect(m.wet); if (echo) lp.connect(m.echo);
    }
    function bassNote(t, note, dur, vol) {
      var c = m.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = mtof(note); lp.type = 'lowpass'; lp.frequency.value = 520;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(m.dry); o.start(t); o.stop(t + dur + 0.05);
    }
    function brush(t, vol) {
      var c = m.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = m.noise; bp.type = 'bandpass'; bp.frequency.value = 6200; bp.Q.value = 0.8;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      s.connect(bp); bp.connect(g); g.connect(m.dry); s.start(t); s.stop(t + 0.12);
    }
    // programme les notes de la croche numéro n (8 croches par mesure, la 2e croche de chaque temps est un peu retardée : swing)
    function schedule(n, t) {
      var bar = Math.floor(n / 8) % CHORDS.length, e = n % 8, ch = CHORDS[bar];
      if (e === 0) { ch.notes.forEach(function (x, i) { epiano(t + i * 0.012, x, 2.6, 0.075, false); }); bassNote(t, ch.bass, 1.2, 0.3); }
      if (e === 3) { ch.notes.slice(1).forEach(function (x, i) { epiano(t + i * 0.01, x, 1.1, 0.045, false); }); }
      if (e === 4) bassNote(t, ch.bass + 7, 0.8, 0.2);
      if (e === 7) bassNote(t, CHORDS[(bar + 1) % CHORDS.length].bass + 1, 0.4, 0.16);   // note d'approche vers la mesure suivante
      if (e % 2 === 1) brush(t, 0.05); else if (e % 4 === 2) brush(t, 0.022);
      if ((e === 2 || e === 5 || e === 6) && Math.random() < 0.3) epiano(t, SCALE[Math.floor(Math.random() * SCALE.length)], 1.6, 0.06, true);
    }
    function tick() {
      var c = m.ctx; if (!c || c.state !== 'running') return;
      while (m.nextT < c.currentTime + 0.5) {
        var e = m.step % 8, t = m.nextT < c.currentTime ? c.currentTime + 0.02 : m.nextT;
        schedule(m.step, t + (e % 2 ? EIGHTH * 0.16 : 0));
        m.nextT = t + EIGHTH; m.step++;
      }
    }
    m.setLevel = function (v) {
      m.level = v;
      var target = m.on && m.up ? 0.55 * v : 0;
      if (m.master && m.ctx && target !== m.lastTarget) { m.lastTarget = target; m.master.gain.setTargetAtTime(target, m.ctx.currentTime, 0.7); }
    };
    function closeCtx() {                              // fondu rapide, puis on libère le son
      clearInterval(m.timer); m.timer = 0;
      var c = m.ctx; if (!c) return;
      m.ctx = null; m.lastTarget = -1;
      try { m.master.gain.setTargetAtTime(0, c.currentTime, 0.15); } catch (e) { /* déjà fermé */ }
      setTimeout(function () { try { c.close(); } catch (e) { /* déjà fermé */ } }, 900);
    }
    m.start = function () {
      m.up = true;
      if (!m.on) return false;
      if (!m.ctx && !build()) return false;
      if (m.ctx.state === 'suspended') m.ctx.resume();
      if (!m.timer) { m.nextT = m.ctx.currentTime + 0.15; m.step = 0; m.timer = setInterval(tick, 120); }
      m.setLevel(m.level);
      return true;
    };
    m.stop = function () { m.up = false; closeCtx(); };
    m.toggle = function () {
      m.on = !m.on;
      try { localStorage.setItem(MUSIC_KEY, m.on ? '1' : '0'); } catch (e) { /* stockage bloqué */ }
      if (m.on) { if (m.up) m.start(); } else closeCtx();
      return m.on;
    };
    return m;
  }

  /* ===================== LA SALLE ===================== */
  function createCinemaRoom(world) {
    var room = { title: '<img class="cin-title-logo" src="assets/cinema/tropistream-serveur.png" alt="">CINÉMA', subtitle: 'TROPI STREAM · PRÉSENTATION', topic: 'flambeurs-cinema-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, low = !!world.low;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 3.0, zMax: HZ - 0.7 };   // la scène (les 2,3 premiers mètres) reste hors d'atteinte
    injectCss();

    /* --- sol : moquette rouge sombre à losanges --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = '#3a0c16'; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = '#561624'; fx.lineWidth = 6;
    for (var i = -1; i < 5; i++) { fx.beginPath(); fx.moveTo(i * 64, 0); fx.lineTo(i * 64 + 256, 256); fx.moveTo(i * 64 + 256, 0); fx.lineTo(i * 64, 256); fx.stroke(); }
    fx.fillStyle = '#6a1a2a'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { fx.beginPath(); fx.arc(i * 64 + 32, j * 64, 4, 0, TAU); fx.fill(); }
    var ftex = mkTex(fc); ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(HX * 2 / 2.5, HZ * 2 / 2.5);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ map: ftex })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs, plafond, panneaux acoustiques --- */
    var wallM = std(0x24090f, 0.9, 0.05), panelM = std(0x3b0f1a, 0.85, 0.05), trimM = std(0xc9a227, 0.3, 0.6, 0x2a1d00);
    function wall(w, h, px, py, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, H, 0, H / 2, -HZ, 0); wall(HX * 2, H, 0, H / 2, HZ, Math.PI); wall(HZ * 2, H, -HX, H / 2, 0, Math.PI / 2); wall(HZ * 2, H, HX, H / 2, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0x140a0e })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    for (i = -HZ + 1.4; i < HZ - 1; i += 1.3) {            // lattes verticales sur les deux murs de côté
      box(g, 0.14, 4.8, 0.7, panelM, -HX + 0.07, 3.0, i); box(g, 0.14, 4.8, 0.7, panelM, HX - 0.07, 3.0, i);
    }
    [-HX + 0.06, HX - 0.06].forEach(function (x) { box(g, 0.1, 0.1, HZ * 2, trimM, x, 0.62, 0); box(g, 0.1, 0.1, HZ * 2, trimM, x, 5.6, 0); });   // filets dorés bas et haut
    [-HX + 0.02, HX - 0.02].forEach(function (x) { box(g, 0.04, 0.6, HZ * 2, std(0x14070b, 0.9, 0), x, 0.3, 0); });                                   // soubassement

    /* --- scène, rampe de lumières, écran --- */
    var stageD = 2.4;
    box(g, HX * 2, 0.3, stageD, std(0x2a1810, 0.7, 0.1), 0, 0.15, -HZ + stageD / 2);
    box(g, HX * 2, 0.04, 0.05, bas(0xffa040), 0, 0.2, -HZ + stageD + 0.01);       // petites lampes de la rampe, le long du bord
    for (i = -7; i <= 7; i += 1) sph(g, 0.06, bas(0xffcf80), i, 0.34, -HZ + stageD - 0.1);
    var frame = box(g, SCR_W + 0.5, SCR_H + 0.5, 0.12, bas(0x050305), 0, SCR_Y + SCR_H / 2, -HZ + 0.09);   // cadre noir
    var posterC = mkCanvas(1280, 720), posterTex = mkTex(posterC), posterImg = null;
    function paintPoster(label) {
      var x = posterC.getContext('2d');
      x.fillStyle = '#0c0508'; x.fillRect(0, 0, 1280, 720);
      if (posterImg) x.drawImage(posterImg, 0, 0, 1280, 720);
      x.fillStyle = 'rgba(6,2,4,0.35)'; x.fillRect(0, 0, 1280, 720);
      x.fillStyle = 'rgba(6,2,4,0.88)'; x.fillRect(0, 560, 1280, 160);                                   // bandeau en bas pour le texte
      x.fillStyle = 'rgba(255,122,26,0.95)'; x.beginPath(); x.arc(640, 300, 92, 0, TAU); x.fill();         // gros bouton lecture
      x.fillStyle = '#1a0a04'; x.beginPath(); x.moveTo(610, 250); x.lineTo(610, 350); x.lineTo(698, 300); x.closePath(); x.fill();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff3e0';
      x.font = '800 54px ' + SERIF; x.fillText(label, 640, 612, 1180);
      x.fillStyle = '#ffb066'; x.font = '700 28px ' + MONO; x.fillText('Présentation Premium · tropistream.fr', 640, 678, 1180);
      posterTex.needsUpdate = true;
    }
    paintPoster('LANCER LA SÉANCE');
    var img = new Image();
    img.onload = function () { posterImg = img; paintPoster(film.state === 'ended' ? 'REVOIR LA SÉANCE' : 'LANCER LA SÉANCE'); };
    img.src = POSTER_SRC;
    var screenM = new THREE.MeshBasicMaterial({ map: posterTex });
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenM); screen.position.set(0, SCR_Y + SCR_H / 2, -HZ + 0.16); g.add(screen);
    room.interactables.push({ hit: screen, x: 0, z: -HZ, use: function () { togglePlay(); } });   // clic sur l'écran : lecture / pause

    /* --- rideaux de velours et lambrequin --- */
    var cc = mkCanvas(256, 64), cx = cc.getContext('2d');
    for (i = 0; i < 256; i++) { var sh = 0.62 + 0.38 * Math.abs(Math.sin(i / 256 * TAU * 7)); cx.fillStyle = 'rgb(' + Math.round(140 * sh) + ',' + Math.round(22 * sh) + ',' + Math.round(34 * sh) + ')'; cx.fillRect(i, 0, 1, 64); }
    var ctex = mkTex(cc), curtM = new THREE.MeshLambertMaterial({ map: ctex });
    var curtains = [], CW = HX - SCR_W / 2 - 0.1;
    [-1, 1].forEach(function (s) {
      var cm = box(g, CW, H - 0.9, 0.55, curtM, s * (SCR_W / 2 + 0.1 + CW / 2), (H - 0.9) / 2 + 0.3, -HZ + 0.42);
      var tie = box(g, 0.1, 0.5, 0.7, trimM, s * (SCR_W / 2 + 0.2), 2.3, -HZ + 0.42);      // embrasse dorée
      curtains.push({ s: s, m: cm, tie: tie });
    });
    var valance = box(g, HX * 2, 0.9, 0.75, curtM, 0, H - 0.45, -HZ + 0.45);
    var valTrim = box(g, HX * 2, 0.07, 0.8, trimM, 0, H - 0.93, -HZ + 0.45);
    var openK = 0;                                     // 0 = rideaux fermés, écran normal ; 1 = rideaux ouverts, l'écran prend tout le mur
    function ease(v) { return v * v * (3 - 2 * v); }
    function layoutScreen() {
      var e = ease(openK), sc = 1 + (HX * 2 / SCR_W - 1) * e, cy = (SCR_Y + SCR_H / 2) + (H / 2 - (SCR_Y + SCR_H / 2)) * e;   // 16 x 9 m : exactement le mur
      beamGrp.scale.set(sc, 1, 0.5625 * sc);          // le faisceau suit l'écran
      screen.scale.set(sc, sc, 1); screen.position.y = cy; frame.scale.set(sc, sc, 1); frame.position.y = cy;
      curtains.forEach(function (c) {
        var w = 1 - 0.88 * e;                          // le rideau se plisse contre le mur
        c.m.scale.x = w; c.m.position.x = c.s * (SCR_W / 2 + 0.1 + CW / 2 + (HX - 0.05 - CW * w / 2 - (SCR_W / 2 + 0.1 + CW / 2)) * e);
        c.tie.position.x = c.s * (SCR_W / 2 + 0.2 + (HX - 0.4 - SCR_W / 2 - 0.2) * e); c.tie.visible = e < 0.5;
      });
      valance.position.y = H - 0.45 + 1.0 * e; valTrim.position.y = H - 0.93 + 1.0 * e;   // le lambrequin remonte dans le plafond
    }

    /* --- fauteuils : velours rouge, accoudoirs, dossier légèrement penché --- */
    var seats = room.seats = [], seatGeo = {
      cush: new THREE.BoxGeometry(0.74, 0.14, 0.62), back: new THREE.BoxGeometry(0.74, 0.7, 0.14), roll: new THREE.CylinderGeometry(0.075, 0.075, 0.74, 10),
      side: new THREE.BoxGeometry(0.09, 0.5, 0.7), arm: new THREE.BoxGeometry(0.11, 0.07, 0.62), hit: new THREE.BoxGeometry(0.9, 1.3, 0.9)
    };
    var velM = lam(VELVET), darkM = lam(0x180a0e), hitM = new THREE.MeshBasicMaterial({ visible: false });
    function seat(x, z) {
      var s = new THREE.Group(); s.position.set(x, 0, z); g.add(s);
      function put(geo, mat, px, py, pz, rx) { var m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; s.add(m); return m; }
      put(seatGeo.cush, velM, 0, 0.5, -0.02); put(seatGeo.back, velM, 0, 0.86, 0.3, 0.14); put(seatGeo.roll, velM, 0, 1.23, 0.36).rotation.z = Math.PI / 2;
      [-1, 1].forEach(function (sd) { put(seatGeo.side, darkM, sd * 0.415, 0.25, 0.0); put(seatGeo.arm, velM, sd * 0.415, 0.58, -0.02); });
      var hit = put(seatGeo.hit, hitM, 0, 0.65, 0.05);
      var n = seats.length, st = { n: n, x: x, z: z, yaw: 0, sx: x, sz: z - 0.95, hit: hit };
      seats.push(st);
      room.interactables.push({
        hit: hit, x: x, z: z, radius: 0.95,
        enabled: function () { return !seat_.cur && !taken(st); },
        prompt: function () { return '🎬 S\'asseoir  [F]'; },
        use: function (w) { sit(w, st); }
      });
    }
    var seat_ = { cur: null };
    ROWS.forEach(function (rz) { COLS.forEach(function (cx2) { seat(cx2, rz); }); });

    /* --- feux d'allée au sol, à chaque bout de rangée --- */
    ROWS.forEach(function (rz) { [-6.0, -1.3, 1.3, 6.0].forEach(function (ax) { box(g, 0.06, 0.04, 0.2, bas(0xffa040), ax, 0.03, rz + 0.1); }); });

    /* --- fond de salle : appliques, cabine de projection, comptoir à pop-corn, porte de sortie --- */
    var glowC = mkCanvas(64, 64), gx = glowC.getContext('2d'), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,200,130,0.85)'); gr.addColorStop(0.4, 'rgba(255,150,70,0.3)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    var glowM = new THREE.SpriteMaterial({ map: mkTex(glowC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    var lampGlow = [], shadeM = new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide });
    function sconce(x, z, ry) {                         // ry : le mur regarde vers (sin ry, cos ry)
      var s = new THREE.Group(); s.position.set(x, 3.0, z); s.rotation.y = ry; g.add(s);
      box(s, 0.12, 0.4, 0.04, trimM, 0, 0, 0.02);
      var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.34, 14, 1, true), shadeM); sh.position.set(0, 0.05, 0.22); s.add(sh);
      var gl = new THREE.Sprite(glowM); gl.scale.set(1.8, 1.8, 1); gl.position.set(0, 0.05, 0.3); s.add(gl); lampGlow.push(gl);
    }
    [-7, -3.5, 0, 3.5, 7].forEach(function (z) { sconce(-HX + 0.02, z, Math.PI / 2); sconce(HX - 0.02, z, -Math.PI / 2); });
    // cabine de projection : fenêtre noire dans le mur du fond, projecteur au plafond
    box(g, 2.2, 0.9, 0.08, bas(0x050305), 4.0, 6.0, HZ - 0.03); box(g, 2.4, 0.12, 0.12, trimM, 4.0, 6.5, HZ - 0.06); box(g, 2.4, 0.12, 0.12, trimM, 4.0, 5.5, HZ - 0.06);
    var proj = new THREE.Group(); proj.position.set(0, H - 0.75, 6.8); g.add(proj);
    box(proj, 0.6, 0.4, 0.9, std(0x2a2a30, 0.5, 0.6), 0, 0, 0); cyl(proj, 0.11, 0.14, 0.4, std(0x101014, 0.4, 0.7), 0, 0, -0.62, 14).rotation.x = Math.PI / 2;
    box(proj, 0.06, 0.4, 0.06, std(0x2a2a30, 0.5, 0.6), 0, 0.4, 0.2);
    // faisceau du projecteur : une pyramide à peine visible, allumée pendant la séance
    var beamLen = Math.hypot(6.8 + HZ, (H - 0.75) - (SCR_Y + SCR_H / 2));
    var beamGrp = new THREE.Group(), beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, SCR_W / 2 * Math.SQRT2, beamLen, 4, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beamMesh.rotation.y = Math.PI / 4; beamGrp.add(beamMesh); beamGrp.scale.set(1, 1, 0.5625);
    var pTop = new THREE.Vector3(0, H - 0.75, 6.0), pBot = new THREE.Vector3(0, SCR_Y + SCR_H / 2, -HZ + 0.2);
    beamGrp.position.copy(pTop).add(pBot).multiplyScalar(0.5);
    beamGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pTop.clone().sub(pBot).normalize());
    g.add(beamGrp);
    // comptoir à pop-corn
    var cw = new THREE.Group(); cw.position.set(-5.2, 0, HZ - 1.1); g.add(cw);
    box(cw, 3.2, 1.0, 0.8, lam(0x2a0f16), 0, 0.5, 0); box(cw, 3.3, 0.07, 0.9, std(0xd8cfc0, 0.4, 0.2), 0, 1.03, 0);
    box(cw, 0.9, 0.9, 0.6, std(0xc41e2a, 0.5, 0.2), -0.9, 1.5, 0); box(cw, 0.8, 0.8, 0.52, new THREE.MeshLambertMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.75 }), -0.9, 2.35, 0);
    for (i = 0; i < 14; i++) sph(cw, 0.07, lam(i % 3 ? 0xfff0c0 : 0xf2d98a), -0.9 + (Math.random() - 0.5) * 0.55, 2.1 + Math.random() * 0.55, (Math.random() - 0.5) * 0.3);
    var sgC = mkCanvas(512, 128), sgx = sgC.getContext('2d');
    sgx.fillStyle = '#12080f'; sgx.fillRect(0, 0, 512, 128); sgx.strokeStyle = '#ff7a1a'; sgx.lineWidth = 6; sgx.strokeRect(5, 5, 502, 118);
    sgx.textAlign = 'center'; sgx.textBaseline = 'middle'; sgx.fillStyle = '#ffb066'; sgx.font = '800 62px ' + SERIF; sgx.fillText('POP-CORN', 256, 66, 470);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: mkTex(sgC) })); sign.position.set(0.6, 2.6, 0.05); cw.add(sign);
    var cupM = [lam(0xffffff), lam(0xd01a1a)];
    for (i = 0; i < 6; i++) cyl(cw, 0.1, 0.075, 0.24, cupM[i % 2], 0.2 + i * 0.22, 1.19, 0.1, 12);
    room.colliders.push({ x: -5.2 - 1.0, z: HZ - 1.1, r: 0.8 }, { x: -5.2, z: HZ - 1.1, r: 0.8 }, { x: -5.2 + 1.0, z: HZ - 1.1, r: 0.8 });
    // pancarte « SORTIE » verte au-dessus de la porte
    var exC = mkCanvas(256, 80), ex = exC.getContext('2d'); ex.fillStyle = '#063a1a'; ex.fillRect(0, 0, 256, 80); ex.strokeStyle = '#3ddc7a'; ex.lineWidth = 5; ex.strokeRect(4, 4, 248, 72);
    ex.fillStyle = '#7dffae'; ex.font = '900 44px ' + MONO; ex.textAlign = 'center'; ex.textBaseline = 'middle'; ex.fillText('SORTIE', 128, 42, 230);
    var exit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(exC) })); exit.position.set(0, 4.55, HZ - 0.06); exit.rotation.y = Math.PI; g.add(exit);
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.4, h: 3.2, label: '🚪 SORTIE', sub: 'RETOUR AU HALL', color: 0xff7a1a, target: 'hall' });

    /* --- citrouilles d'Halloween de chaque côté de la scène --- */
    var pc = mkCanvas(256, 256), px = pc.getContext('2d');
    px.fillStyle = '#e8741a'; px.fillRect(0, 0, 256, 256);
    px.strokeStyle = '#b0520e'; px.lineWidth = 5; for (i = 0; i < 8; i++) { px.beginPath(); px.moveTo(i * 32 + 16, 0); px.lineTo(i * 32 + 16, 256); px.stroke(); }
    px.fillStyle = '#ffd24a';
    [[88, 96], [168, 96]].forEach(function (e) { px.beginPath(); px.moveTo(e[0] - 20, e[1] + 18); px.lineTo(e[0], e[1] - 18); px.lineTo(e[0] + 20, e[1] + 18); px.closePath(); px.fill(); });
    px.beginPath(); px.moveTo(78, 156); px.lineTo(96, 170); px.lineTo(112, 160); px.lineTo(128, 174); px.lineTo(144, 160); px.lineTo(160, 170); px.lineTo(178, 156); px.lineTo(168, 188); px.lineTo(128, 198); px.lineTo(88, 188); px.closePath(); px.fill();
    var pumpM = new THREE.MeshLambertMaterial({ map: mkTex(pc), emissive: 0x6a2a00 });
    [[-6.6, -HZ + 1.2], [6.6, -HZ + 1.2], [-5.6, -HZ + 1.9]].forEach(function (p, k) {
      var pu = new THREE.Group(); pu.position.set(p[0], 0.3, p[1]); pu.rotation.y = k === 1 ? -0.5 : k === 0 ? 0.5 : 0.7; g.add(pu);
      var b = sph(pu, 0.38, pumpM, 0, 0.32, 0); b.scale.set(1.15, 0.9, 1.0); cyl(pu, 0.04, 0.07, 0.16, lam(0x3a5a1a), 0, 0.68, 0, 8);
      var gl = new THREE.Sprite(glowM); gl.scale.set(1.5, 1.5, 1); gl.position.set(0, 0.34, 0.1); pu.add(gl); lampGlow.push(gl);
    });

    /* --- lumières : salle allumée avant la séance, baissées pendant --- */
    var amb = new THREE.AmbientLight(0xffe6d0, 0.95); g.add(amb);
    var key = new THREE.DirectionalLight(0xfff0e0, 0.3); key.position.set(0, 7, 6); g.add(key);
    var lights = [];
    if (!low) [[-4, 5.8, -2], [4, 5.8, -2], [0, 5.8, 5]].forEach(function (p) { var pl = new THREE.PointLight(0xffd9a8, 0.55, 14); pl.position.set(p[0], p[1], p[2]); g.add(pl); lights.push(pl); });
    var wash = new THREE.PointLight(0xaec8ff, 0, 18); wash.position.set(0, SCR_Y + SCR_H / 2, -HZ + 3.2); g.add(wash);    // reflet bleuté de l'écran sur les premières rangées
    var dim = 1;                                       // 1 = salle allumée, 0,22 = séance en cours

    /* ===================== LE FILM ===================== */
    var video = document.createElement('video');
    video.src = VIDEO_SRC; video.preload = 'metadata'; video.playsInline = true; video.setAttribute('playsinline', ''); video.loop = false;
    var vtex = new THREE.VideoTexture(video); vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    var film = room.film = { state: 'idle' };           // idle | playing | paused | ended
    function showVideo(on) { screenM.map = on ? vtex : posterTex; screenM.needsUpdate = true; }
    video.addEventListener('playing', function () { var reprise = film.state === 'paused'; film.state = 'playing'; showVideo(true); if (!reprise) setHud(true); refreshHud(); });   // le film démarre : l'interface se cache
    video.addEventListener('pause', function () { if (film.state === 'playing' && !video.ended) { film.state = 'paused'; refreshHud(); } });
    video.addEventListener('ended', function () { film.state = 'ended'; showVideo(false); paintPoster('REVOIR LA SÉANCE'); setHud(false); refreshHud(); });
    video.addEventListener('error', function () { film.state = 'idle'; world.flash('🎬 Le film n\'a pas pu se charger.', 'Réessaie dans un instant.'); refreshHud(); });
    function playFilm() {
      if (film.state === 'ended') video.currentTime = 0;
      var p = video.play();
      if (p && p.catch) p.catch(function () { world.flash('🎬 Clique sur « Lancer la séance » pour démarrer le film.'); });
    }
    function togglePlay() {
      if (film.state === 'playing') video.pause(); else playFilm();
    }
    function stopFilm() { video.pause(); film.state = 'idle'; showVideo(false); paintPoster('LANCER LA SÉANCE'); setHud(false); refreshHud(); }
    room.togglePlay = togglePlay;

    /* ===================== MASQUER / MONTRER L'INTERFACE ===================== */
    var hudHidden = false, eyeEl = null;
    function setHud(hide) {
      hudHidden = !!hide;
      if (world.hud) world.hud.classList.toggle('cin-nohud', hudHidden);
      if (standEl) standEl.classList.toggle('hid', hudHidden);
      if (eyeEl) eyeEl.innerHTML = hudHidden ? "<i class='fa-solid fa-eye'></i> Afficher l'interface" : "<i class='fa-solid fa-eye-slash'></i> Masquer l'interface";
    }
    function mountEye() {
      if (eyeEl) return;
      eyeEl = document.createElement('button'); eyeEl.className = 'cin-eye';
      eyeEl.addEventListener('click', function () { setHud(!hudHidden); });
      world.container.appendChild(eyeEl); setHud(hudHidden);
    }
    function unmountEye() { if (eyeEl && eyeEl.parentNode) eyeEl.parentNode.removeChild(eyeEl); eyeEl = null; if (world.hud) world.hud.classList.remove('cin-nohud'); hudHidden = false; }

    /* ===================== S'ASSEOIR ===================== */
    var music = createMusic(), cur = null, view = { yaw: 0, pitch: 0 }, standEl = null;
    function taken(s) {
      var now = performance.now();
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; });
    }
    function onSeatKey(e) {
      if (!cur) return;
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyS') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
      else if (e.code === 'KeyP') { e.stopImmediatePropagation(); e.preventDefault(); togglePlay(); }
    }
    function sit(w, s) {
      if (cur || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (taken(s)) { w.flash('Ce fauteuil est occupé.'); return; }
      w.sitDown(room); cur = seat_.cur = s; view.yaw = view.pitch = 0;
      standEl = document.createElement('div'); standEl.className = 'cin-stand';
      standEl.innerHTML = '<button data-a="stand">🪑 Se lever <kbd>Échap</kbd></button><button data-a="play">⏯ Lecture / pause <kbd>P</kbd></button>';
      standEl.addEventListener('click', function (e) { var a = e.target && e.target.closest ? e.target.closest('button') : null; if (!a) return; if (a.getAttribute('data-a') === 'stand') stand(); else togglePlay(); });
      w.container.appendChild(standEl); standEl.classList.toggle('hid', hudHidden);
      window.addEventListener('keydown', onSeatKey, true);
      if (film.state === 'idle') w.flash('🎬 Bonne séance !', 'Clique sur l\'écran ou appuie sur P pour lancer le film.');
    }
    function stand() {
      if (!cur) return;
      var s = cur; cur = seat_.cur = null;
      window.removeEventListener('keydown', onSeatKey, true);
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl);
      standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = stand;
    room.seatPos = function () { return cur ? { seat: cur.n, x: cur.x, z: cur.z, yaw: cur.yaw } : null; };
    room.sitSpec = { y: 0.07, z: 0.28 };   // fauteuil à 0,57 m (persona3d.js)
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z + 0.04, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!cur) return;
      view.yaw = clamp(drag.seat.yaw - dx * 0.006, -1.5, 1.5);
      if (drag.mouse) view.pitch = clamp(drag.seat.pitch - dy * 0.004, -0.5, 0.5);
    };
    room.seatClick = function (ray) { if (ray.intersectObject(screen, false)[0]) togglePlay(); };
    // caméra : à hauteur des yeux d'une personne assise, tournée vers le milieu de l'écran ; on regarde autour à la souris
    room.seatPose = function (dt, ctx) {
      if (!cur) return null;
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.3; }
      var ex = cur.x, ey = 1.34, ez = cur.z - 0.04, ty0 = SCR_Y + SCR_H * 0.38, tz0 = -HZ + 0.16;
      var a = Math.atan2(0 - ex, -(tz0 - ez)) + view.yaw, p = Math.atan2(ty0 - ey, Math.hypot(ex, tz0 - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 66 };
    };

    /* ===================== INTERFACE ===================== */
    room.hudBottom =
      '<div class="cin"><div class="cin-t"><img class="cin-logo" src="assets/cinema/tropistream-serveur.png" alt="">Cinéma Tropi Stream</div><div class="cin-st" data-s3d="cinst"></div>' +
      '<div class="cin-bar"><i data-s3d="cinbar"></i></div>' +
      '<div class="cin-row"><button class="cin-play" data-s3d="cinplay"><i class="fa-solid fa-play"></i> Lancer la séance</button><button class="cin-mus" data-s3d="cinmus"></button></div>' +
      '<div class="cin-tip">Avance vers un fauteuil et appuie sur <b>F</b> (ou clique dessus) pour t\'asseoir · clic sur l\'écran ou <b>P</b> : lecture / pause</div></div>';
    room.bindHud = function (hud) {
      room.elSt = hud.querySelector('[data-s3d="cinst"]'); room.elBar = hud.querySelector('[data-s3d="cinbar"]');
      room.elPlay = hud.querySelector('[data-s3d="cinplay"]'); room.elMus = hud.querySelector('[data-s3d="cinmus"]');
      room.elPlay.addEventListener('click', function () { togglePlay(); });
      room.elMus.addEventListener('click', function () { music.toggle(); refreshHud(); });
      refreshHud();
    };
    function setBtn(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }
    function refreshHud() {
      if (!room.elPlay) return;
      var s = film.state, dur = video.duration || 0;
      // le HUD est rafraîchi 4 fois par seconde : on ne touche au bouton que si son contenu change (sinon le logo clignote)
      setBtn(room.elPlay, s === 'playing' ? '<i class="fa-solid fa-pause"></i> Pause' : s === 'paused' ? '<i class="fa-solid fa-play"></i> Reprendre' : s === 'ended' ? '<i class="fa-solid fa-rotate-right"></i> Revoir la séance' : '<i class="fa-solid fa-play"></i> Lancer la séance');
      room.elSt.textContent = s === 'playing' ? 'En salle · ' + fmtT(video.currentTime) + ' / ' + fmtT(dur) : s === 'paused' ? 'En pause · ' + fmtT(video.currentTime) + ' / ' + fmtT(dur) : s === 'ended' ? 'Séance terminée' : 'Présentation Premium · ' + (dur ? fmtT(dur) : '0:58');
      room.elBar.style.width = (dur ? clamp(video.currentTime / dur, 0, 1) * 100 : 0) + '%';
      setBtn(room.elMus, music.on ? '<i class="fa-solid fa-volume-high"></i> Musique' : '<i class="fa-solid fa-volume-xmark"></i> Musique');
      room.elMus.classList.toggle('off', !music.on);
    }

    room.hint = function (w) {
      return 'ZQSD / flèches : marcher · Maj : courir · avance vers un fauteuil et appuie sur F pour t\'asseoir · clic sur l\'écran ou P : lancer le film' + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return { x: 0, z: HZ - 2.6, yaw: 0 }; };
    function kickMusic() { if (music.up && !music.ctx) music.start(); }
    room.onEnter = function () {
      music.start(); mountEye();
      window.addEventListener('pointerdown', kickMusic, true); window.addEventListener('keydown', kickMusic, true);   // le navigateur peut exiger un geste avant le son
      refreshHud();
    };
    function leave() {
      stand(); if (film.state !== 'idle') stopFilm();
      music.stop(); unmountEye();
      window.removeEventListener('pointerdown', kickMusic, true); window.removeEventListener('keydown', kickMusic, true);
    }
    room.onLeave = leave;
    room.onPause = function () { if (film.state === 'playing') video.pause(); music.stop(); unmountEye(); };
    room.onPageHide = function () { if (film.state === 'playing') video.pause(); };
    room.onResume = function () { if (world.room === room) { music.start(); mountEye(); } };

    var hudT = 0, clock = 0;
    room.update = function (dt, w) {
      clock += dt;
      var playing = film.state === 'playing';
      // lumières : on baisse pendant le film, on rallume sinon
      dim += ((playing ? 0.02 : 1) - dim) * Math.min(1, dt * 1.2);     // noir complet pendant le film
      var target = playing ? 1 : 0; openK += Math.max(-dt / 3, Math.min(dt / 4.5, target - openK)); layoutScreen();   // les rideaux s'ouvrent petit à petit (4,5 s), se referment plus vite
      glowM.opacity = 0.1 + 0.9 * dim; shadeM.color.setRGB(dim * 0.9 + 0.1, (dim * 0.9 + 0.1) * 0.85, (dim * 0.9 + 0.1) * 0.63);
      amb.intensity = 0.95 * dim; key.intensity = 0.3 * dim;
      lights.forEach(function (l) { l.intensity = 0.55 * dim; });
      wash.intensity = playing ? 0.5 : 0;
      beamMesh.material.opacity += ((playing ? 0.03 : 0) - beamMesh.material.opacity) * Math.min(1, dt * 2);
      lampGlow.forEach(function (s, i) { s.scale.setScalar(1.8 + Math.sin(clock * 3 + i) * 0.06); });
      // musique : elle se tait pendant le film (qui a son propre son)
      music.setLevel(playing ? 0 : 1);
      // son du film : plus fort près de l'écran
      if (playing || film.state === 'paused') video.volume = clamp(1.15 - Math.hypot(w.player.x, w.player.z + HZ) / 26, 0.4, 1);
      hudT += dt; if (hudT > 0.25) { hudT = 0; refreshHud(); }
    };
    room.dispose = function () { leave(); video.removeAttribute('src'); video.load(); vtex.dispose(); posterTex.dispose(); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('cin-css')) return;
    var st = document.createElement('style'); st.id = 'cin-css';
    st.textContent =
      '.cin{position:absolute;right:14px;bottom:62px;width:280px;background:rgba(8,5,12,.86);border:1px solid rgba(255,122,26,.6);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:7px;pointer-events:auto;color:#f4e3b0}' +
      '.cin-title-logo{display:inline-block;width:.95em;height:.95em;margin-right:.3em;vertical-align:-.12em;border-radius:50%;object-fit:cover;border:.05em solid rgba(255,122,26,.8)}' +
      '.cin-t{display:flex;align-items:center;gap:8px;font-weight:900;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#ffb066}.cin-logo{width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid rgba(255,122,26,.7)}' +
      '.cin-st{font-size:12px;font-weight:800;color:#e9ddb4}' +
      '.cin-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}.cin-bar i{display:block;height:100%;width:0;background:#ff7a1a}' +
      '.cin-row{display:flex;gap:6px}.cin-row button{cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;border-radius:9px;padding:8px 10px}' +
      '.cin-play{flex:1;border:1px solid #ff7a1a;background:#c2410c;color:#fff}.cin-mus{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#f4e3b0}.cin-mus.off{opacity:.6}' +
      '.cin-tip{font-size:11px;line-height:1.35;color:#d9c88f}.cin-tip b{color:#ffb066}' +
      '.s3d-hud.cin-nohud>*:not(.s3d-fade){display:none!important}.cin-stand.hid{display:none}' +
      '.cin-eye{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:7;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;color:#fff;background:rgba(8,5,12,.7);border:1px solid rgba(255,122,26,.6);border-radius:999px;padding:7px 14px;opacity:.55;transition:opacity .2s}.cin-eye:hover{opacity:1}' +
      '.cin-stand{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;display:flex;gap:8px}' +
      '.cin-stand button{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1.5px solid #ff7a1a;border-radius:12px;font-family:inherit;font-weight:800;font-size:13px;padding:10px 16px}.cin-stand kbd{opacity:.6;font-size:11px;margin-left:6px}';
    document.head.appendChild(st);
  }

  F.registerRoom('cinema', createCinemaRoom);
})();
