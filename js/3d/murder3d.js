/* =====================================================================
   murder3d.js — MURDER : un meurtrier, un policier, des innocents, dans une maison et son jardin (PC : clavier + souris · téléphone : joystick + boutons)
   ---------------------------------------------------------------------
   • Salle « murder » : on y entre par la porte « MURDER » du salon des mini jeux (réservée au Patron, au Co Fondateur et au Staff pour l'instant).
   • TOUT passe par le serveur (api/_doMurder.js, WebSocket /ws/murder) : rôles secrets, déplacements, portes, coups de couteau, lancers, tirs, fin de manche.
     Ici le navigateur envoie ses touches 30 fois par seconde, PRÉDIT son propre déplacement et se recale sur le serveur (même code : murder-sim.js).
   • Meurtrier : 1 pour sortir / ranger le couteau, clic = frapper, clic droit maintenu = barre de force puis lancer (téléphone : boutons). Il ramasse son couteau en marchant dessus.
     Policier : clic = tirer (1 balle), R = recharger. Innocents : se cachent, ouvrent les portes (E / F), survivent. Les morts regardent les vivants.
   • Dessin : la maison est construite par le code à partir de la carte de murder-sim.js (aucun fichier à charger).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom || !F.murderSim) return;
  var MS = F.murderSim, MAP = MS.MAP, CFG = MS.CFG, TAU = Math.PI * 2, WALL_H = MS.WALL_H, DOOR_H = MS.DOOR_H, WORLD = MS.WORLD;
  var COLS = [0xd94a4a, 0x3a8ad9, 0x4ab86a, 0xe0b030, 0xa05ad0, 0xe07a30], CSS = ['#d94a4a', '#3a8ad9', '#4ab86a', '#e0b030', '#a05ad0', '#e07a30'];
  var ROLE_TXT = { m: ['🔪 TU ES LE MEURTRIER', 'Tue tout le monde sans te faire repérer. Sors ton couteau (1), frappe de près ou lance-le. Si le policier te touche, c\'est perdu.', '#ff4d4d'],
    p: ['🔫 TU ES LE POLICIER', 'Trouve le meurtrier et tire : tu n\'as qu\'une balle, puis il faut recharger. Si tu tues un innocent, tu perds ton arme 15 secondes.', '#4da6ff'],
    i: ['🙂 TU ES INNOCENT', 'Survis jusqu\'à la fin du temps. Si le policier meurt, ramasse son revolver et démasque le meurtrier.', '#7dff9a'] };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  var angDiff = MS.angDiff;

  /* ------------------------------------------------------------------ sons (synthétisés) ------------------------------------------------------------------ */
  var AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function sfxVol() { try { var A = F.audio; return A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7; } catch (e) { return 0.7; } }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a || vol <= 0.002) return; var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol()), t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay, hp) {
    var a = ac(); if (!a || vol <= 0.002) return; var t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq || 2000; g.gain.value = vol * sfxVol();
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }
  var SND = {
    gun: function (v) { noise(0.05, 0.5 * v, 2500, 0, true); noise(0.32, 0.7 * v, 1900); tone(120, 35, 0.3, 'sawtooth', 0.35 * v); noise(0.5, 0.18 * v, 800, 0.12); },
    stab: function (v) { noise(0.14, 0.4 * v, 3600, 0, true); tone(170, 60, 0.16, 'sawtooth', 0.25 * v); },
    whoosh: function (v) { noise(0.4, 0.3 * v, 1500, 0, true); tone(500, 200, 0.35, 'sine', 0.08 * v); },
    thud: function (v) { tone(140, 60, 0.12, 'triangle', 0.3 * v); noise(0.08, 0.2 * v, 900); },
    door: function (v) { noise(0.35, 0.2 * v, 500); tone(110, 80, 0.3, 'sawtooth', 0.07 * v); },
    pick: function (v) { tone(700, 1100, 0.08, 'triangle', 0.2 * v); tone(1100, 1500, 0.08, 'triangle', 0.15 * v, 0.08); },
    kill: function (v) { tone(300, 80, 0.5, 'sawtooth', 0.28 * v); noise(0.3, 0.2 * v, 700); },
    reload: function () { tone(900, 700, 0.04, 'square', 0.1, 0); tone(500, 300, 0.06, 'square', 0.12, 0.4); tone(1200, 800, 0.03, 'square', 0.1, 1.5); },
    dry: function () { tone(1400, 900, 0.03, 'square', 0.1); },
    role: function () { tone(110, 110, 1.4, 'sawtooth', 0.14); tone(165, 150, 1.4, 'sine', 0.12, 0.05); },
    win: function (good) { tone(good ? 523 : 330, good ? 784 : 220, 0.5, 'triangle', 0.2); if (good) tone(784, 1046, 0.5, 'triangle', 0.2, 0.2); }
  };

  /* ------------------------------------------------------------------ matériaux, textures ------------------------------------------------------------------ */
  var mats = {}, texCache = {};
  function M(c, rough, emissive) { var k = c + '/' + (rough === undefined ? 0.75 : rough) + '/' + (emissive || 0); if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: rough === undefined ? 0.75 : rough, metalness: 0.05, emissive: emissive || 0x000000 }); return mats[k]; }
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function floorTex(kind) {
    if (texCache[kind]) return texCache[kind];
    var c = cv(256, 256), x = c.getContext('2d'), i, j;
    if (kind === 'parquet') { x.fillStyle = '#8a5a30'; x.fillRect(0, 0, 256, 256); for (i = 0; i < 8; i++) { for (j = 0; j < 4; j++) { x.fillStyle = 'hsl(28,' + (38 + ((i * 7 + j * 13) % 14)) + '%,' + (30 + ((i * 5 + j * 11) % 12)) + '%)'; x.fillRect(j * 64 + (i % 2) * 32, i * 32, 62, 30); } } x.fillStyle = 'rgba(0,0,0,.35)'; for (i = 0; i < 8; i++) x.fillRect(0, i * 32, 256, 2); }
    else if (kind === 'carrelage') { x.fillStyle = '#c9ccd2'; x.fillRect(0, 0, 256, 256); for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#e4e6ea' : '#b8bcc4'; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } }
    else if (kind === 'moquette') { x.fillStyle = '#4a5a78'; x.fillRect(0, 0, 256, 256); for (i = 0; i < 1500; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',.07)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } }
    else if (kind === 'herbe') { x.fillStyle = '#2f6a2c'; x.fillRect(0, 0, 256, 256); for (i = 0; i < 2600; i++) { x.fillStyle = 'hsl(' + (95 + Math.random() * 30) + ',55%,' + (22 + Math.random() * 16) + '%)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 4); } }
    else { x.fillStyle = '#7a7a80'; x.fillRect(0, 0, 256, 256); for (i = 0; i < 1500; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',.08)'; x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); } }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; texCache[kind] = t; return t;
  }

  /* ------------------------------------------------------------------ le mobilier (dessiné par le code) ------------------------------------------------------------------ */
  function furnMesh(f) {
    var g = new THREE.Group(), side = f.f === 'e' || f.f === 'w', lw = side ? f.d : f.w, ld = side ? f.w : f.d, h = f.h, c = f.c, hw = lw / 2, hd = ld / 2, dk = 0x2a1a10;
    function B(w, hh, d, x, y, z, col, rough) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), M(col === undefined ? c : col, rough)); m.position.set(x, y + hh / 2, z); g.add(m); return m; }
    function C(rt, rb, hh, x, y, z, col, seg) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg || 14), M(col === undefined ? c : col)); m.position.set(x, y + hh / 2, z); g.add(m); return m; }
    function S(r, x, y, z, col, sx, sy, sz) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), M(col === undefined ? c : col, 0.9)); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); g.add(m); return m; }
    function legs4(th, hh, col, inset) { var ix = hw - (inset || 0.06), iz = hd - (inset || 0.06); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { B(th, hh, th, q[0] * ix, 0, q[1] * iz, col); }); }
    var i, j;
    switch (f.t) {
      case 'bed': B(lw, 0.26, ld, 0, 0, 0, 0x4a2e1a); B(lw - 0.08, 0.2, ld - 0.08, 0, 0.26, 0, 0xece8e0); B(lw - 0.1, 0.07, ld * 0.62, 0, 0.46, hd * 0.3, c); B(lw, 0.95, 0.1, 0, 0, -hd + 0.05, 0x4a2e1a);
        if (lw > 1.5) { B(lw * 0.36, 0.1, 0.38, -lw * 0.22, 0.46, -hd + 0.4, 0xf4f0e8); B(lw * 0.36, 0.1, 0.38, lw * 0.22, 0.46, -hd + 0.4, 0xf4f0e8); } else B(lw * 0.7, 0.1, 0.38, 0, 0.46, -hd + 0.4, 0xf4f0e8); break;
      case 'nightstand': B(lw, h, ld, 0, 0, 0, c); B(lw + 0.04, 0.04, ld + 0.04, 0, h, 0, 0x3a2412); B(0.12, 0.02, 0.02, 0, h * 0.6, hd, 0xc9a227); S(0.1, 0, h + 0.14, 0, 0xf0d890, 1, 1.2, 1); break;
      case 'wardrobe': B(lw, h, ld, 0, 0, 0, c); B(0.02, h * 0.92, 0.03, 0, h * 0.04, hd, dk); B(0.03, 0.18, 0.03, -0.07, h * 0.5, hd + 0.01, 0xc9a227); B(0.03, 0.18, 0.03, 0.07, h * 0.5, hd + 0.01, 0xc9a227); B(lw + 0.04, 0.05, ld + 0.04, 0, h, 0, dk); break;
      case 'dresser': B(lw, h, ld, 0, 0, 0, c); B(lw + 0.04, 0.04, ld + 0.04, 0, h, 0, 0x3a2412); for (i = 1; i < 3; i++) B(lw * 0.96, 0.015, 0.02, 0, h * i / 3, hd, dk); for (i = 0; i < 3; i++) B(0.14, 0.03, 0.03, 0, h * (i + 0.5) / 3, hd + 0.02, 0xc9a227); break;
      case 'plant': C(0.2, 0.15, 0.32, 0, 0, 0, 0x9a5a34); C(0.18, 0.18, 0.03, 0, 0.31, 0, 0x3a2412); for (i = 0; i < 6; i++) { var a = i * 1.05; S(0.17, Math.sin(a) * 0.16, 0.62 + (i % 3) * 0.2, Math.cos(a) * 0.16, 0x2f7a35 + i * 0x010400, 1, 1.5, 1); } break;
      case 'bathtub': B(lw, h, ld, 0, 0, 0, 0xf0f2f4); B(lw - 0.16, 0.06, ld - 0.16, 0, h - 0.04, 0, 0x8ac8e8); C(0.03, 0.03, 0.2, -hw + 0.12, h, 0, 0xc0c4cc); break;
      case 'toilet': C(0.17, 0.12, 0.38, 0, 0, 0.05, 0xf0f2f4); B(lw * 0.8, 0.4, 0.2, 0, 0.4, -hd + 0.12, 0xf0f2f4); B(lw * 0.8, 0.04, 0.4, 0, 0.4, 0.07, 0xdcdfe3); break;
      case 'sink': C(0.09, 0.12, 0.6, 0, 0, -0.05, 0xf0f2f4); B(lw, 0.12, ld, 0, h - 0.17, 0, 0xf0f2f4); C(0.02, 0.02, 0.14, 0, h - 0.05, -hd + 0.08, 0xc0c4cc); break;
      case 'cabinet': B(lw, h, ld, 0, 0, 0, c); B(0.02, h * 0.9, 0.03, 0, h * 0.05, hd, dk); B(0.03, 0.14, 0.03, -0.06, h * 0.5, hd + 0.01, 0xc9a227); B(0.03, 0.14, 0.03, 0.06, h * 0.5, hd + 0.01, 0xc9a227); break;
      case 'desk': B(lw, 0.05, ld, 0, h - 0.05, 0, c); B(0.05, h - 0.05, ld - 0.1, -hw + 0.04, 0, 0, c); B(0.05, h - 0.05, ld - 0.1, hw - 0.04, 0, 0, c); B(lw * 0.3, 0.3, ld - 0.12, hw - 0.3, h - 0.38, 0, 0x4a2e1a);
        B(0.34, 0.02, 0.24, -0.2, h, 0.05, 0x9aa0a8); B(0.34, 0.22, 0.02, -0.2, h, -0.07, 0x20242a); break;
      case 'chair': B(lw, 0.06, ld, 0, 0.45, 0, c); legs4(0.04, 0.45, dk, 0.04); B(lw, 0.42, 0.05, 0, 0.5, -hd + 0.03, c); break;
      case 'bookshelf': B(lw, h, ld, 0, 0, 0, 0x3a2412);
        for (i = 0; i < 5; i++) { var y0 = 0.08 + i * (h - 0.16) / 5, n = Math.floor((side ? ld : lw) < 1 ? 5 : 8); for (j = 0; j < n; j++) { var bh = 0.22 + ((i * 3 + j * 5) % 4) * 0.04, col = [0x8a2a2a, 0x2a4a8a, 0x2a6a3a, 0xc8a040, 0x6a3a8a, 0x8a5a2a][(i + j * 2) % 6]; B(0.05 + (j % 3) * 0.015, bh, ld * 0.7, -hw + 0.1 + j * Math.max(0.06, (lw - 0.2) / n), y0 + 0.02, hd - ld * 0.35 + 0.01, col); } }
        break;
      case 'armchair': B(lw, 0.4, ld, 0, 0, 0, c); B(lw, 0.5, 0.2, 0, 0.4, -hd + 0.1, c); B(0.14, 0.28, ld * 0.8, -hw + 0.07, 0.4, 0.05, c); B(0.14, 0.28, ld * 0.8, hw - 0.07, 0.4, 0.05, c); B(lw - 0.3, 0.12, ld - 0.3, 0, 0.4, 0.08, 0xd8c8a8); break;
      case 'chest': B(lw, h * 0.7, ld, 0, 0, 0, c); B(lw + 0.02, h * 0.3, ld + 0.02, 0, h * 0.7, 0, 0x6a4a1a); B(0.05, 0.12, 0.03, 0, h * 0.55, hd, 0xc9a227); break;
      case 'shelf': B(lw, h, ld, 0, 0, 0, 0x3a2412); for (i = 0; i < 4; i++) B(lw * 0.9, 0.04, ld * 0.9, 0, 0.1 + i * (h - 0.2) / 3, 0.0, c); for (i = 0; i < 4; i++) B(0.18, 0.18, ld * 0.5, -hw + 0.12, 0.14 + i * (h - 0.2) / 3, 0.0, [0xc8a040, 0x6a8a3a, 0xa04a3a, 0x4a6aa0][i]); break;
      case 'washer': B(lw, h, ld, 0, 0, 0, c); var dr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20), M(0x5a6a7a)); dr.rotation.x = Math.PI / 2; dr.position.set(0, h * 0.5, hd + 0.01); g.add(dr); B(0.3, 0.06, 0.02, 0, h - 0.12, hd + 0.01, 0x20242a); break;
      case 'sinkunit': B(lw, h - 0.05, ld, 0, 0, 0, c); B(lw + 0.02, 0.05, ld + 0.02, 0, h - 0.05, 0, 0xd8d4cc); B(lw * 0.4, 0.02, ld * 0.6, 0, h - 0.01, 0, 0x8a8e96); C(0.02, 0.02, 0.2, 0, h, -hd + 0.1, 0xc0c4cc); for (i = 0; i < 2; i++) B(0.02, h * 0.7, 0.02, (i ? 1 : -1) * lw * 0.15, 0.1, hd, dk); break;
      case 'counter': B(lw, h - 0.05, ld, 0, 0, 0, c); B(lw + 0.02, 0.05, ld + 0.02, 0, h - 0.05, 0, 0xd8d4cc); for (i = 1; i < Math.round(lw / 0.6); i++) B(0.02, h * 0.7, 0.02, -hw + i * 0.6, 0.1, hd, dk); break;
      case 'stove': B(lw, h - 0.02, ld, 0, 0, 0, 0xc8ccd2); B(lw, 0.04, ld, 0, h - 0.02, 0, 0x16161a); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { C(0.09, 0.09, 0.02, q[0] * 0.18, h + 0.02, q[1] * 0.14, 0x2a2a30); }); B(lw * 0.7, 0.3, 0.02, 0, 0.25, hd, 0x16161a); break;
      case 'island': B(lw, h - 0.05, ld, 0, 0, 0, c); B(lw + 0.1, 0.05, ld + 0.1, 0, h - 0.05, 0, 0xe0dcd4); break;
      case 'fridge': B(lw, h, ld, 0, 0, 0, c); B(lw * 0.96, 0.02, 0.03, 0, h * 0.62, hd, 0x8a8e96); B(0.03, 0.4, 0.04, hw - 0.1, h * 0.7, hd + 0.02, 0x8a8e96); B(0.03, 0.4, 0.04, hw - 0.1, h * 0.25, hd + 0.02, 0x8a8e96); break;
      case 'stool': C(0.17, 0.17, 0.05, 0, 0.6, 0, c); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { B(0.03, 0.6, 0.03, q[0] * 0.12, 0, q[1] * 0.12, dk); }); break;
      case 'table': case 'gtable': B(lw, 0.05, ld, 0, h - 0.05, 0, c); legs4(0.07, h - 0.05, c, 0.08); if (f.t === 'table') { B(0.5, 0.03, 0.3, 0, h, 0, 0xe8e4dc); C(0.06, 0.08, 0.2, 0.3, h, 0.1, 0xb8d8e8); } else { C(0.03, 0.03, 1.4, 0, h, 0, 0x9a9aa0); C(0.9, 0.05, 0.2, 0, 2.0, 0, 0xd04a3a, 16); } break;
      case 'bench': B(lw, 0.06, ld, 0, h - 0.06, 0, c); B(0.06, h - 0.06, ld - 0.04, -hw + 0.06, 0, 0, dk); B(0.06, h - 0.06, ld - 0.04, hw - 0.06, 0, 0, dk); break;
      case 'coatrack': C(0.03, 0.03, h, 0, 0, 0, c); C(0.2, 0.2, 0.04, 0, 0, 0, 0x3a2a1a); for (i = 0; i < 4; i++) { B(0.18, 0.025, 0.025, Math.sin(i * 1.57) * 0.09, h - 0.1 - (i % 2) * 0.12, Math.cos(i * 1.57) * 0.09, 0x8a8a90); } B(0.3, 0.55, 0.05, 0, 1.0, 0.12, 0x2a3a5a); break;
      case 'sofa': B(lw, 0.42, ld, 0, 0, 0, c); B(lw, 0.5, 0.22, 0, 0.42, -hd + 0.11, c); B(0.18, 0.3, ld - 0.1, -hw + 0.09, 0.42, 0.04, c); B(0.18, 0.3, ld - 0.1, hw - 0.09, 0.42, 0.04, c); for (i = 0; i < 3; i++) B((lw - 0.4) / 3 - 0.02, 0.14, ld - 0.34, -hw + 0.2 + (i + 0.5) * (lw - 0.4) / 3, 0.42, 0.1, 0x4a5a6c); break;
      case 'tv': B(lw, 0.4, ld, 0, 0, 0, 0x2a1a10); B(lw * 0.85, 0.55, 0.05, 0, 0.5, 0, 0x0a0a0e); B(lw * 0.8, 0.5, 0.01, 0, 0.52, hd * 0.3 + 0.03, 0x1c3448).material = M(0x1c3448, 0.3, 0x0c1a28); B(0.2, 0.1, 0.1, 0, 0.4, 0, 0x16161a); break;
      case 'coffee': B(lw, 0.04, ld, 0, h - 0.04, 0, c); legs4(0.05, h - 0.04, dk, 0.06); B(0.3, 0.02, 0.2, 0.1, h, 0, 0xe8e4dc); C(0.04, 0.04, 0.1, -0.2, h, 0.05, 0xb85a3a); break;
      case 'piano': B(lw, h * 0.75, ld, 0, 0.2, 0, 0x15151a); legs4(0.08, 0.2, 0x15151a, 0.1); B(lw * 0.98, 0.04, ld * 0.3, 0, h * 0.62, hd - ld * 0.2, 0xf4f0e8); B(lw, 0.05, ld, 0, h - 0.0, 0, 0x15151a); break;
      case 'lamp': C(0.12, 0.12, 0.04, 0, 0, 0, 0x2a2a30); C(0.02, 0.02, 1.2, 0, 0, 0, 0x2a2a30); var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.3, 14), M(0xf0d890, 0.8, 0x8a6a28)); sh.position.set(0, 1.4, 0); g.add(sh); break;
      case 'tree': C(0.13, 0.2, 2.2, 0, 0, 0, 0x5a3a20, 8); S(1.2, 0, 3.0, 0, 0x2f6a30, 1, 0.9, 1); S(0.9, 0.5, 3.9, 0.2, 0x347a36, 1, 0.9, 1); S(0.8, -0.5, 3.6, -0.3, 0x2a6a2e, 1, 0.9, 1); break;
      case 'bush': S(0.55, -hw * 0.45, 0.45, 0, 0x2f7a35, 1, 0.85, 1); S(0.6, hw * 0.4, 0.45, 0, 0x347a38, 1, 0.85, 1); S(0.45, 0, 0.7, 0.05, 0x2a7030, 1, 0.8, 1); break;
      case 'barbecue': B(lw, 0.45, ld, 0, 0.45, 0, c); legs4(0.04, 0.45, 0x8a8a90, 0.05); B(lw * 0.9, 0.05, ld * 0.9, 0, 0.9, 0, 0x8a8a90); B(lw * 0.8, 0.08, ld * 0.8, 0, 0.88, 0, 0x4a1a0a); break;
      case 'pool': B(lw, h, ld, 0, 0, 0, 0xc8c4bc); B(lw - 0.5, 0.05, ld - 0.5, 0, h - 0.02, 0, 0x3aa8d8).material = M(0x3aa8d8, 0.15, 0x0a3a50); break;
      case 'car': B(lw, 0.55, ld, 0, 0.3, 0, c); B(lw * 0.9, 0.45, ld * 0.5, 0, 0.85, -ld * 0.05, c); B(lw * 0.92, 0.3, ld * 0.46, 0, 0.92, -ld * 0.05, 0x1a2a3a).material = M(0x1a2a3a, 0.2, 0x050a10);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { var w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16), M(0x16161a)); w.rotation.z = Math.PI / 2; w.position.set(q[0] * hw, 0.32, q[1] * ld * 0.32); g.add(w); }); B(0.3, 0.12, 0.04, -0.5, 0.5, hd, 0xfff0b0, 0.4).material = M(0xfff0b0, 0.4, 0x8a7a30); B(0.3, 0.12, 0.04, 0.5, 0.5, hd, 0xfff0b0).material = M(0xfff0b0, 0.4, 0x8a7a30); break;
      case 'workbench': B(lw, 0.06, ld, 0, h - 0.06, 0, c); legs4(0.08, h - 0.06, dk, 0.08); B(lw * 0.9, 0.04, ld * 0.8, 0, 0.3, 0, 0x4a3220); B(0.12, 0.15, 0.1, hw - 0.3, h, 0, 0x8a8a90); break;
      case 'crate': B(lw, h, ld, 0, 0, 0, c); for (i = 0; i < 3; i++) B(lw + 0.02, 0.04, ld + 0.02, 0, 0.1 + i * (h - 0.2) / 2, 0, 0x6a4a24); break;
      case 'basket': C(lw * 0.5, lw * 0.4, h, 0, 0, 0, c); C(lw * 0.45, lw * 0.45, 0.08, 0, h - 0.04, 0, 0xe8e4dc); break;
      default: B(lw, h, ld, 0, 0, 0, c);
    }
    g.position.set(f.x, 0, f.z); g.rotation.y = f.f === 'n' ? Math.PI : f.f === 'e' ? Math.PI / 2 : f.f === 'w' ? -Math.PI / 2 : 0;
    return g;
  }

  // fusionne tous les petits morceaux en un seul maillage par matériau (des centaines de pièces restent légères pour la carte graphique)
  function mergeStatic(root) {
    root.updateMatrixWorld(true); var groups = {}, order = [];
    root.traverse(function (o) { if (!o.isMesh || !o.geometry || !o.visible || Array.isArray(o.material)) return; var k = o.material.uuid; if (!groups[k]) { groups[k] = { mat: o.material, list: [] }; order.push(k); } groups[k].list.push(o); });
    var out = new THREE.Group();
    order.forEach(function (k) {
      var gr = groups[k], n = 0, parts = gr.list.map(function (m) { var geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); n += geo.attributes.position.count; return geo; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), o3 = 0, o2 = 0;
      parts.forEach(function (geo) { var p = geo.attributes.position, nm = geo.attributes.normal, u = geo.attributes.uv; pos.set(p.array, o3); if (nm) nor.set(nm.array, o3); if (u) uv.set(u.array, o2); o3 += p.count * 3; o2 += p.count * 2; geo.dispose(); });
      var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      var mesh = new THREE.Mesh(mg, gr.mat); mesh.frustumCulled = false; out.add(mesh);
    });
    root.traverse(function (o) { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    return out;
  }

  /* ------------------------------------------------------------------ la maison ------------------------------------------------------------------ */
  function buildHouse(low) {
    var T = 0.2;
    var g = new THREE.Group(), st = new THREE.Group(), i;
    function box(w, h, d, x, y, z, mat, into) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); (into || st).add(m); return m; }
    // sol du jardin (grand) et sols des pièces
    var gt = floorTex('herbe').clone(); gt.needsUpdate = true; gt.repeat.set(30, 24); var ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 104), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; g.add(ground);
    MAP.rooms.forEach(function (r) {
      if (r.id === 'jardin') return; var w = r.x1 - r.x0, d = r.z1 - r.z0, t = floorTex(r.floor).clone(); t.needsUpdate = true; t.repeat.set(w / 2.4, d / 2.4);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: r.floor === 'carrelage' ? 0.35 : 0.8 })); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, 0.005, (r.z0 + r.z1) / 2); g.add(m);
    });
    // allée de gravier devant la maison
    var path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(4, 0.003, 11.5); g.add(path);
    // tapis
    [[9.5, 4.8, 4, 3, 0x7a2a2a], [-1.5, 5.0, 3.6, 2.4, 0x2a3a5a], [-10.5, -4.6, 2.8, 2.2, 0x3a5a4a], [4.5, -4.6, 2, 2.4, 0xa05a2a], [0, 0, 20, 1.3, 0x6a2a2a]].forEach(function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), new THREE.MeshStandardMaterial({ color: r[4], roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(r[0], 0.014, r[1]); g.add(m); });
    // murs
    var wallMat = M(0xdcd2bc, 0.9), trim = M(0x8a7a5a, 0.8);
    MAP.walls.forEach(function (w) { box(w.x1 - w.x0, w.h, w.z1 - w.z0, (w.x0 + w.x1) / 2, 0, (w.z0 + w.z1) / 2, wallMat); });
    // plinthes (le long des murs de la maison, côté intérieur : simple liseré)
    MAP.walls.forEach(function (w) { var lx = w.x1 - w.x0, lz = w.z1 - w.z0; box(lx + (lx < lz ? 0.04 : 0), 0.12, lz + (lz < lx ? 0.04 : 0), (w.x0 + w.x1) / 2, 0, (w.z0 + w.z1) / 2, trim); });
    // linteaux au-dessus des portes et des ouvertures
    MAP.gaps.forEach(function (gp) { var top = gp.z === -9.5 ? 2.4 : WALL_H, hh = top - DOOR_H; if (hh > 0.02) { if (gp.axis === 'x') box(gp.w, hh, T, gp.x, DOOR_H, gp.z, wallMat); else box(T, hh, gp.w, gp.x, DOOR_H, gp.z, wallMat); } });

    // fenêtres décoratives
    var glass = M(0x2a4a6a, 0.1, 0x10243a), frame = M(0xf0ece4, 0.6);
    function win(x, z, ax, sgn) { var w = 1.3, hh = 1.0, y0 = 1.0, ox = ax === 'x' ? 0 : sgn * 0.11, oz = ax === 'x' ? sgn * 0.11 : 0; [1, -1].forEach(function (s) { var k = s; var px = x + (ax === 'x' ? 0 : k * 0.115 * sgn), pz = z + (ax === 'x' ? k * 0.115 * sgn : 0);
        if (ax === 'x') { box(w + 0.12, hh + 0.12, 0.03, px, y0 - 0.06, pz, frame); box(w, hh, 0.04, px, y0, pz, glass); box(0.04, hh, 0.05, px, y0, pz, frame); box(w, 0.04, 0.05, px, y0 + hh / 2 - 0.02, pz, frame); }
        else { box(0.03, hh + 0.12, w + 0.12, px, y0 - 0.06, pz, frame); box(0.04, hh, w, px, y0, pz, glass); box(0.05, hh, 0.04, px, y0, pz, frame); box(0.05, 0.04, w, px, y0 + hh / 2 - 0.02, pz, frame); } }); }
    [-9.5, -4, 0.5, 5.5, 10.5].forEach(function (x) { win(x, -8, 'x', 1); }); [-9, -1.5, 9.5].forEach(function (x) { win(x, 8, 'x', 1); }); [-4.5, 4.5].forEach(function (z) { win(-13, z, 'z', 1); win(13, z, 'z', 1); });
    // toit de la maison et du cabanon (le dessous, clair, est le plafond)
    function roof(x0, z0, x1, z1, y, th, col) { var mm = [M(col), M(col), M(col), M(0xe6dfd0, 0.95), M(col), M(col)], m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, th, z1 - z0), mm); m.position.set((x0 + x1) / 2, y + th / 2, (z0 + z1) / 2); g.add(m); }
    roof(-13.5, -8.5, 13.5, 8.5, WALL_H, 0.35, 0x5a2a22); roof(15, -15, 21, -9, 2.4, 0.3, 0x4a3a2a);
    // clôture du jardin
    var fm = M(0x8a6a46, 0.9), fx0 = WORLD.x0 - 0.2, fx1 = WORLD.x1 + 0.2, fz0 = WORLD.z0 - 0.2, fz1 = WORLD.z1 + 0.2;
    for (var x = fx0; x <= fx1; x += 1.6) { box(0.1, 1.2, 0.1, x, 0, fz0, fm); box(0.1, 1.2, 0.1, x, 0, fz1, fm); }
    for (var z = fz0; z <= fz1; z += 1.6) { box(0.1, 1.2, 0.1, fx0, 0, z, fm); box(0.1, 1.2, 0.1, fx1, 0, z, fm); }
    [0.45, 0.9].forEach(function (y) { box(fx1 - fx0, 0.07, 0.05, 0, y, fz0, fm); box(fx1 - fx0, 0.07, 0.05, 0, y, fz1, fm); box(0.05, 0.07, fz1 - fz0, fx0, y, 0, fm); box(0.05, 0.07, fz1 - fz0, fx1, y, 0, fm); });
    // mobilier
    MAP.furn.forEach(function (f) { st.add(furnMesh(f)); });
    g.add(mergeStatic(st));
    // lumières : ambiance de soirée, lampes chaudes dans les pièces
    g.add(new THREE.AmbientLight(0x8a96b8, 0.55)); g.add(new THREE.HemisphereLight(0x6a7aa8, 0x2a2a30, 0.55));
    var moon = new THREE.DirectionalLight(0x9ab0e8, 0.45); moon.position.set(-20, 30, 12); g.add(moon);
    var lp = low ? [[0, 0], [9.5, 5], [-1.5, 5], [-9, 4.5]] : [[-9.5, -4.5], [-4, -4.5], [0.5, -4.5], [5.5, -4.5], [10.5, -4.5], [0, 0], [-9, 4.5], [-1.5, 4.5], [4, 4.5], [9.5, 4.5]];
    lp.forEach(function (p) { var l = new THREE.PointLight(0xffd8a0, low ? 1.3 : 1.0, 10, 1.6); l.position.set(p[0], 2.3, p[1]); g.add(l); });
    if (!low) { var gl = new THREE.PointLight(0xffd8a0, 1.0, 10, 1.6); gl.position.set(18, 1.9, -12); g.add(gl); }
    // les portes (battants animés)
    var doors = MAP.doors.map(function (d) {
      var pivot = new THREE.Group(), leaf = new THREE.Group(), w = d.w, front = d.id === 9;
      var lm = new THREE.Mesh(new THREE.BoxGeometry(d.axis === 'x' ? w - 0.02 : 0.06, DOOR_H - 0.02, d.axis === 'x' ? 0.06 : w - 0.02), M(front ? 0x5a2a1a : 0x9a7040, 0.7)); lm.position.set(d.axis === 'x' ? w / 2 : 0, (DOOR_H - 0.02) / 2, d.axis === 'x' ? 0 : w / 2); leaf.add(lm);
      var kn = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(0xc9a227, 0.3)); kn.position.set(d.axis === 'x' ? w - 0.12 : 0.05, 1.0, d.axis === 'x' ? 0.05 : w - 0.12); leaf.add(kn);
      var kn2 = kn.clone(); kn2.position.set(d.axis === 'x' ? w - 0.12 : -0.05, 1.0, d.axis === 'x' ? -0.05 : w - 0.12); leaf.add(kn2);
      pivot.add(leaf); pivot.position.set(d.axis === 'x' ? d.x - w / 2 : d.x, 0, d.axis === 'x' ? d.z : d.z - w / 2); g.add(pivot);
      return { pivot: pivot, axis: d.axis, ang: 0, tgt: 0, sgn: d.axis === 'x' ? -1 : (d.x > 0 ? -1 : 1) };
    });
    return { group: g, doors: doors };
  }

  /* ------------------------------------------------------------------ les personnages ------------------------------------------------------------------ */
  function makeKnifeMesh() { var k = new THREE.Group(); var bl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.3), M(0xdfe6ee, 0.15)); bl.position.z = 0.15; k.add(bl); var tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), M(0xdfe6ee, 0.15)); tip.rotation.x = Math.PI / 2; tip.position.z = 0.335; k.add(tip); var hd = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.12), M(0x1a1a1e, 0.6)); hd.position.z = -0.06; k.add(hd); var gd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), M(0x8a8a90, 0.3)); k.add(gd); return k; }
  function makeGunMesh() { var gn = new THREE.Group(); var br = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10), M(0x6a6e76, 0.25)); br.rotation.x = Math.PI / 2; br.position.set(0, 0.04, 0.16); gn.add(br); var dr = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 12), M(0x5a5e66, 0.25)); dr.rotation.x = Math.PI / 2; dr.position.set(0, 0.03, 0.04); gn.add(dr); var gp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), M(0x4a2a14, 0.7)); gp.position.set(0, -0.05, -0.03); gp.rotation.x = 0.35; gn.add(gp); return gn; }
  function makeHuman(ci) {
    var g = new THREE.Group(), shirt = M(COLS[ci % 6], 0.8), pants = M(0x2a3040, 0.8), skin = M(0xd9a98a, 0.7), hair = M(0x2a1c14, 0.9), shoe = M(0x15151a, 0.8), legs = [], arms = [];
    [-0.1, 0.1].forEach(function (x) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), pants); l.geometry.translate(0, -0.4, 0); l.position.set(x, 0.82, 0); g.add(l); legs.push(l); var s = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.1, 0.29), shoe); s.position.set(0, -0.78, 0.04); l.add(s); });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), shirt); torso.position.y = 1.12; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skin); head.position.y = 1.58; g.add(head);
    var hr = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, TAU, 0, Math.PI * 0.55), hair); hr.position.set(0, 1.6, -0.01); g.add(hr);
    [-0.32, 0.32].forEach(function (x) { var a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.13), shirt); a.geometry.translate(0, -0.25, 0); a.position.set(x, 1.38, 0); g.add(a); arms.push(a); var h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin); h.position.y = -0.55; a.add(h); });
    var hold = new THREE.Group(); hold.position.set(0, -0.55, 0.04); arms[1].add(hold);
    var knife = makeKnifeMesh(), gun = makeGunMesh(); knife.visible = false; gun.visible = false; hold.add(knife); hold.add(gun);
    g.userData = { legs: legs, arms: arms, knife: knife, gun: gun, torso: torso }; return g;
  }
  function nameTag(name, col) {
    var c = cv(256, 64), x = c.getContext('2d'); x.fillStyle = 'rgba(8,6,20,0.72)'; x.fillRect(4, 8, 248, 48); x.fillStyle = col || '#fff'; x.font = '800 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(name).slice(0, 14), 128, 33, 230);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: true })); sp.scale.set(1.3, 0.33, 1); sp.renderOrder = 30; return sp;
  }

  /* ------------------------------------------------------------------ interface (CSS) ------------------------------------------------------------------ */
  function injectCss() {
    if (document.getElementById('mdr-css')) return;
    var s = document.createElement('style'); s.id = 'mdr-css';
    s.textContent =
      '.mdr-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:inherit;color:#fff;user-select:none;-webkit-user-select:none}' +
      '.mdr-box{background:rgba(8,6,20,.74);border:1px solid rgba(255,255,255,.18);border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.4)}' +
      '.mdr-top{position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center;padding:5px 20px;min-width:200px}.mdr-top .t{font-size:26px;font-weight:900;font-family:' + (F.MONO || 'monospace') + '}.mdr-top .p{font-size:12px;font-weight:800;opacity:.9}' +
      '.mdr-role{position:absolute;left:12px;top:10px;padding:5px 14px;font-weight:900;font-size:14px;border-radius:18px;display:none}' +
      '.mdr-feed{position:absolute;right:12px;top:10px;display:flex;flex-direction:column;gap:5px;align-items:flex-end;max-width:46%}.mdr-feed div{background:rgba(8,6,20,.78);border-radius:10px;padding:5px 11px;font-weight:800;font-size:13px;animation:mdrfeed 7s forwards}@keyframes mdrfeed{0%{opacity:0;transform:translateX(20px)}6%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}' +
      '.mdr-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 0 4px #000}.mdr-cross.gun{width:22px;height:22px;margin:-11px 0 0 -11px;background:none;border:2px solid #fff}' +
      '.mdr-act{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:8px 16px;text-align:center;min-width:220px;font-weight:800;font-size:14px}.mdr-act small{display:block;opacity:.75;font-size:11px;font-weight:700;margin-top:2px}' +
      '.mdr-bar{height:12px;border-radius:7px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:6px;display:none}.mdr-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffd23f,#ff4d4d)}' +
      '.mdr-hint{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-weight:900;font-size:15px;text-shadow:0 2px 0 #000,0 0 10px #000;opacity:0;transition:opacity .12s;white-space:nowrap}.mdr-hint.on{opacity:1}' +
      '.mdr-list{position:absolute;left:12px;top:56px;width:220px;padding:8px 12px;font-size:13px;font-weight:800}.mdr-list div{display:flex;align-items:center;gap:8px;padding:2px 0}.mdr-list i{width:11px;height:11px;border-radius:50%;display:inline-block}.mdr-list .dead{opacity:.45;text-decoration:line-through}' +
      '.mdr-spec{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 18px;font-weight:900;font-size:15px;text-align:center;display:none;pointer-events:auto}.mdr-spec small{display:block;opacity:.75;font-size:11px;font-weight:700}' +
      '.mdr-banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;display:none;max-width:90%;padding:16px 26px;border-radius:18px;background:rgba(0,0,0,.72);border:2px solid currentColor}.mdr-banner b{display:block;font-size:clamp(22px,4.4vw,44px);font-weight:900;text-shadow:0 3px 0 #000}.mdr-banner small{display:block;margin-top:8px;font-size:clamp(12px,1.8vw,16px);font-weight:700;color:#fff}' +
      '.mdr-toast{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%) scale(.8);opacity:0;transition:opacity .2s,transform .3s;font-weight:900;font-size:clamp(18px,3.4vw,32px);text-shadow:0 3px 0 #000;white-space:nowrap}.mdr-toast.in{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '.mdr-res{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(8,6,20,.94);border:2px solid rgba(255,255,255,.25);border-radius:18px;padding:16px 20px;display:none;min-width:300px;max-width:94vw;max-height:84vh;overflow:auto}.mdr-res.on{display:block}.mdr-res h3{margin:0 0 4px;text-align:center;font-size:22px}.mdr-res p{margin:0 0 10px;text-align:center;opacity:.8;font-size:13px;font-weight:700}.mdr-res table{width:100%;border-collapse:collapse;font-size:14px;font-weight:800}.mdr-res td{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.1)}.mdr-res tr.me td{color:#ffd23f}' +
      '.mdr-flash{position:absolute;inset:0;box-shadow:inset 0 0 140px 50px rgba(255,0,0,.6);opacity:0;transition:opacity .6s}.mdr-flash.on{opacity:1;transition:none}' +
      '.mdr-pause{position:absolute;inset:0;background:rgba(4,3,12,.62);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;pointer-events:auto;text-align:center}.mdr-pause.on{display:flex}.mdr-pause .b{font-size:30px;font-weight:900}.mdr-pause small{opacity:.85;font-size:13px;font-weight:700;max-width:460px;line-height:1.5}.mdr-pause button{padding:10px 22px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(120,30,40,.92);color:#fff;font-weight:900;font-size:15px;cursor:pointer}' +
      '.mdr-quit{position:absolute;right:10px;bottom:10px;width:40px;height:40px;border-radius:50%;pointer-events:auto;border:1px solid rgba(255,255,255,.3);background:rgba(8,6,20,.7);color:#fff;font-weight:900;font-size:16px;display:none}' +
      '.mdr-touch .mdr-act{left:50%;min-width:0;max-width:44%;bottom:8px;padding:6px 10px;font-size:12px}.mdr-touch .mdr-top{top:6px;padding:3px 14px;min-width:150px}.mdr-touch .mdr-top .t{font-size:20px}.mdr-touch .mdr-list{top:46px;width:170px;font-size:12px}.mdr-t{display:none}.mdr-touch .mdr-t{display:block}.mdr-touch .mdr-btns{display:flex}.mdr-touch .mdr-quit{display:block}' +
      '.mdr-look{position:absolute;right:0;top:0;width:62%;height:100%;pointer-events:auto;touch-action:none}' +
      '.mdr-stick{position:absolute;left:22px;bottom:22px;width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:none}.mdr-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.45)}' +
      '.mdr-btns{position:absolute;right:14px;bottom:60px;flex-wrap:wrap;gap:10px;justify-content:flex-end;max-width:240px}.mdr-b{pointer-events:auto;touch-action:none;min-width:64px;height:64px;padding:0 8px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(8,6,20,.62);color:#fff;font-weight:900;font-size:12px;line-height:1.1;display:none;align-items:center;justify-content:center;text-align:center}.mdr-b.on{display:flex}.mdr-b.hot{background:rgba(255,180,40,.55)}.mdr-b:active{background:rgba(255,255,255,.35)}.mdr-b.big{min-width:78px;height:78px;font-size:13px}';
    document.head.appendChild(s);
  }

  /* ==================================================================
     LA SALLE
     ================================================================== */
  function createRoom(world) {
    var room = { title: '🔪 MURDER', subtitle: 'UN MEURTRIER PARMI VOUS', topic: 'flambeurs-murder-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [], hideSelf: true, noHand: true };
    var g = room.group; room.bounds = { xMin: -600, xMax: 600, zMin: -600, zMax: 600 };

    var active = false, ui = null, keys = {}, ws = null, wsOk = false, netErr = '', reconnectT = 0, myKey = '', seq = 0, pending = [], inpAcc = 0, snap = null, hudT = 0, toastT = 0, paused = true, roomName = '';
    var house = null, remotes = {}, curPh = '', open = MAP.doors.map(function () { return false; }), spectate = '', knifeVis = null, gunVis = null, kAir = null;
    var me = { c: MS.newPlayer(), role: '', alive: true, ready: false, rc: -1, am: 0, rl: 0, ch: 0, ks: '', sc: 0, gb: 0, ci: 0, ko: 0, hg: 0 };
    var cam = { yaw: 0, pitch: 0 }, bob = 0, oldFog = null, oldBg = null, oldEnv = null, flashT = 0, pressT = 0, charging = false, chargeT0 = 0, everOpen = false, failCount = 0, touch = false, stickV = { x: 0, y: 0 }, tBtn = {}, doorHint = -1, shotLights = [], tracers = [];
    var vmScene = null, vmCam = null, vm = null, vmKnife = null, vmGun = null, origRender = null, vmAnim = { stab: 0, throwT: 0, recoil: 0, rl: 0 };

    function myName() { try { return (typeof state !== 'undefined' && state && state.username) ? state.username : F.me(); } catch (e) { return F.me(); } }
    function nameOf(k) { var r = remotes[k]; return k === myKey ? myName() : (r ? r.name : k); }

    /* ---------- le serveur ---------- */
    function wsSend(o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) { /* ok */ } } }
    function pickRoom(cb) {
      var done = false; function fin(n) { if (done) return; done = true; cb('pub-' + n); }
      setTimeout(function () { fin('1'); }, 2500);
      try {
        fetch('/api/murder-info', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          if (!d) { fin('1'); return; } var best = null, bs = -1;
          Object.keys(d).forEach(function (k) { var x = d[k]; if (!x || x.n >= CFG.max) return; var sc = (x.ph === 'lobby' ? 100 : 0) + (x.n > 0 ? 10 + x.n : 0) - +k * 0.01; if (sc > bs) { bs = sc; best = k; } });
          fin(best || '1');
        }).catch(function () { fin('1'); });
      } catch (e) { fin('1'); }
    }
    function connect() {
      var tok = F.token(); if (!tok) { netErr = 'Connecte-toi pour jouer.'; return; }
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/murder?token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(myName()) + '&room=' + encodeURIComponent(roomName);
      try { ws = new WebSocket(url); } catch (e) { netErr = 'Serveur indisponible.'; return; }
      var mine = ws;
      ws.onopen = function () { if (ws !== mine) return; wsOk = true; netErr = ''; everOpen = true; failCount = 0; };
      ws.onmessage = function (ev) { if (ws !== mine) return; var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onNet(m); };
      ws.onclose = function () {
        if (ws !== mine) return; wsOk = false; me.ready = false;
        if (!active) return;
        if (!everOpen && ++failCount >= 2) { netErr = 'Salon complet ou accès refusé…'; setTimeout(function () { if (active) world.goRoom('minijeux', 'murder'); }, 2500); return; }
        netErr = 'Connexion au serveur…'; reconnectT = 1.5;
      };
      ws.onerror = function () { /* onclose suit */ };
    }
    function distVol(x, z, ref) { var d = Math.hypot(x - me.c.x, z - me.c.z); return Math.max(0, 1 - d / (ref || 30)); }
    function onNet(m) {
      if (m.t === 'welcome') { me.ci = m.ci || 0; }
      else if (m.t === 's') { snap = m; applySnap(m); }
      else if (m.t === 'ev') onEvent(m);
      else if (m.t === 'end') showResults(m);
    }
    function onEvent(e) {
      var r = remotes[e.k];
      if (e.e === 'role') { me.role = e.r; showBanner(e.r); SND.role(); }
      else if (e.e === 'round') { if (ui) { ui.res.classList.remove('on'); ui.feed.innerHTML = ''; } spectate = ''; }
      else if (e.e === 'go') toast('🏃 C\'est parti !', '#fff', 1.6);
      else if (e.e === 'late') toast('👁 Manche en cours : tu regardes les autres', '#ffd24a', 3.5);
      else if (e.e === 'door') { open[e.i] = !!e.o; var d = MAP.doors[e.i]; SND.door(distVol(d.x, d.z)); }
      else if (e.e === 'stab') { if (r) { r.swing = 0.3; } var sx = r ? r.x : me.c.x, sz = r ? r.z : me.c.z; SND.stab(e.k === myKey ? 1 : distVol(sx, sz)); if (e.k === myKey) vmAnim.stab = 0.3; }
      else if (e.e === 'throw') { var tv = distVol(e.x, e.z, 40); SND.whoosh(e.k === myKey ? 1 : tv); if (e.k === myKey) vmAnim.throwT = 0.3; if (r) r.swing = 0.3; kAir = { x: e.x, z: e.z, a: e.yaw }; }
      else if (e.e === 'land') { SND.thud(distVol(e.x, e.z, 30) + 0.2); }
      else if (e.e === 'shot') {
        SND.gun(e.k === myKey ? 1 : Math.max(0.2, distVol(e.x, e.z, 45))); if (e.k === myKey) vmAnim.recoil = 0.25;
        var tr = tracers.filter(function (q) { return q.life <= 0; })[0]; if (!tr) { var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9 })); ln.frustumCulled = false; g.add(ln); tr = { l: ln, life: 0 }; tracers.push(tr); }
        var p = tr.l.geometry.attributes.position, ox = e.x + Math.sin(e.yaw) * 0.6, oz = e.z - Math.cos(e.yaw) * 0.6; p.setXYZ(0, ox, 1.25, oz); p.setXYZ(1, e.x + Math.sin(e.yaw) * e.len, 1.25, e.z - Math.cos(e.yaw) * e.len); p.needsUpdate = true; tr.l.visible = true; tr.life = 0.12;
      }
      else if (e.e === 'kill') {
        feed('💀 <b>' + esc(nameOf(e.k)) + '</b> a été tué' + (e.how === 'shot' ? ' d\'une balle' : e.how === 'throw' ? ' par un couteau lancé' : ''));
        SND.kill(e.k === myKey ? 1 : distVol(e.x, e.z, 40));
        if (e.k === myKey) { me.alive = false; flashT = 0.6; if (ui) { ui.flash.classList.remove('on'); void ui.flash.offsetWidth; ui.flash.classList.add('on'); setTimeout(function () { ui && ui.flash.classList.remove('on'); }, 60); } toast('☠ Tu es mort — tu regardes les vivants', '#ff6a6a', 3.5); }
      }
      else if (e.e === 'gundrop') { feed('🔫 Le revolver est tombé au sol !'); if (e.ban && e.k === myKey) toast('Tu ne peux pas le reprendre avant ' + e.ban + ' s', '#ffd24a', 3); }
      else if (e.e === 'pick') { if (e.what === 'knife') { if (e.k === myKey) toast('🔪 Couteau récupéré', '#fff', 1.2); } else feed('🔫 <b>' + esc(nameOf(e.k)) + '</b> a ramassé le revolver'); if (e.k === myKey) SND.pick(1); }
      else if (e.e === 'reload') SND.reload();
    }

    /* ---------- état reçu du serveur ---------- */
    function applySnap(m) {
      var seen = {};
      open = MAP.doors.map(function () { return false; }); m.od.forEach(function (i) { open[i] = true; });
      m.pl.forEach(function (p) { seen[p.k] = true; if (p.k === myKey) reconcile(p); else upsertRemote(p); });
      Object.keys(remotes).forEach(function (k) { if (!seen[k]) dropRemote(k); });
      if (m.ph !== curPh) { onPhase(curPh, m.ph); curPh = m.ph; }
      // le couteau / l'arme par terre
      if (m.kn) { if (m.kn.st === 'air') { if (!kAir || Math.hypot(kAir.x - m.kn.x, kAir.z - m.kn.z) > 2.5) kAir = { x: m.kn.x, z: m.kn.z, a: m.kn.a }; else { kAir.a = m.kn.a; kAir.x += (m.kn.x - kAir.x) * 0.4; kAir.z += (m.kn.z - kAir.z) * 0.4; } } else kAir = null; }
      else kAir = null;
      knifeState = m.kn;
    }
    var knifeState = null;
    function onPhase(from, to) {
      if (to === 'lobby') { if (ui) ui.res.classList.remove('on'); me.role = ''; me.alive = true; spectate = ''; if (ui) ui.banner.style.display = 'none'; }
    }
    function reconcile(p) {
      var c = me.c;
      me.alive = !!p.al; me.am = p.am; me.rl = p.rl; me.ch = p.ch; me.ks = p.ks; me.sc = p.sc; me.gb = p.gb; me.ko = p.ko; me.hg = p.hg; me.ci = p.ci;
      if (p.r && p.r !== me.role && curPh !== 'lobby') me.role = p.r;
      if (p.rc !== me.rc || !me.ready) { me.rc = p.rc; me.ready = true; c.x = p.x; c.z = p.z; c.vx = p.vx; c.vz = p.vz; cam.yaw = p.a; pending = []; return; }
      pending = pending.filter(function (q) { return q.seq > p.ack; });
      var pc = MS.newPlayer(); pc.x = p.x; pc.z = p.z; pc.vx = p.vx; pc.vz = p.vz;
      for (var k = 0; k < pending.length; k++) { var inp = pending[k].inp; if (!frozen()) for (var i = 0; i < 3; i++) MS.stepPlayer(pc, inp, 1 / 90, open); }
      var err = Math.hypot(pc.x - c.x, pc.z - c.z);
      if (err > 1.4) { c.x = pc.x; c.z = pc.z; c.vx = pc.vx; c.vz = pc.vz; } else { c.x += (pc.x - c.x) * 0.25; c.z += (pc.z - c.z) * 0.25; c.vx += (pc.vx - c.vx) * 0.25; c.vz += (pc.vz - c.vz) * 0.25; }
    }
    function frozen() { return curPh === 'intro' || curPh === 'results' || (!me.alive && curPh !== 'lobby'); }

    /* ---------- les autres joueurs ---------- */
    function upsertRemote(p) {
      var r = remotes[p.k];
      if (!r) { r = remotes[p.k] = { k: p.k, name: String(p.n || p.k).slice(0, 20), grp: new THREE.Group(), body: null, tag: nameTag(p.n || p.k, '#fff'), x: p.x, z: p.z, yaw: p.a || 0, tx: p.x, tz: p.z, ta: 0, vx: 0, vz: 0, walk: 0, al: 1, ci: p.ci, fall: 0, swing: 0, recv: performance.now() }; r.body = makeHuman(p.ci); r.grp.add(r.body); g.add(r.grp); g.add(r.tag); }
      r.tx = p.x; r.tz = p.z; r.ta = p.a || 0; r.vx = p.vx || 0; r.vz = p.vz || 0; r.ko = p.ko; r.hg = p.hg; r.recv = performance.now();
      if (p.al && !r.al) { r.fall = 0; r.x = p.x; r.z = p.z; }                // nouvelle manche : le joueur se relève
      r.al = p.al; r.ci = p.ci;
    }
    function dropRemote(k) { var r = remotes[k]; if (!r) return; g.remove(r.grp); g.remove(r.tag); r.tag.material.map.dispose(); delete remotes[k]; if (spectate === k) spectate = ''; }
    function aliveOthers() { return Object.keys(remotes).filter(function (k) { return remotes[k].al; }); }
    function nextSpectate(dir) { var l = aliveOthers(); if (!l.length) { spectate = ''; return; } var i = l.indexOf(spectate); spectate = l[((i < 0 ? (dir > 0 ? -1 : 0) : i) + (dir || 1) + l.length) % l.length]; }

    /* ---------- l'arme en main (1re personne) : dessinée dans une 2e passe avec son propre éclairage, pour ne pas traverser les murs ---------- */
    function ensureVm() {
      if (vmScene) return;
      vmScene = new THREE.Scene(); vmCam = new THREE.PerspectiveCamera(46, 1.6, 0.02, 10);
      vmScene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a78, 1.3)); var d1 = new THREE.DirectionalLight(0xfff2e0, 1.4); d1.position.set(1.5, 2.5, 2); vmScene.add(d1);
      vm = new THREE.Group(); vmKnife = makeKnifeMesh(); vmGun = makeGunMesh(); vmKnife.scale.setScalar(1.15); vmGun.scale.setScalar(1.05); vmKnife.rotation.y = Math.PI; vmGun.rotation.y = Math.PI; vm.add(vmKnife); vm.add(vmGun); vmScene.add(vm);
      var r = world.renderer; if (!origRender) { origRender = r.render; r.render = function (s, c) { origRender.call(r, s, c); if (s === world.scene) drawVm(); }; }
    }
    function drawVm() {
      if (!vm || !active || !me.alive || !me.ready || curPh === 'lobby' && !me.hg || !(vmKnife.visible || vmGun.visible)) return;
      var r = world.renderer, dom = r.domElement, a = r.autoClear; vmCam.aspect = dom.clientWidth / Math.max(1, dom.clientHeight); vmCam.updateProjectionMatrix();
      r.autoClear = false; r.clearDepth(); origRender.call(r, vmScene, vmCam); r.autoClear = a;
    }
    function updateVm(dt) {
      if (!vm) return;
      var showK = me.role === 'm' && me.ko && me.ks === 'hand' && me.alive, showG = !!me.hg && me.alive;
      vmKnife.visible = showK; vmGun.visible = showG && !showK;
      vmAnim.stab = Math.max(0, vmAnim.stab - dt); vmAnim.throwT = Math.max(0, vmAnim.throwT - dt); vmAnim.recoil = Math.max(0, vmAnim.recoil - dt);
      var spd = Math.hypot(me.c.vx, me.c.vz), bx = Math.sin(bob * 9) * 0.006 * Math.min(1, spd / 4), by = Math.abs(Math.cos(bob * 9)) * 0.006 * Math.min(1, spd / 4);
      if (showK) { var s = vmAnim.stab / 0.3, th = vmAnim.throwT / 0.3, ch = charging ? Math.min(1, (performance.now() / 1000 - chargeT0) / CFG.chargeMax) : 0; vm.position.set(0.16 + bx - s * 0.1, -0.13 + by + ch * 0.05, -0.62 - Math.sin(s * Math.PI) * 0.25 + ch * 0.07); vm.rotation.set(-0.35 - s * 0.6 + th * 0.4 - ch * 0.35, -0.45 + s * 0.5, 0.15); }
      else if (showG) { var rc = vmAnim.recoil / 0.25; vm.position.set(0.15 + bx, -0.15 + by + rc * 0.02, -0.5 + rc * 0.06); vm.rotation.set(0.02 + rc * 0.5, 0.05, 0); vmGun.position.z = 0; }
    }

    /* ---------- actions ---------- */
    function doStab() { if (me.role === 'm' && me.alive && curPh === 'play') { if (me.ks !== 'hand') { SND.dry(); return; } wsSend({ t: 'stab' }); } }
    function doKnife() { if (me.role === 'm' && me.alive && curPh === 'play' && me.ks === 'hand') wsSend({ t: 'knife' }); }
    function chargeStart() { if (me.role !== 'm' || !me.alive || curPh !== 'play' || me.ks !== 'hand' || charging) return; charging = true; chargeT0 = performance.now() / 1000; wsSend({ t: 'tc' }); }
    function chargeRelease() { if (!charging) return; charging = false; wsSend({ t: 'tr', yaw: +cam.yaw.toFixed(4) }); }
    function doShoot() { if (!me.alive || curPh !== 'play' || !me.hg) return; if (me.am <= 0 || me.rl > 0) { SND.dry(); if (me.am <= 0 && me.rl <= 0) wsSend({ t: 'reload' }); return; } me.am = 0; wsSend({ t: 'shoot', yaw: +cam.yaw.toFixed(4) }); }
    function doReload() { if (me.hg && me.am <= 0 && me.rl <= 0) wsSend({ t: 'reload' }); }
    function doUse() { if (me.alive && curPh !== 'results') wsSend({ t: 'use' }); }
    function primary() { if (!me.alive) { nextSpectate(1); return; } if (me.role === 'm') doStab(); else doShoot(); }

    /* ---------- interface ---------- */
    function toast(t, col, dur) { if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.textContent = t; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 1.8; }
    function feed(html) { if (!ui) return; var d = document.createElement('div'); d.innerHTML = html; ui.feed.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 7000); while (ui.feed.children.length > 5) ui.feed.removeChild(ui.feed.children[0]); }
    function showBanner(r) { if (!ui) return; var t = ROLE_TXT[r]; if (!t) return; ui.banner.style.color = t[2]; ui.banner.innerHTML = '<b>' + t[0] + '</b><small>' + t[1] + '</small>'; ui.banner.style.display = 'block'; setTimeout(function () { if (ui && curPh !== 'intro') ui.banner.style.display = 'none'; }, CFG.intro * 1000 + 1500); }
    function buildUi() {
      injectCss(); touch = !!(world.touch || (F.isPhone && F.isPhone()));
      var el = document.createElement('div'); el.className = 'mdr-hud' + (touch ? ' mdr-touch' : '');
      el.innerHTML = '<div class="mdr-box mdr-top"><div class="t"></div><div class="p"></div></div><div class="mdr-role"></div><div class="mdr-feed"></div><div class="mdr-box mdr-list"></div><div class="mdr-cross"></div><div class="mdr-hint"></div>' +
        '<div class="mdr-box mdr-act"><span class="a"></span><small></small><div class="mdr-bar"><i></i></div></div><div class="mdr-box mdr-spec"></div><div class="mdr-banner"></div><div class="mdr-toast"></div><div class="mdr-flash"></div><div class="mdr-res"></div>' +
        '<div class="mdr-pause"><div class="b">🔪 MURDER</div><small>Clique pour jouer (la souris est capturée · Échap pour la libérer).<br>ZQSD : marcher · Maj : courir · E / F : ouvrir une porte · 1 : sortir le couteau · clic : frapper / tirer · clic droit maintenu : lancer le couteau · R : recharger · Tab : joueurs</small><button data-a="play">▶ Jouer</button><button data-a="quit">🚪 Quitter</button></div>' +
        '<div class="mdr-t mdr-look"></div><div class="mdr-t mdr-stick"><i></i></div><div class="mdr-btns mdr-t"><button class="mdr-b big on" data-b="use">🚪<br>Ouvrir</button><button class="mdr-b" data-b="knife">🔪<br>Sortir</button><button class="mdr-b" data-b="stab">⚔<br>Frapper</button><button class="mdr-b" data-b="throw">🎯<br>Lancer</button><button class="mdr-b" data-b="shoot">🔫<br>Tirer</button><button class="mdr-b" data-b="reload">↻<br>Recharger</button><button class="mdr-b" data-b="next">👁<br>Suivant</button></div><button class="mdr-quit" data-a="quit">✕</button>';
      world.container.appendChild(el);
      var q = function (s) { return el.querySelector(s); };
      el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'quit') world.goRoom('minijeux', 'murder'); else if (b.dataset.a === 'play') lock(); });
      var u = { el: el, top: q('.mdr-top .t'), phase: q('.mdr-top .p'), role: q('.mdr-role'), feed: q('.mdr-feed'), list: q('.mdr-list'), cross: q('.mdr-cross'), hint: q('.mdr-hint'), act: q('.mdr-act .a'), actS: q('.mdr-act small'), actBox: q('.mdr-act'), bar: q('.mdr-bar'), barI: q('.mdr-bar i'), spec: q('.mdr-spec'), banner: q('.mdr-banner'), toast: q('.mdr-toast'), flash: q('.mdr-flash'), res: q('.mdr-res'), pause: q('.mdr-pause') };
      if (touch) bindTouch(el, q);
      return u;
    }
    function bindTouch(el, q) {
      // joystick
      var st = q('.mdr-stick'), knob = st.querySelector('i'), act = false;
      function mv(e) { var rc = st.getBoundingClientRect(), dx = e.clientX - (rc.left + rc.width / 2), dy = e.clientY - (rc.top + rc.height / 2), L = Math.hypot(dx, dy), Mx = rc.width / 2 - 8; if (L > Mx) { dx *= Mx / L; dy *= Mx / L; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; stickV.x = dx / Mx; stickV.y = -dy / Mx; }
      st.addEventListener('pointerdown', function (e) { act = true; try { st.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } mv(e); e.preventDefault(); });
      st.addEventListener('pointermove', function (e) { if (act) mv(e); });
      function end() { act = false; stickV.x = 0; stickV.y = 0; knob.style.transform = ''; } st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
      // regard : on glisse le doigt sur la moitié droite de l'écran
      var lk = q('.mdr-look'), lp = null;
      lk.addEventListener('pointerdown', function (e) { lp = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; try { lk.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } });
      lk.addEventListener('pointermove', function (e) { if (!lp || e.pointerId !== lp.id) return; var dx = e.clientX - lp.x, dy = e.clientY - lp.y; lp.x = e.clientX; lp.y = e.clientY; lp.moved += Math.abs(dx) + Math.abs(dy); var s = 0.0058 * (world.sensi || (F.sensi ? F.sensi() : 1)); cam.yaw += dx * s; cam.pitch = Math.max(-1.0, Math.min(1.0, cam.pitch + dy * s * 0.8)); });
      lk.addEventListener('pointerup', function (e) { if (lp && lp.moved < 8 && !me.alive) nextSpectate(1); lp = null; }); lk.addEventListener('pointercancel', function () { lp = null; });
      // boutons
      Array.prototype.forEach.call(el.querySelectorAll('.mdr-b'), function (b) {
        var k = b.dataset.b; tBtn[k] = b;
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } ac();
          if (k === 'use') doUse(); else if (k === 'knife') doKnife(); else if (k === 'stab') doStab(); else if (k === 'throw') chargeStart(); else if (k === 'shoot') doShoot(); else if (k === 'reload') doReload(); else if (k === 'next') nextSpectate(1); });
        b.addEventListener('pointerup', function () { if (k === 'throw') chargeRelease(); }); b.addEventListener('pointercancel', function () { if (k === 'throw') chargeRelease(); });
      });
    }
    function showResults(m) {
      if (!ui) return; var good = (m.win === 'i') === (me.role !== 'm');
      var h = '<h3>' + (m.win === 'i' ? '🙂 Les innocents gagnent !' : '🔪 Le meurtrier gagne !') + '</h3><p>' + esc(m.reason || '') + '</p><table>';
      m.roles.forEach(function (r) { h += '<tr class="' + (r.k === myKey ? 'me' : '') + '"><td><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + CSS[r.ci % 6] + '"></i> ' + esc(r.n) + '</td><td>' + (r.r === 'm' ? '🔪 Meurtrier' : r.r === 'p' ? '🔫 Policier' : '🙂 Innocent') + '</td><td>' + (r.al ? '❤ en vie' : '☠ mort') + '</td></tr>'; });
      ui.res.innerHTML = h + '</table>'; ui.res.classList.add('on'); SND.win(good);
    }
    function refreshHud() {
      if (!ui) return;
      if (!me.ready) { ui.top.textContent = '…'; ui.phase.textContent = netErr || 'Connexion au serveur…'; return; }
      var ph = curPh, tl = snap ? snap.tl : 0, n = snap ? snap.pl.length : 1, alive = snap ? snap.al : 0;
      ui.top.textContent = ph === 'lobby' ? (n < CFG.min ? '—' : fmt(tl)) : ph === 'play' ? fmt(tl) : ph === 'intro' ? '🎭' : '';
      ui.phase.textContent = ph === 'lobby' ? (n < CFG.min ? 'En attente de joueurs (' + n + '/' + CFG.max + ', minimum ' + CFG.min + ')' : 'La partie commence dans ' + Math.ceil(tl) + ' s · ' + n + ' joueurs') : ph === 'intro' ? 'Découvre ton rôle…' : ph === 'play' ? '👥 ' + alive + ' en vie' : 'FIN DE MANCHE';
      // rôle
      var r = me.role; ui.role.style.display = r && ph !== 'lobby' && ph !== 'results' && me.alive ? 'block' : 'none'; if (r) { ui.role.textContent = r === 'm' ? '🔪 Meurtrier' : r === 'p' ? '🔫 Policier' : '🙂 Innocent'; ui.role.style.background = r === 'm' ? 'rgba(200,40,40,.85)' : r === 'p' ? 'rgba(40,110,220,.85)' : 'rgba(40,150,80,.85)'; }
      // liste des joueurs
      var rows = [{ k: myKey, n: myName(), ci: me.ci, al: me.alive }]; Object.keys(remotes).forEach(function (k) { rows.push({ k: k, n: remotes[k].name, ci: remotes[k].ci, al: remotes[k].al }); });
      ui.list.innerHTML = rows.map(function (x) { return '<div class="' + (x.al ? '' : 'dead') + '"><i style="background:' + CSS[x.ci % 6] + '"></i>' + esc(x.n) + (x.k === myKey ? ' (toi)' : '') + '</div>'; }).join('');
      ui.list.style.display = (ph === 'lobby' || keys.Tab) ? '' : 'none';
      // barre d'action
      var a = '', s = '', bar = false;
      if (!me.alive && ph !== 'lobby') { ui.actBox.style.display = 'none'; }
      else {
        ui.actBox.style.display = '';
        if (ph === 'lobby') { a = '🏠 Salon d\'attente'; s = 'Promène-toi dans la maison. ' + CFG.min + ' joueurs minimum, ' + CFG.max + ' maximum.'; }
        else if (me.role === 'm') {
          if (me.ks === 'hand') { a = me.ko ? '🔪 Couteau sorti' : '🔪 Couteau rangé'; s = touch ? 'Frapper de près · Lancer : maintiens le bouton (barre de force)' : '1 : sortir / ranger · clic : frapper · clic droit maintenu : lancer'; }
          else if (me.ks === 'air') { a = '🔪 Couteau lancé…'; s = ''; } else { a = '🔪 Couteau au sol !'; s = 'Marche dessus pour le ramasser'; }
          if (charging) { bar = true; ui.barI.style.width = Math.round(Math.min(1, (performance.now() / 1000 - chargeT0) / CFG.chargeMax) * 100) + '%'; }
        } else if (me.hg) { a = me.rl > 0 ? '🔫 Rechargement… ' + me.rl.toFixed(1) + ' s' : me.am > 0 ? '🔫 Revolver chargé (1 balle)' : '🔫 Revolver vide'; s = me.rl > 0 ? '' : me.am > 0 ? (touch ? 'Bouton « Tirer »' : 'Clic : tirer') : (touch ? 'Bouton « Recharger »' : 'R : recharger'); }
        else if (me.role === 'p') { a = me.gb > 0 ? '🚫 Arme perdue : ' + Math.ceil(me.gb) + ' s' : '🔫 Tu as perdu ton revolver'; s = me.gb > 0 ? 'Tu pourras le reprendre ensuite' : 'Ramasse-le au sol'; }
        else if (snap && snap.gn) { a = '🔫 Un revolver est au sol'; s = 'Ramasse-le (sauf si tu es le meurtrier)'; }
        else { a = '🙂 Survis !'; s = 'Ouvre les portes, cache-toi, observe'; }
        ui.act.textContent = a; ui.actS.textContent = s; ui.bar.style.display = bar ? 'block' : 'none';
      }
      ui.cross.className = 'mdr-cross' + (me.hg && me.alive ? ' gun' : '');
      // spectateur
      var spec = !me.alive && ph !== 'lobby', sn = spectate && remotes[spectate] ? remotes[spectate].name : '';
      ui.spec.style.display = spec ? 'block' : 'none'; if (spec) ui.spec.innerHTML = '👁 ' + (sn ? esc(sn) : 'Personne à suivre') + '<small>' + (touch ? 'Touche l\'écran ou « Suivant » pour changer' : 'Clic ou A / D pour changer de joueur') + '</small>';
      // boutons tactiles
      if (touch) {
        var m = me.role === 'm' && me.alive && ph === 'play', p = me.hg && me.alive && ph === 'play';
        tBtn.use.classList.toggle('on', me.alive && ph !== 'results'); tBtn.use.classList.toggle('hot', doorHint >= 0);
        tBtn.knife.classList.toggle('on', m && me.ks === 'hand'); tBtn.knife.innerHTML = me.ko ? '🔪<br>Ranger' : '🔪<br>Sortir'; tBtn.stab.classList.toggle('on', m && me.ks === 'hand'); tBtn.throw.classList.toggle('on', m && me.ks === 'hand'); tBtn.throw.classList.toggle('hot', charging);
        tBtn.shoot.classList.toggle('on', p); tBtn.reload.classList.toggle('on', p && me.am <= 0 && me.rl <= 0); tBtn.next.classList.toggle('on', spec);
        tBtn.use.style.display = tBtn.use.classList.contains('on') ? 'flex' : 'none';
      }
      // résultats / pause
      ui.pause.classList.toggle('on', paused && !touch && me.ready); ui.pause.querySelector('small').style.display = netErr ? 'none' : '';
      if (netErr) ui.pause.querySelector('.b').textContent = netErr; else ui.pause.querySelector('.b').textContent = '🔪 MURDER';
    }

    /* ---------- commandes ---------- */
    function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
    function codes() { var k = F.keys(); return { f: [k.f, 'ArrowUp'], b: [k.b, 'ArrowDown'], l: [k.l, 'ArrowLeft'], r: [k.r, 'ArrowRight'], run: [k.run, 'ShiftLeft', 'ShiftRight'] }; }
    var MY_KEYS = { Digit1: 1, Numpad1: 1, KeyE: 1, KeyF: 1, KeyR: 1, KeyG: 1, Tab: 1, KeyA: 0, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1 };
    function isMine(code) { if (MY_KEYS[code]) return true; var c = codes(), a; for (a in c) if (c[a].indexOf(code) >= 0) return true; return false; }
    function onKey(e) {
      if (!active || world.mode !== 'seat' || typing() || !isMine(e.code)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if (e.repeat && keys[e.code]) return; keys[e.code] = true;
        if (e.code === 'KeyE' || e.code === 'KeyF') doUse();
        else if (e.code === 'Digit1' || e.code === 'Numpad1') doKnife();
        else if (e.code === 'KeyR') doReload();
        else if (e.code === 'KeyG') chargeStart();
        else if (!me.alive && (e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === codes().r[0])) nextSpectate(1);
        else if (!me.alive && (e.code === 'ArrowLeft' || e.code === 'ArrowDown' || e.code === codes().l[0])) nextSpectate(-1);
      } else { keys[e.code] = false; if (e.code === 'KeyG') chargeRelease(); }
    }
    function down(list) { for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true; return false; }
    function readInput() {
      var c = codes(), f = (down(c.f) ? 1 : 0) - (down(c.b) ? 1 : 0), s = (down(c.r) ? 1 : 0) - (down(c.l) ? 1 : 0), run = down(c.run);
      if (touch) { f += stickV.y; s += stickV.x; if (Math.hypot(stickV.x, stickV.y) > 0.92) run = true; }
      return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)), run: run, yaw: cam.yaw, pitch: 0 };
    }
    function lock() { try { var l = world.dom.requestPointerLock(); if (l && l.catch) l.catch(function () { /* refusé */ }); } catch (e) { /* ok */ } paused = false; ac(); }
    function onMouseMove(e) { if (!active || document.pointerLockElement !== world.dom) return; var sens = 0.0022 * (world.sensi || (F.sensi ? F.sensi() : 1)); cam.yaw += e.movementX * sens; cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch - e.movementY * sens)); }
    function onMouseDown(e) {
      if (!active) return;
      if (document.pointerLockElement !== world.dom) { if (e.button === 0) { e.preventDefault(); lock(); } return; }
      e.preventDefault(); if (e.button === 0) primary(); else if (e.button === 2) chargeStart();
    }
    function onMouseUp(e) { if (e.button === 2) chargeRelease(); }
    function onCtx(e) { if (active) e.preventDefault(); }
    function onLockChange() { if (!active) return; paused = document.pointerLockElement !== world.dom; if (paused) { keys = {}; chargeRelease(); } }

    /* ---------- la vue (caméra) ---------- */
    room.seatPos = function () { return null; };
    room.hint = function () { return 'Murder : clic pour jouer · ZQSD · souris · Échap : libérer la souris'; };
    room.spawn = function () { return { x: 0, z: 0, yaw: 0 }; };
    room.seatPose = function () {
      var x = me.c.x, z = me.c.z, yaw = cam.yaw, pitch = cam.pitch;
      if (!me.alive && curPh !== 'lobby') { var t = remotes[spectate]; if (!t || !t.al) { nextSpectate(1); t = remotes[spectate]; } if (t) { x = t.x; z = t.z; yaw = t.yaw; pitch = 0.05; } }
      var ey = MS.EYE + Math.sin(bob * 9) * 0.014 * Math.min(1, Math.hypot(me.c.vx, me.c.vz) / 4), cp = Math.cos(pitch);
      return { cx: x, cy: ey, cz: z, tx: x + Math.sin(yaw) * cp * 5, ty: ey - Math.sin(pitch) * 5, tz: z - Math.cos(yaw) * cp * 5, fov: 72 };
    };

    /* ---------- entrée / sortie ---------- */
    room.onEnter = function (w) {
      active = true; keys = {}; me.ready = false; me.rc = -1; me.role = ''; me.alive = true; snap = null; curPh = ''; pending = []; seq = 0; inpAcc = 0; netErr = ''; spectate = ''; charging = false; stickV.x = stickV.y = 0; everOpen = false; failCount = 0; kAir = null; knifeState = null;
      oldFog = world.scene.fog; oldBg = world.scene.background; oldEnv = world.scene.environment;
      ui = buildUi(); paused = !touch;
      if (!house) { house = buildHouse(!!world.low); g.add(house.group); }
      house.group.visible = true;
      world.scene.fog = new THREE.FogExp2(0x0e1424, 0.014); world.scene.background = new THREE.Color(0x0e1424); world.scene.environment = null;
      if (world.renderer && world.renderer.setClearColor) world.renderer.setClearColor(0x0e1424);
      window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
      world.dom.addEventListener('mousedown', onMouseDown, true); window.addEventListener('mouseup', onMouseUp, true); document.addEventListener('mousemove', onMouseMove); world.dom.addEventListener('contextmenu', onCtx); document.addEventListener('pointerlockchange', onLockChange);
      ensureVm();
      myKey = F.me(); w.sitDown(room);
      if (!F.token()) { netErr = 'Connecte-toi pour jouer.'; setTimeout(function () { if (active) world.goRoom('minijeux', 'murder'); }, 2500); return; }
      pickRoom(function (r) { if (!active) return; roomName = r; connect(); });
    };
    function cleanup() {
      if (!active) return; active = false; keys = {}; charging = false;
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
      world.dom.removeEventListener('mousedown', onMouseDown, true); window.removeEventListener('mouseup', onMouseUp, true); document.removeEventListener('mousemove', onMouseMove); world.dom.removeEventListener('contextmenu', onCtx); document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === world.dom) { try { document.exitPointerLock(); } catch (e) { /* ok */ } }
      if (ws) { var old = ws; ws = null; wsOk = false; try { old.close(); } catch (e) { /* ok */ } }
      Object.keys(remotes).forEach(dropRemote);
      if (knifeVis) { g.remove(knifeVis); knifeVis = null; } if (gunVis) { g.remove(gunVis); gunVis = null; }
      if (origRender) { world.renderer.render = origRender; origRender = null; }
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      world.scene.fog = oldFog; world.scene.background = oldBg; world.scene.environment = oldEnv;
    }
    room.forceStand = function () { cleanup(); world.standUp(0, 0, 0); };
    room.onLeave = function () { cleanup(); };
    room.onPageHide = function () { cleanup(); };

    /* ---------- la boucle ---------- */
    function glowMark(col) { var m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m; }
    room.update = function (dt) {
      if (!active) return;
      if (reconnectT > 0) { reconnectT -= dt; if (reconnectT <= 0 && active && (!ws || ws.readyState > 1)) connect(); }
      var c = me.c;
      if (me.ready) {
        var inp = readInput(); if (paused || frozen()) { inp.f = 0; inp.s = 0; }
        inpAcc += dt; var nsend = 0;
        while (inpAcc >= 1 / 30 && nsend++ < 3) { inpAcc -= 1 / 30; seq++; pending.push({ seq: seq, inp: inp }); if (pending.length > 150) pending.shift(); wsSend({ t: 'in', seq: seq, f: +inp.f.toFixed(3), s: +inp.s.toFixed(3), run: inp.run ? 1 : 0, yaw: +inp.yaw.toFixed(4), pitch: 0 }); }
        if (inpAcc > 0.2) inpAcc = 0;
        if (frozen()) { c.vx = 0; c.vz = 0; c.yaw = inp.yaw; }
        else { var left = Math.min(dt, 0.1), sub; while (left > 1e-5) { sub = Math.min(left, 1 / 90); MS.stepPlayer(c, inp, sub, open); left -= sub; } }
      }
      var spd = Math.hypot(c.vx, c.vz); bob += dt * Math.min(1.5, spd / 4);
      // le lancer s'arrête tout seul si le couteau n'est plus en main
      if (charging && !(me.role === 'm' && me.ks === 'hand' && me.alive && curPh === 'play')) charging = false;
      // les portes
      if (house) house.doors.forEach(function (d, i) { d.tgt = open[i] ? d.sgn * Math.PI / 2 * 0.98 : 0; d.ang += (d.tgt - d.ang) * Math.min(1, dt * 9); d.pivot.rotation.y = d.axis === 'x' ? d.ang : -d.ang; });
      // les autres joueurs
      var kk = 1 - Math.exp(-dt * 12), nowP = performance.now();
      Object.keys(remotes).forEach(function (k) {
        var r = remotes[k], age = Math.min(0.25, (nowP - r.recv) / 1000), px = r.tx + r.vx * age, pz = r.tz + r.vz * age, rs = Math.hypot(r.vx, r.vz), ud = r.body.userData;
        r.x += (px - r.x) * kk; r.z += (pz - r.z) * kk; r.yaw += angDiff(r.ta, r.yaw) * kk;
        r.grp.position.set(r.x, 0, r.z); r.grp.rotation.y = Math.PI - r.yaw;
        if (!r.al) { r.fall = Math.min(1, r.fall + dt * 3); r.body.rotation.x = -r.fall * Math.PI / 2; r.body.position.y = r.fall * 0.14; r.body.position.z = -0.4 * r.fall; r.tag.visible = false; ud.knife.visible = false; ud.gun.visible = false; return; }
        r.body.rotation.x = 0; r.body.position.y = 0; r.body.position.z = 0;
        r.walk += dt * rs * 1.7; var sw = Math.sin(r.walk * 3) * 0.7 * Math.min(1, rs / 3); ud.legs[0].rotation.x = sw; ud.legs[1].rotation.x = -sw; ud.arms[0].rotation.x = -sw * 0.8;
        r.swing = Math.max(0, r.swing - dt);
        var armUp = r.ko || r.hg || r.swing > 0; ud.arms[1].rotation.x = armUp ? -1.45 + (r.swing > 0 ? Math.sin(r.swing / 0.3 * Math.PI) * 0.9 : 0) : sw * 0.8;
        ud.knife.visible = !!r.ko && !r.hg; ud.gun.visible = !!r.hg;
        r.tag.visible = !(spectate === k && !me.alive); r.tag.position.set(r.x, 1.95, r.z);
      });
      // le couteau et l'arme par terre / en vol
      if (knifeState && (knifeState.st === 'floor' || knifeState.st === 'air')) {
        if (!knifeVis) { knifeVis = new THREE.Group(); var km = makeKnifeMesh(); km.scale.setScalar(1.6); knifeVis.add(km); knifeVis.userData.km = km; knifeVis.add(glowMark(0xff4040)); g.add(knifeVis); }
        knifeVis.visible = true; var km2 = knifeVis.userData.km;
        if (knifeState.st === 'air' && kAir) { kAir.x += Math.sin(kAir.a) * CFG.knifeSpeed * dt; kAir.z -= Math.cos(kAir.a) * CFG.knifeSpeed * dt; knifeVis.position.set(kAir.x, 1.2, kAir.z); km2.rotation.set(0, kAir.a, 0); km2.rotation.z += 0; km2.rotation.y = kAir.a; km2.rotation.x = 0; knifeVis.children[1].visible = false; }
        else { knifeVis.position.set(knifeState.x, 0.06, knifeState.z); km2.rotation.set(-Math.PI / 2 + 0.2, knifeState.a || 0, 0); knifeVis.children[1].visible = true; knifeVis.children[1].material.opacity = 0.5 + Math.sin(nowP / 220) * 0.25; }
      } else if (knifeVis) knifeVis.visible = false;
      if (snap && snap.gn) {
        if (!gunVis) { gunVis = new THREE.Group(); var gm = makeGunMesh(); gm.scale.setScalar(1.8); gm.rotation.set(-Math.PI / 2, 0, 0); gunVis.add(gm); gunVis.add(glowMark(0x4da6ff)); g.add(gunVis); }
        gunVis.visible = true; gunVis.position.set(snap.gn.x, 0.08, snap.gn.z); gunVis.children[1].material.opacity = 0.5 + Math.sin(nowP / 240) * 0.25;
      } else if (gunVis) gunVis.visible = false;
      tracers.forEach(function (t) { if (t.life <= 0) return; t.life -= dt; if (t.life <= 0) t.l.visible = false; else t.l.material.opacity = t.life / 0.12; });
      updateVm(dt);
      // la porte visée (indication)
      hudT -= dt; if (hudT <= 0) {
        hudT = 0.1; doorHint = me.alive && me.ready && curPh !== 'results' && curPh !== 'intro' ? MS.nearestDoor(c.x, c.z, cam.yaw) : -1;
        if (ui) { ui.hint.textContent = doorHint >= 0 ? (touch ? 'Bouton « Ouvrir » : ' : 'E : ') + (open[doorHint] ? 'fermer la porte' : 'ouvrir la porte') : ''; ui.hint.classList.toggle('on', doorHint >= 0); }
        refreshHud();
      }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && ui) ui.toast.classList.remove('in'); }
    };
    room._dbg = { me: me, remotes: remotes, cam: cam, keys: function () { return keys; }, snap: function () { return snap; }, net: function () { return { wsOk: wsOk, pending: pending.length, netErr: netErr, room: roomName, ph: curPh }; }, open: function () { return open; }, primary: primary, use: doUse, knife: doKnife, cs: chargeStart, cr: chargeRelease, setPaused: function (v) { paused = v; }, setCam: function (y, p) { cam.yaw = y; cam.pitch = p; }, key: function (c, v) { keys[c] = v; }, ev: onEvent, spectate: function () { return spectate; } };
    return room;
  }

  F.registerRoom('murder', createRoom);
})();
