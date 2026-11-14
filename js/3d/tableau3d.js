/* =====================================================================
   tableau3d.js — La galerie « TABLEAU DESSIN » du salon des mini jeux (monde 3D)
   ---------------------------------------------------------------------
   Chaque semaine : on paie 100 🪙 au chevalet pour peindre un tableau, il est accroché au mur ; tout le monde peut voter pour son préféré
   (un vote par semaine, pas pour soi) ; le lundi à minuit (heure de Paris) la cagnotte entière est partagée entre les auteurs des trois
   tableaux les plus votés, qui montent alors sur le podium du mur du fond.
   TOUT est décidé par le serveur (api/tableaux.js : paiement, votes, classement, partage) ; ici on ne fait que dessiner et demander.
   Salle : mur de gauche et mur de droite = 12 cadres chacun (les mieux votés d'abord), chacun avec son cœur pour voter d'un clic ;
           mur du fond = podium de la semaine passée (contre le mur), un seul chevalet au milieu (un peintre à la fois, ouvert à tous), panneau du concours près de la porte.
   Quand quelqu'un peint, son personnage se place devant le chevalet et fait le geste de peindre chez tous les autres (message « paint »).
   Fichiers liés : api/tableaux.js, minijeux3d.js (la porte « TABLEAU DESSIN »), world3d.js.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, EMOJI = F.EMOJI_FONT, TAU = F.TAU, fmtN = F.fmtN;
  var HX = 14, HZ = 11, H = 6.4;
  var API = '/api/tableaux';
  var CW = 480, CH = 360;                 // taille d'un tableau (pixels)
  var COLS_Z = [-8.5, -5.1, -1.7, 1.7, 5.1, 8.5], ROWS_Y = [1.35, 3.35], FW = 1.75, FH = 1.3125;

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
    s.textContent += EDCSS;
    document.head.appendChild(s);
  }

  // éditeur de dessin : outils à gauche, couleurs à droite, toile au centre (le plus grand possible, sur téléphone en paysage aussi)
  var EDCSS = `
.tbl.ed{z-index:60;padding:8px}
.tbl-panel.ed{width:min(100%,1240px);height:100%;max-height:100%;overflow:hidden;gap:8px;padding:10px}
.tbl-panel.ed .tbl-head{gap:8px;flex-wrap:wrap}.tbl-panel.ed .tbl-head h3{flex:none;font-size:17px}
.tbl-panel.ed .tbl-head input[type=text]{flex:1;min-width:140px;max-width:420px}
.tbl-ed{flex:1;min-height:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px}
.tbl-side{display:flex;flex-direction:column;gap:6px;overflow-y:auto;overflow-x:hidden;min-height:0}
.tbl-side h4{margin:4px 0 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c9a227;font-weight:800}
.tbl-side button{min-height:40px;white-space:nowrap}
.tbl-side .row{display:flex;gap:4px}.tbl-side .row button{flex:1;padding:6px 4px}.tbl-panel.ed .tbl-msg{min-height:16px}
.tbl-pal{display:grid;grid-template-columns:repeat(4,38px);gap:7px}
.tbl-pal .tbl-sw{width:38px;height:38px}
.tbl-mid{display:flex;flex-direction:column;gap:6px;min-height:0;min-width:0}
.tbl-cvw{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.tbl-panel.ed .tbl-cv{max-width:none;margin:0;aspect-ratio:auto}
.tbl-side .tbl-info{flex-direction:column;gap:2px;font-size:12px}
@media (max-width:700px){
  .tbl-panel.ed{overflow:auto}
  .tbl-ed{grid-template-columns:1fr;grid-template-rows:auto auto auto}
  .tbl-cvw{flex:none;aspect-ratio:4/3;width:100%}
  .tbl-side{flex-direction:row;flex-wrap:wrap;overflow:visible}
  .tbl-side h4{width:100%}
  .tbl-pal{grid-template-columns:repeat(8,1fr);width:100%}.tbl-pal .tbl-sw{width:100%;height:34px;border-radius:10px}
  .tbl-side.L{order:2}.tbl-side.R{order:3}.tbl-mid{order:1}
}
@media (max-height:520px){.tbl.ed{padding:4px}.tbl-panel.ed{padding:8px;gap:5px}.tbl-side{gap:4px}.tbl-side h4{margin:2px 0 0;font-size:11px}.tbl-side button{min-height:34px;padding:4px 10px}.tbl-panel.ed .tbl-head button{min-height:36px}.tbl-panel.ed .tbl-head h3{display:none}.tbl-pal{grid-template-columns:repeat(4,34px)}.tbl-pal .tbl-sw{width:34px;height:34px}}
`;

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
    // murs de luxe : vert émeraude profond, losanges dorés très discrets
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'); wx.fillStyle = '#0d4034'; wx.fillRect(0, 0, 256, 256);
    var wgr = wx.createLinearGradient(0, 0, 0, 256); wgr.addColorStop(0, 'rgba(255,255,255,0.05)'); wgr.addColorStop(1, 'rgba(0,0,0,0.12)'); wx.fillStyle = wgr; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(214,176,70,0.2)'; wx.lineWidth = 2;
    for (var wi = -1; wi < 3; wi++) { wx.beginPath(); wx.moveTo(wi * 128, 0); wx.lineTo(wi * 128 + 256, 256); wx.moveTo(wi * 128 + 256, 0); wx.lineTo(wi * 128, 256); wx.stroke(); }
    wx.fillStyle = 'rgba(214,176,70,0.3)'; [[0, 128], [128, 0], [128, 256], [256, 128]].forEach(function (d) { wx.beginPath(); wx.arc(d[0], d[1], 4, 0, TAU); wx.fill(); });
    var wTex = mkTex(wc); wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.anisotropy = 8;
    function wall(len, px, pz, ry) {
      var tx = wTex.clone(); tx.needsUpdate = true; tx.repeat.set(len / 3, H / 3);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.75, metalness: 0.08 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m);
    }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x120a1c })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* ---------- plafond : voile de guirlandes de LED et boule lumineuse (même style que le salon du Blind Test) ---------- */
    var ledTex = (function () {
      var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.38, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c);
    })();
    var ledRows = [], ledWire = new THREE.MeshBasicMaterial({ color: 0x2a1a30 }), ledStep = low ? 0.2 : 0.1;
    function ledString(pts, dir) {
      var curve = new THREE.CatmullRomCurve3(pts), cnt = Math.round(curve.getLength() / ledStep), pos = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), geo = new THREE.BufferGeometry(), k, v;
      for (k = 0; k < cnt; k++) { v = curve.getPoint(k / cnt); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      var pt = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.36, map: ledTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pt.frustumCulled = false; g.add(pt);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.008, 4, false), ledWire));
      ledRows.push({ geo: geo, col: col, cnt: cnt, dir: dir });
    }
    function swag(x0, z0, x1, z1, y0, y1, sag, dir) {
      var pts = [], k, n = 14, f;
      for (k = 0; k <= n; k++) { f = k / n; pts.push(new THREE.Vector3(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - sag * Math.sin(Math.PI * f), z0 + (z1 - z0) * f)); }
      ledString(pts, dir);
    }
    (function () {
      var i, a0, hubY = H - 0.4, ex, ez, tt;
      for (i = 0; i < 32; i++) {                                 // éventail depuis le centre jusqu'aux murs
        a0 = i / 32 * TAU; tt = Math.min((HX - 0.4) / Math.abs(Math.cos(a0) || 1e-6), (HZ - 0.4) / Math.abs(Math.sin(a0) || 1e-6));
        ex = Math.cos(a0) * tt; ez = Math.sin(a0) * tt;
        swag(Math.cos(a0) * 0.34, Math.sin(a0) * 0.34, ex, ez, hubY, H - 0.12, 0.6 + (i % 2) * 0.4, i % 2 ? -1 : 1);
      }
      // liseré lumineux tout autour du plafond, juste sous la corniche dorée
      var cy = H - 0.28, px0 = HX - 0.35, pz0 = HZ - 0.35, edge = [[-px0, -pz0, px0, -pz0], [px0, -pz0, px0, pz0], [px0, pz0, -px0, pz0], [-px0, pz0, -px0, -pz0]];
      edge.forEach(function (e, n) { var pts = [], q; for (q = 0; q <= 12; q++) pts.push(new THREE.Vector3(e[0] + (e[2] - e[0]) * q / 12, cy, e[1] + (e[3] - e[1]) * q / 12)); ledString(pts, n % 2 ? -1 : 1); });
      for (i = -3; i <= 3; i++) {                                // guirlandes dans l'autre sens aussi : le plafond est un vrai voile de lumière
        for (var s2 = 0; s2 < 4; s2++) swag(i * 3.6, -HZ + 0.4 + s2 * (HZ * 2 - 0.8) / 4, i * 3.6, -HZ + 0.4 + (s2 + 1) * (HZ * 2 - 0.8) / 4, H - 0.12, H - 0.12, 0.45, (i + s2) % 2 ? 1 : -1);
      }
      for (i = -3; i <= 3; i++) { for (var s = 0; s < 4; s++) swag(-HX + 0.4 + s * (HX * 2 - 0.8) / 4, i * 3, -HX + 0.4 + (s + 1) * (HX * 2 - 0.8) / 4, i * 3, H - 0.12, H - 0.12, 0.5, (i + s) % 2 ? -1 : 1); }
      var shell = new THREE.Mesh(new THREE.SphereGeometry(0.33, 28, 20), new THREE.MeshBasicMaterial({ color: 0x120a18 })); shell.position.set(0, hubY, 0); g.add(shell);
      var nb = low ? 130 : 260, bp = new Float32Array(nb * 3), bc2 = new Float32Array(nb * 3), bg = new THREE.BufferGeometry(), ga = Math.PI * (3 - Math.sqrt(5)), yy, rr2;
      for (i = 0; i < nb; i++) { yy = 1 - 2 * (i + 0.5) / nb; rr2 = Math.sqrt(1 - yy * yy); bp[i * 3] = Math.cos(ga * i) * rr2 * 0.345; bp[i * 3 + 1] = hubY + yy * 0.345; bp[i * 3 + 2] = Math.sin(ga * i) * rr2 * 0.345; }
      bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bg.setAttribute('color', new THREE.BufferAttribute(bc2, 3).setUsage(THREE.DynamicDrawUsage));
      var ballPts = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.2, map: ledTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); ballPts.frustumCulled = false; g.add(ballPts);
      ledRows.push({ geo: bg, col: bc2, cnt: nb, dir: 1 });
      var halo = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, hubY, 0]), 3)), new THREE.PointsMaterial({ size: 4.2, map: ledTex, color: 0xffb84c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); halo.frustumCulled = false; g.add(halo);
    })();
    var ledC = new THREE.Color(), ledT = 0;
    var ceilLights = [];                                        // vraies lumières colorées sous le plafond : elles suivent le défilé des guirlandes et éclairent murs et tableaux
    function ledsUpdate(dt) {                                    // défilé de couleurs sur les guirlandes : du rose à l'or
      ledT += dt;
      ledRows.forEach(function (row) {
        var k, wv, v, hue;
        for (k = 0; k < row.cnt; k++) {
          wv = 0.5 + 0.5 * Math.sin(k / row.cnt * TAU * 7 - ledT * 5 * row.dir); v = 0.45 + 0.9 * wv * wv;
          hue = (0.92 + 0.22 * (0.5 + 0.5 * Math.sin(k / row.cnt * TAU + ledT * 0.4))) % 1;
          ledC.setHSL(hue, 0.85, 0.6);
          row.col[k * 3] = ledC.r * v; row.col[k * 3 + 1] = ledC.g * v; row.col[k * 3 + 2] = ledC.b * v;
        }
        row.geo.attributes.color.needsUpdate = true;
      });
      ceilLights.forEach(function (l, n) { l.color.setHSL((0.92 + 0.22 * (0.5 + 0.5 * Math.sin(ledT * 0.5 + n * 1.7))) % 1, 0.85, 0.6); });
    }
    var goldM = std(0xc9a227, 0.35, 0.7, 0x2a1d00);
    [[HX * 2, 0.15, 0.15, 0, H - 0.08, -HZ + 0.08], [HX * 2, 0.15, 0.15, 0, H - 0.08, HZ - 0.08], [0.15, 0.15, HZ * 2, -HX + 0.08, H - 0.08, 0], [0.15, 0.15, HZ * 2, HX - 0.08, H - 0.08, 0],
      [HX * 2, 0.12, 0.1, 0, 0.06, -HZ + 0.05], [HX * 2, 0.12, 0.1, 0, 0.06, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 0.06, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 0.06, 0]].forEach(function (b) { box(g, b[0], b[1], b[2], goldM, b[3], b[4], b[5]); });
    g.add(new THREE.AmbientLight(0xf4eaf4, 1.35));
    if (!low) { [[-8, H - 1.2, -4], [8, H - 1.2, -4], [-8, H - 1.2, 5], [8, H - 1.2, 5], [0, H - 1.2, 0]].forEach(function (q) { var l = new THREE.PointLight(0xff8ac0, 0.9, 17); l.position.set(q[0], q[1], q[2]); g.add(l); ceilLights.push(l); }); }

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
      var hc = mkCanvas(128, 128), hctx = hc.getContext('2d'), htex = mkTex(hc);
      var heart = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: htex, transparent: true })); heart.position.set(w / 2 - 0.02, h / 2 - 0.02, 0.16); grp.add(heart);
      var hhit = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ visible: false })); hhit.position.set(w / 2 - 0.02, h / 2 - 0.02, 0.17); grp.add(hhit);
      var nx = Math.sin(ry), nz = Math.cos(ry);
      return { hctx: hctx, htex: htex, hhit: hhit, grp: grp, mat: mat, plane: plane, hit: hit, pc: pc, pctx: pctx, ptex: ptex, w: pw, sx: x + nx * 2.2, sz: z + nz * 2.2, item: null, sig: '', font: plaqueFont || 34 };
    }
    function paintPlaque(f, l1, l2, l3) {
      var c = f.pctx, W = f.pc.width, Hh = f.pc.height;
      c.fillStyle = '#120c08'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#c9a227'; c.lineWidth = 3; c.strokeRect(2, 2, W - 4, Hh - 4);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffe9a8'; c.font = '800 ' + Math.round(Hh * 0.42) + 'px ' + SERIF; c.fillText(ellipsize(c, l1, W - 24), W / 2, Hh * 0.3);
      c.fillStyle = '#cdbf94'; c.font = '600 ' + Math.round(Hh * 0.3) + 'px ' + SERIF + ',' + EMOJI; c.fillText(ellipsize(c, l2, W - 24), W / 2, Hh * 0.72);
      f.ptex.needsUpdate = true;
    }
    // le cœur du cadre : rouge et plein si c'est mon vote, creux sinon ; le chiffre est le nombre de votes
    function paintHeart(f, votes, mine, show) {
      var c = f.hctx; c.clearRect(0, 0, 128, 128); if (!show) { f.htex.needsUpdate = true; return; }
      c.beginPath(); c.moveTo(64, 112); c.bezierCurveTo(8, 72, 6, 22, 40, 20); c.bezierCurveTo(56, 19, 64, 32, 64, 40); c.bezierCurveTo(64, 32, 72, 19, 88, 20); c.bezierCurveTo(122, 22, 120, 72, 64, 112); c.closePath();
      c.fillStyle = mine ? '#ff3b5c' : 'rgba(20,12,24,0.88)'; c.fill(); c.lineWidth = 6; c.strokeStyle = mine ? '#ffd0d8' : '#ffe08a'; c.stroke();
      c.fillStyle = '#fff'; c.font = '900 ' + (votes > 99 ? 34 : 44) + 'px ' + SERIF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(votes), 64, 54); f.htex.needsUpdate = true;
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
      { rank: 1, x: 0, y: 3.4, w: 2.6, h: 1.95, col: '#ffd24a', name: 'OR' },
      { rank: 2, x: -4.2, y: 3.0, w: 2.0, h: 1.5, col: '#d7dde6', name: 'ARGENT' },
      { rank: 3, x: 4.2, y: 2.8, w: 2.0, h: 1.5, col: '#d58a4a', name: 'BRONZE' }
    ];
    PODS.forEach(function (p) {
      p.f = makeFrame(p.x, p.y, -HZ + 0.03, 0, p.w, p.h);
      // affiche à plat sur le mur, sous le cartel : seulement le numéro de la place dans un cercle (plus de bloc posé au sol)
      var pc = mkCanvas(256, 256), px = pc.getContext('2d'), pgr = px.createRadialGradient(100, 90, 20, 128, 128, 120);
      pgr.addColorStop(0, '#ffffff'); pgr.addColorStop(0.25, p.col); pgr.addColorStop(1, 'rgba(60,40,10,1)');
      px.beginPath(); px.arc(128, 128, 118, 0, TAU); px.fillStyle = pgr; px.fill(); px.lineWidth = 10; px.strokeStyle = '#2a1c00'; px.stroke();
      px.beginPath(); px.arc(128, 128, 98, 0, TAU); px.lineWidth = 4; px.strokeStyle = 'rgba(42,28,0,0.55)'; px.stroke();
      px.fillStyle = '#2a1c00'; px.font = '900 150px ' + SERIF; px.textAlign = 'center'; px.textBaseline = 'middle'; px.fillText(String(p.rank), 128, 138);
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), new THREE.MeshBasicMaterial({ map: mkTex(pc), transparent: true })); pm.position.set(p.x, p.y - p.h / 2 - 1.08, -HZ + 0.03); g.add(pm);
      paintPlaque(p.f, p.name, 'à venir…'); paintHeart(p.f, 0, false, false); p.f.hhit.visible = false;
    });
    var titleC = mkCanvas(1024, 96), titleX = titleC.getContext('2d'), titleT = mkTex(titleC);
    var titleM = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.46), new THREE.MeshBasicMaterial({ map: titleT, transparent: true })); titleM.position.set(0, 4.95, -HZ + 0.04); g.add(titleM);
    function paintTitle(txt) {
      titleX.clearRect(0, 0, 1024, 96); titleX.textAlign = 'center'; titleX.textBaseline = 'middle'; titleX.shadowColor = '#ffd24a'; titleX.shadowBlur = 16;
      titleX.fillStyle = '#ffe08a'; titleX.font = '900 58px ' + SERIF + ',' + EMOJI; titleX.fillText(txt, 512, 50, 990); titleT.needsUpdate = true;
    }
    paintTitle('🏆 PODIUM DE LA SEMAINE PASSÉE');

    /* ---------- panneau d'information (mur de l'entrée, à gauche de la porte) ---------- */
    var infoC = mkCanvas(2048, 1280), infoX = infoC.getContext('2d'), infoT = mkTex(infoC); infoT.anisotropy = 8;
    var INFO_X = -6.5, INFO_W = 4.8, INFO_H = INFO_W * 0.625;
    var infoM = new THREE.Mesh(new THREE.PlaneGeometry(INFO_W, INFO_H), new THREE.MeshBasicMaterial({ map: infoT })); infoM.position.set(INFO_X, 2.55, HZ - 0.07); infoM.rotation.y = Math.PI; g.add(infoM);   // une seule face, tournée vers la salle
    box(g, INFO_W + 0.3, INFO_H + 0.3, 0.04, std(0x120c08, 0.8, 0.1), INFO_X, 2.55, HZ - 0.02);                      // fond derrière le panneau (jamais au même endroit : plus de moiré)
    [[INFO_W + 0.3, 0.12, 0, INFO_H / 2 + 0.15], [INFO_W + 0.3, 0.12, 0, -INFO_H / 2 - 0.15], [0.12, INFO_H + 0.3, INFO_W / 2 + 0.15, 0], [0.12, INFO_H + 0.3, -INFO_W / 2 - 0.15, 0]].forEach(function (b) { box(g, b[0], b[1], 0.08, goldM, INFO_X + b[2], 2.55 + b[3], HZ - 0.05); });
    var data = null, skew = 0;
    function paintInfo() {
      var c = infoX, W = 1024, Hh = 640; c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = '#0c0a12'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#4ad0ff'; c.lineWidth = 8; c.strokeRect(14, 14, W - 28, Hh - 28);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#4ad0ff'; c.font = '900 60px ' + SERIF + ',' + EMOJI; c.fillText('🎨 CONCOURS DE LA SEMAINE', W / 2, 70, W - 60);
      c.fillStyle = '#ffe08a'; c.shadowColor = '#ffd24a'; c.shadowBlur = 24; c.font = '900 118px ' + MONO + ',' + EMOJI; c.fillText(data ? fmtN(data.pot) + ' 🪙' : '…', W / 2, 190, W - 60); c.shadowBlur = 0;
      c.fillStyle = '#cdbf94'; c.font = '700 40px ' + SERIF; c.fillText('cagnotte à partager entre le top 3', W / 2, 265, W - 60);
      c.fillStyle = '#f4e3b0'; c.font = '800 46px ' + SERIF + ',' + EMOJI; c.fillText(data ? '⏳ Fin dans ' + timeLeft(data.endsAt - (Date.now() + skew)) : '⏳ …', W / 2, 335, W - 60);
      c.fillStyle = '#d9cfae'; c.font = '600 33px ' + SERIF;
      ['Tableaux : 300 · 800 · 1 500 🪙 (3 maximum par joueur)', 'Vote pour ton préféré (1 vote par semaine)', 'Lundi 00h00 : 1er 50 % · 2e 30 % · 3e 20 %', 'Tu retires ton tableau ? Tu récupères 90 %'].forEach(function (l, i) { c.fillText(l, W / 2, 410 + i * 52, W - 70); });
      infoT.needsUpdate = true;
    }
    paintInfo();

    /* ---------- le chevalet (un seul, pour tout le monde) : on se place devant, face à la toile, pour peindre ---------- */
    var EASELS = [{ x: 0, z: 1.0 }];
    var painters = {};                       // pseudo -> { n: numéro du chevalet, t: dernier signe de vie } (les autres joueurs en train de peindre)
    function easelBusy(n) { var now = performance.now(), me = F.me(); return Object.keys(painters).some(function (k) { return k !== me && painters[k].n === n && now - painters[k].t < 8000; }); }
    EASELS.forEach(function (E, n) {
      var wood = std(0x8a5a30, 0.75, 0.05), e = new THREE.Group(); e.position.set(E.x, 0, E.z); g.add(e);   // la toile regarde vers +z, le peintre est devant
      box(e, 0.07, 2.1, 0.07, wood, -0.55, 1.05, -0.2).rotation.z = 0.05; box(e, 0.07, 2.1, 0.07, wood, 0.55, 1.05, -0.2).rotation.z = -0.05; box(e, 0.07, 2.0, 0.07, wood, 0, 1.0, -0.6).rotation.x = -0.18;
      box(e, 1.25, 0.06, 0.1, wood, 0, 0.75, -0.15);
      var cv = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.825), new THREE.MeshBasicMaterial({ color: 0xf6f1e4, side: THREE.DoubleSide }));   // toile visible des deux côtés
      cv.position.set(0, 1.4, -0.13); cv.rotation.x = -0.08; e.add(cv);
      [0xff4a4a, 0x4ab0ff, 0xffd24a, 0x4aff9a, 0xc04aff, 0xff8a2a].forEach(function (col, i) { var dot = new THREE.Mesh(new THREE.CircleGeometry(0.06 + (i % 3) * 0.015, 12), new THREE.MeshBasicMaterial({ color: col })); dot.position.set(-0.4 + (i % 3) * 0.4, 1.2 + Math.floor(i / 3) * 0.45, -0.12); dot.rotation.x = -0.08; e.add(dot); });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(E.x, 1.1, E.z); g.add(hit);
      room.colliders.push({ x: E.x, z: E.z - 0.1, r: 0.7 });
      E.sx = E.x; E.sz = E.z + 1.5;          // où se tient le peintre
      room.interactables.push({ hit: hit, x: E.sx, z: E.sz, radius: 2.2,
        enabled: function () { return !easelBusy(n); },
        prompt: function () { return data && !data.price ? '🎨 Tu as déjà tes 3 tableaux (retire-en un pour peindre)' : '🎨 Peindre un tableau (chevalet libre) — ' + fmtN(data ? data.price : 300) + ' 🪙'; },
        use: function () { if (!easelBusy(n)) openEditor(n); } });
    });

    /* ---------- les cadres sont cliquables ---------- */
    slots.forEach(function (f, i) {
      room.interactables.push({ hit: f.hit, x: f.sx, z: f.sz, radius: 2.0,
        enabled: function () { return !!f.item; },
        prompt: function () { return '🖼️ « ' + f.item.title + ' » — voir et voter'; },
        use: function () { openViewer(f.item); } });
      void i;
    });
    slots.forEach(function (f) {
      room.interactables.push({ hit: f.hhit, use: function () { quickVote(f.item); } });   // clic sur le cœur (pas de touche F : c'est le cadre qui répond à F)
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
        if (it) { paintPlaque(f, it.title, 'par ' + it.author + (it.mine ? ' (toi)' : '')); paintHeart(f, it.votes, d.myVote === it.id, true); }
        else { paintPlaque(f, 'Emplacement libre', '🖼️ peins le prochain tableau !'); paintHeart(f, 0, false, false); }
      });
      var pod = d.podium;
      PODS.forEach(function (p, i) {
        var e = pod && pod.entries ? pod.entries[i] : null, sig = e ? [e.id, e.votes, e.prize].join('|') : (pod && pod.refunded ? 'ref' : '');
        if (sig === p.f.sig) return;
        var changed = !p.f.item || !e || p.f.item.id !== e.id;
        p.f.sig = sig; p.f.item = e;
        if (changed) setImage(p.f, e && e.id);
        if (e) { paintPlaque(p.f, e.title, e.author + ' · +' + fmtN(e.prize) + ' 🪙'); paintHeart(p.f, e.votes, false, true); }
        else { paintPlaque(p.f, p.name, pod && pod.refunded ? 'aucun vote : remboursés' : 'à venir…'); paintHeart(p.f, 0, false, false); }
      });
      paintTitle(pod ? '🏆 PODIUM — SEMAINE DU ' + pod.week.slice(8) + '/' + pod.week.slice(5, 7) : '🏆 PODIUM DE LA SEMAINE PASSÉE');
      paintInfo();
      if (view) refreshView();
    }
    var pollT = null;
    function poll() { fetchState().then(function (d) { if (d && d.ok) applyState(d); }); }
    room.onEnter = function () { poll(); if (!pollT) pollT = setInterval(function () { if (!document.hidden) poll(); }, 7000); };
    room.onLeave = function () { closeAll(true); painters = {}; if (pollT) { clearInterval(pollT); pollT = null; } };
    // les autres peintres : on reçoit « paint » (début, rappel, fin) et on anime leur personnage (world3d.js appelle remoteAnim)
    room.onRtMsg = function (ev, m) {
      if (ev !== 'paint' || !m || typeof m.k !== 'string') return;
      if (m.on) painters[m.k] = { n: Math.floor(Number(m.n)) || 0, t: performance.now() }; else delete painters[m.k];
    };
    room.remoteAnim = function (r, k) {
      var P = painters[k]; if (!P || performance.now() - P.t > 8000) return false;
      var pe = r.person, t = performance.now() / 1000;
      pe.hips[0].rotation.x = 0; pe.hips[1].rotation.x = 0;                       // debout, pas de pas de course
      pe.arms[0].rotation.x = -1.45 + Math.sin(t * 5.2) * 0.16; pe.arms[0].rotation.y = Math.sin(t * 2.4) * 0.32;   // la main qui peint : va-et-vient devant la toile
      pe.arms[1].rotation.x = -0.75; pe.arms[1].rotation.y = 0;                    // l'autre main tient la palette
      return true;
    };
    var paintT = 0;
    function sendPaint(on, n) { try { if (world.rt && world.rt.ready) world.rt.send('paint', { k: F.me(), on: on ? 1 : 0, n: n || 0 }); } catch (e) { /* ok */ } }
    room.onPause = function () { closeAll(true); };
    var infoTick = 0;
    room.update = function (dt) {
      ledsUpdate(dt);
      infoTick += dt; if (infoTick > 20) { infoTick = 0; paintInfo(); }
      if (editor) { paintT -= dt; if (paintT <= 0) { paintT = 2.5; sendPaint(true, editor.n); } }
    };

    /* ======================= fenêtres : visionneuse, liste, chevalet ======================= */
    var overlay = null, view = null, editor = null, busy = false;
    function lockWorld() { if (!overlay) world.sitDown(room); }
    function unlockWorld(instant) { world.mode = 'room'; if (instant) { world.blend = 0; world.seatRoom = null; } }
    function onEsc(e) { if (e.code === 'Escape' && overlay) { e.stopImmediatePropagation(); closeAll(); } }
    function closeAll(instant) {
      window.removeEventListener('keydown', onEsc, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var was = !!overlay; if (editor) { if (editor.save) editor.save(); if (editor.unfit) editor.unfit(); sendPaint(false, editor.n); } overlay = null; view = null; editor = null; busy = false;
      if (was) unlockWorld(instant);
    }
    function open(html, wide, ed) {
      injectCss(); lockWorld();
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = document.createElement('div'); overlay.className = 'tbl' + (ed ? ' ed' : '');
      overlay.innerHTML = '<div class="tbl-panel' + (wide ? ' wide' : '') + (ed ? ' ed' : '') + '">' + html + '</div>';
      overlay.addEventListener('click', function (e) { if (e.target === overlay && !editor) closeAll(); });   // un clic à côté de l'éditeur ne le ferme plus (dessin perdu)
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
        if (a === 'close') closeAll(); else if (a === 'vote') doVote(view.id); else if (a === 'unvote') doVote(''); else if (a === 'remove') doRemove(view.id); else if (a === 'withdraw') doWithdraw(view.id);
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
        if (it.mine) h += '<button disabled>Ton propre tableau</button><button data-a="withdraw"' + (busy ? ' disabled' : '') + '>🗑️ Retirer mon tableau (+' + fmtN(it.refund || 0) + ' 🪙 · ' + (d.refundPct || 90) + ' %)</button>';
        else if (d.myVote === it.id) h += '<button class="on" data-a="unvote"' + (busy ? ' disabled' : '') + '>❤️ Ton vote — retirer</button>';
        else h += '<button class="go" data-a="vote"' + (busy ? ' disabled' : '') + '>❤️ Voter pour ce tableau' + (d.myVote ? ' (change ton vote)' : '') + '</button>';
        if (staff) h += '<button data-a="remove"' + (busy ? ' disabled' : '') + '>🗑️ Retirer (staff)</button>';
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
    function doWithdraw(id) {
      var it = itemById(id); if (!it || busy) return;
      if (!window.confirm('Retirer « ' + it.title + ' » ?\nTu récupères ' + fmtN(it.refund || 0) + ' 🪙 (' + ((data && data.refundPct) || 90) + ' % de ce que tu as payé) ; le reste reste dans la cagnotte.')) return;
      busy = true; refreshView(); msg('…', true);
      call({ action: 'withdraw', id: id }).then(function (r) {
        busy = false;
        if (r && r.ok) { setBalance(r.balance); applyState(r); closeAll(); try { world.flash('🗑️ Tableau retiré', '+' + fmtN(r.refunded || 0) + ' 🪙 remboursés'); } catch (e) { /* ok */ } }
        else { msg('❌ ' + ((r && r.error) || 'Impossible de retirer ce tableau.')); refreshView(); }
      });
    }
    function doRemove(id) {
      if (busy || !window.confirm('Retirer ce tableau ? L\'auteur est remboursé.')) return;
      busy = true; refreshView();
      call({ action: 'remove', id: id }).then(function (r) {
        busy = false;
        if (r && r.ok) { applyState(r); closeAll(); } else { msg('❌ ' + ((r && r.error) || 'Impossible.')); refreshView(); }
      });
    }

    /* ----- chevalet : l'éditeur de dessin ----- */
    var COLORS = ['#000000', '#5a5a5a', '#ffffff', '#8a5a30', '#ff3b3b', '#ff8a2a', '#ffd24a', '#7ed957', '#1f9d55', '#35d4ff', '#2a6bff', '#7a3cff', '#ff4fa3', '#ffb3c7', '#b7e4ff', '#f4d9a8'];
    // vote direct sur le cœur d'un cadre : un clic = je vote pour ce tableau, un clic sur mon tableau déjà voté = je retire mon vote
    function quickVote(item) {
      if (!item || busy || overlay || needLogin()) return;
      if (item.mine) { try { world.flash('🚫 Pas de vote pour ton propre tableau'); } catch (e) { /* ok */ } return; }
      var id = data && data.myVote === item.id ? '' : item.id;
      busy = true;
      call({ action: 'vote', id: id }).then(function (r) {
        busy = false;
        if (r && r.ok) { applyState(r); try { world.flash(id ? '❤️ Vote pour « ' + item.title + ' »' : 'Vote retiré'); } catch (e) { /* ok */ } }
        else { try { world.flash('❌ ' + ((r && r.error) || 'Vote impossible')); } catch (e) { /* ok */ } }
      });
    }

    /* ----- brouillon : le dessin est gardé dans le navigateur (fenêtre fermée par erreur, onglet quitté, réseau coupé…) ----- */
    function draftKey() { return 'tbl_draft_' + (F.me() || 'x'); }
    function saveDraft(cv, title) { try { localStorage.setItem(draftKey(), JSON.stringify({ t: Date.now(), title: String(title || ''), img: cv.toDataURL('image/jpeg', 0.85) })); } catch (e) { /* ok */ } }
    function loadDraft() { try { var j = JSON.parse(localStorage.getItem(draftKey()) || 'null'); if (j && typeof j.img === 'string' && Date.now() - (j.t || 0) < 7 * 864e5) return j; } catch (e) { /* ok */ } return null; }
    function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) { /* ok */ } }

    function openEditor(n) {
      if (needLogin()) return;
      if (data && !data.price) { try { world.flash('🎨 Tu as déjà accroché ' + data.maxPerPlayer + ' tableaux cette semaine', 'Retire-en un pour en refaire un'); } catch (e) { /* ok */ } return; }
      // on se place devant le chevalet, face à la toile, immobile : les autres joueurs nous voient peindre (et non courir sur place)
      var Ez = EASELS[n] || EASELS[0];
      world.player.x = Ez.sx; world.player.z = Ez.sz; world.player.yaw = 0; world.player.pitch = -0.1; world.pv.x = 0; world.pv.z = 0;
      sendPaint(true, n); paintT = 2.5;
      view = null;
      var d = data, price = d ? d.price : 300;
      var mineCount = d ? d.items.filter(function (x) { return x.mine; }).length : 0, left = d ? d.maxPerPlayer - mineCount : 3;
      var p = open('<div class="tbl-head"><h3>🎨 Nouveau tableau</h3>' +
        '<input type="text" data-r="title" maxlength="30" placeholder="Titre de ton tableau">' +
        '<button class="go" data-a="send">🖼️ Accrocher (' + fmtN(price) + ' 🪙)</button><button data-a="close">✕ Fermer</button></div>' +
        '<div class="tbl-msg"></div>' +
        '<div class="tbl-ed">' +
          '<div class="tbl-side L">' +
            '<h4>Outils</h4><button data-t="brush" class="on">🖌️ Pinceau</button><button data-t="fill">🪣 Remplir</button><button data-t="eraser">🧽 Gomme</button>' +
            '<h4>Épaisseur du trait</h4><div class="row"><button data-s="3" title="Fin">·</button><button data-s="8" class="on" title="Moyen">●</button><button data-s="18" title="Gros">⬤</button><button data-s="36" title="Énorme">⬤⬤</button></div>' +
            '<h4>Actions</h4><button data-a="undo">↩️ Annuler</button><button data-a="clear">🗑️ Tout effacer</button>' +
          '</div>' +
          '<div class="tbl-mid"><div class="tbl-cvw"><canvas class="tbl-cv" width="' + CW + '" height="' + CH + '"></canvas></div></div>' +
          '<div class="tbl-side R">' +
            '<h4>Couleurs</h4><div class="tbl-pal">' + COLORS.map(function (c, i) { return '<button class="tbl-sw' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>' +
            '<div class="row" style="align-items:center"><input type="color" data-r="custom" value="#ff3b3b" title="Autre couleur"><span style="font-size:12px;color:#cdbf94">Autre couleur</span></div>' +
            '<div class="tbl-info"><span>Ton solde : <b data-r="bal">' + fmtN(balance()) + ' 🪙</b></span><span>Il te reste <b>' + Math.max(0, left) + '</b> tableau' + (left > 1 ? 'x' : '') + '</span></div>' +
          '</div>' +
        '</div>', false, true);
      var cv = p.querySelector('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      var cvw = p.querySelector('.tbl-cvw');
      function fit() {                                           // la toile prend toute la place du centre en gardant ses proportions 4/3
        var w = cvw.clientWidth, h = cvw.clientHeight; if (!w || !h) return;
        var k = Math.min(w / CW, h / CH); cv.style.width = Math.floor(CW * k) + 'px'; cv.style.height = Math.floor(CH * k) + 'px';
      }
      fit(); setTimeout(fit, 60); setTimeout(fit, 300);
      var ro = null; try { ro = new ResizeObserver(fit); ro.observe(cvw); } catch (er) { /* ok */ }
      window.addEventListener('resize', fit);
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, CW, CH); cx.lineCap = 'round'; cx.lineJoin = 'round';
      var E = editor = { n: n, color: '#000000', size: 8, tool: 'brush', undo: [], drawing: false, lx: 0, ly: 0, sent: false, rid: '' };
      var titleEl = p.querySelector('[data-r=title]');
      E.unfit = function () { window.removeEventListener('resize', fit); if (ro) { try { ro.disconnect(); } catch (er) { /* ok */ } } };
      E.save = function () { if (!E.sent && E.undo.length) saveDraft(cv, titleEl.value); };
      var dr = loadDraft();
      if (dr) {                                                  // on reprend là où on s'était arrêté
        var blank = cx.getImageData(0, 0, CW, CH), im = new Image();
        im.onload = function () { if (editor !== E) return; E.undo.push(blank); cx.drawImage(im, 0, 0, CW, CH); titleEl.value = dr.title || ''; msg('📝 Ton brouillon a été retrouvé : tu peux continuer.', true); };
        im.src = dr.img;
      }
      titleEl.addEventListener('input', function () { E.save(); });
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
        if (E.tool === 'fill') { floodFill(q[0], q[1], E.color); E.save(); return; }
        E.drawing = true; E.lx = q[0]; E.ly = q[1]; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
        cx.strokeStyle = E.tool === 'eraser' ? '#ffffff' : E.color; cx.lineWidth = E.size; cx.beginPath(); cx.moveTo(q[0], q[1]); cx.lineTo(q[0] + 0.01, q[1]); cx.stroke();
      });
      cv.addEventListener('pointermove', function (ev) {
        if (!E.drawing) return; ev.preventDefault(); var q = pos(ev);
        cx.beginPath(); cx.moveTo(E.lx, E.ly); cx.lineTo(q[0], q[1]); cx.stroke(); E.lx = q[0]; E.ly = q[1];
      });
      var stop = function () { var was = E.drawing; E.drawing = false; if (was) E.save(); };
      cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop); cv.addEventListener('pointerleave', stop);
      function setOn(sel, el) { [].forEach.call(p.querySelectorAll(sel), function (b) { b.classList.toggle('on', b === el); }); }
      p.querySelector('[data-r=custom]').addEventListener('input', function (ev) { E.color = ev.target.value; if (E.tool === 'eraser') { E.tool = 'brush'; setOn('[data-t]', p.querySelector('[data-t=brush]')); } setOn('.tbl-sw', null); });
      p.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('button') : null; if (!b || b.disabled) return;
        if (b.hasAttribute('data-c')) { E.color = b.getAttribute('data-c'); if (E.tool === 'eraser') { E.tool = 'brush'; setOn('[data-t]', p.querySelector('[data-t=brush]')); } setOn('.tbl-sw', b); return; }
        if (b.hasAttribute('data-t')) { E.tool = b.getAttribute('data-t'); setOn('[data-t]', b); return; }
        if (b.hasAttribute('data-s')) { E.size = +b.getAttribute('data-s'); setOn('[data-s]', b); return; }
        var a = b.getAttribute('data-a');
        if (a === 'close') closeAll();   // le brouillon est gardé : on le retrouve en revenant au chevalet
        else if (a === 'undo') { var s = E.undo.pop(); if (s) cx.putImageData(s, 0, 0); if (E.undo.length) E.save(); else clearDraft(); }
        else if (a === 'clear') { snap(); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, CW, CH); E.save(); }
        else if (a === 'send') send(p, cv, E);
      });
    }
    function exportJpeg(cv) {
      var q = 0.86, url = cv.toDataURL('image/jpeg', q);
      while (url.length > 140000 && q > 0.4) { q -= 0.1; url = cv.toDataURL('image/jpeg', q); }
      if (url.length > 150000) {                                // dessin très chargé : on réduit un peu l'image plutôt que d'échouer
        var sm = mkCanvas(320, 240); sm.getContext('2d').drawImage(cv, 0, 0, 320, 240); url = sm.toDataURL('image/jpeg', 0.7);
      }
      return url;
    }
    function send(p, cv, E) {
      if (busy || needLogin()) return;
      var title = (p.querySelector('[data-r=title]').value || '').trim();
      if (!title) { msg('✏️ Donne un titre à ton tableau.'); return; }
      if (!E.undo.length) { msg('🖌️ Ton tableau est encore vide !'); return; }
      var price = data ? data.price : 300;
      if (balance() < price) { msg('❌ Il te manque ' + fmtN(price - balance()) + ' 🪙.'); return; }
      busy = true; p.querySelector('[data-a=send]').disabled = true; msg('Accrochage en cours…', true);
      E.save();                                              // brouillon à jour avant d'envoyer, au cas où
      if (!E.rid) E.rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);   // même identifiant si on réessaie : jamais payé deux fois
      call({ action: 'create', title: title, img: exportJpeg(cv), rid: E.rid }).then(function (r) {
        busy = false;
        if (r && r.ok) {
          E.sent = true; clearDraft(); setBalance(r.balance); applyState(r); closeAll();
          try { world.flash('🎨 Ton tableau est accroché !', 'Bonne chance pour le podium'); } catch (e) { /* ok */ }
        } else {
          var b = p.querySelector('[data-a=send]'); if (b) b.disabled = false;
          msg('❌ ' + ((r && r.error) || 'Impossible d\'accrocher le tableau.') + ' Ton dessin est gardé, rien n\'a été payé : réessaie.');
        }
      });
    }

    /* ---------- porte de sortie, apparition, aide ---------- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xffd24a, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche le cœur du tableau pour voter · chevalets au milieu : peindre' : 'ZQSD / flèches : marcher · clic sur le cœur du tableau : voter · F ou clic sur un chevalet : peindre' + (w.full ? ' · Échap : quitter' : ''); };
    room.dispose = function () { closeAll(true); if (pollT) clearInterval(pollT); };
    return room;
  }

  F.registerRoom('dessin', createRoom);
})();
