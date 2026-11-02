/* =====================================================================
   loupgarou3d.js — Le Loup-Garou en 3D (monde 3D)
   ---------------------------------------------------------------------
   On y entre par la porte « LOUP GAROU » du hall (hall3d.js) et on en ressort vers le hall.
   Une place de village de nuit avec TROIS tables rondes (Salon 1, 2, 3 : 12 places chacune, comme les salons du Blind Test). On s'assoit sur un
   tabouret (F ou clic) : on entre dans le salon de cette table. Le premier arrivé en est le chef : il règle les rôles (8 rôles : villageois,
   loup-garou, voyante, sorcière, chasseur, cupidon, petite fille, idiot du village) et lance la partie.
   Tout est géré par le serveur (api/loupgarou.js) : les rôles restent secrets, les phases (annonce du rôle, nuit, aube, discussion, vote)
   suivent son horloge. Ici on affiche : le décor qui passe de la nuit au jour, le panneau d'action de chaque rôle, et les mouvements des
   joueurs assis (tête tournée vers celui qu'on vote, bras qui désigne, corps affalé quand on est éliminé) à partir de l'état du serveur,
   donc tout le monde voit la même chose au même moment.
   Fichiers liés : f3d-core.js (personnages : look / point / slump), world3d.js, hall3d.js (la porte), api/loupgarou.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU;

  var HX = 19, HZ = 12, H = 7.5;
  var TABLES = [{ x: -11, z: -1.5 }, { x: 0, z: -1.5 }, { x: 11, z: -1.5 }];
  var NSEAT = 12, SEAT_R = 2.8, TABLE_R = 1.55;
  var ROLE_EMO = { villageois: '🧑‍🌾', loup: '🐺', voyante: '🔮', sorciere: '🧙‍♀️', chasseur: '🔫', cupidon: '💘', petitefille: '👧', idiot: '🤡' };
  var ROLE_NAME = { villageois: 'Villageois', loup: 'Loup-Garou', voyante: 'Voyante', sorciere: 'Sorcière', chasseur: 'Chasseur', cupidon: 'Cupidon', petitefille: 'Petite Fille', idiot: 'Idiot du village' };
  var ROLE_ORDER = ['villageois', 'loup', 'voyante', 'sorciere', 'chasseur', 'cupidon', 'petitefille', 'idiot'];
  var ROLE_DESC = {
    villageois: 'Tu n’as aucun pouvoir : observe, discute et vote pour trouver les loups.',
    loup: 'Chaque nuit, avec les autres loups, tu choisis un villageois à dévorer. Le jour, fais-toi passer pour un innocent !',
    voyante: 'Chaque nuit, tu découvres le vrai rôle d’un joueur de ton choix.',
    sorciere: 'Tu as une potion de vie (sauver la victime des loups) et une potion de poison (tuer quelqu’un). Une seule fois chacune.',
    chasseur: 'Quand tu meurs, tu emportes quelqu’un avec toi : tu tires sur le joueur de ton choix.',
    cupidon: 'La première nuit, tu désignes deux amoureux. Si l’un meurt, l’autre meurt de chagrin.',
    petitefille: 'La nuit, tu peux espionner les loups : tu apprends l’identité d’un loup… mais s’ils te repèrent, c’est toi qu’ils dévorent !',
    idiot: 'Si le village te vote, tu es épargné (une seule fois) mais tu perds ton droit de vote.'
  };
  var UNIQUE = { voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1, petitefille: 1, idiot: 1 };

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function setBalance(b) {
    if (typeof b !== 'number') return;
    try { var s = st(); s.balance = b; s.lastBalanceChange = Date.now(); if (typeof saveState === 'function') saveState(); if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) { /* ok */ }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrapPi(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function seatPos(ti, si) {
    var t = TABLES[ti], a = si / NSEAT * TAU, px = t.x + Math.sin(a) * SEAT_R, pz = t.z + Math.cos(a) * SEAT_R;
    return { x: px, z: pz, yaw: Math.atan2(t.x - px, -(t.z - pz)) };
  }

  // panorama du village (nuit ou jour) : maisons, sapins, lune ou soleil
  function panorama(night) {
    var W = 2048, Hh = 512, c = mkCanvas(W, Hh), x = c.getContext('2d'), i;
    var g = x.createLinearGradient(0, 0, 0, Hh);
    if (night) { g.addColorStop(0, '#04050d'); g.addColorStop(0.6, '#16183a'); g.addColorStop(1, '#2a2048'); } else { g.addColorStop(0, '#4aa3f0'); g.addColorStop(0.65, '#9fd3ff'); g.addColorStop(1, '#e9f6ff'); }
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    if (night) { for (i = 0; i < 260; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.7) + ')'; x.fillRect(Math.random() * W, Math.random() * 260, 2, 2); } }
    var cg = x.createRadialGradient(1500, 120, 10, 1500, 120, 110); if (night) { cg.addColorStop(0, '#fffbe8'); cg.addColorStop(0.5, '#f1e7b8'); cg.addColorStop(1, 'rgba(241,231,184,0)'); } else { cg.addColorStop(0, '#fff6c8'); cg.addColorStop(0.4, '#ffe680'); cg.addColorStop(1, 'rgba(255,230,128,0)'); }
    x.fillStyle = cg; x.beginPath(); x.arc(1500, 120, 110, 0, TAU); x.fill();
    if (!night) { x.fillStyle = 'rgba(255,255,255,0.85)'; [[300, 110, 90], [700, 80, 70], [1100, 140, 100], [1800, 90, 80]].forEach(function (p) { x.beginPath(); x.ellipse(p[0], p[1], p[2], p[2] * 0.35, 0, 0, TAU); x.ellipse(p[0] + p[2] * 0.5, p[1] + 8, p[2] * 0.7, p[2] * 0.3, 0, 0, TAU); x.fill(); }); }
    var far = night ? '#0b0c1e' : '#6f8ab0', near = night ? '#05060d' : '#35506f', roof = night ? '#0a0a16' : '#8a3a30', wall = night ? '#14122a' : '#d8c6a0';
    x.fillStyle = far; for (i = 0; i < 40; i++) { var fx = i * 52, fh = 120 + Math.random() * 110; x.beginPath(); x.moveTo(fx, Hh); x.lineTo(fx + 26, Hh - fh); x.lineTo(fx + 52, Hh); x.closePath(); x.fill(); }
    for (i = 0; i < 12; i++) {                                  // maisons du village
      var hx = 40 + i * 170 + Math.random() * 30, hw = 90 + Math.random() * 50, hh = 70 + Math.random() * 40, base = Hh - 20;
      x.fillStyle = wall; x.fillRect(hx, base - hh, hw, hh); x.fillStyle = roof; x.beginPath(); x.moveTo(hx - 10, base - hh); x.lineTo(hx + hw / 2, base - hh - 55); x.lineTo(hx + hw + 10, base - hh); x.closePath(); x.fill();
      x.fillStyle = night ? 'rgba(255,200,90,0.9)' : '#7aa8cf'; x.fillRect(hx + 14, base - hh + 18, 18, 22); x.fillRect(hx + hw - 32, base - hh + 18, 18, 22);
    }
    x.fillStyle = near; for (i = 0; i < 46; i++) { var tx = i * 46 + Math.random() * 16, th = 90 + Math.random() * 120; x.beginPath(); x.moveTo(tx, Hh); x.lineTo(tx + 22, Hh - th); x.lineTo(tx + 44, Hh); x.closePath(); x.fill(); }
    var t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
  }

  function createLoupGarouRoom(world) {
    var low = world.low;
    var room = { title: '🐺 LOUP-GAROU', subtitle: 'TROIS TABLES · 4 À 12 JOUEURS', topic: 'flambeurs-loupgarou-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i, k;
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    /* --- le village : sol de pavés, panorama (nuit / jour) sur les quatre murs, ciel --- */
    var fc = mkCanvas(512, 512), fx = fc.getContext('2d'); fx.fillStyle = '#26232c'; fx.fillRect(0, 0, 512, 512);
    for (i = 0; i < 160; i++) { var px0 = (i % 16) * 32 + (Math.floor(i / 16) % 2) * 16, py0 = Math.floor(i / 16) * 51; fx.fillStyle = 'rgba(' + (60 + Math.random() * 40) + ',' + (56 + Math.random() * 36) + ',' + (70 + Math.random() * 36) + ',0.9)'; rr(fx, px0 + 2, py0 + 2, 28, 47, 6); fx.fill(); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2.5, HZ / 2.5); ft.anisotropy = 8;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var texNight = panorama(true), texDay = panorama(false);
    var wallM = new THREE.MeshBasicMaterial({ map: texNight });
    function wall(w, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallM); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceilM = new THREE.MeshBasicMaterial({ color: 0x05060d }), ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), ceilM); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    var sc0 = mkCanvas(2048, 384), sx0 = sc0.getContext('2d'); sx0.textAlign = 'center'; sx0.textBaseline = 'middle'; sx0.shadowColor = '#7b6dff'; sx0.shadowBlur = 50; sx0.fillStyle = '#efe9ff'; sx0.font = '900 230px ' + SERIF; sx0.fillText('🐺 LOUP-GAROU', 1024, 190, 1980);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: mkTex(sc0), transparent: true, depthWrite: false })); sign.position.set(0, 5.6, -HZ + 0.1); g.add(sign);

    /* --- les trois tables : bois sombre, lanterne au centre, 12 tabourets --- */
    var woodM = new THREE.MeshStandardMaterial({ color: 0x3a2314, roughness: 0.7 }), woodD = new THREE.MeshStandardMaterial({ color: 0x24150b, roughness: 0.8 });
    var glassM = new THREE.MeshBasicMaterial({ color: 0xffd486 }), flameM = new THREE.MeshBasicMaterial({ color: 0xffa530 });
    var seats = [], flames = [], boards = [], lights = [], seatTags = [];
    TABLES.forEach(function (T, ti) {
      var tg = new THREE.Group(); tg.position.set(T.x, 0, T.z); g.add(tg);
      var top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.14, 40), woodM); top.position.y = 0.82; tg.add(top);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.05, 8, 48), woodD); rim.rotation.x = Math.PI / 2; rim.position.y = 0.89; tg.add(rim);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 0.78, 14), woodD); leg.position.y = 0.39; tg.add(leg);
      var lant = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 10), glassM); lant.position.y = 1.1; tg.add(lant);
      var cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.1, 10), woodD); cap.position.y = 1.3; tg.add(cap);
      var fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), flameM); fl.scale.y = 1.5; fl.position.y = 1.1; tg.add(fl); flames.push(fl);
      room.colliders.push({ x: T.x, z: T.z, r: TABLE_R + 0.15 });
      if (!low) { var pl = new THREE.PointLight(0xffa850, 0.8, 8); pl.position.set(T.x, 2.2, T.z); g.add(pl); lights.push(pl); }
      for (var si = 0; si < NSEAT; si++) {
        (function (si) {
          var sp = seatPos(ti, si), n = ti * NSEAT + si, s = { n: n, ti: ti, si: si, x: sp.x, z: sp.z, yaw: sp.yaw, sx: T.x + Math.sin(si / NSEAT * TAU) * (SEAT_R + 1.0), sz: T.z + Math.cos(si / NSEAT * TAU) * (SEAT_R + 1.0) };
          seats.push(s);
          var stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.4, 14), woodM); stool.position.set(sp.x, 0.2, sp.z); g.add(stool);
          var cush = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14), woodD); cush.position.set(sp.x, 0.43, sp.z); g.add(cush);
          room.colliders.push({ x: sp.x, z: sp.z, r: 0.26 });
          var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sp.x, 0.65, sp.z); g.add(hit);
          room.interactables.push({ hit: hit, x: sp.x, z: sp.z, radius: 1.5, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S’asseoir — Salon ' + (ti + 1) + (roomInfo(ti) ? ' (' + roomInfo(ti).players + '/' + NSEAT + ')' : ''); }, use: function (w) { sit(w, s); } });
        })(si);
      }
      // panneau du salon, derrière la table
      var bc = mkCanvas(1024, 440), bt = mkTex(bc), bm = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.89), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      bm.position.set(T.x, 3.3, T.z - 4.9); g.add(bm); box(g, 4.6, 2.1, 0.08, woodD, T.x, 3.3, T.z - 4.97);
      box(g, 0.12, 3.2, 0.12, woodD, T.x - 2.0, 1.6, T.z - 4.97); box(g, 0.12, 3.2, 0.12, woodD, T.x + 2.0, 1.6, T.z - 4.97);
      boards.push({ cv: bc, c: bc.getContext('2d'), tex: bt, sig: '' });
    });
    // étiquettes au-dessus des places de la table où l'on est assis (votes reçus, mort, loup…)
    for (i = 0; i < NSEAT; i++) {
      var tc = mkCanvas(256, 96), tt = new THREE.CanvasTexture(tc), sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true, depthWrite: false }));
      sp2.scale.set(0.9, 0.34, 1); sp2.visible = false; g.add(sp2); seatTags.push({ sp: sp2, cv: tc, c: tc.getContext('2d'), tex: tt, sig: '' });
    }
    var amb = new THREE.AmbientLight(0x6a72bd, 0.6); g.add(amb);
    var moonL = new THREE.PointLight(0xdde4ff, 0.7, 40); moonL.position.set(0, 6, -6); g.add(moonL);

    /* --- état partagé (serveur) --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, standEl = null, S = null, off = 0, rooms = null, polling = false, listPolling = false, pollT = 0, listT = 0, busy = false;
    var code = '', shownKey = '', pick1 = '', pick2 = '', witchHeal = false, titleEl = null, titleT = 0, lastRoleSeen = '', env = 0, envTarget = 0, flash = '', flashT = 0;
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (kk) { var r = world.remote[kk]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function roomInfo(ti) { return rooms && rooms[ti] ? rooms[ti] : null; }
    function nowS() { return Date.now() + off; }
    function api(body) {
      return world.post('/api/loupgarou', Object.assign({ code: code }, body)).then(function (r) {
        if (!r) return { ok: false, error: 'Connecte-toi pour jouer.' };
        if (r.state) applyState(r.state);
        if (typeof r.balance === 'number') setBalance(r.balance);
        return r;
      });
    }
    function applyState(s) { if (!s) return; S = s; off = s.serverNow - Date.now(); envTarget = s.isNight ? 0 : (s.status === 'playing' ? 1 : 0.25); refreshUi(); }
    function poll() {
      if (polling || !code) return; polling = true;
      fetch('/api/loupgarou?code=' + encodeURIComponent(code), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { polling = false; if (d && d.ok && d.state && seat) { if (!d.state.you) { world.flash('Tu n’es plus dans ce salon.'); stand(); } else applyState(d.state); } }).catch(function () { polling = false; });
    }
    function pollList() {
      if (listPolling) return; listPolling = true;
      fetch('/api/loupgarou', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { listPolling = false; if (d && d.ok) rooms = d.rooms; }).catch(function () { listPolling = false; });
    }

    /* --- panneaux des salons (dessinés quand ils changent) --- */
    function drawBoard(ti) {
      var b = boards[ti], info = roomInfo(ti), c = b.c, W = 1024, Hh = 440;
      var live = seat && seat.ti === ti && S;
      var sig = live ? [S.status, S.phase, S.night, S.players.length].join('|') : (info ? info.players + info.status + info.night : 'x');
      if (b.sig === sig) return; b.sig = sig;
      c.fillStyle = '#120c18'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#8b7dff'; c.lineWidth = 10; c.strokeRect(8, 8, W - 16, Hh - 16);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#efe9ff'; c.shadowColor = '#7b6dff'; c.shadowBlur = 20; c.font = '900 120px ' + SERIF; c.fillText('SALON ' + (ti + 1), W / 2, 100, W - 80); c.shadowBlur = 0;
      var n = live ? S.players.length : info ? info.players : 0, status = live ? S.status : info ? info.status : 'lobby', night = live ? S.isNight : info && info.night;
      c.fillStyle = '#fff'; c.font = '800 70px ' + SERIF; c.fillText(n + ' / ' + NSEAT + ' joueurs', W / 2, 220, W - 80);
      c.fillStyle = '#ffd98a'; c.font = '700 50px ' + SERIF;
      c.fillText(status === 'playing' ? (night ? '🌙 Nuit en cours' : '☀️ Journée en cours') : status === 'finished' ? '🏁 Partie terminée' : n ? '⏳ En attente du lancement' : '🪑 Assieds-toi pour ouvrir ce salon', W / 2, 330, W - 80);
    }
    function drawSeatTag(tg, lines, col) {
      var sig = lines.join('|') + col; if (tg.sig === sig) return; tg.sig = sig;
      var c = tg.c; c.clearRect(0, 0, 256, 96); if (!lines.length) { tg.tex.needsUpdate = true; return; }
      c.fillStyle = 'rgba(10,6,18,0.82)'; rr(c, 4, 4, 248, 88, 22); c.fill(); c.strokeStyle = col || '#8b7dff'; c.lineWidth = 4; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = '800 38px ' + F.EMOJI_FONT;
      if (lines.length === 1) c.fillText(lines[0], 128, 50, 230); else { c.font = '800 32px ' + F.EMOJI_FONT; c.fillText(lines[0], 128, 32, 230); c.fillText(lines[1], 128, 68, 230); }
      tg.tex.needsUpdate = true;
    }

    /* --- interface --- */
    function injectCss() {
      if (document.getElementById('lg3d-css')) return;
      var s = document.createElement('style'); s.id = 'lg3d-css';
      s.textContent = '.lg3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(680px,96%);max-height:62%;overflow:auto;background:rgba(10,6,18,.93);border:1px solid rgba(139,125,255,.65);border-radius:16px;padding:10px 14px;color:#ece6ff;pointer-events:auto;display:flex;flex-direction:column;gap:7px;z-index:5;font-size:13px}' +
        '.lg3d .lg-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800}.lg3d .lg-time{font-family:' + MONO + ';font-size:16px;color:#ffd98a}.lg3d .lg-msg{text-align:center;font-weight:800;font-size:14px;min-height:18px}' +
        '.lg3d .lg-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}.lg3d .lg-b{padding:8px 16px;border-radius:12px;border:0;font-weight:900;font-size:14px;cursor:pointer;color:#14091f;background:linear-gradient(90deg,#c9bcff,#8b7dff)}.lg3d .lg-b:disabled{opacity:.4;cursor:not-allowed}.lg3d .lg-b.alt{background:#2a2540;color:#e4dcff}.lg3d .lg-b.red{background:linear-gradient(90deg,#ff8a8a,#d63a3a);color:#fff}.lg3d .lg-b.go{background:linear-gradient(90deg,#ffd24a,#f08a00)}' +
        '.lg3d .lg-p{padding:7px 12px;border-radius:999px;border:2px solid #4b4270;background:#1a1330;color:#ece6ff;font-weight:800;font-size:13px;cursor:pointer}.lg3d .lg-p:hover{border-color:#8b7dff}.lg3d .lg-p.on{border-color:#ffd24a;background:#3b2f10}.lg3d .lg-p.wolf{border-color:#d63a3a}.lg3d .lg-p small{opacity:.7;font-weight:600;margin-left:4px}' +
        '.lg3d .lg-roles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.lg3d .lg-rc{background:#1a1330;border:1px solid #3a3160;border-radius:12px;padding:6px 4px;text-align:center}.lg3d .lg-rc b{display:block;font-size:22px}.lg3d .lg-rc span{display:block;font-size:11px;font-weight:700;margin-bottom:3px}.lg3d .lg-rc i{font-style:normal;display:inline-flex;align-items:center;gap:5px}.lg3d .lg-rc button{width:24px;height:24px;border-radius:7px;border:0;background:#3b3166;color:#fff;font-weight:900;cursor:pointer}.lg3d .lg-rc button:disabled{opacity:.35;cursor:default}' +
        '.lg3d .lg-log{font-size:11px;color:#a89fc9;max-height:54px;overflow:hidden}.lg3d .lg-log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lg3d .lg-note{font-size:12px;color:#c9c0e8;text-align:center}.lg3d kbd{opacity:.7;font-size:11px;margin-left:4px}' +
        '.lg-role{position:absolute;right:14px;top:92px;z-index:5;pointer-events:none;background:rgba(10,6,18,.88);border:1px solid rgba(139,125,255,.7);border-radius:14px;padding:6px 12px;color:#fff;font-weight:900;font-size:14px;text-align:center}.lg-role small{display:block;font-size:11px;font-weight:700;color:#cbbfff}' +
        '.lg-title{position:absolute;left:0;right:0;top:20%;text-align:center;z-index:9;pointer-events:none;font-family:' + SERIF + ';font-weight:900;text-shadow:0 4px 0 #000,0 0 30px rgba(0,0,0,.8);opacity:0;transition:opacity .4s}.lg-title.in{opacity:1}.lg-title big{display:block;font-size:clamp(30px,6.4vw,76px);color:#ffb347}.lg-title big b{color:#fff}.lg-title span{display:block;font-size:clamp(18px,3.4vw,40px);color:#fff1a0;margin-top:6px}.lg-title.wolfc big b{color:#ff5a5a}.lg-title.vill big b{color:#5dff7a}' +
        '.lg3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.lg3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(139,125,255,.7);background:rgba(10,6,18,.88);color:#ece6ff;font-weight:800;cursor:pointer}' +
        '@media (max-height:520px){.lg3d{bottom:62px;width:min(640px,66%);padding:5px 8px;gap:3px;max-height:56%}.lg3d .lg-msg{font-size:12px}.lg3d .lg-b{padding:5px 11px;font-size:12px}.lg3d .lg-p{padding:4px 8px;font-size:12px}.lg3d .lg-rc b{font-size:16px}.lg3d-stand{bottom:auto;top:64px}.lg-role{top:70px;font-size:12px}}';
      document.head.appendChild(s);
    }
    function pl(name) { if (!S) return null; for (var q = 0; q < S.players.length; q++) if (S.players[q].name === name) return S.players[q]; return null; }
    function fmtT(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    function phaseText() {
      if (!S) return '';
      var ph = S.phase, y = S.you || {};
      if (S.status === 'lobby') return 'En attente';
      if (S.status === 'finished') return 'Partie terminée';
      var t = { reveal: 'Découvre ton rôle', cupidon: '🌙 Nuit ' + S.night + ' — Cupidon', voyante: '🌙 Nuit ' + S.night + ' — la Voyante', loups: '🌙 Nuit ' + S.night + ' — les Loups', sorciere: '🌙 Nuit ' + S.night + ' — la Sorcière', dawn: '🌅 Le jour se lève', chasseur: '🔫 Le Chasseur tire', discussion: '☀️ Discussion', vote: '🗳️ Vote', result: '⚖️ Verdict' };
      return t[ph] || '';
    }
    function playerBtns(filter, selected, wolfMark) {
      return S.players.filter(filter).map(function (p) {
        var mark = p.role && (wolfMark && p.role === 'loup') ? ' 🐺' : '';
        return '<button class="lg-p' + (selected === p.name ? ' on' : '') + (p.role === 'loup' && wolfMark ? ' wolf' : '') + '" data-t="' + esc(p.name) + '">' + esc(p.avatar) + ' ' + esc(p.name) + mark + '</button>';
      }).join('');
    }
    function refreshUi() {
      if (!ui || !seat || !S) return;
      var s = S, y = s.you || {}, host = !!y.host, el = ui.el, body = el.querySelector('.lg-body');
      var key = JSON.stringify([s.status, s.phase, s.night, s.cfg, s.players.map(function (p) { return [p.name, p.alive, p.voted, p.role, p.idiot, p.winner]; }), y.act, y.role, y.lover, y.alive, y.seenLog, y.knownWolves, y.witch, y.wolfVotes, y.spied, s.winner, s.lastVoteResult, pick1, pick2, witchHeal, host, flash]);
      if (key !== shownKey) {
        shownKey = key;
        var h = '';
        if (s.status === 'lobby') {
          var n = s.players.length, tot = s.total;
          h += '<div class="lg-row">' + s.players.map(function (p) { return '<span>' + esc(p.avatar) + ' <b>' + esc(p.name) + '</b>' + (p.host ? ' 👑' : '') + '</span>'; }).join(' · ') + ' (' + n + '/' + s.max + ')</div>';
          h += '<div class="lg-roles">' + ROLE_ORDER.map(function (r) {
            var c = s.cfg.roles[r] || 0;
            return '<div class="lg-rc"><b>' + ROLE_EMO[r] + '</b><span>' + ROLE_NAME[r] + '</span>' + (host ? '<i><button data-r="' + r + '" data-d="-1"' + (c <= 0 ? ' disabled' : '') + '>−</button> <strong>' + c + '</strong> <button data-r="' + r + '" data-d="1"' + (UNIQUE[r] && c >= 1 ? ' disabled' : '') + '>+</button></i>' : '<i><strong>' + c + '</strong></i>') + '</div>';
          }).join('') + '</div>';
          h += '<div class="lg-note">Rôles : <b style="color:' + (tot === n ? '#7ee0a0' : '#ff8a80') + '">' + tot + '</b> pour <b>' + n + '</b> joueur' + (n > 1 ? 's' : '') + (n < s.min ? ' — il en faut au moins ' + s.min : '') + (s.reward ? '' : '') + ' · ' + (n >= s.rewardMinPlayers ? '💰 ' + (s.reward || 100) + ' 🪙 par gagnant' : 'Dès ' + s.rewardMinPlayers + ' joueurs, les gagnants reçoivent des pièces') + '</div>';
          h += host ? '<div class="lg-row"><button class="lg-b alt" data-a="auto">✨ Auto</button><label style="font-size:12px">Discussion <select id="lg-disc">' + [30, 45, 60, 90, 120].map(function (d) { return '<option value="' + d * 1000 + '"' + (d * 1000 === s.cfg.discMs ? ' selected' : '') + '>' + d + ' s</option>'; }).join('') + '</select></label><button class="lg-b go" data-a="start">▶ Lancer la partie</button></div>' : '<div class="lg-note">En attente du chef (' + esc(s.hostName) + ')…</div>';
        } else if (s.status === 'finished') {
          h += '<div class="lg-msg" style="font-size:16px;color:#ffd98a">' + (s.winner === 'village' ? '🏆 Le village a gagné !' : s.winner === 'loups' ? '🐺 Les loups ont gagné !' : s.winner === 'amoureux' ? '💘 Les amoureux gagnent !' : 'Personne n’a survécu…') + '</div>';
          h += '<div class="lg-row">' + s.players.map(function (p) { return '<span class="lg-p' + (p.winner ? ' on' : '') + '" style="cursor:default">' + ROLE_EMO[p.role] + ' ' + esc(p.name) + '<small>' + ROLE_NAME[p.role] + '</small></span>'; }).join('') + '</div>';
          h += host ? '<div class="lg-row"><button class="lg-b go" data-a="again">🔁 Rejouer</button></div>' : '<div class="lg-note">En attente du chef…</div>';
        } else {
          var act = y.act, ph = s.phase;
          if (!y.alive && act !== 'chasseur') h += '<div class="lg-note">💀 Tu es éliminé : tu regardes la fin de la partie.</div>';
          if (ph === 'reveal') h += '<div class="lg-note">' + ROLE_EMO[y.role] + ' <b>' + ROLE_NAME[y.role] + '</b> — ' + ROLE_DESC[y.role] + '</div>';
          else if (act === 'cupidon') {
            h += '<div class="lg-msg">💘 Désigne les deux amoureux</div><div class="lg-row">' + playerBtns(function (p) { return p.alive; }, '', false).replace(/class="lg-p"( data-t="([^"]*)")/g, function (m0, a, nm) { return 'class="lg-p' + (nm === pick1 || nm === pick2 ? ' on' : '') + '"' + a; }) + '</div>';
            h += '<div class="lg-row"><button class="lg-b" data-a="cupid"' + (pick1 && pick2 ? '' : ' disabled') + '>Valider</button></div>';
          } else if (act === 'voyante') h += '<div class="lg-msg">🔮 Qui veux-tu espionner ?</div><div class="lg-row">' + playerBtns(function (p) { return p.alive && !p.me; }, '', false) + '</div>';
          else if (act === 'loups') {
            var mv = y.wolfVotes || {};
            h += '<div class="lg-msg">🐺 Choisissez votre victime (' + Object.keys(mv).length + ' vote' + (Object.keys(mv).length > 1 ? 's' : '') + ')</div><div class="lg-row">' + playerBtns(function (p) { return p.alive && p.role !== 'loup'; }, mv[y.name] || '', true) + '</div>';
            h += '<div class="lg-note">' + (Object.keys(mv).map(function (a) { return esc(a) + ' → ' + esc(mv[a]); }).join(' · ') || 'Aucun vote pour le moment') + '</div>';
          } else if (act === 'spy') {
            h += '<div class="lg-msg">👧 Les loups chassent…</div><div class="lg-row"><button class="lg-b alt" data-a="spy"' + (y.spied ? ' disabled' : '') + '>🕵️ Espionner les loups (risqué)</button></div>' + ((y.knownWolves || []).length ? '<div class="lg-note">Loups repérés : ' + y.knownWolves.map(esc).join(', ') + '</div>' : '');
          } else if (act === 'sorciere') {
            var w = y.witch || {};
            h += '<div class="lg-msg">🧙‍♀️ ' + (w.victim ? 'Les loups ont dévoré <b>' + esc(w.victim) + '</b>' : 'Personne n’a été attaqué') + '</div>';
            h += '<div class="lg-row"><button class="lg-b' + (witchHeal ? '' : ' alt') + '" data-a="heal"' + (w.heal && w.victim ? '' : ' disabled') + '>🧪 ' + (witchHeal ? 'Sauver (choisi)' : 'Sauver') + (w.heal ? '' : ' (utilisée)') + '</button></div>';
            h += '<div class="lg-note">' + (w.kill ? '☠️ Poison : choisis une cible (facultatif)' : '☠️ Poison utilisé') + '</div>' + (w.kill ? '<div class="lg-row">' + playerBtns(function (p) { return p.alive && !p.me; }, pick1, false) + '</div>' : '');
            h += '<div class="lg-row"><button class="lg-b go" data-a="witchok">Valider</button></div>';
          } else if (act === 'chasseur') h += '<div class="lg-msg">🔫 Tire sur quelqu’un avant de mourir !</div><div class="lg-row">' + playerBtns(function (p) { return p.alive; }, '', false) + '<button class="lg-b alt" data-t="">Ne tirer sur personne</button></div>';
          else if (act === 'vote') {
            h += '<div class="lg-msg">🗳️ Qui est le loup ?</div><div class="lg-row">' + playerBtns(function (p) { return p.alive && !p.me; }, pick1, false) + '<button class="lg-b alt" data-t="">S’abstenir</button></div>';
            h += '<div class="lg-note">' + (s.players.filter(function (p) { return p.voted; }).map(function (p) { return esc(p.name) + ' → ' + esc(p.voted); }).join(' · ') || 'Aucun vote pour le moment') + '</div>';
          } else if (ph === 'result' && s.lastVoteResult) h += '<div class="lg-msg">' + (s.lastVoteResult.name ? (s.lastVoteResult.spared ? '🤡 ' + esc(s.lastVoteResult.name) + ' est épargné !' : '⚖️ ' + esc(s.lastVoteResult.name) + ' est éliminé') : '⚖️ Égalité : personne n’est éliminé') + '</div>';
          else if (ph === 'discussion') h += '<div class="lg-note">☀️ Discutez dans le chat de la salle : qui est suspect ? Le vote commence à la fin du chrono.</div>';
          else if (s.isNight && y.alive) h += '<div class="lg-note">🌙 Le village dort… ' + (y.role === 'villageois' || y.role === 'idiot' ? 'tu n’as rien à faire cette nuit.' : 'attends ton tour.') + '</div>';
          if ((y.seenLog || []).length && y.role === 'voyante') h += '<div class="lg-note">🔮 ' + y.seenLog.map(function (e) { return esc(e.name) + ' = ' + ROLE_NAME[e.role]; }).join(' · ') + '</div>';
          if (y.lover) h += '<div class="lg-note">💘 Tu es amoureux de <b>' + esc(y.lover) + '</b></div>';
          if (flash) h += '<div class="lg-note" style="color:#ffd98a">' + esc(flash) + '</div>';
        }
        h += '<div class="lg-log">' + s.log.slice(-4).map(function (l) { return '<div>• ' + esc(l.t) + '</div>'; }).join('') + '</div>';
        body.innerHTML = h;
      }
      var tm = el.querySelector('.lg-time');
      tm.textContent = s.status === 'playing' && s.phaseEnd ? fmtT(s.phaseEnd - nowS()) : '';
      el.querySelector('.lg-ph').textContent = (s.name || '') + (s.status === 'playing' ? ' · ' + phaseText() : s.status === 'lobby' ? ' · En attente' : ' · Partie terminée');
      // plaque du rôle en haut à droite
      if (s.status === 'playing' && y.role) { roleEl.style.display = ''; roleEl.innerHTML = ROLE_EMO[y.role] + ' ' + ROLE_NAME[y.role] + '<small>' + (y.role === 'loup' ? 'Camp : Loups' : 'Camp : Village') + (y.alive ? '' : ' · éliminé') + '</small>'; }
      else roleEl.style.display = 'none';
      // grand titre à l'annonce du rôle
      if (s.status === 'playing' && s.phase === 'reveal' && y.role && lastRoleSeen !== s.id) {
        lastRoleSeen = s.id; titleEl.className = 'lg-title ' + (y.role === 'loup' ? 'wolfc' : 'vill');
        titleEl.innerHTML = '<big>Tu es <b>' + ROLE_NAME[y.role] + '</b></big><span>Tu gagnes avec ' + (y.role === 'loup' ? 'les Loups-Garous' : 'le Village') + '</span>';
        void titleEl.offsetWidth; titleEl.classList.add('in'); titleT = 6;
      }
    }
    var roleEl = null;
    function act(a, extra) {
      if (busy) return; busy = true;
      return api(Object.assign({ action: a }, extra || {})).then(function (r) {
        busy = false;
        if (!r || r.ok === false) { flash = (r && r.error) || 'Action impossible.'; flashT = 4; shownKey = ''; refreshUi(); return r; }
        pick1 = pick2 = ''; witchHeal = false; flash = '';
        if (r.seen) { flash = '🔮 ' + r.seen.name + ' est ' + ROLE_NAME[r.seen.role] + ' !'; flashT = 8; }
        if (r.spy === 'ok') { flash = '🕵️ Tu repères un loup : ' + r.wolf; flashT = 8; }
        else if (r.spy === 'repere') { flash = '😱 Les loups t’ont repérée !'; flashT = 8; }
        shownKey = ''; refreshUi(); return r;
      });
    }
    function onClick(e) {
      var b = e.target.closest('button'); if (!b || b.disabled || !seat || !S) return;
      var y = S.you || {}, d = b.dataset;
      if (d.r) { var c = (S.cfg.roles[d.r] || 0) + parseInt(d.d, 10), roles = {}; roles[d.r] = Math.max(0, c); act('config', { roles: roles }); return; }
      if (d.a === 'auto') { act('config', { auto: true }); return; }
      if (d.a === 'start') { act('start'); return; }
      if (d.a === 'again') { act('again'); return; }
      if (d.a === 'spy') { act('spy'); return; }
      if (d.a === 'heal') { witchHeal = !witchHeal; shownKey = ''; refreshUi(); return; }
      if (d.a === 'witchok') { act('witch', { heal: witchHeal, target: pick1 }); return; }
      if (d.a === 'cupid') { act('cupidon', { targets: [pick1, pick2] }); return; }
      if (d.t !== undefined) {
        var a = y.act;
        if (a === 'cupidon') { if (pick1 === d.t) pick1 = ''; else if (pick2 === d.t) pick2 = ''; else if (!pick1) pick1 = d.t; else if (!pick2) pick2 = d.t; else { pick1 = pick2; pick2 = d.t; } shownKey = ''; refreshUi(); return; }
        if (a === 'voyante') { act('see', { target: d.t }); return; }
        if (a === 'loups') { act('wolfvote', { target: d.t }); return; }
        if (a === 'sorciere') { pick1 = pick1 === d.t ? '' : d.t; shownKey = ''; refreshUi(); return; }
        if (a === 'chasseur') { act('shoot', { target: d.t }); return; }
        if (a === 'vote') { pick1 = d.t; act('vote', { target: d.t }); return; }
      }
    }
    function onSeatKey(e) {
      if (!seat) return;
      var tag = e.target && e.target.tagName;
      if (e.code === 'Escape' || (e.code === 'KeyF' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (!loggedIn()) { w.flash('Connecte-toi pour jouer au Loup-Garou.'); return; }
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; view.yaw = view.pitch = 0; S = null; shownKey = ''; busy = false; code = String(s.ti + 1); pick1 = pick2 = ''; witchHeal = false; flash = ''; lastRoleSeen = '';
      injectCss();
      var el = document.createElement('div'); el.className = 'lg3d';
      el.innerHTML = '<div class="lg-top"><b class="lg-ph"></b><span class="lg-time"></span></div><div class="lg-body"></div>';
      w.container.appendChild(el); ui = { el: el };
      roleEl = document.createElement('div'); roleEl.className = 'lg-role'; roleEl.style.display = 'none'; w.container.appendChild(roleEl);
      titleEl = document.createElement('div'); titleEl.className = 'lg-title'; w.container.appendChild(titleEl);
      el.addEventListener('click', onClick);
      el.addEventListener('change', function (e) { if (e.target.id === 'lg-disc') act('config', { discMs: e.target.value }); });
      standEl = document.createElement('div'); standEl.className = 'lg3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      api({ action: 'join', seat: s.si, avatar: (st() && st().avatarEmoji) || '🧑‍🎤' }).then(function (r) {
        if (!seat || seat !== s) return;
        if (!r || r.ok === false) { w.flash((r && r.error) || 'Impossible d’entrer dans ce salon.'); stand(); return; }
        if (r.state && r.state.you && typeof r.state.you.seat === 'number' && r.state.you.seat !== s.si) { /* le serveur a changé de place : on reste sur la nôtre pour l’affichage */ }
      });
    }
    function stand() {
      if (!seat) return;
      var s = seat, c = code; seat = null; S = null; code = '';
      try { world.post('/api/loupgarou', { action: 'leave', code: c }); } catch (e) { /* ok */ }
      window.removeEventListener('keydown', onSeatKey, true);
      [ui && ui.el, standEl, roleEl, titleEl].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
      ui = null; standEl = null; roleEl = null; titleEl = null; envTarget = 0;
      seatTags.forEach(function (t) { t.sp.visible = false; });
      resetAvatars();
      world.standUp(s.sx, s.sz, s.yaw);
    }
    function resetAvatars() { Object.keys(world.remote).forEach(function (kk) { var r = world.remote[kk]; if (r && r.person && r.person.look) { r.person.look(0); r.person.point(null); r.person.slump(false); r.person.poseStep(0.5); } }); }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.12, z: 0.1 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-1.3, Math.min(1.3, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.35, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.9; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var T = TABLES[s.ti], ex = s.x + (T.x - s.x) * 0.08, ez = s.z + (T.z - s.z) * 0.08, ey = 1.38;
      var a = Math.atan2(T.x - ex, -(T.z - ez)) + view.yaw, p = Math.atan2(1.0 - ey, Math.hypot(T.x - ex, T.z - ez)) + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 6, ty: ey + Math.sin(p) * 6, tz: ez - Math.cos(a) * Math.cos(p) * 6, fov: 66 };
    };
    room.syncHud = function () { refreshUi(); };

    /* --- mouvements des joueurs assis, d'après l'état du serveur --- */
    function remoteBySeat(n) { var found = null; Object.keys(world.remote).forEach(function (kk) { var r = world.remote[kk]; if (r && r.seat === n && r.person) found = r; }); return found; }
    function syncAvatars(dt) {
      if (!seat || !S) return;
      var ti = seat.ti, voting = S.status === 'playing' && S.phase === 'vote';
      var bySeat = {}; S.players.forEach(function (p) { bySeat[p.name] = p; });
      for (var si = 0; si < NSEAT; si++) {
        var tag = seatTags[si], sp = seatPos(ti, si), pObj = null;
        S.players.forEach(function (p) { if (p.seat === si) pObj = p; });
        var r = remoteBySeat(ti * NSEAT + si), isMe = pObj && pObj.me;
        if (!pObj) { tag.sp.visible = false; if (r) { r.person.look(0); r.person.point(null); r.person.slump(false); r.person.poseStep(dt); } continue; }
        // étiquette : votes reçus, mort, loup connu
        var lines = [], votesFor = 0;
        if (voting) S.players.forEach(function (q) { if (q.voted === pObj.name) votesFor++; });
        var dead = S.status === 'playing' && !pObj.alive;
        if (dead) lines.push('💀 ' + ROLE_EMO[pObj.role || 'villageois']); else if (pObj.role === 'loup' && S.you && S.you.role === 'loup') lines.push('🐺 loup');
        if (voting && votesFor) lines.push('🗳️ ' + votesFor);
        if (S.status === 'finished' && pObj.role) lines.push(ROLE_EMO[pObj.role] + ' ' + (pObj.winner ? '🏆' : ''));
        if (S.status === 'playing' && pObj.idiot) lines.push('🤡');
        if (pObj.host && S.status === 'lobby') lines.push('👑 chef');
        drawSeatTag(tag, lines.slice(0, 2), dead ? '#888' : votesFor ? '#ffd24a' : '#8b7dff');
        tag.sp.visible = lines.length > 0; tag.sp.position.set(sp.x, 2.45, sp.z);
        if (!r || isMe) continue;
        var pers = r.person;
        pers.slump(dead);
        var tgt = voting && pObj.voted && pObj.voted !== '—' ? bySeat[pObj.voted] : null;
        if (tgt) {
          var tp = seatPos(ti, tgt.seat), rel = wrapPi(Math.atan2(tp.x - sp.x, -(tp.z - sp.z)) - sp.yaw);
          pers.look(-rel); pers.point(-rel);
        } else { pers.look(0); pers.point(null); }
        pers.poseStep(dt);
      }
    }

    /* --- décor : nuit / jour --- */
    var clockT = 0, NIGHT_AMB = new THREE.Color(0x6a72bd), DAY_AMB = new THREE.Color(0xfff2de), tmpC = new THREE.Color();
    function envStep(dt) {
      env += (envTarget - env) * Math.min(1, dt * 1.6);
      var e = env; amb.color.copy(NIGHT_AMB).lerp(DAY_AMB, e); amb.intensity = 0.55 + 0.7 * e;
      ceilM.color.setHex(e > 0.5 ? 0x7fb6ee : 0x05060d); wallM.map = e > 0.5 ? texDay : texNight; wallM.needsUpdate = true;
      moonL.intensity = 0.8 * (1 - e) + 0.2; lights.forEach(function (l) { l.intensity = 0.9 - 0.55 * e; });
    }

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un tabouret pour t’asseoir à une table' : 'ZQSD / flèches : marcher · Maj : courir · avance vers un tabouret (F ou clic) : tu entres dans le salon de cette table · F : se lever · parle dans le chat de la salle'; };
    room.onEnter = function () { pollList(); envTarget = 0; };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      clockT += dt; pollT += dt; listT += dt;
      flames.forEach(function (f, q) { f.scale.set(1 + 0.15 * Math.sin(clockT * 9 + q), 1.5 + 0.3 * Math.sin(clockT * 7 + q * 2), 1); });
      if (seat && pollT > 1) { pollT = 0; poll(); }
      if (listT > 3) { listT = 0; pollList(); }
      if (titleT > 0) { titleT -= dt; if (titleT <= 0 && titleEl) titleEl.classList.remove('in'); }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flash = ''; shownKey = ''; refreshUi(); } }
      if (seat && S && ui) { var tm = ui.el.querySelector('.lg-time'); if (tm && S.status === 'playing') tm.textContent = fmtT(S.phaseEnd - nowS()); }
      for (var z = 0; z < 3; z++) drawBoard(z);
      boards.forEach(function (b) { if (b.shown !== b.sig) { b.tex.needsUpdate = true; b.shown = b.sig; } });
      envStep(dt); syncAvatars(dt);
    };
    room._dbg = { apply: function (s) { applyState(s); }, seat: function () { return seat; }, sit: sit };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('loupgarou', createLoupGarouRoom);
})();
