/* =====================================================================
   cups3d.js — La salle des gobelets (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « GOBELETS » du hall (hall3d.js) et on en ressort vers le hall.
   Trois tables, chacune avec un tabouret : on s'assoit (F ou clic), on règle sa mise (10 à 250 €), on lance la partie.
   La bille est cachée sous l'un des trois gobelets, les gobelets sont mélangés devant toi, puis on clique sur celui qu'on croit le bon.
   Le serveur décide de tout, comme dans le jeu du menu (api/_games.js : cups_start / cups_pick) : il choisit où est la bille, prélève la mise
   et paie le gain (x1,25) ; le navigateur ne fait que montrer le mélange et envoyer le gobelet choisi.
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), api/_games.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 12, HZ = 9, H = 5.2;
  var MIN_BET = 10, MAX_BET = 250, MULT = 1.25, CHIPS = [10, 25, 50, 100, 250];
  var TABLES = [{ x: -5.5, z: -3 }, { x: 0, z: -3 }, { x: 5.5, z: -3 }];
  var SLOT = [-0.55, 0, 0.55];           // les trois emplacements des gobelets sur la table
  var TOP_Y = 0.86;

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function balance() { var s = st(); return s && typeof s.balance === 'number' ? s.balance : 0; }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function sg(payload) {
    try { if (typeof serverGame === 'function') return Promise.resolve(serverGame(payload)).catch(function () { return { ok: false, error: 'Réseau indisponible.' }; }); } catch (e) { /* ok */ }
    return Promise.resolve({ ok: false, error: 'Serveur indisponible.' });
  }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function createCupsRoom(world) {
    var low = world.low;
    var room = { title: '🥤 GOBELETS', subtitle: 'TROUVE LA BILLE', topic: 'flambeurs-cups-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- salle : moquette violette étoilée, murs prune, dorures --- */
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'), fg = fx.createLinearGradient(0, 0, 256, 256); fg.addColorStop(0, '#2c0f4a'); fg.addColorStop(1, '#1b0a2e'); fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
    fx.strokeStyle = 'rgba(255,224,138,0.35)'; fx.lineWidth = 3; fx.strokeRect(2, 2, 252, 252); fx.fillStyle = 'rgba(255,224,138,0.5)';
    for (i = 0; i < 6; i++) { var sx0 = 30 + Math.random() * 196, sy0 = 30 + Math.random() * 196; fx.beginPath(); for (var k = 0; k < 10; k++) { var rad = k % 2 ? 4 : 10, an = -Math.PI / 2 + k * Math.PI / 5; fx.lineTo(sx0 + Math.cos(an) * rad, sy0 + Math.sin(an) * rad); } fx.closePath(); fx.fill(); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX, HZ); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wc = mkCanvas(256, 256), wx = wc.getContext('2d'), wg = wx.createLinearGradient(0, 0, 0, 256); wg.addColorStop(0, '#3d1566'); wg.addColorStop(1, '#2a0d47'); wx.fillStyle = wg; wx.fillRect(0, 0, 256, 256);
    wx.strokeStyle = 'rgba(255,224,138,0.22)'; wx.lineWidth = 2; for (i = -256; i <= 256; i += 64) { wx.beginPath(); wx.moveTo(i, 0); wx.lineTo(i + 256, 256); wx.stroke(); wx.beginPath(); wx.moveTo(i + 256, 0); wx.lineTo(i, 256); wx.stroke(); }
    wx.fillStyle = 'rgba(255,224,138,0.45)'; [[64, 64], [192, 64], [64, 192], [192, 192], [128, 128]].forEach(function (q) { wx.beginPath(); wx.arc(q[0], q[1], 6, 0, TAU); wx.fill(); });
    var wallTex = new THREE.CanvasTexture(wc); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.anisotropy = 4;
    function wall(len, px, pz, ry) { var t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 2.2, H / 2.2); var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }), woodM = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.55, metalness: 0.2 });
    [[HX * 2, 0.12, 0.1, 0, 1.2, -HZ + 0.05], [HX * 2, 0.12, 0.1, 0, 1.2, HZ - 0.05], [0.1, 0.12, HZ * 2, -HX + 0.05, 1.2, 0], [0.1, 0.12, HZ * 2, HX - 0.05, 1.2, 0], [HX * 2, 0.2, 0.2, 0, H - 0.1, -HZ + 0.1], [HX * 2, 0.2, 0.2, 0, H - 0.1, HZ - 0.1], [0.2, 0.2, HZ * 2, -HX + 0.1, H - 0.1, 0], [0.2, 0.2, HZ * 2, HX - 0.1, H - 0.1, 0]].forEach(function (d) { box(g, d[0], d[1], d[2], gold, d[3], d[4], d[5]); });
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0c0614 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    // enseigne
    var sc0 = mkCanvas(1024, 256), sx = sc0.getContext('2d'); sx.fillStyle = '#12061c'; sx.fillRect(0, 0, 1024, 256); sx.strokeStyle = '#ffe08a'; sx.lineWidth = 10; sx.strokeRect(10, 10, 1004, 236);
    sx.shadowColor = '#ffb347'; sx.shadowBlur = 26; sx.fillStyle = '#ffe9b0'; sx.font = '900 140px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('GOBELETS', 512, 134, 960);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: mkTex(sc0) })); sign.position.set(0, 3.5, -HZ + 0.07); g.add(sign);
    var tip = mkCanvas(1024, 150), tx2 = tip.getContext('2d'); tx2.fillStyle = '#12061c'; tx2.fillRect(0, 0, 1024, 150); tx2.strokeStyle = '#ffe08a'; tx2.lineWidth = 6; tx2.strokeRect(6, 6, 1012, 138);
    tx2.fillStyle = '#ffe9b0'; tx2.font = '800 52px ' + SERIF; tx2.textAlign = 'center'; tx2.textBaseline = 'middle'; tx2.fillText('Trouve la bille : gain x1,25 · mise de 10 à 250 €', 512, 80, 960);
    var tipM = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.94), new THREE.MeshBasicMaterial({ map: mkTex(tip) })); tipM.position.set(0, 2.0, -HZ + 0.07); g.add(tipM);

    /* --- tables, tabourets, gobelets --- */
    var clothM = new THREE.MeshStandardMaterial({ color: 0x5b1f8a, roughness: 0.9 }), cupM = new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: 0.45, metalness: 0.1 }), rimM = new THREE.MeshStandardMaterial({ color: 0xf6f0e0, roughness: 0.4 });
    var ballM = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.2, metalness: 0.9, emissive: 0x553300 }), seatM = new THREE.MeshStandardMaterial({ color: 0x8f0f20, roughness: 0.6 }), chromeM = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.8 });
    var cupGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.24, 20), cupRim = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 20), ballGeo = new THREE.SphereGeometry(0.05, 16, 12);
    var tables = [], seats = [], timers = [], clockT = 0;
    function later(sec, fn) { timers.push({ t: sec, fn: fn }); }
    TABLES.forEach(function (td, ti) {
      var grp = new THREE.Group(); grp.position.set(td.x, 0, td.z); g.add(grp);
      var top = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 40), clothM); top.position.y = TOP_Y - 0.05; grp.add(top);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 8, 40), gold); rim.rotation.x = Math.PI / 2; rim.position.y = TOP_Y; grp.add(rim);
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, TOP_Y - 0.1, 14), woodM); ped.position.y = (TOP_Y - 0.1) / 2; grp.add(ped);
      var T = { i: ti, x: td.x, z: td.z, group: grp, cups: [], pos: [0, 1, 2], phase: 'idle', ballCup: 0, cupMeshes: [] };
      for (var c = 0; c < 3; c++) {
        var cg = new THREE.Group(); cg.position.set(SLOT[c], TOP_Y, 0); grp.add(cg);
        var mesh = new THREE.Mesh(cupGeo, cupM); mesh.position.y = 0.12; cg.add(mesh); var rm = new THREE.Mesh(cupRim, rimM); rm.position.y = -0.105; mesh.add(rm); mesh.userData.cup = { t: ti, id: c };      // le bord blanc suit le gobelet quand il se lève
        var ball = new THREE.Mesh(ballGeo, ballM); ball.position.set(0, 0.05, 0); ball.visible = false; cg.add(ball);
        T.cups.push({ g: cg, mesh: mesh, ball: ball, lift: 0, liftTo: 0, id: c });
        T.cupMeshes.push(mesh);
      }
      tables.push(T);
      room.colliders.push({ x: td.x, z: td.z, r: 1.3 });
      // tabouret face à la table
      var sx0 = td.x, sz0 = td.z + 1.55, s = { n: ti, x: sx0, z: sz0, yaw: 0, tx: td.x, tz: td.z, table: T, sx: td.x, sz: td.z + 2.5 };
      seats.push(s);
      var sc = new THREE.Group(); sc.position.set(sx0, 0, sz0); g.add(sc);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), chromeM); stem.position.y = 0.3; sc.add(stem);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 14), chromeM); base.position.y = 0.02; sc.add(base);
      var cush = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 16), seatM); cush.position.y = 0.6; sc.add(cush);
      room.colliders.push({ x: sx0, z: sz0, r: 0.3 });
      var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sx0, 0.7, sz0); g.add(hit);
      room.interactables.push({ hit: hit, x: sx0, z: sz0, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S\'asseoir — Table ' + (ti + 1); }, use: function (w) { sit(w, s); } });
    });
    var lampLight = low ? null : [-5.5, 0, 5.5].forEach(function (x) { var pl = new THREE.PointLight(0xffd9a0, 0.8, 9); pl.position.set(x, 3.2, -2.4); g.add(pl); });

    /* --- la partie --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, bet = 50, hover = -1;
    var R = { busy: false, msg: '' };
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function slotX(T, c) { return SLOT[T.pos[c]]; }
    function setMsg(t, col) { R.msg = t; if (ui) { var m = ui.el.querySelector('.cp-msg'); m.textContent = t || ''; m.style.color = col || ''; } }
    function refreshUi() {
      if (!ui || !seat) return;
      var T = seat.table, idle = T.phase === 'idle' && !R.busy;
      ui.el.querySelector('.cp-bal b').textContent = fmtN(balance()) + ' 🪙'; ui.el.querySelector('.cp-bet b').textContent = fmtN(bet) + ' 🪙 → ' + fmtN(Math.floor(bet * MULT)) + ' 🪙';
      ui.el.querySelector('.cp-chips').style.display = idle ? '' : 'none'; ui.el.querySelector('[data-a=go]').style.display = idle ? '' : 'none';
    }
    function liftAll(T, on) { T.cups.forEach(function (c) { c.liftTo = on ? 0.34 : 0; }); }
    function startGame() {
      var T = seat && seat.table; if (!T || T.phase !== 'idle' || R.busy) return;
      if (!loggedIn()) { setMsg('Connecte-toi pour jouer aux gobelets.', '#ff8a80'); return; }
      if (bet < MIN_BET || bet > MAX_BET) { setMsg('Mise entre ' + MIN_BET + ' et ' + MAX_BET + ' 🪙.', '#ff8a80'); return; }
      if (bet > balance()) { setMsg('Solde insuffisant pour cette mise.', '#ff8a80'); return; }
      R.busy = true; setMsg('Mise en place…'); refreshUi();
      sg({ action: 'cups_start', bet: bet }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { setMsg((r && r.error) || 'Impossible de lancer la partie.', '#ff8a80'); refreshUi(); return; }
        T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.x = SLOT[k]; c.ball.visible = false; });
        T.ballCup = r.ballCup; T.cups[r.ballCup].ball.visible = true; T.phase = 'show';
        setMsg('Regarde bien où est la bille…'); refreshUi();
        liftAll(T, true);
        later(1.6, function () { liftAll(T, false); later(0.6, function () { shuffle(T); }); });
      });
    }
    // mélange : une trentaine de permutations rapides, la dernière position de chaque gobelet est ce que le joueur voit
    function shuffle(T) {
      T.phase = 'shuffle'; setMsg('Ça mélange…'); refreshUi();
      var swaps = 15, k;
      T.sw = [];
      for (k = 0; k < swaps; k++) { var a = Math.floor(Math.random() * 3), b; do { b = Math.floor(Math.random() * 3); } while (b === a); T.sw.push([a, b]); }
      T.swI = -1; T.swT = 0; T.swDur = 0.27; T.cur = null;
    }
    function stepSwap(T, dt) {
      if (T.phase !== 'shuffle') return;
      if (!T.cur) {
        T.swI++; if (T.swI >= T.sw.length) { T.phase = 'pick'; setMsg('Clique sur le gobelet qui cache la bille.'); refreshUi(); return; }
        var pa = T.sw[T.swI][0], pb = T.sw[T.swI][1], ca = T.pos.indexOf(pa), cb = T.pos.indexOf(pb);           // gobelets qui occupent les emplacements pa et pb
        T.cur = { ca: ca, cb: cb, pa: pa, pb: pb, t: 0 };
      }
      var s = T.cur; s.t += dt; var u = Math.min(1, s.t / T.swDur), e = u * u * (3 - 2 * u), arc = Math.sin(u * Math.PI) * 0.22;
      T.cups[s.ca].g.position.x = SLOT[s.pa] + (SLOT[s.pb] - SLOT[s.pa]) * e; T.cups[s.ca].g.position.z = arc;
      T.cups[s.cb].g.position.x = SLOT[s.pb] + (SLOT[s.pa] - SLOT[s.pb]) * e; T.cups[s.cb].g.position.z = -arc;
      if (u >= 1) { T.pos[s.ca] = s.pb; T.pos[s.cb] = s.pa; T.cups[s.ca].g.position.z = 0; T.cups[s.cb].g.position.z = 0; T.cur = null; }
    }
    function pick(T, id) {
      if (T.phase !== 'pick' || R.busy) return;
      R.busy = true; T.phase = 'result'; setMsg('…'); refreshUi();
      sg({ action: 'cups_pick', cup: id }).then(function (r) {
        R.busy = false;
        if (!r || !r.ok) { T.phase = 'pick'; setMsg((r && r.error) || 'Choix impossible.', '#ff8a80'); refreshUi(); return; }
        liftAll(T, true); T.cups[r.ballCup !== undefined ? r.ballCup : T.ballCup].ball.visible = true;
        if (r.correct) setMsg('🏆 Trouvé ! +' + fmtN(r.win) + ' 🪙', '#7ee0a0'); else setMsg('Raté… la bille était sous un autre gobelet.', '#ff8a80');
        refreshUi();
        later(3.5, function () { liftAll(T, false); T.cups.forEach(function (c) { c.ball.visible = false; }); later(0.5, function () { T.phase = 'idle'; T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.x = SLOT[k]; }); setMsg('Place ta mise puis lance la partie.'); refreshUi(); }); });
      });
    }

    /* --- s'asseoir / se lever, interface --- */
    function injectCss() {
      if (document.getElementById('cp3d-css')) return;
      var s = document.createElement('style'); s.id = 'cp3d-css';
      s.textContent = '.cp3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(520px,92%);background:rgba(8,5,12,.9);border:1px solid rgba(255,224,138,.6);border-radius:16px;padding:12px 14px;color:#ffe9b0;pointer-events:auto;display:flex;flex-direction:column;gap:8px;z-index:5}' +
        '.cp3d .cp-top{display:flex;justify-content:space-between;font-weight:800;font-size:13px}.cp3d .cp-msg{min-height:20px;text-align:center;font-weight:800;font-size:15px}' +
        '.cp3d .cp-chips{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.cp3d .cp-chip{padding:6px 11px;border-radius:999px;border:2px solid #ffe08a;background:#241218;color:#ffe08a;font-weight:900;font-size:13px;cursor:pointer}' +
        '.cp3d .cp-chip.minus{border-color:#ff8a80;color:#ff8a80}.cp3d .cp-b{padding:10px 22px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a1208;background:linear-gradient(90deg,#f5a623,#e07b00);align-self:center}' +
        '.cp3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.cp3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(255,224,138,.6);background:rgba(8,5,12,.85);color:#ffe9b0;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    var standEl = null;
    function onSeatKey(e) { if (seat && (e.code === 'Escape' || e.code === 'KeyF')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); } }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; R.busy = false; s.table.phase = 'idle';
      injectCss();
      var el = document.createElement('div'); el.className = 'cp3d';
      el.innerHTML = '<div class="cp-top"><span class="cp-bal">Solde : <b></b></span><span class="cp-bet">Mise : <b></b></span></div><div class="cp-msg"></div>' +
        '<div class="cp-chips">' + CHIPS.map(function (c) { return '<button class="cp-chip" data-c="' + c + '">+' + c + '</button>'; }).join('') + '<button class="cp-chip minus" data-c="-1">Effacer</button></div><button class="cp-b" data-a="go">Lancer la partie</button>';
      w.container.appendChild(el); ui = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.c) { if (seat.table.phase !== 'idle' || R.busy) return; bet = b.dataset.c === '-1' ? MIN_BET : bet + parseInt(b.dataset.c, 10); bet = Math.max(MIN_BET, Math.min(MAX_BET, bet)); refreshUi(); return; }
        if (b.dataset.a === 'go') startGame();
      });
      standEl = document.createElement('div'); standEl.className = 'cp3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      setMsg(loggedIn() ? 'Place ta mise puis lance la partie.' : 'Connecte-toi pour jouer.'); refreshUi();
    }
    function stand() {
      if (!seat) return;
      var s = seat; seat = null; timers = [];
      var T = s.table; T.phase = 'idle'; T.cur = null; T.pos = [0, 1, 2]; T.cups.forEach(function (c, k) { c.g.position.set(SLOT[k], TOP_Y, 0); c.liftTo = 0; c.lift = 0; c.mesh.position.y = 0.12; c.ball.visible = false; });
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.12, z: 0.28 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-0.6, Math.min(0.6, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.3, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.5; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.2; }
      var ex = s.x, ey = 1.55, ez = s.z - 0.3, a = view.yaw, p = Math.atan2(TOP_Y + 0.1 - ey, 1.5) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 5, ty: ey + Math.sin(p) * 5, tz: ez - Math.cos(a) * Math.cos(p) * 5, fov: 55 };
    };
    // clic sur un gobelet pendant la phase de choix
    room.seatClick = function (ray) {
      if (!seat) return;
      var hit = ray.intersectObjects(seat.table.cupMeshes, false)[0];
      if (hit && hit.object.userData.cup) pick(seat.table, hit.object.userData.cup.id);
    };
    room.syncHud = function () { refreshUi(); };

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    g.add(new THREE.AmbientLight(0xf0dcff, 0.9));
    var key = new THREE.DirectionalLight(0xfff0e0, 0.4); key.position.set(3, 8, 5); g.add(key);
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un tabouret pour t\'asseoir' : 'ZQSD / flèches : marcher · Maj : courir · avance vers un tabouret (F ou clic) · assis : mise, Lancer, puis clique sur un gobelet · F : se lever'; };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt;
      for (i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { if (window.console) console.warn('[cups3d]', e); } } }
      tables.forEach(function (T) {
        stepSwap(T, dt);
        T.cups.forEach(function (c) { c.lift += (c.liftTo - c.lift) * Math.min(1, dt * 9); c.mesh.position.y = 0.12 + c.lift; });
      });
    };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('cups', createCupsRoom);
})();
