/* =====================================================================
   prophunt-hub.js — PROP HUNT : la salle d'accueil (on y arrive par la porte « PROP HUNT » du salon des mini jeux)
   ---------------------------------------------------------------------
   • Sur le mur du fond : une affiche par carte (Manoir, Casino, Marché de nuit, Station Orion, Musée, Port) avec le nombre de joueurs en direct.
     On s'approche d'une affiche et on appuie sur F (ou on clique dessus) : on rejoint la salle publique de cette carte, ouverte à tous.
   • Le bureau « SALON PRIVÉ » (mur de droite) : créer un salon avec un code (on choisit la carte) ou rejoindre le salon d'un ami avec son code.
   • Le jeu lui-même est dans prophunt3d.js (salle « prophuntgame ») ; ici on se contente de noter où aller dans F3D.propJoin.
   ===================================================================== */
(function () {
  'use strict';
  var F = window.F3D;
  if (!F || !F.registerRoom || !F.propSim || !F.propModels || !F.propTex) return;
  var PS = F.propSim, PM = F.propModels, PT = F.propTex, mkCanvas = F.mkCanvas, mkTex = F.mkTex, SERIF = F.SERIF || 'serif', TAU = F.TAU || Math.PI * 2;
  var HX = 15, HZ = 9, H = 5.6;
  var COL = { manoir: ['#3a2418', '#f0b070'], casino: ['#35083f', '#ff4be0'], marche: ['#1c1442', '#ff8a5a'], station: ['#08283a', '#39d6ff'], musee: ['#3a342c', '#ecdcae'], port: ['#46243a', '#ffb060'] };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function injectCss() {
    if (document.getElementById('hnthub-css')) return;
    var s = document.createElement('style'); s.id = 'hnthub-css';
    s.textContent = '.hnt-md{position:absolute;inset:0;background:rgba(4,3,12,.7);display:flex;align-items:center;justify-content:center;z-index:30;font-family:inherit;color:#fff}' +
      '.hnt-mdb{background:rgba(14,10,30,.97);border:2px solid rgba(255,160,90,.5);border-radius:18px;padding:18px 22px;width:min(460px,94vw);max-height:90vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.6)}' +
      '.hnt-mdb h3{margin:0 0 12px;font-size:22px;text-align:center}.hnt-mdb .sec{background:rgba(255,255,255,.06);border-radius:12px;padding:10px 12px;margin-bottom:10px}.hnt-mdb .sec b{display:block;margin-bottom:6px;font-size:15px}.hnt-mdb .sec small{opacity:.75;display:block;margin-bottom:6px}' +
      '.hnt-mdb .maps{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}.hnt-mdb .maps button{padding:7px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-weight:800;font-size:13px;cursor:pointer;text-align:left}.hnt-mdb .maps button.on{background:rgba(255,160,90,.35);border-color:#ffa05a}' +
      '.hnt-mdb .go{width:100%;padding:10px;border-radius:11px;border:0;background:#ff7a3d;color:#1a0a00;font-weight:900;font-size:15px;cursor:pointer}.hnt-mdb .go.g{background:#3ddc84;color:#06210f}.hnt-mdb input{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.4);color:#fff;font-size:20px;letter-spacing:4px;font-weight:900;text-transform:uppercase;text-align:center;margin-bottom:8px}' +
      '.hnt-mdb .x{display:block;margin:4px auto 0;background:none;border:0;color:#fff;opacity:.75;cursor:pointer;font-weight:800;font-size:13px}.hnt-mdb .err{color:#ff7a7a;font-weight:800;font-size:13px;min-height:16px;text-align:center}';
    document.head.appendChild(s);
  }

  function createHub(world) {
    var low = world.low, i;
    var room = { title: '🔍 PROP HUNT', subtitle: 'CHOISIS TA CARTE OU CRÉE UN SALON PRIVÉ', topic: 'flambeurs-prophunt-hub', group: new THREE.Group(), doors: [], interactables: [], colliders: [] };
    var g = room.group; room.bounds = { xMin: -HX + 0.8, xMax: HX - 0.8, zMin: -HZ + 0.8, zMax: HZ - 0.8 };
    function box(w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; }
    var gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 });

    /* sol, murs, plafond */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: PT.T('parquet', 0x4a3020, 0, HX * 2 / 3, HZ * 2 / 3, 3), roughness: 0.45, metalness: 0.05 })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    function wall(len, px, pz, ry) { var m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: PT.T('damask', 0x1e1418, 0x8a5a30, len / 2.8, H / 2.8, 5), roughness: 0.85 })); m.position.set(px, H / 2, pz); m.rotation.y = ry; g.add(m); }
    wall(HX * 2, 0, -HZ, 0); wall(HX * 2, 0, HZ, Math.PI); wall(HZ * 2, -HX, 0, Math.PI / 2); wall(HZ * 2, HX, 0, -Math.PI / 2);
    box(HX * 2, 0.22, 0.2, gold, 0, H - 0.11, -HZ + 0.1); box(HX * 2, 0.22, 0.2, gold, 0, H - 0.11, HZ - 0.1); box(0.2, 0.22, HZ * 2, gold, -HX + 0.1, H - 0.11, 0); box(0.2, 0.22, HZ * 2, gold, HX - 0.1, H - 0.11, 0);
    box(HX * 2, 0.9, 0.12, new THREE.MeshStandardMaterial({ map: PT.T('wood', 0x3d2314, 0, 6, 1, 4), roughness: 0.6 }), 0, 0.45, -HZ + 0.07);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0x0b0709 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);

    /* tapis central avec le titre */
    var rc = mkCanvas(512, 512), rx = rc.getContext('2d'), rg = rx.createRadialGradient(256, 256, 20, 256, 256, 256); rg.addColorStop(0, '#5a2a14'); rg.addColorStop(0.85, '#341608'); rg.addColorStop(1, '#241006'); rx.fillStyle = rg; rx.fillRect(0, 0, 512, 512);
    rx.strokeStyle = '#ffa05a'; rx.lineWidth = 7; rx.beginPath(); rx.arc(256, 256, 236, 0, TAU); rx.stroke(); rx.lineWidth = 3; rx.beginPath(); rx.arc(256, 256, 220, 0, TAU); rx.stroke();
    rx.textAlign = 'center'; rx.textBaseline = 'middle'; rx.fillStyle = '#ffe2b8'; rx.font = '900 66px ' + SERIF; rx.fillText('PROP', 256, 196); rx.fillText('HUNT', 256, 276); rx.font = '60px serif'; rx.fillText('🔍', 256, 360);
    var rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshStandardMaterial({ map: mkTex(rc), roughness: 0.9 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 1.5); g.add(rug);

    /* décor : des objets du jeu, posés dans la salle (ils se cachent parmi les affiches !) */
    var decor = [['barrel', -13.5, 7.2, 0.5], ['crate', -12.4, 7.6, 0.2], ['woodcrate', -13.3, 5.6, 0.1], ['floorlamp', -13.8, 3.5, 0], ['vase', -13.9, -2.2, 0], ['bust', -13.4, 0, 0], ['clock', -13.8, 2.0, 1.57],
      ['armor', 13.8, -6.6, -1.57], ['globe', 13.4, 6.6, 0], ['trunk', 13.2, 7.8, -1.57], ['floorlamp', 13.8, -3.6, 0], ['slot', 12.6, 7.9, -0.4], ['cryopod', -9.5, 7.6, 0.3], ['sofa', 5.5, 7.6, Math.PI], ['table_round', 8.8, 5.2, 0], ['armchair', 11.2, 4.4, -2.2], ['chair', 7.4, 4.3, 2.4], ['stanchion', -3.2, 5.0, 0], ['stanchion', 3.2, 5.0, 0], ['museumbench', -7.5, 6.4, Math.PI]];
    decor.forEach(function (d) { var m = PM.build(d[0]), b = PS.PROPS[d[0]] || [0.4, 0.5, 0.4]; m.position.set(d[1], 0, d[2]); m.rotation.y = d[3]; g.add(m); room.colliders.push({ x: d[1], z: d[2], r: Math.max(b[0], b[2]) * 0.9 }); });

    /* les affiches des cartes */
    var info = {}, posters = [];
    function drawPoster(p) {
      var id = p.id, M = PS.MAPS[id], c = p.c, x = c.getContext('2d'), W = c.width, Hh = c.height, cc = COL[id] || ['#222', '#fff'], gr = x.createLinearGradient(0, 0, W, Hh);
      gr.addColorStop(0, cc[0]); gr.addColorStop(1, '#0a0610'); x.fillStyle = gr; x.fillRect(0, 0, W, Hh);
      x.fillStyle = cc[1]; x.globalAlpha = 0.16; x.beginPath(); x.arc(W * 0.78, Hh * 0.32, 120, 0, TAU); x.fill(); x.globalAlpha = 1;
      x.strokeStyle = cc[1]; x.lineWidth = 6; x.strokeRect(10, 10, W - 20, Hh - 20);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '120px serif'; x.fillText(M.icon, W / 2, 112);
      x.fillStyle = '#fff'; x.font = '900 40px ' + SERIF; x.fillText(M.name, W / 2, 200, W - 40);
      x.fillStyle = 'rgba(255,255,255,0.78)'; x.font = '700 21px sans-serif';
      var words = M.desc.split(' '), line = '', y = 236; words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 70 && line) { x.fillText(line, W / 2, y); line = w; y += 25; } else line = t; }); x.fillText(line, W / 2, y);
      var inf = info[id] || { n: 0, ph: 'lobby' }, st = inf.ph === 'lobby' ? (inf.n ? 'En attente de joueurs' : 'Salle vide') : 'Manche en cours';
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(20, Hh - 78, W - 40, 56); x.fillStyle = inf.n ? '#7dffa8' : '#cfcfcf'; x.font = '900 26px sans-serif'; x.fillText('👥 ' + inf.n + ' joueur' + (inf.n > 1 ? 's' : '') + ' · ' + st, W / 2, Hh - 50, W - 50);
      p.tex.needsUpdate = true;
    }
    PS.MAP_IDS.forEach(function (id, k) {
      var px = -12 + k * 4.8, c = mkCanvas(512, 380), t = mkTex(c), p = { id: id, c: c, tex: t, x: px };
      box(4.4, 3.2, 0.12, gold, px, 2.75, -HZ + 0.1);
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 3.0), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.6 })); pm.position.set(px, 2.75, -HZ + 0.18); g.add(pm);
      var sp = box(1.2, 0.08, 0.3, gold, px, 4.5, -HZ + 0.4); sp.rotation.x = -0.4;                                      // petit projecteur au-dessus de l'affiche
      if (!low) { var lt = new THREE.PointLight(new THREE.Color(COL[id][1]), 0.55, 8); lt.position.set(px, 3.2, -HZ + 1.6); g.add(lt); }
      posters.push(p); drawPoster(p);
      room.interactables.push({ hit: pm, x: px, z: -HZ + 2.0, radius: 2.3, enabled: function () { return true; }, prompt: function () { var n = (info[id] || { n: 0 }).n; return '🗺️ Jouer : ' + PS.MAPS[id].name + (n ? ' (' + n + ' en jeu)' : '') + '  [F / clic]'; }, use: function () { joinPublic(id); } });
    });
    function joinPublic(id) { F.propJoin = { room: 'pub-' + id }; world.goRoom('prophuntgame', 'prophunt'); }

    /* le bureau du salon privé */
    var desk = PM.build('console'); desk.position.set(HX - 1.3, 0, 0); desk.rotation.y = -Math.PI / 2; g.add(desk); room.colliders.push({ x: HX - 1.3, z: -0.5, r: 0.7 }, { x: HX - 1.3, z: 0.5, r: 0.7 });
    var sc = mkCanvas(512, 160), sx = sc.getContext('2d'); sx.fillStyle = 'rgba(8,4,16,0.92)'; sx.fillRect(0, 0, 512, 160); sx.strokeStyle = '#3ddc84'; sx.lineWidth = 7; sx.shadowColor = '#3ddc84'; sx.shadowBlur = 20; sx.strokeRect(10, 10, 492, 140); sx.fillStyle = '#c8ffe0'; sx.font = '900 56px ' + SERIF; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('🔒 SALON PRIVÉ', 256, 62); sx.font = '700 26px sans-serif'; sx.fillText('Crée un salon · rejoins avec un code', 256, 118);
    var stex = mkTex(sc), sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.31), new THREE.MeshStandardMaterial({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 1.2 })); sign.position.set(HX - 0.08, 3.1, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    if (!low) { var gl = new THREE.PointLight(0x3ddc84, 0.8, 9); gl.position.set(HX - 2.5, 3, 0); g.add(gl); }
    var hitDesk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hitDesk.position.set(HX - 1.3, 0.8, 0); g.add(hitDesk);
    room.interactables.push({ hit: hitDesk, x: HX - 2.6, z: 0, radius: 2.4, enabled: function () { return !modal; }, prompt: function () { return '🔒 Salon privé : créer ou rejoindre  [F / clic]'; }, use: function () { openModal(); } });

    /* lumières */
    g.add(new THREE.AmbientLight(0xffe8d8, 1.0));
    if (!low) [[-9, -2], [0, -2], [9, -2], [-8, 5], [8, 5], [0, 4]].forEach(function (p) { var l = new THREE.PointLight(0xffd9a0, 0.6, 12); l.position.set(p[0], 4.4, p[1]); g.add(l); });

    /* porte : retour au salon des mini jeux */
    world.addDoor(room, { x: 0, z: HZ, nx: 0, nz: -1, w: 2.2, h: 3.0, label: '🎮 MINI JEUX', sub: 'RETOUR AU SALON', color: 0xff7a3d, target: 'minijeux', theme: 'exitUno' });
    room.spawn = function () { return { x: 0, z: HZ - 3.2, yaw: 0 }; };
    room.hint = function (w) { return w.touch ? '' : 'ZQSD / flèches : marcher · approche-toi d\'une affiche et appuie sur F pour jouer · le bureau à droite : salon privé' + (w.full ? ' · Échap : quitter' : ''); };

    /* fenêtre « salon privé » */
    var modal = null, selMap = PS.MAP_IDS[0];
    function openModal() {
      if (modal) return; injectCss();
      var el = document.createElement('div'); el.className = 'hnt-md';
      el.innerHTML = '<div class="hnt-mdb"><h3>🔒 Salon privé</h3><div class="sec"><b>Créer un salon</b><small>Choisis la carte, puis donne le code à tes amis. Tu lances la manche quand tout le monde est là ; le chasseur est tiré au hasard.</small><div class="maps">' +
        PS.MAP_IDS.map(function (id) { return '<button data-map="' + id + '" class="' + (id === selMap ? 'on' : '') + '">' + PS.MAPS[id].icon + ' ' + esc(PS.MAPS[id].name) + '</button>'; }).join('') + '</div><button class="go" data-a="create">✨ Créer le salon</button></div>' +
        '<div class="sec"><b>Rejoindre un salon</b><input data-i="code" maxlength="6" placeholder="CODE" autocomplete="off"><button class="go g" data-a="join">▶ Rejoindre</button></div><div class="err"></div><button class="x" data-a="close">✕ Fermer</button></div>';
      world.container.appendChild(el); modal = el;
      var inp = el.querySelector('input'), err = el.querySelector('.err'); setTimeout(function () { try { inp.focus(); } catch (e) { /* ok */ } }, 50);
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') join(); });
      inp.addEventListener('keyup', function (e) { e.stopPropagation(); });
      function join() { var code = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) { err.textContent = 'Le code fait 4 à 6 caractères.'; return; } F.propJoin = { room: 'priv-' + code }; closeModal(); world.goRoom('prophuntgame', 'prophunt'); }
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) { if (e.target === el) closeModal(); return; }
        if (b.dataset.map) { selMap = b.dataset.map; Array.prototype.forEach.call(el.querySelectorAll('.maps button'), function (x) { x.classList.toggle('on', x === b); }); return; }
        if (b.dataset.a === 'close') closeModal();
        else if (b.dataset.a === 'create') { var code = ''; for (var q = 0; q < 5; q++) code += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)); F.propJoin = { room: 'priv-' + code, map: selMap, create: 1 }; closeModal(); world.goRoom('prophuntgame', 'prophunt'); }
        else if (b.dataset.a === 'join') join();
      });
    }
    function closeModal() { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); modal = null; }

    /* nombre de joueurs en direct */
    var timer = null, activeHub = false;
    function poll() {
      if (!activeHub) return;
      fetch('/api/prophunt-info', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (!d || !activeHub) return; info = d; posters.forEach(drawPoster); }).catch(function () { /* hors ligne */ });
    }
    room.onEnter = function (w) {
      activeHub = true; F.propJoin = null;
      if (F.isStaff && !F.isStaff()) { w.flash('🔍 Prop Hunt en test', 'Réservé au Patron, au Co Fondateur et au Staff'); setTimeout(function () { world.goRoom('minijeux', 'prophunt'); }, 300); return; }
      poll(); timer = setInterval(poll, 5000);
    };
    room.onLeave = function () { activeHub = false; if (timer) { clearInterval(timer); timer = null; } closeModal(); };
    room.onPageHide = room.onLeave;
    room.update = function () { };
    return room;
  }

  F.registerRoom('prophunt', createHub);
})();
