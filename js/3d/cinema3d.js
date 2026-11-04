/* =====================================================================
   cinema3d.js — Le cinéma de Tropi Stream, dans le casino 3D des Flambeurs (PC seulement)
   ---------------------------------------------------------------------
   On y entre par la grande porte « Cinéma » du hall (hall3d.js) et on en ressort vers le hall.
   Décor : grand écran entouré de rideaux de velours rouge, scène avec rampe de lumières, cinq rangées de fauteuils
   (deux blocs de quatre, allée au milieu), appliques, cabine de projection, comptoir à pop-corn.
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

  var POSTER_SRC = 'assets/bannieres/tropistream-2.jpg';  // 16/9 : sert d'affiche sur l'écran avant la séance
  var VELVET = 0x8c1a26;

  /* ---------- gradins : chaque rangée est un peu plus haute que la précédente (vrai sol praticable, voir world3d.js: room.groundY) ---------- */
  function smoothT(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  // la géométrie de chaque salle : le cinéma classique (petite salle rouge, écran plein mur) et le cinéma premium (grande salle, nombreuses rangées, écran centré entre deux rideaux)
  function makeGeo(P) {
    var G0 = P ? {
      HX: 12, HZ: 17, H: 13, SCR_W: 17, SCR_Y: 1.3, SCR_H: 17 * 9 / 16, ROW_H: 0.2, ROWS: [], COLS: [-7.3, -5.85, -4.4, -1.45, 0, 1.45, 4.4, 5.85, 7.3],
      blocks: [{ x0: -8.05, x1: -3.65 }, { x0: -2.2, x1: 2.2 }, { x0: 3.65, x1: 8.05 }], lanes: [], aisleLights: [-8.05, -3.65, -2.2, 2.2, 3.65, 8.05],
      nLow: 7, HB: 3.4, zb: 5.6, zs0: -6.2, railX: 8.85
    } : {
      HX: 10, HZ: 13, H: 11, SCR_W: 19.9, SCR_Y: 0.9, SCR_H: 11 - 0.9, ROW_H: 0.4, ROWS: [-4.6, -2.7, -0.8, 1.1, 3.0], COLS: [-5.2, -4.1, -3.0, -1.9, 1.9, 3.0, 4.1, 5.2],
      blocks: [{ x0: -5.7, x1: -1.4 }, { x0: 1.4, x1: 5.7 }], lanes: [[0, 2.8], [-7.5, 3.6], [7.5, 3.6]], aisleLights: [-6.0, -1.3, 1.3, 6.0]
    };
    var k;
    if (P) { for (k = 0; k < 7; k++) G0.ROWS.push(-6.2 + k * 1.75); for (k = 0; k < 3; k++) G0.ROWS.push(7.4 + k * 1.8); }      // 7 rangées en bas, 3 sur l'étage
    G0.ROW_GAP = G0.ROWS[1] - G0.ROWS[0];
    G0.BND = []; for (k = 0; k < G0.ROWS.length - 1; k++) G0.BND.push((G0.ROWS[k] + G0.ROWS[k + 1]) / 2);
    if (P) {                                                // étage : sol bas qui monte doucement, grand escalier le long de chaque mur, étage au fond
      G0.elev = function (ri) { return ri < G0.nLow ? ri * G0.ROW_H : G0.HB + (ri - G0.nLow) * G0.ROW_H; };
      G0.BACK_H = G0.elev(G0.ROWS.length - 1);
      var stepSum = function (z, w, a, b) { var h = 0; for (var i2 = a; i2 < b; i2++) { var bd = G0.BND[i2]; h += G0.ROW_H * smoothT((z - (bd - w / 2)) / w); } return h; };
      G0.inAisle = function (x) { for (var q = 0; q < G0.blocks.length; q++) if (x >= G0.blocks[q].x0 && x <= G0.blocks[q].x1) return false; return true; };
      G0.ground = function (x, z) {
        var w = G0.inAisle(x) ? G0.ROW_GAP : 0.35;
        if (Math.abs(x) > G0.railX) { if (z >= G0.zb) return G0.HB + stepSum(z, G0.ROW_GAP, G0.nLow, G0.BND.length); var t = (z - G0.zs0) / (G0.zb - G0.zs0); return G0.HB * (t < 0 ? 0 : t > 1 ? 1 : t); }
        if (z >= G0.zb) return G0.HB + stepSum(z, w, G0.nLow, G0.BND.length);
        return stepSum(z, w, 0, G0.nLow - 1);
      };
      return G0;
    }
    G0.BACK_H = (G0.ROWS.length - 1) * G0.ROW_H;
    G0.inAisle = function (x) { for (var q = 0; q < G0.blocks.length; q++) if (x >= G0.blocks[q].x0 && x <= G0.blocks[q].x1) return false; return true; };
    G0.ground = function (x, z) {                         // hauteur du sol à (x,z) : marche nette sous les fauteuils, rampe d'escalier dans les allées
      var width = G0.inAisle(x) ? G0.ROW_GAP : 0.35, h = 0;
      for (var i = 0; i < G0.BND.length; i++) { var b = G0.BND[i]; h += G0.ROW_H * smoothT((z - (b - width / 2)) / width); }
      return h;
    };
    return G0;
  }
  var GEO = { classic: makeGeo(false), premium: makeGeo(true) };

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
  // Fsvid / Uqload / Vidzy : la page du lecteur (embed) n'est pas un flux jouable directement,
  // il faut le lien direct .mp4/.m3u8 récupéré depuis cette page (onglet Réseau du navigateur).
  var EMBED_HOST_RE = /fsvid\.(io|lol)|fs\d+\.(io|lol)|uqload\.[a-z0-9.-]+|vidzy\.[a-z0-9.-]+/i;
  function looksLikeEmbedPage(u) { return EMBED_HOST_RE.test(u) && !/\.(mp4|m3u8)(\?|#|$)/i.test(u); }

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

  // plafond premium : anneaux concentriques de petites tuiles dorées (texture dessinée une fois)
  var ceilTex = null, pleat = null;
  function ringCeilingTex() {
    if (ceilTex) return ceilTex;
    var N = 1024, cv = mkCanvas(N, N), x = cv.getContext('2d'); x.fillStyle = '#8c5a18'; x.fillRect(0, 0, N, N);
    for (var r = 14; r < N * 0.72; r += 11) {
      var n = Math.max(8, Math.round(TAU * r / 11)), tw = TAU * r / n * 0.78;
      for (var k = 0; k < n; k++) {
        var a = k / n * TAU + (r % 22 ? 0.07 : 0); x.save(); x.translate(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r); x.rotate(a + Math.PI / 2);
        var lt = 0.5 + 0.35 * Math.sin(a * 3 + r * 0.05); x.fillStyle = 'rgb(' + Math.round(205 * lt + 30) + ',' + Math.round(150 * lt + 25) + ',' + Math.round(55 * lt + 10) + ')'; x.fillRect(-tw / 2, -3.6, tw, 7.2); x.restore();
      }
    }
    ceilTex = new THREE.CanvasTexture(cv); ceilTex.anisotropy = 8; return ceilTex;
  }
  // plafond étoilé : noir profond semé de petits points blancs (fibre optique)
  var starTex = null;
  function starCeilingTex() {
    if (starTex) return starTex;
    var N = 2048, cv = mkCanvas(N, N), x = cv.getContext('2d'), k; x.fillStyle = '#03030a'; x.fillRect(0, 0, N, N);
    for (k = 0; k < 2600; k++) { var r = 0.9 + Math.random() * Math.random() * 2.6, a = 0.45 + Math.random() * 0.55; x.fillStyle = 'rgba(255,255,255,' + a + ')'; x.beginPath(); x.arc(Math.random() * N, Math.random() * N, r, 0, TAU); x.fill(); }
    for (k = 0; k < 90; k++) { var px = Math.random() * N, py = Math.random() * N, gr = x.createRadialGradient(px, py, 0, px, py, 9); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(180,170,255,0)'); x.fillStyle = gr; x.fillRect(px - 9, py - 9, 18, 18); }
    starTex = new THREE.CanvasTexture(cv); starTex.anisotropy = 8; return starTex;
  }
  // panneau mural de lumière : fibres lumineuses qui ondulent sur fond noir
  var wavePan = {};
  function waveTex(hue) {
    if (wavePan[hue]) return wavePan[hue];
    var W = 256, Hh = 1024, cv = mkCanvas(W, Hh), x = cv.getContext('2d'), k, y; x.fillStyle = '#07060e'; x.fillRect(0, 0, W, Hh);
    var col = hue ? '255,170,235' : '200,180,255';
    for (k = 0; k < 7; k++) {
      var ph = k * 0.9, fq = 0.011 + k * 0.0016, am = 46 + (k % 3) * 14; x.strokeStyle = 'rgba(' + col + ',0.9)'; x.lineWidth = 2.4; x.shadowColor = 'rgba(' + col + ',1)'; x.shadowBlur = 14; x.beginPath();
      for (y = 0; y <= Hh; y += 8) { var px = W / 2 + Math.sin(y * fq + ph) * am * (0.55 + 0.45 * Math.sin(y * 0.004 + k)); if (y) x.lineTo(px, y); else x.moveTo(px, y); }
      x.stroke(); x.shadowBlur = 0;
      for (y = 0; y <= Hh; y += 40) { var qx = W / 2 + Math.sin(y * fq + ph) * am * (0.55 + 0.45 * Math.sin(y * 0.004 + k)); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(qx, y, 2.6, 0, TAU); x.fill(); }
    }
    x.strokeStyle = 'rgba(160,150,200,0.5)'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, Hh - 6);
    return (wavePan[hue] = new THREE.CanvasTexture(cv));
  }
  function pleatTex() {                                    // velours bleu plissé : bandes verticales claires et sombres
    if (pleat) return pleat;
    var cv = mkCanvas(256, 64), x = cv.getContext('2d'), k;
    for (k = 0; k < 16; k++) { var g2 = x.createLinearGradient(k * 16, 0, k * 16 + 16, 0); g2.addColorStop(0, '#071a58'); g2.addColorStop(0.5, '#1b44a8'); g2.addColorStop(1, '#061650'); x.fillStyle = g2; x.fillRect(k * 16, 0, 16, 64); }
    pleat = new THREE.CanvasTexture(cv); pleat.wrapS = pleat.wrapT = THREE.RepeatWrapping; return pleat;
  }

  /* ===================== LA SALLE ===================== */
  function createCinemaRoom(world, premium) {
    var P = !!premium, G0 = P ? GEO.premium : GEO.classic;
    var HX = G0.HX, HZ = G0.HZ, H = G0.H, SCR_W = G0.SCR_W, SCR_Y = G0.SCR_Y, SCR_H = G0.SCR_H, ROWS = G0.ROWS, COLS = G0.COLS, ROW_H = G0.ROW_H, ROW_GAP = G0.ROW_GAP, BACK_H = G0.BACK_H, cinemaGroundY = G0.ground;
    // salle « premium » : plafond doré en anneaux, murs de bois doré, fauteuils bleus, rideaux bleus (même séance partagée que le cinéma classique)
    var room = { title: '<img class="cin-title-logo" src="assets/cinema/tropistream-serveur.png" alt="">' + (P ? 'CINÉMA PREMIUM' : 'CINÉMA'), subtitle: P ? 'ÉCRAN GÉANT · FAUTEUILS CLUB' : 'TROPI STREAM · PRÉSENTATION', topic: P ? 'flambeurs-cinemapremium-room' : 'flambeurs-cinema-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, low = !!world.low;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 3.0, zMax: HZ - 0.7 };   // la scène (les 2,3 premiers mètres) reste hors d'atteinte
    room.groundY = cinemaGroundY;   // vrai sol en gradins : on marche réellement dessus (world3d.js lit cette fonction à chaque image)
    injectCss();

    /* --- sol : moquette rouge sombre à losanges --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = P ? '#3a0710' : '#3a0c16'; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = P ? '#4a0c18' : '#561624'; fx.lineWidth = 6;
    for (var i = -1; i < 5; i++) { fx.beginPath(); fx.moveTo(i * 64, 0); fx.lineTo(i * 64 + 256, 256); fx.moveTo(i * 64 + 256, 0); fx.lineTo(i * 64, 256); fx.stroke(); }
    fx.fillStyle = P ? '#5a1220' : '#6a1a2a'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { fx.beginPath(); fx.arc(i * 64 + 32, j * 64, 4, 0, TAU); fx.fill(); }
    var ftex = mkTex(fc); ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(HX * 2 / 2.5, HZ * 2 / 2.5);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ map: ftex })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs, plafond, panneaux acoustiques --- */
    var wallM = P ? std(0x0c0a14, 0.9, 0.05) : std(0x24090f, 0.9, 0.05), panelM = P ? std(0xc4852e, 0.55, 0.1, 0x241503) : std(0x3b0f1a, 0.85, 0.05), trimM = std(0xc9a227, 0.3, 0.6, 0x2a1d00);
    function wall(w, h, px, py, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, H, 0, H / 2, -HZ, 0); (function () {          // mur du fond : une fenêtre de 2 m x 0,8 m est percée pour la cabine de projection, centrée (x = 0, y = 7 + BACK_H : remontée avec le palier du fond)
      var bw = new THREE.Shape(), hole = new THREE.Path(), hy = 6.6 + BACK_H, hy2 = 7.4 + BACK_H;
      bw.moveTo(-HX, 0); bw.lineTo(HX, 0); bw.lineTo(HX, H); bw.lineTo(-HX, H); bw.closePath();
      hole.moveTo(-1.0, hy); hole.lineTo(1.0, hy); hole.lineTo(1.0, hy2); hole.lineTo(-1.0, hy2); hole.closePath(); bw.holes.push(hole);
      var bm = new THREE.Mesh(new THREE.ShapeGeometry(bw), wallM); bm.rotation.y = Math.PI; bm.position.set(0, 0, HZ); g.add(bm);
    })(); wall(HZ * 2, H, -HX, H / 2, 0, Math.PI / 2); wall(HZ * 2, H, HX, H / 2, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), P ? new THREE.MeshBasicMaterial({ map: starCeilingTex() }) : new THREE.MeshLambertMaterial({ color: 0x140a0e })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    if (P) {                                                // grands panneaux de fibres lumineuses sur les murs de côté, rubans violets en haut, points blancs au plafond
      [-14.2, -10, -5.8, -1.6, 2.6, 6.8, 11, 15.2].forEach(function (pz, pi) {
        [-1, 1].forEach(function (sd) {
          var gy = cinemaGroundY(sd * (HX - 0.2), pz), bot = gy + 1.1, top = H - 1.4, ph = top - bot, pm = new THREE.Mesh(new THREE.PlaneGeometry(1.35, ph), new THREE.MeshBasicMaterial({ map: waveTex((pi + (sd > 0 ? 1 : 0)) % 2), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
          pm.position.set(sd * (HX - 0.04), bot + ph / 2, pz); pm.rotation.y = -sd * Math.PI / 2; g.add(pm);
          [-1, 1].forEach(function (e) { box(g, 0.06, ph + 0.1, 0.06, trimM, sd * (HX - 0.05), bot + ph / 2, pz + e * 0.7); }); [bot, top].forEach(function (yy) { box(g, 0.06, 0.06, 1.46, trimM, sd * (HX - 0.05), yy, pz); });
        });
      });
      [-1, 1].forEach(function (sd) { box(g, 0.1, 0.1, HZ * 2 - 0.4, bas(0xb878ff), sd * (HX - 0.06), H - 0.45, 0); });
      box(g, HX * 2 - 0.4, 0.1, 0.1, bas(0xb878ff), 0, H - 0.45, -HZ + 0.06); box(g, HX * 2 - 0.4, 0.1, 0.1, bas(0xb878ff), 0, H - 0.45, HZ - 0.06);
      [[-7, -9], [0, -9], [7, -9], [-7, 0], [0, 0], [7, 0], [-4, 9], [4, 9], [0, 14]].forEach(function (p) { var sp = sph(g, 0.13, bas(0xffffff), p[0], H - 0.04, p[1]); sp.scale.y = 0.4; var halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.5, depthWrite: false })); halo.scale.set(1.2, 1.2, 1); halo.position.set(p[0], H - 0.2, p[1]); g.add(halo); });
    }
    if (false) {
      for (i = -HZ + 0.5; i < HZ - 0.3; i += 0.62) { box(g, 0.12, 9.6, 0.5, panelM, -HX + 0.06, 4.9 + cinemaGroundY(-HX + 0.06, i), i); box(g, 0.12, 9.6, 0.5, panelM, HX - 0.06, 4.9 + cinemaGroundY(HX - 0.06, i), i); }
    }
    for (i = -HZ + 1.4; i < (P ? -HZ : HZ - 1); i += 1.3) {            // lattes verticales sur les deux murs de côté, chacune suit le relief du sol (gradins) sous elle
      box(g, 0.14, 4.8, 0.7, panelM, -HX + 0.07, 3.0 + cinemaGroundY(-HX + 0.07, i), i); box(g, 0.14, 4.8, 0.7, panelM, HX - 0.07, 3.0 + cinemaGroundY(HX - 0.07, i), i);
    }
    function wallStrip(x, y0, w, h, mat) {   // bande continue (filet, soubassement) le long d'un mur latéral : segmentée pour suivre les gradins
      var step = 1.0;
      for (var z = -HZ; z < HZ; z += step) { var zc = Math.min(z + step / 2, HZ - step / 2); box(g, w, h, step + 0.02, mat, x, y0 + cinemaGroundY(x, zc), zc); }
    }
    [-HX + 0.06, HX - 0.06].forEach(function (x) { wallStrip(x, 0.62, 0.1, 0.1, trimM); wallStrip(x, 5.6, 0.1, 0.1, trimM); });   // filets dorés bas et haut
    [-HX + 0.02, HX - 0.02].forEach(function (x) { wallStrip(x, 0.3, 0.04, 0.6, std(0x14070b, 0.9, 0)); });                                   // soubassement

    /* --- scène, rampe de lumières, écran --- */
    var stageD = 2.4;
    box(g, HX * 2, 0.3, stageD, P ? std(0x1a0a10, 0.7, 0.1) : std(0x2a1810, 0.7, 0.1), 0, 0.15, -HZ + stageD / 2);
    box(g, HX * 2, 0.1, 0.06, trimM, 0, 0.15, -HZ + stageD + 0.03);                // liteau doré sur la face de la scène
    for (i = -HX + 0.5; i <= HX - 0.5; i += 0.5) sph(g, 0.045, bas(0xfff0c0), i, 0.15, -HZ + stageD + 0.08);      // petites ampoules posées sur le liteau, bien visibles
    var posterC = mkCanvas(1280, 720), posterTex = mkTex(posterC), posterImg = null;
    var posterLabel = 'AUCUNE SÉANCE EN COURS', posterSub = '';
    // écran de base (aucune séance) : l'affiche assombrie, un clap, le texte ; surtout pas de bouton lecture
    function paintPoster() {
      var x = posterC.getContext('2d');
      x.fillStyle = '#0c0508'; x.fillRect(0, 0, 1280, 720);
      if (posterImg) {                                                    // la bannière Tropi Stream, remplie sans déformation
        var sr = posterImg.naturalWidth / posterImg.naturalHeight, dr = 1280 / 720, sw = sr > dr ? posterImg.naturalHeight * dr : posterImg.naturalWidth, sh = sr > dr ? posterImg.naturalHeight : posterImg.naturalWidth / dr;
        x.drawImage(posterImg, (posterImg.naturalWidth - sw) / 2, (posterImg.naturalHeight - sh) / 2, sw, sh, 0, 0, 1280, 720);
      }
      x.fillStyle = 'rgba(6,2,4,0.9)'; x.fillRect(0, 596, 1280, 124);        // bandeau du bas : aucun bouton lecture, juste l'état de la salle
      x.fillStyle = '#ff7a1a'; x.fillRect(0, 596, 1280, 3);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff3e0';
      x.font = '800 52px ' + SERIF; x.fillText(posterLabel, 640, posterSub ? 636 : 658, 1180);
      if (posterSub) { x.fillStyle = '#ffb066'; x.font = '700 26px ' + MONO; x.fillText(posterSub, 640, 691, 1180); }
      posterTex.needsUpdate = true;
    }
    // écran de chargement : pendant que le flux extrait par Tropi Stream se met en mémoire tampon (ça peut prendre quelques secondes),
    // tout le monde voit ce rond qui tourne plutôt qu'un écran figé ou noir
    function paintLoading(angle) {
      var x = posterC.getContext('2d');
      x.fillStyle = '#0c0508'; x.fillRect(0, 0, 1280, 720);
      if (posterImg) { x.globalAlpha = 0.3; x.drawImage(posterImg, 0, 0, 1280, 720); x.globalAlpha = 1; }
      x.fillStyle = 'rgba(6,2,4,0.55)'; x.fillRect(0, 0, 1280, 720);
      x.save(); x.translate(640, 300); x.rotate(angle);
      x.strokeStyle = '#ff7a1a'; x.lineWidth = 12; x.lineCap = 'round';
      x.beginPath(); x.arc(0, 0, 66, 0, Math.PI * 1.3); x.stroke();
      x.restore();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff3e0';
      x.font = '800 46px ' + SERIF; x.fillText('CHARGEMENT DU FLUX…', 640, 430, 1180);
      x.fillStyle = '#ffb066'; x.font = '700 24px ' + MONO; x.fillText('Tropi Stream prépare la lecture, ça peut prendre quelques secondes', 640, 478, 1180);
      posterTex.needsUpdate = true;
    }
    var loadingActive = false, loadingAngle = 0, loadingPaintT = 0;
    function setLoading(on) {
      on = !!on;
      if (on === loadingActive) return;
      loadingActive = on;
      if (on) { loadingPaintT = 0; paintLoading(loadingAngle); showVideo(false); }
    }
    paintPoster();
    var img = new Image();
    img.onload = function () { posterImg = img; paintPoster(); };
    img.src = POSTER_SRC;
    var screenM = new THREE.MeshBasicMaterial({ map: posterTex });
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenM); screen.position.set(0, SCR_Y + SCR_H / 2, -HZ + 0.16); g.add(screen);
    if (P) {                                                // écran géant : fin cadre doré, halo violet doux autour, rien d'autre
      var halo2 = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W + 1.4, SCR_H + 1.4), new THREE.MeshBasicMaterial({ color: 0x8a4cff, transparent: true, opacity: 0.35, depthWrite: false })); halo2.position.set(0, SCR_Y + SCR_H / 2, -HZ + 0.1); g.add(halo2);
      var frm = 0.12; box(g, SCR_W + 0.3, frm, 0.1, trimM, 0, SCR_Y + SCR_H + 0.07, -HZ + 0.2); box(g, SCR_W + 0.3, frm, 0.1, trimM, 0, SCR_Y - 0.07, -HZ + 0.2); [-1, 1].forEach(function (sd) { box(g, frm, SCR_H + 0.3, 0.1, trimM, sd * (SCR_W / 2 + 0.07), SCR_Y + SCR_H / 2, -HZ + 0.2); });
    }
    // lecture / pause : uniquement depuis la régie (console), plus de clic sur l'écran ni de touche P

    /* --- petits haut-parleurs sur les murs latéraux, comme dans les vrais cinémas --- */
    var spkM = std(0x15090d, 0.7, 0.1), coneM = std(0x1c1c20, 0.5, 0.4), ringM = trimM;
    function speaker(x, z, ry) {
      var s = new THREE.Group(); s.position.set(x, 3.7 + cinemaGroundY(x, z), z); s.rotation.y = ry; s.rotation.x = -0.12; g.add(s);   // penché vers la salle, suit le relief des gradins
      box(s, 0.34, 0.5, 0.24, spkM, 0, 0, 0.12);                                                 // petit caisson mural
      box(s, 0.38, 0.05, 0.28, ringM, 0, 0.26, 0.12); box(s, 0.38, 0.05, 0.28, ringM, 0, -0.26, 0.12);   // chants dorés haut/bas
      cyl(s, 0.1, 0.1, 0.05, coneM, 0, 0.1, 0.25, 16).rotation.x = Math.PI / 2;                  // médium/basse
      cyl(s, 0.095, 0.095, 0.015, ringM, 0, 0.1, 0.275, 16).rotation.x = Math.PI / 2;
      cyl(s, 0.045, 0.045, 0.05, coneM, 0, -0.11, 0.25, 14).rotation.x = Math.PI / 2;             // tweeter
      cyl(s, 0.042, 0.042, 0.015, ringM, 0, -0.11, 0.275, 14).rotation.x = Math.PI / 2;
    }
    (P ? [] : [-7, -0.8, 4.7, 11.3]).forEach(function (z) { speaker(-(HX - 0.2), z, Math.PI / 2); speaker(HX - 0.2, z, -Math.PI / 2); });

    /* --- pas de bords gauche/droite ni en haut (ni cadre, ni rideaux, ni lambrequin) : écran géant plein mur --- */
    function layoutScreen() {}

    /* --- fauteuils : velours rouge, accoudoirs, dossier légèrement penché --- */
    var seats = room.seats = [], seatGeo = {
      cush: new THREE.BoxGeometry(0.74, 0.14, 0.62), back: new THREE.BoxGeometry(0.74, 0.7, 0.14), roll: new THREE.CylinderGeometry(0.075, 0.075, 0.74, 10),
      side: new THREE.BoxGeometry(0.09, 0.5, 0.7), arm: new THREE.BoxGeometry(0.11, 0.07, 0.62), hit: new THREE.BoxGeometry(0.9, 1.3, 0.9),
      pCush: new THREE.BoxGeometry(0.8, 0.2, 0.74), pBase: new THREE.BoxGeometry(0.6, 0.34, 0.5), pBack: new THREE.BoxGeometry(0.8, 0.98, 0.2), pHead: new THREE.BoxGeometry(0.52, 0.26, 0.15), pArm: new THREE.BoxGeometry(0.2, 0.22, 0.78), pLed: new THREE.BoxGeometry(0.62, 0.03, 0.03)
    };
    var velM = P ? std(0xe9e5de, 0.85, 0.02, 0x2a2824) : lam(VELVET), darkM = P ? std(0x3a3a44, 0.7, 0.1, 0x0c0c10) : lam(0x180a0e), ledM = new THREE.MeshBasicMaterial({ color: 0xff8ae0 }), hitM = new THREE.MeshBasicMaterial({ visible: false });
    var inst = null, dummy = new THREE.Object3D();
    if (P) {                                                // 90 places : fauteuils club blancs, larges, bien espacés ; chaque pièce est dessinée en une seule fois pour toute la salle
      var parts = [{ geo: seatGeo.pCush, mat: velM, p: [0, 0.48, -0.02] }, { geo: seatGeo.pBase, mat: darkM, p: [0, 0.2, 0.04] }, { geo: seatGeo.pBack, mat: velM, p: [0, 0.98, 0.34], rx: 0.16 }, { geo: seatGeo.pHead, mat: velM, p: [0, 1.58, 0.45], rx: 0.16 }, { geo: seatGeo.pArm, mat: velM, p: [-0.5, 0.64, 0.0] }, { geo: seatGeo.pArm, mat: velM, p: [0.5, 0.64, 0.0] }, { geo: seatGeo.pLed, mat: ledM, p: [0, 0.06, -0.3] }];
      inst = { parts: parts, meshes: parts.map(function (pt) { var im = new THREE.InstancedMesh(pt.geo, pt.mat, ROWS.length * COLS.length); im.frustumCulled = false; im.count = 0; g.add(im); return im; }), n: 0 };
    }
    function seat(x, z, elev) {
      var s = new THREE.Group(); s.position.set(x, elev, z); g.add(s);
      function put(geo, mat, px, py, pz, rx) { var m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); if (rx) m.rotation.x = rx; s.add(m); return m; }
      if (inst) {
        inst.parts.forEach(function (pt, pi) { dummy.position.set(x + pt.p[0], elev + pt.p[1], z + pt.p[2]); dummy.rotation.set(pt.rx || 0, 0, pt.rz || 0); dummy.updateMatrix(); inst.meshes[pi].setMatrixAt(inst.n, dummy.matrix); });
        inst.n++; inst.meshes.forEach(function (im) { im.count = inst.n; im.instanceMatrix.needsUpdate = true; });
      } else {
        put(seatGeo.cush, velM, 0, 0.5, -0.02); put(seatGeo.back, velM, 0, 0.86, 0.3, 0.14); put(seatGeo.roll, velM, 0, 1.23, 0.36).rotation.z = Math.PI / 2;
        [-1, 1].forEach(function (sd) { put(seatGeo.side, darkM, sd * 0.415, 0.25, 0.0); put(seatGeo.arm, velM, sd * 0.415, 0.58, -0.02); });
      }
      var hit = put(seatGeo.hit, hitM, 0, 0.65, 0.05);
      var n = seats.length, st = { n: n, x: x, z: z, y: elev, yaw: 0, sx: x, sz: z - 0.95, hit: hit };
      seats.push(st);
      room.interactables.push({
        hit: hit, x: x, z: z, radius: 0.95,
        enabled: function () { return !seat_.cur && !taken(st); },
        prompt: function () { return '🎬 S\'asseoir  [F]'; },
        use: function (w) { sit(w, st); }
      });
    }
    var seat_ = { cur: null };
    if (false) ROWS.forEach(function (rz, ri) { [-3.95, 3.95, -9.6, 9.6].forEach(function (rx) { var ry = cinemaGroundY(rx, rz); box(g, 0.05, 0.05, ROW_GAP + 0.02, trimM, rx, ry + 0.95, rz); box(g, 0.04, 0.95, 0.04, trimM, rx, ry + 0.47, rz - ROW_GAP / 2); }); });      // rampes dorées le long des allées
    ROWS.forEach(function (rz, ri) { var elev = G0.elev ? G0.elev(ri) : ri * ROW_H; COLS.forEach(function (cx2) { seat(cx2, rz, elev); }); });

    /* --- gradins : un bloc plein (marche nette) sous chaque bloc de fauteuils, à partir de la 2e rangée --- */
    var deckM = P ? std(0x3a0a14, 0.9, 0.05) : std(0x34101b, 0.85, 0.05);
    function deckBlock(xC, xW, zC, topY, base) { base = base || 0; if (topY - base < 0.01) return; box(g, xW, topY - base, ROW_GAP, deckM, xC, base + (topY - base) / 2, zC); box(g, xW, 0.03, 0.05, P ? bas(0xcfd8ff) : trimM, xC, topY, zC - ROW_GAP / 2 + 0.025); }   // + nez de marche doré, sur le bord qui fait face à l'écran
    ROWS.forEach(function (rz, ri) { if (!ri) return; var topY = G0.elev ? G0.elev(ri) : ri * ROW_H, base = G0.elev && ri >= G0.nLow ? G0.HB : 0; G0.blocks.forEach(function (b) { deckBlock((b.x0 + b.x1) / 2, b.x1 - b.x0, rz, topY, base); }); });

    /* --- allées (centrale + deux latérales) : un escalier continu, construit en échantillonnant cinemaGroundY --- */
    (function buildStairs() {
      if (P) { buildUpper(); return; }
      var sideW = (HX - 0.7) - 5.7, sideX = 5.7 + sideW / 2;   // allée latérale : de x=5,7 jusqu'au bord de la salle
      var lanes = G0.lanes, step = 0.38;
      lanes.forEach(function (ln) {
        var xC = ln[0], xW = ln[1];
        for (var z = ROWS[0]; z < ROWS[ROWS.length - 1]; z += step) {
          var zc = z + step / 2, topY = cinemaGroundY(xC, zc);
          if (topY > 0.01) box(g, xW, topY, step + 0.02, deckM, xC, topY / 2, zc);
        }
      });
    })();
    // l'étage : mur plein sous le balcon, grand escalier le long de chaque mur, garde-corps de verre, rampes dorées, petites lumières ; rien n'est au-dessus des rangées du bas
    function buildUpper() {
      var HB = G0.HB, zb = G0.zb, zs0 = G0.zs0, RX0 = G0.railX, k2, z2;
      box(g, HX * 2, HB, ROWS[ROWS.length - 1] - zb + 0.9, deckM, 0, HB / 2, (zb + ROWS[ROWS.length - 1] + 0.9) / 2);                       // le dessous de l'étage : un mur plein
      box(g, HX * 2 - 0.4, 0.06, 0.06, bas(0xd77cff), 0, HB - 0.3, zb - 0.03);                                                           // ruban lumineux sur le balcon
      box(g, HX * 2 - 0.4, 0.07, 0.1, trimM, 0, HB - 0.06, zb - 0.04);
      for (k2 = -10.5; k2 <= 10.6; k2 += 1.5) { var dl = sph(g, 0.07, bas(0xfff2d0), k2, HB - 0.65, zb - 0.04); dl.scale.z = 0.4; }       // petits spots au pied du balcon
      // garde-corps de verre au bord de l'étage
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(RX0 * 2, 0.95), new THREE.MeshBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); gl.position.set(0, HB + 0.5, zb + 0.28); g.add(gl);
      box(g, RX0 * 2, 0.06, 0.08, trimM, 0, HB + 1.0, zb + 0.28); for (k2 = -RX0; k2 <= RX0 + 0.01; k2 += 2.95) box(g, 0.05, 1.0, 0.05, trimM, k2, HB + 0.5, zb + 0.28);
      // grand escalier de chaque côté : marches, nez lumineux, rampe dorée
      [-1, 1].forEach(function (sd) {
        var xC = sd * (RX0 + HX - 0.3) / 2, xW = HX - 0.3 - RX0;
        for (z2 = zs0; z2 < zb; z2 += 0.45) {
          var zc = z2 + 0.225, top = cinemaGroundY(xC, zc);
          if (top > 0.02) { box(g, xW, top, 0.47, deckM, xC, top / 2, zc); box(g, xW, 0.03, 0.06, bas(0xcfd8ff), xC, top + 0.005, z2 + 0.03); }
          if (top > 0.02) box(g, 0.07, 0.07, 0.5, trimM, sd * RX0, top + 0.98, zc);
        }
        for (z2 = zs0 + 1.2; z2 < zb; z2 += 1.9) box(g, 0.06, 1.0, 0.06, trimM, sd * RX0, cinemaGroundY(sd * (RX0 + 0.5), z2) + 0.5, z2);
        for (z2 = zb; z2 < HZ - 0.5; z2 += 0.5) box(g, 0.07, 0.07, 0.52, trimM, sd * RX0, HB + 1.0, z2 + 0.25);
        // les murs ne se traversent pas : une barrière invisible le long de la rampe, du garde-corps et du bord de l'étage
        for (z2 = zs0 + 1.0; z2 < zb + 0.3; z2 += 0.6) room.colliders.push({ x: sd * (RX0 + 0.1), z: z2, r: 0.4 });
      });
      for (k2 = -RX0 + 0.3; k2 <= RX0 - 0.3; k2 += 0.6) { room.colliders.push({ x: k2, z: zb - 0.4, r: 0.45 }); room.colliders.push({ x: k2, z: zb + 0.3, r: 0.45 }); }
    }
    /* --- palier du fond : régie, pop-corn et sortie sont de plain-pied avec la dernière rangée (jusqu'au mur du fond, sinon la régie flotte au-dessus du vide) --- */
    var backZ0 = ROWS[ROWS.length - 1], backZC = (backZ0 + HZ) / 2;
    box(g, HX * 2, BACK_H, HZ - backZ0 + 0.1, deckM, 0, BACK_H / 2, backZC);
    box(g, HX * 2 - 1.4, 0.03, 0.05, trimM, 0, BACK_H, backZ0 + 0.025);

    /* --- feux d'allée au sol, à chaque bout de rangée (suivent le relief des gradins) --- */
    ROWS.forEach(function (rz) { G0.aisleLights.forEach(function (ax) { box(g, 0.06, 0.04, 0.2, bas(P ? 0xcfd8ff : 0xffa040), ax, cinemaGroundY(ax, rz + 0.1) + 0.03, rz + 0.1); }); });

    /* --- fond de salle : appliques, cabine de projection, comptoir à pop-corn, porte de sortie --- */
    var glowC = mkCanvas(64, 64), gx = glowC.getContext('2d'), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,200,130,0.85)'); gr.addColorStop(0.4, 'rgba(255,150,70,0.3)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    var glowM = new THREE.SpriteMaterial({ map: mkTex(glowC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    var lampGlow = [], shadeM = new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide });
    function sconce(x, z, ry) {                         // ry : le mur regarde vers (sin ry, cos ry) ; posée sur la face du panneau de bois, pas dedans
      var s = new THREE.Group(); s.position.set(x, 3.0 + cinemaGroundY(x, z), z); s.rotation.y = ry; g.add(s);
      box(s, 0.16, 0.46, 0.03, trimM, 0, 0, 0.015);                              // platine dorée plaquée sur le panneau
      cyl(s, 0.022, 0.022, 0.17, trimM, 0, -0.02, 0.1, 8).rotation.x = Math.PI / 2;   // bras
      var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.3, 16, 1, true), shadeM); sh.position.set(0, -0.02, 0.2); s.add(sh);
      sph(s, 0.05, bas(0xfff0c0), 0, -0.02, 0.2);
      var gl = new THREE.Sprite(glowM); gl.scale.set(1.6, 1.6, 1); gl.position.set(0, -0.02, 0.27); s.add(gl); lampGlow.push(gl);
    }
    (P ? [] : [-7, -3.1, 0.8, 4.7, 8.6, 11.3]).forEach(function (z) { sconce(-(HX - 0.145), z, Math.PI / 2); sconce(HX - 0.145, z, -Math.PI / 2); });   // une par latte de bois
    // cabine de projection, centrée dans le mur du fond : une vraie fenêtre, et le projecteur derrière la vitre
    var BX = 0, BY = 7.0 + BACK_H;   // remontée avec le palier du fond (sinon elle retombe au niveau de l'enseigne de la sortie)
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
    // faisceau du projecteur retiré
    // comptoir à pop-corn
    var cw = new THREE.Group(); var PXc = -(HX - 3.2); cw.position.set(PXc, BACK_H, HZ - 0.45); g.add(cw);   // collé contre le mur du fond
    box(cw, 3.2, 1.0, 0.8, lam(0x2a0f16), 0, 0.5, 0); box(cw, 3.3, 0.07, 0.9, std(0xd8cfc0, 0.4, 0.2), 0, 1.03, 0);
    box(cw, 0.9, 0.9, 0.6, std(0xc41e2a, 0.5, 0.2), -0.9, 1.5, 0); box(cw, 0.8, 0.8, 0.52, new THREE.MeshLambertMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.75 }), -0.9, 2.35, 0);
    for (i = 0; i < 14; i++) sph(cw, 0.07, lam(i % 3 ? 0xfff0c0 : 0xf2d98a), -0.9 + (Math.random() - 0.5) * 0.55, 2.1 + Math.random() * 0.55, (Math.random() - 0.5) * 0.3);
    var sgC = mkCanvas(512, 128), sgx = sgC.getContext('2d');
    sgx.fillStyle = '#12080f'; sgx.fillRect(0, 0, 512, 128); sgx.strokeStyle = '#ff7a1a'; sgx.lineWidth = 6; sgx.strokeRect(5, 5, 502, 118);
    sgx.textAlign = 'center'; sgx.textBaseline = 'middle'; sgx.fillStyle = '#ffb066'; sgx.font = '800 62px ' + SERIF; sgx.fillText('POP-CORN', 256, 66, 470);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: mkTex(sgC) })); sign.position.set(0.6, 3.1, 0.05); sign.rotation.y = Math.PI; cw.add(sign);   // tourné vers la salle (sinon lu de dos, inversé) — remontée au-dessus du pop-corn
    if (!low) [[-6.8, HZ - 1.7], [0, HZ - 1.6], [6.8, HZ - 1.7]].forEach(function (p) { var fl = new THREE.PointLight(0xffd9a8, 0.85, 7); fl.position.set(p[0], BACK_H + 2.8, p[1]); g.add(fl); });   // pop-corn, sortie et régie restent visibles même pendant le film
    var cupM = [lam(0xffffff), lam(0xd01a1a)];
    for (i = 0; i < 6; i++) cyl(cw, 0.1, 0.075, 0.24, cupM[i % 2], 0.2 + i * 0.22, 1.19, 0.1, 12);
    room.colliders.push({ x: PXc - 1.0, z: HZ - 1.1, r: 0.8 }, { x: PXc, z: HZ - 1.1, r: 0.8 }, { x: PXc + 1.0, z: HZ - 1.1, r: 0.8 });
    // --- régie : la console du Patron / Co Fondateur, collée contre le mur du fond, à droite ---
    var RX = HX - 3.2, RZ = HZ - 0.5;
    var regie = new THREE.Group(); regie.position.set(RX, BACK_H, RZ); regie.rotation.y = Math.PI; g.add(regie);   // dos au mur, face tournée vers la salle
    box(regie, 1.4, 0.04, 0.78, std(0x8a8a92, 0.5, 0.2), 0, 0.75, 0.02);                   // bureau : plateau clair sur quatre pieds
    [[-0.63, -0.33], [0.63, -0.33], [-0.63, 0.33], [0.63, 0.33]].forEach(function (lp) { box(regie, 0.05, 0.73, 0.05, std(0x2a2a30, 0.5, 0.3), lp[0], 0.365, lp[1]); });
    box(regie, 1.44, 0.03, 0.06, trimM, 0, 0.75, -0.36);                                   // filet doré sur le bord avant du bureau
    // tour du PC, posée au sol à côté du bureau
    var towerM = std(0x202024, 0.4, 0.5);
    box(regie, 0.36, 0.86, 0.68, towerM, -0.85, 0.43, 0.02);
    box(regie, 0.012, 0.86, 0.68, std(0x1a1a1e, 0.3, 0.6), -0.67, 0.43, 0.02);              // flanc vitré sombre
    sph(regie, 0.022, bas(0x3ad0ff), -0.85, 0.66, 0.37); box(regie, 0.1, 0.1, 0.012, std(0x151518, 0.4, 0.3), -0.85, 0.5, 0.37);   // led bleue + bouton power
    for (i = 0; i < 3; i++) box(regie, 0.012, 0.012, 0.56, std(0x151518, 0.5, 0.3), -0.85 - 0.06 + i * 0.06, 0.2, 0.02);            // grille d'aération
    // écran, bien droit sur son pied — un vrai moniteur de PC
    box(regie, 0.3, 0.02, 0.18, std(0x1c1c20, 0.4, 0.5), 0, 0.775, -0.22);                  // socle
    box(regie, 0.04, 0.26, 0.04, std(0x1c1c20, 0.4, 0.5), 0, 0.9, -0.2);                    // pied
    var regieScreen = box(regie, 0.72, 0.42, 0.03, std(0x0a0e18, 0.3, 0.1, 0x16284a), 0, 1.11, -0.2); regieScreen.rotation.x = -0.05;  // écran bien vertical (léger recul)
    box(regie, 0.76, 0.46, 0.015, std(0x16161a, 0.4, 0.3), 0, 1.11, -0.188);                // fine lisière de bezel noire autour de la dalle
    // clavier + souris, sur le bureau devant l'écran
    box(regie, 0.46, 0.02, 0.17, std(0x242428, 0.5, 0.2), 0, 0.775, 0.1);
    for (i = 0; i < 10; i++) box(regie, 0.032, 0.012, 0.032, std(0x34343a, 0.5, 0.2), -0.2 + (i % 5) * 0.1, 0.792, 0.05 + Math.floor(i / 5) * 0.09);
    box(regie, 0.07, 0.03, 0.11, std(0x2c2c32, 0.4, 0.3), 0.33, 0.78, 0.14);                 // souris
    sph(regie, 0.012, bas(0x3ad0ff), 0.33, 0.805, 0.1);                                      // petite molette qui dépasse
    for (i = 0; i < 3; i++) sph(regie, 0.028, bas(i === 1 ? 0xff5050 : 0xffd24a), -0.18 + i * 0.18, 0.8, 0.33);   // petits voyants sur le bord du bureau
    var rgC = mkCanvas(512, 128), rgx = rgC.getContext('2d');
    rgx.fillStyle = '#120a16'; rgx.fillRect(0, 0, 512, 128); rgx.strokeStyle = '#c9a227'; rgx.lineWidth = 6; rgx.strokeRect(5, 5, 502, 118);
    rgx.textAlign = 'center'; rgx.textBaseline = 'middle'; rgx.fillStyle = '#e9c66b'; rgx.font = '800 50px ' + SERIF; rgx.fillText('RÉGIE', 256, 46, 470);
    rgx.fillStyle = '#9d8a53'; rgx.font = '700 24px ' + MONO; rgx.fillText('Patron · Co Fondateur', 256, 92, 470);
    var regieSign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(rgC) })); regieSign.position.set(0, 2.0, 0); regie.add(regieSign);
    var regieGlow = new THREE.Sprite(glowM); regieGlow.scale.set(0.3, 0.3, 1); regieGlow.position.set(0, 1.11, -0.3); regie.add(regieGlow);   // pas dans lampGlow : ce halo ne doit pas grossir avec les appliques (sinon il déborde largement de l'écran)
    var regieHit = box(regie, 1.5, 1.7, 1.2, hitM, 0, 0.85, 0.15);
    room.interactables.push({
      hit: regieHit, x: RX, z: RZ, radius: 1.15,
      enabled: function () { return isCinemaCtrl(); },
      prompt: function () { return '🎛️ Régie — choisir le film  [F]'; },
      use: function (w) { if (!isCinemaCtrl()) return; toggleConsole(); }
    });
    room.colliders.push({ x: RX, z: RZ, r: 0.85 });
    // pancarte « SORTIE » verte au-dessus de la porte, avec un petit logo bonhomme qui sort par une porte (pictogramme classique)
    var exC = mkCanvas(256, 80), ex = exC.getContext('2d'); ex.fillStyle = '#063a1a'; ex.fillRect(0, 0, 256, 80); ex.strokeStyle = '#3ddc7a'; ex.lineWidth = 5; ex.strokeRect(4, 4, 248, 72);
    ex.fillStyle = '#7dffae';                                                                      // pictogramme : cadre de porte + bonhomme qui marche vers la sortie
    ex.fillRect(20, 16, 4, 48); ex.fillRect(20, 60, 22, 4);                                         // montant + seuil de la porte
    ex.beginPath(); ex.arc(40, 24, 5, 0, TAU); ex.fill();                                           // tête
    ex.lineWidth = 4; ex.strokeStyle = '#7dffae'; ex.lineCap = 'round';
    ex.beginPath(); ex.moveTo(40, 30); ex.lineTo(40, 46); ex.stroke();                              // torse
    ex.beginPath(); ex.moveTo(40, 34); ex.lineTo(50, 30); ex.stroke();                              // bras tendu vers la flèche
    ex.beginPath(); ex.moveTo(40, 46); ex.lineTo(34, 60); ex.stroke();                              // jambe arrière
    ex.beginPath(); ex.moveTo(40, 46); ex.lineTo(48, 62); ex.stroke();                              // jambe avant
    ex.beginPath(); ex.moveTo(50, 36); ex.lineTo(66, 36); ex.moveTo(60, 30); ex.lineTo(66, 36); ex.lineTo(60, 42); ex.stroke();   // flèche vers la sortie
    ex.font = '900 44px ' + MONO; ex.textAlign = 'center'; ex.textBaseline = 'middle'; ex.fillText('SORTIE', 160, 42, 180);
    var exit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(exC) })); exit.position.set(0, BACK_H + 4.9, HZ - 0.06); exit.rotation.y = Math.PI; g.add(exit);
    var exitDoor = world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.4, h: 3.2, label: '🚪 SORTIE', sub: 'RETOUR AU HALL', color: 0xff7a1a, target: 'hall', theme: P ? 'exitCinemaPremium' : 'exitCinema' });
    exitDoor.g.position.y = BACK_H;   // la porte est au niveau du palier du fond, surélevé par les gradins

    /* --- lumières : salle allumée avant la séance, baissées pendant --- */
    var amb = new THREE.AmbientLight(0xffe6d0, 0.95); g.add(amb);
    var key = new THREE.DirectionalLight(0xfff0e0, 0.3); key.position.set(0, 7, 6); g.add(key);
    var lights = [];
    if (!low) (P ? [[-8, 9, -9], [8, 9, -9], [-8, 9, 1], [8, 9, 1], [0, 9, 12]] : [[-6, 6.8, -3], [6, 6.8, -3], [0, 6.8, 6]]).forEach(function (p) { var pl = new THREE.PointLight(P ? 0xe8dcff : 0xffd9a8, 0.55, P ? 28 : 16); pl.position.set(p[0], p[1], p[2]); g.add(pl); lights.push(pl); });
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
    video.crossOrigin = 'anonymous'; video.preload = 'auto';   // on charge le film d'avance, même avant le lancement video.playsInline = true; video.setAttribute('playsinline', ''); video.loop = false;
    var vtex = new THREE.VideoTexture(video); vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    var net = { url: '', type: 'mp4', status: 'idle', position: 0, recvAt: performance.now(), busy: false, lastSrc: '', title: '', schedule: [] };
    function showVideo(on) { screenM.map = on ? vtex : posterTex; screenM.needsUpdate = true; }
    function netPosNow() {
      var p = net.position;
      if (net.status === 'playing') p += (performance.now() - net.recvAt) / 1000;
      return p;
    }
    // type: 'hls' (flux .m3u8, ce que renvoie en général l'extraction fsvid / uqload / vidzy côté serveur) :
    // Chrome/Firefox ne le lisent pas nativement, on charge hls.js à la demande ; Safari le lit nativement, pas besoin.
    var hlsInst = null, hlsLibPromise = null;
    function loadHlsLib(cb) {
      if (window.Hls) return cb(window.Hls);
      if (!hlsLibPromise) {
        hlsLibPromise = new Promise(function (resolve) {
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
          s.onload = function () { resolve(window.Hls || null); };
          s.onerror = function () { resolve(null); };
          document.head.appendChild(s);
        });
      }
      hlsLibPromise.then(cb);
    }
    function setSource(url, type) {
      started = false;
      if (hlsInst) { try { hlsInst.destroy(); } catch (e) { /* ok */ } hlsInst = null; }
      if (url && type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
        loadHlsLib(function (Hls) {
          if (!Hls) { world.flash('🎬 Lecture HLS indisponible.', 'Réessaie dans un instant.'); return; }
          // grosse avance de lecture : on charge la suite bien avant d'en avoir besoin (moins de « chargement du flux » en cours de film)
          hlsInst = new Hls({ maxBufferLength: 90, maxMaxBufferLength: 180, maxBufferSize: 200 * 1000 * 1000, backBufferLength: 20, startFragPrefetch: true, manifestLoadingMaxRetry: 4, fragLoadingMaxRetry: 6, levelLoadingMaxRetry: 4 });
          hlsInst.on(Hls.Events.ERROR, function (ev, data) {
            if (!data || !data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { try { hlsInst.startLoad(); } catch (e) { /* ok */ } }          // coupure réseau : on relance le chargement sans bruit
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hlsInst.recoverMediaError(); } catch (e) { /* ok */ } }
            else world.flash('🎬 Ce flux n\'a pas pu être lu.', 'Vérifie l\'adresse depuis la régie.');
          });
          hlsInst.loadSource(url); hlsInst.attachMedia(video);
        });
      } else {
        video.src = url || ''; try { video.load(); } catch (e) { /* ok */ }
      }
    }
    video.addEventListener('error', function () { if (net.url) world.flash('🎬 Ce lien n\'a pas pu être lu.', 'Vérifie l\'adresse depuis la régie.'); });
    var endedUrl = '', lastSt = null, stallT = 0, started = false, bufEl = null;
    // fin du film : chez tout le monde on revient à l'écran de base (aucune séance), et le Patron/Co Fondateur coupe la séance pour tout le monde
    video.addEventListener('ended', function () { endedUrl = net.url; if (isCinemaCtrl() && net.status === 'playing') cinemaAction('stop'); if (lastSt) applyNet(lastSt); });
    // écran de chargement tant que le flux met en mémoire tampon (extraction Tropi Stream + démarrage du flux, parfois plusieurs secondes)
    // (l'écran de chargement n'apparaît qu'après une vraie coupure d'une seconde, voir room.update : plus de rond qui clignote pour un micro-ralentissement)
    video.addEventListener('playing', function () { stallT = 0; started = true; if (net.status === 'playing') { setLoading(false); showVideo(true); } });
    /* --- son en 3D : le film s'entend d'où est l'écran (panoramique gauche/droite, plus étouffé loin/derrière) ; si WebAudio échoue, on retombe sur video.volume --- */
    var vAudio = { ctx: null, pan: null, lp: null, gain: null, ok: false };
    function ensureVideoAudio() {
      if (vAudio.ctx || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        var c = vAudio.ctx = new AC(), src = c.createMediaElementSource(video);
        vAudio.pan = c.createStereoPanner ? c.createStereoPanner() : null;
        vAudio.lp = c.createBiquadFilter(); vAudio.lp.type = 'lowpass'; vAudio.lp.frequency.value = 18000;
        vAudio.gain = c.createGain(); vAudio.gain.gain.value = 1;
        src.connect(vAudio.pan || vAudio.lp); if (vAudio.pan) vAudio.pan.connect(vAudio.lp);
        vAudio.lp.connect(vAudio.gain); vAudio.gain.connect(c.destination);
        vAudio.ok = true; video.volume = 1;
      } catch (e) { vAudio.ctx = null; vAudio.ok = false; /* on garde video.volume */ }
    }
    /* --- annonce « séance en cours » à l'entrée : titre, affiche, début et fin (heure réelle) --- */
    var seanceAsked = false;
    function announceSeance() {
      var raw = net.title || '', base = raw.replace(/\s*\[(VF|VO)\]\s*$/, '');
      loadPlaylist(function (pl) {
        var f = pl && pl.find(function (x) { return x.nom === base; });
        var poster = f && f.poster ? f.poster : 'assets/cinema/tropistream-serveur.png';
        var startD = new Date(Date.now() - netPosNow() * 1000);
        function go() {
          var dur = video.duration, endD = (isFinite(dur) && dur > 0) ? new Date(startD.getTime() + dur * 1000) : null;
          showSeanceCard(poster, raw || 'Film', startD, endD);
        }
        if (video.readyState >= 1 && isFinite(video.duration)) go(); else video.addEventListener('loadedmetadata', go, { once: true });
      });
    }
    var seanceCardEl = null, seanceCardT = 0;
    function fmtHeure(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function showSeanceCard(poster, title, startD, endD) {
      if (!seanceCardEl) { seanceCardEl = document.createElement('div'); seanceCardEl.className = 'cin-seance'; world.container.appendChild(seanceCardEl); }
      seanceCardEl.innerHTML = '<img src="' + poster.replace(/"/g, '&quot;') + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="cin-seance-tx"><div class="cin-seance-badge">🎬 Séance en cours</div>' +
        '<div class="cin-seance-title">' + title.replace(/</g, '&lt;') + '</div>' +
        '<div class="cin-seance-h">Début ' + fmtHeure(startD) + (endD ? ' · Fin prévue ' + fmtHeure(endD) : '') + '</div></div>';
      seanceCardEl.classList.remove('out'); void seanceCardEl.offsetWidth; seanceCardEl.classList.add('on');
      clearTimeout(seanceCardT); seanceCardT = setTimeout(function () { if (seanceCardEl) seanceCardEl.classList.add('out'); }, 7000);
    }
    function nextSeanceSub() {
      var nx = (net.schedule || []).filter(function (it) { return it.at > Date.now(); })[0];
      if (nx) return 'Prochaine séance : ' + nx.title.replace(/\s*\[(VF|VO)\]\s*$/, '') + ' · ' + fmtSchedDate(nx.at);
      return net.url && net.title ? 'Film chargé : ' + net.title.replace(/\s*\[(VF|VO)\]\s*$/, '') : '';
    }
    function applyNet(st) {
      if (!st) return;
      lastSt = st;
      net.url = st.url || ''; net.type = st.type || 'mp4'; net.position = st.position || 0; net.recvAt = performance.now();
      net.title = st.title || ''; net.schedule = Array.isArray(st.schedule) ? st.schedule : [];
      if (st.status !== 'playing') endedUrl = '';
      net.status = (st.status === 'playing' && net.url && net.url === endedUrl) ? 'idle' : (st.status || 'idle');   // film terminé chez moi : écran de base, même si le serveur n'a pas encore coupé
      if (net.url !== net.lastSrc) { net.lastSrc = net.url; endedUrl = st.status === 'playing' ? '' : endedUrl; setSource(net.url, net.type); }
      if (!seanceAsked) { seanceAsked = true; if (net.status === 'playing') announceSeance(); }
      if (net.status === 'playing') {
        ensureVideoAudio();
        var drift = netPosNow() - video.currentTime;
        if (Math.abs(drift) > 2.5) video.currentTime = Math.max(0, netPosNow());       // gros écart seulement : un saut en arrière-plan coupe la lecture, on évite
        else if (Math.abs(drift) > 0.4) video.playbackRate = drift > 0 ? 1.06 : 0.94;  // petit écart : on rattrape en douceur
        else if (video.playbackRate !== 1) video.playbackRate = 1;
        if (video.readyState >= 3) showVideo(true);
        var p = video.play(); if (p && p.catch) p.catch(function () { /* geste requis : la lecture reprendra au prochain geste de l'utilisateur */ });
      } else {
        setLoading(false); stallT = 0;
        if (!video.paused) video.pause();
        if (video.playbackRate !== 1) video.playbackRate = 1;
        if (net.status === 'paused') { showVideo(true); if (Math.abs(video.currentTime - net.position) > 0.4) video.currentTime = net.position; }
        else {
          showVideo(false);
          var sub = nextSeanceSub();
          if (posterLabel !== 'AUCUNE SÉANCE EN COURS' || sub !== posterSub) { posterLabel = 'AUCUNE SÉANCE EN COURS'; posterSub = sub; paintPoster(); }
        }
      }
      refreshConsole(); renderSchedule();
    }
    function pollCinema() {
      if (net.busy) return;
      net.busy = true;
      fetch('/api/cinema' + (P ? '?room=premium' : ''), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (st) { net.busy = false; applyNet(st); }).catch(function () { net.busy = false; });
    }
    function cinemaAction(action, extra) {
      if (!isCinemaCtrl()) return Promise.resolve(null);
      return world.post('/api/cinema', Object.assign({ action: action }, P ? { room: 'premium' } : {}, extra || {})).then(function (r) {
        if (r && r.ok && r.state) applyNet(r.state);
        else if (r && r.error) world.flash('⛔ ' + r.error);
        return r;
      });
    }
    /* ===================== MASQUER / MONTRER L'INTERFACE ===================== */
    var hudHidden = false, eyeEl = null;
    function setHud(hide) {
      hudHidden = !!hide;
      if (world.hud) world.hud.classList.toggle('cin-nohud', hudHidden);
      if (world.container) world.container.classList.toggle('cin-hud-hidden', hudHidden);   // curseur : visible sauf interface masquée (voir injectCss)
      if (standEl) standEl.classList.toggle('hid', hudHidden);
      if (eyeEl) eyeEl.innerHTML = hudHidden ? "<i class='fa-solid fa-eye'></i> Afficher l'interface <kbd>L</kbd>" : "<i class='fa-solid fa-eye-slash'></i> Masquer l'interface <kbd>L</kbd>";
    }
    function mountEye() {
      if (eyeEl) return;
      eyeEl = document.createElement('button'); eyeEl.className = 'cin-eye';
      eyeEl.addEventListener('click', function () { setHud(!hudHidden); });
      world.container.appendChild(eyeEl); setHud(hudHidden);
    }
    function unmountEye() { if (eyeEl && eyeEl.parentNode) eyeEl.parentNode.removeChild(eyeEl); eyeEl = null; if (world.hud) world.hud.classList.remove('cin-nohud'); if (world.container) world.container.classList.remove('cin-hud-hidden'); hudHidden = false; }
    function onKeyL(e) {
      if (e.code !== 'KeyL') return;
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable) || world._keyCapture) return;
      e.preventDefault(); setHud(!hudHidden);
    }

    /* ===================== CONSOLE RÉGIE (Patron / Co Fondateur) ===================== */
    var consoleEl = null;
    var playlist = null, playlistLoading = false;
    var plSearch = '', plGenre = 'all', plBatch = 30, plFiltered = [];

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function loadPlaylist(cb) {
      if (playlist) { if (cb) cb(playlist); return; }
      if (playlistLoading) return;
      playlistLoading = true;
      fetch('assets/cinema/playlist.json', { cache: 'default' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
          playlist = Array.isArray(data) ? data : [];
          playlistLoading = false;
          filterPlaylist();
          renderPlaylistGenres();
          renderPlaylistItems(false);
          populateScheduleSelect();
          if (cb) cb(playlist);
        })
        .catch(function (e) {
          playlistLoading = false;
          console.warn('Erreur chargement playlist cinéma:', e);
          if (consoleEl) {
            var l = consoleEl.querySelector('.cin-pl-list');
            if (l) l.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-triangle-exclamation"></i> Impossible de charger la playlist.<br><small>' + escapeHtml(e.message) + '</small></div>';
          }
          if (cb) cb([]);
        });
    }

    function filterPlaylist() {
      if (!playlist) { plFiltered = []; return; }
      var q = plSearch.trim().toLowerCase();
      var g = plGenre;
      plFiltered = playlist.filter(function (f) {
        if (g !== 'all') {
          var hasGenre = (f.genres || []).some(function (gen) {
            return gen.toLowerCase() === g.toLowerCase();
          });
          if (!hasGenre) return false;
        }
        if (q) {
          var hay = (f.nom + ' ' + (f.annee || '') + ' ' + (f.genres || []).join(' ') + ' ' + (f.host || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      plBatch = 30;
    }

    function renderPlaylistGenres() {
      if (!consoleEl) return;
      var el = consoleEl.querySelector('[data-a="genres"]');
      if (!el || !playlist) return;
      var counts = {};
      playlist.forEach(function (f) {
        (f.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
      });
      var sorted = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);
      var html = '<button class="cin-genre-pill' + (plGenre === 'all' ? ' active' : '') + '" data-g="all">Tous (' + playlist.length + ')</button>';
      sorted.forEach(function (g) {
        html += '<button class="cin-genre-pill' + (plGenre === g ? ' active' : '') + '" data-g="' + escapeHtml(g) + '">' + escapeHtml(g) + ' <small>(' + counts[g] + ')</small></button>';
      });
      el.innerHTML = html;
    }

    function renderPlaylistItems(append) {
      if (!consoleEl) return;
      var listEl = consoleEl.querySelector('.cin-pl-list');
      var countEl = consoleEl.querySelector('.cin-pl-count');
      if (!listEl) return;

      if (!playlist) {
        listEl.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-spinner fa-spin"></i> Chargement de la playlist Tropi Stream…</div>';
        if (countEl) countEl.textContent = 'Chargement…';
        return;
      }

      if (countEl) {
        countEl.textContent = plFiltered.length + ' film' + (plFiltered.length > 1 ? 's' : '') + (plGenre !== 'all' || plSearch ? ' trouvé(s)' : ' disponible(s)');
      }

      if (plFiltered.length === 0) {
        listEl.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-magnifying-glass"></i> Aucun film trouvé pour cette recherche.</div>';
        return;
      }

      var slice = plFiltered.slice(append ? plBatch - 30 : 0, plBatch);
      var itemsHtml = slice.map(function (f) {
        var hostClass = (f.host || '').toLowerCase();
        var genresHtml = (f.genres || []).slice(0, 2).map(function (g) {
          return '<span class="cin-pl-tag">' + escapeHtml(g) + '</span>';
        }).join('');

        var vfBtn = f.vf ? '<button class="cin-pl-pick vf" data-a="pick" data-id="' + f.id + '" data-ver="VF" title="Charger en VF"><i class="fa-solid fa-play"></i> VF</button>' : '';
        var voBtn = f.vo ? '<button class="cin-pl-pick vo" data-a="pick" data-id="' + f.id + '" data-ver="VO" title="Charger en VO"><i class="fa-solid fa-play"></i> VO</button>' : '';

        return '<div class="cin-pl-item" data-id="' + f.id + '">' +
          '<img class="cin-pl-thumb" src="' + escapeHtml(f.poster) + '" alt="" onerror="this.onerror=null;this.src=\'assets/cinema/tropistream-serveur.png\';" loading="lazy">' +
          '<div class="cin-pl-info">' +
            '<div class="cin-pl-title" title="' + escapeHtml(f.nom) + '">' + escapeHtml(f.titre) + (f.annee ? ' <span class="cin-pl-year">(' + f.annee + ')</span>' : '') + '</div>' +
            '<div class="cin-pl-meta">' +
              '<span class="cin-pl-badge ' + hostClass + '">' + escapeHtml(f.host || 'STREAM') + '</span>' +
              genresHtml +
            '</div>' +
          '</div>' +
          '<div class="cin-pl-actions">' + vfBtn + voBtn + '</div>' +
        '</div>';
      }).join('');

      if (append) {
        var tmp = document.createElement('div');
        tmp.innerHTML = itemsHtml;
        while (tmp.firstChild) listEl.appendChild(tmp.firstChild);
      } else {
        listEl.innerHTML = itemsHtml;
        listEl.scrollTop = 0;
      }
    }

    function pickFilm(id, ver) {
      if (!playlist) return;
      var f = playlist.find(function (x) { return String(x.id) === String(id); });
      if (!f) return;
      var targetUrl = (ver === 'VO' && f.vo) ? f.vo : (f.vf || f.url);
      if (!targetUrl) return;
      var fullTitle = f.nom + (ver ? ' [' + ver + ']' : '');
      var urlInput = consoleEl.querySelector('.cin-cn-url');
      if (urlInput) urlInput.value = targetUrl;
      world.flash('🎬 ' + f.titre + ' (' + ver + ')', 'Extraction du flux ' + (f.host || 'Premium') + ' via Tropi Stream...');
      pendingTitle = fullTitle; refreshConsole();
      cinemaAction('set', { url: targetUrl, title: fullTitle }).then(function () { pendingTitle = ''; refreshConsole(); });
    }
    function filmOfTitle(title) {
      if (!playlist || !title) return null;
      var base = String(title).replace(/\s*\[(VF|VO)\]\s*$/, '');
      return playlist.find(function (x) { return x.nom === base; }) || null;
    }
    function verOfTitle(t) { var m = /\[(VF|VO)\]\s*$/.exec(t || ''); return m ? m[1] : ''; }

    /* ===================== PROGRAMMATION DES SÉANCES : choix du film en affiches, choix de la date en jours + heure ===================== */
    var schedPick = null, schedDay = 0, schedH = 20, schedM = 0, fpSearch = '', fpBatch = 24, pendingTitle = '';
    var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var NO_POSTER = 'assets/cinema/tropistream-serveur.png';
    function fpFiltered() {
      var q = fpSearch.trim().toLowerCase();
      return (playlist || []).filter(function (f) { return !q || (f.nom + ' ' + (f.annee || '') + ' ' + (f.genres || []).join(' ')).toLowerCase().indexOf(q) !== -1; });
    }
    function renderFpButton() {
      if (!consoleEl) return;
      var b = consoleEl.querySelector('.cin-fp-btn'); if (!b) return;
      var f = schedPick && playlist && playlist.find(function (x) { return String(x.id) === String(schedPick.id); });
      b.innerHTML = f
        ? '<img src="' + escapeHtml(f.poster || NO_POSTER) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_POSTER + '\'"><span class="cin-fp-sel"><b>' + escapeHtml(f.titre) + '</b><small>' + (f.annee ? f.annee + ' · ' : '') + schedPick.ver + '</small></span><i class="fa-solid fa-chevron-down"></i>'
        : '<span class="cin-fp-ph"><i class="fa-solid fa-film"></i></span><span class="cin-fp-sel"><b>Choisis un film</b><small>Touche pour voir les affiches</small></span><i class="fa-solid fa-chevron-down"></i>';
    }
    function renderFilmPicker() {
      if (!consoleEl) return;
      var grid = consoleEl.querySelector('.cin-fp-grid'); if (!grid) return;
      if (!playlist) { grid.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des affiches…</div>'; return; }
      var list = fpFiltered();
      if (!list.length) { grid.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-magnifying-glass"></i> Aucun film trouvé.</div>'; return; }
      grid.innerHTML = list.slice(0, fpBatch).map(function (f) {
        var sel = schedPick && String(schedPick.id) === String(f.id);
        return '<div class="cin-fp-card' + (sel ? ' sel' : '') + '"><img loading="lazy" src="' + escapeHtml(f.poster || NO_POSTER) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_POSTER + '\'">' +
          '<div class="cin-fp-t" title="' + escapeHtml(f.nom) + '">' + escapeHtml(f.titre) + (f.annee ? ' <small>(' + f.annee + ')</small>' : '') + '</div>' +
          '<div class="cin-fp-v">' + (f.vf ? '<button data-a="fp-pick" data-id="' + f.id + '" data-ver="VF"' + (sel && schedPick.ver === 'VF' ? ' class="on"' : '') + '>VF</button>' : '') + (f.vo ? '<button data-a="fp-pick" data-id="' + f.id + '" data-ver="VO"' + (sel && schedPick.ver === 'VO' ? ' class="on"' : '') + '>VO</button>' : '') + '</div></div>';
      }).join('');
    }
    function populateScheduleSelect() { renderFilmPicker(); renderFpButton(); }
    function schedAt() {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + schedDay); d.setHours(schedH, schedM, 0, 0);
      return d.getTime();
    }
    function renderDatePicker() {
      if (!consoleEl) return;
      var el = consoleEl.querySelector('.cin-dp'); if (!el) return;
      var base = new Date(); base.setHours(0, 0, 0, 0);
      var days = '';
      for (var i = 0; i < 14; i++) {
        var d = new Date(base.getTime()); d.setDate(d.getDate() + i);
        days += '<button class="cin-dp-day' + (i === schedDay ? ' sel' : '') + '" data-a="dp-day" data-i="' + i + '"><small>' + (i === 0 ? 'auj.' : JOURS[d.getDay()]) + '</small><b>' + d.getDate() + '</b><small>' + MOIS[d.getMonth()] + '</small></button>';
      }
      var two = function (n) { return ('0' + n).slice(-2); };
      var chips = ['18:00', '19:00', '20:00', '20:30', '21:00', '22:00'].map(function (t) {
        return '<button class="cin-dp-chip' + (t === two(schedH) + ':' + two(schedM) ? ' sel' : '') + '" data-a="dp-t" data-t="' + t + '">' + t + '</button>';
      }).join('');
      var at = schedAt(), past = at <= Date.now(), dd = new Date(at);
      var when = (schedDay === 0 ? 'Aujourd\'hui' : schedDay === 1 ? 'Demain' : JOURS[dd.getDay()] + ' ' + dd.getDate() + ' ' + MOIS[dd.getMonth()]) + ' à ' + two(schedH) + ':' + two(schedM);
      el.innerHTML = '<div class="cin-dp-days">' + days + '</div>' +
        '<div class="cin-dp-time"><div class="cin-dp-step"><button data-a="dp-h" data-d="1"><i class="fa-solid fa-chevron-up"></i></button><b>' + two(schedH) + '</b><button data-a="dp-h" data-d="-1"><i class="fa-solid fa-chevron-down"></i></button></div><span class="cin-dp-sep">:</span>' +
        '<div class="cin-dp-step"><button data-a="dp-m" data-d="5"><i class="fa-solid fa-chevron-up"></i></button><b>' + two(schedM) + '</b><button data-a="dp-m" data-d="-5"><i class="fa-solid fa-chevron-down"></i></button></div>' +
        '<div class="cin-dp-chips">' + chips + '</div></div>' +
        '<div class="cin-dp-sum' + (past ? ' bad' : '') + '"><i class="fa-regular fa-calendar"></i> ' + when + (past ? ' · choisis une heure à venir' : '') + '</div>';
    }
    function fmtSchedDate(ts) {
      var d = new Date(ts), now = new Date(), sameDay = d.toDateString() === now.toDateString();
      var h = fmtHeure(d), jr = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
      return (sameDay ? 'Aujourd\'hui' : jr) + ' à ' + h;
    }
    function renderSchedule() {
      if (!consoleEl) return;
      var listEl = consoleEl.querySelector('.cin-sch-list');
      if (!listEl) return;
      var items = (net.schedule || []).slice().sort(function (a, b) { return a.at - b.at; });
      if (!items.length) { listEl.innerHTML = '<div class="cin-pl-empty"><i class="fa-solid fa-calendar"></i> Aucune séance programmée.</div>'; return; }
      listEl.innerHTML = items.map(function (it) {
        return '<div class="cin-sch-item"><img class="cin-sch-img" src="' + escapeHtml(it.poster || NO_POSTER) + '" alt="" onerror="this.onerror=null;this.src=\'' + NO_POSTER + '\'">' +
          '<div class="cin-sch-info"><div class="cin-sch-title">' + escapeHtml(it.title) + '</div><div class="cin-sch-when"><i class="fa-regular fa-clock"></i> ' + fmtSchedDate(it.at) + '</div></div>' +
          '<button class="cin-sch-del" data-a="sched-remove" data-id="' + escapeHtml(it.id) + '" title="Retirer"><i class="fa-solid fa-trash"></i></button>' +
        '</div>';
      }).join('');
    }
    function addSchedule() {
      if (!consoleEl) return;
      if (!schedPick) { world.flash('🗓️ Choisis un film.'); return; }
      var at = schedAt();
      if (!isFinite(at) || at <= Date.now()) { world.flash('🗓️ Choisis une date dans le futur.'); return; }
      var id = schedPick.id, ver = schedPick.ver;
      var f = playlist && playlist.find(function (x) { return String(x.id) === String(id); });
      if (!f) return;
      var targetUrl = (ver === 'VO' && f.vo) ? f.vo : (f.vf || f.url);
      cinemaAction('schedule-add', { title: f.nom + ' [' + ver + ']', url: targetUrl, type: /\.m3u8(\?|#|$)/i.test(targetUrl) ? 'hls' : 'mp4', poster: f.poster || '', at: at }).then(function (r) {
        if (r && r.ok) { world.flash('🗓️ Séance programmée', f.titre + ' · ' + fmtSchedDate(at)); schedPick = null; renderFpButton(); renderFilmPicker(); }
      });
    }

    function setTab(tab) {
      if (!consoleEl) return;
      consoleEl.querySelectorAll('.cin-tab-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      var panePl = consoleEl.querySelector('.cin-pane-playlist');
      var paneDir = consoleEl.querySelector('.cin-pane-direct');
      var paneSch = consoleEl.querySelector('.cin-pane-schedule');
      if (panePl) panePl.classList.toggle('hid', tab !== 'playlist');
      if (paneDir) paneDir.classList.toggle('hid', tab !== 'direct');
      if (paneSch) { paneSch.classList.toggle('hid', tab !== 'schedule'); if (tab === 'schedule') { renderSchedule(); renderDatePicker(); populateScheduleSelect(); } }
    }

    function mountConsole() {
      if (consoleEl || !isCinemaCtrl()) return;
      var nw = new Date(); schedDay = 0; schedH = nw.getHours() + 1; schedM = 0; if (schedH >= 24) { schedDay = 1; schedH = 20; }
      consoleEl = document.createElement('div'); consoleEl.className = 'cin-console hid';
      consoleEl.innerHTML =
        '<button class="cin-cn-x" data-a="close" title="Fermer"><i class="fa-solid fa-xmark"></i></button>' +
        '<div class="cin-cn-head">' +
          '<div class="cin-cn-t"><i class="fa-solid fa-sliders"></i> Régie du cinéma</div>' +
          '<div class="cin-cn-badge"><img class="cin-cn-logo" src="assets/cinema/tropistream-serveur.png" alt=""> Tropi Stream</div>' +
        '</div>' +
        '<div class="cin-cn-playback">' +
          '<div class="cin-np">' +
            '<div class="cin-np-poster"><img class="cin-np-img" data-r="img" alt=""><div class="cin-np-ph"><i class="fa-solid fa-film"></i></div></div>' +
            '<div class="cin-np-body">' +
              '<div class="cin-np-badge" data-r="badge"></div>' +
              '<div class="cin-np-title" data-r="title"></div>' +
              '<div class="cin-np-meta" data-r="meta"></div>' +
              '<div class="cin-np-bar"><i data-r="bar"></i></div>' +
              '<div class="cin-np-time"><span data-r="t1"></span><span data-r="t2"></span></div>' +
            '</div>' +
          '</div>' +
          '<div class="cin-cn-row">' +
            '<button data-a="play" class="btn-play" title="Lancer la séance"><i class="fa-solid fa-play"></i> Lancer</button>' +
            '<button data-a="pause" class="btn-pause" title="Mettre en pause"><i class="fa-solid fa-pause"></i> Pause</button>' +
            '<button data-a="stop" class="btn-stop" title="Couper la séance"><i class="fa-solid fa-stop"></i> Couper</button>' +
          '</div>' +
        '</div>' +
        '<div class="cin-cn-tabs">' +
          '<button class="cin-tab-btn active" data-tab="playlist"><i class="fa-solid fa-film"></i> Playlist</button>' +
          '<button class="cin-tab-btn" data-tab="direct"><i class="fa-solid fa-link"></i> Lien direct</button>' +
          '<button class="cin-tab-btn" data-tab="schedule"><i class="fa-solid fa-calendar-days"></i> Séances</button>' +
        '</div>' +
        '<div class="cin-pane cin-pane-playlist">' +
          '<div class="cin-pl-bar">' +
            '<div class="cin-pl-search-wrap">' +
              '<i class="fa-solid fa-magnifying-glass cin-pl-icon"></i>' +
              '<input class="cin-pl-search" type="text" placeholder="Rechercher par titre, année, genre..." maxlength="100">' +
              '<button class="cin-pl-clear hid" data-a="clear-search" title="Effacer"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="cin-pl-genres" data-a="genres"></div>' +
          '<div class="cin-pl-subbar">' +
            '<span class="cin-pl-count">Chargement…</span>' +
            '<span class="cin-pl-hint"><i class="fa-solid fa-bolt"></i> Fsvid &amp; Vidzy</span>' +
          '</div>' +
          '<div class="cin-pl-list"></div>' +
        '</div>' +
        '<div class="cin-pane cin-pane-direct hid">' +
          '<div class="cin-direct-desc">Colle directement l\'adresse d\'un flux (.mp4, .m3u8) ou la page d\'un lecteur (Fsvid, Vidzy, Uqload).</div>' +
          '<input class="cin-cn-url" type="text" placeholder="https://fsvid.lol/embed-... ou https://vidzy.cc/..." maxlength="500">' +
          '<div class="cin-cn-row"><button class="cin-btn-load" data-a="load"><i class="fa-solid fa-link"></i> Charger ce lien</button></div>' +
          '<div class="cin-cn-help">L\'extraction du flux depuis Fsvid, Vidzy ou Uqload est automatique via Tropi Stream.</div>' +
        '</div>' +
        '<div class="cin-pane cin-pane-schedule hid">' +
          '<div class="cin-direct-desc">Programme une prochaine séance : elle s\'affichera sur le panneau « À l\'affiche » à l\'entrée du cinéma.</div>' +
          '<div class="cin-lbl">1 · Le film</div>' +
          '<button class="cin-fp-btn" data-a="fp-toggle"></button>' +
          '<div class="cin-fp-pop hid"><div class="cin-pl-search-wrap"><i class="fa-solid fa-magnifying-glass cin-pl-icon"></i><input class="cin-fp-search" type="text" placeholder="Rechercher un film..." maxlength="100"></div><div class="cin-fp-grid"></div></div>' +
          '<div class="cin-lbl">2 · Le jour et l\'heure</div>' +
          '<div class="cin-dp"></div>' +
          '<div class="cin-cn-row"><button class="cin-btn-load" data-a="sched-add"><i class="fa-solid fa-calendar-plus"></i> Programmer la séance</button></div>' +
          '<div class="cin-lbl">Séances programmées</div>' +
          '<div class="cin-sch-list"></div>' +
        '</div>';

      consoleEl.addEventListener('click', function (e) {
        var tabBtn = e.target && e.target.closest ? e.target.closest('.cin-tab-btn') : null;
        if (tabBtn) {
          setTab(tabBtn.getAttribute('data-tab'));
          return;
        }

        var genrePill = e.target && e.target.closest ? e.target.closest('.cin-genre-pill') : null;
        if (genrePill) {
          plGenre = genrePill.getAttribute('data-g');
          consoleEl.querySelectorAll('.cin-genre-pill').forEach(function (p) {
            p.classList.toggle('active', p === genrePill);
          });
          filterPlaylist();
          renderPlaylistItems(false);
          return;
        }

        var b = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
        if (!b || b.disabled) return;
        var a = b.getAttribute('data-a');
        if (a === 'close') { closeConsole(); return; }
        if (a === 'clear-search') {
          var input = consoleEl.querySelector('.cin-pl-search');
          if (input) { input.value = ''; input.focus(); }
          b.classList.add('hid');
          plSearch = '';
          filterPlaylist();
          renderPlaylistItems(false);
          return;
        }
        if (a === 'pick') {
          var fid = b.getAttribute('data-id');
          var ver = b.getAttribute('data-ver') || 'VF';
          pickFilm(fid, ver);
          return;
        }
        if (a === 'load') {
          var u = consoleEl.querySelector('.cin-cn-url').value.trim();
          if (!u) return;
          if (looksLikeEmbedPage(u)) world.flash('🎬 Extraction du flux…', 'Ça peut prendre quelques secondes.');
          cinemaAction('set', { url: u });
          return;
        }
        if (a === 'play' || a === 'pause' || a === 'stop') { cinemaAction(a); return; }
        if (a === 'fp-toggle') { consoleEl.querySelector('.cin-fp-pop').classList.toggle('hid'); renderFilmPicker(); return; }
        if (a === 'fp-pick') { schedPick = { id: b.getAttribute('data-id'), ver: b.getAttribute('data-ver') || 'VF' }; consoleEl.querySelector('.cin-fp-pop').classList.add('hid'); renderFpButton(); return; }
        if (a === 'dp-day') { schedDay = parseInt(b.getAttribute('data-i'), 10) || 0; renderDatePicker(); return; }
        if (a === 'dp-h') { schedH = (schedH + parseInt(b.getAttribute('data-d'), 10) + 24) % 24; renderDatePicker(); return; }
        if (a === 'dp-m') { schedM = (schedM + parseInt(b.getAttribute('data-d'), 10) + 60) % 60; renderDatePicker(); return; }
        if (a === 'dp-t') { var tt = (b.getAttribute('data-t') || '20:00').split(':'); schedH = parseInt(tt[0], 10); schedM = parseInt(tt[1], 10); renderDatePicker(); return; }
        if (a === 'sched-add') { addSchedule(); return; }
        if (a === 'sched-remove') {
          var sid = b.getAttribute('data-id');
          cinemaAction('schedule-remove', { id: sid }).then(function (r) { if (r && r.ok) renderSchedule(); });
        }
      });

      var searchTimeout = null;
      var searchInput = consoleEl.querySelector('.cin-pl-search');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          var val = this.value;
          var clearBtn = consoleEl.querySelector('[data-a="clear-search"]');
          if (clearBtn) clearBtn.classList.toggle('hid', !val);
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(function () {
            plSearch = val;
            filterPlaylist();
            renderPlaylistItems(false);
          }, 150);
        });
      }
      var fpSearchEl = consoleEl.querySelector('.cin-fp-search');
      if (fpSearchEl) fpSearchEl.addEventListener('input', function () { fpSearch = this.value; fpBatch = 24; renderFilmPicker(); });
      var fpGrid = consoleEl.querySelector('.cin-fp-grid');
      if (fpGrid) fpGrid.addEventListener('scroll', function () {
        if (this.scrollTop + this.clientHeight >= this.scrollHeight - 80 && fpBatch < fpFiltered().length) { var st0 = this.scrollTop; fpBatch += 24; renderFilmPicker(); this.scrollTop = st0; }
      });

      var listEl = consoleEl.querySelector('.cin-pl-list');
      if (listEl) {
        listEl.addEventListener('scroll', function () {
          if (this.scrollTop + this.clientHeight >= this.scrollHeight - 60) {
            if (plBatch < plFiltered.length) {
              plBatch += 30;
              renderPlaylistItems(true);
            }
          }
        });
      }

      consoleEl.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });   // la molette fait défiler la régie, pas les cases de l'inventaire
      world.container.appendChild(consoleEl);
      renderFpButton(); renderDatePicker();
      if (playlist) { filterPlaylist(); renderPlaylistGenres(); renderPlaylistItems(false); renderFilmPicker(); }   // déjà chargée (à l'entrée du cinéma) : on affiche la liste tout de suite, sans attendre une recherche
      else loadPlaylist();
    }

    function unmountConsole() {
      if (consoleEl && consoleEl.parentNode) consoleEl.parentNode.removeChild(consoleEl);
      consoleEl = null;
    }

    // à la fermeture de la régie, la souris redisparaît et reprend la vue (comme un clic l'aurait fait) ; refusé sans
    // geste de l'utilisateur, un clic sur la salle la reprendra alors
    function relockMouse() {
      if (!world.full || !world.dom || !world.dom.requestPointerLock || document.pointerLockElement === world.dom) return;
      try { var lock = world.dom.requestPointerLock(); if (lock && lock.catch) lock.catch(function () { /* refusé */ }); } catch (e) { /* ok */ }
    }
    function closeConsole() {
      if (!consoleEl || consoleEl.classList.contains('hid')) return;
      consoleEl.classList.add('hid'); relockMouse();
    }

    function toggleConsole() {
      mountConsole();
      if (!consoleEl) return;
      if (!consoleEl.classList.contains('hid')) { closeConsole(); return; }
      consoleEl.classList.remove('hid');
      consoleEl.querySelector('.cin-cn-url').value = net.url || '';
      if (playlist) { filterPlaylist(); renderPlaylistGenres(); renderPlaylistItems(false); renderFilmPicker(); } else loadPlaylist();
      refreshConsole();
      renderSchedule();
    }

    // la carte « en cours » : écriture seulement si la valeur change (la régie est rafraîchie à chaque image, les boutons ne doivent pas être refaits)
    function setR(root, name, html) { var el = root.querySelector('[data-r="' + name + '"]'); if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } return el; }
    function refreshConsole() {
      if (!consoleEl || consoleEl.classList.contains('hid')) return;
      var playing = net.status === 'playing', paused = net.status === 'paused', has = !!net.url, active = playing || paused;
      var f = filmOfTitle(net.title), ver = verOfTitle(net.title);
      var badgeCls, badgeHtml, title, meta;
      if (pendingTitle) { badgeCls = 'pending'; badgeHtml = '<i class="fa-solid fa-spinner fa-spin"></i> Préparation du flux…'; title = pendingTitle.replace(/\s*\[(VF|VO)\]\s*$/, ''); meta = 'Extraction via Tropi Stream, ça peut prendre quelques secondes'; f = filmOfTitle(pendingTitle); ver = verOfTitle(pendingTitle); }
      else if (playing) { badgeCls = 'playing'; badgeHtml = '<i class="fa-solid fa-circle-play"></i> En cours'; }
      else if (paused) { badgeCls = 'paused'; badgeHtml = '<i class="fa-solid fa-circle-pause"></i> En pause'; }
      else if (has && net.title) { badgeCls = 'ready'; badgeHtml = '<i class="fa-solid fa-circle-check"></i> Film chargé, prêt à lancer'; }
      else { badgeCls = 'idle'; badgeHtml = '<i class="fa-solid fa-circle-stop"></i> Aucune séance en cours'; }
      if (!pendingTitle) {
        title = net.title ? net.title.replace(/\s*\[(VF|VO)\]\s*$/, '') : (has && active ? 'Lien personnalisé' : 'Aucune séance en cours');
        meta = (f ? ((f.genres || []).slice(0, 2).join(' · ')) : '') || (net.title || active ? '' : 'Choisis un film dans la playlist');
      }
      var cn = consoleEl.querySelector('.cin-np'); cn.className = 'cin-np ' + badgeCls;
      setR(consoleEl, 'badge', badgeHtml);
      setR(consoleEl, 'title', escapeHtml(title) + (f && f.annee ? ' <small>(' + f.annee + ')</small>' : '') + (ver ? ' <em>' + ver + '</em>' : ''));
      setR(consoleEl, 'meta', escapeHtml(meta));
      var img = consoleEl.querySelector('[data-r="img"]'), src = (net.title || pendingTitle) && f ? (f.poster || NO_POSTER) : (net.title || pendingTitle ? NO_POSTER : '');
      if (img.__s !== src) { img.__s = src; if (src) { img.src = src; img.style.display = ''; } else { img.removeAttribute('src'); img.style.display = 'none'; } }
      var dur = video.duration, pos = playing ? netPosNow() : net.position, pct = active && isFinite(dur) && dur > 0 ? clamp(pos / dur * 100, 0, 100) : 0;
      var bar = consoleEl.querySelector('[data-r="bar"]'), w = pct.toFixed(1) + '%'; if (bar.__w !== w) { bar.__w = w; bar.style.width = w; }
      setR(consoleEl, 't1', active ? fmtT(pos) : '');
      setR(consoleEl, 't2', active && isFinite(dur) && dur > 0 ? '-' + fmtT(dur - pos) + ' · ' + fmtT(dur) : '');
      var bp = consoleEl.querySelector('.btn-play'), bpa = consoleEl.querySelector('.btn-pause'), bs = consoleEl.querySelector('.btn-stop');
      bp.disabled = !has || playing || !!pendingTitle; bpa.disabled = !playing; bs.disabled = !active;
      var pl = paused ? 'Reprendre' : 'Lancer'; if (bp.__l !== pl) { bp.__l = pl; bp.innerHTML = '<i class="fa-solid fa-play"></i> ' + pl; }
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
    }
    function sit(w, s) {
      if (cur || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (taken(s)) { w.flash('Ce fauteuil est occupé.'); return; }
      w.sitDown(room); cur = seat_.cur = s; view.yaw = view.pitch = 0;
      if (w.container) w.container.classList.add('cin-seated');
      standEl = document.createElement('div'); standEl.className = 'cin-stand';
      standEl.innerHTML = '<button data-a="stand">🪑 Se lever <kbd>Échap</kbd></button>';
      standEl.addEventListener('click', function (e) { var a = e.target && e.target.closest ? e.target.closest('button') : null; if (!a) return; if (a.getAttribute('data-a') === 'stand') stand(); });
      w.container.appendChild(standEl); standEl.classList.toggle('hid', hudHidden);
      window.addEventListener('keydown', onSeatKey, true);
      if (net.status === 'idle' && isCinemaCtrl()) w.flash('🎬 Bonne séance !', 'Lance le film depuis la régie.');
    }
    function stand() {
      if (!cur) return;
      var s = cur; cur = seat_.cur = null;
      if (world.container) world.container.classList.remove('cin-seated');
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
    // caméra : à hauteur des yeux d'une personne assise, tournée vers le milieu de l'écran ; on regarde autour à la souris
    room.seatPose = function (dt, ctx) {
      if (!cur) return null;
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.3; }
      var ex = cur.x, ey = 1.34 + (cur.y || 0), ez = cur.z - 0.04, ty0 = SCR_Y + SCR_H * 0.48, tz0 = -HZ + 0.16;
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
      seanceAsked = false;
      music.start(); mountEye();
      if (world.container) world.container.classList.add('cin-in-cinema');
      window.addEventListener('pointerdown', kickMusic, true); window.addEventListener('keydown', kickMusic, true);   // le navigateur peut exiger un geste avant le son
      window.addEventListener('keydown', onKeyL, true);
      pollCinema();
    };
    function leave() {
      stand(); try { video.pause(); } catch (e) { /* ok */ }   // on ne coupe que chez soi : la séance continue pour les autres
      music.stop(); unmountEye(); unmountConsole();
      if (world.container) world.container.classList.remove('cin-in-cinema', 'cin-seated');
      window.removeEventListener('pointerdown', kickMusic, true); window.removeEventListener('keydown', kickMusic, true);
      window.removeEventListener('keydown', onKeyL, true);
      if (bufEl && bufEl.parentNode) bufEl.parentNode.removeChild(bufEl); bufEl = null;
      clearTimeout(seanceCardT); if (seanceCardEl && seanceCardEl.parentNode) seanceCardEl.parentNode.removeChild(seanceCardEl); seanceCardEl = null;
    }
    room.onLeave = leave;
    room.onPause = function () { video.pause(); music.stop(); unmountEye(); if (world.container) world.container.classList.remove('cin-in-cinema'); window.removeEventListener('keydown', onKeyL, true); };
    room.onPageHide = function () { video.pause(); };
    room.onResume = function () { if (world.room === room) { music.start(); mountEye(); if (world.container) world.container.classList.add('cin-in-cinema'); window.addEventListener('keydown', onKeyL, true); pollCinema(); } };

    var clock = 0, netT = 0, remotesHid = false;
    room.update = function (dt, w) {
      clock += dt;
      netT += dt; if (netT > 1.0) { netT = 0; pollCinema(); } else if (consoleEl && !consoleEl.classList.contains('hid')) refreshConsole();
      if (net.status === 'playing') {   // chargement : seulement si le film manque de données depuis plus d'une seconde
        stallT = (video.readyState < 3 || video.seeking) ? stallT + dt : 0;
        setLoading(!started && stallT > 1.0);          // écran « chargement » seulement avant le début du film ; ensuite l'image reste figée le temps de recharger
        if (!stallT && screenM.map !== vtex && video.readyState >= 3) showVideo(true);
        var showBuf = started && stallT > 2.5;           // coupure en plein film : petit témoin discret au lieu de remplacer l'écran
        if (showBuf && !bufEl) { bufEl = document.createElement('div'); bufEl.className = 'cin-buffer'; bufEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mise en mémoire…'; w.container.appendChild(bufEl); }
        if (bufEl) bufEl.style.display = showBuf ? '' : 'none';
      }
      Object.keys(w.remote).forEach(function (k) { var r = w.remote[k]; if (r && r.person && r.person.tag) r.person.tag.visible = !hudHidden; });   // interface masquée : plus de pseudos au-dessus des joueurs
      if (cur || remotesHid) {   // assis : on masque les autres joueurs (têtes, pseudos) qui gêneraient la vue de l'écran
        Object.keys(w.remote).forEach(function (k) { var r = w.remote[k]; if (r && r.person && r.person.group) r.person.group.visible = !cur; });
        remotesHid = !!cur;
      }
      if (loadingActive) {   // rond qui tourne tant que le flux met en mémoire tampon
        loadingAngle += dt * 4; loadingPaintT += dt;
        if (loadingPaintT > 0.08) { loadingPaintT = 0; paintLoading(loadingAngle); }
      }
      var playing = net.status === 'playing';
      // lumières : on baisse pendant le film, on rallume sinon
      dim += ((playing ? 0.02 : 1) - dim) * Math.min(1, dt * 1.2);     // noir complet pendant le film
      glowM.opacity = 0.1 + 0.9 * dim; shadeM.color.setRGB(dim * 0.9 + 0.1, (dim * 0.9 + 0.1) * 0.85, (dim * 0.9 + 0.1) * 0.63);
      var dv = dim;                // dans la grande salle on garde un peu de lumière pendant le film : on voit les murs dorés et les fauteuils
      amb.intensity = (P ? 0.5 : 0.95) * dv; key.intensity = (P ? 0.2 : 0.3) * dv;
      lights.forEach(function (l) { l.intensity = (P ? 0.3 : 0.55) * dv; });
      wash.intensity = playing ? 0.5 : 0;
      lampGlow.forEach(function (s, i) { s.scale.setScalar(1.8 + Math.sin(clock * 3 + i) * 0.06); });
      // musique : elle se tait pendant le film (qui a son propre son)
      music.setLevel(playing ? 0 : 1);
      // son du film en 3D : plus fort et net près de l'écran, panoramique vers le côté où tu es, étouffé loin derrière
      if (playing || net.status === 'paused') {
        var sdist = Math.hypot(w.player.x, w.player.z + HZ), svol = clamp(1.15 - sdist / 26, 0.35, 1);
        if (vAudio.ok) {
          var t = vAudio.ctx.currentTime;
          vAudio.gain.gain.setTargetAtTime(svol, t, 0.2);
          if (vAudio.pan) vAudio.pan.pan.setTargetAtTime(clamp(w.player.x / 9, -1, 1), t, 0.25);
          vAudio.lp.frequency.setTargetAtTime(clamp(17000 - sdist * 420, 700, 17000), t, 0.3);
        } else video.volume = svol;
      }
    };
    room.dispose = function () { leave(); if (hlsInst) { try { hlsInst.destroy(); } catch (e) { /* ok */ } hlsInst = null; } if (vAudio.ctx) { try { vAudio.ctx.close(); } catch (e) { /* ok */ } } video.removeAttribute('src'); video.load(); vtex.dispose(); posterTex.dispose(); };
    return room;
  }

  function injectCss() {
    if (document.getElementById('cin-css')) return;
    var st = document.createElement('style'); st.id = 'cin-css';
    st.textContent =
      /* Général : le curseur normal du site, caché quand on est assis ou interface masquée (bouton œil ou touche L) */
      '.cin-in-cinema.cin-seated,.cin-in-cinema.cin-seated *,.cin-in-cinema.cin-hud-hidden *{cursor:none!important}' +   // partout, boutons compris : la souris pilote la vue, elle ne doit jamais apparaître
      '.cin-in-cinema.cin-seated.s3d-ui-open *,.cin-in-cinema.cin-hud-hidden.s3d-ui-open *,.cin-in-cinema .cin-console,.cin-in-cinema .cin-console *{cursor:auto!important}.cin-in-cinema .cin-console button,.cin-in-cinema .cin-console [data-a]{cursor:pointer!important}' +
      '.cin-hud-hidden .cin-seance,.cin-hud-hidden .cin-stand{display:none!important}' +
      '.cin-in-cinema.cin-hud-hidden,.cin-in-cinema.cin-hud-hidden canvas,.cin-in-cinema.cin-hud-hidden .s3d-hud{cursor:none!important}' +
      '.cin-in-cinema.cin-hud-hidden.s3d-ui-open,.cin-in-cinema.cin-hud-hidden.s3d-ui-open canvas,.cin-in-cinema.cin-hud-hidden.s3d-ui-open .s3d-hud{cursor:auto!important}' +   // inventaire (I), téléphone ou pause ouverts : curseur visible même interface masquée
      '.cin-title-logo{display:inline-block;width:.95em;height:.95em;margin-right:.3em;vertical-align:-.12em;border-radius:50%;object-fit:cover;border:.05em solid rgba(255,122,26,.8)}' +
      /* Séance en cours (à l'entrée) */
      '.cin-seance{position:fixed;left:50%;top:70px;transform:translateX(-50%) translateY(-10px);z-index:8;display:flex;gap:12px;align-items:center;background:rgba(8,5,12,.92);border:1.5px solid rgba(201,162,39,.65);border-radius:16px;padding:10px 18px 10px 10px;box-shadow:0 8px 30px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .35s,transform .35s}' +
      '.cin-seance.on{opacity:1;transform:translateX(-50%) translateY(0)}.cin-seance.out{opacity:0;transform:translateX(-50%) translateY(-10px)}' +
      '.cin-seance img{width:64px;height:90px;object-fit:cover;border-radius:9px;border:1px solid rgba(201,162,39,.5);flex:none}' +
      '.cin-seance-badge{font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#ff9a4a;text-transform:uppercase}' +
      '.cin-seance-title{font-family:' + SERIF + ';font-weight:800;font-size:16px;color:#f4e3b0;max-width:320px}' +
      '.cin-seance-h{font-family:' + MONO + ';font-size:11.5px;color:#9d8a53;margin-top:2px}' +
      '.s3d-hud.cin-nohud>*:not(.s3d-fade){display:none!important}.cin-stand.hid{display:none}.hid{display:none!important}' +
      /* Bouton œil */
      '.cin-eye{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:7;cursor:pointer;font-family:inherit;font-weight:800;font-size:12px;color:#fff;background:rgba(8,5,12,.7);border:1px solid rgba(255,122,26,.6);border-radius:999px;padding:7px 14px;opacity:.55;transition:opacity .2s}.cin-eye:hover{opacity:1}.cin-eye kbd{opacity:.65;font-size:10px;margin-left:5px}' +
      /* Bouton se lever */
      '.cin-stand{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6;display:flex;gap:8px}' +
      '.cin-stand button{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1.5px solid #ff7a1a;border-radius:12px;font-family:inherit;font-weight:800;font-size:13px;padding:10px 16px}.cin-stand kbd{opacity:.6;font-size:11px;margin-left:6px}' +
      /* Console régie — conteneur principal */
      '.cin-console{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99;width:440px;max-width:96vw;max-height:88vh;background:rgba(6,3,10,.97);border:1.5px solid rgba(201,162,39,.7);border-radius:20px;display:flex;flex-direction:column;color:#f4e3b0;pointer-events:auto;overflow:hidden;box-shadow:0 8px 48px rgba(0,0,0,.75),0 0 0 1px rgba(201,162,39,.12)}' +
      '.cin-console.hid{display:none}' +
      /* En-tête */
      '.cin-cn-head{display:flex;align-items:center;justify-content:space-between;padding:14px 40px 10px 16px;border-bottom:1px solid rgba(201,162,39,.18);flex-shrink:0}' +
      '.cin-cn-t{font-weight:900;font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:#e9c66b;display:flex;align-items:center;gap:8px}' +
      '.cin-cn-badge{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#b8a05a;letter-spacing:.04em;opacity:.85}' +
      '.cin-cn-logo{width:18px;height:18px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,122,26,.5)}' +
      '.cin-cn-x{position:absolute;top:10px;right:12px;background:none;border:none;color:#d9c88f;cursor:pointer;font-size:15px;padding:4px 6px;border-radius:6px;opacity:.7;transition:opacity .15s}.cin-cn-x:hover{opacity:1}' +
      /* Bloc lecture */
      '.cin-cn-playback{padding:10px 14px 8px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}' +
      '.cin-cn-st{font-size:11.5px;min-height:20px;display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:8px}' +
      '.cin-st-badge{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:2px 7px;font-size:10.5px;font-weight:800;letter-spacing:.03em}' +
      '.cin-st-badge.playing{background:rgba(34,197,94,.18);color:#4ade80;border:1px solid rgba(34,197,94,.3)}' +
      '.cin-st-badge.paused{background:rgba(250,200,80,.15);color:#facc15;border:1px solid rgba(250,200,80,.3)}' +
      '.cin-st-badge.ready{background:rgba(99,102,241,.18);color:#a5b4fc;border:1px solid rgba(99,102,241,.3)}' +
      '.cin-st-badge.idle{background:rgba(255,255,255,.06);color:#9d8a53;border:1px solid rgba(255,255,255,.12)}' +
      '.cin-st-title{color:#e9c66b;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}' +
      '.cin-st-time{color:#9d8a53;font-size:10.5px;font-variant-numeric:tabular-nums}' +
      '.cin-st-help{color:#9d8a53;font-size:11px}' +
      '.cin-cn-row{display:flex;gap:6px}' +
      '.cin-cn-row button{flex:1;cursor:pointer;font-family:inherit;font-weight:800;font-size:11.5px;border-radius:9px;padding:8px 6px;border:1px solid rgba(255,122,26,.5);background:#2a1208;color:#fff;transition:background .15s}' +
      '.cin-cn-row button.btn-play{background:rgba(34,197,94,.2);border-color:rgba(34,197,94,.4);color:#4ade80}.cin-cn-row button.btn-play:hover{background:rgba(34,197,94,.35)}' +
      '.cin-cn-row button.btn-pause{background:rgba(250,200,80,.12);border-color:rgba(250,200,80,.3);color:#facc15}.cin-cn-row button.btn-pause:hover{background:rgba(250,200,80,.25)}' +
      '.cin-cn-row button.btn-stop{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.35);color:#f87171}.cin-cn-row button.btn-stop:hover{background:rgba(239,68,68,.28)}' +
      /* Tabs */
      '.cin-cn-tabs{display:flex;gap:0;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.07)}' +
      '.cin-tab-btn{flex:1;cursor:pointer;font-family:inherit;font-weight:700;font-size:11.5px;border:none;border-bottom:2px solid transparent;background:transparent;color:#9d8a53;padding:9px 8px 8px;transition:color .15s,border-color .15s;letter-spacing:.02em}' +
      '.cin-tab-btn:hover{color:#e9c66b}.cin-tab-btn.active{color:#e9c66b;border-bottom-color:#c9a227}' +
      /* Pane partagé */
      '.cin-pane{display:flex;flex-direction:column;overflow:hidden;min-height:0}' +
      /* Pane playlist */
      '.cin-pane-playlist{flex:1;min-height:0}' +
      '.cin-pl-bar{padding:10px 12px 6px;flex-shrink:0}' +
      '.cin-pl-search-wrap{position:relative;display:flex;align-items:center}' +
      '.cin-pl-icon{position:absolute;left:9px;color:#9d8a53;font-size:12px;pointer-events:none}' +
      '.cin-pl-search{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 32px 8px 30px;color:#fff3e0;font-family:inherit;font-size:12.5px;outline:none;transition:border-color .15s}' +
      '.cin-pl-search::placeholder{color:#5a4d38}.cin-pl-search:focus{border-color:rgba(201,162,39,.5)}' +
      '.cin-pl-clear{position:absolute;right:7px;background:none;border:none;color:#9d8a53;cursor:pointer;font-size:12px;padding:4px;border-radius:4px}.cin-pl-clear:hover{color:#e9c66b}' +
      '.cin-pl-genres{display:flex;flex-wrap:wrap;gap:4px;padding:0 12px 6px;flex-shrink:0}' +
      '.cin-genre-pill{cursor:pointer;font-family:inherit;font-size:10.5px;font-weight:700;border-radius:20px;padding:3px 9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#9d8a53;transition:all .15s}' +
      '.cin-genre-pill:hover{color:#f4e3b0;border-color:rgba(201,162,39,.4)}.cin-genre-pill.active{background:rgba(201,162,39,.2);border-color:rgba(201,162,39,.55);color:#e9c66b}' +
      '.cin-genre-pill small{opacity:.7;margin-left:2px}' +
      '.cin-pl-subbar{display:flex;align-items:center;justify-content:space-between;padding:0 14px 6px;flex-shrink:0}' +
      '.cin-pl-count{font-size:10.5px;color:#7a6a46;font-weight:600}' +
      '.cin-pl-hint{font-size:10px;color:#5a4d38;display:flex;align-items:center;gap:4px}' +
      '.cin-pl-list{flex:1;overflow-y:auto;padding:0 8px 8px;min-height:0;display:flex;flex-direction:column;gap:4px}' +
      '.cin-pl-list::-webkit-scrollbar{width:4px}.cin-pl-list::-webkit-scrollbar-track{background:transparent}.cin-pl-list::-webkit-scrollbar-thumb{background:rgba(201,162,39,.3);border-radius:2px}' +
      '.cin-pl-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s;cursor:default}' +
      '.cin-pl-item:hover{background:rgba(201,162,39,.07);border-color:rgba(201,162,39,.2)}' +
      '.cin-pl-thumb{width:36px;height:54px;object-fit:cover;border-radius:5px;flex-shrink:0;background:#1a0a04}' +
      '.cin-pl-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}' +
      '.cin-pl-title{font-size:12px;font-weight:700;color:#f4e3b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}' +
      '.cin-pl-year{font-size:10.5px;color:#9d8a53;font-weight:400}' +
      '.cin-pl-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px}' +
      '.cin-pl-badge{font-size:9.5px;font-weight:800;border-radius:4px;padding:1px 5px;letter-spacing:.04em}' +
      '.cin-pl-badge.fsvid{background:rgba(79,70,229,.25);color:#a5b4fc;border:1px solid rgba(79,70,229,.35)}' +
      '.cin-pl-badge.vidzy{background:rgba(234,88,12,.2);color:#fb923c;border:1px solid rgba(234,88,12,.3)}' +
      '.cin-pl-tag{font-size:9.5px;color:#7a6a46;background:rgba(255,255,255,.05);border-radius:4px;padding:1px 5px;border:1px solid rgba(255,255,255,.08)}' +
      '.cin-pl-actions{display:flex;flex-direction:column;gap:4px;flex-shrink:0}' +
      '.cin-pl-pick{cursor:pointer;font-family:inherit;font-weight:800;font-size:10.5px;border-radius:7px;padding:4px 8px;border:none;transition:all .15s;white-space:nowrap}' +
      '.cin-pl-pick.vf{background:rgba(79,70,229,.3);color:#a5b4fc;border:1px solid rgba(79,70,229,.45)}.cin-pl-pick.vf:hover{background:rgba(79,70,229,.55)}' +
      '.cin-pl-pick.vo{background:rgba(234,88,12,.2);color:#fb923c;border:1px solid rgba(234,88,12,.35)}.cin-pl-pick.vo:hover{background:rgba(234,88,12,.4)}' +
      '.cin-pl-empty{text-align:center;padding:28px 16px;color:#5a4d38;font-size:12px;line-height:1.6}' +
      '.cin-pl-empty i{font-size:22px;margin-bottom:8px;display:block}' +
      /* Pane lien direct */
      '.cin-pane-direct{padding:12px 14px;gap:10px;flex-shrink:0}' +
      '.cin-direct-desc{font-size:11px;color:#9d8a53;line-height:1.5;margin-bottom:4px}' +
      '.cin-cn-url{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:9px 10px;color:#fff3e0;font-family:inherit;font-size:12.5px;outline:none;transition:border-color .15s}.cin-cn-url:focus{border-color:rgba(201,162,39,.5)}' +
      '.cin-btn-load{background:#c2410c;border-color:rgba(194,65,12,.7)!important;color:#fff}.cin-btn-load:hover{background:#ea580c!important}' +
      '.cin-cn-help{font-size:10.5px;line-height:1.4;color:#9d8a53;border-top:1px solid rgba(255,255,255,.08);padding-top:9px}' +
      /* Pane programmation des séances */
      '.cin-pane-schedule{padding:12px 14px;gap:10px;flex-shrink:0;overflow-y:auto;max-height:52vh}' +
      '.cin-sch-film{width:100%;box-sizing:border-box;background:#1a1014;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:9px 10px;color:#fff3e0;font-family:inherit;font-size:12.5px;outline:none;margin-bottom:8px;color-scheme:dark}' +
      '.cin-sch-film option{background:#1a1014;color:#fff3e0}' +
      '.cin-sch-at{flex:1;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:8px 10px;color:#fff3e0;font-family:inherit;font-size:12px;outline:none;color-scheme:dark}' +
      '.cin-sch-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}' +
      '.cin-sch-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}' +
      '.cin-sch-info{flex:1;min-width:0}' +
      '.cin-sch-title{font-size:12px;font-weight:700;color:#f4e3b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.cin-sch-when{font-size:11px;color:#9d8a53;margin-top:2px}' +
      '.cin-sch-del{flex-shrink:0;cursor:pointer;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#f87171;border-radius:7px;padding:6px 9px;font-size:11px}.cin-sch-del:hover{background:rgba(239,68,68,.3)}' +
      /* Régie : refonte (carte « en cours » avec l'affiche, sélecteur d'affiches, choix du jour et de l'heure) */
      '.cin-console{width:540px;max-height:90vh}' +
      '.cin-console *{scrollbar-width:thin;scrollbar-color:#8a6d1d transparent}' +
      '.cin-console ::-webkit-scrollbar{width:10px;height:10px}.cin-console ::-webkit-scrollbar-track{background:transparent;margin:6px 0}' +
      '.cin-console ::-webkit-scrollbar-thumb{background:#8a6d1d;border-radius:10px;border:3px solid transparent;background-clip:padding-box;min-height:40px}.cin-console ::-webkit-scrollbar-thumb:hover{background:#e8b923;background-clip:padding-box;border:3px solid transparent}' +
      '.cin-console ::-webkit-scrollbar-corner{background:transparent}' +
      '.cin-buffer{position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:7;background:rgba(8,5,12,.78);color:#ffb066;border:1px solid rgba(255,122,26,.5);border-radius:999px;padding:6px 14px;font-weight:800;font-size:12px;pointer-events:none}' +
      '.cin-cn-playback{padding:12px 14px 12px}' +
      '.cin-np{display:flex;gap:12px;margin-bottom:10px;padding:10px;border-radius:14px;background:#120a0d;border:1px solid rgba(255,255,255,.08)}' +
      '.cin-np.playing{border-color:rgba(74,222,128,.45)}.cin-np.paused{border-color:rgba(250,200,80,.45)}.cin-np.pending{border-color:rgba(255,122,26,.5)}' +
      '.cin-np-poster{position:relative;width:78px;height:116px;flex:none;border-radius:10px;overflow:hidden;background:#1d1014;display:flex;align-items:center;justify-content:center}' +
      '.cin-np-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cin-np-ph{color:#5a4d38;font-size:26px}' +
      '.cin-np-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px}' +
      '.cin-np-badge{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:800;letter-spacing:.03em;background:rgba(255,255,255,.07);color:#9d8a53}' +
      '.cin-np.playing .cin-np-badge{background:rgba(34,197,94,.18);color:#4ade80}.cin-np.paused .cin-np-badge{background:rgba(250,200,80,.15);color:#facc15}.cin-np.ready .cin-np-badge{background:rgba(99,102,241,.2);color:#a5b4fc}.cin-np.pending .cin-np-badge{background:rgba(255,122,26,.18);color:#ff9a4a}' +
      '.cin-np-title{font-weight:900;font-size:17px;line-height:1.2;color:#f4e3b0}.cin-np-title small{font-size:12px;font-weight:600;color:#9d8a53}.cin-np-title em{font-style:normal;font-size:10.5px;font-weight:900;background:#c2410c;color:#fff;border-radius:4px;padding:1px 6px;vertical-align:2px}' +
      '.cin-np-meta{font-size:11.5px;color:#9d8a53;min-height:14px}' +
      '.cin-np-bar{height:6px;border-radius:3px;background:#2a1f24;overflow:hidden;margin-top:2px}.cin-np-bar i{display:block;height:100%;width:0;background:#ff7a1a}' +
      '.cin-np-time{display:flex;justify-content:space-between;font-size:11px;color:#9d8a53;font-variant-numeric:tabular-nums;min-height:14px}' +
      '.cin-cn-row button:disabled{opacity:.35;cursor:not-allowed}' +
      '.cin-cn-row button{padding:10px 6px;font-size:12.5px}' +
      '.cin-pl-item{padding:7px 9px}.cin-pl-thumb{width:44px;height:66px}.cin-pl-title{font-size:13px}' +
      '.cin-pane-schedule{max-height:56vh}' +
      '.cin-lbl{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c9a227;margin-top:4px}' +
      '.cin-fp-btn{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;cursor:pointer;font-family:inherit;text-align:left;background:#120a0d;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px 12px;color:#f4e3b0}.cin-fp-btn:hover{border-color:rgba(201,162,39,.5)}' +
      '.cin-fp-btn img,.cin-fp-ph{width:38px;height:56px;flex:none;border-radius:6px;object-fit:cover;background:#1d1014;display:flex;align-items:center;justify-content:center;color:#5a4d38;font-size:18px}' +
      '.cin-fp-sel{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.cin-fp-sel b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cin-fp-sel small{font-size:11px;color:#9d8a53}.cin-fp-btn>i{color:#9d8a53}' +
      '.cin-fp-pop{display:flex;flex-direction:column;gap:8px;background:#0d070a;border:1px solid rgba(201,162,39,.35);border-radius:12px;padding:8px}.cin-fp-pop.hid{display:none}' +
      '.cin-fp-search{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 10px 8px 30px;color:#fff3e0;font-family:inherit;font-size:12.5px;outline:none}.cin-fp-search:focus{border-color:rgba(201,162,39,.5)}' +
      '.cin-fp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:260px;overflow-y:auto;padding-right:2px}' +
      '.cin-fp-grid::-webkit-scrollbar{width:4px}.cin-fp-grid::-webkit-scrollbar-thumb{background:rgba(201,162,39,.3);border-radius:2px}' +
      '.cin-fp-grid .cin-pl-empty{grid-column:1/-1}' +
      '.cin-fp-card{display:flex;flex-direction:column;gap:4px;border-radius:10px;padding:4px;background:#160d11;border:1px solid transparent}.cin-fp-card.sel{border-color:#ff7a1a;background:#2a1208}' +
      '.cin-fp-card img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:7px;background:#1d1014}' +
      '.cin-fp-t{font-size:10.5px;font-weight:700;line-height:1.25;color:#f4e3b0;height:26px;overflow:hidden}.cin-fp-t small{color:#9d8a53;font-weight:500}' +
      '.cin-fp-v{display:flex;gap:4px}.cin-fp-v button{flex:1;cursor:pointer;font-family:inherit;font-weight:800;font-size:10.5px;border-radius:6px;padding:4px 0;border:1px solid rgba(255,255,255,.18);background:transparent;color:#d9c88f}.cin-fp-v button:hover{background:rgba(255,122,26,.25);border-color:#ff7a1a;color:#fff}.cin-fp-v button.on{background:#c2410c;border-color:#c2410c;color:#fff}' +
      '.cin-dp{display:flex;flex-direction:column;gap:10px;background:#120a0d;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px}' +
      '.cin-dp-days{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}.cin-dp-days::-webkit-scrollbar{height:4px}.cin-dp-days::-webkit-scrollbar-thumb{background:rgba(201,162,39,.3);border-radius:2px}' +
      '.cin-dp-day{flex:none;width:52px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;font-family:inherit;border-radius:10px;padding:7px 0;border:1px solid rgba(255,255,255,.12);background:#1a1014;color:#d9c88f}' +
      '.cin-dp-day b{font-size:18px;color:#fff3e0}.cin-dp-day small{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#9d8a53}.cin-dp-day:hover{border-color:rgba(201,162,39,.5)}' +
      '.cin-dp-day.sel{background:#c2410c;border-color:#c2410c}.cin-dp-day.sel b,.cin-dp-day.sel small{color:#fff}' +
      '.cin-dp-time{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.cin-dp-step{display:flex;flex-direction:column;align-items:center;gap:2px;background:#1a1014;border-radius:10px;padding:3px 10px}.cin-dp-step b{font-size:26px;font-weight:900;color:#fff3e0;font-variant-numeric:tabular-nums;line-height:1.1}' +
      '.cin-dp-step button{cursor:pointer;background:none;border:none;color:#9d8a53;font-size:12px;padding:2px 10px}.cin-dp-step button:hover{color:#ff9a4a}' +
      '.cin-dp-sep{font-size:24px;font-weight:900;color:#9d8a53}' +
      '.cin-dp-chips{display:flex;flex-wrap:wrap;gap:5px;flex:1;justify-content:flex-end}' +
      '.cin-dp-chip{cursor:pointer;font-family:inherit;font-weight:800;font-size:11.5px;border-radius:999px;padding:5px 10px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#d9c88f}.cin-dp-chip:hover{border-color:#ff7a1a}.cin-dp-chip.sel{background:#c2410c;border-color:#c2410c;color:#fff}' +
      '.cin-dp-sum{font-size:13px;font-weight:800;color:#4ade80;display:flex;align-items:center;gap:7px}.cin-dp-sum.bad{color:#f87171}' +
      '.cin-sch-img{width:34px;height:50px;border-radius:5px;object-fit:cover;flex:none;background:#1d1014}' +
      '';
    document.head.appendChild(st);
  }

  F.registerRoom('cinema', function (w) { return createCinemaRoom(w, false); });
  F.registerRoom('cinemapremium', function (w) { return createCinemaRoom(w, true); });
})();
