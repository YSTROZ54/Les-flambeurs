/* =====================================================================
   blindtest3d.js — La salle du Blind Test d'images (monde 3D, PC)
   ---------------------------------------------------------------------
   On y entre par la porte « BLIND TEST » du hall (hall3d.js) et on en ressort vers le hall.
   Une salle de projection avec trois écrans, un par salon (Salon 1, 2, 3 : 6 places chacun, comme dans le menu). On s'assoit sur un
   fauteuil devant l'écran du salon voulu (F ou clic) : on entre dans ce salon. L'image de la manche, le chrono, la réponse et les
   scores sont projetés sur l'écran ; on tape sa réponse dans le panneau du bas. Les écrans des autres salons n'affichent que le
   nombre de joueurs.
   Le jeu est le même que celui du menu et il est géré par le serveur (api/blindtest.js) : réponses, chrono, points et gains (20 🪙
   par image trouvée à 2 joueurs ou plus) ne quittent jamais le serveur. Le premier arrivé dans un salon vide en est le chef
   (réglages, lancement, rejouer).
   Fichiers liés : f3d-core.js, world3d.js, hall3d.js (la porte), api/blindtest.js (serveur).
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom) return;
  var mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF, MONO = F.MONO, TAU = F.TAU, fmtN = F.fmtN;

  var HX = 13, HZ = 10, H = 6;
  var ZONES = [-8.5, 0, 8.5];                 // le centre de chaque salon (x)
  var SEAT_DX = [-1.6, 0, 1.6, -0.8, 0.8, 2.4];   // les 6 fauteuils d'un salon (deux rangées)
  var SEAT_Z = [2.4, 2.4, 2.4, 4.4, 4.4, 4.4];
  var BTN = [['all', '🎲 Tout'], ['film', '🎬 Films'], ['dessin', '🖍️ Dessins'], ['serie', '📺 Séries']];

  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function loggedIn() { try { return typeof isUserLoggedIn !== 'function' || !!isUserLoggedIn(); } catch (e) { return false; } }
  function setBalance(b) {
    if (typeof b !== 'number') return;
    try { var s = st(); s.balance = b; s.lastBalanceChange = Date.now(); if (typeof saveState === 'function') saveState(); if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) { /* ok */ }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function createBlindTestRoom(world) {
    var low = world.low;
    var room = { title: '🎬 BLIND TEST', subtitle: 'DEVINE LE TITRE DE L\'IMAGE', topic: 'flambeurs-blindtest-room', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group, i, seats = [], screens = [];
    room.bounds = { xMin: -HX + 0.7, xMax: HX - 0.7, zMin: -HZ + 0.7, zMax: HZ - 0.7 };

    // sol moquette bordeaux, murs sombres, plafond noir
    var fc = mkCanvas(256, 256), fx = fc.getContext('2d'); fx.fillStyle = '#3a0f1c'; fx.fillRect(0, 0, 256, 256);
    for (i = 0; i < 1400; i++) { fx.fillStyle = 'rgba(' + (70 + Math.random() * 40) + ',20,' + (40 + Math.random() * 30) + ',0.35)'; fx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    var ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(HX / 2, HZ / 2); ft.anisotropy = 4;
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    var wallM = new THREE.MeshStandardMaterial({ color: 0x1b0f26, roughness: 0.9 });
    function wall(w, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallM); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x07040c })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
    var goldM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 });
    box(g, HX * 2, 0.12, 0.12, goldM, 0, 0.9, -HZ + 0.06); box(g, HX * 2, 0.12, 0.12, goldM, 0, 5.5, -HZ + 0.06);

    // enseigne au-dessus des écrans
    var sc0 = mkCanvas(1024, 200), sx = sc0.getContext('2d'); sx.shadowColor = '#e040fb'; sx.shadowBlur = 30; sx.fillStyle = '#ffd9ff'; sx.font = '900 120px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('🎬 BLIND TEST', 512, 104, 980);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.25), new THREE.MeshBasicMaterial({ map: mkTex(sc0), transparent: true, depthWrite: false })); sign.position.set(0, 5.1, -HZ + 0.1); g.add(sign);

    /* --- les trois écrans (un par salon) --- */
    var imgCache = {};
    function loadImg(url) {
      var e = imgCache[url]; if (e) return e.ok ? e.img : null;
      e = imgCache[url] = { ok: false, img: new Image() }; e.img.onload = function () { e.ok = true; }; e.img.src = url; return null;
    }
    ZONES.forEach(function (zx, zi) {
      var cv = mkCanvas(1024, 576), tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.825), new THREE.MeshBasicMaterial({ map: tex })); scr.position.set(zx, 3.0, -HZ + 0.12); g.add(scr);
      box(g, 7.0, 4.025, 0.08, goldM, zx, 3.0, -HZ + 0.07);
      screens.push({ cv: cv, ctx: cv.getContext('2d'), tex: tex, sig: '' });
      // estrade et fauteuils
      box(g, 6, 0.1, 5.2, new THREE.MeshStandardMaterial({ color: 0x2a1330, roughness: 0.9 }), zx, 0.05, 3.4);
      var chairM = new THREE.MeshStandardMaterial({ color: 0x8c1a26, roughness: 0.7 }), blackM = new THREE.MeshStandardMaterial({ color: 0x15101a, roughness: 0.8 });
      SEAT_DX.forEach(function (dx, k) {
        var sxp = zx + dx, szp = SEAT_Z[k], s = { n: zi * 6 + k, zone: zi, x: sxp, z: szp, yaw: 0, sx: sxp, sz: szp + 1.0 };
        seats.push(s);
        var ch = new THREE.Group(); ch.position.set(sxp, 0.1, szp); g.add(ch);
        box(ch, 0.62, 0.14, 0.6, chairM, 0, 0.42, 0); box(ch, 0.62, 0.8, 0.12, chairM, 0, 0.82, 0.3); box(ch, 0.1, 0.3, 0.55, blackM, -0.36, 0.55, 0); box(ch, 0.1, 0.3, 0.55, blackM, 0.36, 0.55, 0);
        box(ch, 0.5, 0.4, 0.4, blackM, 0, 0.2, 0);
        room.colliders.push({ x: sxp, z: szp, r: 0.34 });
        var hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(sxp, 0.8, szp); g.add(hit);
        room.interactables.push({ hit: hit, x: sxp, z: szp, radius: 1.4, enabled: function () { return !seat && !seatTaken(s); }, prompt: function () { return '🪑 S\'asseoir — Salon ' + (zi + 1) + (roomInfo(zi) ? ' (' + roomInfo(zi).players + '/6)' : ''); }, use: function (w) { sit(w, s); } });
      });
    });
    if (!low) ZONES.forEach(function (zx) { var pl = new THREE.PointLight(0xe9d6ff, 0.9, 11); pl.position.set(zx, 3.6, -HZ + 3.4); g.add(pl); });
    g.add(new THREE.AmbientLight(0xc8b4e8, 0.85));

    /* --- l'état du jeu (serveur) --- */
    var seat = null, view = { yaw: 0, pitch: 0 }, ui = null, standEl = null, S = null, off = 0, rooms = null, polling = false, listPolling = false, pollT = 0, listT = 0, busy = false, shownKey = '', hintTxt = '', hintCol = '', code = '';
    function seatTaken(s) { var now = performance.now(); return Object.keys(world.remote).some(function (k) { var r = world.remote[k]; return r.seat === s.n && now - (r.recv || 0) < 4000; }); }
    function roomInfo(zi) { return rooms && rooms[zi] ? rooms[zi] : null; }
    function api(body) {
      return world.post('/api/blindtest', Object.assign({ code: code }, body)).then(function (r) {
        if (!r) return { ok: false, error: 'Connecte-toi pour jouer.' };
        if (r.state) applyState(r.state);
        if (typeof r.balance === 'number') setBalance(r.balance);
        return r;
      });
    }
    function applyState(s) { if (!s) return; S = s; off = s.serverNow - Date.now(); refreshUi(); }
    function nowS() { return Date.now() + off; }
    function poll() {
      if (polling || !code) return; polling = true;
      fetch('/api/blindtest?code=' + encodeURIComponent(code), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { polling = false; if (d && d.ok && d.state && seat) { if (d.state.you == null) { world.flash('Tu n\'es plus dans ce salon.'); stand(); } else applyState(d.state); } }).catch(function () { polling = false; });
    }
    function pollList() {
      if (listPolling) return; listPolling = true;
      fetch('/api/blindtest', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { listPolling = false; if (d && d.ok) rooms = d.rooms; }).catch(function () { listPolling = false; });
    }

    /* --- dessin des écrans --- */
    function drawScreen(zi, mine) {
      var sc = screens[zi], c = sc.ctx, W = 1024, Hh = 576, sig, info = roomInfo(zi);
      var s = mine ? S : null;
      if (s && s.status === 'playing') sig = [s.phase, s.round, Math.ceil(Math.max(0, s.phaseEnd - nowS()) / 1000), s.players.map(function (p) { return p.score + (p.found ? 'f' : ''); }).join(), s.img, imgCache[s.img] && imgCache[s.img].ok].join('|');
      else sig = mine && s ? [s.status, s.players.map(function (p) { return p.name + p.score; }).join()].join('|') : (info ? info.players + info.status : 'x');
      if (sc.sig === sig) return; sc.sig = sig;
      c.fillStyle = '#0a0610'; c.fillRect(0, 0, W, Hh);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      function title(t, y, sz, col) { c.fillStyle = col || '#fff'; c.font = '900 ' + sz + 'px ' + SERIF; c.fillText(t, W / 2, y, W - 60); }
      if (!s) {
        title('SALON ' + (zi + 1), 190, 96, '#ffd9ff');
        title(info ? info.players + ' / 6 joueurs' : '…', 300, 54, '#fff');
        title(info && info.players ? (info.status === 'playing' ? '🎬 Partie en cours' : '⏳ En attente du lancement') : '🪑 Assieds-toi pour ouvrir ce salon', 400, 38, '#ffe08a');
        return;
      }
      if (s.status === 'lobby') {
        title('SALON ' + s.code, 90, 70, '#ffd9ff'); title('En attente du lancement', 170, 40, '#ffe08a');
        c.font = '800 40px ' + SERIF; c.fillStyle = '#fff';
        s.players.slice(0, 6).forEach(function (p, k) { c.fillText(p.avatar + ' ' + p.name + (p.host ? ' 👑' : ''), W / 2, 250 + k * 52, 700); });
        return;
      }
      if (s.status === 'finished') {
        title('🏁 PARTIE TERMINÉE', 80, 64, '#ffe08a');
        c.font = '800 42px ' + SERIF; c.fillStyle = '#fff';
        s.players.slice(0, 6).forEach(function (p, k) { c.fillText(['🥇', '🥈', '🥉'][k] || (k + 1 + '.'), 250, 190 + k * 62); c.textAlign = 'left'; c.fillText(p.avatar + ' ' + p.name, 300, 190 + k * 62, 400); c.textAlign = 'right'; c.fillText(p.score + ' pt' + (p.score > 1 ? 's' : '') + (p.earned ? '  +' + p.earned + ' 🪙' : ''), 790, 190 + k * 62); c.textAlign = 'center'; });
        return;
      }
      var left = Math.max(0, s.phaseEnd - nowS());
      if (s.phase === 'countdown') { title('PRÉPAREZ-VOUS…', 180, 70, '#ffd9ff'); title(String(Math.max(1, Math.ceil(left / 1000))), 360, 220, '#ffe08a'); return; }
      // image de la manche à gauche, chrono et scores à droite
      c.fillStyle = '#000'; c.fillRect(16, 16, 700, 470);
      var img = s.img ? loadImg(s.img) : null;
      if (img) { var k2 = Math.min(692 / img.width, 462 / img.height), iw = img.width * k2, ih = img.height * k2; c.drawImage(img, 16 + (700 - iw) / 2, 16 + (470 - ih) / 2, iw, ih); }
      else { c.fillStyle = '#7d6a90'; c.font = '800 32px ' + SERIF; c.fillText('Chargement de l\'image…', 366, 250); }
      c.fillStyle = '#ffd9ff'; c.font = '800 32px ' + SERIF; c.fillText('Image ' + s.round + '/' + s.total + (s.cfg.mode === 'first' ? '  ⚡ le premier gagne' : '  👥 tous répondent'), 366, 524, 700);
      if (s.phase === 'question') { var sec = Math.ceil(left / 1000); c.fillStyle = sec <= 5 ? '#ff6b6b' : '#fff'; c.font = '900 110px ' + MONO; c.fillText(String(sec), 868, 90); }
      else { c.fillStyle = '#7ee0a0'; c.font = '900 40px ' + SERIF; c.fillText('Réponse', 868, 60); }
      c.font = '800 26px ' + SERIF;
      s.players.slice(0, 6).forEach(function (p, k) { c.textAlign = 'left'; c.fillStyle = p.me ? '#ffd9ff' : '#fff'; c.fillText((p.found ? '✔ ' : '') + p.avatar + ' ' + p.name, 740, 175 + k * 44, 190); c.textAlign = 'right'; c.fillStyle = '#ffe08a'; c.fillText(String(p.score), 1004, 175 + k * 44); });
      c.textAlign = 'center';
      if (s.phase === 'reveal') {
        c.fillStyle = 'rgba(0,0,0,0.78)'; c.fillRect(16, 396, 700, 90); c.fillStyle = '#7ee0a0'; c.font = '900 44px ' + SERIF; c.fillText(s.answer || '', 366, 428, 680);
        var w = (s.solvedBy || []).map(function (x) { return (x.first ? '🥇 ' : '✅ ') + x.name; }).join('  ·  ');
        c.fillStyle = '#fff'; c.font = '700 24px ' + SERIF; c.fillText(w || '😅 Personne n\'a trouvé', 366, 466, 680);
      }
    }

    /* --- panneau du joueur assis --- */
    function injectCss() {
      if (document.getElementById('bt3d-css')) return;
      var s = document.createElement('style'); s.id = 'bt3d-css';
      s.textContent = '.bt3d{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(560px,94%);background:rgba(10,5,16,.92);border:1px solid rgba(224,120,255,.6);border-radius:16px;padding:12px 14px;color:#f3dcff;pointer-events:auto;display:flex;flex-direction:column;gap:8px;z-index:5;font-size:13px}' +
        '.bt3d .bt-msg{min-height:18px;text-align:center;font-weight:800;font-size:14px}.bt3d .bt-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}' +
        '.bt3d .bt-o{padding:5px 10px;border-radius:999px;border:2px solid #7d4a90;background:#1d1024;color:#f3dcff;font-weight:800;font-size:12px;cursor:pointer}.bt3d .bt-o.on{border-color:#e040fb;background:#4a1659;color:#fff}.bt3d .bt-o:disabled{opacity:.6;cursor:default}' +
        '.bt3d .bt-b{padding:9px 22px;border-radius:12px;border:0;font-weight:900;font-size:15px;cursor:pointer;color:#1a0820;background:linear-gradient(90deg,#f6a0ff,#c25cf0);align-self:center}.bt3d .bt-b:disabled{opacity:.5;cursor:default}' +
        '.bt3d input[type=text]{flex:1;min-width:0;padding:9px 12px;border-radius:10px;border:2px solid #e040fb;background:#12081a;color:#fff;font-size:15px;font-weight:700}' +
        '.bt3d select{padding:5px 8px;border-radius:8px;border:2px solid #7d4a90;background:#1d1024;color:#fff;font-weight:700}' +
        '.bt3d-stand{position:absolute;left:14px;bottom:84px;z-index:5;pointer-events:auto}.bt3d-stand button{padding:8px 14px;border-radius:10px;border:1px solid rgba(224,120,255,.6);background:rgba(10,5,16,.85);color:#f3dcff;font-weight:800;cursor:pointer}';
      document.head.appendChild(s);
    }
    function setMsg(t, col) { hintTxt = t || ''; hintCol = col || ''; if (ui) { var m = ui.el.querySelector('.bt-msg'); m.textContent = hintTxt; m.style.color = hintCol; } }
    function optRow(id, list, val, host) { return '<div class="bt-row" id="' + id + '">' + list.map(function (o) { return '<button class="bt-o' + (String(val) === o[0] ? ' on' : '') + '" data-f="' + id + '" data-v="' + o[0] + '"' + (host ? '' : ' disabled') + '>' + o[1] + '</button>'; }).join('') + '</div>'; }
    function refreshUi() {
      if (!ui || !seat || !S) return;
      var s = S, host = !!(s.you && s.you.host), el = ui.el, body = el.querySelector('.bt-body');
      var key = [s.status, s.phase, s.round, host, s.players.map(function (p) { return p.name; }).join(), JSON.stringify(s.cfg), s.you && s.you.found].join('|');
      if (key !== shownKey) {
        var prev = shownKey.split('|'), newRound = prev[0] !== s.status || prev[1] !== s.phase || prev[2] !== String(s.round);
        shownKey = key;
        if (s.status === 'lobby') {
          body.innerHTML = '<div class="bt-row">' + s.players.map(function (p) { return '<span>' + esc(p.avatar) + ' <b>' + esc(p.name) + '</b>' + (p.host ? ' 👑' : '') + '</span>'; }).join(' · ') + ' (' + s.players.length + '/' + s.max + ')</div>' +
            optRow('mode', [['all', '👥 Tous répondent'], ['first', '⚡ Le premier gagne']], s.cfg.mode, host) + optRow('cat', BTN, s.cfg.cat, host) +
            optRow('diff', [['all', '🎲 Tout'], ['f', '🟢 Facile'], ['m', '🟠 Moyen'], ['d', '🔴 Difficile']], s.cfg.diff, host) +
            '<div class="bt-row">Images : <select id="bt-rounds"' + (host ? '' : ' disabled') + '>' + [15, 16, 17, 18, 19, 20].map(function (n) { return '<option' + (n === s.cfg.rounds ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
            '<div class="bt-row" style="font-size:12px">' + (s.players.length >= s.rewardMinPlayers ? '💰 20 🪙 par image trouvée' : '🧪 Seul : entraînement, il faut 2 joueurs pour gagner des pièces') + ' · ' + s.available + ' titres</div>' +
            (host ? '<button class="bt-b" data-a="start"' + (s.available < 5 ? ' disabled' : '') + '>Lancer la partie</button>' : '<div class="bt-row">En attente du chef (' + esc(s.hostName) + ')…</div>');
          if (newRound) setMsg(host ? 'Tu es le chef : règle la partie puis lance-la.' : '');
        } else if (s.status === 'playing') {
          body.innerHTML = '<form class="bt-row" style="flex-wrap:nowrap"><input type="text" id="bt-in" autocomplete="off" maxlength="120" placeholder="Titre du film / dessin animé / série…"><button class="bt-b" type="submit" style="align-self:auto;padding:9px 16px">OK</button></form>';
          var inp = body.querySelector('#bt-in'), btn = body.querySelector('button'), can = s.phase === 'question' && !(s.you && s.you.found);
          inp.disabled = !can; btn.disabled = !can;
          if (newRound) { if (s.phase === 'question') { setMsg(''); setTimeout(function () { try { inp.focus(); } catch (e) { /* ok */ } }, 50); } else if (s.phase === 'reveal') setMsg(s.you && s.you.found ? '✅ Tu as trouvé !' : ''); else setMsg(''); }
          if (s.phase === 'question' && s.you && s.you.found) setMsg('✅ Trouvé ! Attends la fin de la manche…', '#7ee0a0');
        } else {
          var top = s.players[0];
          body.innerHTML = '<div class="bt-row" style="font-size:15px;font-weight:800">' + (top && top.score ? '🥇 ' + esc(top.name) + ' gagne avec ' + top.score + ' bonne' + (top.score > 1 ? 's' : '') + ' réponse' + (top.score > 1 ? 's' : '') + ' !' : 'Personne n\'a trouvé de titre… 😅') + '</div>' +
            (host ? '<button class="bt-b" data-a="again">Rejouer</button>' : '<div class="bt-row">En attente du chef…</div>');
          setMsg('');
        }
      }
      var sc = el.querySelector('.bt-bal'); if (sc) sc.textContent = fmtN(st() ? st().balance : 0);
    }
    function onSeatKey(e) {
      if (!seat) return;
      var tag = e.target && e.target.tagName;
      if (e.code === 'Escape' || (e.code === 'KeyF' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT')) { e.stopImmediatePropagation(); e.preventDefault(); stand(); }
    }
    function sit(w, s) {
      if (seat || w.mode !== 'room' || w.blend > 0 || w.trans) return;
      if (!loggedIn()) { w.flash('Connecte-toi pour jouer au Blind Test.'); return; }
      if (seatTaken(s)) { w.flash('Cette place est occupée.'); return; }
      w.sitDown(room); seat = s; code = String(s.zone + 1); view.yaw = view.pitch = 0; S = null; shownKey = ''; busy = false;
      injectCss();
      var el = document.createElement('div'); el.className = 'bt3d';
      el.innerHTML = '<div class="bt-row" style="justify-content:space-between"><b>🎬 Salon ' + code + '</b><span>Solde : <b class="bt-bal"></b> 🪙</span></div><div class="bt-msg"></div><div class="bt-body"></div>';
      w.container.appendChild(el); ui = { el: el };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.f) { var cfg = {}; cfg[b.dataset.f] = b.dataset.v; api(Object.assign({ action: 'config' }, cfg)).then(function (r) { if (r && r.ok === false) setMsg(r.error, '#ff8a80'); }); return; }
        if (b.dataset.a === 'start') api({ action: 'start' }).then(function (r) { if (r && r.ok === false) setMsg(r.error, '#ff8a80'); });
        if (b.dataset.a === 'again') api({ action: 'again' }).then(function (r) { if (r && r.ok === false) setMsg(r.error, '#ff8a80'); });
      });
      el.addEventListener('change', function (e) { if (e.target.id === 'bt-rounds') api({ action: 'config', rounds: e.target.value }); });
      el.addEventListener('submit', function (e) {
        e.preventDefault(); var inp = el.querySelector('#bt-in'); if (!inp || busy) return; var text = (inp.value || '').trim(); if (!text) return;
        busy = true;
        api({ action: 'guess', text: text }).then(function (r) {
          busy = false; if (!r) return;
          if (r.ok !== false && r.correct) { inp.value = ''; setMsg('✅ Bien joué !' + (r.reward ? ' +' + r.reward + ' 🪙' : ''), '#7ee0a0'); }
          else if (r.ok !== false) { setMsg(r.hint || 'Ce n\'est pas ça.', r.near ? '#ffd24a' : '#ff8a80'); inp.select(); }
          else setMsg(r.error || 'Erreur.', '#ff8a80');
        });
      });
      standEl = document.createElement('div'); standEl.className = 'bt3d-stand'; standEl.innerHTML = '<button>🪑 Se lever <kbd>F</kbd></button>'; standEl.querySelector('button').addEventListener('click', function () { stand(); });
      w.container.appendChild(standEl); window.addEventListener('keydown', onSeatKey, true);
      setMsg('Entrée dans le salon…');
      api({ action: 'join', avatar: (st() && st().avatarEmoji) || '🧑‍🎤' }).then(function (r) {
        if (!seat || seat !== s) return;
        if (!r || r.ok === false) { w.flash((r && r.error) || 'Impossible d\'entrer dans ce salon.'); stand(); return; }
        setMsg('');
      });
    }
    function stand() {
      if (!seat) return;
      var s = seat, c = code; seat = null; S = null; code = '';
      try { world.post('/api/blindtest', { action: 'leave', code: c }); } catch (e) { /* ok */ }
      window.removeEventListener('keydown', onSeatKey, true);
      if (ui && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el); ui = null;
      if (standEl && standEl.parentNode) standEl.parentNode.removeChild(standEl); standEl = null;
      world.standUp(s.sx, s.sz, s.yaw);
    }
    room.forceStand = function () { stand(); };
    room.seatPos = function () { return seat ? { seat: seat.n, x: seat.x, z: seat.z, yaw: seat.yaw } : null; };
    room.sitSpec = { y: 0.2, z: 0.1 };
    room.remotePose = function (r) { var s = seats[r.seat]; return s ? { x: s.x, z: s.z, yaw: s.yaw } : null; };
    room.seatDragStart = function () { return { yaw: view.yaw, pitch: view.pitch }; };
    room.seatDrag = function (drag, dx, dy) { if (!seat) return; view.yaw = Math.max(-0.7, Math.min(0.7, drag.seat.yaw - dx * 0.005)); if (drag.mouse) view.pitch = Math.max(-0.3, Math.min(0.3, drag.seat.pitch - dy * 0.004)); };
    room.seatPose = function (dt, ctx) {
      var s = seat; if (!s) return { cx: 0, cy: 1.6, cz: 0, tx: 0, ty: 1, tz: -3, fov: 62 };
      if (ctx.mouseLook) { view.yaw = ctx.dz(ctx.ms.nx, 0.15) * 0.6; view.pitch = ctx.dz(ctx.ms.ny, 0.15) * -0.25; }
      var ex = s.x, ey = 1.45, ez = s.z - 0.1, a = view.yaw, p = 0.1 + view.pitch;
      return { cx: ex, cy: ey, cz: ez, tx: ex + Math.sin(a) * Math.cos(p) * 8, ty: ey + Math.sin(p) * 8, tz: ez - Math.cos(a) * Math.cos(p) * 8, fov: 58 };
    };
    room.syncHud = function () { refreshUi(); };

    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🏛️ LE HALL', sub: 'RETOUR AU CASINO', color: 0xffd24a, target: 'hall' });
    room.spawn = function () { return { x: 0, z: HZ - 3, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? 'Joystick : marcher · touche un fauteuil pour t\'asseoir' : 'ZQSD / flèches : marcher · Maj : courir · avance vers un fauteuil (F ou clic) : tu entres dans le salon de cet écran · F : se lever'; };
    room.onEnter = function () { pollList(); };
    room.onLeave = function () { stand(); };
    room.update = function (dt) {
      pollT += dt; listT += dt;
      if (seat && pollT > 1) { pollT = 0; poll(); }
      if (listT > 3) { listT = 0; pollList(); }
      for (var z = 0; z < 3; z++) { drawScreen(z, !!seat && seat.zone === z); if (screens[z].sig !== screens[z].shown) { screens[z].tex.needsUpdate = true; screens[z].shown = screens[z].sig; } }
      if (seat && S) { var bal = ui && ui.el.querySelector('.bt-bal'); if (bal) bal.textContent = fmtN(st() ? st().balance : 0); }
    };
    room.dispose = function () { stand(); };
    return room;
  }

  F.registerRoom('blindtest', createBlindTestRoom);
})();
