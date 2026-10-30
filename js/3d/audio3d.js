/* =====================================================================
   audio3d.js — Sons du casino 3D : bruits de pas et musique d'ambiance différente dans chaque salle (tout est synthétisé, aucun fichier audio)
   ---------------------------------------------------------------------
   - F.audio.step(courir, salle) : un bruit de pas (marbre, moquette ou parquet selon la salle) ; F.audio.land() : réception d'un saut.
   - F.audio.setRoom(id) : lance la musique de la salle (hall, machines, poker, courses, Tropi Shop, PMU) avec un fondu ; '' l'arrête.
     Le cinéma garde sa propre musique (cinema3d.js) : ici il n'y en a pas.
   - Réglages (téléphone › Réglages) : volume de la musique et des bruitages, en plus du volume général du jeu (getMasterVolume) ; gardés pour la prochaine visite.
   Utilise le contexte audio du jeu (getAudioCtx) : le navigateur n'autorise le son qu'après un clic ou une touche, la musique démarre à ce moment-là.
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F) return;

  var KEYS = { music: 'f3d_music_vol', sfx: 'f3d_sfx_vol' };
  var A = F.audio = { musicVol: 0.5, sfxVol: 0.7, room: '' };
  function load(k, d) { try { var v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; } catch (e) { return d; } }
  A.musicVol = load(KEYS.music, 0.5); A.sfxVol = load(KEYS.sfx, 0.7);
  A.setMusicVol = function (v) { A.musicVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem(KEYS.music, String(A.musicVol)); } catch (e) { /* ok */ } A.update(); };
  A.setSfxVol = function (v) { A.sfxVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem(KEYS.sfx, String(A.sfxVol)); } catch (e) { /* ok */ } A.update(); };

  var bus = null, noiseBuf = null;
  function ctx() { try { return typeof getAudioCtx === 'function' ? getAudioCtx() : null; } catch (e) { return null; } }
  function master() { try { return typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5; } catch (e) { return 0.5; } }
  function getBus() {
    var c = ctx(); if (!c) return null;
    if (bus && bus.c === c) return bus;
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(c.destination);
    bus = { c: c, music: c.createGain(), sfx: c.createGain(), stepIn: c.createGain(), stepRev: c.createGain() };
    bus.music.gain.value = 0; bus.sfx.gain.value = 0; bus.music.connect(comp); bus.sfx.connect(comp);
    // les pas passent par une courte réverbération (0,45 s) dont le dosage change selon le sol
    var len = Math.floor(c.sampleRate * 0.45), imp = c.createBuffer(2, len, c.sampleRate), conv = c.createConvolver();
    for (var ch = 0; ch < 2; ch++) { var dd = imp.getChannelData(ch); for (var j = 0; j < len; j++) dd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3); }
    conv.buffer = imp; bus.stepRev.gain.value = 0; bus.stepIn.connect(bus.sfx); bus.stepIn.connect(bus.stepRev); bus.stepRev.connect(conv); conv.connect(bus.sfx);
    var nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = nb;
    return bus;
  }
  // volumes : appliqués en douceur (la musique est volontairement discrète)
  A.update = function () {
    var b = getBus(); if (!b) return;
    var m = master(), t = b.c.currentTime;
    b.music.gain.setTargetAtTime(A.musicVol * m * 1.4, t, 0.15); b.sfx.gain.setTargetAtTime(A.sfxVol * m * 1.3, t, 0.05);
  };
  function wake() {
    var c = ctx(); if (!c) return;
    var p = c.state === 'suspended' ? c.resume() : null;
    if (!M.pending) return;
    function go() { if (M.pending && c.state === 'running') { M.pending = false; start(A.room); } }
    if (p && p.then) p.then(go, function () { /* refusé */ }); else go();
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, wake, true); });

  /* ---------- petits instruments ---------- */
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function tone(dest, f, t, dur, o) {
    o = o || {};
    var c = bus.c, osc = c.createOscillator(), g = c.createGain(), node = osc, v = o.v == null ? 0.1 : o.v, a = o.a || 0.01;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.det) osc.detune.value = o.det;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (o.lp) { var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; osc.connect(lp); lp.connect(g); } else osc.connect(g);
    g.connect(dest); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, o) {
    o = o || {};
    var c = bus.c, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), v = o.v == null ? 0.1 : o.v;
    src.buffer = noiseBuf; src.loop = true; f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.f || 6000, t); if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur); f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.a || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    var out = g;
    if (o.pan && bus.c.createStereoPanner) { var p = bus.c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(dest); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  function kick(dest, t, v) { tone(dest, 150, t, 0.16, { to: 42, v: v || 0.3, a: 0.003 }); }

  /* ---------- pas : un talon (claquement + coup sourd) puis la pointe du pied, filtrés selon le sol, avec un peu de réverbération ---------- */
  var SURFACE = { hall: 'marble', slots: 'carpet', pokerroom: 'carpet', horses: 'marble', shop3d: 'wood', pmu: 'carpet', cinema: 'carpet' };
  var SOLS = {
    marble: { heel: { f0: 2600, f1: 1100, q: 1.1, dur: 0.06, v: 0.36, th: 210, tv: 0.16 }, toe: { f0: 3600, f1: 2000, q: 1.4, dur: 0.035, v: 0.16, th: 330, tv: 0.05 }, gap: 0.085, rev: 0.28 },
    wood: { heel: { f0: 1100, f1: 520, q: 1.3, dur: 0.09, v: 0.4, th: 150, tv: 0.26 }, toe: { f0: 1500, f1: 800, q: 1.2, dur: 0.05, v: 0.18, th: 190, tv: 0.1 }, gap: 0.09, rev: 0.12 },
    carpet: { heel: { f0: 520, f1: 250, q: 0.7, dur: 0.11, v: 0.42, th: 85, tv: 0.24 }, toe: { f0: 700, f1: 380, q: 0.7, dur: 0.06, v: 0.12, th: 110, tv: 0.06 }, gap: 0.08, rev: 0 }
  };
  function foot1(dst, t, h, k, r, dk, pan) {
    noise(dst, t, h.dur * dk, { type: 'bandpass', f: h.f0 * r, fTo: h.f1 * r, q: h.q, v: h.v * k, a: 0.002, pan: pan });
    tone(dst, h.th * r, t, h.dur * 1.7 * dk, { to: h.th * r * 0.55, v: h.tv * k, a: 0.002 });
  }
  var foot = 0;
  A.step = function (run, room) {
    var b = getBus(); if (!b || b.c.state !== 'running') return;
    var sol = SOLS[SURFACE[room] || 'carpet'], t = b.c.currentTime + 0.005, k = (run ? 1.3 : 1) * (0.85 + Math.random() * 0.25), r = 0.93 + Math.random() * 0.14, dk = run ? 0.8 : 1, pan = (foot++ % 2 ? 1 : -1) * 0.14;
    b.stepRev.gain.value = sol.rev;
    foot1(b.stepIn, t, sol.heel, k, r, dk, pan);
    foot1(b.stepIn, t + sol.gap * (run ? 0.7 : 1), sol.toe, k * 0.9, r * 1.05, dk, pan);
  };
  A.land = function () {
    var b = getBus(); if (!b || b.c.state !== 'running') return;
    var sol = SOLS[SURFACE[A.room] || 'carpet'], t = b.c.currentTime + 0.005;
    b.stepRev.gain.value = sol.rev;
    foot1(b.stepIn, t, sol.heel, 1.5, 0.85, 1.2, -0.1); foot1(b.stepIn, t + 0.012, sol.heel, 1.4, 0.8, 1.2, 0.1);
  };

  /* ---------- musiques : une par salle ---------- */
  function hz(chord, i) { return mtof(chord[i % chord.length]); }
  var STYLES = {
    // hall : salon lounge, accords de septième au piano électrique et basse douce
    hall: { bpm: 84, chords: [[48, 55, 59, 64], [45, 52, 55, 60], [50, 57, 60, 65], [43, 50, 53, 59]], pent: [72, 74, 76, 79, 81, 84],
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15;
        if (s === 0) { ch.forEach(function (n, k) { tone(d, mtof(n + 12), t, 3.4, { type: 'sine', v: 0.05, a: 0.5, det: k * 3 }); tone(d, mtof(n + 24), t, 2.4, { type: 'triangle', v: 0.012, a: 0.4 }); }); }
        if (s === 0 || s === 8) tone(d, mtof(ch[0] - 12), t, 0.7, { type: 'triangle', v: 0.16, a: 0.02 });
        if (s === 6 && Math.random() < 0.5) tone(d, mtof(ch[1] - 12), t, 0.4, { type: 'triangle', v: 0.1, a: 0.02 });
        if (s % 4 === 2) noise(d, t, 0.04, { f: 7500, v: 0.03 });
        if (s % 2 === 0 && Math.random() < 0.3) { var n = this.pent[(Math.random() * this.pent.length) | 0]; tone(d, mtof(n), t, 1.1, { v: 0.07, a: 0.004 }); tone(d, mtof(n + 12), t, 0.5, { v: 0.018, a: 0.004 }); }
      } },
    // machines à sous : arcade lumineuse, arpèges carrés et grosse caisse
    slots: { bpm: 128, chords: [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]],
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15;
        if (s % 2 === 0) tone(d, hz(ch, (s >> 1) % 4 + (s % 8 === 6 ? 1 : 0)) * 2, t, 0.16, { type: 'square', v: 0.045, a: 0.004, lp: 3200 });
        if (s % 4 === 0) { tone(d, mtof(ch[0] - 12), t, 0.3, { type: 'square', v: 0.07, a: 0.004, lp: 700 }); kick(d, t, 0.22); }
        if (s % 4 === 2) noise(d, t, 0.035, { f: 8000, v: 0.04 });
        if (s === 12 || s === 14) tone(d, mtof(ch[3] + 24), t, 0.12, { type: 'triangle', v: 0.05, a: 0.003 });
        if (Math.random() < 0.06) tone(d, mtof(96 + ((Math.random() * 5) | 0) * 2), t, 0.5, { v: 0.035, a: 0.002 });   // clochettes de jackpot
      } },
    // poker : jazz enfumé, contrebasse qui marche, accords de piano à contretemps et cymbale ride
    pokerroom: { bpm: 92, chords: [[50, 57, 60, 65], [43, 50, 53, 59], [48, 55, 59, 64], [45, 52, 55, 61]], walk: [0, 2, 1, 3],
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15, sw = (s % 4 === 2) ? 0.04 : 0;
        if (s % 4 === 0) { var k = this.walk[(s >> 2) & 3]; tone(d, mtof(ch[k] - 12), t, 0.45, { type: 'sine', v: 0.2, a: 0.012, lp: 600 }); }
        if (s === 6 || s === 14) ch.forEach(function (n) { tone(d, mtof(n + 12), t + sw, 0.4, { type: 'triangle', v: 0.035, a: 0.006, lp: 2400 }); });
        if (s % 8 === 0 || s % 8 === 6 || s % 4 === 2) noise(d, t + sw, 0.13, { f: 6500, v: 0.028, a: 0.003 });
        if (s === 0 && bar === 3 && Math.random() < 0.6) { tone(d, mtof(ch[2] + 24), t, 0.7, { type: 'triangle', v: 0.05, a: 0.01, lp: 2800 }); }
      } },
    // courses : fanfare de cuivres et galop de sabots
    horses: { bpm: 114, chords: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]], riff: { 0: 67, 4: 72, 8: 76, 10: 79, 12: 76, 14: 72 },
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15;
        if ([0, 3, 4, 7, 8, 11, 12, 15].indexOf(s) >= 0) { tone(d, 120, t, 0.09, { to: 70, v: 0.2, a: 0.003 }); noise(d, t, 0.05, { type: 'bandpass', f: 700, q: 1.4, v: 0.1 }); }
        if (s % 4 === 0) tone(d, mtof(ch[0] - 12), t, 0.3, { type: 'triangle', v: 0.13, a: 0.01 });
        if (this.riff[s] != null && (bar % 2 === 0 || s % 8 !== 10)) { var n = this.riff[s] + (bar === 2 ? 2 : 0); tone(d, mtof(n), t, 0.3, { type: 'sawtooth', v: 0.05, a: 0.02, lp: 2000 }); tone(d, mtof(n - 12), t, 0.3, { type: 'sawtooth', v: 0.03, a: 0.02, lp: 1200 }); }
        if (s === 0) ch.forEach(function (n) { tone(d, mtof(n + 12), t, 1.4, { type: 'sawtooth', v: 0.016, a: 0.1, lp: 1500 }); });
      } },
    // Tropi Shop : bossa nova, guitare nylon, shaker et flûte
    shop3d: { bpm: 98, chords: [[50, 57, 60, 64], [43, 53, 57, 62], [48, 55, 59, 62], [45, 52, 55, 61]], hits: [0, 3, 6, 10, 12], flute: [74, 77, 79, 81, 77],
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15;
        if (this.hits.indexOf(s) >= 0) ch.forEach(function (n, k) { tone(d, mtof(n + 12), t + k * 0.012, 0.5, { type: 'triangle', v: 0.04, a: 0.004, lp: 2600 }); });
        if (s === 0 || s === 8) tone(d, mtof(ch[0] - 12), t, 0.5, { type: 'sine', v: 0.18, a: 0.01 });
        if (s === 6 || s === 14) tone(d, mtof(ch[1] - 12), t, 0.3, { type: 'sine', v: 0.1, a: 0.01 });
        noise(d, t, 0.03, { f: 9000, v: s % 4 === 0 ? 0.03 : 0.018 });
        if ((s === 2 || s === 8 || s === 11) && Math.random() < 0.55) { var n = this.flute[(Math.random() * this.flute.length) | 0]; tone(d, mtof(n), t, 0.8, { type: 'sine', v: 0.05, a: 0.06, det: (Math.random() - 0.5) * 12 }); }
      } },
    // PMU : marimba enjouée, bois et tambourin
    pmu: { bpm: 118, chords: [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]],
      step: function (i, t, d) {
        var bar = (i >> 4) & 3, ch = this.chords[bar], s = i & 15;
        if (s % 2 === 0) { var f = hz(ch, ((s >> 1) + bar) % 4) * 2; tone(d, f, t, 0.22, { v: 0.07, a: 0.003 }); tone(d, f * 4, t, 0.06, { v: 0.02, a: 0.002 }); }
        if (s % 8 === 0) tone(d, mtof(ch[0] - 12), t, 0.28, { type: 'triangle', v: 0.15, a: 0.01 });
        if (s === 4 || s === 12) noise(d, t, 0.04, { type: 'bandpass', f: 2200, q: 2, v: 0.07 });
        if (s % 2 === 1) noise(d, t, 0.03, { f: 8500, v: 0.025 });
      } }
  };

  var M = { timer: 0, nextT: 0, step: 0, style: null, song: null, el: null, id: '', pending: false, last: {} };

  /* ---------- vraies musiques : assets/musique/playlist.json (fabriqué par scripts/generer-playlist.mjs) ----------
     { "hall": ["hall/titre-1.mp3", "hall/titre-2.mp3"], "slots": [...], ... } — plusieurs titres par salle : on en tire un au hasard à chaque entrée
     (jamais le même deux fois de suite) et à la fin de chaque titre, avec un fondu enchaîné. Sans fichiers, la musique synthétisée ci-dessus prend le relais. */
  var PL = null, plWait = [];
  function withPlaylist(fn) {
    if (PL) { fn(); return; }
    plWait.push(fn);
    if (plWait.length > 1) return;
    var done = function (j) { PL = j && typeof j === 'object' ? j : {}; var q = plWait; plWait = []; q.forEach(function (f) { f(); }); };
    try { fetch('assets/musique/playlist.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(done, function () { done({}); }); } catch (e) { done({}); }
  }
  function fade(song, to, tc) { try { song.gain.setTargetAtTime(to, bus.c.currentTime, tc); } catch (e) { /* ok */ } }
  function dropTrack(old) {                                        // fondu de sortie puis arrêt du titre
    if (!old) return;
    fade(old.gain, 0, 0.4);
    setTimeout(function () { try { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); old.gain.disconnect(); } catch (e) { /* ok */ } }, 2200);
  }
  function stopSong() {
    clearInterval(M.timer); M.timer = 0;
    var old = M.song; M.song = null; M.style = null;
    if (old && bus) { try { old.gain.setTargetAtTime(0, bus.c.currentTime, 0.25); setTimeout(function () { try { old.disconnect(); } catch (e) { /* ok */ } }, 1500); } catch (e) { /* ok */ } }
    if (M.el) { var t = M.el; M.el = null; dropTrack(t); }
  }
  function nextFile(id, list) {
    var pick = list[0];
    if (list.length > 1) { do { pick = list[(Math.random() * list.length) | 0]; } while (pick === M.last[id]); }
    M.last[id] = pick; return pick;
  }
  function playFile(id, list) {
    var b = bus, el = new Audio(), file = nextFile(id, list);
    el.preload = 'auto'; el.src = 'assets/musique/' + file;
    var src, g;
    try { src = b.c.createMediaElementSource(el); g = b.c.createGain(); g.gain.value = 0.0001; src.connect(g); g.connect(b.music); }
    catch (e) { startSynth(id); return; }
    var track = { el: el, gain: g };
    var old = M.el; M.el = track;
    if (old) dropTrack(old);
    el.addEventListener('canplay', function () { if (M.el === track) fade(g, 1, 0.8); }, { once: true });
    el.addEventListener('ended', function () { if (M.el === track && A.room === id) playFile(id, list); });
    el.addEventListener('error', function () { if (M.el === track) { M.el = null; dropTrack(track); startSynth(id); } });   // fichier introuvable : musique synthétisée
    var pr = el.play(); if (pr && pr.catch) pr.catch(function () { M.pending = true; });
  }

  function tick() {
    var b = bus; if (!b || !M.style) return;
    var spb = 60 / M.style.bpm / 4;
    if (b.c.state !== 'running') { M.nextT = b.c.currentTime + 0.1; return; }
    while (M.nextT < b.c.currentTime + 0.4) { try { M.style.step(M.step, M.nextT, M.song); } catch (e) { /* une note ratée ne coupe pas la musique */ } M.nextT += spb; M.step++; }
  }
  function startSynth(id) {
    var style = STYLES[id], b = bus; if (!style || !b) return;
    clearInterval(M.timer);
    if (M.song) { var o = M.song; o.gain.setTargetAtTime(0, b.c.currentTime, 0.25); setTimeout(function () { try { o.disconnect(); } catch (e) { /* ok */ } }, 1500); }
    M.song = b.c.createGain(); M.song.gain.value = 0.0001; M.song.gain.setTargetAtTime(1, b.c.currentTime, 0.6); M.song.connect(b.music);
    M.style = style; M.step = 0; M.nextT = b.c.currentTime + 0.12;
    M.timer = setInterval(tick, 90);
  }
  function start(id) {
    stopSong(); M.id = id;
    if (id === 'cinema') return;                                   // le cinéma a sa propre musique (cinema3d.js)
    var b = getBus(); if (!b) return;
    if (b.c.state !== 'running') { M.pending = true; return; }     // pas encore de geste : la musique démarrera au premier clic ou à la première touche
    A.update();
    withPlaylist(function () {
      if (A.room !== id || M.id !== id) return;                    // on a déjà changé de salle pendant le chargement
      var list = PL && PL[id];
      if (list && list.length) playFile(id, list); else startSynth(id);
    });
  }
  A.setRoom = function (id) {
    id = id || '';
    if (id === A.room && (M.song || M.el || !(STYLES[id] || (PL && PL[id])))) return;
    A.room = id; M.pending = false;
    if (!id || id === 'cinema') { stopSong(); return; }
    start(id);
  };
  A.hasFiles = function () { return !!PL && Object.keys(PL).some(function (k) { return PL[k] && PL[k].length; }); };
})();
