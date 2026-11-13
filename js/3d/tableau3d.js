/* =====================================================================
   tableau3d.js — La galerie « TABLEAU DESSIN » du salon des mini jeux (monde 3D)
   ---------------------------------------------------------------------
   Chaque semaine : on paie 100 🪙 au chevalet pour peindre un tableau, il est accroché au mur ; tout le monde peut voter pour son préféré
   (un vote par semaine, pas pour soi) ; le lundi à minuit (heure de Paris) la cagnotte entière est partagée entre les auteurs des trois
   tableaux les plus votés, qui montent alors sur le podium du mur du fond.
   TOUT est décidé par le serveur (api/tableaux.js : paiement, votes, classement, partage) ; ici on ne fait que dessiner et demander.
   Salle : mur de gauche et mur de droite = 8 cadres chacun (les mieux votés d'abord ; les autres sont dans la liste du pupitre),
           mur du fond = podium de la semaine passée, au centre-gauche le chevalet, au centre-droit le pupitre « tous les tableaux ».
   Fichiers liés : api/tableaux.js, minijeux3d.js (la porte « TABLEAU DESSIN »), world3d.js.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, EMOJI = F.EMOJI_FONT, TAU = F.TAU, fmtN = F.fmtN;
  var HX = 9, HZ = 7, H = 4.6;
  var API = '/api/tableaux';
  var CW = 480, CH = 360;                 // taille d'un tableau (pixels)
  var COLS_Z = [-5.1, -1.7, 1.7, 5.1], ROWS_Y = [1.35, 3.35], FW = 1.75, FH = 1.3125;

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function setBalance(b) {
    if (typeof b !== 'number') return;
    try { var s = st(); s.balance = b; s.lastBalanceChange = Date.now(); if (typeof saveState === 'function') saveState(); if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) { /* ok */ }
  }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function std(c, r, m, e) { return new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || 0 }); }
  function ellipsize(c, text, maxW) { text = String(text); if (c.measureText(text).width <= maxW) return text; while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1); return text + '…'; }
  function timeLeft(ms) {
    if (ms <= 0) return 'terminé';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d > 0 ? d + ' j ' + h + ' h' : h > 0 ? h + ' h ' + (m % 60) + ' min' : (m % 60) + ' min';
  }
  function imgUrl(id) { return API + '?img=' + encodeURIComponent(id); }

  /* ---------- appels au serveur ---------- */
  function call(body) {
    var tok = F.token();
    if (!tok) return Promise.resolve({ ok: false, error: 'Connecte-toi pour participer.' });
    var nm = '', av = '';
    try { nm = st().username || ''; av = st().avatarEmoji || '🎭'; } catch (e) { /* ok */ }
    // pas de « keepalive » ici : l'image d'un tableau dépasse les 64 Ko que ce mode accepte
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify(Object.assign({ name: nm, avatar: av }, body)) })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (j) { return j || { ok: false, error: 'Réponse invalide du serveur.' }; })
      .catch(function () { return { ok: false, error: 'Connexion au serveur impossible.' }; });
  }
  function fetchState() {
    var tok = F.token();
    return fetch(API, { cache: 'no-store', headers: tok ? { 'X-Auth-Token': tok } : {} }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  /* ---------- feuille de style de la fenêtre (une seule fois) ---------- */
  function injectCss() {
    if (document.getElementById('tbl-style')) return;
    var s = document.createElement('style'); s.id = 'tbl-style';
    s.textContent =
      '.tbl{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:64px 10px 84px;box-sizing:border-box;background:rgba(6,3,10,.84);font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#f4e3b0}' +
      '.tbl-panel{width:min(100%,640px);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;background:linear-gradient(180deg,rgba(26,16,30,.97),rgba(10,6,14,.98));border:1.5px solid #c9a227;box-shadow:0 0 30px rgba(0,0,0,.6),0 0 22px rgba(74,208,255,.16)}' +
      '.tbl-panel.wide{width:min(100%,900px)}' +
      '.tbl-head{display:flex;align-items:center;gap:10px}.tbl-head h3{margin:0;flex:1;font-size:19px;color:#ffe08a}' +
      '.tbl button{font:inherit;cursor:pointer;border:1px solid rgba(201,162,39,.7);background:rgba(255,255,255,.07);color:#f4e3b0;border-radius:10px;padding:8px 12px;font-weight:700}' +
      '.tbl button:hover:not(:disabled){background:rgba(255,224,138,.18)}.tbl button:disabled{opacity:.45;cursor:default}' +
      '.tbl button.go{background:linear-gradient(180deg,#ffd24a,#c9a227);color:#241800;border-color:#ffe08a}' +
      '.tbl button.on{background:#4ad0ff;color:#04202a;border-color:#4ad0ff}' +
      '.tbl-msg{min-height:20px;font-size:14px;font-weight:700;color:#ffb0a0}.tbl-msg.ok{color:#9affc8}' +
      '.tbl-info{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;color:#cdbf94}.tbl-info b{color:#ffe08a}' +
      '.tbl-big{width:100%;max-height:calc(100vh - 330px);aspect-ratio:4/3;object-fit:contain;background:#000;border-radius:8px;border:3px solid #c9a227}' +
      '.tbl-cv{width:100%;max-width:max(260px,calc((100vh - 360px) * 1.3333));margin:0 auto;aspect-ratio:4/3;background:#fff;border-radius:8px;border:3px solid #c9a227;touch-action:none;cursor:crosshair;display:block}' +
      '.tbl-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.tbl-sw{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.35);padding:0!important;cursor:pointer}.tbl-sw.on{outline:3px solid #4ad0ff;outline-offset:1px}' +
      '.tbl input[type=text]{flex:1;min-width:120px;font:inherit;padding:8px 10px;border-radius:10px;border:1px solid #c9a227;background:rgba(0,0,0,.4);color:#fff}' +
      '.tbl input[type=color]{width:34px;height:30px;padding:0;border:none;background:none}' +
      '.tbl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}' +
      '.tbl-card{display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:10px;border:1px solid rgba(201,162,39,.45);background:rgba(255,255,255,.05);cursor:pointer;font-size:13px}' +
      '.tbl-card img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:#111}.tbl-card.mine{border-color:#4ad0ff}.tbl-card.vote{border-color:#ff6a8a;box-shadow:0 0 10px rgba(255,106,138,.4)}';
    document.head.appendChild(s);
  }

  function createRoom(world) {
    var low = world.low;
    var room = { title: '🎨 TABLEAU DESSIN', subtitle: 'PEINS · VOTE · GAGNE LA CAGNOTTE', topic: 'flambeurs-dessin-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* ---------- décor : parquet, murs, plafond, moulures ---------- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#2a1c14'; fx.fillRect(0, 0, 256, 256);
    for (var pi = 0; pi < 8; pi++) { fx.fillStyle = pi % 2 ? '#34231a' : '#2a1c14'; fx.fillRect(0, pi * 32, 256, 31); fx.fillStyle = 'rgba(0,0,0,.35)'; fx.fillRect((pi * 83) % 256, pi * 32, 2, 32); }
    var ft = mkTex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX * 2 / 3, HZ * 2 / 3); ft.anisotropy = 8;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.5, metalness: 0.08 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241a2c'), roughness: 0.9, metalness: 0.02 });
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wm); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0a070c })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    var goldM = std(0xc9a227, 0.35, 0.7, 0x2a1d00);
    [[HX * 2, 0.15, 0.15, 0, H - 0.08, -HZ + 0.08], [HX * 2, 0.15, 0.15, 0, H - 0.08, HZ - 0.08], [0.15, 0.15, HZ * 2, -HX + 0.08, H - 0.08, 0], [0.15, 0.15, HZ * 2, HX - 0.08, H - 0.08, 0],
      [HX * 2, 0.12, 0.1, 0, 0.06, -HZ + 0.05], [HX * 2, 0.12, 0.1, 0, 0.06, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 0.06, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 0.06, 0]].forEach(function (b) { box(g, b[0], b[1], b[2], goldM, b[3], b[4], b[5]); });
    g.add(new THREE.AmbientLight(0xf4eaf4, 1.35));
    if (!low) { [[-5, 3.6, 0], [5, 3.6, 0], [0, 3.6, -4.5]].forEach(function (p) { var l = new THREE.PointLight(0xffe2b0, 0.55, 11); l.position.set(p[0], p[1], p[2]); g.add(l); }); }

    /* ---------- images : chargées une fois par tableau, partagées entre cadres ---------- */
    var blankC = mkCanvas(64, 48), bx = blankC.getContext('2d'); bx.fillStyle = '#17121c'; bx.fillRect(0, 0, 64, 48); bx.strokeStyle = '#3a2f46'; bx.lineWidth = 2; bx.strokeRect(6, 6, 52, 36);
    var blankTex = mkTex(blankC), imgCache = {};
    function texFor(id, onLoad) {
      var e = imgCache[id];
      if (e) { if (e.tex) return e.tex; if (onLoad) e.cbs.push(onLoad); return null; }
      e = imgCache[id] = { tex: null, cbs: onLoad ? [onLoad] : [] };
      var im = new Image();
      im.onload = function () { var t = new THREE.Texture(im); t.anisotropy = 4; t.needsUpdate = true; e.tex = t; e.cbs.forEach(function (f) { f(t); }); e.cbs = []; };
      im.onerror = function () { delete imgCache[id]; };
      im.src = imgUrl(id);
      return null;
    }

    /* ---------- un cadre : bordure dorée, tableau, cartel dessous ---------- */
    function makeFrame(x, y, z, ry, w, h, plaqueFont) {
      var grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; g.add(grp);
      box(grp, w + 0.26, h + 0.26, 0.08, goldM, 0, 0, 0.04); box(grp, w + 0.08, h + 0.08, 0.09, std(0x140d06, 0.8, 0.1), 0, 0, 0.05);
      var mat = new THREE.MeshBasicMaterial({ map: blankTex });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); plane.position.z = 0.1; grp.add(plane);
      var pc = mkCanvas(512, Math.round(512 * 0.34 / Math.max(w, 1.8))), pctx = pc.getContext('2d'), ptex = mkTex(pc);
      var pw = Math.max(w, 1.8), pl = new THREE.Mesh(new THREE.PlaneGeometry(pw, 0.34), new THREE.MeshBasicMaterial({ map: ptex })); pl.position.set(0, -(h / 2 + 0.36), 0.05); grp.add(pl);
      var hit = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ visible: false })); hit.position.z = 0.12; grp.add(hit);
      var nx = Math.sin(ry), nz = Math.cos(ry);
      return { grp: grp, mat: mat, plane: plane, hit: hit, pc: pc, pctx: pctx, ptex: ptex, w: pw, sx: x + nx * 2.2, sz: z + nz * 2.2, item: null, sig: '', font: plaqueFont || 34 };
    }
    function paintPlaque(f, l1, l2, l3) {
      var c = f.pctx, W = f.pc.width, Hh = f.pc.height;
      c.fillStyle = '#120c08'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#c9a227'; c.lineWidth = 3; c.strokeRect(2, 2, W - 4, Hh - 4);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffe9a8'; c.font = '800 ' + Math.round(Hh * 0.42) + 'px ' + SERIF; c.fillText(ellipsize(c, l1, W - 24), W / 2, Hh * 0.3);
      c.fillStyle = '#cdbf94'; c.font = '600 ' + Math.round(Hh * 0.3) + 'px ' + SERIF + ',' + EMOJI; c.fillText(ellipsize(c, l2, W - 24), W / 2, Hh * 0.72);
      f.ptex.needsUpdate = true;
    }
    function setImage(f, id) {
      if (!id) { f.mat.map = blankTex; f.mat.needsUpdate = true; return; }
      var t = texFor(id, function (tt) { if (f.item && f.item.id === id) { f.mat.map = tt; f.mat.needsUpdate = true; } });
      f.mat.map = t || blankTex; f.mat.needsUpdate = true;
    }

    /* ---------- mur de gauche et de droite : 8 cadres chacun ---------- */
    var slots = [];
    [[-HX + 0.03, Math.PI / 2], [HX - 0.03, -Math.PI / 2]].forEach(function (sd) {
      ROWS_Y.forEach(function (y) { COLS_Z.forEach(function (z) { slots.push(makeFrame(sd[0], y, z, sd[1], FW, FH)); }); });
    });
    // ordre de remplissage : les mieux votés près de l'entrée de gauche puis ça se répartit autour de la salle
    slots.forEach(function (f) { paintPlaque(f, 'Emplacement libre', '🖼️ peins le prochain tableau !'); });

    /* ---------- mur du fond : le podium de la semaine passée ---------- */
    var PODS = [
      { rank: 1, x: 0, y: 2.9, w: 2.6, h: 1.95, bh: 1.0, col: '#ffd24a', name: 'OR' },
      { rank: 2, x: -3.6, y: 2.5, w: 2.0, h: 1.5, bh: 0.7, col: '#d7dde6', name: 'ARGENT' },
      { rank: 3, x: 3.6, y: 2.3, w: 2.0, h: 1.5, bh: 0.45, col: '#d58a4a', name: 'BRONZE' }
    ];
    PODS.forEach(function (p) {
      p.f = makeFrame(p.x, p.y, -HZ + 0.03, 0, p.w, p.h);
      var bc = mkCanvas(256, 128), bctx = bc.getContext('2d'); bctx.fillStyle = p.col; bctx.fillRect(0, 0, 256, 128);
      bctx.fillStyle = 'rgba(0,0,0,.22)'; bctx.fillRect(0, 0, 256, 10); bctx.fillStyle = '#2a1c00'; bctx.font = '900 96px ' + SERIF; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.fillText(String(p.rank), 128, 70);
      var side = new THREE.MeshStandardMaterial({ map: mkTex(bc), roughness: 0.35, metalness: 0.55 }), topM = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.col), roughness: 0.35, metalness: 0.55 });
      box(g, 2.3, p.bh, 1.1, [side, side, topM, topM, side, side], p.x, p.bh / 2, -HZ + 0.7);
      room.colliders.push({ x: p.x, z: -HZ + 0.7, r: 1.0 }, { x: p.x - 0.8, z: -HZ + 0.7, r: 0.7 }, { x: p.x + 0.8, z: -HZ + 0.7, r: 0.7 });
      paintPlaque(p.f, p.name, 'à venir…');
    });
    var titleC = mkCanvas(1024, 96), titleX = titleC.getContext('2d'), titleT = mkTex(titleC);
    var titleM = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.52), new THREE.MeshBasicMaterial({ map: titleT, transparent: true })); titleM.position.set(0, 4.3, -HZ + 0.04); g.add(titleM);
    function paintTitle(txt) {
      titleX.clearRect(0, 0, 1024, 96); titleX.textAlign = 'center'; titleX.textBaseline = 'middle'; titleX.shadowColor = '#ffd24a'; titleX.shadowBlur = 16;
      titleX.fillStyle = '#ffe08a'; titleX.font = '900 62px ' + SERIF + ',' + EMOJI; titleX.fillText(txt, 512, 50, 990); titleT.needsUpdate = true;
    }
    paintTitle('🏆 PODIUM DE LA SEMAINE PASSÉE');

    /* ---------- panneau d'information (mur de l'entrée, à gauche de la porte) ---------- */
    var infoC = mkCanvas(1024, 640), infoX = infoC.getContext('2d'), infoT = mkTex(infoC);
    var infoM = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.625), new THREE.MeshBasicMaterial({ map: infoT })); infoM.position.set(-5.2, 2.5, HZ - 0.05); infoM.rotation.y = Math.PI; g.add(infoM);
    box(g, 4.4, 2.8, 0.06, goldM, -5.2, 2.5, HZ - 0.02);
    var data = null, skew = 0;
    function paintInfo() {
      var c = infoX, W = 1024, Hh = 640; c.fillStyle = '#0c0a12'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#4ad0ff'; c.lineWidth = 8; c.strokeRect(14, 14, W - 28, Hh - 28);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#4ad0ff'; c.font = '900 60px ' + SERIF + ',' + EMOJI; c.fillText('🎨 CONCOURS DE LA SEMAINE', W / 2, 70, W - 60);
      c.fillStyle = '#ffe08a'; c.shadowColor = '#ffd24a'; c.shadowBlur = 24; c.font = '900 118px ' + MONO + ',' + EMOJI; c.fillText(data ? fmtN(data.pot) + ' 🪙' : '…', W / 2, 190, W - 60); c.shadowBlur = 0;
      c.fillStyle = '#cdbf94'; c.font = '700 40px ' + SERIF; c.fillText('cagnotte à partager entre le top 3', W / 2, 265, W - 60);
      c.fillStyle = '#f4e3b0'; c.font = '800 46px ' + SERIF + ',' + EMOJI; c.fillText(data ? '⏳ Fin dans ' + timeLeft(data.endsAt - (Date.now() + skew)) : '⏳ …', W / 2, 335, W - 60);
      c.fillStyle = '#d9cfae'; c.font = '600 33px ' + SERIF;
      ['Peins un tableau au chevalet : ' + (data ? data.price : 100) + ' 🪙', 'Vote pour ton préféré (1 vote par semaine)', 'Lundi 00h00 : 1er 50 % · 2e 30 % · 3e 20 %', 'Personne ne vote ? Tout le monde est remboursé'].forEach(function (l, i) { c.fillText(l, W / 2, 410 + i * 52, W - 70); });
      infoT.needsUpdate = true;
    }
    paintInfo();

    /* ---------- chevalet (peindre) et pupitre (tous les tableaux) ---------- */
    var EASEL = { x: -3.2, z: 2.6 }, KIOSK = { x: 3.2, z: 2.6 };
    (function () {
      var wood = std(0x8a5a30, 0.75, 0.05), e = new THREE.Group(); e.position.set(EASEL.x, 0, EASEL.z); e.rotation.y = Math.PI * 0.18; g.add(e);
      box(e, 0.07, 2.1, 0.07, wood, -0.55, 1.05, -0.35).rotation.z = 0.05; box(e, 0.07, 2.1, 0.07, wood, 0.55, 1.05, -0.35).rotation.z = -0.05; box(e, 0.07, 2.0, 0.07, wood, 0, 1.0, -0.75).rotation.x = -0.18;
      box(e, 1.25, 0.06, 0.1, wood, 0, 0.75, -0.3);
      var cv = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.825), new THREE.MeshBasicMaterial({ color: 0xf6f1e4 })); cv.position.set(0, 1.35, -0.28); cv.rotation.x = -0.08; e.add(cv);
      var sw = [0xff4a4a, 0x4ab0ff, 0xffd24a, 0x4aff9a, 0xc04aff, 0xff8a2a];
      sw.forEach(function (col, i) { var dot = new THREE.Mesh(new THREE.CircleGeometry(0.07 + (i % 3) * 0.02, 12), new THREE.MeshBasicMaterial({ color: col })); dot.position.set(-0.4 + (i % 3) * 0.4, 1.12 + Math.floor(i / 3) * 0.5, -0.27); dot.rotation.x = -0.08; e.add(dot); });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(EASEL.x, 1.1, EASEL.z); g.add(hit);
      room.colliders.push({ x: EASEL.x, z: EASEL.z, r: 0.7 });
      room.interactables.push({ hit: hit, x: EASEL.x, z: EASEL.z, radius: 2.4, prompt: function () { return '🎨 Peindre un tableau — ' + (data ? data.price : 100) + ' 🪙'; }, use: function () { openEditor(); } });
      var k = new THREE.Group(); k.position.set(KIOSK.x, 0, KIOSK.z); g.add(k);
      box(k, 0.9, 1.0, 0.6, std(0x1a1424, 0.4, 0.5), 0, 0.5, 0); box(k, 1.0, 0.06, 0.7, goldM, 0, 1.03, 0);
      var scr = mkCanvas(256, 160), sx = scr.getContext('2d'); sx.fillStyle = '#0a1c24'; sx.fillRect(0, 0, 256, 160); sx.fillStyle = '#4ad0ff'; sx.font = '900 40px ' + SERIF + ',' + EMOJI; sx.textAlign = 'center'; sx.fillText('🖼️ TOUS LES', 128, 70); sx.fillText('TABLEAUX', 128, 118);
      var sm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: mkTex(scr) })); sm.position.set(0, 1.4, 0.05); sm.rotation.x = -0.35; k.add(sm);
      box(k, 0.06, 0.4, 0.06, goldM, 0, 1.22, -0.05);
      var hit2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.8), new THREE.MeshBasicMaterial({ visible: false })); hit2.position.set(KIOSK.x, 0.8, KIOSK.z); g.add(hit2);
      room.colliders.push({ x: KIOSK.x, z: KIOSK.z, r: 0.6 });
      room.interactables.push({ hit: hit2, x: KIOSK.x, z: KIOSK.z, radius: 2.2, prompt: function () { return '📋 Voir tous les tableaux et voter'; }, use: function () { openGallery(); } });
    })();

    /* ---------- les cadres sont cliquables ---------- */
    slots.forEach(function (f, i) {
      room.interactables.push({ hit: f.hit, x: f.sx, z: f.sz, radius: 2.0,
        enabled: function () { return !!f.item; },
        prompt: function () { return '🖼️ « ' + f.item.title + ' » — voir et voter'; },
        use: function () { openViewer(f.item); } });
      void i;
    });
    PODS.forEach(function (p) {
      room.interactables.push({ hit: p.f.hit, x: p.f.sx, z: p.f.sz, radius: 2.4,
        enabled: function () { return !!p.f.item; },
        prompt: function () { return '🏆 ' + p.name + ' — « ' + p.f.item.title + ' »'; },
        use: function () { openViewer(p.f.item, true); } });
    });

    /* ---------- état du serveur -> cadres ---------- */
    function applyState(d) {
      if (!d || !d.ok) return;
      data = d; skew = (d.serverNow || Date.now()) - Date.now();
      slots.forEach(function (f, i) {
        var it = d.items[i] || null, sig = it ? [it.id, it.votes, it.title, it.mine ? 1 : 0, d.myVote === it.id ? 1 : 0].join('|') : '';
        if (sig === f.sig) return;
        var changed = !f.item || !it || f.item.id !== it.id;
        f.sig = sig; f.item = it;
        if (changed) setImage(f, it && it.id);
        if (it) paintPlaque(f, it.title, (d.myVote === it.id ? '❤️ ' : '♥ ') + it.votes + ' · ' + it.author);
        else paintPlaque(f, 'Emplacement libre', '🖼️ peins le prochain tableau !');
      });
      var pod = d.podium;
      PODS.forEach(function (p, i) {
        var e = pod && pod.entries ? pod.entries[i] : null, sig = e ? [e.id, e.votes, e.prize].join('|') : (pod && pod.refunded ? 'ref' : '');
        if (sig === p.f.sig) return;
        var changed = !p.f.item || !e || p.f.item.id !== e.id;
        p.f.sig = sig; p.f.item = e;
        if (changed) setImage(p.f, e && e.id);
        if (e) paintPlaque(p.f, e.title, e.author + ' · ' + e.votes + ' vote' + (e.votes > 1 ? 's' : '') + ' · +' + fmtN(e.prize) + ' 🪙');
        else paintPlaque(p.f, p.name, pod && pod.refunded ? 'aucun vote : remboursés' : 'à venir…');
      });
      paintTitle(pod ? '🏆 PODIUM — SEMAINE DU ' + pod.week.slice(8) + '/' + pod.week.slice(5, 7) : '🏆 PODIUM DE LA SEMAINE PASSÉE');
      paintInfo();
      if (view) refreshView();
    }
    var pollT = null;
    function poll() { fetchState().then(function (d) { if (d && d.ok) applyState(d); }); }
    room.onEnter = function () { poll(); if (!pollT) pollT = setInterval(function () { if (!document.hidden) poll(); }, 7000); };
    room.onLeave = function () { closeAll(true); if (pollT) { clearInterval(pollT); pollT = null; } };
    room.onPause = function () { closeAll(true); };
    var infoTick = 0;
    room.update = function (dt) { infoTick += dt; if (infoTick > 20) { infoTick = 0; paintInfo(); } };

    /* ======================= fenêtres : visionneuse, liste, chevalet ======================= */
    var overlay = null, view = null, editor = null, gallery = false, busy = false;
    function lockWorld() { if (!overlay) world.sitDown(room); }
    function unlockWorld(instant) { world.mode = 'room'; if (instant) { world.blend = 0; world.seatRoom = null; } }
    function onEsc(e) { if (e.code === 'Escape' && overlay) { e.stopImmediatePropagation(); closeAll(); } }
    function closeAll(instant) {
      window.removeEventListener('keydown', onEsc, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var was = !!overlay; overlay = null; view = null; editor = null; gallery = false; busy = false;
      if (was) unlockWorld(instant);
    }
    function open(html, wide) {
      injectCss(); lockWorld();
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = document.createElement('div'); overlay.className = 'tbl';
      overlay.innerHTML = '<div class="tbl-panel' + (wide ? ' wide' : '') + '">' + html + '</div>';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeAll(); });
      world.container.appendChild(overlay);
      window.addEventListener('keydown', onEsc, true);
      return overlay.firstChild;
    }
    function msg(t, ok) { if (!overlay) return; var m = overlay.querySelector('.tbl-msg'); if (m) { m.textContent = t || ''; m.className = 'tbl-msg' + (ok ? ' ok' : ''); } }
    function needLogin() {
      if (loggedIn()) return false;
      msg('🔒 Connecte-toi pour participer.');
      try { world.setFull(false); if (typeof openAuthModal === 'function') openAuthModal('login'); } catch (e) { /* ok */ }
      return true;
    }
    function itemById(id) { return data ? (data.items.filter(function (x) { return x.id === id; })[0] || null) : null; }

    /* ----- visionneuse : un tableau en grand, vote ----- */
    function openViewer(item, podium) {
      if (!item) return;
      view = { id: item.id, podium: !!podium, item: item };
      var p = open('<div class="tbl-head"><h3></h3><button data-a="close">✕ Fermer</button></div><img class="tbl-big" alt=""><div class="tbl-info"></div><div class="tbl-msg"></div><div class="tbl-tools"></div>');
      p.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b || b.disabled) return;
        var a = b.getAttribute('data-a');
        if (a === 'close') closeAll(); else if (a === 'back') openGallery(); else if (a === 'vote') doVote(view.id); else if (a === 'unvote') doVote(''); else if (a === 'remove') doRemove(view.id);
      });
      p.querySelector('.tbl-big').src = imgUrl(item.id);
      refreshView();
    }
    function refreshView() {
      if (!overlay || !view) return;
      var it = view.podium ? view.item : itemById(view.id);
      if (!it) { closeAll(); return; }
      view.item = it;
      var p = overlay.firstChild, d = data || {}, staff = false;
      try { staff = !!(F.isStaff && F.isStaff()); } catch (e) { /* ok */ }
      p.querySelector('h3').textContent = '🖼️ ' + it.title;
      p.querySelector('.tbl-info').innerHTML = view.podium
        ? '<span>Auteur : <b>' + esc(it.author) + '</b></span><span>Votes : <b>' + it.votes + '</b></span><span>Gain : <b>+' + fmtN(it.prize) + ' 🪙</b></span>'
        : '<span>Auteur : <b>' + esc(it.author) + '</b></span><span>Votes : <b>' + it.votes + '</b></span><span>Cagnotte : <b>' + fmtN(d.pot || 0) + ' 🪙</b></span>';
      var t = p.querySelector('.tbl-tools'), h = '';
      if (!view.podium) {
        if (it.mine) h += '<button disabled>Ton propre tableau</button>';
        else if (d.myVote === it.id) h += '<button class="on" data-a="unvote"' + (busy ? ' disabled' : '') + '>❤️ Ton vote — retirer</button>';
        else h += '<button class="go" data-a="vote"' + (busy ? ' disabled' : '') + '>❤️ Voter pour ce tableau' + (d.myVote ? ' (change ton vote)' : '') + '</button>';
        if (staff) h += '<button data-a="remove"' + (busy ? ' disabled' : '') + '>🗑️ Retirer (staff)</button>';
        h += '<button data-a="back">📋 Tous les tableaux</button>';
      }
      t.innerHTML = h;
    }
    function doVote(id) {
      if (busy || needLogin()) return;
      busy = true; refreshView(); msg('…', true);
      call({ action: 'vote', id: id }).then(function (r) {
        busy = false;
        if (r && r.ok) { applyState(r); msg(id ? '❤️ Vote enregistré !' : 'Vote retiré.', true); } else { msg('❌ ' + ((r && r.error) || 'Vote impossible.')); refreshView(); }
      });
    }
    function doRemove(id) {
      if (busy || !window.confirm('Retirer ce tableau ? L\'auteur est remboursé.')) return;
      busy = true; refreshView();
      call({ action: 'remove', id: id }).then(function (r) {
        busy = false;
        if (r && r.ok) { applyState(r); openGallery(); } else { msg('❌ ' + ((r && r.error) || 'Impossible.')); refreshView(); }
      });
    }

    /* ----- liste de tous les tableaux de la semaine ----- */
    function openGallery() {
      gallery = true; view = null; editor = null;
      var p = open('<div class="tbl-head"><h3>📋 Tous les tableaux de la semaine</h3><button data-a="close">✕ Fermer</button></div><div class="tbl-info"></div><div class="tbl-msg"></div><div class="tbl-grid"></div>', true);
      p.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-a]') : null;
        if (b && b.getAttribute('data-a') === 'close') return closeAll();
        var c = e.target.closest ? e.target.closest('[data-id]') : null; if (c) openViewer(itemById(c.getAttribute('data-id')));
      });
      renderGallery();
    }
    function renderGallery() {
      if (!overlay || !gallery) return;
      var p = overlay.firstChild, d = data;
      if (!d) { p.querySelector('.tbl-grid').innerHTML = '<div>Chargement…</div>'; return; }
      p.querySelector('.tbl-info').innerHTML = '<span>Cagnotte : <b>' + fmtN(d.pot) + ' 🪙</b></span><span>Fin dans <b>' + timeLeft(d.endsAt - (Date.now() + skew)) + '</b></span><span>' + d.items.length + ' tableau' + (d.items.length > 1 ? 'x' : '') + '</span>' + (d.myVote ? '<span>❤️ Tu as déjà voté</span>' : '<span>Tu n\'as pas encore voté</span>');
      p.querySelector('.tbl-grid').innerHTML = d.items.map(function (it) {
        return '<div class="tbl-card' + (it.mine ? ' mine' : '') + (d.myVote === it.id ? ' vote' : '') + '" data-id="' + esc(it.id) + '"><img loading="lazy" src="' + imgUrl(it.id) + '" alt="">' +
          '<b>' + esc(it.title) + '</b><span>' + esc(it.author) + ' · ' + (d.myVote === it.id ? '❤️' : '♥') + ' ' + it.votes + '</span></div>';
      }).join('') || '<div>Aucun tableau pour l\'instant : sois le premier à peindre !</div>';
    }

    /* ----- chevalet : l'éditeur de dessin ----- */
    var COLORS = ['#000000', '#5a5a5a', '#ffffff', '#8a5a30', '#ff3b3b', '#ff8a2a', '#ffd24a', '#7ed957', '#1f9d55', '#35d4ff', '#2a6bff', '#7a3cff', '#ff4fa3', '#ffb3c7', '#b7e4ff', '#f4d9a8'];
    function openEditor() {
      if (needLogin()) return;
      gallery = false; view = null;
      var d = data, price = d ? d.price : 100;
      var mineCount = d ? d.items.filter(function (x) { return x.mine; }).length : 0, left = d ? d.maxPerPlayer - mineCount : 3;
      var p = open('<div class="tbl-head"><h3>🎨 Nouveau tableau — ' + price + ' 🪙</h3><button data-a="close">✕ Fermer</button></div>' +
        '<div class="tbl-tools"><input type="text" data-r="title" maxlength="30" placeholder="Titre de ton tableau"><button class="go" data-a="send">🖼️ Accrocher (' + price + ' 🪙)</button></div><div class="tbl-msg"></div>' +
        '<canvas class="tbl-cv" width="' + CW + '" height="' + CH + '"></canvas>' +
        '<div class="tbl-tools" data-r="colors">' + COLORS.map(function (c, i) { return '<button class="tbl-sw' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') + '<input type="color" data-r="custom" value="#ff3b3b" title="Autre couleur"></div>' +
        '<div class="tbl-tools"><button data-t="brush" class="on">🖌️ Pinceau</button><button data-t="fill">🪣 Remplir</button><button data-t="eraser">🧽 Gomme</button>' +
        '<button data-s="3">·</button><button data-s="8" class="on">●</button><button data-s="18">⬤</button><button data-s="36">⬤⬤</button>' +
        '<button data-a="undo">↩️ Annuler</button><button data-a="clear">🗑️ Tout effacer</button></div>' +
        '<div class="tbl-info"><span>Ton solde : <b data-r="bal">' + fmtN(balance()) + ' 🪙</b></span><span>Il te reste <b>' + Math.max(0, left) + '</b> tableau' + (left > 1 ? 'x' : '') + ' cette semaine</span></div>');
      var cv = p.querySelector('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, CW, CH); cx.lineCap = 'round'; cx.lineJoin = 'round';
      var E = editor = { color: '#000000', size: 8, tool: 'brush', undo: [], drawing: false, lx: 0, ly: 0 };
      function snap() { try { E.undo.push(cx.getImageData(0, 0, CW, CH)); if (E.undo.length > 25) E.undo.shift(); } catch (e) { /* ok */ } }
      function pos(ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * CW / r.width, (ev.clientY - r.top) * CH / r.height]; }
      function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      function floodFill(x, y, col) {
        x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= CW || y >= CH) return;
        var img = cx.getImageData(0, 0, CW, CH), dd = img.data, i0 = (y * CW + x) * 4, t = [dd[i0], dd[i0 + 1], dd[i0 + 2]], c = hex2rgb(col);
        if (Math.abs(t[0] - c[0]) + Math.abs(t[1] - c[1]) + Math.abs(t[2] - c[2]) < 6) return;
        function match(i) { return Math.abs(dd[i] - t[0]) + Math.abs(dd[i + 1] - t[1]) + Math.abs(dd[i + 2] - t[2]) < 90; }   // tolérance : le bord adouci du trait se remplit aussi
        var stack = [x, y];
        while (stack.length) {
          var yy = stack.pop(), xx = stack.pop(), i = (yy * CW + xx) * 4;
          if (xx < 0 || yy < 0 || xx >= CW || yy >= CH || !match(i)) continue;
          dd[i] = c[0]; dd[i + 1] = c[1]; dd[i + 2] = c[2]; dd[i + 3] = 255;
          stack.push(xx + 1, yy, xx - 1, yy, xx, yy + 1, xx, yy - 1);
        }
        cx.putImageData(img, 0, 0);
      }
      cv.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); var q = pos(ev); snap();
        if (E.tool === 'fill') { floodFill(q[0], q[1], E.color); return; }
        E.drawing = true; E.lx = q[0]; E.ly = q[1]; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
        cx.strokeStyle = E.tool === 'eraser' ? '#ffffff' : E.color; cx.lineWidth = E.size; cx.beginPath(); cx.moveTo(q[0], q[1]); cx.lineTo(q[0] + 0.01, q[1]); cx.stroke();
      });
      cv.addEventListener('pointermove', function (ev) {
        if (!E.drawing) return; ev.preventDefault(); var q = pos(ev);
        cx.beginPath(); cx.moveTo(E.lx, E.ly); cx.lineTo(q[0], q[1]); cx.stroke(); E.lx = q[0]; E.ly = q[1];
      });
      var stop = function () { E.drawing = false; };
      cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop); cv.addEventListener('pointerleave', stop);
      function setOn(sel, el) { [].forEach.call(p.querySelectorAll(sel), function (b) { b.classList.toggle('on', b === el); }); }
      p.querySelector('[data-r=custom]').addEventListener('input', function (ev) { E.color = ev.target.value; if (E.tool === 'eraser') { E.tool = 'brush'; setOn('[data-t]', p.querySelector('[data-t=brush]')); } setOn('.tbl-sw', null); });
      p.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('button') : null; if (!b || b.disabled) return;
        if (b.hasAttribute('data-c')) { E.color = b.getAttribute('data-c'); if (E.tool === 'eraser') { E.tool = 'brush'; setOn('[data-t]', p.querySelector('[data-t=brush]')); } setOn('.tbl-sw', b); return; }
        if (b.hasAttribute('data-t')) { E.tool = b.getAttribute('data-t'); setOn('[data-t]', b); return; }
        if (b.hasAttribute('data-s')) { E.size = +b.getAttribute('data-s'); setOn('[data-s]', b); return; }
        var a = b.getAttribute('data-a');
        if (a === 'close') { if (!E.undo.length || window.confirm('Fermer sans accrocher ton tableau ?')) closeAll(); }
        else if (a === 'undo') { var s = E.undo.pop(); if (s) cx.putImageData(s, 0, 0); }
        else if (a === 'clear') { snap(); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, CW, CH); }
        else if (a === 'send') send(p, cv, E);
      });
    }
    function exportJpeg(cv) {
      var q = 0.86, url = cv.toDataURL('image/jpeg', q);
      while (url.length > 140000 && q > 0.4) { q -= 0.1; url = cv.toDataURL('image/jpeg', q); }
      return url;
    }
    function send(p, cv, E) {
      if (busy || needLogin()) return;
      var title = (p.querySelector('[data-r=title]').value || '').trim();
      if (!title) { msg('✏️ Donne un titre à ton tableau.'); return; }
      if (!E.undo.length) { msg('🖌️ Ton tableau est encore vide !'); return; }
      var price = data ? data.price : 100;
      if (balance() < price) { msg('❌ Il te manque ' + fmtN(price - balance()) + ' 🪙.'); return; }
      busy = true; p.querySelector('[data-a=send]').disabled = true; msg('Accrochage en cours…', true);
      call({ action: 'create', title: title, img: exportJpeg(cv) }).then(function (r) {
        busy = false;
        if (r && r.ok) {
          setBalance(r.balance); applyState(r); closeAll();
          try { world.flash('🎨 Ton tableau est accroché !', 'Bonne chance pour le podium'); } catch (e) { /* ok */ }
        } else {
          var b = p.querySelector('[data-a=send]'); if (b) b.disabled = false;
          msg('❌ ' + ((r && r.error) || 'Impossible d\'accrocher le tableau.'));
        }
      });
    }

    /* ---------- porte de sortie, apparition, aide ---------- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un cadre pour voter · chevalet : peindre' : 'ZQSD / flèches : marcher · F ou clic : voter / peindre · chevalet à gauche, liste des tableaux à droite' + (w.full ? ' · Échap : quitter' : ''); };
    room.dispose = function () { closeAll(true); if (pollT) clearInterval(pollT); };
    return room;
  }

  F.registerRoom('dessin', createRoom);
})();
