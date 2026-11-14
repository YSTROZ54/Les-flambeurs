/* =====================================================================
   golf3d.js — Le MINI GOLF entre joueurs (façon « Golf With Your Friends »)
   ---------------------------------------------------------------------
   • « golf » : l'accueil (porte « MINI GOLF » du salon des mini jeux) : les 5 parcours avec les joueurs en direct, les parties privées
     (créer / rejoindre par code) et le classement des 10 joueurs qui ont gagné le plus de parties.
   • « golf_<carte> » : un parcours (prairie, automne, canyon, neige, ile, kraken, volcan), 20 trous du plus court au plus long (décor : golf-scene.js).
     Salle d'attente : l'hôte choisit les mods (bonus « ? », chocs entre balles, 10 ou 20 trous) et lance.
   • Tout le monde joue EN MÊME TEMPS : les balles se percutent (plus on arrive vite, plus l'autre part loin). Tombé à l'eau ou dans le vide :
     retour à l'endroit du dernier tir. Le moins de coups gagne. Gratuit, pour le fun.
   • Commandes — PC : clic gauche maintenu n'importe où, tire vers l'arrière (comme un lance-pierre) et relâche ; clic droit glissé ou ← → : tourner ;
     molette : zoom ; Espace : utiliser le bonus ; V : vue libre ; R : replacer ; Tab : scores.
     Téléphone : pose le doigt sur l'anneau autour de ta balle, tire vers l'arrière et lâche ; glisse ailleurs pour tourner ; pince pour zoomer.
   • Réseau : TOUT passe par le serveur (api/_doGolf.js, WebSocket /ws/golf) : le navigateur envoie « angle + puissance » ou « j'utilise mon pouvoir »,
     le serveur fait rouler toutes les balles et renvoie leurs positions 15 fois par seconde ; ici on ne fait que dessiner (avec 90 ms de retard pour que ce soit fluide).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU || Math.PI * 2;
  var GS = F.golfSim;
  if (!GS) return;
  var R = GS.R, MAXSHOTS = GS.MAXSHOTS, WAIT_S = GS.WAIT_S, MAPS = GS.MAPS, MAP_IDS = GS.MAP_IDS;
  var BALL_COLORS = ['#ff4d4d', '#ffd23f', '#3ddc84', '#3fa9ff', '#c86bff', '#ff8a3d', '#ff5fb4', '#4df0e0'];
  var POW = { jump: { e: '🦘', n: 'Saut', d: 'Fais sauter ta balle pendant qu\'elle roule' }, glue: { e: '🍯', n: 'Miel collant', d: 'Laisse une flaque derrière toi (10 s)' }, ice: { e: '❄️', n: 'Gel', d: 'Arrête net ta balle (évite de tomber)' } };
  F.golf = F.golf || {};

  /* ------------------------------------------------------------------ la balle : modèle « Golf Ball » (germydan, Sketchfab, CC BY 4.0) ------------------------------------------------------------------ */
  var BALL_GEO = null, BALL_NORMAL = null, ballWaiters = [], ballLoading = false;
  function loadBall() {
    if (ballLoading || !THREE.GLTFLoader) return; ballLoading = true;
    try {
      new THREE.GLTFLoader().load('assets/golf/golf_ball.glb?v=1', function (gl) {
        var mesh = null; gl.scene.updateMatrixWorld(true); gl.scene.traverse(function (o) { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) return;
        var geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();
        var c = new THREE.Vector3(), sz = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.boundingBox.getSize(sz);
        geo.translate(-c.x, -c.y, -c.z); var k = 2 * R / Math.max(sz.x, sz.y, sz.z); geo.scale(k, k, k); geo.computeBoundingSphere();
        BALL_GEO = geo; BALL_NORMAL = mesh.material && mesh.material.normalMap ? mesh.material.normalMap : null;
        var wl = ballWaiters; ballWaiters = []; wl.forEach(function (f) { try { f(); } catch (e) { /* ok */ } });
      }, undefined, function () { /* pas de modèle : la sphère reste */ });
    } catch (e) { /* idem */ }
  }

  /* ------------------------------------------------------------------ petits utilitaires ------------------------------------------------------------------ */
  function hashStr(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nameSprite(name, col) {
    var c = mkCanvas(256, 64), x = c.getContext('2d');
    x.fillStyle = 'rgba(8,6,14,0.72)'; F.roundRectPath(x, 4, 8, 248, 48, 22); x.fill();
    x.fillStyle = col; x.beginPath(); x.arc(32, 32, 12, 0, TAU); x.fill();
    x.fillStyle = '#fff'; x.font = '800 28px ' + SERIF; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(String(name).slice(0, 14), 54, 33, 190);
    var t = mkTex(c); t.encoding = THREE.sRGBEncoding;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); s.scale.set(0.7, 0.175, 1); s.renderOrder = 30; return s;
  }
  function relTxt(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }

  /* ------------------------------------------------------------------ sons (sans fichier, volume doux) ------------------------------------------------------------------ */
  var AC = null;
  function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
  function sfxVol() { try { var A = F.audio; return (A && typeof A.sfxVol === 'number' ? A.sfxVol : 0.7) * 0.8; } catch (e) { return 0.55; } }
  function tone(f0, f1, dur, type, vol, delay) {
    var a = ac(); if (!a || vol <= 0) return; var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sfxVol()), t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, type, delay, q) {
    var a = ac(); if (!a || vol <= 0) return; var t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = type || 'lowpass'; f.frequency.value = freq || 2000; if (q) f.Q.value = q; g.gain.value = vol * sfxVol();
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t0);
  }
  var SND = {
    // le « toc » du putter : petit claquement net, la tête qui résonne, un léger bruit sourd
    putt: function (p) { noise(0.03, 0.05 + p * 0.08, 3400, 'bandpass', 0, 1.2); tone(1320, 1040, 0.07, 'sine', 0.035 + p * 0.05); tone(230, 140, 0.11, 'triangle', 0.04 + p * 0.04); },
    wall: function (f) { var v = Math.min(0.05, 0.01 + f * 0.012); tone(430 + Math.random() * 60, 300, 0.05, 'triangle', v); noise(0.03, v * 0.7, 900, 'bandpass', 0, 2); },
    clack: function (f) { var v = Math.min(0.08, 0.02 + f * 0.014); tone(2650, 2450, 0.035, 'sine', v); tone(3800, 3600, 0.022, 'sine', v * 0.5); },
    bump: function () { tone(520, 980, 0.1, 'triangle', 0.045); },
    boom: function () { noise(0.35, 0.09, 220, 'lowpass'); tone(110, 45, 0.3, 'sine', 0.07); },
    cup: function () { [0, 0.06, 0.12].forEach(function (d) { tone(1900, 1700, 0.016, 'sine', 0.03, d); }); tone(300, 120, 0.16, 'sine', 0.06, 0.14); tone(880, 880, 0.18, 'sine', 0.03, 0.3); tone(1320, 1320, 0.22, 'sine', 0.025, 0.38); },
    ace: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.22, 'triangle', 0.05, i * 0.12); }); },
    splash: function () { noise(0.5, 0.07, 1400, 'lowpass'); [0.08, 0.17, 0.24].forEach(function (d) { tone(500 + Math.random() * 300, 900, 0.06, 'sine', 0.015, d); }); },
    fall: function () { tone(560, 160, 0.45, 'sine', 0.025); },
    dice: function () { tone(660, 660, 0.12, 'sine', 0.045); tone(990, 990, 0.16, 'sine', 0.04, 0.08); tone(1320, 1320, 0.2, 'sine', 0.03, 0.16); },
    glue: function () { noise(0.2, 0.06, 650, 'lowpass'); tone(170, 80, 0.2, 'sine', 0.045); },
    stick: function () { tone(230, 130, 0.14, 'triangle', 0.03); noise(0.1, 0.025, 500, 'lowpass'); },
    jump: function () { tone(280, 600, 0.18, 'sine', 0.045); },
    ice: function () { [2400, 3150, 3700].forEach(function (f, i) { tone(f, f * 0.98, 0.3, 'sine', 0.014, i * 0.04); }); noise(0.22, 0.02, 5000, 'highpass'); },
    loop: function () { noise(0.6, 0.03, 700, 'bandpass', 0, 0.8); },
    land: function () { noise(0.06, 0.03, 600, 'lowpass'); },
    ui: function () { tone(900, 900, 0.03, 'sine', 0.02); },
    start: function () { [392, 523, 659].forEach(function (f, i) { tone(f, f, 0.18, 'triangle', 0.04, i * 0.1); }); }
  };

  /* ------------------------------------------------------------------ interface (CSS) ------------------------------------------------------------------ */
  function injectCss() {
    if (document.getElementById('golf3d-css')) return;
    var s = document.createElement('style'); s.id = 'golf3d-css';
    s.textContent =
      '.gf-ui{position:absolute;inset:0;pointer-events:none;z-index:6;color:#fff;font-family:inherit}' +
      '.gf-box{background:rgba(10,14,18,.8);border:1px solid rgba(255,255,255,.16);border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +
      '.gf-info{position:absolute;left:14px;top:14px;padding:9px 14px;min-width:180px}.gf-info .c{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.75;text-transform:uppercase}.gf-info .h{font-size:20px;font-weight:900;margin-top:2px}.gf-info .h small{font-size:13px;opacity:.85;font-weight:800;margin-left:6px}.gf-info .s{font-size:15px;font-weight:800;margin-top:3px}.gf-info .t{margin-top:4px;font-size:13px;font-weight:900;color:#ffd23f}.gf-info .t:empty{display:none}' +
      '.gf-pl{position:absolute;left:14px;top:126px;display:flex;flex-direction:column;gap:4px}.gf-pl div{background:rgba(10,14,18,.7);border-radius:999px;padding:3px 12px 3px 8px;font-size:13px;font-weight:800;display:flex;align-items:center;gap:7px}.gf-pl i{width:12px;height:12px;border-radius:50%;display:inline-block}.gf-pl b{margin-left:auto;padding-left:10px;opacity:.95}' +
      '.gf-btns{position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:7px;pointer-events:auto}.gf-btn{padding:8px 13px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(10,14,18,.82);color:#fff;font-weight:800;font-size:13px;cursor:pointer;text-align:left;font-family:inherit}.gf-btn:hover{background:rgba(40,60,50,.92)}.gf-btn.on{background:#2f7d3a;border-color:#7dd88a}.gf-btn kbd{opacity:.6;font-size:11px;margin-left:5px;font-family:inherit}' +
      '.gf-pw{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:10px;pointer-events:auto}.gf-pw button{min-width:150px;padding:9px 14px;border-radius:14px;border:2px solid rgba(255,214,107,.7);background:rgba(25,18,6,.86);color:#fff;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px}.gf-pw button small{display:block;font-size:10px;font-weight:700;opacity:.8}.gf-pw button[disabled]{opacity:.45;cursor:default}.gf-pw button kbd{margin-left:auto;font-size:11px;opacity:.6;font-family:inherit}.gf-pw .e{font-size:22px}' +
      '.gf-toast{position:absolute;left:50%;top:21%;transform:translate(-50%,-50%) scale(.7);opacity:0;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1);text-align:center;font-weight:900;font-size:clamp(28px,5vw,54px);text-shadow:0 4px 0 rgba(0,0,0,.7),0 0 24px rgba(0,0,0,.55);white-space:nowrap}.gf-toast small{display:block;font-size:.4em;margin-top:4px;opacity:.95}.gf-toast.in{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
      '.gf-help{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);background:rgba(10,14,18,.6);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:700;white-space:nowrap;opacity:.92}' +
      '.gf-ring{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:3px dashed rgba(255,255,255,.65);display:none;align-items:flex-end;justify-content:center;font-size:11px;font-weight:900;letter-spacing:.08em;text-shadow:0 1px 3px #000}.gf-ring span{transform:translateY(18px)}' +
      '.gf-pow{position:absolute;left:50%;top:62%;transform:translateX(-50%);width:min(320px,60vw);height:14px;border-radius:7px;background:rgba(10,14,18,.75);border:2px solid rgba(255,255,255,.35);overflow:hidden;display:none}.gf-pow .f{height:100%;width:0;background:linear-gradient(90deg,#3ddc84,#ffd23f 55%,#ff4d4d)}' +
      '.gf-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 18px;pointer-events:auto;max-width:94vw;max-height:82vh;overflow:auto;display:none}.gf-card.on{display:block}.gf-card h3{margin:0 0 10px;text-align:center;font-size:20px}.gf-card table{border-collapse:collapse;font-size:13px;font-weight:800}.gf-card td,.gf-card th{padding:4px 6px;text-align:center;border-bottom:1px solid rgba(255,255,255,.1)}.gf-card td:first-child,.gf-card th:first-child{text-align:left;white-space:nowrap}.gf-card .par{opacity:.6}.gf-card .tot{color:#ffd23f}.gf-card .u{color:#3ddc84}.gf-card .o{color:#ff8a80}.gf-card .ft{text-align:center;margin-top:10px;font-size:13px;opacity:.85}' +
      '.gf-wait{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1040px,96vw);max-height:92vh;overflow:auto;pointer-events:auto;padding:18px;display:none}.gf-wait.on{display:block}' +
      '.gf-wait h2{margin:0;font-size:26px;font-weight:900}.gf-wait .sub{opacity:.8;font-size:13px;font-weight:700;margin-top:2px}.gf-wait .cols{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:14px;margin-top:14px}' +
      '.gf-wait .col{background:rgba(255,255,255,.05);border-radius:14px;padding:12px}.gf-wait .col h4{margin:0 0 8px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;opacity:.8}' +
      '.gf-wait .pl{display:flex;align-items:center;gap:8px;padding:5px 0;font-weight:800;font-size:14px}.gf-wait .pl i{width:12px;height:12px;border-radius:50%}' +
      '.gf-mod{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.04);margin-bottom:6px;font-size:13px;font-weight:700;cursor:pointer;user-select:none}.gf-mod.sub{margin-left:22px;padding:5px 9px;font-size:12px}.gf-mod .sw{margin-left:auto;width:38px;height:22px;border-radius:11px;background:#4a4f55;position:relative;flex:none;transition:background .2s}.gf-mod .sw:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}.gf-mod.on .sw{background:#3ddc84}.gf-mod.on .sw:after{left:19px}.gf-mod.ro{cursor:default}.gf-mod small{display:block;font-size:11px;opacity:.7;font-weight:600}' +
      '.gf-seg{display:flex;gap:6px;margin:6px 0 10px}.gf-seg button{flex:1;padding:7px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;font-weight:800;cursor:pointer;font-family:inherit}.gf-seg button.on{background:#2f7d3a;border-color:#7dd88a}.gf-seg button[disabled]{cursor:default}' +
      '.gf-go{width:100%;padding:13px;border-radius:14px;border:0;background:linear-gradient(180deg,#5fd36e,#2f9d4a);color:#fff;font-size:18px;font-weight:900;cursor:pointer;font-family:inherit;box-shadow:0 6px 0 #1c6a30;margin-top:6px}.gf-go[disabled]{background:#4a4f55;box-shadow:none;cursor:default}' +
      '.gf-top{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;font-weight:800}.gf-top b{width:26px;text-align:center}.gf-top span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gf-top em{font-style:normal;color:#ffd23f}' +
      '.gf-code{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:8px;background:rgba(255,214,107,.15);border:1px dashed #ffd36b;font-family:' + (MONO || 'monospace') + ';font-size:18px;font-weight:900;letter-spacing:.2em;color:#ffd36b;cursor:pointer}' +
      '.gf-maps{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.gf-maps button{padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#fff;font-weight:800;cursor:pointer;font-family:inherit;font-size:12px}.gf-maps button.on{background:#2f7d3a;border-color:#7dd88a}' +
      '.gf-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#244a32,#0b130e);pointer-events:auto;z-index:9}.gf-load b{font-size:26px;font-weight:900}.gf-load .bar{width:min(360px,70vw);height:10px;border-radius:5px;background:rgba(255,255,255,.12);margin-top:14px;overflow:hidden}.gf-load .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5fd36e,#ffd36b);transition:width .2s}.gf-load small{margin-top:10px;opacity:.75;font-weight:700}' +
      '.gf-menu{position:absolute;right:14px;top:14px;bottom:14px;width:min(420px,94vw);overflow:auto;pointer-events:auto;padding:14px}.gf-menu.off{display:none}.gf-menu h2{margin:0 0 4px;font-size:22px}.gf-mapc{display:flex;gap:10px;align-items:center;padding:10px;border-radius:14px;background:rgba(255,255,255,.05);margin-bottom:8px;border:1px solid rgba(255,255,255,.08)}.gf-mapc .em{font-size:30px;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center}.gf-mapc .tx{flex:1;min-width:0}.gf-mapc .tx b{display:block;font-size:15px}.gf-mapc .tx small{display:block;font-size:11px;opacity:.75;font-weight:600}.gf-mapc .tx em{font-style:normal;font-size:11px;font-weight:800;color:#7dd88a}.gf-mapc button,.gf-row button{padding:8px 12px;border-radius:10px;border:0;background:#2f9d4a;color:#fff;font-weight:900;cursor:pointer;font-family:inherit}' +
      '.gf-row{display:flex;gap:6px;margin-top:6px}.gf-row input,.gf-row select{flex:1;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-weight:800;font-family:inherit;text-transform:uppercase}.gf-tog{position:absolute;right:14px;top:14px;pointer-events:auto}' +
      '.gf-sec{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}.gf-sec h4{margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.8}.gf-err{color:#ff8a80;font-size:12px;font-weight:800;margin-top:4px;min-height:14px}' +
      '@media (max-width:820px){.gf-wait .cols{grid-template-columns:1fr}.gf-wait{padding:12px}}' +
      '@media (max-height:520px){.gf-info{padding:5px 10px;min-width:130px}.gf-info .h{font-size:15px}.gf-info .s{font-size:12px}.gf-pl{top:92px}.gf-pl div{font-size:11px;padding:2px 9px 2px 6px}.gf-btns{flex-direction:row;flex-wrap:wrap;justify-content:flex-end;max-width:52vw}.gf-btn{padding:6px 9px;font-size:11px}.gf-btn kbd{display:none}.gf-help{display:none}.gf-pw button{min-width:110px;padding:6px 10px;font-size:13px}.gf-pw button small{display:none}.gf-card{padding:10px}.gf-card table{font-size:11px}.gf-wait h2{font-size:20px}}';
    document.head.appendChild(s);
  }

  /* ==================================================================
     UN PARCOURS
     ================================================================== */
  function createCourse(world, mapId) {
    var MP = MAPS[mapId], low = world.low;
    var room = { title: MP.emoji + ' ' + MP.name.toUpperCase(), subtitle: 'MINI GOLF · ' + GS.buildCourse(mapId).holes.length + ' TROUS', topic: 'flambeurs-golf-' + mapId, group: new THREE.Group(), doors: [], interactables: [], colliders: [], hideSelf: true, noHand: true };
    var g = room.group, course = GS.buildCourse(mapId), HOLES = course.holes;
    var CX = (course.box[0] + course.box[2]) / 2, CZ = (course.box[1] + course.box[3]) / 2, SPAN = Math.max(course.box[2] - course.box[0], course.box[3] - course.box[1]);
    room.bounds = { xMin: course.box[0] - 6, xMax: course.box[2] + 6, zMin: course.box[1] - 6, zMax: course.box[3] + 6 };
    var SC = null, building = false, saved = null;

    /* ---------- l'état ---------- */
    var net = { ws: null, ok: false, err: '', reconnectT: 0, roomName: '', myKey: '', myId: 0, srvOff: 0, offInit: false };
    var st = { phase: 'lobby', host: '', opts: {}, game: null, players: [], byKey: {}, byId: {}, glue: [], dice: [], top: [], lobbyT: 0, rank: null, winners: [] };
    var balls = {}, active = false, ui = null, hudT = 0, toastT = 0, effects = [], diceMeshes = [], glueMeshes = [], curHi = -1;
    var cam = { yaw: 0, pitch: 0.4, dist: 3.4, tx: 0, ty: 0, tz: 0, init: false, free: false, f: { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.9, dist: 14 }, lobbyA: 0 };
    var aim = { drag: null, power: 0, yaw: 0, camDrag: null, pinch: null, pending: 0, touches: {} };
    var keys = {};
    function nowMs() { return Date.now() + net.srvOff; }
    function myName() { try { return String((typeof state !== 'undefined' && state && state.username) || '').slice(0, 20) || 'Invité'; } catch (e) { return 'Invité'; } }
    function me() { return st.byKey[net.myKey] || null; }
    function curHole() { if (!st.game) return HOLES[0]; return HOLES[st.game.list[Math.min(st.game.hi, st.game.list.length - 1)]]; }
    function holeIdx() { return st.game ? st.game.list[Math.min(st.game.hi, st.game.list.length - 1)] : 0; }

    /* ---------- les balles ---------- */
    var ballGeo = new THREE.SphereGeometry(R, 24, 16);
    function ballMat(col) { var m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffffff').lerp(new THREE.Color(col), col === '#ffffff' ? 0 : 0.35), roughness: 0.28, metalness: 0 }); if (BALL_NORMAL) { m.normalMap = BALL_NORMAL; m.normalScale = new THREE.Vector2(1.2, 1.2); } return m; }
    loadBall(); ballWaiters.push(function () { Object.keys(balls).forEach(function (k) { var b = balls[k]; b.mesh.geometry = BALL_GEO; if (BALL_NORMAL) { b.mesh.material.normalMap = BALL_NORMAL; b.mesh.material.normalScale = new THREE.Vector2(1.2, 1.2); b.mesh.material.needsUpdate = true; } }); });
    function ballFor(p) {
      var b = balls[p.id]; if (b) return b;
      var mine = p.k === net.myKey, col = mine ? '#ffffff' : BALL_COLORS[(p.c | 0) % BALL_COLORS.length];
      b = balls[p.id] = { id: p.id, k: p.k, mesh: new THREE.Mesh(BALL_GEO || ballGeo, ballMat(col)), tag: mine ? null : nameSprite(p.n, BALL_COLORS[(p.c | 0) % BALL_COLORS.length]), buf: [], x: 0, y: 0, z: 0, f: 0, sinkT: 0, shadow: null };
      b.mesh.castShadow = true; g.add(b.mesh); if (b.tag) g.add(b.tag);
      // petite ombre douce sous la balle (lisible même sans ombres, sur téléphone)
      var sc = mkCanvas(64, 64), sx = sc.getContext('2d'), gr = sx.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
      b.shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2), new THREE.MeshBasicMaterial({ map: mkTex(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); b.shadow.rotation.x = -Math.PI / 2; g.add(b.shadow);
      if (p.b) { b.x = p.b[0]; b.y = p.b[1]; b.z = p.b[2]; }
      return b;
    }
    function dropBall(id) { var b = balls[id]; if (!b) return; g.remove(b.mesh); if (b.tag) { g.remove(b.tag); b.tag.material.map.dispose(); } g.remove(b.shadow); delete balls[id]; }
    function pushSnap(id, t, x, y, z, f) {
      var b = balls[id]; if (!b) return;
      b.buf.push({ t: t, x: x, y: y, z: z, f: f }); if (b.buf.length > 14) b.buf.shift();
    }

    /* ---------- réseau ---------- */
    function wsSend(o) { if (net.ws && net.ws.readyState === 1) { try { net.ws.send(JSON.stringify(o)); } catch (e) { /* ok */ } } }
    function connect() {
      var tok = F.token();
      if (!tok) { net.err = 'Connecte-toi pour jouer.'; return; }
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/golf?room=' + encodeURIComponent(net.roomName) + '&map=' + mapId + '&token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(myName());
      var ws; try { ws = new WebSocket(url); } catch (e) { net.err = 'Serveur de golf indisponible.'; return; }
      net.ws = ws;
      ws.onopen = function () { if (net.ws !== ws) return; net.ok = true; net.err = ''; };
      ws.onmessage = function (ev) { if (net.ws !== ws) return; var m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { onNet(m); } catch (e2) { console.error('golf', e2); } };
      ws.onclose = function () { if (net.ws !== ws) return; net.ok = false; if (active) { net.err = 'Connexion au serveur…'; net.reconnectT = 1.5; } };
      ws.onerror = function () { /* onclose suit */ };
    }
    function syncClock(n) { var est = n - Date.now(); if (!net.offInit || est > net.srvOff) { net.srvOff = est; net.offInit = true; } else net.srvOff -= 0.2; }
    function applyState(m) {
      if (m.now) syncClock(m.now);
      if (m.phase) st.phase = m.phase; if (m.host !== undefined) st.host = m.host; if (m.opts) st.opts = m.opts; if (m.lobbyT !== undefined) st.lobbyT = m.lobbyT;
      if (m.game !== undefined) st.game = m.game;
      if (m.glue) setGlue(m.glue);
      if (m.dice) { st.dice = m.dice; syncDice(); }
      if (m.players) {
        st.players = m.players; st.byKey = {}; st.byId = {};
        m.players.forEach(function (p) {
          st.byKey[p.k] = p; st.byId[p.id] = p;
          var b = ballFor(p);
          if (p.b && !p.mv && (!b.buf.length || st.phase !== 'play')) { b.x = p.b[0]; b.y = p.b[1]; b.z = p.b[2]; }
        });
        Object.keys(balls).forEach(function (id) { if (!st.byId[id]) dropBall(id); });
      }
      if (m.map && m.map !== mapId) { switchMap(m.map); return false; }
      if (st.game && st.game.list && holeIdx() !== curHi && st.phase === 'play') onHoleStart(false);
      return true;
    }
    function switchMap(m) { F.golf.pending = { room: net.roomName, map: m }; world.goRoom('golf_' + m, 'golf'); }
    function onNet(m) {
      if (m.t === 'welcome') {
        net.myKey = m.you; net.myId = m.id; st.top = m.top || [];
        if (!applyState(m)) return;
        if (st.phase === 'play') onHoleStart(false);
        refreshAll();
      } else if (m.t === 'players') { applyState(m); refreshAll(); }
      else if (m.t === 'lobby') { if (!applyState(m)) return; st.rank = null; clearDice(); refreshAll(); }
      else if (m.t === 'hole') { if (!applyState(m)) return; onHoleStart(true); refreshAll(); }
      else if (m.t === 'done') { applyState(m); if (m.k === net.myKey) holeResult(m.score, m.how, m.par); refreshAll(); }
      else if (m.t === 'over') { applyState(m); st.rank = m.rank; st.winners = m.winners || []; clearDice(); SND.start(); refreshAll(); }
      else if (m.t === 'top') { st.top = m.top || []; refreshAll(); }
      else if (m.t === 'glue') { setGlue(m.glue); if (m.by) { SND.glue(); if (m.x !== undefined) puff(m.x, glueY(m.x, m.z), m.z, 0xd88a1a, 0.6); } }
      else if (m.t === 's') { syncClock(m.n); m.b.forEach(function (q) { pushSnap(q[0], m.n, q[1], q[2], q[3], q[4]); }); }
      else if (m.t === 'ev') onEv(m);
    }
    function near(x, z) { var b = balls[net.myId]; return !b || Math.hypot(b.x - x, b.z - z) < 25; }
    function onEv(m) {
      var b = m.id !== undefined ? balls[m.id] : null, mine = m.id === net.myId;
      if (m.e === 'shot') { if (b && (mine || near(b.x, b.z))) SND.putt(m.pw || 0.5); if (mine) { aim.pending = 0; } if (b) ring(b.x, b.y + 0.01, b.z, 0xffffff, 0.35); }
      else if (m.e === 'w') { if (b && (mine || near(b.x, b.z))) SND.wall(m.f); }
      else if (m.e === 'bb') { var a1 = balls[m.a]; if (mine || m.a === net.myId || m.b === net.myId || near(m.x, m.z)) SND.clack(m.f); ring(m.x, (a1 ? a1.y : 0) + R, m.z, 0xffffff, 0.25); }
      else if (m.e === 'bump') { if (b && (mine || near(b.x, b.z))) SND.bump(); }
      else if (m.e === 'glue') { if (mine) { SND.stick(); toast('🍯 Ça colle !', '', '#ffb347', 1.2); } }
      else if (m.e === 'loop') { if (mine || (b && near(b.x, b.z))) SND.loop(); }
      else if (m.e === 'land') { if (b && near(b.x, b.z)) SND.land(); }
      else if (m.e === 'lip') { if (b && (mine || near(b.x, b.z))) SND.bump(); if (mine) toast('Trop vite !', 'La balle ressort du trou', '#ffb347', 1.4); }
      else if (m.e === 'cannon' || m.e === 'portal') { if (b && (mine || near(b.x, b.z))) { if (m.e === 'cannon') SND.boom(); else SND.dice(); } if (b) puff(b.x, b.y + 0.2, b.z, m.e === 'cannon' ? 0xdddddd : 0xb48cff, 0.7); }
      else if (m.e === 'bounce' || m.e === 'boost') { if (b && (mine || near(b.x, b.z))) SND.bump(); if (b) ring(b.x, b.y + 0.01, b.z, m.e === 'boost' ? 0xffc23d : 0x9fd0ff, 0.4); }
      else if (m.e === 'water' || m.e === 'out') {
        if (b) { b.buf.length = 0; b.cut = true; }
        if (m.e === 'water') { splash(m.x, GS.WATER_Y, m.z); if (mine || near(m.x, m.z)) SND.splash(); } else { puff(m.x, Math.max(m.y, GS.GROUND), m.z, 0xd8c8a8, 0.8); if (mine || near(m.x, m.z)) SND.fall(); }
        if (mine) toast(m.e === 'water' ? '💦 Plouf !' : '😵 Hors piste !', 'Retour au dernier tir', '#7fc8ff', 1.8);
      }
      else if (m.e === 'cup') { if (b) b.sinkT = 0.001; if (mine || (b && near(b.x, b.z))) SND.cup(); }
      else if (m.e === 'dice') { var dm = diceMeshes.filter(function (q) { return q.userData.i === m.i; })[0]; if (dm) puff(dm.position.x, dm.position.y, dm.position.z, 0xffe9a8, 0.5); st.dice = st.dice.filter(function (q) { return q.i !== m.i; }); syncDice(); if (mine) { SND.dice(); toast(POW[m.p].e + ' ' + POW[m.p].n + ' !', POW[m.p].d + ' · Espace', '#ffd36b', 2.2); } }
      else if (m.e === 'pow') {
        if (m.p === 'jump') { SND.jump(); ring(m.x, m.y + 0.01, m.z, 0xffffff, 0.5); }
        else if (m.p === 'ice') { SND.ice(); iceCube(m.x, m.y, m.z); }
      }
      else if (m.e === 'reset') { if (b) { b.buf.length = 0; b.cut = true; } if (mine) toast('↺ Replacé', '+1 coup', '#ffb02e', 1.4); }
    }
    function onHoleStart(announce) {
      curHi = holeIdx(); var H = curHole();
      cam.yaw = H.teeYaw; cam.pitch = 0.42; cam.dist = 3.4; cam.init = false; aim.drag = null;
      Object.keys(balls).forEach(function (id) { balls[id].buf.length = 0; balls[id].sinkT = 0; balls[id].cut = true; });
      buildDice(); showCard(false);
      if (announce) { toast('⛳ Trou ' + (st.game.hi + 1) + ' / ' + st.game.list.length, H.name + ' · Par ' + H.par, '#ffffff', 2.4); SND.start(); }
      if (SC) SC.holes.forEach(function (o, i) { o.group.visible = true; });
    }
    function holeResult(score, how, par) {
      var diff = score - par, label;
      if (how === 'max') label = ['Coups max', score + ' coups', '#ff8a80'];
      else if (how === 'time') label = ['⏱ Temps écoulé', score + ' coups', '#ff8a80'];
      else if (score === 1) { label = ['TROU EN UN !', '🎉 Incroyable !', '#ffd23f']; SND.ace(); }
      else label = diff <= -3 ? ['ALBATROS !', '🦅 ' + score + ' coups', '#ffd23f'] : diff === -2 ? ['EAGLE !', '🦅 ' + score + ' coups', '#ffd23f'] : diff === -1 ? ['BIRDIE !', '🐦 ' + score + ' coups', '#3ddc84'] : diff === 0 ? ['PAR', '👍 ' + score + ' coups', '#ffffff'] : diff === 1 ? ['BOGEY', score + ' coups', '#ffb02e'] : diff === 2 ? ['DOUBLE BOGEY', score + ' coups', '#ff8a80'] : ['+' + diff, score + ' coups', '#ff8a80'];
      toast(label[0], label[1], label[2], 2.6);
    }

    /* ---------- dés, flaques, effets ---------- */
    // le bonus : un carré doré avec un point d'interrogation sur chaque face (plusieurs sur la piste, un de plus toutes les 10 s)
    var qMat = null;
    function bonusMat() {
      if (qMat) return qMat;
      var c = mkCanvas(128, 128), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(1, '#e9a526'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = '#b8761a'; x.lineWidth = 10; x.strokeRect(5, 5, 118, 118); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 3; x.strokeRect(14, 14, 100, 100);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 92px ' + SERIF; x.fillStyle = 'rgba(90,50,5,0.45)'; x.fillText('?', 67, 71); x.fillStyle = '#fffaf0'; x.fillText('?', 64, 67);
      var t = mkTex(c); t.encoding = THREE.sRGBEncoding; qMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.15 }); return qMat;
    }
    var bonusGeo = null;
    function clearDice() { diceMeshes.forEach(function (d) { g.remove(d); g.remove(d.userData.ring); }); diceMeshes = []; }
    function syncDice() {
      var want = st.phase === 'play' && st.opts.dice ? st.dice : [], have = {};
      diceMeshes = diceMeshes.filter(function (m) { var keep = want.some(function (d) { return d.i === m.userData.i; }); if (!keep) { g.remove(m); g.remove(m.userData.ring); } else have[m.userData.i] = 1; return keep; });
      bonusGeo = bonusGeo || new THREE.BoxGeometry(0.17, 0.17, 0.17);
      want.forEach(function (d) {
        if (have[d.i]) return;
        var m = new THREE.Mesh(bonusGeo, bonusMat()); m.position.set(d.x, d.h + 0.24, d.z); m.castShadow = true; g.add(m);
        var rg = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.21, 32), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.7, depthWrite: false })); rg.rotation.x = -Math.PI / 2; rg.position.set(d.x, d.h + 0.006, d.z); g.add(rg);
        m.userData = { ring: rg, i: d.i, h: d.h }; diceMeshes.push(m);
      });
    }
    function buildDice() { clearDice(); syncDice(); }
    function glueY(x, z) { var H = curHole(), fl = GS.floorAt(H, x, z, 99); return fl ? fl.h : 0; }
    var glueGeo = null, glueMat = null;
    function setGlue(list) {
      st.glue = list || [];
      glueMeshes.forEach(function (m) { g.remove(m); }); glueMeshes = [];
      if (!glueGeo) {
        var sh = new THREE.Shape(); for (var k = 0; k <= 40; k++) { var a = k / 40 * TAU, rr = 1 + Math.sin(a * 5) * 0.07 + Math.sin(a * 3 + 1) * 0.06; if (!k) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        glueGeo = new THREE.ShapeGeometry(sh, 6); glueGeo.rotateX(-Math.PI / 2);
        glueMat = new THREE.MeshStandardMaterial({ color: 0xd98a1c, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.88, envMapIntensity: 1.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      }
      st.glue.forEach(function (q) {
        var m = new THREE.Mesh(glueGeo, glueMat.clone()); m.position.set(q.x, q.h + 0.004, q.z); m.scale.setScalar(q.r); m.userData = q; g.add(m); glueMeshes.push(m);
        for (var k = 0; k < 4; k++) { var bub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, TAU, 0, Math.PI / 2), m.material); bub.position.set((Math.random() - 0.5) * 1.1, 0, (Math.random() - 0.5) * 1.1); bub.scale.set(1, 0.5, 1); m.add(bub); }
      });
    }
    var ringGeo = new THREE.RingGeometry(0.8, 1, 40);
    function ring(x, y, z, col, size) { var m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.01, z); g.add(m); effects.push({ m: m, t: 0, d: 0.45, k: 'ring', s: size }); }
    var puffTex = null;
    function puff(x, y, z, col, size) {
      if (!puffTex) { var c = mkCanvas(64, 64), xx = c.getContext('2d'), gr = xx.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); xx.fillStyle = gr; xx.fillRect(0, 0, 64, 64); puffTex = mkTex(c); }
      for (var k = 0; k < 7; k++) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: col, transparent: true, depthWrite: false, opacity: 0.8 })); s.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, z + (Math.random() - 0.5) * 0.2); s.scale.setScalar(size * 0.4); g.add(s); effects.push({ m: s, t: 0, d: 0.7 + Math.random() * 0.4, k: 'puff', s: size, vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8 }); }
    }
    function splash(x, y, z) {
      ring(x, y, z, 0xffffff, 0.6); ring(x, y, z, 0xcfefff, 1.0);
      for (var k = 0; k < 14; k++) { var s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe6f7ff, transparent: true })); s.position.set(x, y + 0.05, z); g.add(s); var a = Math.random() * TAU, v = 0.8 + Math.random() * 1.4; effects.push({ m: s, t: 0, d: 0.9, k: 'drop', vx: Math.cos(a) * v * 0.6, vy: 2 + Math.random() * 1.6, vz: Math.sin(a) * v * 0.6, y0: y }); }
    }
    function iceCube(x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: 0xc8ecff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6, envMapIntensity: 2 }));
      m.position.set(x, y + R, z); m.rotation.y = Math.random(); g.add(m); effects.push({ m: m, t: 0, d: 1.1, k: 'ice' });
    }
    function stepEffects(dt) {
      effects = effects.filter(function (e) {
        e.t += dt; var k = e.t / e.d;
        if (k >= 1) { g.remove(e.m); if (e.m.material) e.m.material.dispose(); if (e.m.geometry && e.k !== 'ring') e.m.geometry.dispose(); return false; }
        if (e.k === 'ring') { var s = e.s * (0.3 + k); e.m.scale.set(s, s, s); e.m.material.opacity = 0.8 * (1 - k); }
        else if (e.k === 'puff') { e.m.position.x += e.vx * dt; e.m.position.y += e.vy * dt; e.m.position.z += e.vz * dt; e.m.scale.setScalar(e.s * (0.4 + k * 0.8)); e.m.material.opacity = 0.8 * (1 - k); }
        else if (e.k === 'drop') { e.vy -= 9.8 * dt; e.m.position.x += e.vx * dt; e.m.position.y = Math.max(e.y0, e.m.position.y + e.vy * dt); e.m.position.z += e.vz * dt; e.m.material.opacity = 1 - k; }
        else if (e.k === 'ice') { e.m.material.opacity = 0.6 * (1 - k * k); e.m.scale.setScalar(1 + k * 0.15); }
        return true;
      });
    }

    /* ---------- interface ---------- */
    function buildUi() {
      injectCss();
      var el = document.createElement('div'); el.className = 'gf-ui';
      el.innerHTML = '<div class="gf-info gf-box"><div class="c"></div><div class="h"></div><div class="s"></div><div class="t"></div></div><div class="gf-pl"></div>' +
        '<div class="gf-btns"><button class="gf-btn" data-a="free">👁 Vue libre<kbd>V</kbd></button><button class="gf-btn" data-a="card">📋 Scores<kbd>Tab</kbd></button><button class="gf-btn" data-a="reset">↺ Replacer<kbd>R</kbd></button><button class="gf-btn" data-a="quit">🚪 Quitter</button></div>' +
        '<div class="gf-pw"></div><div class="gf-ring"><span>TIRE</span></div><div class="gf-pow"><div class="f"></div></div><div class="gf-toast"></div><div class="gf-help"></div>' +
        '<div class="gf-card gf-box"></div><div class="gf-wait gf-box"></div><div class="gf-load"><b>' + MP.emoji + ' ' + esc(MP.name) + '</b><div class="bar"><i></i></div><small>Chargement du parcours…</small></div>';
      world.container.appendChild(el);
      el.querySelector('.gf-btns').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var a = b.dataset.a; SND.ui();
        if (a === 'free') toggleFree(); else if (a === 'card') showCard(!ui.card.classList.contains('on')); else if (a === 'reset') doReset(); else if (a === 'quit') quit();
      });
      el.querySelector('.gf-pw').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) usePower(b.dataset.p); });
      el.querySelector('.gf-wait').addEventListener('click', onWaitClick);
      el.querySelector('.gf-card').addEventListener('click', function () { if (st.phase === 'play') showCard(false); });
      return { el: el, info: el.querySelector('.gf-info'), pl: el.querySelector('.gf-pl'), pw: el.querySelector('.gf-pw'), ring: el.querySelector('.gf-ring'), pow: el.querySelector('.gf-pow'), powF: el.querySelector('.gf-pow .f'), toast: el.querySelector('.gf-toast'), help: el.querySelector('.gf-help'), card: el.querySelector('.gf-card'), wait: el.querySelector('.gf-wait'), load: el.querySelector('.gf-load'), btns: el.querySelector('.gf-btns'), freeBtn: el.querySelector('[data-a=free]') };
    }
    function quit() { world.goRoom('golf', 'golf_' + mapId); }
    function toast(t, sub, col, dur) {
      if (!ui) return; var e = ui.toast; e.style.color = col || '#fff'; e.innerHTML = esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : ''); e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); toastT = dur || 2.4;
    }
    function scoreOf(p) {
      var t = 0, par = 0; if (!st.game) return { t: 0, rel: 0 };
      st.game.list.forEach(function (hi, k) { var v = (p.card || [])[k]; if (v == null) return; t += v; par += HOLES[hi].par; });
      return { t: t, rel: t - par };
    }
    function refreshAll() { refreshHud(); refreshWait(); if (ui && ui.card.classList.contains('on')) showCard(true); }
    function setDisp(el, v) { if (el.style.display !== v) el.style.display = v; }
    function setTxt(el, t) { t = t == null ? '' : String(t); if (el._t !== t) { el._t = t; el.textContent = t; } }
    function setHtml(el, h) { if (el._h !== h) { el._h = h; el.innerHTML = h; } }
    function refreshHud() {
      if (!ui) return;
      var H = curHole(), q = ui.info, P = me(), play = st.phase === 'play' && st.game;
      setDisp(ui.info, play ? '' : 'none'); setDisp(ui.pl, play ? '' : 'none'); setDisp(ui.btns, SC ? '' : 'none');
      setDisp(ui.btns.querySelector('[data-a=reset]'), play ? '' : 'none'); setDisp(ui.btns.querySelector('[data-a=card]'), st.game ? '' : 'none');
      if (ui.freeBtn.classList.contains('on') !== !!cam.free) ui.freeBtn.classList.toggle('on', cam.free);
      if (play) {
        setTxt(q.querySelector('.c'), MP.emoji + ' ' + MP.name);
        setHtml(q.querySelector('.h'), 'Trou ' + (st.game.hi + 1) + '/' + st.game.list.length + '<small>Par ' + H.par + '</small>');
        setTxt(q.querySelector('.s'), !P ? '' : P.d ? '✅ Fini · ' + (P.card[st.game.hi]) + ' coup' + (P.card[st.game.hi] > 1 ? 's' : '') : 'Coups : ' + P.s + ' / ' + MAXSHOTS);
        var snow = nowMs(), wt = st.game.firstDone && P && !P.d ? Math.max(0, WAIT_S - (snow - st.game.firstDone) / 1000) : -1;
        setTxt(q.querySelector('.t'), P && P.d ? '⏳ On attend les autres…' : wt >= 0 ? '⏱ ' + Math.ceil(wt) + ' s pour finir' : net.err);
        var rows = st.players.slice().sort(function (a, b) { return scoreOf(a).t - scoreOf(b).t; });
        setHtml(ui.pl, rows.map(function (p) { var sc = scoreOf(p), col = BALL_COLORS[(p.c | 0) % BALL_COLORS.length]; return '<div><i style="background:' + col + '"></i>' + esc(p.n) + (p.k === net.myKey ? ' (toi)' : '') + '<b>' + (p.d ? '⛳ ' : p.s + ' · ') + relTxt(sc.rel) + '</b></div>'; }).join(''));
      }
      // pouvoirs
      var pw = P && play ? P.pw || [] : [], html = '';
      pw.forEach(function (k, i) { var P2 = POW[k]; html += '<button data-p="' + k + '"' + (canUse(k) ? '' : ' disabled') + '><span class="e">' + P2.e + '</span><span>' + P2.n + '<small>' + P2.d + '</small></span><kbd>' + (world.touch ? '' : 'Espace') + '</kbd></button>'; });
      setHtml(ui.pw, html);
      setTxt(ui.help, !play ? '' : cam.free ? (world.touch ? 'Un doigt : tourner · deux doigts : déplacer et zoomer' : 'Clic gauche : tourner · clic droit : déplacer · molette : zoom · ZQSD : avancer · V : revenir à la balle') : (world.touch ? 'Pose le doigt sur l\'anneau, tire et lâche · glisse ailleurs pour tourner' : 'Clic gauche maintenu, tire la souris et relâche · clic droit / ← → : tourner · molette : zoom · Espace : bonus'));
    }
    function canUse(k) {
      var P = me(); if (!P || st.phase !== 'play' || P.d || P.sk) return false;
      if (k === 'jump' || k === 'ice') return !!P.mv;
      return true;
    }
    function usePower(k) {
      if (!canUse(k)) return; SND.ui();
      wsSend({ t: 'use', p: k, yaw: +cam.yaw.toFixed(4) });
    }
    function showCard(on) {
      if (!ui) return;
      ui.card.classList.toggle('on', !!on && !!st.game); if (!on || !st.game) return;
      var list = st.game.list, rows = st.players.slice();
      var html = '<h3>📋 ' + esc(MP.name) + '</h3><table><tr><th></th>' + list.map(function (hi, k) { return '<th>' + (k + 1) + '</th>'; }).join('') + '<th>Total</th></tr><tr class="par"><td>Par</td>' + list.map(function (hi) { return '<td>' + HOLES[hi].par + '</td>'; }).join('') + '<td>' + list.reduce(function (a, hi) { return a + HOLES[hi].par; }, 0) + '</td></tr>';
      rows.forEach(function (p) {
        var sc = scoreOf(p);
        html += '<tr><td><span style="color:' + BALL_COLORS[(p.c | 0) % BALL_COLORS.length] + '">●</span> ' + esc(p.n) + '</td>' + list.map(function (hi, k) { var v = (p.card || [])[k], par = HOLES[hi].par; return '<td class="' + (v == null ? '' : v < par ? 'u' : v > par ? 'o' : '') + '">' + (v == null ? '—' : v) + '</td>'; }).join('') + '<td class="tot">' + sc.t + ' (' + relTxt(sc.rel) + ')</td></tr>';
      });
      html += '</table><div class="ft">' + (world.touch ? 'Touche pour fermer' : 'Tab pour fermer') + '</div>';
      ui.card.innerHTML = html;
    }
    // la salle d'attente (avant la partie) et le classement de fin
    var waitHtml = '';
    function refreshWait() {
      if (!ui) return;
      var on = SC && (st.phase === 'lobby' || st.phase === 'over') && !cam.free;
      ui.wait.classList.toggle('on', !!on); if (!on) { waitHtml = ''; return; }
      var host = st.host === net.myKey, O = st.opts || {}, priv = net.roomName.indexOf('priv-') === 0, h = '';
      if (st.phase === 'over' && st.rank) {
        var over = Math.max(0, Math.ceil(((st.game && st.game.overAt) || 0) - nowMs()) / 1000);
        h += '<h2>🏆 Classement — ' + esc(MP.name) + '</h2><div class="sub">Retour à la salle d\'attente dans ' + Math.ceil(over) + ' s</div><div class="cols"><div class="col" style="grid-column:span 2"><h4>Résultats</h4>';
        st.rank.forEach(function (r, i) { var p = st.byKey[r.k]; h += '<div class="pl"><b style="width:28px">' + (['🥇', '🥈', '🥉'][i] || (i + 1) + '.') + '</b><i style="background:' + (p ? BALL_COLORS[(p.c | 0) % 8] : '#888') + '"></i>' + esc(r.n) + (st.winners.indexOf(r.k) >= 0 ? ' 👑' : '') + '<span style="margin-left:auto;color:#ffd23f">' + r.t + ' coups</span></div>'; });
        h += '</div>' + topHtml() + '</div>';
      } else {
        h += '<h2>' + MP.emoji + ' ' + esc(MP.name) + '</h2><div class="sub">' + esc(MP.sub) + ' · ' + (HOLES.length) + ' trous, une aventure de pirates' + (priv ? '' : ' · salle publique') + '</div>';
        if (priv) h += '<div class="gf-code" data-a="copy" title="Copier le code">CODE : ' + esc(net.roomName.slice(5)) + '</div> <small style="opacity:.75;font-weight:700">Donne ce code à tes amis</small>';
        h += '<div class="cols"><div class="col"><h4>Joueurs (' + st.players.length + ')</h4>' + st.players.map(function (p) { return '<div class="pl"><i style="background:' + BALL_COLORS[(p.c | 0) % 8] + '"></i>' + esc(p.n) + (p.k === st.host ? ' 👑' : '') + (p.k === net.myKey ? ' <small style="opacity:.6">(toi)</small>' : '') + '</div>'; }).join('') + '</div>';
        h += '<div class="col"><h4>Mods de la partie' + (host ? '' : ' (choisis par l\'hôte 👑)') + '</h4>';
        if (priv && host) h += '<div class="gf-maps">' + MAP_IDS.map(function (m) { return '<button data-map="' + m + '" class="' + (m === mapId ? 'on' : '') + '">' + MAPS[m].emoji + ' ' + esc(MAPS[m].name) + '</button>'; }).join('') + '</div>';
        h += '<div class="gf-seg">' + (HOLES.length > 10 ? [10, 20] : []).map(function (n) { return '<button data-holes="' + n + '" class="' + ((O.holes || 20) === n ? 'on' : '') + '"' + (host ? '' : ' disabled') + '>' + n + ' trous</button>'; }).join('') + '</div>';
        h += mod('dice', '❓ Bonus sur la piste', 'Des carrés « ? » (un de plus toutes les 10 s) : un seul bonus à la fois, Espace pour l\'utiliser');
        if (O.dice) ['jump', 'glue', 'ice'].forEach(function (k) { h += mod(k, POW[k].e + ' ' + POW[k].n, POW[k].d, true); });
        h += mod('collide', '💥 Chocs entre balles', 'Fonce dans les autres : plus tu vas vite, plus elles partent loin');
        h += '<button class="gf-go" data-a="start"' + (host ? '' : ' disabled') + '>' + (host ? '⛳ LANCER LA PARTIE' : 'En attente de l\'hôte…') + '</button>';
        if (st.lobbyT && !priv) h += '<div class="sub" style="text-align:center;margin-top:8px">Départ automatique dans ' + Math.max(0, Math.ceil((st.lobbyT - nowMs()) / 1000)) + ' s</div>';
        h += '</div>' + topHtml() + '</div>';
        h += '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="gf-btn" data-a="quit">🚪 Retour à l\'accueil du golf</button></div>';
      }
      if (h !== waitHtml) { waitHtml = h; ui.wait.innerHTML = h; }
      function mod(k, t, d, sub) { return '<div class="gf-mod' + (O[k] ? ' on' : '') + (sub ? ' sub' : '') + (host ? '' : ' ro') + '" data-mod="' + k + '"><span>' + t + '<small>' + d + '</small></span><span class="sw"></span></div>'; }
    }
    function topHtml() {
      var h = '<div class="col"><h4>🏆 Top 10 · parties gagnées</h4>';
      if (!st.top.length) h += '<div class="sub">Personne pour l\'instant : gagne une partie à 2 joueurs ou plus pour entrer dans le classement !</div>';
      st.top.forEach(function (r, i) { h += '<div class="gf-top"><b>' + (['🥇', '🥈', '🥉'][i] || i + 1) + '</b><span>' + esc(r.n) + '</span><em>' + r.w + ' 🏆</em></div>'; });
      return h + '</div>';
    }
    function onWaitClick(e) {
      var t = e.target.closest('[data-mod],[data-holes],[data-a],[data-map]'); if (!t) return;
      var host = st.host === net.myKey;
      if (t.dataset.a === 'quit') { quit(); return; }
      if (t.dataset.a === 'copy') { try { navigator.clipboard.writeText(net.roomName.slice(5)); toast('Code copié', '', '#ffd36b', 1.2); } catch (er) { /* ok */ } return; }
      if (!host) return; SND.ui();
      if (t.dataset.a === 'start') { wsSend({ t: 'start' }); return; }
      var o = {};
      if (t.dataset.mod) o[t.dataset.mod] = !st.opts[t.dataset.mod];
      if (t.dataset.holes) o.holes = +t.dataset.holes;
      if (t.dataset.map) o.map = t.dataset.map;
      wsSend({ t: 'opts', o: o });
    }
    function canShoot() { var P = me(); return active && SC && st.phase === 'play' && P && !P.mv && !P.sk && !P.d && !(aim.pending && performance.now() < aim.pending) && world.blend > 0.95 && !cam.free; }
    function shoot(power, yaw) {
      if (!canShoot() || power < 0.04) return;
      aim.pending = performance.now() + 1200;
      wsSend({ t: 'shot', yaw: +yaw.toFixed(4), power: +Math.min(1, power).toFixed(3) });
    }
    function doReset() { var P = me(); if (P && !P.mv && st.phase === 'play') wsSend({ t: 'reset' }); }
    function toggleFree() {
      cam.free = !cam.free;
      if (cam.free) { var H = curHole(), sz = Math.max(H.box[2] - H.box[0], H.box[3] - H.box[1]); cam.f.tx = (H.box[0] + H.box[2]) / 2; cam.f.tz = (H.box[1] + H.box[3]) / 2; cam.f.ty = 0; cam.f.dist = Math.max(8, sz * 1.0); cam.f.pitch = 0.85; cam.f.yaw = cam.yaw; if (st.phase !== 'play') { cam.f.tx = CX; cam.f.tz = CZ; cam.f.dist = SPAN * 0.7; } }
      aim.drag = null; refreshAll();
    }

    /* ---------- commandes ---------- */
    var V3 = new THREE.Vector3();
    function ballScreen() { var b = balls[net.myId]; if (!b) return null; V3.set(b.x, b.y + R, b.z).project(world.camera); var r = world.dom.getBoundingClientRect(); return { x: r.left + (V3.x + 1) / 2 * r.width, y: r.top + (1 - V3.y) / 2 * r.height, ok: V3.z < 1 }; }
    function pick(e) {
      if (!SC) return null;
      var r = world.dom.getBoundingClientRect(), v = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster();
      rc.setFromCamera(v, world.camera);
      var hs = SC.holes[holeIdx()], meshes = []; hs.group.traverse(function (o) { if (o.isMesh && o.userData.floor) meshes.push(o); });
      var hit = rc.intersectObjects(meshes, false)[0]; return hit ? hit.point : null;
    }
    function onDown(e) {
      if (!active || world.mode !== 'seat') return;
      if (e.pointerType === 'mouse' && (aim.drag || aim.camDrag)) return;                 // un 2e bouton pendant un geste : on l'ignore
      aim.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { world.dom.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
      var nT = Object.keys(aim.touches).length;
      if (e.pointerType === 'touch' && nT === 2) {                      // deux doigts : zoom (+ déplacement en vue libre)
        aim.drag = null; aim.camDrag = null; var ps = Object.keys(aim.touches).map(function (k) { return aim.touches[k]; });
        aim.pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), dist: cam.free ? cam.f.dist : cam.dist, cx: (ps[0].x + ps[1].x) / 2, cy: (ps[0].y + ps[1].y) / 2, tx: cam.f.tx, tz: cam.f.tz };
        return;
      }
      if (cam.free) { aim.camDrag = { x: e.clientX, y: e.clientY, yaw: cam.f.yaw, pitch: cam.f.pitch, pan: e.button === 2 || e.button === 1, tx: cam.f.tx, tz: cam.f.tz }; return; }
      var bs = ballScreen(), nearBall = bs && Math.hypot(e.clientX - bs.x, e.clientY - bs.y) < Math.max(70, Math.min(world.w, world.h) * 0.16);
      if (canShoot() && ((e.pointerType === 'mouse' && e.button === 0) || (e.pointerType !== 'mouse' && nearBall))) { aim.drag = { x: e.clientX, y: e.clientY }; aim.power = 0; aim.base = cam.yaw; aim.yaw = cam.yaw; }
      else aim.camDrag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
    }
    function onMove(e) {
      if (e.pointerType === 'mouse' && e.buttons === 0 && (aim.drag || aim.camDrag)) { aim.drag = aim.camDrag = null; aim.power = 0; return; }   // bouton relâché hors de la fenêtre : on annule
      if (aim.touches[e.pointerId]) aim.touches[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (aim.pinch) {
        var ps = Object.keys(aim.touches).map(function (k) { return aim.touches[k]; }); if (ps.length < 2) return;
        var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), k = aim.pinch.d / Math.max(20, d);
        if (cam.free) { cam.f.dist = Math.max(2, Math.min(160, aim.pinch.dist * k)); var mx = (ps[0].x + ps[1].x) / 2 - aim.pinch.cx, my = (ps[0].y + ps[1].y) / 2 - aim.pinch.cy, sp = cam.f.dist * 0.0022; cam.f.tx = aim.pinch.tx - (Math.cos(cam.f.yaw) * mx - Math.sin(cam.f.yaw) * my) * sp; cam.f.tz = aim.pinch.tz - (Math.sin(cam.f.yaw) * mx + Math.cos(cam.f.yaw) * my) * sp; }
        else cam.dist = Math.max(1.4, Math.min(12, aim.pinch.dist * k));
        return;
      }
      if (aim.drag) {
        var dx = e.clientX - aim.drag.x, dy = e.clientY - aim.drag.y, len = Math.hypot(dx, dy);
        aim.power = Math.max(0, Math.min(1, (len - 6) / (Math.min(world.w, world.h) * 0.32)));
        aim.yaw = aim.base + (len > 10 ? Math.atan2(dx, dy) : 0);   // la direction ne dépend que de la souris : ZQSD ne bougent que la caméra
      } else if (aim.camDrag) {
        var c = aim.camDrag, ddx = e.clientX - c.x, ddy = e.clientY - c.y;
        if (cam.free) {
          if (c.pan) { var s2 = cam.f.dist * 0.0022; cam.f.tx = c.tx - (Math.cos(cam.f.yaw) * ddx - Math.sin(cam.f.yaw) * ddy) * s2; cam.f.tz = c.tz - (Math.sin(cam.f.yaw) * ddx + Math.cos(cam.f.yaw) * ddy) * s2; }
          else { cam.f.yaw = c.yaw + ddx * 0.006; cam.f.pitch = Math.max(0.08, Math.min(1.45, c.pitch + ddy * 0.004)); }
        } else { cam.yaw = c.yaw + ddx * 0.006; cam.pitch = Math.max(0.1, Math.min(1.3, c.pitch + ddy * 0.004)); }
      }
    }
    function onUp(e) {
      delete aim.touches[e.pointerId];
      if (aim.pinch && Object.keys(aim.touches).length < 2) { aim.pinch = null; return; }
      if (aim.drag) { var p = aim.power, y = aim.yaw; aim.drag = null; aim.power = 0; if (p >= 0.04) shoot(p, y); }
      aim.camDrag = null;
    }
    function onWheel(e) { if (!active) return; var k = e.deltaY > 0 ? 1.12 : 0.89; if (cam.free) cam.f.dist = Math.max(2, Math.min(160, cam.f.dist * k)); else cam.dist = Math.max(1.4, Math.min(12, cam.dist * k)); e.preventDefault(); }
    function releaseAll() { aim.drag = aim.camDrag = aim.pinch = null; aim.power = 0; aim.touches = {}; keys = {}; }
    function onCtx(e) { if (active) e.preventDefault(); }
    var GAME_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1, KeyQ: 1, KeyE: 1, KeyZ: 1, Space: 1, KeyR: 1, KeyV: 1, Tab: 1, Escape: 1 };
    function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
    function onKey(e) {
      if (!active || world.mode !== 'seat' || typing() || !GAME_KEYS[e.code]) return;
      if (e.code === 'Escape') { if (cam.free) { toggleFree(); e.preventDefault(); e.stopImmediatePropagation(); refreshHud(); } return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if (e.repeat && keys[e.code]) return;
        keys[e.code] = true;
        if (e.code === 'Space') { var P0 = me(), k0 = P0 && P0.pw ? P0.pw[0] : null; if (k0) usePower(k0); }
        else if (e.code === 'KeyR') doReset(); else if (e.code === 'KeyV') toggleFree(); else if (e.code === 'Tab') showCard(!ui.card.classList.contains('on'));
      } else keys[e.code] = false;
    }
    function bind(on) {
      var f = on ? 'addEventListener' : 'removeEventListener', d = world.dom;
      d[f]('pointerdown', onDown); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp);
      d[f]('wheel', onWheel, { passive: false }); d[f]('contextmenu', onCtx);
      window[f]('blur', releaseAll); window[f]('keydown', onKey, true); window[f]('keyup', onKey, true);
    }

    // la ligne de visée : une flèche au sol qui s'allonge et rougit avec la puissance
    var aimG = new THREE.Group(); aimG.visible = false; g.add(aimG);
    var aimMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    var aimDots = []; for (var i0 = 0; i0 < 14; i0++) { var dot = new THREE.Mesh(new THREE.CircleGeometry(0.026, 10), aimMat); dot.rotation.x = -Math.PI / 2; aimG.add(dot); aimDots.push(dot); }
    var aimHeadShape = new THREE.Shape(); aimHeadShape.moveTo(0, 0.12); aimHeadShape.lineTo(-0.08, -0.02); aimHeadShape.lineTo(0.08, -0.02); aimHeadShape.closePath();
    var aimHead = new THREE.Mesh(new THREE.ShapeGeometry(aimHeadShape), aimMat); aimHead.rotation.x = -Math.PI / 2; aimG.add(aimHead);
    var ghost = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.42, 40), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, depthWrite: false })); ghost.rotation.x = -Math.PI / 2; ghost.visible = false; g.add(ghost);

    /* ---------- rendu : réglages de la carte graphique pendant le golf ---------- */
    function applyRender(on) {
      var r = world.renderer, sc = world.scene, c = world.camera;
      if (on) {
        if (!saved) saved = { tm: r.toneMapping, te: r.toneMappingExposure, oe: r.outputEncoding, sm: r.shadowMap.enabled, st: r.shadowMap.type, bg: sc.background, env: sc.environment, fog: sc.fog, far: c.far, near: c.near };
        r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = SC ? SC.theme.expo : 1; r.outputEncoding = THREE.sRGBEncoding;
        r.shadowMap.enabled = !low; r.shadowMap.type = THREE.PCFSoftShadowMap;
        if (SC) { sc.background = SC.hdr || new THREE.Color(0x9fc6e8); sc.environment = SC.env || null; sc.fog = new THREE.Fog(SC.fogCol, low ? 45 : 70, low ? 260 : 420); if (SC.water) SC.water.uniforms.uSky.value.copy(SC.fogCol).lerp(SC.zenith || SC.fogCol, 0.65).multiplyScalar(0.8); if (SC.water && SC.sun) SC.water.uniforms.uSun.value.copy(SC.sun); }
        c.far = 950; c.near = 0.05; c.updateProjectionMatrix();
      } else if (saved) {
        r.toneMapping = saved.tm; r.toneMappingExposure = saved.te; r.outputEncoding = saved.oe; r.shadowMap.enabled = saved.sm; r.shadowMap.type = saved.st;
        sc.background = saved.bg; sc.environment = saved.env; sc.fog = saved.fog; c.far = saved.far; c.near = saved.near; c.updateProjectionMatrix(); saved = null;
      }
    }
    function ensureScene() {
      if (SC || building) return;
      building = true;
      F.golfScene.build(world, mapId, function (p) { if (ui) ui.load.querySelector('.bar i').style.width = Math.round(p * 100) + '%'; }, function (sc) {
        building = false; SC = sc; g.add(sc.group);
        if (active) { applyRender(true); if (ui) ui.load.style.display = 'none'; refreshAll(); }
      });
    }

    /* ---------- entrée / sortie ---------- */
    room.spawn = function () { var H = HOLES[0]; return { x: H.tee[0], z: H.tee[1] + 3, yaw: H.teeYaw }; };
    room.onEnter = function (w) {
      active = true; ui = buildUi(); bind(true);
      if (F.isStaff && !F.isStaff()) { w.flash('⛳ Golf en test', 'Réservé au Patron, au Co Fondateur et au Staff'); setTimeout(function () { world.goRoom('golf', 'golf_' + mapId); }, 300); return; }
      var pend = F.golf.pending; net.roomName = pend && pend.map === mapId ? pend.room : 'pub-' + mapId; F.golf.pending = null;
      net.myKey = F.me ? F.me() : ''; net.err = ''; net.offInit = false; st.phase = 'lobby'; st.game = null; st.rank = null; curHi = -1; cam.free = false; cam.lobbyA = 0;
      if (SC) { applyRender(true); ui.load.style.display = 'none'; } else { applyRender(true); ensureScene(); }
      connect(); refreshAll();
      w.sitDown(room);
      if (!F.token()) setTimeout(function () { if (active) world.goRoom('golf', 'golf_' + mapId); }, 2500);
    };
    function cleanup() {
      if (!active) return;
      active = false; bind(false); keys = {}; aim.drag = aim.camDrag = aim.pinch = null; aim.touches = {};
      if (net.ws) { var old = net.ws; net.ws = null; net.ok = false; try { old.close(); } catch (e) { /* ok */ } }
      Object.keys(balls).forEach(dropBall); clearDice(); setGlue([]);
      effects.forEach(function (e) { g.remove(e.m); }); effects = [];
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      applyRender(false); aimG.visible = false; ghost.visible = false;
    }
    room.forceStand = function () { var H = curHole(); cleanup(); world.standUp(H.tee[0], H.tee[1] + 2, H.teeYaw); };
    room.onLeave = function () { cleanup(); };
    room.onPageHide = function () { cleanup(); };
    room.seatPos = function () { return null; };
    room.hint = function (w) { return w.touch ? 'Pose le doigt sur l\'anneau, tire vers l\'arrière et lâche · 👁 vue libre pour voir la piste' : 'Clic gauche maintenu, tire vers l\'arrière, relâche · clic droit : tourner · V : vue libre · Tab : scores'; };

    /* ---------- la caméra ---------- */
    var focus = new THREE.Vector3();
    room.seatPose = function (dt) {
      var fov = world.w / Math.max(1, world.h) < 0.9 ? 70 : 60, out;
      if (cam.free) {
        var f = cam.f, cp = Math.cos(f.pitch);
        out = { cx: f.tx - Math.sin(f.yaw) * cp * f.dist, cy: f.ty + Math.sin(f.pitch) * f.dist + 0.5, cz: f.tz + Math.cos(f.yaw) * cp * f.dist, tx: f.tx, ty: f.ty, tz: f.tz, fov: fov };
        focus.set(f.tx, f.ty, f.tz);
      } else if (st.phase !== 'play' || !balls[net.myId]) {                    // salle d'attente : la caméra survole doucement le parcours
        cam.lobbyA += dt * 0.05; var rr = SPAN * 0.55;
        out = { cx: CX + Math.cos(cam.lobbyA) * rr, cy: 22 + SPAN * 0.12, cz: CZ + Math.sin(cam.lobbyA) * rr, tx: CX, ty: 0, tz: CZ, fov: fov };
        focus.set(CX + Math.cos(cam.lobbyA) * rr * 0.4, 0, CZ + Math.sin(cam.lobbyA) * rr * 0.4);
      } else {
        var b = balls[net.myId], P = me(), H = curHole(), bx = b.x, by = b.y, bz = b.z;
        if (P && P.d) { bx = H.cup[0]; by = H.cupH; bz = H.cup[1]; }
        if (!cam.init) { cam.tx = bx; cam.ty = by; cam.tz = bz; cam.init = true; }
        var k = 1 - Math.exp(-dt * 7);
        cam.tx += (bx - cam.tx) * k; cam.ty += (by - cam.ty) * k; cam.tz += (bz - cam.tz) * k;
        var cp2 = Math.cos(cam.pitch), d = cam.dist;
        var cx = cam.tx - Math.sin(cam.yaw) * cp2 * d, cz = cam.tz + Math.cos(cam.yaw) * cp2 * d, cy = cam.ty + 0.12 + Math.sin(cam.pitch) * d;
        if (SC && SC.terrain) cy = Math.max(cy, SC.terrain.height(cx, cz) + 0.35);
        out = { cx: cx, cy: cy, cz: cz, tx: cam.tx + Math.sin(cam.yaw) * 0.6, ty: cam.ty + 0.1, tz: cam.tz - Math.cos(cam.yaw) * 0.6, fov: fov };
        focus.set(cam.tx, cam.ty, cam.tz);
      }
      return out;
    };

    /* ---------- la boucle ---------- */
    var Q1 = new THREE.Quaternion(), AX = new THREE.Vector3();
    room.update = function (dt) {
      if (!active) return;
      var tS = nowMs() / 1000;
      if (SC) SC.update(dt, tS, focus, world.camera.position);
      if (net.reconnectT > 0) { net.reconnectT -= dt; if (net.reconnectT <= 0 && active && (!net.ws || net.ws.readyState > 1)) connect(); }
      // touches : tourner, jauge à l'Espace, déplacement en vue libre
      var turn = (keys.ArrowLeft || keys.KeyA || keys.KeyQ ? -1 : 0) + (keys.ArrowRight || keys.KeyD || keys.KeyE ? 1 : 0);
      var fwd = (keys.ArrowUp || keys.KeyW || keys.KeyZ ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
      if (cam.free) {
        var sp = cam.f.dist * 0.9 * dt; cam.f.tx += (Math.sin(cam.f.yaw) * fwd + Math.cos(cam.f.yaw) * turn) * sp; cam.f.tz += (-Math.cos(cam.f.yaw) * fwd + Math.sin(cam.f.yaw) * turn) * sp;
      } else {
        if (turn) cam.yaw += turn * dt * 1.5;
        if (fwd) cam.pitch = Math.max(0.1, Math.min(1.3, cam.pitch + fwd * dt * 0.9));
      }
      // les balles : on rejoue les positions du serveur avec 90 ms de retard (toujours entre deux positions connues : c'est fluide)
      var rt = nowMs() - 90, H = curHole();
      Object.keys(balls).forEach(function (id) {
        var b = balls[id], p = st.byId[id], buf = b.buf, ox = b.x, oz = b.z;
        if (buf.length) {
          while (buf.length > 2 && buf[1].t <= rt) buf.shift();
          var A = buf[0], B2 = buf[1];
          if (!B2 || rt <= A.t) { b.x = A.x; b.y = A.y; b.z = A.z; b.f = A.f; }
          else { var k = Math.max(0, Math.min(1, (rt - A.t) / Math.max(1, B2.t - A.t))); if (Math.hypot(B2.x - A.x, B2.z - A.z) > 1.2) k = k > 0.5 ? 1 : 0; b.x = A.x + (B2.x - A.x) * k; b.y = A.y + (B2.y - A.y) * k; b.z = A.z + (B2.z - A.z) * k; b.f = k > 0.5 ? B2.f : A.f; }
        }
        var vis = !!SC && st.phase === 'play' && p && !(p.d && !(b.f & 2) && !b.sinkT);
        var sunk = (b.f & 2) || (p && p.sk);
        if (sunk) { b.sinkT = (b.sinkT || 0) + dt; b.x += (H.cup[0] - b.x) * Math.min(1, dt * 10); b.z += (H.cup[1] - b.z) * Math.min(1, dt * 10); if (b.sinkT > 0.45) vis = false; }
        else b.sinkT = 0;
        var sy = sunk ? -Math.min(0.2, b.sinkT * 0.5) : 0;
        b.mesh.visible = vis; b.mesh.position.set(b.x, b.y + R + sy, b.z);
        // la balle roule (rotation selon le chemin parcouru)
        var mx = b.x - ox, mz = b.z - oz, md = Math.hypot(mx, mz);
        if (md > 1e-4 && md < 1) { AX.set(mz, 0, -mx).normalize(); Q1.setFromAxisAngle(AX, md / R); b.mesh.quaternion.premultiply(Q1); }
        if (b.tag) { b.tag.visible = vis && camDist(b) < 22; b.tag.position.set(b.x, b.y + 0.42, b.z); }
        b.shadow.visible = vis && !(b.f & 4); if (vis) { var fl = GS.floorAt(H, b.x, b.z, b.y + 0.05); b.shadow.position.set(b.x, (fl ? fl.h : b.y) + 0.003, b.z); var hh = Math.max(0, b.y - (fl ? fl.h : b.y)); b.shadow.material.opacity = Math.max(0.15, 1 - hh * 1.5); }
      });
      // dés et flaques
      var now = nowMs();
      if (diceMeshes.length && st.phase === 'play' && diceMeshes.some(function (m) { return !st.dice.some(function (d) { return d.i === m.userData.i; }); })) syncDice();
      diceMeshes.forEach(function (m) { m.rotation.y = tS * 1.4 + m.userData.i; m.rotation.x = Math.sin(tS * 0.9 + m.userData.i) * 0.4; m.position.y = m.userData.h + 0.24 + Math.sin(tS * 2.2 + m.userData.i) * 0.04; });
      glueMeshes.forEach(function (m) { var q = m.userData, left = (q.until - now) / 1000, s = q.r * (left < 1.5 ? Math.max(0.05, left / 1.5) : 1) * (1 + Math.sin(tS * 3 + q.x) * 0.02); m.scale.set(s, 1, s); m.material.opacity = 0.88 * Math.min(1, left / 1.2 + 0.2); });
      stepEffects(dt);
      // visée
      var showAim = canShoot() && !!balls[net.myId];
      aimG.visible = showAim;
      if (showAim) {
        var mb = balls[net.myId], pw = aim.power, yaw = aim.drag ? aim.yaw : cam.yaw, len = 0.3 + pw * 2.6, ax = Math.sin(yaw), az = -Math.cos(yaw);
        aimMat.color.setHSL(0.33 * (1 - pw), 0.9, 0.55); aimMat.opacity = aim.drag ? 0.92 : 0.4;
        aimDots.forEach(function (d2, k2) { var u = (k2 + 1) / (aimDots.length + 1) * len, px = mb.x + ax * u, pz = mb.z + az * u, fl2 = GS.floorAt(H, px, pz, mb.y + 0.5); d2.visible = !!fl2; d2.position.set(px, (fl2 ? fl2.h : mb.y) + 0.012, pz); var s3 = 0.7 + pw * 0.6; d2.scale.set(s3, s3, s3); });
        var hx = mb.x + ax * (len + 0.08), hz = mb.z + az * (len + 0.08), fl3 = GS.floorAt(H, hx, hz, mb.y + 0.5); aimHead.position.set(hx, (fl3 ? fl3.h : mb.y) + 0.013, hz); aimHead.rotation.z = -yaw; var s4 = 0.9 + pw * 0.8; aimHead.scale.set(s4, s4, s4);
      }
      if (ui) {
        ui.pow.style.display = aim.drag && showAim ? 'block' : 'none'; ui.powF.style.width = Math.round(aim.power * 100) + '%';
        // l'anneau « TIRE » autour de la balle (téléphone)
        var bs = world.touch && showAim && !aim.drag ? ballScreen() : null, rr2 = world.dom.getBoundingClientRect();
        if (bs && bs.ok) { ui.ring.style.display = 'flex'; ui.ring.style.left = (bs.x - rr2.left) + 'px'; ui.ring.style.top = (bs.y - rr2.top) + 'px'; } else ui.ring.style.display = 'none';
      }
      ghost.visible = false;
      hudT -= dt; if (hudT <= 0) { hudT = 0.25; refreshHud(); refreshWait(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && ui) ui.toast.classList.remove('in'); }
    };
    function camDist(b) { var c = world.camera.position; return Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z); }
    room._dbg = { st: st, net: net, balls: balls, send: wsSend, cam: cam, aim: aim, scene: function () { return SC; }, shoot: function (p, y) { shoot(p, y === undefined ? cam.yaw : y); } };
    return room;
  }

  /* ==================================================================
     L'ACCUEIL DU GOLF : les 5 parcours, les parties privées, le classement
     ================================================================== */
  function createLobby(world) {
    var HX = 14, HZ = 6.5, H = 4.6, low = world.low;
    var room = { title: '⛳ MINI GOLF', subtitle: 'CHOISIS TON PARCOURS', topic: 'flambeurs-golf-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#2b8f45'; fx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 8; i++) { fx.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; fx.fillRect(i * 32, 0, 32, 256); }
    var ft = mkTex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2, HZ / 2);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wm = new THREE.MeshStandardMaterial({ color: 0x163a26, roughness: 0.85 });
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wm); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a120c })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    var hole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.rotation.x = -Math.PI / 2; hole.position.set(8, 0.006, 2.6); g.add(hole);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); pole.position.set(8, 0.75, 2.6); g.add(pole);
    var fcv = mkCanvas(128, 80), fcx = fcv.getContext('2d'); fcx.fillStyle = '#e8392f'; fcx.fillRect(0, 0, 128, 80); fcx.fillStyle = '#fff'; fcx.font = '900 50px ' + SERIF; fcx.textAlign = 'center'; fcx.textBaseline = 'middle'; fcx.fillText('⛳', 64, 42);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshBasicMaterial({ map: mkTex(fcv), side: THREE.DoubleSide })), fg = new THREE.Group(); flag.position.x = 0.25; fg.position.set(8, 1.35, 2.6); fg.add(flag); g.add(fg);
    room.colliders.push({ x: 8, z: 2.6, r: 0.3 });
    var sc = mkCanvas(1024, 360), sx = sc.getContext('2d'); sx.fillStyle = 'rgba(6,14,9,0.92)'; sx.fillRect(0, 0, 1024, 360); sx.strokeStyle = '#5dff8a'; sx.lineWidth = 10; sx.strokeRect(16, 16, 992, 328);
    sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#5dff8a'; sx.font = '900 112px ' + SERIF; sx.fillText('MINI GOLF', 512, 130);
    sx.fillStyle = '#f4ead2'; sx.font = '700 40px ' + SERIF; sx.fillText('5 parcours · 20 trous · tous en même temps', 512, 232, 940); sx.fillStyle = '#ffd23f'; sx.font = '800 34px ' + MONO; sx.fillText('GRATUIT · POUR LE FUN', 512, 295);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 2.11), new THREE.MeshBasicMaterial({ map: mkTex(sc) })); sign.position.set(HX - 0.05, 3.0, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    // crédit de la balle (licence CC BY 4.0) : caché derrière le panneau, tourné vers le mur, donc jamais visible
    var cc = mkCanvas(1024, 96), cx2 = cc.getContext('2d'); cx2.fillStyle = '#0a120c'; cx2.fillRect(0, 0, 1024, 96); cx2.fillStyle = '#c9e8d2'; cx2.font = '600 34px ' + SERIF; cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
    cx2.fillText('Balle de golf : « Golf Ball » par germydan · Sketchfab · licence CC BY 4.0', 512, 50, 990);
    var credit = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.28), new THREE.MeshBasicMaterial({ map: mkTex(cc) })); credit.rotation.y = Math.PI / 2; credit.position.set(HX - 0.03, 3.0, 0); g.add(credit);
    g.add(new THREE.AmbientLight(0xeaf6ee, 1.15));
    if (!low) { var l = new THREE.PointLight(0xfff2d0, 0.8, 14); l.position.set(0, 3.8, 0); g.add(l); }
    doorThemes();
    // les portes : derrière les battants, un aperçu peint du parcours (ciel, collines, piste qui file vers le drapeau, nuage qui passe)
    // et le nombre de joueurs en ligne ; trois filets de couleur crème en guise d'encadrement (rien de lumineux)
    var ui = null, info = { rooms: {}, top: [] }, infoT = 0, active = false;
    var PREV = {
      prairie: ['#5db6ee', '#bfe6fb', '#5fbf4a', '#3f9a3a', '#7ad05a'], automne: ['#e9a860', '#f7d9a4', '#9a7a2e', '#6f8a37', '#c9a24a'],
      kraken: ['#5b5a9c', '#e0a898', '#215a68', '#1f4a56', '#2f8f84'], volcan: ['#4a3a5a', '#f28a4a', '#3a2a26', '#2a1f1c', '#d9480f'],
      canyon: ['#f1b36d', '#fbe2b0', '#c0661f', '#c98f57', '#8fbf5a'], neige: ['#8fc4ff', '#e6f2ff', '#dfe9f5', '#f4f8ff', '#8fd08f'], ile: ['#ff9f5a', '#ffd9a0', '#e6cb93', '#2a9bb0', '#7ad05a']
    };
    function preview(m) {
      var P = PREV[m];
      return function (c, W, Hh, t) {
        var g2 = c.createLinearGradient(0, 0, 0, Hh); g2.addColorStop(0, P[0]); g2.addColorStop(0.55, P[1]); c.fillStyle = g2; c.fillRect(0, 0, W, Hh);
        c.fillStyle = '#fff'; c.globalAlpha = 0.85; var cx3 = ((t * 6) % (W + 80)) - 40; c.beginPath(); c.ellipse(cx3, Hh * 0.2, 26, 8, 0, 0, 7); c.ellipse(cx3 + 14, Hh * 0.2 - 5, 16, 7, 0, 0, 7); c.fill(); c.globalAlpha = 1;
        c.fillStyle = P[3]; c.beginPath(); c.moveTo(0, Hh * 0.55); c.quadraticCurveTo(W * 0.3, Hh * 0.4, W * 0.6, Hh * 0.52); c.quadraticCurveTo(W * 0.85, Hh * 0.44, W, Hh * 0.54); c.lineTo(W, Hh); c.lineTo(0, Hh); c.fill();
        c.fillStyle = P[2]; c.fillRect(0, Hh * 0.56, W, Hh * 0.44);
        c.fillStyle = P[4]; c.beginPath(); c.moveTo(W * 0.46, Hh * 0.56); c.lineTo(W * 0.54, Hh * 0.56); c.lineTo(W * 0.9, Hh); c.lineTo(W * 0.1, Hh); c.fill();
        c.fillStyle = '#f4f4f4'; c.fillRect(W * 0.5 - 1, Hh * 0.4, 2, Hh * 0.16); c.fillStyle = '#e8392f'; c.beginPath(); c.moveTo(W * 0.5 + 1, Hh * 0.4); c.lineTo(W * 0.5 + 14, Hh * 0.4 + 5); c.lineTo(W * 0.5 + 1, Hh * 0.4 + 10); c.fill();
        var n = info.rooms && info.rooms[m] ? info.rooms[m].n | 0 : 0;
        c.fillStyle = 'rgba(6,14,9,0.72)'; c.fillRect(0, Hh - 40, W, 40); c.fillStyle = '#f4ead2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 20px ' + SERIF;
        c.fillText(n ? n + (n > 1 ? ' joueurs' : ' joueur') : 'Libre', W / 2, Hh - 20, W - 12);
      };
    }
    var CREAM = 0xe8dcc0;
    var DX = {}; MAP_IDS.forEach(function (m, k) { DX[m] = (k - MAP_IDS.length / 2) * 3.5; world.addDoor(room, { x: DX[m], z: -HZ, nx: 0, nz: 1, w: 2.2, h: 3.0, label: MAPS[m].emoji + ' ' + MAPS[m].name.toUpperCase(), sub: '10 TROUS', color: CREAM, target: 'golf_' + m, theme: 'golf_' + m, portalDraw: preview(m) }); });
    // 6e porte : la partie privée (elle ouvre le panneau pour créer une partie avec un code ou en rejoindre une)
    var privT = 0;
    world.addDoor(room, {
      x: (MAP_IDS.length / 2) * 3.5, z: -HZ, nx: 0, nz: 1, w: 2.2, h: 3.0, label: '🔒 PARTIE PRIVÉE', sub: 'CRÉER · REJOINDRE', color: CREAM, theme: 'golf_prive',
      portalDraw: function (c, W, Hh, t) {
        c.fillStyle = '#10241a'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#1d4a31'; c.fillRect(W * 0.12, Hh * 0.2, W * 0.76, Hh * 0.6);
        c.fillStyle = '#e8c35a'; c.beginPath(); c.arc(W / 2, Hh * 0.42, 22, Math.PI, 0); c.lineWidth = 8; c.strokeStyle = '#e8c35a'; c.stroke(); c.fillRect(W / 2 - 30, Hh * 0.42, 60, 46);
        c.fillStyle = '#10241a'; c.beginPath(); c.arc(W / 2, Hh * 0.42 + 18, 6, 0, 7); c.fill(); c.fillRect(W / 2 - 2.5, Hh * 0.42 + 18, 5, 14);
        c.fillStyle = '#f4ead2'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 20px ' + SERIF; c.fillText('Entre amis', W / 2, Hh * 0.74, W - 20); c.font = '700 14px ' + MONO; c.fillText('code à 5 lettres', W / 2, Hh * 0.82, W - 20);
      },
      go: function (w) { if (performance.now() - privT < 1500) return; privT = performance.now(); w.player.z = -HZ + 2.3; if (w.pv) { w.pv.x = 0; w.pv.z = 0; } openMenu(); }
    });
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function (from) { var m = String(from || '').replace('golf_', ''); if (DX[m] !== undefined) return { x: DX[m], z: -HZ + 2.6, yaw: F.yawFor(0, 1) }; return { x: 0, z: HZ - 2.6, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Avance vers la porte du parcours que tu veux · porte 🔒 à droite : partie privée' : 'ZQSD : marcher · avance vers la porte du parcours que tu veux · porte 🔒 à droite : partie privée'; };

    // petit panneau (bouton en haut à droite) : partie privée par code et classement

    function build() {
      injectCss();
      var el = document.createElement('div'); el.className = 'gf-ui';
      el.innerHTML = '<div class="gf-menu gf-box off" style="bottom:auto;max-height:84vh"></div><button class="gf-btn gf-tog">🔒 Privé · 🏆 Top 10</button>';
      world.container.appendChild(el);
      var menu = el.querySelector('.gf-menu'), tog = el.querySelector('.gf-tog');
      tog.addEventListener('click', function () { var off = menu.classList.toggle('off'); tog.style.display = off ? '' : 'none'; if (!off) render(); });
      room._openMenu = function () { menu.classList.remove('off'); tog.style.display = 'none'; render(); };
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; SND.ui();
        if (b.dataset.a === 'hide') { menu.classList.add('off'); tog.style.display = ''; return; }
        if (b.dataset.a === 'create') { var m = menu.querySelector('select').value, A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = ''; for (var k = 0; k < 5; k++) code += A[Math.floor(Math.random() * A.length)]; go('priv-' + code, m); return; }
        if (b.dataset.a === 'join') {
          var inp = menu.querySelector('input'), code2 = String(inp.value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), err = menu.querySelector('.gf-err');
          if (code2.length !== 5) { err.textContent = 'Le code fait 5 lettres ou chiffres.'; return; }
          err.textContent = 'Recherche…';
          fetch('/api/golf-info?code=' + code2, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j || !j.map) { err.textContent = 'Aucune partie avec ce code.'; return; } go('priv-' + code2, j.map); }).catch(function () { err.textContent = 'Aucune partie avec ce code.'; });
        }
      });
      menu.addEventListener('keydown', function (e) { e.stopPropagation(); });
      return { el: el, menu: menu };
    }
    function doorThemes() {
      var T = F.DOOR_THEMES; if (!T || T.golf_prairie) return;
      function sky(c, W, H, a, b, ground, hill) { var g2 = c.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, a); g2.addColorStop(1, b); c.fillStyle = g2; c.fillRect(0, 0, W, H); c.fillStyle = hill; c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.7); c.quadraticCurveTo(W * 0.5, H * 0.56, W, H * 0.72); c.lineTo(W, H); c.fill(); c.fillStyle = ground; c.fillRect(0, H * 0.84, W, H * 0.16); }
      function frame(c, W, H, col) { c.strokeStyle = col; c.lineWidth = 9; c.strokeRect(4, 4, W - 8, H - 8); }
      function flag(c, W, H) { c.fillStyle = '#f4f4f4'; c.fillRect(W * 0.62, H * 0.38, 4, H * 0.46); c.fillStyle = '#e8392f'; c.beginPath(); c.moveTo(W * 0.62 + 4, H * 0.38); c.lineTo(W * 0.62 + 40, H * 0.38 + 14); c.lineTo(W * 0.62 + 4, H * 0.38 + 28); c.fill(); c.fillStyle = '#0a0a0a'; c.beginPath(); c.ellipse(W * 0.62 + 2, H * 0.84, 14, 5, 0, 0, Math.PI * 2); c.fill(); }
      var base = { rgb: '93, 255, 138', logo: 'golf', square: true };
      function mk(frameCol, leafCol, rgb, paint) { return { frame: frameCol, leaf: leafCol, rgb: rgb, logo: 'golf', square: true, paint: paint }; }
      T.golf_prive = { frame: 0x3a2f22, leaf: 0x2c4a36, rgb: '232, 220, 192', logo: 'golf', square: true, paint: function (c, W, H) { c.fillStyle = '#2c4a36'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e8c35a'; c.lineWidth = 7; c.strokeRect(10, 10, W - 20, H - 20); c.fillStyle = '#e8c35a'; c.beginPath(); c.arc(W / 2, H * 0.42, W * 0.12, Math.PI, 0); c.lineWidth = 9; c.stroke(); c.fillRect(W / 2 - W * 0.17, H * 0.42, W * 0.34, H * 0.12); } };
      T.golf_kraken = mk(0x2c4a52, 0x2f6f78, '120, 200, 210', function (c, W, H) { sky(c, W, H, '#5b5a9c', '#e0a898', '#215a68', '#1f4a56'); c.strokeStyle = '#1f3a40'; c.lineWidth = 9; c.lineCap = 'round'; for (var q = 0; q < 3; q++) { var bx = W * (0.25 + q * 0.28); c.beginPath(); c.moveTo(bx, H * 0.84); c.bezierCurveTo(bx - 22, H * 0.62, bx + 26, H * 0.5, bx + 6, H * 0.36); c.stroke(); } c.fillStyle = '#d9a441'; c.fillRect(W * 0.62, H * 0.38, 4, H * 0.46); frame(c, W, H, '#2c4a52'); });
      T.golf_volcan = mk(0x4a2a20, 0x9a3a22, '255, 130, 60', function (c, W, H) { sky(c, W, H, '#4a3a5a', '#f28a4a', '#3a2a26', '#2a1f1c'); c.fillStyle = '#2a1f1c'; c.beginPath(); c.moveTo(W * 0.1, H * 0.8); c.lineTo(W * 0.42, H * 0.34); c.lineTo(W * 0.5, H * 0.38); c.lineTo(W * 0.62, H * 0.34); c.lineTo(W * 0.92, H * 0.8); c.fill(); c.fillStyle = '#e5502a'; c.beginPath(); c.moveTo(W * 0.42, H * 0.34); c.lineTo(W * 0.62, H * 0.34); c.lineTo(W * 0.55, H * 0.42); c.lineTo(W * 0.48, H * 0.4); c.fill(); frame(c, W, H, '#4a2a20'); });
      T.golf_prairie = T.golfjardin || mk(0x6b8a3a, 0x6fc2f0, '93, 255, 138', function (c, W, H) { sky(c, W, H, '#5db6ee', '#bfe6fb', '#4fae52', '#5fbf4a'); flag(c, W, H); frame(c, W, H, '#6b8a3a'); });
      T.golf_automne = mk(0x9a5a2a, 0xf0b070, '255, 150, 70', function (c, W, H) { sky(c, W, H, '#e9a860', '#f7d9a4', '#6f8a37', '#8a7a2e'); c.fillStyle = '#7a4a2a'; c.fillRect(W * 0.2, H * 0.4, 12, H * 0.4); c.fillStyle = '#d9682a'; c.beginPath(); c.arc(W * 0.2 + 6, H * 0.36, 34, 0, 7); c.fill(); c.fillStyle = '#e8a33a'; c.beginPath(); c.arc(W * 0.2 + 30, H * 0.4, 24, 0, 7); c.fill(); flag(c, W, H); frame(c, W, H, '#9a5a2a'); });
      T.golf_canyon = mk(0xb8743a, 0xf3c07a, '255, 190, 110', function (c, W, H) { sky(c, W, H, '#f1b36d', '#fbe2b0', '#c98f57', '#d9803a'); c.fillStyle = '#b8601f'; c.fillRect(W * 0.08, H * 0.42, W * 0.22, H * 0.42); c.fillRect(W * 0.7, H * 0.5, W * 0.24, H * 0.34); flag(c, W, H); frame(c, W, H, '#b8743a'); });
      T.golf_neige = mk(0x8fb4d8, 0xdcecff, '170, 210, 255', function (c, W, H) { sky(c, W, H, '#8fc4ff', '#e6f2ff', '#f4f8ff', '#e1ecf8'); c.fillStyle = '#d4e2f2'; c.beginPath(); c.moveTo(W * 0.1, H * 0.74); c.lineTo(W * 0.32, H * 0.36); c.lineTo(W * 0.56, H * 0.74); c.fill(); c.fillStyle = '#2f7d4a'; c.beginPath(); c.moveTo(W * 0.78, H * 0.78); c.lineTo(W * 0.86, H * 0.5); c.lineTo(W * 0.94, H * 0.78); c.fill(); flag(c, W, H); frame(c, W, H, '#8fb4d8'); });
      T.golf_ile = mk(0xe08a4a, 0x7fd6e8, '255, 150, 90', function (c, W, H) { sky(c, W, H, '#ff9f5a', '#ffd9a0', '#e6cb93', '#e6cb93'); c.fillStyle = '#2a9bb0'; c.fillRect(0, H * 0.6, W, H * 0.14); c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(W * 0.28, H * 0.5, 22, 0, 7); c.fill(); flag(c, W, H); frame(c, W, H, '#e08a4a'); });
    }
    function openMenu() { if (ui && room._openMenu) room._openMenu(); }
    function go(roomName, map) { F.golf.pending = { room: roomName, map: map }; world.goRoom('golf_' + map, 'golf'); }
    function render() {
      if (!ui) return;
      var keepCode = ui.menu.querySelector('input') ? ui.menu.querySelector('input').value : '', keepMap = ui.menu.querySelector('select') ? ui.menu.querySelector('select').value : 'prairie';
      var h = '<div style="display:flex;align-items:center;gap:8px"><h2 style="flex:1">⛳ Mini golf</h2><button class="gf-btn" data-a="hide">✕</button></div><div class="sub" style="opacity:.8;font-size:12px;font-weight:700;margin-bottom:6px">Pour jouer en public, pousse la porte du parcours.</div>';
      h += '<div class="gf-sec" style="margin-top:4px;border:0;padding-top:0"><h4>🔒 Partie privée</h4><div class="gf-row"><select>' + MAP_IDS.map(function (m) { return '<option value="' + m + '"' + (m === keepMap ? ' selected' : '') + '>' + MAPS[m].emoji + ' ' + esc(MAPS[m].name) + '</option>'; }).join('') + '</select><button data-a="create">Créer</button></div>';
      h += '<div class="gf-row"><input maxlength="5" placeholder="CODE" value="' + esc(keepCode) + '"><button data-a="join">Rejoindre</button></div><div class="gf-err"></div></div>';
      h += '<div class="gf-sec"><h4>🏆 Top 10 · parties gagnées</h4>';
      if (!info.top.length) h += '<div style="opacity:.75;font-size:12px;font-weight:700">Personne pour l\'instant : gagne une partie à 2 joueurs ou plus !</div>';
      info.top.forEach(function (r, i2) { h += '<div class="gf-top"><b>' + (['🥇', '🥈', '🥉'][i2] || i2 + 1) + '</b><span>' + esc(r.n) + '</span><em>' + r.w + ' 🏆 · ' + r.g + ' parties</em></div>'; });
      h += '</div>';
      var err = ui.menu.querySelector('.gf-err'), errTxt = err ? err.textContent : '';
      ui.menu.innerHTML = h; if (errTxt) ui.menu.querySelector('.gf-err').textContent = errTxt;
    }
    function poll() { fetch('/api/golf-info', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { info = { rooms: j.rooms || {}, top: j.top || [] }; if (active && !(document.activeElement && document.activeElement.tagName === 'INPUT')) render(); }).catch(function () { /* hors ligne */ }); }
    room.onEnter = function () { active = true; ui = build(); poll(); infoT = 5; F.golfScene && F.golfScene.loadNature(function () { /* on précharge les modèles pendant qu'on choisit */ }); };
    room.onLeave = function () { active = false; if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null; };
    room.onPageHide = room.onLeave;
    room.update = function (dt) { fg.rotation.y = Math.sin(performance.now() / 500) * 0.3; if (active) { infoT -= dt; if (infoT <= 0) { infoT = 5; poll(); } } };
    return room;
  }

  F.registerRoom('golf', createLobby);
  MAP_IDS.forEach(function (m) { F.registerRoom('golf_' + m, function (w) { return createCourse(w, m); }); });
  F.golf.MAPS = MAPS;
})();
