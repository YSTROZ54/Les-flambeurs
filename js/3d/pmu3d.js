/* =====================================================================
   pmu3d.js — Le PMU « espace sociale » des Flambeurs (bureau de tabac, bar, cartes à gratter) — monde 3D, PC
   ---------------------------------------------------------------------
   On y entre par la porte « PMU » de la boutique (shop3d.js) et on en ressort vers la boutique.
   Décor : comptoir noir à face blanche rétroéclairée et bande rouge, tabourets et chaises noirs à assise rouge,
   petites tables carrées, suspensions coniques noires, sol imitation bois clair, étagères de magazines,
   distributeur de boules de gomme.
   Un vendeur au comptoir vend des CARTES À GRATTER (100 pièces, 4 cartes au maximum en même temps).
     - L'achat et le tirage sont décidés par le SERVEUR (api/_games.js : pmu_buy / pmu_scratch) : le navigateur
       ne connaît le résultat d'une carte qu'au moment où il la gratte, et le solde vient du serveur.
     - Les cartes achetées vont dans la barre du bas (hud3d.js, cases 1, 2, 4, 5 ; le téléphone reste au milieu).
     - On ne gratte QU'ICI : la carte s'affiche en grand au-dessus de la tête du joueur pour tout le monde dans
       la salle (canal temps réel du monde : événement « scr »). Le résultat montré aux autres est purement visuel.
   Fichiers liés : f3d-core.js, world3d.js, hud3d.js (barre du bas), shop3d.js (la porte), api/_games.js (serveur).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, EMOJI = F.EMOJI_FONT, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 9, HZ = 8, H = 4.8;                 // demi-largeur, demi-profondeur, hauteur de la salle (mètres)
  var RED = 0xd01a1a, BLACK = 0x15151a;
  var CARD_MS = 3400, SHOW_MS = 5500;           // durée du grattage, puis temps où la carte reste affichée
  var PRICE = 100, MAX_CARDS = 4;               // affichage seulement : le serveur décide (api/_games.js)
  var CELLS = [100, 200, 500, 1000, 5000, 20000];

  /* ---------- petits outils ---------- */
  var cache = {};
  function lam(c) { var k = 'l' + c; return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({ color: c })); }
  function bas(c) { var k = 'b' + c; return cache[k] || (cache[k] = new THREE.MeshBasicMaterial({ color: c })); }
  function chrome() { return cache.chrome || (cache.chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.8 })); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function cyl(p, rt, rb, h, m, x, y, z, seg) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), m); o.position.set(x, y, z); p.add(o); return o; }
  function sph(p, r, m, x, y, z) { var o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); o.position.set(x, y, z); p.add(o); return o; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  // appel du serveur (même passerelle que les autres jeux : renvoie le nouveau solde, mis à jour dans la page)
  function sg(payload, opts) {
    try { if (typeof serverGame === 'function') return Promise.resolve(serverGame(payload, opts)).catch(function () { return { ok: false, error: 'Réseau indisponible.' }; }); } catch (e) { /* ok */ }
    return Promise.resolve({ ok: false, error: 'Serveur indisponible.' });
  }

  /* ===================== LA CARTE À GRATTER (dessin, partagé par l'écran du joueur et les têtes des autres) ===================== */
  var tmp = null;
  function roundPath(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r); x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r); x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
  }
  // Dessin de la carte. p : un nombre (0 = tout couvert, 1 = tout gratté, grattage automatique) ou 6 nombres (avancée de chaque case, de 0 à 1).
  // done : le résultat est connu (cases gagnantes en or + bandeau GAGNÉ / PERDU).
  function cellRect(W, Hh, k) {
    var gx = W * 0.07, gy = Hh * 0.23, gw = W * 0.86, gh = Hh * 0.5, cw = gw / 3, ch = gh / 2, pad = 6;
    return { x: gx + (k % 3) * cw + pad, y: gy + Math.floor(k / 3) * ch + pad, w: cw - pad * 2, h: ch - pad * 2 };
  }
  function drawCard(cv, cells, prize, p, who, done) {
    var W = cv.width, Hh = cv.height, x = cv.getContext('2d');
    x.clearRect(0, 0, W, Hh);
    var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#e23a3a'); g.addColorStop(1, '#8e0f1c');
    roundPath(x, 4, 4, W - 8, Hh - 8, 22); x.fillStyle = g; x.fill(); x.lineWidth = 6; x.strokeStyle = '#f3cf62'; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.font = '900 ' + Math.round(W * 0.085) + 'px ' + SERIF; x.fillText('GRATTAGE FLAMBEURS', W / 2, Hh * 0.09, W * 0.9);
    x.fillStyle = '#ffe9a8'; x.font = '700 ' + Math.round(W * 0.042) + 'px ' + MONO; x.fillText('3 MONTANTS IDENTIQUES = GAGNÉ', W / 2, Hh * 0.17, W * 0.9);
    if (!tmp) tmp = document.createElement('canvas');
    if (tmp.width !== W || tmp.height !== Hh) { tmp.width = W; tmp.height = Hh; }
    var t = tmp.getContext('2d'); t.clearRect(0, 0, W, Hh);
    cells.forEach(function (v, k) {
      var r = cellRect(W, Hh, k), cx0 = r.x, cy0 = r.y, w = r.w, h = r.h;
      var win = done && prize > 0 && v === prize;
      roundPath(x, cx0, cy0, w, h, 10); x.fillStyle = win ? '#fff3b0' : '#fbf3e2'; x.fill();
      if (win) { x.lineWidth = 5; x.strokeStyle = '#ffb300'; x.stroke(); }
      x.fillStyle = '#1a1a1a'; x.font = '900 ' + Math.round(W * (v >= 10000 ? 0.085 : 0.1)) + 'px ' + MONO; x.fillText(fmtN(v), cx0 + w / 2, cy0 + h * 0.46, w - 8);
      x.fillStyle = '#7a5a08'; x.font = Math.round(W * 0.05) + 'px ' + EMOJI; x.fillText('🪙', cx0 + w / 2, cy0 + h * 0.82);
      // pellicule argentée (grattée par la pièce qui passe en zigzag)
      var cp = Array.isArray(p) ? clamp01(p[k]) : clamp01((p - k * 0.13) / 0.3);
      if (cp < 1) {
        paintCoat(t, r);
        if (cp > 0) {
          t.globalCompositeOperation = 'destination-out'; t.lineWidth = h / 4.2; t.lineCap = 'round'; t.strokeStyle = '#000'; t.beginPath();
          var rows = 5, u = cp * rows * 1.04, rr;
          for (rr = 0; rr < rows && u > 0; rr++) {
            var f = Math.min(1, u), y0 = cy0 + (rr + 0.5) * h / rows, xa = rr % 2 ? cx0 + w : cx0, xb = rr % 2 ? cx0 : cx0 + w;
            if (rr === 0) t.moveTo(xa, y0); else t.lineTo(xa, y0);
            t.lineTo(xa + (xb - xa) * f, y0); u -= 1;
          }
          t.stroke(); t.globalCompositeOperation = 'source-over';
        }
      }
    });
    x.drawImage(tmp, 0, 0);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = '700 ' + Math.round(W * 0.045) + 'px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (who) x.fillText(String(who).slice(0, 18), W / 2, Hh * 0.78, W * 0.86);
    if (done) {
      var win2 = prize > 0;
      roundPath(x, W * 0.08, Hh * 0.82, W * 0.84, Hh * 0.13, 16); x.fillStyle = win2 ? '#0f8a43' : '#2a2a30'; x.fill(); x.lineWidth = 3; x.strokeStyle = win2 ? '#9cffc2' : '#666'; x.stroke();
      x.fillStyle = '#fff'; x.font = '900 ' + Math.round(W * (win2 ? 0.075 : 0.07)) + 'px ' + SERIF;
      x.fillText(win2 ? 'GAGNÉ ! +' + fmtN(prize) + ' 🪙' : 'PERDU… retente ta chance', W / 2, Hh * 0.885, W * 0.8);
    }
  }
  // la pellicule argentée d'une case
  function paintCoat(t, r) {
    var sg2 = t.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h); sg2.addColorStop(0, '#d9dce2'); sg2.addColorStop(0.5, '#9ea4b0'); sg2.addColorStop(1, '#cfd3da');
    t.globalCompositeOperation = 'source-over'; roundPath(t, r.x, r.y, r.w, r.h, 10); t.fillStyle = sg2; t.fill();
    t.fillStyle = 'rgba(80,86,98,0.55)'; t.font = '900 ' + Math.round(r.w * 0.5) + 'px ' + MONO; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText('?', r.x + r.w / 2, r.y + r.h / 2);
  }
  function okShow(m) {
    if (!m || !Array.isArray(m.cells) || m.cells.length !== 6) return false;
    for (var i = 0; i < 6; i++) if (CELLS.indexOf(m.cells[i]) < 0) return false;
    return m.prize === 0 || CELLS.indexOf(m.prize) >= 0;
  }

  /* ===================== LES CARTES DU JOUEUR (barre du bas) ===================== */
  var PMU = F.pmu = { cards: [], hud: null, world: null, busy: false, self: null };

  function setCards(ids) {
    PMU.cards = Array.isArray(ids) ? ids.slice(0, MAX_CARDS) : [];
    if (!PMU.hud || !PMU.hud.setItems) return;
    PMU.hud.setItems('pmu', PMU.cards.map(function (id) {
      return { id: 'pmu-' + id, name: 'Carte à gratter', icon: 'fa-ticket', color: '239,68,68', use: function () { scratch(id); }, clickOk: inPmu };   // clic dans le monde avec la carte en main : seulement au PMU
    }));
  }
  function loadCards() {
    if (!loggedIn()) { setCards([]); return Promise.resolve(); }
    return sg({ action: 'pmu_cards' }, { silent: true }).then(function (r) { if (r && r.ok) setCards(r.cards); });
  }
  // le monde prévient quand sa barre du bas est prête (hud3d.js)
  (F.hudReady = F.hudReady || []).push(function (w, ph) { PMU.world = w; PMU.hud = ph; loadCards(); });

  function inPmu() { var w = PMU.world; return !!(w && w.room && w.room.id === 'pmu' && (w.mode === 'room' || w.mode === 'seat')); }

  function scratch(id) {
    var w = PMU.world;
    if (!w || PMU.busy) return;
    if (!inPmu()) { w.flash('🎟️ On ne peut gratter ses cartes que dans le PMU !'); return; }
    PMU.busy = true;
    sg({ action: 'pmu_scratch', id: id }, { silent: true }).then(function (r) {
      if (!r || !r.ok) { PMU.busy = false; w.flash('❌ ' + ((r && r.error) || 'Grattage impossible.')); if (r && r.cards) setCards(r.cards); return; }
      setCards(r.cards);
      var me = st(), who = String((me && me.username) || '').slice(0, 20);
      try { if (w.rt && w.rt.ready) w.rt.send('scr', { k: F.me(), name: who, cells: r.cells, prize: r.prize }); } catch (e) { /* ok */ }
      showSelf(w, r.cells, r.prize, who);
    });
  }

  // Ma carte, en grand : c'est MOI qui gratte (clic maintenu + glisser). Les autres voient ma carte au-dessus de ma tête
  // se gratter au fur et à mesure (événements « scr » au début, « scp » pour l'avancée).
  var FULL_AT = 0.55;   // une case est « grattée » quand 55 % de sa pellicule est partie
  function showSelf(w, cells, prize, who) {
    injectCss();
    var W = 340, Hh = 425, ov = document.createElement('div'), cv = document.createElement('canvas'), tip = document.createElement('div'), btn = document.createElement('button');
    var coat = document.createElement('canvas'), cx = coat.getContext('2d'), prog = [0, 0, 0, 0, 0, 0], done = false, tm = 0, last = null, sendT = 0, measureT = 0, finished = false;
    cv.width = coat.width = W; cv.height = coat.height = Hh;
    cells.forEach(function (v, k) { paintCoat(cx, cellRect(W, Hh, k)); });
    ov.className = 'pmu-card-ov'; tip.className = 'pmu-tip'; tip.textContent = 'Gratte la carte avec la souris : clique et glisse sur les cases argentées';
    btn.className = 'pmu-reveal'; btn.textContent = 'Tout révéler';
    ov.appendChild(cv); ov.appendChild(tip); ov.appendChild(btn); w.container.appendChild(ov);
    try { w._libererSouris(); } catch (e) { /* ok */ }
    w.modalOpen = true;                                                // le HUD se met en retrait : pas de reprise de souris ni de raccourcis pendant le grattage
    function onKey(e) { if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (PMU.self) PMU.self.finish(); } }
    window.addEventListener('keydown', onKey, true);
    function paint() { drawCard(cv, cells, prize, [1, 1, 1, 1, 1, 1], who, done); cv.getContext('2d').drawImage(coat, 0, 0); }
    function measure() {
      cells.forEach(function (v, k) {
        var r = cellRect(W, Hh, k), d = cx.getImageData(Math.floor(r.x), Math.floor(r.y), Math.floor(r.w), Math.floor(r.h)).data, n = 0, tot = 0, i;
        for (i = 3; i < d.length; i += 16) { tot++; if (d[i] < 40) n++; }
        prog[k] = tot ? n / tot : 0;
      });
    }
    function send(final) {
      try { if (w.rt && w.rt.ready) w.rt.send('scp', { k: F.me(), p: prog.map(function (v) { return Math.round(v * 100) / 100; }), done: !!final }); } catch (e) { /* ok */ }
    }
    function close() {
      if (finished) return; finished = true; clearTimeout(tm);
      window.removeEventListener('keydown', onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      w.modalOpen = false; PMU.busy = false; PMU.self = null;
      if (PMU.hud && PMU.hud.relock) PMU.hud.relock();                   // en grand écran, on reprend la souris
      try { if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) { /* ok */ }
    }
    function reveal() {
      if (done) return; done = true; prog = [1, 1, 1, 1, 1, 1];
      cx.clearRect(0, 0, W, Hh); paint(); send(true);
      tip.textContent = prize > 0 ? 'Bravo ! Les ' + fmtN(prize) + ' 🪙 sont sur ton solde. (clique pour fermer)' : 'Perdu cette fois… (clique pour fermer)'; btn.style.display = 'none';
      w.flash(prize > 0 ? '🎉 Gagné ! +' + fmtN(prize) + ' 🪙' : '😢 Perdu, ce sera pour la prochaine !');
      if (prize > 0) { try { if (typeof playCoinWinSound === 'function') playCoinWinSound(); } catch (e) { /* ok */ } }
      tm = setTimeout(close, SHOW_MS + 4000);
    }
    function scratchAt(px, py) {
      var rc = cv.getBoundingClientRect(), x = (px - rc.left) * W / rc.width, y = (py - rc.top) * Hh / rc.height;
      cx.globalCompositeOperation = 'destination-out'; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = 34; cx.strokeStyle = '#000';
      cx.beginPath(); if (last) cx.moveTo(last.x, last.y); else cx.moveTo(x - 0.1, y); cx.lineTo(x, y); cx.stroke(); cx.globalCompositeOperation = 'source-over';
      last = { x: x, y: y };
      paint();
      var now = performance.now();
      if (now - measureT > 120) {
        measureT = now; measure();
        if (now - sendT > 220) { sendT = now; send(false); }
        if (prog.every(function (v) { return v >= FULL_AT; })) reveal();
      }
    }
    cv.addEventListener('pointerdown', function (e) { if (done) return; last = null; cv.setPointerCapture(e.pointerId); cv._d = true; scratchAt(e.clientX, e.clientY); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) { if (cv._d && !done) scratchAt(e.clientX, e.clientY); });
    cv.addEventListener('pointerup', function () { cv._d = false; last = null; if (!done) { measure(); send(false); } });
    ov.addEventListener('click', function () { if (done) close(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); measure(); reveal(); });
    PMU.self = { finish: function () { if (!done) reveal(); close(); } };
    paint(); send(false);
  }

  /* ---------- styles (injectés une seule fois) ---------- */
  function injectCss() {
    if (document.getElementById('pmu-style')) return;
    var s = document.createElement('style'); s.id = 'pmu-style';
    s.textContent =
      '.pmu-card-ov{position:absolute;left:50%;top:12%;transform:translateX(-50%);z-index:6;pointer-events:auto;filter:drop-shadow(0 10px 28px rgba(0,0,0,.7));animation:pmuIn .35s ease-out}' +
      '.pmu-card-ov canvas{display:block;width:min(360px,60vw);height:auto;cursor:crosshair;touch-action:none;border-radius:22px}' +
      '.pmu-tip{margin-top:8px;text-align:center;font:700 12px "Plus Jakarta Sans",system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.65);border-radius:10px;padding:6px 10px;max-width:360px}' +
      '.pmu-reveal{display:block;margin:6px auto 0;cursor:pointer;background:rgba(8,5,12,.85);color:#ffe9a8;border:1px solid rgba(255,233,168,.5);border-radius:10px;font-weight:800;font-size:12px;padding:7px 14px}' +
      '.pmu-stand{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:6}' +
      '.pmu-stand button{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1.5px solid #d01a1a;border-radius:12px;font-weight:800;font-size:13px;padding:10px 16px}.pmu-stand kbd{opacity:.6;font-size:11px;margin-left:6px}' +
      '@keyframes pmuIn{from{opacity:0;transform:translateX(-50%) translateY(-24px) scale(.9)}to{opacity:1;transform:translateX(-50%)}}' +
      '.pmup{position:absolute;inset:0;pointer-events:none;z-index:5;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#f4e3b0}' +
      '.pmup-panel{position:absolute;top:56px;bottom:12px;right:12px;width:min(440px,46%);min-width:330px;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px;pointer-events:auto;overflow-y:auto;' +
      'background:linear-gradient(180deg,rgba(24,24,28,.96),rgba(12,12,16,.97));border:1.5px solid #d01a1a;box-shadow:0 0 30px rgba(0,0,0,.6),0 0 22px rgba(208,26,26,.25)}' +
      '.pmup-head{display:flex;align-items:center;gap:10px}.pmup-ava{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;background:#1d1d22;border:2px solid #d01a1a;flex:none}' +
      '.pmup-who{flex:1;min-width:0}.pmup-who b{display:block;font-family:"Cinzel",Georgia,serif;font-size:17px;color:#fff}.pmup-who small{color:#b9b9c2;font-size:11.5px;font-weight:700}' +
      '.pmup-x{cursor:pointer;background:rgba(8,5,12,.85);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:10px;font-weight:800;font-size:12px;padding:8px 10px}' +
      '.pmup-say{background:rgba(255,255,255,.06);border-left:3px solid #d01a1a;border-radius:8px;padding:8px 10px;font-size:12.5px;font-style:italic;color:#e8e8ee;line-height:1.35}' +
      '.pmup-bal{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;color:#b9b9c2}.pmup-bal b{color:#ffd24a;font-family:"Orbitron",monospace;font-size:15px}' +
      '.pmup-card{display:flex;gap:12px;align-items:center;padding:10px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15)}' +
      '.pmup-card canvas{width:92px;height:auto;flex:none;border-radius:8px}' +
      '.pmup-info{flex:1;min-width:0}.pmup-info b{display:block;font-size:14px;color:#fff}.pmup-info span{display:block;font-size:11.5px;color:#b9b9c2;margin-top:3px;line-height:1.3}' +
      '.pmup-buy{cursor:pointer;width:100%;margin-top:8px;padding:11px 6px;border-radius:11px;font-weight:900;font-size:13px;border:1px solid #ffb3b3;background:linear-gradient(180deg,#e23a3a,#a01020);color:#fff}' +
      '.pmup-buy:hover{filter:brightness(1.12)}.pmup-buy:disabled{filter:grayscale(.8) brightness(.6);cursor:not-allowed}' +
      '.pmup-slots{display:flex;gap:6px}.pmup-slots i{flex:1;height:34px;border-radius:8px;border:1.5px dashed rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:18px}' +
      '.pmup-slots i.on{border:1.5px solid #ff6a6a;background:rgba(208,26,26,.3)}' +
      '.pmup-prizes{font-size:11.5px;line-height:1.5;color:#b9b9c2}.pmup-prizes b{color:#ffd24a;font-family:"Orbitron",monospace}' +
      '.pmup-msg{min-height:18px;text-align:center;font-size:12.5px;font-weight:800;color:#ffe08a}' +
      '@media (max-width:900px){.pmup-panel{width:calc(100% - 24px)}}';
    document.head.appendChild(s);
  }

  /* ===================== LA SALLE ===================== */
  function createPmuRoom(world) {
    var low = world.low;
    var room = { title: '🍀 PMU', subtitle: 'ESPACE SOCIALE · CARTES À GRATTER', topic: 'flambeurs-pmu-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };
    var clockT = 0, hereT = 99, seller = null, talk = null, overlay = null, msgT = null, busy = false, shows = [], pendants = [];

    /* --- sol : lames de bois clair --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'), i, j;
    for (i = 0; i < 8; i++) {
      for (j = -1; j < 2; j++) {
        var sh = 196 + Math.floor(Math.random() * 26);
        fx.fillStyle = 'rgb(' + sh + ',' + (sh - 28) + ',' + (sh - 70) + ')'; fx.fillRect(j * 128 + (i % 2) * 64, i * 32, 127, 31);
      }
    }
    fx.fillStyle = 'rgba(120,80,40,0.25)'; for (i = 0; i < 8; i++) fx.fillRect(0, i * 32 + 31, 256, 1);
    fx.globalAlpha = 0.1; for (i = 0; i < 90; i++) { fx.fillStyle = i % 2 ? '#fff' : '#6b4a28'; fx.fillRect(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 1); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 8;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ map: ft })); floor.rotation.x = -Math.PI / 2; g.add(floor);

    /* --- murs gris clair, soubassement noir, bande rouge --- */
    function wallTex(len) {
      var c = mkCanvas(256, 512), x = c.getContext('2d');
      x.fillStyle = '#4b4d56'; x.fillRect(0, 0, 256, 512);
      x.fillStyle = '#17171c'; x.fillRect(0, 350, 256, 162);
      x.fillStyle = '#d01a1a'; x.fillRect(0, 336, 256, 14);
      x.fillStyle = 'rgba(0,0,0,0.16)'; for (var k = 32; k < 256; k += 64) x.fillRect(k, 20, 60, 300);
      x.fillStyle = 'rgba(255,255,255,0.08)'; for (k = 0; k < 256; k += 64) x.fillRect(k, 0, 3, 336);
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 4, 1); t.anisotropy = 4; return t;
    }
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshLambertMaterial({ map: wallTex(len) })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0x45424a })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* --- le comptoir : plateau noir, face blanche rétroéclairée, bande rouge (il touche le mur de gauche ; un retour ferme le côté droit) --- */
    var CZ = -4.6, CX0 = -HX, CX1 = 5.0;                                   // le comptoir va de x = -9 à x = 5, face à la salle (z = CZ)
    var cw = CX1 - CX0, cmx = (CX0 + CX1) / 2;
    box(g, cw, 1.0, 0.9, lam(BLACK), cmx, 0.5, CZ);
    box(g, cw + 0.1, 0.06, 1.05, lam(0x0c0c10), cmx, 1.03, CZ);
    var face = box(g, cw - 0.1, 0.9, 0.02, bas(0xf6f6fa), cmx, 0.5, CZ + 0.46);               // face blanche rétroéclairée
    box(g, cw - 0.1, 0.13, 0.03, bas(RED), cmx, 0.55, CZ + 0.47);                              // bande rouge
    box(g, cw - 0.1, 0.05, 0.03, bas(0xffffff), cmx, 0.98, CZ + 0.47);
    box(g, cw - 0.2, 0.035, 0.035, bas(0xffffff), cmx, 0.945, CZ + 0.52);                                  // néon blanc sous le plateau du bar
    var neonGlow = new THREE.Mesh(new THREE.PlaneGeometry(cw, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })); neonGlow.position.set(cmx, 0.9, CZ + 0.5); g.add(neonGlow);
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(cw, 1.3), new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.1, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(cmx, 0.02, CZ + 1.1); g.add(glow);
    box(g, 0.9, 1.0, HZ + CZ, lam(BLACK), CX1, 0.5, (CZ - HZ) / 2);                                    // retour du comptoir jusqu'au mur du fond
    for (i = CX0; i <= CX1 + 0.01; i += 1.0) room.colliders.push({ x: i, z: CZ, r: 0.75 });
    for (j = CZ - 1; j > -HZ; j -= 1.0) room.colliders.push({ x: CX1, z: j, r: 0.75 });

    /* --- derrière le comptoir : étagères de bureau de tabac, écrans de résultats et enseigne --- */
    var shelf = new THREE.Group(); shelf.position.set(-2, 0, -HZ + 0.25); g.add(shelf);
    box(shelf, 14, 2.4, 0.5, lam(0x1c1c22), 0, 1.2, 0);
    var palette = [0xd01a1a, 0xf2f2f2, 0x2f6fe0, 0xf2d12a, 0x2fa050, 0x888890, 0x111111];
    for (var row = 0; row < 3; row++) for (var col = 0; col < 40; col++) {
      if (Math.random() < 0.12) continue;
      box(shelf, 0.28, 0.17, 0.1, lam(palette[(row * 7 + col * 3 + (col % 5)) % palette.length]), -6.9 + col * 0.35, 0.55 + row * 0.62, 0.26);
    }
    [0.3, 0.92, 1.54, 2.16].forEach(function (y) { box(shelf, 14, 0.04, 0.5, lam(0x2c2c34), 0, y, 0.02); });
    function screenTex(title, lines) {
      var c = mkCanvas(512, 288), x = c.getContext('2d');
      x.fillStyle = '#0a1020'; x.fillRect(0, 0, 512, 288); x.fillStyle = '#d01a1a'; x.fillRect(0, 0, 512, 56);
      x.fillStyle = '#fff'; x.font = '900 36px ' + SERIF; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(title, 18, 30);
      x.font = '700 28px ' + MONO; lines.forEach(function (l, k) { x.fillStyle = k % 2 ? '#9fd0ff' : '#ffe08a'; x.fillText(l, 18, 92 + k * 42); });
      return mkTex(c);
    }
    [[-6, 'PMU · COURSES', ['R1  8 PARTANTS', 'R2  12 PARTANTS', 'R3  9 PARTANTS', 'R4  14 PARTANTS']], [-2, 'RÉSULTATS', ['3 - 7 - 1 - 4', '2 - 5 - 8 - 6', '9 - 1 - 3 - 7', '4 - 4 - 2 - 8']], [2, 'LOTO · JEUX', ['TIRAGE  18:30', 'GRATTAGE  100 🪙', 'CAGNOTTE  20 000', 'BONNE CHANCE !']]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.18), new THREE.MeshBasicMaterial({ map: screenTex(s[1], s[2]) })); m.position.set(s[0], 3.0, -HZ + 0.52); g.add(m);
      box(g, 2.22, 1.3, 0.05, lam(0x111114), s[0], 3.0, -HZ + 0.49);
    });
    var tc = mkCanvas(512, 192), tx = tc.getContext('2d');
    tx.fillStyle = '#111116'; tx.fillRect(0, 0, 512, 192); tx.fillStyle = '#d01a1a'; tx.fillRect(0, 0, 512, 18); tx.fillRect(0, 174, 512, 18);
    tx.textAlign = 'center'; tx.textBaseline = 'middle'; tx.fillStyle = '#fff'; tx.font = '900 130px ' + SERIF; tx.fillText('PMU', 256, 98, 460);
    var tabSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), new THREE.MeshBasicMaterial({ map: mkTex(tc) })); tabSign.position.set(-2, 4.1, -HZ + 0.52); g.add(tabSign);

    /* --- le vendeur de cartes --- */
    var person = F.createPerson('Bruno', '🎟️'), pg = person.group, kids = pg.children;
    kids[0].material.color.setHex(0x1a1a20); kids[1].material.color.setHex(0xf2f2f2); kids[3].material.color.setHex(0xe0ac82);
    kids.forEach(function (c) { if (c.geometry && c.geometry.parameters && c.geometry.parameters.radius === 0.152) c.material.color.setHex(0x3b2314); });
    var tag = kids[kids.length - 1]; tag.position.y = 2.2; tag.scale.set(1.15, 0.255, 1);
    box(pg, 0.36, 0.62, 0.03, lam(0x15151a), 0, 1.15, 0.2);                                              // tablier noir
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, TAU, 0, Math.PI / 2), lam(RED)); cap.position.set(0, 1.8, 0); pg.add(cap);
    box(pg, 0.22, 0.02, 0.16, lam(RED), 0, 1.81, 0.16);
    pg.position.set(0.4, 0, CZ - 1.3); pg.rotation.y = 0; g.add(pg);
    seller = { person: person, group: pg, x: 0.4, z: CZ - 1.3, yaw: 0, cheer: 0, say: '' };
    // terminal de jeu et pile de cartes sur le comptoir
    box(g, 0.5, 0.05, 0.4, lam(0x222228), 0.4, 1.08, CZ - 0.1);
    box(g, 0.34, 0.26, 0.05, bas(0x182a4a), 0.4, 1.24, CZ - 0.25).rotation.x = -0.25;
    for (i = 0; i < 6; i++) box(g, 0.17, 0.003, 0.24, lam(i % 2 ? 0xe23a3a : 0xf2f2f2), -0.5 + i * 0.012, 1.07 + i * 0.004, CZ - 0.05).rotation.y = 0.2;
    var hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(seller.x, 1.1, seller.z); g.add(hit);

    /* --- tabourets de bar (noirs, assise rouge) --- */
    function stool(x, z) {
      cyl(g, 0.03, 0.03, 0.62, chrome(), x, 0.34, z, 8); cyl(g, 0.2, 0.22, 0.03, chrome(), x, 0.02, z, 16);
      cyl(g, 0.19, 0.19, 0.1, lam(BLACK), x, 0.69, z, 18); cyl(g, 0.17, 0.17, 0.06, lam(RED), x, 0.77, z, 18);
      room.colliders.push({ x: x, z: z, r: 0.32 });
    }
    for (i = 0; i < 7; i++) stool(-7.2 + i * 1.5, CZ + 1.25);

    /* --- petites tables carrées et chaises noires à assise rouge (on peut s'y asseoir) --- */
    var seats = room.seats = [];
    function chair(x, z, r, tx, tz) {                       // r : rotation de la chaise (0 = elle regarde vers +z) ; (tx, tz) : la table
      var c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = r; g.add(c);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(function (p) { box(c, 0.035, 0.45, 0.035, lam(BLACK), p[0], 0.225, p[1]); });
      box(c, 0.46, 0.05, 0.46, lam(BLACK), 0, 0.46, 0); box(c, 0.4, 0.04, 0.4, lam(RED), 0, 0.5, 0);
      box(c, 0.46, 0.4, 0.04, lam(BLACK), 0, 0.72, -0.21);                                                   // dossier : derrière la chaise
      room.colliders.push({ x: x, z: z, r: 0.3 });
      var s = { n: seats.length, x: x, z: z, r: r, yaw: Math.PI - r, tx: tx, tz: tz, sx: x - Math.sin(r) * 0.95, sz: z - Math.cos(r) * 0.95 };   // sx, sz : où on se retrouve debout
      seats.push(s);
      room.interactables.push({
        x: x, z: z, radius: 1.35,
        prompt: function () { return '🪑 S\'asseoir  [F]'; },
        use: function (w) { sit(w, s); }
      });
    }
    function table(x, z) {
      box(g, 0.9, 0.05, 0.9, lam(BLACK), x, 0.74, z); cyl(g, 0.04, 0.04, 0.72, chrome(), x, 0.36, z, 8); cyl(g, 0.28, 0.3, 0.03, lam(BLACK), x, 0.015, z, 16);
      box(g, 0.2, 0.012, 0.2, lam(0xf2f2f2), x + 0.1, 0.77, z - 0.1);
      room.colliders.push({ x: x, z: z, r: 0.55 });
      chair(x, z - 0.8, 0, x, z); chair(x, z + 0.8, Math.PI, x, z); chair(x - 0.85, z, Math.PI / 2, x, z); chair(x + 0.85, z, -Math.PI / 2, x, z);
    }
    [[1.6, -0.5], [5.2, -0.5], [1.6, 3.4], [5.2, 3.4]].forEach(function (p) { table(p[0], p[1]); });

    /* --- étagères de magazines le long du mur de gauche --- */
    function magTex() {
      var c = mkCanvas(512, 256), x = c.getContext('2d'), cols = ['#d01a1a', '#2f6fe0', '#f2d12a', '#2fa050', '#e86aa8', '#f08a24', '#7a3fd0', '#19b3c9'];
      x.fillStyle = '#16161b'; x.fillRect(0, 0, 512, 256);
      for (var r = 0; r < 4; r++) for (var k = 0; k < 9; k++) {
        var mx = 6 + k * 56, my = 6 + r * 62;
        x.fillStyle = cols[(r * 5 + k * 3) % cols.length]; x.fillRect(mx, my, 50, 56);
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(mx + 4, my + 5, 42, 9); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(mx + 4, my + 22, 28, 4); x.fillRect(mx + 4, my + 30, 34, 4);
        x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.arc(mx + 34, my + 40, 9, 0, TAU); x.fill();
      }
      return mkTex(c);
    }
    var mt = magTex();
    [-1.2, 1.5, 4.2].forEach(function (z) {
      var u = new THREE.Group(); u.position.set(-HX + 0.3, 0, z); u.rotation.y = Math.PI / 2; g.add(u);
      box(u, 2.5, 2.3, 0.5, lam(BLACK), 0, 1.15, 0);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.9), new THREE.MeshBasicMaterial({ map: mt })); m.position.set(0, 1.2, 0.26); u.add(m);
      [0.2, 0.7, 1.2, 1.7, 2.2].forEach(function (y) { box(u, 2.5, 0.04, 0.55, lam(0x2c2c34), 0, y, 0.02); });
      room.colliders.push({ x: -HX + 0.8, z: z - 0.8, r: 0.7 }, { x: -HX + 0.8, z: z, r: 0.7 }, { x: -HX + 0.8, z: z + 0.8, r: 0.7 });
    });

    /* --- poutres sombres au plafond --- */
    var beamM = lam(0x1b1512);
    for (i = -HX + 1.5; i < HX; i += 3) box(g, 0.28, 0.3, HZ * 2, beamM, i, H - 0.15, 0);
    [-4.5, 0, 4.5].forEach(function (z) { box(g, HX * 2, 0.22, 0.2, beamM, 0, H - 0.11, z); });

    /* --- appliques murales : abat-jour crème, lumière chaude et douce (ni LED ni lustre) --- */
    var glowTex = (function () { var c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,0.85)'); gr.addColorStop(0.4, 'rgba(255,180,100,0.3)'); gr.addColorStop(1, 'rgba(255,160,70,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return mkTex(c); })();
    var glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    var brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.35, metalness: 0.7 });
    var shadeM = new THREE.MeshBasicMaterial({ color: 0xffe2b0, side: THREE.DoubleSide });
    function sconce(x, z, ry) {                       // ry : le mur regarde vers (sin ry, cos ry)
      var s = new THREE.Group(); s.position.set(x, 2.35, z); s.rotation.y = ry; g.add(s);
      box(s, 0.1, 0.34, 0.03, brass, 0, 0, 0.015); cyl(s, 0.018, 0.018, 0.2, brass, 0, 0, 0.12, 8).rotation.x = Math.PI / 2;
      var shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.26, 18, 1, true), shadeM); shade.position.set(0, 0.04, 0.24); s.add(shade);
      var gl = new THREE.Sprite(glowMat); gl.scale.set(1.5, 1.5, 1); gl.position.set(0, 0.04, 0.3); s.add(gl);
      var wash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); wash.position.set(0, 0.0, 0.02); s.add(wash);
    }
    [-6.5, -2.5, 2.5, 6.5].forEach(function (z) { sconce(HX - 0.01, z, -Math.PI / 2); });          // mur de droite
    [-1.0, 4.5].forEach(function (z) { sconce(-HX + 0.01, z + 1.6, Math.PI / 2); });                // mur de gauche, entre les étagères
    [-6.5, -3.2, 3.2, 6.5].forEach(function (x) { sconce(x, HZ - 0.01, Math.PI); });                // mur de l'entrée
    sconce(-8.2, -HZ + 0.02, 0); sconce(6.8, -HZ + 0.02, 0);                                        // mur du fond, aux extrémités

    /* --- lumières --- */
    g.add(new THREE.AmbientLight(0xf0e6dc, 1.15));
    var key = new THREE.DirectionalLight(0xffffff, 0.45); key.position.set(3, 8, 5); g.add(key);
    if (!low) { var pl = new THREE.PointLight(0xfff0d8, 0.7, 16); pl.position.set(1, 3.6, -1); g.add(pl); var p2 = new THREE.PointLight(0xffe0c0, 0.5, 12); p2.position.set(-5, 3, 3); g.add(p2); }

    /* --- porte de retour vers la boutique --- */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🛍️ TROPI SHOP', sub: 'RETOUR', color: 0xffd24a, target: 'shop3d' });

    /* --- parler au vendeur (touche F ou clic) : acheter des cartes --- */
    var spot = { x: 0.4, z: CZ + 2.1 };
    room.stands = { cards: { x: spot.x, z: spot.z, yaw: 0 } };
    room.interactables.push({
      x: spot.x, z: spot.z, radius: 3.2, hit: hit,
      prompt: function () { return '🎟️ Acheter des cartes à gratter — Bruno  [F]'; },
      use: function (w) {
        if (w.mode !== 'room' || w.blend > 0 || w.trans) return;
        if (Math.hypot(w.player.x - seller.x, w.player.z - seller.z) > 7) { w.flash('Approche-toi du comptoir pour parler à Bruno.'); return; }
        openTalk(w);
      }
    });

    /* --- panneau d'achat --- */
    var SAYS = ['Une petite carte ? Ça ne coûte que 100 pièces. Gratte-la ici, devant tout le monde !', 'Trois montants pareils et c\'est gagné. Quatre cartes maximum dans ta poche.', 'Allez, un coup de chance ! On ne gratte qu\'au PMU, c\'est la règle de la maison.'];
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function setMsg(t) {
      if (!overlay) return;
      var el = overlay.querySelector('.pmup-msg'); if (!el) return;
      el.textContent = t || ''; clearTimeout(msgT); if (t) msgT = setTimeout(function () { if (el) el.textContent = ''; }, 4500);
    }
    function render() {
      if (!overlay || !talk) return;
      var n = PMU.cards.length;
      overlay.querySelector('.pmup-say').textContent = '« ' + seller.say + ' »';
      overlay.querySelector('.pmup-bal b').textContent = fmtN(balance()) + ' 🪙';
      overlay.querySelector('.pmup-slots').innerHTML = [0, 1, 2, 3].map(function (k) { return '<i class="' + (k < n ? 'on' : '') + '">' + (k < n ? '🎟️' : '') + '</i>'; }).join('');
      var b = overlay.querySelector('.pmup-buy');
      b.disabled = busy || n >= MAX_CARDS; b.textContent = n >= MAX_CARDS ? 'Tes ' + MAX_CARDS + ' places sont pleines' : '🎟️ Acheter une carte — ' + fmtN(PRICE) + ' 🪙';
    }
    function buildOverlay(w) {
      injectCss();
      var o = document.createElement('div'); o.className = 'pmup';
      o.innerHTML =
        '<div class="pmup-panel"><div class="pmup-head"><div class="pmup-ava">🎟️</div><div class="pmup-who"><b>Bruno, le buraliste</b><small>Cartes à gratter · PMU</small></div>' +
        '<button class="pmup-x" data-act="close">✕ Fermer</button></div>' +
        '<div class="pmup-say"></div><div class="pmup-bal"><span>Ton solde</span><b></b></div>' +
        '<div class="pmup-card"><canvas width="170" height="212"></canvas><div class="pmup-info"><b>Carte « Grattage Flambeurs »</b><span>6 cases : trois montants identiques et tu gagnes ce montant. Elle va dans ta barre du bas (touches 1, 2, 4, 5).</span><button class="pmup-buy" data-act="buy"></button></div></div>' +
        '<div class="pmup-bal"><span>Mes cartes (4 maximum)</span></div><div class="pmup-slots"></div>' +
        '<div class="pmup-prizes">Montants possibles : <b>100</b> · <b>200</b> · <b>500</b> · <b>1 000</b> · <b>5 000</b> · <b>20 000</b> 🪙<br>Pour gratter : choisis la carte dans ta barre du bas, <b>ici, dans le PMU</b>. Tout le monde voit ta carte au-dessus de ta tête.</div>' +
        '<div class="pmup-msg"></div></div>';
      o.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b || b.disabled) return;
        if (b.getAttribute('data-act') === 'close') closeTalk(); else if (b.getAttribute('data-act') === 'buy') doBuy(w);
      });
      w.container.appendChild(o);
      drawCard(o.querySelector('canvas'), [500, 100, 1000, 200, 100, 5000], 0, 0.2, '');
      return o;
    }
    function doBuy(w) {
      if (busy || PMU.cards.length >= MAX_CARDS) return;
      if (!loggedIn()) {
        setMsg('🔒 Connecte-toi pour acheter une carte.');
        try { w.setFull(false); if (typeof openAuthModal === 'function') openAuthModal('login'); } catch (e) { /* ok */ }
        return;
      }
      if (balance() < PRICE) { setMsg('❌ Il te manque ' + fmtN(PRICE - balance()) + ' 🪙.'); return; }
      busy = true; render();
      // on signale d'abord qu'on est bien au PMU (le serveur n'autorise l'achat que dans ce cas), puis on achète
      sg({ action: 'pmu_here' }, { silent: true }).then(function () { return sg({ action: 'pmu_buy' }); }).then(function (r) {
        busy = false;
        if (r && r.ok) { setCards(r.cards); seller.say = 'Et voilà ! Gratte-la quand tu veux, ici même.'; seller.cheer = 1.2; setMsg('✨ Carte ajoutée à ta barre du bas !'); }
        else { if (r && r.cards) setCards(r.cards); setMsg('❌ ' + ((r && r.error) || 'Achat impossible.')); }
        render();
      });
    }
    function onEsc(e) { if (e.code === 'Escape' && talk) { e.stopImmediatePropagation(); e.preventDefault(); closeTalk(); } }
    function openTalk(w) {
      if (talk) return;
      w.sitDown(room); talk = { w: w }; seller.say = pick(SAYS);
      overlay = buildOverlay(w); render();
      window.addEventListener('keydown', onEsc, true);
    }
    function closeTalk(instant) {
      if (!talk) return;
      talk = null; busy = false;
      window.removeEventListener('keydown', onEsc, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      world.mode = 'room';
      if (instant) { world.blend = 0; world.seatRoom = null; }
    }
    // caméra pendant la discussion : devant le comptoir, le vendeur à gauche du panneau
    function talkPose() { return { cx: 0.4, cy: 2.0, cz: CZ + 4.8, tx: 1.5, ty: 1.4, tz: seller.z, fov: 46 }; }

    /* --- s'asseoir aux tables --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, standEl = null;
    function seatTaken(s) {
      var now = performance.now();
      return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; });
    }
    function onSeatKey(e) {
      if (!seat) return;
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyS') { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
    }
    function sit(w, s) {
      if (seat || talk || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette chaise est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0;
      injectCss();
      standEl = document.createElement('div'); standEl.className = 'pmu-stand';
      standEl.innerHTML = '<button>🪑 Se lever <kbd>Échap</kbd></button>';
      standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl);
      window.addEventListener('keydown', onSeatKey, true);
    }
    function stand() {
      if (!seat) return;
      var s = seat; seat = null;
      window.removeEventListener('keydown', onSeatKey, true);
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl);
      standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) {
      if (!seat) return;
      view.yaw = Math.max(-1.4, Math.min(1.4, drag.seat.yaw - dx * 0.006));
      if (drag.mouse) view.pitch = Math.max(-0.5, Math.min(0.5, drag.seat.pitch - dy * 0.004));
    };

    room.seatPose = function (dt, ctx) {
      if (!seat) return talkPose();                       // sinon : on parle au vendeur
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.3; }
      var ex = seat.x, ey = 1.2, ez = seat.z, a = Math.atan2(seat.tx - ex, -(seat.tz - ez)) + view.yaw, p = Math.atan2(0.78 - ey, Math.hypot(seat.tx - ex, seat.tz - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 62 };
    };

    /* --- les cartes des autres, au-dessus de leur tête : elles se grattent en direct (événements « scr » puis « scp ») --- */
    function showRemote(m, remote) {
      if (!remote || !remote.person || !okShow(m)) return;
      shows = shows.filter(function (s) { if (s.key !== m.k) return true; killShow(s); return false; });
      var cv = document.createElement('canvas'); cv.width = 300; cv.height = 375;
      var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(1.4, 1.75, 1); sp.position.set(0, 3.25, 0);
      remote.person.group.add(sp);
      var now = performance.now();
      shows.push({ key: m.k, cv: cv, tex: tex, sp: sp, t0: now, last: now, doneAt: 0, cells: m.cells, prize: m.prize, who: String(m.name || m.k).slice(0, 18), prog: [0, 0, 0, 0, 0, 0], done: false, dirty: true });
    }
    function progRemote(m) {
      if (!m || !Array.isArray(m.p) || m.p.length !== 6) return;
      var s = shows.filter(function (x) { return x.key === m.k; })[0];
      if (!s) return;
      s.prog = m.p.map(function (v) { v = Number(v); return clamp01((isFinite(v) ? v : 0) / FULL_AT); });
      s.last = performance.now();
      if (m.done && !s.done) { s.done = true; s.doneAt = s.last; s.prog = [1, 1, 1, 1, 1, 1]; }
      s.dirty = true;
    }
    function killShow(s) { if (s.sp.parent) s.sp.parent.remove(s.sp); s.tex.dispose(); s.sp.material.dispose(); }
    room.onRtMsg = function (ev, m, remote) { if (ev === 'scr') showRemote(m, remote); else if (ev === 'scp') progRemote(m); };

    /* --- cycle de vie, interface --- */
    room.hint = function (w) { return 'ZQSD / flèches : marcher · Maj : courir · F : parler à Bruno au comptoir ou prendre place aux tables · tes cartes sont dans la barre du bas (1, 2, 4, 5) : on les gratte ici, dans le PMU'; };
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.onEnter = function () { hereT = 99; if (loggedIn()) loadCards(); };
    room.onLeave = function () { closeTalk(true); stand(); if (PMU.self) PMU.self.finish(); shows.forEach(killShow); shows = []; };
    room.onPause = function () { closeTalk(true); };
    room.syncHud = function () { if (overlay && talk) { var b = overlay.querySelector('.pmup-bal b'); if (b) b.textContent = fmtN(balance()) + ' 🪙'; } };
    room.update = function (dt, w) {
      clockT += dt; var t = clockT, p = w.player;
      // « je suis au PMU » : le serveur n'autorise l'achat et le grattage que si on l'a signalé il y a moins de 45 s
      hereT += dt; if (hereT > 15 && loggedIn()) { hereT = 0; sg({ action: 'pmu_here' }, { silent: true }).then(function (r) { if (r && r.ok && !PMU.busy) setCards(r.cards); }); }
      var dx = p.x - seller.x, dz = p.z - seller.z, d = Math.hypot(dx, dz);
      var look = d < 9 ? Math.atan2(dx, dz) : 0, rel = Math.max(-1.0, Math.min(1.0, look)), dy = rel - seller.yaw;
      seller.yaw += dy * Math.min(1, dt * 5); seller.group.rotation.y = seller.yaw;
      var arms = seller.person.arms, k = Math.min(1, dt * 8), l0 = Math.sin(t * 1.2) * 0.05, r0 = Math.sin(t * 1.0 + 1) * 0.05;
      if (seller.cheer > 0) { seller.cheer -= dt; l0 = -2.7 + Math.sin(t * 12) * 0.25; r0 = -2.7 + Math.sin(t * 12 + 1) * 0.25; }
      else if (talk) r0 = -0.9 + Math.sin(t * 2.2) * 0.12;
      else if (d < 6 && w.mode === 'room') r0 = -2.6 + Math.sin(t * 7) * 0.22;
      arms[0].rotation.x = lerp(arms[0].rotation.x, l0, k); arms[1].rotation.x = lerp(arms[1].rotation.x, r0, k);
      // cartes affichées au-dessus des autres joueurs
      var now = performance.now();
      shows = shows.filter(function (s) {
        if ((s.done && now - s.doneAt > SHOW_MS) || now - s.last > 60000 || !s.sp.parent) { killShow(s); return false; }
        if (s.dirty) { drawCard(s.cv, s.cells, s.prize, s.prog, s.who, s.done); s.tex.needsUpdate = true; s.dirty = false; }
        s.sp.position.y = 3.25 + Math.sin(t * 2 + s.t0) * 0.04;
        return true;
      });
    };
    room.dispose = function () { closeTalk(true); shows.forEach(killShow); shows = []; if (seller) seller.person.dispose(); };
    return room;
  }

  F.registerRoom('pmu', createPmuRoom);
})();
