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
   - La musique de fond : les morceaux de assets/musique/cinema/ (premium : cinema-premium/) (playlist.json) ; sans fichier, un petit air de jazz lent fabriqué à la volée (WebAudio).
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
      HX: 35, HZ: 20, ZF: 34, H: 43, SCR_W: 64, SCR_Y: 2.6, SCR_H: 36, ROW_H: 0.85, ROWS: [], COLS: [-11.65, -10.2, -8.75, -7.3, -5.85, -4.4, -1.45, 0, 1.45, 4.4, 5.85, 7.3, 8.75, 10.2, 11.65],
      blocks: [{ x0: -12.4, x1: -3.65 }, { x0: -2.2, x1: 2.2 }, { x0: 3.65, x1: 12.4 }], lanes: [[-2.925, 1.45], [2.925, 1.45], [-(12.4 + 35) / 2, 35 - 12.4], [(12.4 + 35) / 2, 35 - 12.4]], aisleLights: [-12.4, -3.65, -2.2, 2.2, 3.65, 12.4], mini: true
    } : {
      HX: 10, HZ: 13, ZF: 13, H: 11, SCR_W: 19.9, SCR_Y: 0.9, SCR_H: 11 - 0.9, ROW_H: 0.4, ROWS: [-4.6, -2.7, -0.8, 1.1, 3.0], COLS: [-5.2, -4.1, -3.0, -1.9, 1.9, 3.0, 4.1, 5.2],
      blocks: [{ x0: -5.7, x1: -1.4 }, { x0: 1.4, x1: 5.7 }], lanes: [[0, 2.8], [-7.5, 3.6], [7.5, 3.6]], aisleLights: [-6.0, -1.3, 1.3, 6.0]
    };
    var k;
    if (P) { for (k = 3; k < 7; k++) G0.ROWS.push(-3.4 + k * 1.9); }      // 8 rangées, chacune 55 cm plus haute : on voit l'écran par-dessus la tête de devant
    G0.ROW_GAP = G0.ROWS[1] - G0.ROWS[0];
    G0.BND = []; for (k = 0; k < G0.ROWS.length - 1; k++) G0.BND.push((G0.ROWS[k] + G0.ROWS[k + 1]) / 2);
    G0.BACK_H = (G0.ROWS.length - 1) * G0.ROW_H;
    G0.inAisle = function (x) { for (var q = 0; q < G0.blocks.length; q++) if (x >= G0.blocks[q].x0 && x <= G0.blocks[q].x1) return false; return true; };
    G0.ground = function (x, z) {                         // hauteur du sol à (x,z) : marche nette sous les fauteuils, rampe d'escalier dans les allées
      var aisle = G0.inAisle(x), width = aisle ? G0.ROW_GAP : 0.35, h = 0, gp = G0.ROW_GAP / 3;
      for (var i = 0; i < G0.BND.length; i++) {
        var b = G0.BND[i];
        if (G0.mini && aisle) { for (var j = -1; j <= 1; j++) h += G0.ROW_H / 3 * smoothT((z - (b + j * gp - 0.07)) / 0.14); }   // allées : trois petites marches par rangée
        else h += G0.ROW_H * smoothT((z - (b - width / 2)) / width);
      }
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

  function createMusic(premium) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var m = { ctx: null, master: null, dry: null, wet: null, noise: null, timer: 0, nextT: 0, step: 0, level: 1, up: false, lastTarget: -1, files: null, el: null, lastFile: '' };

    // vrais morceaux : assets/musique/cinema/ (premium : cinema-premium/) (playlist.json) ; sans fichier, l'air de jazz synthétisé ci-dessous
    if (F.audio && F.audio.withPlaylist) F.audio.withPlaylist(function (pl) {
      var lst = premium ? pl.cinemapremium : pl.cinema; m.files = lst && lst.length ? lst : null;
      if (m.files && m.ctx && !m.el) { clearInterval(m.timer); m.timer = 0; playFile(); }
    });
    function playFile() {
      var c = m.ctx, list = m.files, pick = list[0];
      if (list.length > 1) { do { pick = list[(Math.random() * list.length) | 0]; } while (pick === m.lastFile); }
      m.lastFile = pick;
      var el = new Audio(), g;
      el.src = 'assets/musique/' + pick;
      try { var src = c.createMediaElementSource(el); g = c.createGain(); g.gain.value = 0.4; src.connect(g); g.connect(m.master); if (m.an2) src.connect(m.an2); }   // les vrais morceaux sont mixés bien plus fort que l'air synthétisé
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
      m.an = c.createAnalyser(); m.an.fftSize = 256; m.an.smoothingTimeConstant = 0.6; m.master.connect(m.an); m.anBuf = new Uint8Array(m.an.frequencyBinCount);
      m.dry = c.createGain(); m.dry.gain.value = 1; m.dry.connect(m.master);
      // analyse du son AVANT le réglage de volume : les petits points de la salle suivent la musique quel que soit le volume choisi
      m.an2 = c.createAnalyser(); m.an2.fftSize = 512; m.an2.smoothingTimeConstant = 0.6; m.an2Buf = new Uint8Array(m.an2.frequencyBinCount); m.dry.connect(m.an2);
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
      var target = m.up ? v * vol * mast * 0.55 : 0;     // musique d'attente douce (elle était trop forte)
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
    var N = 2048, cv = mkCanvas(N, N), x = cv.getContext('2d'), k; x.fillStyle = '#000000'; x.fillRect(0, 0, N, N);
    for (k = 0; k < 2600; k++) { var r = 0.9 + Math.random() * Math.random() * 2.6, a = 0.45 + Math.random() * 0.55; x.fillStyle = 'rgba(255,255,255,' + a + ')'; x.beginPath(); x.arc(Math.random() * N, Math.random() * N, r, 0, TAU); x.fill(); }
    for (k = 0; k < 90; k++) { var px = Math.random() * N, py = Math.random() * N, gr = x.createRadialGradient(px, py, 0, px, py, 9); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(180,170,255,0)'); x.fillStyle = gr; x.fillRect(px - 9, py - 9, 18, 18); }
    starTex = new THREE.CanvasTexture(cv); starTex.anisotropy = 8; return starTex;
  }
  // panneau mural de lumière : fibres lumineuses qui ondulent sur fond noir
  var wavePan = {};
  function waveTex(hue) {
    if (wavePan[hue]) return wavePan[hue];
    var W = 256, Hh = 2048, cv = mkCanvas(W, Hh), x = cv.getContext('2d'), k, y;           // fond transparent : les fibres flottent sur le mur étoilé, ni cadre ni liseré
    var col = hue ? '255,170,235' : '200,180,255';
    for (k = 0; k < 7; k++) {
      var ph = k * 0.9, fq = 0.0055 + k * 0.0008, am = 46 + (k % 3) * 14;
      x.strokeStyle = 'rgba(' + col + ',0.9)'; x.lineWidth = 2.4; x.shadowColor = 'rgba(' + col + ',1)'; x.shadowBlur = 14; x.beginPath();
      for (y = 0; y <= Hh; y += 8) { var px = W / 2 + Math.sin(y * fq + ph) * am * (0.55 + 0.45 * Math.sin(y * 0.002 + k)); if (y) x.lineTo(px, y); else x.moveTo(px, y); }
      x.stroke(); x.shadowBlur = 0;
      for (y = 0; y <= Hh; y += 60) { var qx = W / 2 + Math.sin(y * fq + ph) * am * (0.55 + 0.45 * Math.sin(y * 0.002 + k)); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(qx, y, 2.6, 0, TAU); x.fill(); }
    }
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
    var HX = G0.HX, HZ = G0.HZ, ZF = G0.ZF, H = G0.H, SCR_W = G0.SCR_W, SCR_Y = G0.SCR_Y, SCR_H = G0.SCR_H, ROWS = G0.ROWS, COLS = G0.COLS, ROW_H = G0.ROW_H, ROW_GAP = G0.ROW_GAP, BACK_H = G0.BACK_H, cinemaGroundY = G0.ground;
    // salle « premium » : plafond doré en anneaux, murs de bois doré, fauteuils bleus, rideaux bleus (même séance partagée que le cinéma classique)
    var room = { noHand: true, title: '<img class="cin-title-logo" src="assets/cinema/tropistream-serveur.png" alt="">' + (P ? 'CINÉMA PREMIUM' : 'CINÉMA'), subtitle: P ? 'ÉCRAN GÉANT · FAUTEUILS CLUB' : 'TROPI STREAM · PRÉSENTATION', topic: P ? 'flambeurs-cinemapremium-room' : 'flambeurs-cinema-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, low = !!world.low;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -ZF + 3.0, zMax: HZ - 0.7 };   // la scène (les 2,3 premiers mètres) reste hors d'atteinte
    room.groundY = cinemaGroundY;   // vrai sol en gradins : on marche réellement dessus (world3d.js lit cette fonction à chaque image)
    injectCss();

    /* --- petites lumières blanches (fibre optique) : plafond, murs et sol ; elles s'éteignent quand le film commence --- */
    // couleurs des 4 bandes de LED autour de l'écran (lignes : 0 gauche, 1 droite, 2 haut, 3 bas ; 32 échantillons chacune) : les petits points des murs, du plafond et du sol les reprennent
    var ledData = new Uint8Array(32 * 4 * 4), ledTex = new THREE.DataTexture(ledData, 32, 4, THREE.RGBAFormat);
    ledTex.minFilter = ledTex.magFilter = THREE.LinearFilter; ledTex.wrapS = ledTex.wrapT = THREE.ClampToEdgeWrapping; ledTex.generateMipmaps = false; ledTex.needsUpdate = true;
    for (var li = 3; li < ledData.length; li += 4) ledData[li] = 255;
    var starMats = [], starCache = {}, starTile = null;
    var tintU = { uL: { value: new THREE.Color(0, 0, 0) }, uR: { value: new THREE.Color(0, 0, 0) }, uC: { value: new THREE.Color(0, 0, 0) }, uHX: { value: HX }, uZ0: { value: -ZF }, uZR: { value: (HZ + ZF) * 0.85 }, uLed: { value: ledTex }, uDim: { value: 1 }, uY0: { value: SCR_Y }, uY1: { value: SCR_Y + SCR_H }, uSW: { value: SCR_W }, uMus: { value: new THREE.Vector4(0, 0, 0, 0) }, uBeat: { value: new THREE.Vector4(0, 0, 0, 0) }, uT: { value: 0 } };      // lumière de l'écran : une teinte ajoutée à toutes les surfaces étoilées (murs, plafond, sol, gradins), partout dans la salle
    // les petits points prennent la couleur de la LED du même côté : sol = LED du bas, plafond = LED du haut, mur de gauche = LED de gauche, mur de droite = LED de droite
    var LEDSH = [
      'float nlen = length(vWn); vec3 nW = vWn / max(nlen, 0.0001); vec3 led;',
      'if (nlen > 0.5 && abs(nW.y) > 0.7) { float ux = clamp((vWp.x + uSW * 0.5) / uSW, 0.0, 1.0); led = texture2D(uLed, vec2(ux, nW.y > 0.0 ? 0.875 : 0.625)).rgb; }',
      'else if (nlen > 0.5 && abs(nW.x) > 0.7) { float uy = clamp(1.0 - (vWp.y - uY0) / (uY1 - uY0), 0.0, 1.0); led = texture2D(uLed, vec2(uy, nW.x > 0.0 ? 0.125 : 0.375)).rgb; }',
      'else { led = mix(texture2D(uLed, vec2(0.5, 0.125)).rgb, texture2D(uLed, vec2(0.5, 0.375)).rgb, clamp(vWp.x / uSW + 0.5, 0.0, 1.0)); }',
      'float dl = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) / max(uDim, 0.02);',
      'float ls = clamp(max(led.r, max(led.g, led.b)) * 3.0, 0.0, 1.0);',
      'diffuseColor.rgb = mix(diffuseColor.rgb, led * dl * 1.7, ls);',
      // musique d'attente : les petits points vibrent avec les graves, les médiums et les aigus (vagues qui courent sur les murs, couleurs douces) ; uMus.w = 0 pendant le film
      'float mwv = 0.5 + 0.5 * sin(vWp.x * 0.21 + vWp.y * 0.13 + vWp.z * 0.17 - uT * 2.2);',
      'float mbs = 0.5 + 0.5 * sin(vWp.z * 0.30 - uT * 3.4);',
      'float mtr = 0.5 + 0.5 * sin(vWp.x * 0.9 + vWp.y * 0.7 + uT * 6.0);',
      'float pulse = uMus.x * mbs + uMus.y * mwv + uMus.z * mtr;',
      // couleurs franches de tout l'arc-en-ciel qui courent dans la salle : plus la musique est rapide / intense (instant épique), plus elles changent vite et pétillent (uBeat.x = phase des couleurs, uBeat.y = pétillement)
      'float hb = fract(vWp.z * 0.018 + vWp.x * 0.012 + vWp.y * 0.01 + uBeat.x);',
      'vec3 mcol = hsv2rgb(vec3(hb, 0.92, 1.0));',
      'float tw = 0.5 + 0.5 * sin(uT * (5.0 + 18.0 * uBeat.y) + dot(floor(vWp * 1.5), vec3(12.9898, 78.233, 37.719)));',
      'float spark = 1.0 + uBeat.y * (tw * 1.7 - 0.55);',
      'diffuseColor.rgb = mix(diffuseColor.rgb, mcol * dl * uDim * (0.9 + 0.9 * pulse) * spark, uMus.w);'
    ].join('\n');
    function tintize(m, extra) {                       // lumière de l'écran sur les surfaces étoilées : plus forte près de l'écran, plus douce au fond, et la couleur du côté gauche / droit de l'image de chaque côté de la salle
      // extra (rideau) : { attr, vary, decl, main, uni(sh) } = un attribut de plus, une déclaration et du code ajouté en fin de shader (le texte TROPISTREAM en points)
      m.onBeforeCompile = function (sh) {
        Object.keys(tintU).forEach(function (k) { sh.uniforms[k] = tintU[k]; });
        if (extra && extra.uni) extra.uni(sh);
        sh.vertexShader = 'varying vec3 vWp;\nvarying vec3 vWn;\n' + (extra ? extra.vdecl : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWn = mat3(modelMatrix) * normal;' + (extra ? extra.vmain : ''));
        sh.fragmentShader = 'varying vec3 vWp;\nvarying vec3 vWn;\nuniform sampler2D uLed; uniform float uDim; uniform float uY0; uniform float uY1; uniform float uSW;\nuniform vec3 uL; uniform vec3 uR; uniform vec3 uC; uniform float uHX; uniform float uZ0; uniform float uZR; uniform vec4 uMus; uniform vec4 uBeat; uniform float uT;\nvec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }\n' + (extra ? extra.fdecl : '') + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + LEDSH).replace('#include <dithering_fragment>', 'float tk = clamp((vWp.z - uZ0) / uZR, 0.0, 1.0); float nr = 1.0 - 0.7 * smoothstep(0.0, 1.0, tk); float sx = clamp(vWp.x / uHX * 0.5 + 0.5, 0.0, 1.0); vec3 sd = mix(uL, uR, smoothstep(0.0, 1.0, sx)); float fr = exp(-max(vWp.z - uZ0, 0.0) / 5.0); gl_FragColor.rgb += mix(sd, uC, 0.3) * fr;\n' + (extra ? extra.fmain : '') + '\n#include <dithering_fragment>');
      };
      return m;
    }
    var nosingM = new THREE.MeshBasicMaterial({ color: 0x3f3318 }); nosingM._base = new THREE.Color(0x3f3318); starMats.push(nosingM);   // (_base : couleur de départ, assombrie avec la salle)
    var brassM = new THREE.MeshBasicMaterial({ color: 0x7a5f26 }), aisleM = new THREE.MeshBasicMaterial({ color: 0x8a7a5a }); aisleM._base = new THREE.Color(0x8a7a5a); starMats.push(aisleM);   // laiton discret : plus de barres blanches
    function starTileTex() {
      if (starTile) return starTile;
      var N = 512, cv = mkCanvas(N, N), x = cv.getContext('2d'), k; x.fillStyle = '#000000'; x.fillRect(0, 0, N, N);
      for (k = 0; k < 64; k++) { x.fillStyle = 'rgba(255,255,255,' + (0.45 + Math.random() * 0.55).toFixed(2) + ')'; x.beginPath(); x.arc(Math.random() * N, Math.random() * N, 0.9 + Math.random() * 1.1, 0, TAU); x.fill(); }
      for (k = 0; k < 8; k++) { var px = Math.random() * N, py = Math.random() * N, gr = x.createRadialGradient(px, py, 0, px, py, 5); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(px - 5, py - 5, 10, 10); }
      starTile = new THREE.CanvasTexture(cv); starTile.wrapS = starTile.wrapT = THREE.RepeatWrapping; starTile.anisotropy = 4; return starTile;
    }
    function starMat(w, d, tile) {                       // noir semé de points blancs, un point tous les ~1 m, sur une surface de w x d mètres
      tile = tile || 5; var key = Math.round(w * 2) + 'x' + Math.round(d * 2) + 'x' + tile;
      if (starCache[key]) return starCache[key];
      var t = starTileTex().clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / tile), Math.max(1, d / tile));
      var m = tintize(new THREE.MeshBasicMaterial({ map: t })); starMats.push(m); return (starCache[key] = m);
    }
    function starMatUV() {                               // pour les formes dont les UV sont en mètres
      if (starCache.uv) return starCache.uv;
      var t = starTileTex().clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 5, 1 / 5);
      var m = tintize(new THREE.MeshBasicMaterial({ map: t })); starMats.push(m); return (starCache.uv = m);
    }

    /* --- sol : moquette rouge sombre à losanges --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d');
    fx.fillStyle = P ? '#3a0710' : '#3a0c16'; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = P ? '#4a0c18' : '#561624'; fx.lineWidth = 6;
    for (var i = -1; i < 5; i++) { fx.beginPath(); fx.moveTo(i * 64, 0); fx.lineTo(i * 64 + 256, 256); fx.moveTo(i * 64 + 256, 0); fx.lineTo(i * 64, 256); fx.stroke(); }
    fx.fillStyle = P ? '#5a1220' : '#6a1a2a'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { fx.beginPath(); fx.arc(i * 64 + 32, j * 64, 4, 0, TAU); fx.fill(); }
    var ftex = mkTex(fc); ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(HX * 2 / 2.5, (HZ + ZF) / 2.5);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ + ZF), P ? starMat(HX * 2, HZ + ZF) : new THREE.MeshLambertMaterial({ map: ftex })); floor.rotation.x = -Math.PI / 2; floor.position.z = (HZ - ZF) / 2; g.add(floor);

    /* --- murs, plafond, panneaux acoustiques --- */
    var wallM = P ? std(0x0c0a14, 0.9, 0.05) : std(0x24090f, 0.9, 0.05), panelM = P ? std(0xc4852e, 0.55, 0.1, 0x241503) : std(0x3b0f1a, 0.85, 0.05), trimM = std(0xc9a227, 0.3, 0.6, 0x2a1d00);
    function wall(w, h, px, py, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), P ? starMat(w, h) : wallM); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, H, 0, H / 2, -ZF, 0); (function () {          // mur du fond : une fenêtre de 2 m x 0,8 m est percée pour la cabine de projection, centrée (x = 0, y = 7 + BACK_H : remontée avec le palier du fond)
      var bw = new THREE.Shape(), hole = new THREE.Path(), hy = 6.6 + BACK_H, hy2 = 7.4 + BACK_H;
      bw.moveTo(-HX, 0); bw.lineTo(HX, 0); bw.lineTo(HX, H); bw.lineTo(-HX, H); bw.closePath();
      hole.moveTo(-1.0, hy); hole.lineTo(1.0, hy); hole.lineTo(1.0, hy2); hole.lineTo(-1.0, hy2); hole.closePath(); if (!P) bw.holes.push(hole);   // premium : plus de cabine de projection, le mur du fond est plein
      var bm = new THREE.Mesh(new THREE.ShapeGeometry(bw), P ? starMatUV() : wallM); bm.rotation.y = Math.PI; bm.position.set(0, 0, HZ); g.add(bm);
    })(); wall(HZ + ZF, H, -HX, H / 2, (HZ - ZF) / 2, Math.PI / 2); wall(HZ + ZF, H, HX, H / 2, (HZ - ZF) / 2, -Math.PI / 2);   // murs latéraux pleins   // (premium : murs latéraux percés, construits avec l'étage VIP)
    var ceilM = null, starLedM = null;
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ + ZF), P ? (ceilM = tintize(new THREE.MeshBasicMaterial({ map: starCeilingTex() }))) : new THREE.MeshLambertMaterial({ color: 0x140a0e })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; ceil.position.z = (HZ - ZF) / 2; g.add(ceil);
    if (P) {                                                // quelques petites lumières blanches au plafond : elles s'éteignent quand le film commence
      starLedM = new THREE.MeshBasicMaterial({ color: 0xffffff });
      [-21, -14, -7, 0, 7, 14, 21].forEach(function (lx) { [-12, -2, 8, 17].forEach(function (lz) { var sp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), starLedM); sp.position.set(lx, H - 0.04, lz); sp.scale.y = 0.4; g.add(sp); }); });
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
    (P ? [] : [-HX + 0.06, HX - 0.06]).forEach(function (x) { wallStrip(x, 0.62, 0.1, 0.1, trimM); wallStrip(x, 5.6, 0.1, 0.1, trimM); });   // filets dorés bas et haut
    if (!P) [-HX + 0.02, HX - 0.02].forEach(function (x) { wallStrip(x, 0.3, 0.04, 0.6, std(0x14070b, 0.9, 0)); });   // (premium : plus de barre au sol)                                   // soubassement

    /* --- scène, rampe de lumières, écran --- */
    var stageD = 2.4;
    box(g, HX * 2, 0.3, stageD, P ? starMat(HX * 2, stageD) : std(0x2a1810, 0.7, 0.1), 0, 0.15, -ZF + stageD / 2);
    box(g, HX * 2, 0.1, 0.06, trimM, 0, 0.15, -ZF + stageD + 0.03);                // liteau doré sur la face de la scène
    if (P) { /* néon de la scène : construit avec la lumière de l'écran (plus bas) */ }   // un seul trait de lumière continu au bord de la scène
    else for (i = -HX + 0.5; i <= HX - 0.5; i += 0.5) sph(g, 0.045, bas(0xfff0c0), i, 0.15, -ZF + stageD + 0.08);      // petites ampoules posées sur le liteau, bien visibles
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
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), screenM); screen.position.set(0, SCR_Y + SCR_H / 2, -ZF + 0.16); g.add(screen);
    if (P) {                                                // écran géant : fin cadre doré, rien d'autre
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
    function rbox(w, h, d, r) {                          // boîte aux arêtes arrondies (biseau), centrée sur l'origine : donne un volume doux, comme un vrai fauteuil rembourré
      var cw = Math.max(0.002, w - 2 * r), ch = Math.max(0.002, h - 2 * r), x0 = -cw / 2, y0 = -ch / 2, cr = Math.min(cw, ch) * 0.25, sh = new THREE.Shape();
      sh.moveTo(x0 + cr, y0); sh.lineTo(x0 + cw - cr, y0); sh.quadraticCurveTo(x0 + cw, y0, x0 + cw, y0 + cr); sh.lineTo(x0 + cw, y0 + ch - cr); sh.quadraticCurveTo(x0 + cw, y0 + ch, x0 + cw - cr, y0 + ch);
      sh.lineTo(x0 + cr, y0 + ch); sh.quadraticCurveTo(x0, y0 + ch, x0, y0 + ch - cr); sh.lineTo(x0, y0 + cr); sh.quadraticCurveTo(x0, y0, x0 + cr, y0);
      var dp = Math.max(0.002, d - 2 * r), geo = new THREE.ExtrudeGeometry(sh, { depth: dp, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 5 });
      geo.translate(0, 0, -dp / 2); return geo;
    }
    var seats = room.seats = [], seatGeo = {
      cush: new THREE.BoxGeometry(0.74, 0.14, 0.62), back: new THREE.BoxGeometry(0.74, 0.7, 0.14), roll: new THREE.CylinderGeometry(0.075, 0.075, 0.74, 10),
      side: new THREE.BoxGeometry(0.09, 0.5, 0.7), arm: new THREE.BoxGeometry(0.11, 0.07, 0.62), hit: new THREE.BoxGeometry(0.9, 1.3, 0.9),
      // fauteuil club réaliste (premium) : coussins bombés aux arêtes arrondies, dossier incliné avec lombaire et têtière, accoudoirs en cuir, flancs, pied central
      pCush: rbox(0.66, 0.2, 0.7, 0.075), pBase: new THREE.CylinderGeometry(0.1, 0.17, 0.3, 14), pBack: rbox(0.7, 1.0, 0.22, 0.1), pHead: rbox(0.5, 0.3, 0.17, 0.08), pArm: rbox(0.15, 0.17, 0.74, 0.05), pLed: new THREE.BoxGeometry(0.62, 0.03, 0.03), pInset: rbox(0.5, 0.62, 0.08, 0.035), pCap: rbox(0.17, 0.03, 0.76, 0.014), pSide: rbox(0.06, 0.5, 0.68, 0.025), pCup: new THREE.CylinderGeometry(0.052, 0.045, 0.03, 14)
    };
    var velM = P ? std(0x86101f, 0.78, 0.04, 0x140305) : lam(VELVET), darkM = P ? std(0x2a080f, 0.7, 0.1, 0x0a0204) : lam(0x180a0e), velHiM = P ? std(0x9e1628, 0.68, 0.05, 0x180406) : null, goldS = P ? std(0xd9b441, 0.3, 0.7, 0x2a1d00) : null, ledM = new THREE.MeshBasicMaterial({ color: 0xff8ae0 }), hitM = new THREE.MeshBasicMaterial({ visible: false });
    var inst = null, dummy = new THREE.Object3D();
    if (P) {                                                // 90 places : fauteuils club blancs, larges, bien espacés ; chaque pièce est dessinée en une seule fois pour toute la salle
      var parts = [{ geo: seatGeo.pCush, mat: velM, p: [0, 0.5, -0.04], rx: 0.05 }, { geo: seatGeo.pBase, mat: darkM, p: [0, 0.16, 0.05] }, { geo: seatGeo.pBack, mat: velM, p: [0, 1.0, 0.34], rx: 0.2 }, { geo: seatGeo.pInset, mat: velHiM, p: [0, 0.98, 0.22], rx: 0.2 }, { geo: seatGeo.pHead, mat: velHiM, p: [0, 1.62, 0.47], rx: 0.2 }, { geo: seatGeo.pArm, mat: darkM, p: [-0.46, 0.67, 0.0] }, { geo: seatGeo.pArm, mat: darkM, p: [0.46, 0.67, 0.0] }, { geo: seatGeo.pCap, mat: goldS, p: [-0.46, 0.765, 0.0] }, { geo: seatGeo.pCap, mat: goldS, p: [0.46, 0.765, 0.0] }, { geo: seatGeo.pSide, mat: darkM, p: [-0.53, 0.4, 0.0] }, { geo: seatGeo.pSide, mat: darkM, p: [0.53, 0.4, 0.0] }, { geo: seatGeo.pCup, mat: goldS, p: [0.46, 0.785, -0.2] }];
      inst = { parts: parts, meshes: parts.map(function (pt) { var im = new THREE.InstancedMesh(pt.geo, pt.mat, ROWS.length * COLS.length + 50); im.frustumCulled = false; im.count = 0; g.add(im); return im; }), n: 0 };
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
      var n = seats.length, st = { n: n, x: x, z: z, y: elev, yaw: 0, sx: x, sz: z - 0.95, hit: hit, idx: inst ? inst.n - 1 : -1, grp: s, hid: false };
      seats.push(st);
      room.interactables.push({
        hit: hit, x: x, z: z, radius: 0.95,
        enabled: function () { return !seat_.cur && !taken(st) && (!st.vip || vipUp); },   // un fauteuil d'étage ne se prend que depuis l'étage
        prompt: function () { return '🎬 S\'asseoir  [F]'; },
        use: function (w) {
          if (Math.hypot(w.player.x - x, w.player.z - z) > 2.4 || (st.vip && !vipUp) || (!st.vip && P && vipUp)) { w.flash('Approche-toi du fauteuil pour t\'asseoir.'); return; }   // clic de loin : rien
          sit(w, st);
        }
      });
    }
    var seat_ = { cur: null }, vipLights = [];
    if (false) ROWS.forEach(function (rz, ri) { [-3.95, 3.95, -9.6, 9.6].forEach(function (rx) { var ry = cinemaGroundY(rx, rz); box(g, 0.05, 0.05, ROW_GAP + 0.02, trimM, rx, ry + 0.95, rz); box(g, 0.04, 0.95, 0.04, trimM, rx, ry + 0.47, rz - ROW_GAP / 2); }); });      // rampes dorées le long des allées
    ROWS.forEach(function (rz, ri) { if (P && ri === 0) return; var elev = G0.elev ? G0.elev(ri) : ri * ROW_H; COLS.forEach(function (cx2) { seat(cx2, rz, elev); }); });

    /* --- gradins : un bloc plein (marche nette) sous chaque bloc de fauteuils, à partir de la 2e rangée --- */
    var deckM = P ? std(0x0d0d11, 0.9, 0.05) : std(0x34101b, 0.85, 0.05);
    function deckFor(w, d) { return P ? starMat(w, d) : deckM; }   // premium : gradins noirs semés de points blancs
    function deckBlock(xC, xW, zC, topY, base) { base = base || 0; if (topY - base < 0.01) return; box(g, xW, topY - base, ROW_GAP, deckFor(xW, ROW_GAP), xC, base + (topY - base) / 2, zC); if (!P) box(g, xW, 0.03, 0.05, trimM, xC, topY, zC - ROW_GAP / 2 + 0.025); }   // + nez de marche doré, sur le bord qui fait face à l'écran
    ROWS.forEach(function (rz, ri) { if (!ri) return; var topY = G0.elev ? G0.elev(ri) : ri * ROW_H, base = G0.elev && ri >= G0.nLow ? G0.HB : 0; G0.blocks.forEach(function (b) { deckBlock((b.x0 + b.x1) / 2, b.x1 - b.x0, rz, topY, base); }); });

    /* --- allées (centrale + deux latérales) : un escalier continu, construit en échantillonnant cinemaGroundY --- */
    (function buildStairs() {
      var sideW = (HX - 0.7) - 5.7, sideX = 5.7 + sideW / 2;   // allée latérale : de x=5,7 jusqu'au bord de la salle
      var lanes = G0.lanes, step = 0.38;
      if (G0.mini) {                                   // premium : de vraies petites marches (trois par rangée), pas une rampe
        var gp3 = G0.ROW_GAP / 3, risers = [];
        G0.BND.forEach(function (b) { [-1, 0, 1].forEach(function (j) { risers.push(b + j * gp3); }); });
        lanes.forEach(function (ln) {
          for (var m = 0; m < risers.length; m++) {
            var z0 = risers[m], z1 = m + 1 < risers.length ? risers[m + 1] : ROWS[ROWS.length - 1], top = (m + 1) * G0.ROW_H / 3;
            if (z1 - z0 > 0.01) { box(g, ln[1], top, z1 - z0, deckFor(ln[1], z1 - z0), ln[0], top / 2, (z0 + z1) / 2); if (Math.abs(ln[0]) < 15) box(g, ln[1], 0.02, 0.035, nosingM, ln[0], top + 0.01, z0 + 0.0175); }   // un liseré de laiton très discret au bord de chaque marche
          }
        });
        lanes = [];
      }
      lanes.forEach(function (ln) {
        var xC = ln[0], xW = ln[1];
        for (var z = ROWS[0]; z < ROWS[ROWS.length - 1]; z += step) {
          var zc = z + step / 2, topY = cinemaGroundY(xC, zc);
          if (topY > 0.01) box(g, xW, topY, step + 0.02, deckFor(xW, step), xC, topY / 2, zc);
        }
      });
    })();
    /* --- palier du fond : régie, pop-corn et sortie sont de plain-pied avec la dernière rangée (jusqu'au mur du fond, sinon la régie flotte au-dessus du vide) --- */
    var backZ0 = ROWS[ROWS.length - 1], backZC = (backZ0 + HZ) / 2;
    box(g, HX * 2, BACK_H, HZ - backZ0 + 0.1, deckFor(HX * 2, HZ - backZ0), 0, BACK_H / 2, backZC);
    if (!P) box(g, HX * 2 - 1.4, 0.03, 0.05, trimM, 0, BACK_H, backZ0 + 0.025);

    /* --- feux d'allée au sol, à chaque bout de rangée (suivent le relief des gradins) --- */
    if (!P) ROWS.forEach(function (rz) { G0.aisleLights.forEach(function (ax) { box(g, 0.06, 0.04, 0.2, P ? aisleM : bas(0xffa040), ax, cinemaGroundY(ax, rz + 0.1) + 0.03, rz + 0.1); }); });

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
    if (!P) {   // premium : pas de cabine de projection (fenêtre + projecteur retirés)
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
    }
    // faisceau du projecteur retiré
    // comptoir à pop-corn
    var cw = new THREE.Group(); var PXc = -(HX - 3.2); cw.position.set(PXc, BACK_H, HZ - 0.45); g.add(cw); if (P) cw.visible = false;   // collé contre le mur du fond
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
    if (!P) room.colliders.push({ x: PXc - 1.0, z: HZ - 1.1, r: 0.8 }, { x: PXc, z: HZ - 1.1, r: 0.8 }, { x: PXc + 1.0, z: HZ - 1.1, r: 0.8 });
    // --- régie : la console du Patron / Co Fondateur, collée contre le mur du fond, à droite ---
    var RX = HX - 3.2, RZ = HZ - 0.5, EXZ = -HZ + 4.9;
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
    var exit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.375), new THREE.MeshBasicMaterial({ map: mkTex(exC) })); if (P) { exit.position.set(-HX + 0.06, 4.9, EXZ); exit.rotation.y = Math.PI / 2; } else { exit.position.set(0, BACK_H + 4.9, HZ - 0.06); exit.rotation.y = Math.PI; } g.add(exit);
    var exitDoor = world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.4, h: 3.2, label: '🚪 SORTIE', sub: 'RETOUR AU HALL', color: 0xff7a1a, target: 'hall', theme: P ? 'exitCinemaPremium' : 'exitCinema',
      enabled: function () { return !P || vipUp; } });   // premium : la sortie est au fond de l'étage VIP
    if (P) exit.visible = false;   // (premium : pas de panneau vert au-dessus de la porte)
    exitDoor.g.position.y = P ? 0 : BACK_H;   // la porte est au niveau du palier du fond, surélevé par les gradins
    if (P) { room.doors.splice(room.doors.indexOf(exitDoor), 1); g.remove(exitDoor.g); }   // premium : on sort par les portes du bas, pas par l'étage

    /* --- lumières : salle allumée avant la séance, baissées pendant --- */
    var amb = new THREE.AmbientLight(0xffe6d0, 0.95); g.add(amb);
    var key = new THREE.DirectionalLight(0xfff0e0, 0.3); key.position.set(0, 7, 6); g.add(key);
    /* --- étage VIP : dans chaque mur latéral, un trou donne sur un escalier tout simple (dans le mur) qui monte jusqu'à un second trou, au niveau d'un balcon de fauteuils de luxe --- */
    var vipUp = false, VY = 10.2, vipLights = [];
    (function buildVip() {
      if (!P) return;
      var vz0 = 9.5, vz1 = HZ - 0.15, vw = HX - 0.1, ZS0 = -8.4, ZT = 9.0, slope = VY / (ZT - ZS0), SW = 2.3, SZ0 = -10.6, SZ1 = 12.8, SH = VY + 3.4;
      var BH = { z0: -10.1, z1: -6.9, y0: 0, y1: 2.8 }, TH = { z0: 9.9, z1: 12.1, y0: VY, y1: VY + 2.8 };
      var VROWS = [11.5], VCOLS = [-10.15, -8.7, -7.25, -5.8, -4.35, -2.9, -1.45, 0, 1.45, 2.9, 4.35, 5.8, 7.25, 8.7, 10.15], T1 = 12.4, T2 = 14.2;
      var pill = std(0x1b1519, 0.4, 0.4), wallV = std(0x2a2230, 0.85, 0.1, 0x241c2e), gl2 = new THREE.MeshBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      var z2, sd2;
      // la dalle de l'étage, avec une marche pour chaque rangée de fauteuils
      box(g, vw * 2, 0.7, vz1 - vz0, std(0x050507, 0.9, 0.05), 0, VY - 0.35, (vz0 + vz1) / 2);
      box(g, vw * 2, 0.07, 0.12, trimM, 0, VY - 0.04, vz0 + 0.03);   // UNE seule barre dorée, à l'angle entre le mur de verre et le sol de l'étage (rien d'autre : la barrière invisible empêche de tomber)
      // fauteuils de luxe : trois rangées de douze
      VROWS.forEach(function (rz, ri) { VCOLS.forEach(function (cx3) { seat(cx3, rz, VY + ri * 0.2); seats[seats.length - 1].vip = true; }); });
      if (!low) [[-9, 13.5], [9, 13.5]].forEach(function (p) { var pl = new THREE.PointLight(0xffe2b8, 0.5, 16); pl.position.set(p[0], VY + 3.5, p[1]); g.add(pl); vipLights.push(pl); });

      // murs latéraux percés de deux trous (en bas : l'entrée de l'escalier ; en haut : la sortie sur le balcon)
      function holeWall(sd) {                       // mur latéral en morceaux autour des deux trous (aucune découpe en triangles : plus de fente ni de ligne dans le mur)
        var ry = sd < 0 ? Math.PI / 2 : -Math.PI / 2;
        function quad(z0, z1, y0, y1) {
          var m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), starMat(z1 - z0, y1 - y0)); m.position.set(sd * HX, (y0 + y1) / 2, (z0 + z1) / 2); m.rotation.y = ry; g.add(m);
          var m2 = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), wallV); m2.position.set(sd * (HX + 0.03), (y0 + y1) / 2, (z0 + z1) / 2); m2.rotation.y = ry + Math.PI; g.add(m2);   // face intérieure du puits : le mur est plein des deux côtés
        }
        quad(-ZF, TH.z0, 0, H);
        quad(TH.z0, TH.z1, 0, TH.y0); quad(TH.z0, TH.z1, TH.y1, H); quad(TH.z1, HZ, 0, H);
      }
      function frame(sd, h) {                       // cadre doré autour d'un trou
        var x = sd * (HX - 0.05), hh = h.y1 - h.y0, zc = (h.z0 + h.z1) / 2;
        box(g, 0.1, hh + 0.1, 0.1, trimM, x, (h.y0 + h.y1) / 2, h.z0 - 0.05); box(g, 0.1, hh + 0.1, 0.1, trimM, x, (h.y0 + h.y1) / 2, h.z1 + 0.05);
        box(g, 0.1, 0.1, h.z1 - h.z0 + 0.2, trimM, x, h.y1 + 0.05, zc);
      }
      function sign(sd, label, sub, y, z) {
        var sc2 = mkCanvas(512, 128), sx2 = sc2.getContext('2d'); sx2.fillStyle = '#0c1a48'; sx2.fillRect(0, 0, 512, 128); sx2.strokeStyle = '#ffd24a'; sx2.lineWidth = 6; sx2.strokeRect(4, 4, 504, 120);
        sx2.textAlign = 'center'; sx2.textBaseline = 'middle'; sx2.fillStyle = '#ffe9a8'; sx2.font = '800 48px ' + SERIF; sx2.fillText(label, 256, 52, 470); sx2.fillStyle = '#c9b46a'; sx2.font = '700 24px ' + MONO; sx2.fillText(sub, 256, 96, 470);
        var sg = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), new THREE.MeshBasicMaterial({ map: mkTex(sc2) })); sg.position.set(sd * (HX - 0.08), y, z); sg.rotation.y = sd < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sg);
      }
      // vitre sans tain : côté salle, un miroir sombre (on ne voit pas derrière) ; côté intérieur, une vitre claire (on voit toute la salle)
      var GZ = vz0 - 0.1, gy0 = BACK_H, gy1 = VY - 0.7, gH = gy1 - gy0, glassColl = [], glassOn = null;
      var dW = 1.4, dH = 2.5, STAFF = ['ystroz', 'alex', 'yohan81'];
      var outM = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.08, metalness: 0.95 }), inM = new THREE.MeshBasicMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.08, depthWrite: false });
      function pane(x0, x1, y0, y1) {                  // un morceau de vitre : miroir sombre côté salle, vitre claire côté salon
        var w0 = x1 - x0, h0 = y1 - y0, cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
        var a = new THREE.Mesh(new THREE.PlaneGeometry(w0, h0), outM); a.rotation.y = Math.PI; a.position.set(cx0, cy0, GZ); g.add(a);
        var b = new THREE.Mesh(new THREE.PlaneGeometry(w0, h0), inM); b.position.set(cx0, cy0, GZ + 0.02); g.add(b);
      }
      var doorM = std(0x0b0b0f, 0.45, 0.35), frameM = std(0x050507, 0.5, 0.4), handM = std(0x9a9aa2, 0.3, 0.8);
      var stC = mkCanvas(512, 128), stx = stC.getContext('2d'); stx.fillStyle = '#08080b'; stx.fillRect(0, 0, 512, 128); stx.strokeStyle = '#c9a227'; stx.lineWidth = 5; stx.strokeRect(4, 4, 504, 120);
      stx.textAlign = 'center'; stx.textBaseline = 'middle'; stx.fillStyle = '#f3d98a'; stx.font = '800 54px ' + SERIF; stx.fillText('ESPACE STAFF', 256, 66, 480);
      var stTex = mkTex(stC);
      function staffDoor(x0) {                         // une petite porte noire dans le mur, charnière à gauche
        var x1 = x0 + dW, cx0 = (x0 + x1) / 2, d = { x0: x0, x1: x1, cx: cx0, a: 0, coll: [] };
        box(g, 0.08, dH, 0.12, frameM, x0 - 0.04, gy0 + dH / 2, GZ); box(g, 0.08, dH, 0.12, frameM, x1 + 0.04, gy0 + dH / 2, GZ); box(g, dW + 0.16, 0.08, 0.12, frameM, cx0, gy0 + dH + 0.04, GZ);
        d.hinge = new THREE.Group(); d.hinge.position.set(x0, gy0, GZ); g.add(d.hinge);
        box(d.hinge, dW, dH - 0.02, 0.05, doorM, dW / 2, dH / 2, 0);
        box(d.hinge, 0.04, 0.3, 0.06, handM, dW - 0.15, dH * 0.47, -0.05); box(d.hinge, 0.04, 0.3, 0.06, handM, dW - 0.15, dH * 0.47, 0.05);
        [[Math.PI, -0.03], [0, 0.05]].forEach(function (o) { var sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: stTex })); sg.rotation.y = o[0]; sg.position.set(cx0, gy0 + dH + 0.35, GZ + o[1]); g.add(sg); });
        for (var cq = x0 + 0.25; cq <= x1 - 0.2; cq += 0.4) d.coll.push({ x: cq, z: GZ, r: 0.4 });
        return d;
      }
      var doors2 = [staffDoor(-HX + 1.2), staffDoor(HX - 1.2 - dW)];
      pane(-HX, doors2[0].x0, gy0, gy1); pane(doors2[0].x0, doors2[0].x1, gy0 + dH, gy1); pane(doors2[0].x1, doors2[1].x0, gy0, gy1); pane(doors2[1].x0, doors2[1].x1, gy0 + dH, gy1); pane(doors2[1].x1, HX, gy0, gy1);
      var wallColl = [], cxg;
      for (cxg = -HX + 0.3; cxg <= HX - 0.3; cxg += 0.5) { if (doors2.some(function (d) { return cxg > d.x0 - 0.15 && cxg < d.x1 + 0.15; })) continue; wallColl.push({ x: cxg, z: GZ, r: 0.4 }); }
      wallColl.forEach(function (c2) { room.colliders.push(c2); });
      // seuls le Patron et le Co Fondateur passent, et seulement par les portes. Une porte s'ouvre chez TOUT LE MONDE dès qu'un membre du staff
      // (toi ou un autre joueur) est devant : tout le monde la voit s'ouvrir et se refermer au même moment.
      room.glassCheck = function (w) {
        var staff = isCinemaCtrl(), on = !staff;
        if (on !== glassOn) { glassOn = on; doors2.forEach(function (d) { setColl(d.coll, on); }); }
        doors2.forEach(function (d) {
          var near = !!(w && staff && Math.hypot(w.player.x - d.cx, w.player.z - GZ) < 2.6);
          if (!near && w && w.remote) Object.keys(w.remote).forEach(function (k) {
            var r = w.remote[k]; if (!r || !r.person || STAFF.indexOf(String(r.name || '').toLowerCase()) < 0) return;
            var gp = r.person.group.position; if (Math.hypot(gp.x - d.cx, gp.z - GZ) < 2.6) near = true;
          });
          d.a += ((near ? -1.45 : 0) - d.a) * 0.12; d.hinge.rotation.y = d.a;
        });
      };
      // le salon : sol et plafond qui prennent la lumière, plafonniers
      var salonF = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ - GZ), std(0x17141c, 0.9, 0.05)); salonF.rotation.x = -Math.PI / 2; salonF.position.set(0, gy0 + 0.006, (GZ + HZ) / 2); g.add(salonF);
      var salonC = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ - GZ), std(0x1e1a24, 0.9, 0.05)); salonC.rotation.x = Math.PI / 2; salonC.position.set(0, gy1 - 0.006, (GZ + HZ) / 2); g.add(salonC);
      // (plus de petits plafonniers ronds visibles à travers la vitre : la lumière du salon vient des lampes invisibles ci-dessous)
      if (!low) [-18, -6, 6, 18].forEach(function (lx) { var pl = new THREE.PointLight(0xffe7c4, 0.9, 11); pl.position.set(lx, gy1 - 0.5, 14.6); g.add(pl); });
      (function staffDesk() {
        var DX = -8, DZ = HZ - 1.7, deskM = std(0x2a2328, 0.5, 0.2), darkK = std(0x18181c, 0.5, 0.3);
        box(g, 3.2, 0.06, 1.0, deskM, DX, gy0 + 0.76, DZ); box(g, 3.24, 0.03, 1.04, trimM, DX, gy0 + 0.79, DZ);                       // plateau du bureau
        [[-1.5, -0.42], [1.5, -0.42], [-1.5, 0.42], [1.5, 0.42]].forEach(function (lp) { box(g, 0.06, 0.74, 0.06, darkK, DX + lp[0], gy0 + 0.37, DZ + lp[1]); });
        box(g, 0.9, 0.025, 0.28, darkK, DX, gy0 + 0.81, DZ - 0.12);                                                                   // clavier
        for (var kk = 0; kk < 24; kk++) box(g, 0.055, 0.012, 0.055, std(0x34343c, 0.5, 0.2), DX - 0.4 + (kk % 12) * 0.073, gy0 + 0.83, DZ - 0.2 + Math.floor(kk / 12) * 0.09);
        box(g, 0.09, 0.03, 0.14, darkK, DX + 0.6, gy0 + 0.81, DZ - 0.1);                                                              // souris
        cyl(g, 0.3, 0.3, 0.5, std(0x1c1c22, 0.6, 0.2), DX, gy0 + 0.25, DZ - 0.8, 16); box(g, 0.6, 0.7, 0.1, std(0x1c1c22, 0.6, 0.2), DX, gy0 + 0.85, DZ - 1.12);   // fauteuil tourné vers le bureau et l'écran
        for (var dcx2 = DX - 1.5; dcx2 <= DX + 1.51; dcx2 += 0.5) room.colliders.push({ x: dcx2, z: DZ, r: 0.55 });   // on ne passe plus à travers le bureau
        room.colliders.push({ x: DX, z: DZ - 0.85, r: 0.35 });   // fauteuil
        // le grand écran au mur, derrière le bureau
        var SWm = 4.4, SHm = 2.48, wc = mkCanvas(1280, 720), wx = wc.getContext('2d'), wtex = mkTex(wc);
        var wscr = new THREE.Mesh(new THREE.PlaneGeometry(SWm, SHm), new THREE.MeshBasicMaterial({ map: wtex })); wscr.rotation.y = Math.PI; wscr.position.set(DX, gy0 + 2.22, HZ - 0.06); g.add(wscr);
        box(g, SWm + 0.2, SHm + 0.2, 0.06, std(0x0c0c10, 0.4, 0.4), DX, gy0 + 2.22, HZ - 0.02);
        var posterCache = {};
        function img(url) { if (!url) return null; if (posterCache[url]) return posterCache[url]; var im = new Image(); im.crossOrigin = 'anonymous'; im.src = url; posterCache[url] = im; return im; }
        function fmt(t) { t = Math.max(0, Math.floor(t || 0)); var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec; }
        function rrect(x, x0, y0, w0, h0, r0) { x.beginPath(); x.moveTo(x0 + r0, y0); x.lineTo(x0 + w0 - r0, y0); x.quadraticCurveTo(x0 + w0, y0, x0 + w0, y0 + r0); x.lineTo(x0 + w0, y0 + h0 - r0); x.quadraticCurveTo(x0 + w0, y0 + h0, x0 + w0 - r0, y0 + h0); x.lineTo(x0 + r0, y0 + h0); x.quadraticCurveTo(x0, y0 + h0, x0, y0 + h0 - r0); x.lineTo(x0, y0 + r0); x.quadraticCurveTo(x0, y0, x0 + r0, y0); x.closePath(); }
        function mmss(t) { t = Math.max(0, Math.floor(t || 0)); var m = Math.floor(t / 60), sec = t % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; }
        function paintWall() {
          var x = wx, playing = net.status === 'playing', paused = net.status === 'paused', f2 = filmOfTitle(net.title), ver = verOfTitle(net.title);
          x.fillStyle = '#0b0a0e'; x.fillRect(0, 0, 1280, 720);
          // en-tête comme la régie
          x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = '#e9c66b'; x.font = '800 30px ' + MONO; x.fillText('☰  RÉGIE DU CINÉMA', 34, 42);
          x.textAlign = 'right'; x.fillStyle = '#c9b46a'; x.font = '700 22px ' + MONO; x.fillText('Tropi Stream', 1246, 42); x.textAlign = 'left';
          // carte du film en cours
          rrect(x, 30, 80, 1220, 300, 22); x.fillStyle = '#16121a'; x.fill(); x.strokeStyle = 'rgba(233,198,107,0.55)'; x.lineWidth = 3; x.stroke();
          var px0 = 54, py0 = 100, ph0 = 260, pw0 = 173, pim = f2 && f2.poster ? img(f2.poster) : null;
          rrect(x, px0, py0, pw0, ph0, 12); x.fillStyle = '#231d26'; x.fill();
          if (pim && pim.complete && pim.naturalWidth) { x.save(); rrect(x, px0, py0, pw0, ph0, 12); x.clip(); x.drawImage(pim, px0, py0, pw0, ph0); x.restore(); }
          else { x.fillStyle = '#4b4452'; x.font = '700 60px ' + MONO; x.textAlign = 'center'; x.fillText('🎬', px0 + pw0 / 2, py0 + ph0 / 2); x.textAlign = 'left'; }
          var ix = 260, badge = playing ? ['● En cours', '#22c55e'] : paused ? ['❚❚ En pause', '#eab308'] : (net.url && net.title ? ['✓ Film chargé, prêt à lancer', '#38bdf8'] : ['■ Aucune séance en cours', '#9ca3af']);
          x.font = '800 24px ' + MONO; var bw = x.measureText(badge[0]).width + 36; rrect(x, ix, 104, bw, 42, 10); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fill(); x.fillStyle = badge[1]; x.fillText(badge[0], ix + 18, 126);
          var title = (net.title || '').replace(/\s*\[(VF|VO)\]\s*$/, '') || 'Choisis un film dans la playlist', fs2 = 46;
          x.font = '800 ' + fs2 + 'px ' + SERIF; while (x.measureText(title).width > 820 && fs2 > 26) { fs2 -= 2; x.font = '800 ' + fs2 + 'px ' + SERIF; }
          x.fillStyle = '#f5ecd2'; x.fillText(title, ix, 188);
          var tw = x.measureText(title).width;
          if (ver) { x.font = '800 22px ' + MONO; rrect(x, ix + tw + 16, 172, 56, 32, 6); x.fillStyle = '#ea580c'; x.fill(); x.fillStyle = '#fff'; x.fillText(ver, ix + tw + 26, 189); }
          if (f2) { x.fillStyle = '#a8a29e'; x.font = '600 24px ' + MONO; x.fillText((f2.annee ? f2.annee + '  ·  ' : '') + (f2.genres || []).slice(0, 3).join(' · '), ix, 236); }
          var dur = video.duration, pos = paused ? net.position : netPosNow(), hasDur = !!net.title && isFinite(dur) && dur > 0;
          rrect(x, ix, 276, 960, 14, 7); x.fillStyle = '#2a2530'; x.fill();
          if (hasDur) { rrect(x, ix, 276, Math.max(14, 960 * Math.min(1, pos / dur)), 14, 7); x.fillStyle = '#f97316'; x.fill(); }
          x.fillStyle = '#d6d3d1'; x.font = '700 26px ' + MONO; x.fillText(net.title ? mmss(pos) : '—', ix, 328);
          if (hasDur) { x.textAlign = 'right'; x.fillText('-' + mmss(dur - pos) + '  ·  ' + mmss(dur), ix + 960, 328); x.textAlign = 'left'; }
          // image du film en direct
          x.fillStyle = '#c9a227'; x.font = '800 22px ' + MONO; x.fillText('IMAGE EN DIRECT', 34, 412);
          var vx0 = 30, vy0 = 430, vw0 = 480, vh0 = 270; x.fillStyle = '#000'; x.fillRect(vx0, vy0, vw0, vh0);
          var drew = false;
          var srcV = inAd() ? adVideo : video;             // pendant la pub avant le film, l'image en direct montre la pub
          if ((playing || paused) && srcV.readyState >= 2 && srcV.videoWidth) { try { x.drawImage(srcV, vx0, vy0, vw0, vh0); drew = true; } catch (e) { /* ok */ } }
          if (!drew) { x.fillStyle = '#5a5a66'; x.font = '600 24px ' + MONO; x.textAlign = 'center'; x.fillText(net.url ? 'Pas encore lancé' : 'Aucun film chargé', vx0 + vw0 / 2, vy0 + vh0 / 2); x.textAlign = 'left'; }
          x.strokeStyle = 'rgba(233,198,107,0.6)'; x.lineWidth = 2; x.strokeRect(vx0, vy0, vw0, vh0);
          // prochaines séances
          var sx0 = 560; x.fillStyle = '#c9a227'; x.font = '800 22px ' + MONO; x.fillText('PROCHAINES SÉANCES', sx0, 412);
          var sch = (net.schedule || []).slice(0, 6);
          if (!sch.length) { x.fillStyle = '#6b6b75'; x.font = '600 22px ' + MONO; x.fillText('Aucune séance programmée', sx0, 460); }
          sch.forEach(function (it, i2) {
            var d0 = new Date(it.at), hh = (d0.getHours() < 10 ? '0' : '') + d0.getHours() + 'h' + (d0.getMinutes() < 10 ? '0' : '') + d0.getMinutes(), y2 = 448 + i2 * 44;
            rrect(x, sx0, y2 - 18, 690, 38, 8); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill();
            var tt = String(it.title || '').replace(/\s*\[(VF|VO)\]\s*$/, ''); if (tt.length > 38) tt = tt.slice(0, 37) + '…';
            x.fillStyle = '#e9c66b'; x.font = '800 21px ' + MONO; x.fillText(hh, sx0 + 14, y2 + 1); x.fillStyle = '#e5dcc3'; x.font = '600 21px ' + MONO; x.fillText(tt, sx0 + 110, y2 + 1);
          });
          wtex.needsUpdate = true;
        }
        var wallT = 0;
        room.staffWall = function (dt) {                 // seul le staff voit l'écran (pour les autres il reste éteint)
          var staff = isCinemaCtrl(); wscr.visible = staff;
          if (!staff) return;
          if (!playlist && !playlistLoading) loadPlaylist();       // pour afficher l'affiche et les infos du film
          wallT += dt; if (wallT > 0.12) { wallT = 0; paintWall(); }
        };
        var deskHit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.8, 2.4), hitM); deskHit.position.set(DX, gy0 + 1.9, DZ + 0.3); g.add(deskHit);   // clic gauche sur le bureau ou l'écran
        room._deskInfo = { DX: DX, DZ: DZ, EY: gy0 + 1.35, WY: gy0 + 2.22, WZ: HZ - 0.06, SW: SWm, SH: SHm };
        room.interactables.push({ hit: deskHit, x: DX, z: DZ - 0.9, radius: 1.3, enabled: function () { return isCinemaCtrl() && !vipUp; }, prompt: function () { return '🎛️ Bureau staff — la régie sur le grand écran  [F / clic]'; }, use: function (w) { deskEnter(w || world); } });
      })();
      var gate = [], edge = [];
      // l'étage VIP : une porte normale de chaque côté (en bas) qui emmène sur le balcon, et une de chaque côté du balcon pour redescendre
      [1].forEach(function (sd) {                          // seulement le côté droit : les portes de gauche (étage VIP, sortie, descendre) sont retirées
        var yIn = F.yawFor(-sd, 0);
        // en bas : « Étage VIP » et « Sortie » côte à côte, juste à côté de la porte du staff, sur la vitre du fond (loin de l'écran)
        var DZV = 1.4, DZO = -2.7;   // les deux portes sont dans le mur de droite, juste avant le début des marches (hors de vue quand on est assis face à l'écran)
        var dVip = world.addDoor(room, { x: sd * HX, z: DZV, nx: -sd, nz: 0, w: 2.0, h: 2.9, label: '👑 ÉTAGE VIP', sub: 'FAUTEUILS DE LUXE', color: 0xffd86b, theme: 'cinemavip',
          enabled: function () { return !vipUp; }, go: function (w) { w.teleport(sd * (HX - 2.6), 11.5, yIn, function () { setVip(true); }); } });
        var dOut = world.addDoor(room, { x: sd * HX, z: DZO, nx: -sd, nz: 0, w: 1.9, h: 2.8, label: '🚪 SORTIE', sub: 'RETOUR AU HALL', color: 0xff7a1a, target: 'hall', theme: 'exitCinemaPremium',
          enabled: function () { return !vipUp; } });
        dVip.g.position.y = 0; dOut.g.position.y = 0;
        // à l'étage : la porte pour redescendre, qui ramène devant la porte « Étage VIP » du bas
        var upD = world.addDoor(room, { x: sd * HX, z: 11.5, nx: -sd, nz: 0, w: 2.2, h: 3.0, label: '⬇ DESCENDRE', sub: 'RETOUR EN BAS', color: 0xffd86b, theme: 'cinemavip',
          enabled: function () { return vipUp; }, go: function (w) { w.teleport(sd * (HX - 2.4), DZV, F.yawFor(-sd, 0), function () { setVip(false); }); } });
        upD.g.position.y = VY;
        // un palier de marbre bordé de laiton devant la porte de l'étage : la porte repose dessus
        var landM = std(0x1a1520, 0.35, 0.4), lx = sd * (HX - 1.3);
        box(g, 2.6, 0.03, 3.4, landM, lx, VY + 0.015, 11.5);
        box(g, 2.6, 0.036, 0.05, brassM, lx, VY + 0.017, 11.5 - 1.7); box(g, 2.6, 0.036, 0.05, brassM, lx, VY + 0.017, 11.5 + 1.7);
        box(g, 0.05, 0.036, 3.4, brassM, sd * (HX - 2.6), VY + 0.017, 11.5);
      });
      for (var ex2 = -(vw - 0.5); ex2 <= vw - 0.45; ex2 += 0.6) edge.push({ x: ex2, z: vz0 + 0.1, r: 0.5 });     // bord de l'étage : on ne tombe pas
                                          // on peut entrer dans les puits
      function setColl(list, on) { list.forEach(function (c2) { var ix = room.colliders.indexOf(c2); if (on && ix < 0) room.colliders.push(c2); else if (!on && ix >= 0) room.colliders.splice(ix, 1); }); }
      function setVip(v) { vipUp = v; setColl(edge, v); setColl(gate, !v); }
      var baseGround = room.groundY, lz = null;
      setVip(false);
      room.resetVip = function () { setVip(false); lz = null; };
      room.enterVip = function () { setVip(true); lz = null; };
      room.level = function () { return vipUp ? 1 : 0; };
      exitDoor.g.position.y = VY + 0.4;                    // collée au fond du balcon, sur la dernière marche
      function topK(k) { if (k < 0) return 0; var zc = ZS0 + k * 0.45 + 0.225; return zc >= ZT ? VY : slope * (zc - ZS0); }
      function stairH(z) {                             // hauteur de la marche sous les pieds (même dessus que les marches dessinées), raccord doux entre deux marches
        if (z <= ZS0) return 0; if (z >= ZT) return VY;
        var u = (z - ZS0) / 0.45, k = Math.floor(u), f = (u - k) * 0.45, cur = topK(k);
        if (f < 0.05) return topK(k - 1) + (cur - topK(k - 1)) * smoothT((f + 0.05) / 0.1);
        if (f > 0.4) return cur + (topK(k + 1) - cur) * smoothT((f - 0.4) / 0.1);
        return cur;
      }
      function vipGround(x, z, up) {
        var ax = Math.abs(x);
        var room0 = function (xx) { return (up && z > vz0 - 0.05 && z < vz1 + 0.2 && Math.abs(xx) < vw + 0.2) ? VY : baseGround(xx, z); };   // le balcon, ou les gradins
        if (ax > HX) {                                                                                  // dans le puits : marches, puis palier du haut, en se raccordant en douceur au sol de la salle
          var inside = stairH(z), k = smoothT((ax - HX) / 0.8);
          return room0(x < 0 ? -HX : HX) * (1 - k) + inside * k;
        }
        return room0(x);
      }
      room.groundY = function (x, z) { return vipGround(x, z, vipUp); };
      var tpLock = 0;
      room.vipTrack = function (x, z, w) {
        // on passe le trou du bas → on arrive en haut sur le balcon ; le trou du haut → on redescend devant le trou du bas
        if (w && !w.trans && performance.now() > tpLock && Math.abs(x) > HX + 0.35) {
          var sd3 = x < 0 ? -1 : 1, up2 = z < 0; tpLock = performance.now() + 1500;
          w.teleport(sd3 * (HX - 2.2), up2 ? (TH.z0 + TH.z1) / 2 : (BH.z0 + BH.z1) / 2, F.yawFor(-sd3, 0), function () { setVip(up2); lz = null; });
          return;
        }                // en haut dès qu'on a monté toutes les marches, en bas dès qu'on repasse en dessous
        if (lz !== null && Math.abs(x) > HX) { if (lz < ZT && z >= ZT && !vipUp) setVip(true); else if (lz >= ZT && z < ZT && vipUp) setVip(false); }
        lz = z;
      };
      room.remoteGroundY = function (r, x, z) {         // les autres joueurs : même règle ; assis à l'étage, ils sont dessinés à l'étage
        var st = r && r.seat >= 0 ? seats[r.seat] : null;
        if (st && st.vip) return st.y;
        r._vip = (r.lv || 0) > 0;                       // chaque joueur envoie son étage (on y monte par des portes, plus par un escalier)
        r._lz = z;
        return vipGround(x, z, !!r._vip);
      };
    })();
    var lights = [];
    if (!low) (P ? [[-12, 11, -9], [12, 11, -9], [-12, 11, 1], [12, 11, 1], [0, 11, -4], [0, 11, 12]] : [[-6, 6.8, -3], [6, 6.8, -3], [0, 6.8, 6]]).forEach(function (p) { var pl = new THREE.PointLight(P ? 0xe8dcff : 0xffd9a8, 0.55, P ? 28 : 16); pl.position.set(p[0], p[1], p[2]); g.add(pl); lights.push(pl); });
    var wash = new THREE.PointLight(0xaec8ff, 0, 18); wash.position.set(0, SCR_Y + SCR_H / 2, -ZF + 3.2); g.add(wash);    // reflet bleuté de l'écran sur les premières rangées
    var dim = 1;                                       // 1 = salle allumée, 0,22 = séance en cours

    /* ===================== LE FILM : partagé par le serveur (api/cinema.js) ===================== */
    // Seuls le Patron et le Co Fondateur choisissent le lien et lancent/coupent la séance (console RÉGIE ou écran) ;
    // tout le monde reçoit le même état (lien, lecture/pause, position) environ une fois par seconde.
    function isCinemaCtrl() {
      var boss = false, co = false;
      try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); co = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) { /* ok */ }
      return boss || co || (P && !!(F.isStaff && F.isStaff()));   // cinéma premium : le Staff a aussi la régie (le serveur revérifie)
    }
    var video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.preload = 'auto';   // on charge le film d'avance, même avant le lancement video.playsInline = true; video.setAttribute('playsinline', ''); video.loop = false;
    var vtex = new THREE.VideoTexture(video); vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    var net = { url: '', type: 'mp4', status: 'idle', position: 0, recvAt: performance.now(), busy: false, lastSrc: '', title: '', schedule: [], ad: null };
    function showVideo(on) { screenM.map = on ? vtex : posterTex; screenM.needsUpdate = true; }
    /* --- pub avant le film (cinéma gratuit) : le serveur tire la pub et met la séance à -durée ; tant que la position est négative,
       l'écran montre la pub (2e lecteur) et le film attend, chargé, à 0:00. --- */
    var adVideo = document.createElement('video');
    adVideo.crossOrigin = 'anonymous'; adVideo.preload = 'auto'; adVideo.playsInline = true; adVideo.setAttribute('playsinline', '');
    var adTex = new THREE.VideoTexture(adVideo); adTex.minFilter = THREE.LinearFilter; adTex.magFilter = THREE.LinearFilter; adTex.generateMipmaps = false;
    var adHls = null, adSrc = '';
    function showAd() { if (screenM.map !== adTex) { screenM.map = adTex; screenM.needsUpdate = true; } }
    function inAd() { return !!(net.ad && (net.status === 'playing' || net.status === 'paused') && netPosNow() < 0); }
    function setAdSource(url, type) {
      adSrc = url;
      if (adHls) { try { adHls.destroy(); } catch (e) { /* ok */ } adHls = null; }
      // hls.js dès que le navigateur a MediaSource : Chrome répond « maybe » à canPlayType HLS sans toujours savoir le lire ; lecture native seulement sans MediaSource (iPhone)
      if (url && type === 'hls' && (window.MediaSource || window.ManagedMediaSource || !adVideo.canPlayType('application/vnd.apple.mpegurl'))) {
        loadHlsLib(function (Hls) {
          if (!Hls || adSrc !== url) return;
          adHls = new Hls({ maxBufferLength: 60 });
          adHls.on(Hls.Events.ERROR, function (ev, data) { if (data && data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) { try { adHls.startLoad(); } catch (e) { /* ok */ } } });
          adHls.loadSource(url); adHls.attachMedia(adVideo);
        });
      } else { adVideo.src = url || ''; try { adVideo.load(); } catch (e) { /* ok */ } }
    }
    var adWas = false;
    function stopAd() {
      if (!adVideo.paused) adVideo.pause();
      if (adWas && net.status === 'playing') {          // fin de la pub : le film part tout de suite (sans attendre le prochain relevé du serveur) ;
        adWas = false;                                  // la dernière image de la pub reste à l'écran jusqu'à la 1re image du film (évènement « playing »)
        try { if (video.currentTime > 0.5) video.currentTime = 0; } catch (e) { /* ok */ }
        var p = video.play(); if (p && p.catch) p.catch(function () { /* geste requis */ });
        return;
      }
      adWas = false;
      if (screenM.map === adTex) showVideo(net.status === 'paused');
    }
    // applique la pub : true si elle occupe l'écran (le film ne doit alors rien faire)
    function applyAd() {
      if (P) return false;                              // le cinéma premium n'a jamais de pub
      if (!inAd()) { stopAd(); return false; }
      if (adSrc !== net.ad.url) setAdSource(net.ad.url, net.ad.type);
      setLoading(false); stallT = 0;
      if (!video.paused) video.pause();                            // le film attend à 0:00, déjà chargé
      if (video.readyState >= 1 && video.currentTime > 0.5 && !video.seeking) { try { video.currentTime = 0; } catch (e) { /* ok */ } }
      var t = net.ad.dur + netPosNow();
      if (adVideo.readyState >= 1 && !adVideo.seeking && Math.abs(adVideo.currentTime - t) > (net.status === 'playing' ? 1.5 : 0.4)) { try { adVideo.currentTime = Math.max(0, t); } catch (e) { /* ok */ } }
      if (net.status === 'playing') { ensureVideoAudio(); if (adVideo.paused) { var p = adVideo.play(); if (p && p.catch) p.catch(function () { /* geste requis */ }); } }
      else if (!adVideo.paused) adVideo.pause();
      if (adVideo.readyState >= 2) showAd();
      adWas = true;
      return true;
    }
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
    // flux interrompu (réseau, coupure du relais) : on recharge le film et on reprend pile au bon moment, sans rien couper pour les autres
    var recoverN = 0, recoverAt = 0;
    function recoverVideo() {
      if (!net.url) return;
      var now = performance.now();
      if (now - recoverAt > 60000) recoverN = 0;
      if (recoverN >= 4) { world.flash('🎬 Ce lien n\'a pas pu être lu.', 'Vérifie l\'adresse depuis la régie.'); return; }
      recoverN++; recoverAt = now;
      setTimeout(function () {
        if (!net.url) return;
        setSource(net.url, net.type);
        video.addEventListener('loadedmetadata', function () {
          try { video.currentTime = Math.max(0, net.status === 'playing' ? netPosNow() : net.position); } catch (e) { /* ok */ }
          if (net.status === 'playing') { var p = video.play(); if (p && p.catch) p.catch(function () { /* geste requis */ }); }
        }, { once: true });
      }, 700 * recoverN);
    }
    video.addEventListener('error', function () { if (!net.url) return; if (net.status === 'playing' || net.status === 'paused') recoverVideo(); else world.flash('🎬 Ce lien n\'a pas pu être lu.', 'Vérifie l\'adresse depuis la régie.'); });
    var endedUrl = '', lastSt = null, stallT = 0, started = false, bufEl = null, lastSeekAt = 0;
    // fin du film : chez tout le monde on revient à l'écran de base (aucune séance), et le Patron/Co Fondateur coupe la séance pour tout le monde
    video.addEventListener('ended', function () {
      var dur = video.duration, realEnd = isFinite(dur) && dur > 0 && video.currentTime >= dur - 8 && netPosNow() >= dur - 15;
      if (!realEnd) { recoverVideo(); return; }                         // fin « anticipée » = flux coupé : on recharge, la séance continue pour tout le monde
      endedUrl = net.url; if (isCinemaCtrl() && net.status === 'playing') cinemaAction('stop'); if (lastSt) applyNet(lastSt);
    });
    // écran de chargement tant que le flux met en mémoire tampon (extraction Tropi Stream + démarrage du flux, parfois plusieurs secondes)
    // (l'écran de chargement n'apparaît qu'après une vraie coupure d'une seconde, voir room.update : plus de rond qui clignote pour un micro-ralentissement)
    video.addEventListener('playing', function () { stallT = 0; started = true; if (net.status === 'playing') { setLoading(false); showVideo(true); } });
    /* --- son en 3D : le film s'entend d'où est l'écran (panoramique gauche/droite, plus étouffé loin/derrière) ; si WebAudio échoue, on retombe sur video.volume --- */
    var vAudio = { ctx: null, pan: null, lp: null, gain: null, ok: false, pl: null, pr: null };
    room._ensureAudio = ensureVideoAudio; room._vAudio = vAudio; room._video = video;   // (pour les tests)
    room._adVideo = adVideo; room._screen = function () { return screenM.map === adTex ? 'pub' : screenM.map === vtex ? 'film' : 'affiche'; };
    function filmVol() { var mv = typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5; return 2.3 * mv; }   // volume général du site : 50 % = volume normal du film
    function ensureVideoAudio() {
      if (vAudio.ctx || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        var c = vAudio.ctx = new AC(), src = c.createMediaElementSource(video);
        // son en stéréo, directement dans les deux oreilles (casque ou enceintes) : la voie gauche du film à gauche, la droite à droite, au même volume partout dans la salle.
        // Un compresseur doux rapproche les dialogues et les explosions : on entend tout clairement sans devoir monter le son.
        var pre = c.createGain(); pre.channelCount = 2; pre.channelCountMode = 'explicit'; pre.channelInterpretation = 'speakers';
        var comp = c.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 20; comp.ratio.value = 2.5; comp.attack.value = 0.006; comp.release.value = 0.3;
        vAudio.gain = c.createGain(); vAudio.gain.gain.value = filmVol();
        var lim = c.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
        src.connect(pre); pre.connect(comp); comp.connect(vAudio.gain); vAudio.gain.connect(lim); lim.connect(c.destination);
        try { c.createMediaElementSource(adVideo).connect(pre); adVideo.volume = 1; } catch (e) { /* la pub garde adVideo.volume */ }   // la pub passe par le même son que le film
        vAudio.ok = true; video.volume = 1;
      } catch (e) { vAudio.ctx = null; vAudio.ok = false; /* on garde video.volume */ }
    }
    function setEars(w) {                              // l'oreille (écouteur) est à la tête du joueur, tournée comme son regard
      if (!vAudio.ok) return;
      var L = vAudio.ctx.listener, px = w.player.x, pz = w.player.z, py = 1.6 + cinemaGroundY(px, pz), fx2 = Math.sin(w.player.yaw), fz2 = -Math.cos(w.player.yaw);
      if (L.positionX) { L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz; L.forwardX.value = fx2; L.forwardY.value = 0; L.forwardZ.value = fz2; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(px, py, pz); L.setOrientation(fx2, 0, fz2, 0, 1, 0); }
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
      net.capacity = st.capacity || 0; net.present = st.present || 0;
      net.title = st.title || ''; net.schedule = Array.isArray(st.schedule) ? st.schedule : [];
      net.ad = st.ad && st.ad.url ? st.ad : null;
      if (st.status !== 'playing') endedUrl = '';
      net.status = (st.status === 'playing' && net.url && net.url === endedUrl) ? 'idle' : (st.status || 'idle');   // film terminé chez moi : écran de base, même si le serveur n'a pas encore coupé
      if (net.url !== net.lastSrc) { net.lastSrc = net.url; endedUrl = st.status === 'playing' ? '' : endedUrl; setSource(net.url, net.type); }
      if (!seanceAsked) { seanceAsked = true; if (net.status === 'playing') announceSeance(); }
      if (applyAd()) { refreshConsole(); renderSchedule(); return; }   // pub en cours : le film attend
      if (net.status === 'playing') {
        ensureVideoAudio();
        var drift = netPosNow() - video.currentTime, nowT = performance.now();
        if (video.seeking || video.readyState < 3) { /* recherche ou chargement en cours : surtout pas une 2e recherche par-dessus (c'est ce qui bloquait tout) */ }
        else if (Math.abs(drift) > 2.5) { if (nowT - lastSeekAt > 4000) { lastSeekAt = nowT; video.currentTime = Math.max(0, netPosNow() + 1.0); } }   // gros écart : une seule recherche, un peu en avance pour compenser le chargement
        else if (Math.abs(drift) > 0.4) video.playbackRate = drift > 0 ? 1.06 : 0.94;  // petit écart : on rattrape en douceur
        else if (video.playbackRate !== 1) video.playbackRate = 1;
        if (video.readyState >= 3) showVideo(true);
        var p = video.play(); if (p && p.catch) p.catch(function () { /* geste requis : la lecture reprendra au prochain geste de l'utilisateur */ });
      } else {
        setLoading(false); stallT = 0;
        if (!video.paused) video.pause();
        if (video.playbackRate !== 1) video.playbackRate = 1;
        if (net.status === 'paused') { showVideo(true); if (!video.seeking && Math.abs(video.currentTime - net.position) > 0.4) video.currentTime = net.position; }
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
    function capSync(setInput) {                         // régie : place max et nombre de personnes présentes
      if (!consoleEl) return;
      var ci = consoleEl.querySelector('input[data-cap]'), inf = consoleEl.querySelector('[data-r="capinfo"]');
      if (ci && (setInput || document.activeElement !== ci)) ci.value = net.capacity || 0;
      if (inf) inf.textContent = '· ' + (net.present || 0) + (net.capacity ? ' / ' + net.capacity : '') + ' présent(s)';
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
          '<div class="cin-cn-seek">' +
            '<span class="cin-seek-l"><i class="fa-solid fa-clock"></i> Choisir le moment du film</span>' +
            '<div class="cin-seek-f"><input class="cin-sk" data-k="h" type="number" min="0" max="23" value="0" aria-label="heures"><b>h</b><input class="cin-sk" data-k="m" type="number" min="0" max="59" value="0" aria-label="minutes"><b>min</b><input class="cin-sk" data-k="s" type="number" min="0" max="59" value="0" aria-label="secondes"><b>s</b></div>' +
            '<div class="cin-seek-b"><button data-a="seek" title="Se placer à ce moment, sans changer lecture / pause"><i class="fa-solid fa-forward"></i> Aller à ce moment</button><button data-a="seek-play" title="Se placer à ce moment et lancer la lecture"><i class="fa-solid fa-play"></i> Lancer à ce moment</button></div>' +
            '<div class="cin-seek-q"><button data-a="seek-rel" data-d="-600">−10 min</button><button data-a="seek-rel" data-d="-10">−10 s</button><button data-a="seek-rel" data-d="10">+10 s</button><button data-a="seek-rel" data-d="600">+10 min</button><button data-a="seek-rel" data-d="1800">+30 min</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="cin-cn-seek">' +
            '<span class="cin-seek-l"><i class="fa-solid fa-users"></i> Places dans la salle <small data-r="capinfo"></small></span>' +
            '<div class="cin-seek-f"><input class="cin-sk" data-cap="1" type="number" min="0" max="500" value="0" aria-label="nombre de places"><b>places (0 = illimité)</b></div>' +
            '<div class="cin-seek-b"><button data-a="cap-set"><i class="fa-solid fa-check"></i> Enregistrer</button><button data-a="cap-none">Illimité</button></div>' +
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
        if (a === 'cap-set' || a === 'cap-none') {
          var ci = consoleEl.querySelector('input[data-cap]'), cv = a === 'cap-none' ? 0 : Math.max(0, Math.min(500, parseInt(ci && ci.value, 10) || 0));
          cinemaAction('set_capacity', { capacity: cv }).then(function (r) { if (r && r.ok) { capSync(true); world.flash(cv ? '👥 Salle limitée à ' + cv + ' personnes.' : '👥 Nombre de places illimité.'); } });
          return;
        }
        if (a === 'seek-rel') {                          // saut rapide à partir du moment actuel du film
          if (!net.url) { world.flash('🎬 Charge d\'abord un film.'); return; }
          var base = net.status === 'playing' ? netPosNow() : (net.position || 0), dd2 = parseInt(b.getAttribute('data-d'), 10) || 0, maxT = isFinite(video.duration) && video.duration > 0 ? video.duration - 2 : 86400;
          cinemaAction('seek', { position: Math.max(0, Math.min(maxT, Math.round(base + dd2))) });
          return;
        }
        if (a === 'seek' || a === 'seek-play') {                       // aller à l'heure / minute / seconde choisie
          if (!net.url) { world.flash('🎬 Charge d\'abord un film.'); return; }
          var gv = function (k) { var el = consoleEl.querySelector('.cin-sk[data-k="' + k + '"]'); return Math.max(0, parseInt(el && el.value, 10) || 0); };
          cinemaAction('seek', { position: gv('h') * 3600 + gv('m') * 60 + gv('s'), play: a === 'seek-play' });
          return;
        }
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
      consoleEl.querySelector('.cin-cn-url').value = net.url || ''; capSync(true);
      (function () { var t = Math.max(0, Math.floor(netPosNow())), vals = { h: Math.floor(t / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 }; ['h', 'm', 's'].forEach(function (k) { var el = consoleEl.querySelector('.cin-sk[data-k="' + k + '"]'); if (el) el.value = vals[k]; }); })();   // les cases partent du moment actuel
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
    var music = createMusic(P), cur = null, view = { yaw: 0, pitch: 0 }, standEl = null;
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
    room.sitSpec = { y: 0.07, z: 0.28 };   // fauteuil à 0,57 m
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z + 0.04, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!cur) return;
      view.yaw = clamp(drag.seat.yaw - dx * 0.006, -1.5, 1.5);
      if (drag.mouse) view.pitch = clamp(drag.seat.pitch - dy * 0.004, -0.5, 0.5);
    };
    // caméra : à hauteur des yeux d'une personne assise, tournée vers le milieu de l'écran ; on regarde autour à la souris
    // assis au bureau du staff : la caméra regarde le grand écran du mur, et la régie y est affichée (posée exactement sur l'écran)
    var deskMode = false;
    function onDeskKey(e) { if (deskMode && e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); deskLeave(); } }
    function deskEnter(w) {
      if (deskMode || cur || !isCinemaCtrl() || !room._deskInfo || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      deskMode = true; w.sitDown(room);
      window.addEventListener('keydown', onDeskKey, true);
      mountConsole(); if (!consoleEl) return;
      consoleEl.classList.add('cin-wall');
      if (consoleEl.classList.contains('hid')) toggleConsole();
    }
    function deskLeave() {
      if (!deskMode) return;
      deskMode = false; window.removeEventListener('keydown', onDeskKey, true);
      if (consoleEl) { consoleEl.classList.remove('cin-wall'); consoleEl.style.left = consoleEl.style.top = consoleEl.style.transform = ''; closeConsole(); }
      var di = room._deskInfo; if (di) world.standUp(di.DX, di.DZ - 1.7, Math.PI);
    }
    var deskV = new THREE.Vector3();
    function deskPlaceConsole() {                     // la régie suit exactement le grand écran (projection de ses 4 coins à l'écran du joueur)
      if (!deskMode || !consoleEl) return;
      if (consoleEl.classList.contains('hid')) { deskLeave(); return; }
      var di = room._deskInfo, cam = world.camera, rc = world.renderer.domElement.getBoundingClientRect(), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        deskV.set(di.DX + c[0] * di.SW / 2, di.WY + c[1] * di.SH / 2, di.WZ).project(cam);
        var px = rc.left + (deskV.x + 1) / 2 * rc.width, py = rc.top + (1 - deskV.y) / 2 * rc.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      });
      var sc = Math.min((x1 - x0) / 1100, (y1 - y0) / 619);
      consoleEl.style.left = (x0 + ((x1 - x0) - 1100 * sc) / 2) + 'px'; consoleEl.style.top = (y0 + ((y1 - y0) - 619 * sc) / 2) + 'px'; consoleEl.style.transform = 'scale(' + sc.toFixed(4) + ')';
    }
    room.seatPose = function (dt, ctx) {
      if (deskMode && room._deskInfo) { var dI = room._deskInfo; return { cx: dI.DX, cy: dI.EY + 0.25, cz: dI.DZ - 2.3, tx: dI.DX, ty: dI.WY, tz: dI.WZ, fov: 50 }; }
      if (!cur) return null;
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.3; }
      var ex = cur.x, ey = (P ? 1.78 : 1.34) + (cur.y || 0), ez = cur.z - 0.04, ty0 = SCR_Y + SCR_H * 0.48, tz0 = -ZF + 0.16;
      var a = Math.atan2(0 - ex, -(tz0 - ez)) + view.yaw, p = Math.atan2(ty0 - ey, Math.hypot(ex, tz0 - ez)) + view.pitch + (P ? 0.08 : 0);
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: P ? 70 : 66 };
    };

    /* ===================== INTERFACE ===================== */
    room.hint = function (w) {
      var ctrl = isCinemaCtrl();
      if (w.touch) return 'Joystick : marcher · touche un fauteuil pour s’asseoir' + (ctrl ? ' · touche la régie au fond à droite pour choisir le film' : '');
      return 'ZQSD / flèches : marcher · Maj : courir · avance vers un fauteuil et appuie sur F pour t\'asseoir' + (ctrl ? ' · F sur la régie (fond à droite) : choisir le film' : '') + (w.full ? ' · Échap : quitter' : '');
    };
    room.spawn = function () { return P ? { x: HX - 3.2, z: -0.5, yaw: F.yawFor(-1, 0) } : { x: 0, z: HZ - 2.6, yaw: 0 }; };   // premium : on arrive en bas, entre la porte de l'étage VIP et la sortie
    function kickMusic() { if (music.up && !music.ctx) music.start(); }
    room.onEnter = function () {
      seanceAsked = false; beatT = 0; room._curtT0 = performance.now(); if (room.resetVip) room.resetVip();
      music.start(); mountEye();
      if (world.container) world.container.classList.add('cin-in-cinema');
      window.addEventListener('pointerdown', kickMusic, true); window.addEventListener('keydown', kickMusic, true);   // le navigateur peut exiger un geste avant le son
      window.addEventListener('keydown', onKeyL, true);
      pollCinema();
    };
    function leave() {
      bye(); deskLeave(); stand(); if (room.resetVip) room.resetVip(); try { video.pause(); } catch (e) { /* ok */ }   // on ne coupe que chez soi : la séance continue pour les autres
      music.stop(); unmountEye(); unmountConsole();
      if (world.container) world.container.classList.remove('cin-in-cinema', 'cin-seated');
      window.removeEventListener('pointerdown', kickMusic, true); window.removeEventListener('keydown', kickMusic, true);
      window.removeEventListener('keydown', onKeyL, true);
      if (bufEl && bufEl.parentNode) bufEl.parentNode.removeChild(bufEl); bufEl = null;
      clearTimeout(seanceCardT); if (seanceCardEl && seanceCardEl.parentNode) seanceCardEl.parentNode.removeChild(seanceCardEl); seanceCardEl = null;
    }
    room.onLeave = leave;
    room.onPause = function () { video.pause(); adVideo.pause(); music.stop(); unmountEye(); if (world.container) world.container.classList.remove('cin-in-cinema'); window.removeEventListener('keydown', onKeyL, true); };
    room.onPageHide = function () { video.pause(); adVideo.pause(); };
    room.onResume = function () { if (world.room === room) { music.start(); mountEye(); if (world.container) world.container.classList.add('cin-in-cinema'); window.addEventListener('keydown', onKeyL, true); pollCinema(); } };

    var clock = 0, netT = 0, beatT = 0, remotesHid = false, musV = { b: 0, m: 0, t: 0, a: 0, en: 0, fx: 0, spk: 0, phase: 0, prev: null };
    // présence : le serveur compte les spectateurs (places limitées par la direction) ; on se signale toutes les 10 s et on prévient en sortant
    function presence() {
      world.post('/api/cinema', Object.assign({ action: 'enter' }, P ? { room: 'premium' } : {})).then(function (r) {
        if (r && r.ok === false && world.room === room && (r._status === 403 || r._status === 409)) { world.flash('⛔ ' + (r.error || 'Accès refusé.')); world.goRoom('hall', room.id, null, true); }
      });
    }
    function bye() { world.post('/api/cinema', Object.assign({ action: 'leave' }, P ? { room: 'premium' } : {})); }
    room.update = function (dt, w) {
      clock += dt;
      if (room.vipTrack) room.vipTrack(w.player.x, w.player.z, w);
      if (room.curtainUpdate) room.curtainUpdate(dt);
      if (room.glassCheck) room.glassCheck(w);
      if (room.staffWall) room.staffWall(dt);
      deskPlaceConsole();
      if (room.ambiUpdate) room.ambiUpdate(dt, net.status === 'playing' || net.status === 'paused');
      beatT += dt; if (beatT > 10) { beatT = 0; presence(); }
      netT += dt; if (netT > 1.0) { netT = 0; pollCinema(); capSync(false); } else if (consoleEl && !consoleEl.classList.contains('hid')) refreshConsole();
      var adOn = applyAd();   // pub : elle prend la main sur l'écran à chaque image (et passe au film pile à 0:00)
      if (net.status === 'playing' && !adOn) {   // chargement : seulement si le film manque de données depuis plus d'une seconde
        stallT =(video.readyState < 3 || video.seeking) ? stallT + dt : 0;
        if (stallT > 12) { stallT = 0; recoverVideo(); }                // bloqué depuis 12 s : on relance le chargement au bon moment
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
      tintU.uDim.value = dim;
      if (ceilM) { ceilM.color.setScalar(dim); (function () { var lt = room._ledT || [0, 0, 0], s = Math.min(1, Math.max(lt[0], lt[1], lt[2]) * 3); starLedM.color.setRGB(dim * (1 - s) + lt[0] * s * 1.7, dim * (1 - s) + lt[1] * s * 1.7, dim * (1 - s) + lt[2] * s * 1.7); })(); starMats.forEach(function (m) { if (m._base) m.color.copy(m._base).multiplyScalar(dim); else m.color.setScalar(dim); }); }     // les lumières du plafond s'éteignent avec la salle
      glowM.opacity = 0.1 + 0.9 * dim; shadeM.color.setRGB(dim * 0.9 + 0.1, (dim * 0.9 + 0.1) * 0.85, (dim * 0.9 + 0.1) * 0.63);
      var dv = dim;                // dans la grande salle on garde un peu de lumière pendant le film : on voit les murs dorés et les fauteuils
      amb.intensity = (P ? 0.3 : 0.95) * dv; key.intensity = (P ? 0.12 : 0.3) * dv;
      lights.forEach(function (l) { l.intensity = (P ? 0.2 : 0.55) * dv; }); vipLights.forEach(function (l) { l.intensity = 0.7 * dv; });
      wash.intensity = playing ? 0.5 : 0;
      lampGlow.forEach(function (s, i) { s.scale.setScalar(1.8 + Math.sin(clock * 3 + i) * 0.06); });
      // musique : elle se tait pendant le film (qui a son propre son)
      music.setLevel(playing ? 0 : 1);
      // les petits points (murs, plafond, sol, gradins, rideau et son « TROPISTREAM ») vibrent avec la musique d'attente : graves / médiums / aigus mesurés sur le morceau en cours
      (function () {
        var an = music.an2, d = music.an2Buf, vol = F.audio ? F.audio.musicVol : 0.5, live = !!an && music.up && !playing && vol > 0.01 && !(music.el && music.el.paused), tb = 0, tm = 0, tt = 0;
        function band(a, b) { var s = 0, i; for (i = a; i <= b; i++) s += d[i]; return Math.min(1, Math.pow(s / (b - a + 1) / 255 * 1.5, 1.4)); }
        if (live) { an.getByteFrequencyData(d); tb = band(1, 3); tm = band(4, 23); tt = band(24, 90); }
        var k = Math.min(1, dt * 12), kr = Math.min(1, dt * 4);                   // montée rapide, descente douce : pas de clignotement
        musV.b += (tb - musV.b) * (tb > musV.b ? k : kr); musV.m += (tm - musV.m) * (tm > musV.m ? k : kr); musV.t += (tt - musV.t) * (tt > musV.t ? k : kr);
        musV.a += ((live ? 1 : 0) - musV.a) * Math.min(1, dt * 2);
        // intensité de la musique (énergie + vitesse de changement du spectre) : un passage calme garde des couleurs douces, un passage rapide / épique les fait changer vite et pétiller (plus d'effet de basse)
        var flux = 0, i2; if (live) { if (!musV.prev) musV.prev = new Uint8Array(d.length); for (i2 = 1; i2 < 90; i2++) { var df = d[i2] - musV.prev[i2]; if (df > 0) flux += df; musV.prev[i2] = d[i2]; } flux /= 89 * 255; }
        musV.en += ((0.6 * tm + 0.5 * tt) - musV.en) * Math.min(1, dt * 2.5); musV.fx += (Math.min(1, flux * 10) - musV.fx) * Math.min(1, dt * 3);
        var inten = Math.min(1, musV.en * 0.9 + musV.fx * 0.8);
        musV.spk += (Math.min(1, tt * 1.3 + musV.fx * 0.9) * inten - musV.spk) * Math.min(1, dt * 4);
        musV.phase = (musV.phase + dt * (0.03 + 0.75 * inten * inten)) % 1;                 // vitesse de défilement des couleurs
        tintU.uMus.value.set(0, musV.m, musV.t, musV.a); tintU.uBeat.value.set(musV.phase, musV.spk, 0, 0); tintU.uT.value = clock;
      })();
      // son du film : même volume partout, en stéréo
      if (playing || net.status === 'paused') {
        if (vAudio.ok) vAudio.gain.gain.setTargetAtTime(filmVol(), vAudio.ctx.currentTime, 0.1);
        else video.volume = Math.min(1, filmVol() / 2.3);
        if (!vAudio.ok) adVideo.volume = Math.min(1, filmVol() / 2.3);
      }
    };
    /* ===================== LUMIÈRE DE L'ÉCRAN (salle premium) ===================== */
    // Un seul néon continu fait le tour de l'écran, collé à son bord (coins arrondis, aucune coupure). Chaque point du néon prend, en direct, la couleur du bord de l'image
    // juste à côté. Un halo doux l'entoure, et les murs, le plafond et le sol tout près de l'écran prennent un léger reflet de ces couleurs (vite atténué : la salle reste sombre).
    (function buildAmbilight() {
      if (!P) { room.ambiUpdate = function () {}; return; }
      var NV = 14, NH = 24, cvS = mkCanvas(128, 72), cxS = cvS.getContext('2d', { willReadFrequently: true }), bad = false, tAcc = 0;
      function seg(n) { var a = []; for (var k = 0; k < n; k++) a.push([0, 0, 0]); return a; }
      var E = { L: { n: NV, cur: seg(NV), tgt: seg(NV) }, R: { n: NV, cur: seg(NV), tgt: seg(NV) }, T: { n: NH, cur: seg(NH), tgt: seg(NH) }, B: { n: NH, cur: seg(NH), tgt: seg(NH) } };
      var TR = 0.3, OFF = 0.2, RAD = 0.7, hx = SCR_W / 2 + OFF, y0 = SCR_Y - OFF, y1 = SCR_Y + SCR_H + OFF, tz = -ZF + 0.16;   // le néon touche l'écran : même plan (z de l'écran), bord intérieur sous le bord de l'image
      // le parcours du néon : un rectangle à coins arrondis, dans le sens bas-gauche → haut-gauche → haut-droit → bas-droit → retour
      var path = new THREE.CurvePath(), V = function (x, y) { return new THREE.Vector3(x, y, tz); };
      path.add(new THREE.LineCurve3(V(-hx, y0 + RAD), V(-hx, y1 - RAD)));
      path.add(new THREE.QuadraticBezierCurve3(V(-hx, y1 - RAD), V(-hx, y1), V(-hx + RAD, y1)));
      path.add(new THREE.LineCurve3(V(-hx + RAD, y1), V(hx - RAD, y1)));
      path.add(new THREE.QuadraticBezierCurve3(V(hx - RAD, y1), V(hx, y1), V(hx, y1 - RAD)));
      path.add(new THREE.LineCurve3(V(hx, y1 - RAD), V(hx, y0 + RAD)));
      path.add(new THREE.QuadraticBezierCurve3(V(hx, y0 + RAD), V(hx, y0), V(hx - RAD, y0)));
      path.add(new THREE.LineCurve3(V(hx - RAD, y0), V(-hx + RAD, y0)));
      path.add(new THREE.QuadraticBezierCurve3(V(-hx + RAD, y0), V(-hx, y0), V(-hx, y0 + RAD)));
      var lens = path.getCurveLengths(), Ltot = lens[lens.length - 1];
      var W = 512, cv = mkCanvas(W, 2), cx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping;
      var neonGeo = new THREE.TubeGeometry(path, 900, TR, 12, true), nPos = neonGeo.attributes.position;
      for (var vi = 0; vi < nPos.count; vi++) nPos.setZ(vi, tz + (nPos.getZ(vi) - tz) * 0.35);   // néon aplati : un ruban collé contre l'écran, plus de jour visible de côté
      var neon = new THREE.Mesh(neonGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(neon);   // additif : le noir ne se voit pas
      // halo doux tout autour (pas de rectangle : il s'efface vers l'extérieur et derrière l'écran)
      var hcv = mkCanvas(W, 16), hcx = hcv.getContext('2d'), htex = new THREE.CanvasTexture(hcv); htex.wrapS = THREE.RepeatWrapping;
      function ribbon(w, M, z) {                        // bande plate qui suit le néon, posée derrière l'écran : seule la moitié extérieure se voit, sur le mur
        var pos = [], uv = [], idx = [], i;
        for (i = 0; i <= M; i++) {
          var u = Math.min(i / M, 1), p = path.getPointAt(u), t = path.getTangentAt(u), nx = -t.y, ny = t.x;
          pos.push(p.x - nx * 0.1, p.y - ny * 0.1, z, p.x + nx * w, p.y + ny * w, z); uv.push(u, 0, u, 1);   // du néon vers l'extérieur seulement : aucun repli dans les coins
          if (i < M) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); return geo;
      }
      var halo = new THREE.Mesh(ribbon(1.7, 600, -ZF + 0.1), new THREE.MeshBasicMaterial({ map: htex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); g.add(halo);
      // position le long du néon → côté de l'écran et place sur ce côté (0..1)
      var segLen = [lens[0], lens[1] - lens[0], lens[2] - lens[1], lens[3] - lens[2], lens[4] - lens[3], lens[5] - lens[4], lens[6] - lens[5], lens[7] - lens[6]];
      function colorAt(u) {                             // u : 0..1 le long du néon
        var d = u * Ltot, k = 0; while (k < 7 && d > lens[k]) k++;
        var t = (d - (k ? lens[k - 1] : 0)) / segLen[k];
        function pick(e, f) { var n = e.n, x = Math.min(n - 1, Math.max(0, f * (n - 1))), a = Math.floor(x), b = Math.min(n - 1, a + 1), w = x - a, ca = e.cur[a], cb = e.cur[b]; return [ca[0] + (cb[0] - ca[0]) * w, ca[1] + (cb[1] - ca[1]) * w, ca[2] + (cb[2] - ca[2]) * w]; }
        function mixc(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
        switch (k) {
          case 0: return pick(E.L, 1 - t);                          // gauche, de bas en haut (les tronçons vont du haut vers le bas)
          case 1: return mixc(pick(E.L, 0), pick(E.T, 0));           // coin haut-gauche
          case 2: return pick(E.T, t);                              // haut, de gauche à droite
          case 3: return mixc(pick(E.T, 1), pick(E.R, 0));
          case 4: return pick(E.R, t);                              // droite, de haut en bas
          case 5: return mixc(pick(E.R, 1), pick(E.B, 1));
          case 6: return pick(E.B, 1 - t);                          // bas, de droite à gauche
          default: return mixc(pick(E.B, 0), pick(E.L, 1));
        }
      }
      var nImg = cx.createImageData(W, 2), hImg = hcx.createImageData(W, 16), prof = [];
      for (var jj = 0; jj < 16; jj++) { var sa = (jj + 0.5) / 16; prof.push(0.62 * sa * sa); }       // fort contre le néon, s'efface vers l'extérieur
      function paint() {
        var nd = nImg.data, hd = hImg.data, i, j, o;
        for (i = 0; i < W; i++) {
          var c = colorAt((i + 0.5) / W), r = Math.round(c[0] * 255), gg = Math.round(c[1] * 255), b = Math.round(c[2] * 255);
          for (j = 0; j < 2; j++) { o = (j * W + i) * 4; nd[o] = r; nd[o + 1] = gg; nd[o + 2] = b; nd[o + 3] = 255; }   // éteint : noir, donc invisible
          for (j = 0; j < 16; j++) { o = (j * W + i) * 4; hd[o] = r; hd[o + 1] = gg; hd[o + 2] = b; hd[o + 3] = Math.round(prof[j] * 255); }
        }
        cx.putImageData(nImg, 0, 0); hcx.putImageData(hImg, 0, 0);
        tex.needsUpdate = true; htex.needsUpdate = true;
      }
      function smooth(a, b, v) { var t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
      function vivid(r, gg, b) { var m = (r + gg + b) / 3, rr = Math.max(0, m + (r - m) * 1.45), g2 = Math.max(0, m + (gg - m) * 1.45), bb = Math.max(0, m + (b - m) * 1.45), mm = Math.max(rr, g2, bb) || 1; return [rr / mm, g2 / mm, bb / mm]; }
      function setTgt(e, acc) {                         // chaque tronçon ne regarde QUE la fine bande d'image juste à côté de lui (comme un vrai ambilight) : un feu au milieu de l'image n'allume rien, un feu au bord allume le néon à sa hauteur, une image noire éteint
        for (var k = 0; k < e.n; k++) {
          var a = acc[k], n = a[3] || 1, c = [a[0] / n / 255, a[1] / n / 255, a[2] / n / 255], lw = a[5] / (a[6] || 1), wl = a[4] / n;   // luminosité moyenne de la bande, et celle de ses points les plus lumineux
          var v = vivid(c[0], c[1], c[2]), kk = smooth(0.03, 0.3, Math.max(lw, wl * 0.55));
          e.tgt[k] = [v[0] * kk, v[1] * kk, v[2] * kk];
        }
      }
      function zeros(n) { var a = []; for (var k = 0; k < n; k++) a.push([0, 0, 0, 0, 0, 0, 0]); return a; }
      var GL = [0, 0, 0, 0, 0, 0, 0];   // lumière la plus forte de toute l'image (pondérée)
      function avg(e) { var s0 = [0, 0, 0]; e.cur.forEach(function (c) { s0[0] += c[0]; s0[1] += c[1]; s0[2] += c[2]; }); return [s0[0] / e.n, s0[1] / e.n, s0[2] / e.n]; }
      // néon au bord de la scène : pendant le film il reprend les couleurs du bas de l'image ; sans film, il vit au rythme de la musique d'attente
      var SL = HX * 2 - 1, SNR = 128, scv = mkCanvas(2, SNR), scx = scv.getContext('2d'), stex = new THREE.CanvasTexture(scv), sImg = scx.createImageData(2, SNR), musE = 0, clk = 0;
      var stube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, SL, 10), new THREE.MeshBasicMaterial({ map: stex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); stube.rotation.z = -Math.PI / 2; stube.position.set(0, 0.17, -ZF + stageD + 0.06); g.add(stube);
      function pickB(fx) { var e = E.B, x = Math.min(e.n - 1, Math.max(0, fx * (e.n - 1))), a = Math.floor(x), b = Math.min(e.n - 1, a + 1), w = x - a; return [e.cur[a][0] + (e.cur[b][0] - e.cur[a][0]) * w, e.cur[a][1] + (e.cur[b][1] - e.cur[a][1]) * w, e.cur[a][2] + (e.cur[b][2] - e.cur[a][2]) * w]; }
      function paintStage(dt, on) {
        clk += dt;
        var target = 0;
        if (!on && music && music.an && music.up) { music.an.getByteFrequencyData(music.anBuf); var sum = 0; for (var q = 0; q < 24; q++) sum += music.anBuf[q]; target = Math.min(1, sum / 24 / 160); }
        musE += (target - musE) * Math.min(1, dt * (target > musE ? 14 : 4));
        var hue = (0.09 + 0.05 * Math.sin(clk * 0.15)), sd = sImg.data;
        for (var k = 0; k < SNR; k++) {
          var c;
          if (on) c = pickB(1 - k / (SNR - 1));                                   // ligne 0 = bout droit
          else {
            var v = (0.18 + 0.82 * musE) * (0.75 + 0.25 * Math.sin(k * 0.18 - clk * 3.5)), col = new THREE.Color().setHSL(hue + 0.03 * Math.sin(k * 0.05 + clk * 0.4), 0.85, 0.5);
            c = [col.r * v, col.g * v, col.b * v];
          }
          for (var j = 0; j < 2; j++) { var o = (k * 2 + j) * 4; sd[o] = Math.round(c[0] * 255); sd[o + 1] = Math.round(c[1] * 255); sd[o + 2] = Math.round(c[2] * 255); sd[o + 3] = 255; }
        }
        scx.putImageData(sImg, 0, 0); stex.needsUpdate = true;
      }
      var paintT = 0, stageT = 0;
      room.ambiUpdate = function (dt, on) {
        stageT += dt; if (stageT > 0.033) { paintStage(stageT, on); stageT = 0; }
        tAcc += dt; paintT += dt;
        if (on && !bad && tAcc > 0.05 && video.readyState >= 2 && video.videoWidth > 0) {     // 20 lectures par seconde : les couleurs suivent le film en direct
          tAcc = 0;
          try {
            cxS.drawImage(video, 0, 0, 128, 72);
            var d = cxS.getImageData(0, 0, 128, 72).data, x, y, p, lum, w3, aL = zeros(NV), aR = zeros(NV), aT = zeros(NH), aB = zeros(NH);
            GL = [0, 0, 0, 0, 0, 0, 0];
            var add = function (q) { q[0] += d[p] * w3; q[1] += d[p + 1] * w3; q[2] += d[p + 2] * w3; q[3] += w3; q[4] += lum * w3; q[5] += lum; q[6] += 1; };
            for (y = 0; y < 72; y++) for (x = 0; x < 128; x++) {
              p = (y * 128 + x) * 4; lum = (d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11) / 255;
              var mxv = Math.max(d[p], d[p + 1], d[p + 2]), mnv = Math.min(d[p], d[p + 1], d[p + 2]), sat = mxv ? (mxv - mnv) / mxv : 0;
              w3 = lum * lum * lum * 0.4 + sat * sat * lum * lum * 2 + 0.0002;   // les zones lumineuses comptent plus, et les couleurs vives aussi (une petite voiture rouge dans la neige doit teinter le bord)
              add(GL);   // (GL n'influence plus les couleurs : plus de lumière « sans logique »)
              if (x < 20) add(aL[Math.min(NV - 1, Math.floor(y * NV / 72))]);
              if (x >= 108) add(aR[Math.min(NV - 1, Math.floor(y * NV / 72))]);
              if (y < 11) add(aT[Math.min(NH - 1, Math.floor(x * NH / 128))]);
              if (y >= 61) add(aB[Math.min(NH - 1, Math.floor(x * NH / 128))]);
            }
            setTgt(E.L, aL); setTgt(E.R, aR); setTgt(E.T, aT); setTgt(E.B, aB);
          } catch (e) { bad = true; if (room._ambi) room._ambi.err = String(e); }
        }
        ['L', 'R', 'T', 'B'].forEach(function (key) {
          var e = E[key], k, c3;
          for (k = 0; k < e.n; k++) for (c3 = 0; c3 < 3; c3++) {
            var tg = (!on || bad) ? 0 : e.tgt[k][c3], up = tg > e.cur[k][c3];
            e.cur[k][c3] += (tg - e.cur[k][c3]) * Math.min(1, dt * (up ? 30 : 9));      // réaction quasi immédiate, sans clignoter
          }
        });
        if (paintT > 0.033) {
          paintT = 0; paint();
          ['L', 'R', 'T', 'B'].forEach(function (key, row) {                       // 32 échantillons par côté, même couleurs que la LED
            var e = E[key], i2, c3;
            for (i2 = 0; i2 < 32; i2++) {
              var xx = i2 / 31 * (e.n - 1), a0 = Math.floor(xx), b0 = Math.min(e.n - 1, a0 + 1), w0 = xx - a0, o2 = (row * 32 + i2) * 4;
              for (c3 = 0; c3 < 3; c3++) ledData[o2 + c3] = Math.max(0, Math.min(255, Math.round((e.cur[a0][c3] + (e.cur[b0][c3] - e.cur[a0][c3]) * w0) * 255)));
            }
          });
          ledTex.needsUpdate = true;
        }
        // léger reflet sur les murs, le plafond et le sol près de l'écran (s'efface en quelques mètres)
        var aL2 = avg(E.L), aR2 = avg(E.R), aT2 = avg(E.T), aB2 = avg(E.B), K = 0.34;
        tintU.uL.value.setRGB(aL2[0] * K, aL2[1] * K, aL2[2] * K);
        tintU.uR.value.setRGB(aR2[0] * K, aR2[1] * K, aR2[2] * K);
        room._ledT = aT2;
        tintU.uC.value.setRGB((aT2[0] + aB2[0]) / 2 * K, (aT2[1] + aB2[1]) / 2 * K, (aT2[2] + aB2[2]) / 2 * K);
      };
      paint();
      room._ambi = { force: function (c) { bad = false; ['L', 'R', 'T', 'B'].forEach(function (key) { for (var k = 0; k < E[key].n; k++) E[key].tgt[k] = c(key, k / (E[key].n - 1)); }); } };
    })();
    /* ===================== RIDEAU DE SCÈNE (salle premium) ===================== */
    // Un grand rideau de velours rouge cache l'écran. Il s'ouvre lentement (les deux pans glissent vers les côtés en se plissant) dès qu'un film est lancé
    // et ne se referme que lorsque le film est terminé : la pause le laisse ouvert. L'état vient du serveur (net.status), tout le monde voit donc la même chose.
    (function buildCurtain() {
      if (!P) return;
      var CW = HX * 2 - 0.1, CY0 = 0.34, CY1 = H - 2.5, CZ = -ZF + 0.62, OV = 2.2, NC = 240, FOLDS = 36, GATHER = 0.075, HEM = 0.75, DUR = 9;
      var Wp = CW / 2 + OV, ys = [CY0, CY0 + HEM, CY0 + HEM, CY1];
      // ----- TROPISTREAM en petits points blancs (même style que les points des murs) : « TROPI » est brodé sur le pan gauche, « STREAM » sur le pan droit,
      // chaque mot part donc avec son rideau quand le film commence. Chaque mot est une texture de points ; le shader la pose sur le tissu (coordonnée « cuv » = mètres le long du pan, mètres de hauteur).
      var PITCH = 0.2, CELL = 8, PPM = CELL / PITCH, ROWSN = 12, TEXT_Y = (CY0 + CY1) / 2, SEAM = 0.55;   // petit texte (lettres de ~2,4 m) : de simples points comme ceux des murs
      var SCW = 6, FONTW = '800 ' + (ROWSN * SCW / 0.716) + 'px Arial, Helvetica, sans-serif', GAPW = 2.6 * SCW, mW = mkCanvas(8, 8).getContext('2d');
      function naturalW(word) { var s = 0, k; mW.font = FONTW; for (k = 0; k < word.length; k++) s += mW.measureText(word[k]).width; return s + GAPW * (word.length - 1); }
      // espacement naturel des lettres ; le texte entier est centré dans la salle : la couture entre TROPI et STREAM est un peu décalée (les pans se recouvrent de 2,2 m au centre)
      function dotWord(word) {                             // -> { tex, cols, texW, texH } : le mot dessiné en grille de points, centré verticalement dans une texture 2^n x 256
        var SC = SCW, fpx = ROWSN * SC / 0.716, m0 = mW, font = FONTW, adv = [], sum = 0, k;
        m0.font = font; for (k = 0; k < word.length; k++) { adv.push(m0.measureText(word[k]).width); sum += adv[k]; }
        var gapPx = GAPW, tot = sum + GAPW * (word.length - 1);
        var mw = Math.ceil(tot / SC) * SC + SC * 2, mh = (ROWSN + 2) * SC, mc = mkCanvas(mw, mh), mx = mc.getContext('2d', { willReadFrequently: true }), px = SC;
        mx.fillStyle = '#000'; mx.fillRect(0, 0, mw, mh); mx.fillStyle = '#fff'; mx.font = font; mx.textBaseline = 'alphabetic';
        for (k = 0; k < word.length; k++) { mx.fillText(word[k], px, (ROWSN + 1) * SC); px += adv[k] + gapPx; }
        var md = mx.getImageData(0, 0, mw, mh).data, cols = Math.floor(mw / SC), rows = ROWSN + 2, tw = 256, c2, r2;
        while (tw < cols * CELL) tw *= 2;
        var cv = mkCanvas(tw, 256), cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, tw, 256);
        var yoff = (256 - rows * CELL) / 2;
        for (r2 = 0; r2 < rows; r2++) for (c2 = 0; c2 < cols; c2++) {
          var cov = 0, sx, sy;                              // couverture de la case : 3 x 3 échantillons
          for (sy = 0; sy < 3; sy++) for (sx = 0; sx < 3; sx++) cov += md[(((r2 * SC + SC / 3 * (sy + 0.5)) | 0) * mw + ((c2 * SC + SC / 3 * (sx + 0.5)) | 0)) * 4] > 127 ? 1 : 0;
          if (cov < 5) continue;
          var gr2 = cx.createRadialGradient(c2 * CELL + CELL / 2, yoff + r2 * CELL + CELL / 2, 0, c2 * CELL + CELL / 2, yoff + r2 * CELL + CELL / 2, CELL * 0.42);
          gr2.addColorStop(0, 'rgba(255,255,255,1)'); gr2.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr2.addColorStop(1, 'rgba(255,255,255,0)');
          cx.fillStyle = gr2; cx.fillRect(c2 * CELL, yoff + r2 * CELL, CELL, CELL);
        }
        var tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
        return { tex: tex, cols: cols, texW: tw / PPM, texH: 256 / PPM };
      }
      function curtainMat(wd, a, b) {                      // a, b : passage des mètres du tissu à la coordonnée u de la texture du mot
        var m = tintize(new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }), {   // rideau TOUT noir : seuls les points du mot s'y allument
          vdecl: 'attribute vec2 cuv;\nvarying vec2 vCuv;\n', vmain: '\nvCuv = cuv;',
          fdecl: 'varying vec2 vCuv;\nuniform sampler2D uTxt; uniform vec4 uTxM;\n',
          uni: function (sh) { sh.uniforms.uTxt = { value: wd.tex }; sh.uniforms.uTxM = { value: new THREE.Vector4(a, b, TEXT_Y - wd.texH / 2, 1 / wd.texH) }; },
          // les points du mot : blancs, un peu plus vifs que les étoiles ; ils battent avec la musique comme les murs (graves = tout le mot respire, aigus = scintillement)
          fmain: 'vec2 tq = vec2(uTxM.x * vCuv.x + uTxM.y, (vCuv.y - uTxM.z) * uTxM.w);\n' +
            'float tin = step(0.0, tq.x) * step(tq.x, 1.0) * step(0.0, tq.y) * step(tq.y, 1.0);\n' +
            'vec2 tqc = clamp(tq, 0.0, 1.0);\n' +
            'float tdot = texture2D(uTxt, tqc).r * tin;\n' +
            'float tglow = texture2D(uTxt, tqc, 3.0).r * tin;\n' +        // halo doux autour des points : le mot « fait de la lumière »
            'float tpl = 0.5 * uMus.x + 0.35 * uMus.y * (0.6 + 0.4 * sin(vWp.x * 0.5 - uT * 3.0)) + 0.3 * uMus.z * (0.5 + 0.5 * sin(vWp.x * 1.7 + uT * 7.0));\n' +
            'vec3 tcol = mix(vec3(1.0), mcol, clamp(uMus.w * 0.85, 0.0, 1.0));\n' +
            'gl_FragColor.rgb += tcol * (tdot * uDim * (0.9 + 0.9 * uMus.w * tpl + 0.9 * uBeat.y * uMus.w) + tglow * uDim * uMus.w * (0.5 + 2.2 * tpl + 1.6 * uBeat.y));'
        });
        return m;
      }
      var wordL = dotWord('TROPI'), wordR = dotWord('STREAM');
      var wMl = wordL.cols * PITCH, wMr = wordR.cols * PITCH, xS = (wMl - wMr) / 2;   // xS : position de la couture des mots (le texte entier est centré sur x = 0)
      var xL0 = xS - SEAM - wMl, xR0 = xS + SEAM;     // bord gauche (mètres dans la salle) de chaque texture : TROPI finit à gauche de la couture, STREAM y commence
      function panel(sd) {
        var pos = new Float32Array(4 * (NC + 1) * 3), col = new Float32Array(4 * (NC + 1) * 3), uv = new Float32Array(4 * (NC + 1) * 2), cuv = new Float32Array(4 * (NC + 1) * 2), idx = [], i, r;
        for (i = 0; i < NC; i++) for (r = 0; r < 4; r += 2) { var a = r * (NC + 1) + i, b = a + 1, c = a + (NC + 1), d = c + 1; idx.push(a, c, b, b, c, d); }
        for (i = 0; i <= NC; i++) for (r = 0; r < 4; r++) { cuv[(r * (NC + 1) + i) * 2] = i / NC * Wp; cuv[(r * (NC + 1) + i) * 2 + 1] = ys[r]; }   // coordonnées du tissu : elles suivent le rideau quand il s'ouvre
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('cuv', new THREE.BufferAttribute(cuv, 2)); geo.setIndex(idx);
        // pan gauche (sd = -1) : x = s - CW/2 ; pan droit (sd = +1) : x = CW/2 - s  (s = mètres depuis le bord extérieur du pan)
        var wd = sd < 0 ? wordL : wordR, x0 = sd < 0 ? xL0 : xR0, mat = curtainMat(wd, sd < 0 ? 1 / wd.texW : -1 / wd.texW, sd < 0 ? (-CW / 2 - x0) / wd.texW : (CW / 2 - x0) / wd.texW);
        var mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; g.add(mesh);   // noir semé de points blancs comme les murs, avec TROPI / STREAM en points
        return { sd: sd, pos: pos, col: col, uv: uv, geo: geo };
      }
      var panels = [panel(-1), panel(1)];
      function shape(k) {                                  // k : 0 = fermé, 1 = ouvert (les plis se resserrent sur les côtés, deviennent plus profonds)
        var amp = 0.1 + 0.36 * k;
        panels.forEach(function (p) {
          var outer = p.sd * (CW / 2 + k * (0.15 + Wp * GATHER)), span = Wp * (1 - k * (1 - GATHER)), i, r;   // ouvert : le pan entier est rentré dans le mur latéral, on ne le voit plus
          for (i = 0; i <= NC; i++) {
            var u = i / NC, ph = u * FOLDS * TAU, sn = Math.sin(ph), x = outer - p.sd * u * span, z = CZ + amp * (0.5 + 0.5 * sn) + (p.sd > 0 ? 0.09 : 0);
            var sh = 0.42 + 0.58 * (0.5 + 0.5 * sn), shine = Math.pow(Math.max(0, Math.sin(ph + 1.1)), 6) * 0.3;
            sh *= 1 - 0.3 * k * (1 - Math.abs(sn));
            for (r = 0; r < 4; r++) {
              var o = (r * (NC + 1) + i) * 3, gold = r < 2, f = gold ? (r === 0 ? 0.85 : 1) : (r === 2 ? 1 : 0.6);
              p.uv[(r * (NC + 1) + i) * 2] = x; p.uv[(r * (NC + 1) + i) * 2 + 1] = ys[r];
              p.pos[o] = x; p.pos[o + 1] = ys[r]; p.pos[o + 2] = z + (r === 3 ? -0.05 * k : 0);
              if (gold) { p.col[o] = Math.min(1, (0.05 * sh + shine * 0.3) * f); p.col[o + 1] = Math.min(1, (0.05 * sh + shine * 0.3) * f); p.col[o + 2] = Math.min(1, (0.06 * sh + shine * 0.35) * f); }
              else { p.col[o] = Math.min(1, (0.07 * sh + shine * 0.5) * f); p.col[o + 1] = Math.min(1, (0.07 * sh + shine * 0.5) * f); p.col[o + 2] = Math.min(1, (0.085 * sh + shine * 0.6) * f); }
            }
          }
          p.geo.attributes.position.needsUpdate = true; p.geo.attributes.uv.needsUpdate = true;
        });
      }
      var raw = 0, kShown = -1;
      room.curtainUpdate = function (dt) {
        var want = (net.status === 'playing' || net.status === 'paused') ? 1 : 0;
        if (performance.now() - (room._curtT0 || 0) < 2500) raw = want;                       // en entrant : le rideau est déjà dans le bon état (pas d'animation pour quelqu'un qui arrive en cours de film)
        else raw += Math.max(-dt / DUR, Math.min(dt / DUR, want - raw));                       // sinon : une ouverture ou fermeture lente (9 s), pour tous en même temps
        var kk = raw * raw * (3 - 2 * raw);
        if (Math.abs(kk - kShown) > 0.0003) { kShown = kk; shape(kk); }
      };
      shape(0); kShown = 0;
    })();
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
      '.cin-console.cin-wall{left:0;top:0;transform-origin:0 0;width:1100px!important;max-width:none!important;height:619px!important;max-height:none!important;display:grid!important;grid-template-columns:470px 1fr;grid-template-rows:auto auto 1fr;column-gap:18px;overflow:hidden!important;border-radius:4px}' +
      '.cin-console.cin-wall .cin-cn-head{grid-column:1 / 3}.cin-console.cin-wall .cin-cn-playback{grid-column:1;grid-row:2 / 4;overflow:auto;min-height:0}.cin-console.cin-wall .cin-cn-tabs{grid-column:2;grid-row:2}.cin-console.cin-wall .cin-pane{grid-column:2;grid-row:3;overflow:auto;min-height:0}' +
      '.cin-cn-seek{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}' +
      '.cin-seek-l{font-size:11.5px;font-weight:700;color:#e9c66b;letter-spacing:.03em;width:100%}' +
      '.cin-seek-f{display:flex;align-items:center;gap:5px}.cin-seek-f b{font-size:12px;color:#c9b8e8;font-weight:600;margin-right:6px}' +
      '.cin-sk{width:58px;padding:7px 6px;border-radius:8px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.18);color:#fff;font:700 15px inherit;text-align:center}.cin-sk:focus{outline:2px solid #e9c66b}' +
      '.cin-seek-q{display:flex;gap:6px;width:100%}.cin-seek-q button{flex:1;padding:8px 4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e5dcc3;font:700 12px inherit;cursor:pointer}.cin-seek-q button:hover{background:rgba(233,198,107,.22);color:#fff}' +
      '.cin-seek-b{display:flex;gap:8px;flex:1;min-width:210px}.cin-seek-b button{flex:1;padding:9px 8px;border-radius:9px;border:1px solid rgba(233,198,107,.45);background:rgba(233,198,107,.12);color:#f3d98a;font:700 12px inherit;cursor:pointer}.cin-seek-b button:hover{background:rgba(233,198,107,.28)}' +
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

  // contrôle à l'entrée (cinéma premium : rôles ; les deux : salle pleine) — appelé par world.goRoom avant le fondu
  F.roomGates = F.roomGates || {};
  function cinemaGate(prem) {
    return function (w, done) {
      w.post('/api/cinema', Object.assign({ action: 'enter' }, prem ? { room: 'premium' } : {})).then(function (r) {
        if (r && r.ok) { done(true); return; }
        if (!r && !prem) { done(true); return; }                  // pas connecté : simple spectateur du cinéma gratuit
        done(false, r ? (r.error || 'Accès refusé.') : 'Connecte-toi pour entrer au cinéma premium.');
      });
    };
  }
  F.roomGates.cinema = cinemaGate(false); F.roomGates.cinemapremium = cinemaGate(true);
  F.registerRoom('cinema', function (w) { return createCinemaRoom(w, false); });
  F.registerRoom('cinemapremium', function (w) { return createCinemaRoom(w, true); });
})();
