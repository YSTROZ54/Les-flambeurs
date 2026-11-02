/* =====================================================================
   cinema3d.js — Le cinéma de Tropi Stream, dans le casino 3D des Flambeurs (PC seulement)
   ---------------------------------------------------------------------
   On y entre par la grande porte « Cinéma » du hall (hall3d.js) et on en ressort vers le hall.
   Décor : grand écran entouré de rideaux de velours rouge, scène avec rampe de lumières, cinq rangées de fauteuils
   (deux blocs de quatre, allée au milieu), appliques, cabine de projection, comptoir à pop-corn, citrouilles d'Halloween.
   - On s'assoit sur n'importe quel fauteuil libre (F ou clic) : la caméra passe à hauteur d'yeux, face à l'écran, et on
     garde le HUD du joueur (téléphone, emotes). Les autres joueurs nous voient assis (canal temps réel du monde).
   - Le film est partagé par le serveur (api/cinema.js) : seuls le Patron et le Co Fondateur choisissent le lien et lancent/
     coupent la séance, depuis la console « RÉGIE » au fond à droite de la salle (ou en cliquant sur l'écran / touche P une
     fois assis). Tout le monde voit exactement la même chose, à la même position. Pendant la séance les lumières baissent
     et la musique se tait.
   - La musique de fond : les morceaux de assets/musique/cinema/ (playlist.json) ; sans fichier, un petit air de jazz lent fabriqué à la volée (WebAudio).
     Elle démarre à l'arrivée, suit le volume « Musique d'ambiance » des Réglages (plus de bouton dédié) et quitte la salle avec nous.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), video/tropistream-presentation.mp4.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 8, HZ = 11, H = 9;                       // demi-largeur, demi-profondeur, hauteur (mètres)
  var POSTER_SRC = 'assets/bannieres/tropistream.jpg';  // 16/9 : sert d'affiche sur l'écran avant la séance
  var SCR_W = 10, SCR_H = SCR_W * 9 / 16, SCR_Y = 2.0;   // l'écran : largeur, hauteur, bas de l'écran
  var ROWS = [-4.6, -2.7, -0.8, 1.1, 3.0];           // z de chaque rangée
  var COLS = [-5.2, -4.1, -3.0, -1.9, 1.9, 3.0, 4.1, 5.2];
  var VELVET = 0x8c1a26;

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
    var m = { ctx: null, master: null, dry: null, wet: null, noise: null, timer: 0, nextT: 0, step: 0, level: 1, up: false, lastTarget: -1, files: null, el: null, lastFile: '' };

    // vrais morceaux : assets/musique/cinema/ (playlist.json) ; sans fichier, l'air de jazz synthétisé ci-dessous
    if (F.audio && F.audio.withPlaylist) F.audio.withPlaylist(function (pl) {
      m.files = pl.cinema && pl.cinema.length ? pl.cinema : null;
      if (m.files && m.ctx && !m.el) { clearInterval(m.timer); m.timer = 0; playFile(); }
    });
    function playFile() {
      var c = m.ctx, list = m.files, pick = list[0];
      if (list.length > 1) { do { pick = list[(Math.random() * list.length) | 0]; } while (pick === m.lastFile); }
      m.lastFile = pick;
      var el = new Audio(), g;
      el.src = 'assets/musique/' + pick;
      try { var src = c.createMediaElementSource(el); g = c.createGain(); g.gain.value = 0.4; src.connect(g); g.connect(m.master); }   // les vrais morceaux sont mixés bien plus fort que l'air synthétisé
      catch (e) { return; }
      m.el = el;
      el.addEventListener('ended', function () { if (m.el === el && m.ctx === c) playFile(); });
      var pr = el.play(); if (pr && pr.catch) pr.catch(function () { /* lecture refusée : silence */ });
    }
    function dropFile(el) { if (!el) return; try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* ok */ } }

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
    // suit le volume « Musique d'ambiance » des Réglages (F.audio.musicVol), même dosage que les autres salles (audio3d.js)
    m.setLevel = function (v) {
      m.level = v;
      var vol = F.audio ? F.audio.musicVol : 0.5, mast = typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5;
      var target = m.up ? v * vol * mast * 1.4 : 0;
      if (m.master && m.ctx && Math.abs(target - m.lastTarget) > 0.002) { m.lastTarget = target; m.master.gain.setTargetAtTime(target, m.ctx.currentTime, 0.7); }
    };
    function closeCtx() {                              // fondu rapide, puis on libère le son
      clearInterval(m.timer); m.timer = 0;
      var c = m.ctx; if (!c) return;
      m.ctx = null; m.lastTarget = -1;
      try { m.master.gain.setTargetAtTime(0, c.currentTime, 0.15); } catch (e) { /* déjà fermé */ }
      var el = m.el; m.el = null;
      setTimeout(function () { dropFile(el); try { c.close(); } catch (e) { /* déjà fermé */ } }, 900);
    }
    m.start = function () {
      m.up = true;
      if (!m.ctx && !build()) return false;
      if (m.ctx.state === 'suspended') m.ctx.resume();
      if (m.files) { if (!m.el) playFile(); }
      else if (!m.timer) { m.nextT = m.ctx.currentTime + 0.15; m.step = 0; m.timer = setInterval(tick, 120); }
      m.setLevel(m.level);
      return true;
    };
    m.stop = function () { m.up = false; closeCtx(); };
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
    wall(HX * 2, H, 0, H / 2, -HZ, 0); (function () {          // mur du fond : une fenêtre de 2 m x 0,8 m est percée pour la cabine de projection (x = 4, y = 6)
      var bw = new THREE.Shape(), hole = new THREE.Path();
      bw.moveTo(-HX, 0); bw.lineTo(HX, 0); bw.lineTo(HX, H); bw.lineTo(-HX, H); bw.closePath();
      hole.moveTo(-5.0, 5.6); hole.lineTo(-3.0, 5.6); hole.lineTo(-3.0, 6.4); hole.lineTo(-5.0, 6.4); hole.closePath(); bw.holes.push(hole);
      var bm = new THREE.Mesh(new THREE.ShapeGeometry(bw), wallM); bm.rotation.y = Math.PI; bm.position.set(0, 0, HZ); g.add(bm);
    })(); wall(HZ * 2, H, -HX, H / 2, 0, Math.PI / 2); wall(HZ * 2, H, HX, H / 2, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0x140a0e })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    for (i = -HZ + 1.4; i < HZ - 1; i += 1.3) {            // lattes verticales sur les deux murs de côté
      box(g, 0.14, 4.8, 0.7, panelM, -HX + 0.07, 3.0, i); box(g, 0.14, 4.8, 0.7, panelM, HX - 0.07, 3.0, i);
    }
    [-HX + 0.06, HX - 0.06].forEach(function (x) { box(g, 0.1, 0.1, HZ * 2, trimM, x, 0.62, 0); box(g, 0.1, 0.1, HZ * 2, trimM, x, 5.6, 0); });   // filets dorés bas et haut
    [-HX + 0.02, HX - 0.02].forEach(function (x) { box(g, 0.04, 0.6, HZ * 2, std(0x14070b, 0.9, 0), x, 0.3, 0); });                                   // soubassement

    /* --- scène, rampe de lumières, écran --- */
    var stageD = 2.4;
    box(g, HX * 2, 0.3, stageD, std(0x2a1810, 0.7, 0.1), 0, 0.15, -HZ + stageD / 2);
    box(g, HX * 2, 0.1, 0.06, trimM, 0, 0.15, -HZ + stageD + 0.03);                // liteau doré sur la face de la scène
    for (i = -7.5; i <= 7.5; i += 0.5) sph(g, 0.045, bas(0xfff0c0), i, 0.15, -HZ + stageD + 0.08);      // petites ampoules posées sur le liteau, bien visibles
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
    var posterLabel = 'LANCER LA SÉANCE';
    paintPoster(posterLabel);
    var img = new Image();
    img.onload = function () { posterImg = img; paintPoster(posterLabel); };
    img.src = POSTER_SRC;
    var screenM = new THREE.MeshBasicMaterial({ map: posterTex });
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenM); screen.position.set(0, SCR_Y + SCR_H / 2, -HZ + 0.16); g.add(screen);
    room.interactables.push({ hit: screen, x: 0, z: -HZ, use: function () { togglePlay(); } });   // clic sur l'écran : lecture / pause (Patron / Co Fondateur)

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
    function sconce(x, z, ry) {                         // ry : le mur regarde vers (sin ry, cos ry) ; posée sur la face du panneau de bois, pas dedans
      var s = new THREE.Group(); s.position.set(x, 3.0, z); s.rotation.y = ry; g.add(s);
      box(s, 0.16, 0.46, 0.03, trimM, 0, 0, 0.015);                              // platine dorée plaquée sur le panneau
      cyl(s, 0.022, 0.022, 0.17, trimM, 0, -0.02, 0.1, 8).rotation.x = Math.PI / 2;   // bras
      var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.3, 16, 1, true), shadeM); sh.position.set(0, -0.02, 0.2); s.add(sh);
      sph(s, 0.05, bas(0xfff0c0), 0, -0.02, 0.2);
      var gl = new THREE.Sprite(glowM); gl.scale.set(1.6, 1.6, 1); gl.position.set(0, -0.02, 0.27); s.add(gl); lampGlow.push(gl);
    }
    [-7, -3.1, 0.8, 4.7, 8.6].forEach(function (z) { sconce(-(HX - 0.145), z, Math.PI / 2); sconce(HX - 0.145, z, -Math.PI / 2); });   // une par latte de bois
    // cabine de projection : une vraie fenêtre dans le mur du fond, et le projecteur dans la cabine, derrière la vitre
    var BX = 4.0, BY = 6.0;
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), new THREE.MeshBasicMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); glass.position.set(BX, BY, HZ - 0.01); g.add(glass);
    box(g, 2.2, 0.1, 0.12, trimM, BX, BY + 0.45, HZ - 0.05); box(g, 2.2, 0.1, 0.12, trimM, BX, BY - 0.45, HZ - 0.05); box(g, 0.1, 1.0, 0.12, trimM, BX - 1.05, BY, HZ - 0.05); box(g, 0.1, 1.0, 0.12, trimM, BX + 1.05, BY, HZ - 0.05);
    var shell = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.5), new THREE.MeshBasicMaterial({ color: 0x241c2c, side: THREE.BackSide })); shell.position.set(BX, BY, HZ + 0.75); g.add(shell);
    var proj = new THREE.Group(); proj.position.set(BX, BY - 0.1, HZ + 0.55); g.add(proj);
    box(proj, 1.6, 0.06, 1.0, std(0x1c1c22, 0.6, 0.3), 0, -0.3, 0);                                   // tablette
    box(proj, 0.5, 0.18, 0.4, std(0x4a4a54, 0.5, 0.5), 0, -0.18, 0);                                  // pied
    box(proj, 0.7, 0.36, 0.62, std(0x6a6a76, 0.4, 0.5), 0, 0.08, 0);                                  // corps
    cyl(proj, 0.1, 0.13, 0.22, std(0x24242a, 0.4, 0.7), 0, 0.08, -0.4, 16).rotation.x = Math.PI / 2;   // objectif
    cyl(proj, 0.085, 0.085, 0.02, new THREE.MeshBasicMaterial({ color: 0xdfeaff }), 0, 0.08, -0.51, 16).rotation.x = Math.PI / 2;   // lentille
    [[-0.12, 0.2], [0.14, 0.2]].forEach(function (rl) { cyl(proj, 0.15, 0.15, 0.05, std(0x8a8a96, 0.4, 0.6), 0, 0.4, rl[0], 18).rotation.z = Math.PI / 2; });   // deux bobines de film
    if (!low) { var bl = new THREE.PointLight(0xdfeaff, 0.8, 4); bl.position.set(BX, BY + 0.3, HZ + 0.2); g.add(bl); }       // un peu de lumière dans la cabine pour voir le projecteur
    // faisceau du projecteur : une pyramide à peine visible, de la lentille jusqu'à l'écran, allumée pendant la séance
    var pTop = new THREE.Vector3(BX, BY - 0.02, HZ + 0.1), pBot = new THREE.Vector3(0, SCR_Y + SCR_H / 2, -HZ + 0.2);
    var beamLen = pTop.distanceTo(pBot);
    var beamGrp = new THREE.Group(), beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, SCR_W / 2 * Math.SQRT2, beamLen, 4, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beamMesh.rotation.y = Math.PI / 4; beamGrp.add(beamMesh); beamGrp.scale.set(1, 1, 0.5625);
    beamGrp.position.copy(pTop).add(pBot).multiplyScalar(0.5);
    var bDir = pTop.clone().sub(pBot).normalize(), bX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), bDir).normalize(), bZ = new THREE.Vector3().crossVectors(bX, bDir).normalize();
    beamGrp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bX, bDir, bZ));     // largeur du faisceau à l'horizontale, hauteur à la verticale
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
    // --- régie : la console du Patron / Co Fondateur, au fond à droite (symétrique du comptoir à pop-corn) ---
    var RX = 5.2, RZ = HZ - 1.1;
    var regie = new THREE.Group(); regie.position.set(RX, 0, RZ); regie.rotation.y = Math.atan2(-(5 - RZ), -RX); g.add(regie);
    box(regie, 1.1, 0.95, 0.65, lam(0x1b1016), 0, 0.475, 0);                             // socle sombre
    box(regie, 1.16, 0.05, 0.7, trimM, 0, 0.975, 0);                                     // plateau doré
    var regieScreen = box(regie, 0.62, 0.4, 0.04, std(0x0a0e18, 0.35, 0.1, 0x122240), 0, 1.33, -0.1); regieScreen.rotation.x = -0.35;  // petit écran incliné
    box(regie, 0.7, 0.07, 0.18, trimM, 0, 1.0, 0.22);                                     // rebord clavier
    for (i = 0; i < 3; i++) sph(regie, 0.028, bas(i === 1 ? 0xff5050 : 0xffd24a), -0.18 + i * 0.18, 1.04, 0.24);   // petits voyants
    var rgC = mkCanvas(512, 128), rgx = rgC.getContext('2d');
    rgx.fillStyle = '#120a16'; rgx.fillRect(0, 0, 512, 128); rgx.strokeStyle = '#c9a227'; rgx.lineWidth = 6; rgx.strokeRect(5, 5, 502, 118);
    rgx.textAlign = 'center'; rgx.textBaseline = 'middle'; rgx.fillStyle = '#e9c66b'; rgx.font = '800 50px ' + SERIF; rgx.fillText('RÉGIE', 256, 46, 470);
    rgx.fillStyle = '#9d8a53'; rgx.font = '700 24px ' + MONO; rgx.fillText('Patron · Co Fondateur', 256, 92, 470);
    var regieSign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(rgC) })); regieSign.position.set(0, 2.0, 0); regie.add(regieSign);
    var regieGlow = new THREE.Sprite(glowM); regieGlow.scale.set(1.1, 1.1, 1); regieGlow.position.set(0, 1.33, 0.05); regie.add(regieGlow); lampGlow.push(regieGlow);
    var regieHit = box(regie, 1.3, 1.7, 1.2, hitM, 0, 0.85, 0.15);
    room.interactables.push({
      hit: regieHit, x: RX, z: RZ, radius: 1.15,
      enabled: function () { return isCinemaCtrl(); },
      prompt: function () { return '🎛️ Régie — choisir le film  [F]'; },
      use: function (w) { if (!isCinemaCtrl()) return; toggleConsole(); }
    });
    room.colliders.push({ x: RX, z: RZ, r: 0.85 });
    // pancarte « SORTIE » verte au-dessus de la porte
    var exC = mkCanvas(256, 80), ex = exC.getContext('2d'); ex.fillStyle = '#063a1a'; ex.fillRect(0, 0, 256, 80); ex.strokeStyle = '#3ddc7a'; ex.lineWidth = 5; ex.strokeRect(4, 4, 248, 72);
    ex.fillStyle = '#7dffae'; ex.font = '900 44px ' + MONO; ex.textAlign = 'center'; ex.textBaseline = 'middle'; ex.fillText('SORTIE', 128, 42, 230);
    var exit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(exC) })); exit.position.set(0, 4.55, HZ - 0.06); exit.rotation.y = Math.PI; g.add(exit);
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.4, h: 3.2, label: '🚪 SORTIE', sub: 'RETOUR AU HALL', color: 0xff7a1a, target: 'hall', theme: 'exitCinema' });

    /* --- citrouilles d'Halloween de chaque côté de la scène --- */
    var pc = mkCanvas(256, 256), px = pc.getContext('2d');
    px.fillStyle = '#e8741a'; px.fillRect(0, 0, 256, 256);
    px.strokeStyle = '#b0520e'; px.lineWidth = 5; for (i = 0; i < 8; i++) { px.beginPath(); px.moveTo(i * 32 + 16, 0); px.lineTo(i * 32 + 16, 256); px.stroke(); }
    px.fillStyle = '#ffd24a';
    [[88, 96], [168, 96]].forEach(function (e) { px.beginPath(); px.moveTo(e[0] - 20, e[1] + 18); px.lineTo(e[0], e[1] - 18); px.lineTo(e[0] + 20, e[1] + 18); px.closePath(); px.fill(); });
    px.beginPath(); px.moveTo(78, 156); px.lineTo(96, 170); px.lineTo(112, 160); px.lineTo(128, 174); px.lineTo(144, 160); px.lineTo(160, 170); px.lineTo(178, 156); px.lineTo(168, 188); px.lineTo(128, 198); px.lineTo(88, 188); px.closePath(); px.fill();
    var pumpM = new THREE.MeshLambertMaterial({ map: mkTex(pc), emissive: 0x6a2a00 });
    [[-6.6, -HZ + 1.2], [6.6, -HZ + 1.2], [-5.6, -HZ + 1.9]].forEach(function (p, k) {
      var pu = new THREE.Group(); pu.position.set(p[0], 0.3, p[1]); pu.rotation.y = Math.atan2(-(5 - p[1]), -p[0]); g.add(pu);
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

    /* ===================== LE FILM : partagé par le serveur (api/cinema.js) ===================== */
    // Seuls le Patron et le Co Fondateur choisissent le lien et lancent/coupent la séance (console RÉGIE ou écran) ;
    // tout le monde reçoit le même état (lien, lecture/pause, position) environ une fois par seconde.
    function isCinemaCtrl() {
      var boss = false, co = false;
      try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); co = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) { /* ok */ }
      return boss || co;
    }
    var video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.preload = 'metadata'; video.playsInline = true; video.setAttribute('playsinline', ''); video.loop = false;
    var vtex = new THREE.VideoTexture(video); vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    var net = { url: '', status: 'idle', position: 0, recvAt: performance.now(), busy: false, lastSrc: '' };
    function showVideo(on) { screenM.map = on ? vtex : posterTex; screenM.needsUpdate = true; }
    function netPosNow() {
      var p = net.position;
      if (net.status === 'playing') p += (performance.now() - net.recvAt) / 1000;
      return p;
    }
    video.addEventListener('error', function () { if (net.url) world.flash('🎬 Ce lien n\'a pas pu être lu.', 'Vérifie l\'adresse depuis la régie.'); });
    video.addEventListener('ended', function () { if (isCinemaCtrl() && net.status === 'playing') cinemaAction('stop'); });   // le Patron/Co Fondateur coupe la séance pour tout le monde
    function applyNet(st) {
      if (!st) return;
      var wasPlaying = net.status === 'playing';
      net.url = st.url || ''; net.status = st.status || 'idle'; net.position = st.position || 0; net.recvAt = performance.now();
      if (net.url !== net.lastSrc) { net.lastSrc = net.url; video.src = net.url || ''; try { video.load(); } catch (e) { /* ok */ } }
      if (net.status === 'playing') {
        showVideo(true); if (!wasPlaying) setHud(true);
        if (Math.abs(video.currentTime - netPosNow()) > 0.6) video.currentTime = Math.max(0, netPosNow());
        var p = video.play(); if (p && p.catch) p.catch(function () { /* geste requis : la lecture reprendra au prochain geste de l'utilisateur */ });
      } else {
        if (!video.paused) video.pause();
        if (wasPlaying) setHud(false);
        if (net.status === 'paused') { showVideo(true); if (Math.abs(video.currentTime - net.position) > 0.4) video.currentTime = net.position; }
        else { showVideo(false); var lbl = net.url ? 'LANCER LA SÉANCE' : 'AUCUNE VIDÉO CHARGÉE'; if (lbl !== posterLabel) { posterLabel = lbl; paintPoster(lbl); } }
      }
      refreshConsole();
    }
    function pollCinema() {
      if (net.busy) return;
      net.busy = true;
      fetch('/api/cinema', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (st) { net.busy = false; applyNet(st); }).catch(function () { net.busy = false; });
    }
    function cinemaAction(action, extra) {
      if (!isCinemaCtrl()) return Promise.resolve(null);
      return world.post('/api/cinema', Object.assign({ action: action }, extra || {})).then(function (r) {
        if (r && r.ok && r.state) applyNet(r.state);
        else if (r && r.error) world.flash('⛔ ' + r.error);
        return r;
      });
    }
    function togglePlay() {
      if (!isCinemaCtrl()) { world.flash('🔒 Réservé au Patron et au Co Fondateur.'); return; }
      cinemaAction(net.status === 'playing' ? 'pause' : 'play');
    }
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

    /* ===================== CONSOLE RÉGIE (Patron / Co Fondateur) ===================== */
    var consoleEl = null;
    function mountConsole() {
      if (consoleEl || !isCinemaCtrl()) return;
      consoleEl = document.createElement('div'); consoleEl.className = 'cin-console hid';
      consoleEl.innerHTML =
        '<button class="cin-cn-x" data-a="close"><i class="fa-solid fa-xmark"></i></button>' +
        '<div class="cin-cn-t"><i class="fa-solid fa-sliders"></i> Régie du cinéma</div>' +
        '<input class="cin-cn-url" type="text" placeholder="Lien de la vidéo (URL .mp4…)" maxlength="500">' +
        '<div class="cin-cn-row"><button data-a="load"><i class="fa-solid fa-link"></i> Charger</button></div>' +
        '<div class="cin-cn-row"><button data-a="play"><i class="fa-solid fa-play"></i> Lancer</button><button data-a="pause"><i class="fa-solid fa-pause"></i> Pause</button><button data-a="stop"><i class="fa-solid fa-stop"></i> Couper</button></div>' +
        '<div class="cin-cn-st" data-a="status"></div>';
      consoleEl.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
        var a = b.getAttribute('data-a');
        if (a === 'close') { consoleEl.classList.add('hid'); return; }
        if (a === 'load') { var u = consoleEl.querySelector('.cin-cn-url').value.trim(); if (u) cinemaAction('set', { url: u }); return; }
        if (a === 'play' || a === 'pause' || a === 'stop') cinemaAction(a);
      });
      world.container.appendChild(consoleEl);
    }
    function unmountConsole() { if (consoleEl && consoleEl.parentNode) consoleEl.parentNode.removeChild(consoleEl); consoleEl = null; }
    function toggleConsole() {
      mountConsole(); if (!consoleEl) return;
      consoleEl.classList.toggle('hid');
      if (!consoleEl.classList.contains('hid')) { consoleEl.querySelector('.cin-cn-url').value = net.url || ''; refreshConsole(); }
    }
    function refreshConsole() {
      if (!consoleEl || consoleEl.classList.contains('hid')) return;
      var st = consoleEl.querySelector('[data-a="status"]');
      st.textContent = net.status === 'playing' ? '▶ En cours · ' + fmtT(netPosNow()) : net.status === 'paused' ? '⏸ En pause · ' + fmtT(net.position) : net.url ? 'Prêt · ' + net.url : 'Aucun lien chargé';
    }

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
      standEl.innerHTML = '<button data-a="stand">🪑 Se lever <kbd>Échap</kbd></button>' + (isCinemaCtrl() ? '<button data-a="play">⏯ Lecture / pause <kbd>P</kbd></button>' : '');
      standEl.addEventListener('click', function (e) { var a = e.target && e.target.closest ? e.target.closest('button') : null; if (!a) return; if (a.getAttribute('data-a') === 'stand') stand(); else togglePlay(); });
      w.container.appendChild(standEl); standEl.classList.toggle('hid', hudHidden);
      window.addEventListener('keydown', onSeatKey, true);
      if (net.status === 'idle' && isCinemaCtrl()) w.flash('🎬 Bonne séance !', 'Appuie sur P ou clique sur l\'écran pour lancer le film.');
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
    room.hint = function (w) {
      var ctrl = isCinemaCtrl();
      if (w.touch) return 'Joystick : marcher · touche un fauteuil pour s’asseoir' + (ctrl ? ' · touche la régie au fond à droite pour choisir le film' : '');
      return 'ZQSD / flèches : marcher · Maj : courir · avance vers un fauteuil et appuie sur F pour t\'asseoir' + (ctrl ? ' · F sur la régie (fond à droite) : choisir le film' : '') + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return { x: 0, z: HZ - 2.6, yaw: 0 }; };
    function kickMusic() { if (music.up && !music.ctx) music.start(); }
    room.onEnter = function () {
      music.start(); mountEye();
      window.addEventListener('pointerdown', kickMusic, true); window.addEventListener('keydown', kickMusic, true);   // le navigateur peut exiger un geste avant le son
      pollCinema();
    };
    function leave() {
      stand(); try { video.pause(); } catch (e) { /* ok */ }   // on ne coupe que chez soi : la séance continue pour les autres
      music.stop(); unmountEye(); unmountConsole();
      window.removeEventListener('pointerdown', kickMusic, true); window.removeEventListener('keydown', kickMusic, true);
    }
    room.onLeave = leave;
    room.onPause = function () { video.pause(); music.stop(); unmountEye(); };
    room.onPageHide = function () { video.pause(); };
    room.onResume = function () { if (world.room === room) { music.start(); mountEye(); pollCinema(); } };

    var clock = 0, netT = 0;
    room.update = function (dt, w) {
      clock += dt;
      netT += dt; if (netT > 1.0) { netT = 0; pollCinema(); } else if (consoleEl && !consoleEl.classList.contains('hid')) refreshConsole();
      var playing = net.status === 'playing';
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
      if (playing || net.status === 'paused') video.volume = clamp(1.15 - Math.hypot(w.player.x, w.player.z + HZ) / 26, 0.4, 1);
    };
    room.dispose = function () { leave(); video.removeAttribute('src'); video.load(); vtex.dispose(); posterTex.dispose(); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('cin-css')) return;
    var st = document.createElement('style'); st.id = 'cin-css';
    st.textContent =
      '.cin-title-logo{display:inline-block;width:.95em;height:.95em;margin-right:.3em;vertical-align:-.12em;border-radius:50%;object-fit:cover;border:.05em solid rgba(255,122,26,.8)}' +
      '.s3d-hud.cin-nohud>*:not(.s3d-fade){display:none!important}.cin-stand.hid{display:none}' +
      '.cin-eye{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:7;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;color:#fff;background:rgba(8,5,12,.7);border:1px solid rgba(255,122,26,.6);border-radius:999px;padding:7px 14px;opacity:.55;transition:opacity .2s}.cin-eye:hover{opacity:1}' +
      '.cin-stand{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;display:flex;gap:8px}' +
      '.cin-stand button{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1.5px solid #ff7a1a;border-radius:12px;font-family:inherit;font-weight:800;font-size:13px;padding:10px 16px}.cin-stand kbd{opacity:.6;font-size:11px;margin-left:6px}' +
      '.cin-console{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;width:320px;background:rgba(8,5,12,.94);border:1.5px solid rgba(201,162,39,.75);border-radius:16px;padding:18px 16px 16px;display:flex;flex-direction:column;gap:10px;color:#f4e3b0;pointer-events:auto}' +
      '.cin-console.hid{display:none}' +
      '.cin-cn-t{font-weight:900;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#e9c66b;display:flex;align-items:center;gap:8px}' +
      '.cin-cn-url{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:9px 10px;color:#fff3e0;font-family:inherit;font-size:12.5px}' +
      '.cin-cn-row{display:flex;gap:6px}.cin-cn-row button{flex:1;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;border-radius:9px;padding:9px 8px;border:1px solid rgba(255,122,26,.6);background:#2a1208;color:#fff}' +
      '.cin-cn-row button[data-a="load"]{background:#c2410c}' +
      '.cin-cn-st{font-size:11.5px;color:#d9c88f;word-break:break-all}' +
      '.cin-cn-x{position:absolute;top:8px;right:10px;background:none;border:none;color:#d9c88f;cursor:pointer;font-size:14px;padding:4px}';
    document.head.appendChild(st);
  }

  F.registerRoom('cinema', createCinemaRoom);
})();
