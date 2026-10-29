/* =====================================================================
   hud3d.js — HUD du joueur, roue des danses et téléphone (monde 3D complet, PC)
   ---------------------------------------------------------------------
   - HUD en bas à gauche : avatar, pseudo, rang, solde, et trois boutons-logos (Danses [E], Emotes, Téléphone [T]).
   - Roue des danses / emotes : touche E (ou B), 1 à 8 pour choisir, Tab pour passer des danses aux emotes.
   - Téléphone : touche T.
     * Onglet Danses : déclencher danses et emotes depuis le téléphone avec les logos colorés.
     * Onglet Paramètres : gérer la sensibilité souris, le volume du son, la qualité 3D / FPS, plein écran, accueil casino.
     * Onglet Profil : carte joueur, solde, note invitant à marcher et explorer le casino à pied.
   Le monde (world3d.js) l'appelle par F.initPlayerHud(world) et lui passe la main via ph.sync() / ph.close() / ph.dispose().
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F) return;

  function fa(n) { return '<i class="fa-solid ' + n + '"></i>'; }
  function logo(inner, c) { return '<span class="fl-logo" style="--c:' + c + '">' + inner + '</span>'; }
  function st() { try { return (typeof state !== 'undefined' && state) || null; } catch (e) { return null; } }
  function typing(e) { var t = e.target, tag = t && t.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(t && t.isContentEditable); }

  F.initPlayerHud = function (w) {
    var root = document.createElement('div');
    root.className = 'ph';
    root.innerHTML =
      '<div class="ph-hud s3d-room-only">' +
        '<div class="ph-now" data-ph="now" hidden><span><i class="fa-solid fa-music"></i> <b data-ph="nowname"></b></span><button data-act="stop">Arrêter</button></div>' +
        '<div class="ph-card">' +
          '<button class="ph-ava" data-act="profile" title="Mon profil"><span data-ph="ava">?</span></button>' +
          '<div class="ph-id"><b class="ph-name" data-ph="name">Invité</b><span class="ph-rank role-tag role-flambeur" data-ph="rank"></span></div>' +
          '<div class="ph-bal" title="Ton solde"><i class="fl-coin"></i><b data-ph="bal">0</b></div>' +
        '</div>' +
        '<div class="ph-dock">' +
          '<button class="ph-btn" data-act="wheel-dance" title="Danses">' + logo(fa('fa-music'), '232,121,249') + '<span>Danses</span><kbd>E</kbd></button>' +
          '<button class="ph-btn" data-act="wheel-emote" title="Emotes">' + logo(fa('fa-face-smile'), '251,191,36') + '<span>Emotes</span></button>' +
          '<button class="ph-btn" data-act="phone" title="Téléphone">' + logo(fa('fa-mobile-screen-button'), '56,189,248') + '<span>Téléphone</span><kbd>T</kbd></button>' +
        '</div>' +
      '</div>' +
      '<div class="ph-wheel" data-ph="wheel" hidden>' +
        '<div class="ph-wheel-box"><div class="ph-ring" data-ph="ring"></div>' +
          '<div class="ph-wheel-mid"><b data-ph="wname"></b><small data-ph="whint"></small></div></div>' +
        '<div class="ph-wheel-tabs"><button data-tab="dance">Danses</button><button data-tab="emote">Emotes</button><span>Tab : changer · Échap : fermer</span></div>' +
      '</div>' +
      '<div class="ph-phone" data-ph="phone" hidden>' +
        '<div class="ph-body"><div class="ph-notch"></div>' +
          '<div class="ph-status"><b data-ph="clock">12:00</b><span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-battery-full"></i></span></div>' +
          '<div class="ph-screen" data-ph="screen"></div>' +
          '<nav class="ph-tabs">' +
            '<button data-page="dance">' + fa('fa-music') + '<span>Danses</span></button>' +
            '<button data-page="settings">' + fa('fa-gear') + '<span>Paramètres</span></button>' +
            '<button data-page="home">' + fa('fa-user') + '<span>Profil</span></button>' +
          '</nav>' +
        '</div>' +
      '</div>' +
      '<div class="ph-top-right">' +
        '<div class="ph-stat-pill ph-online" title="Joueurs dans cette salle"><i class="fa-solid fa-users"></i> <b data-ph="onlineval">1</b> <span class="ph-stat-label">en ligne</span></div>' +
        '<div class="ph-stat-pill ph-fps" title="Images par seconde (FPS)"><span class="ph-fps-dot" data-ph="fpsdot"></span><b data-ph="fpsval">--</b> <span class="ph-stat-label">FPS</span></div>' +
      '</div>';
    w.hud.insertBefore(root, w.elFade);
    w.hud.classList.add('has-ph');

    function q(k) { return root.querySelector('[data-ph="' + k + '"]'); }
    var elAva = q('ava'), elName = q('name'), elRank = q('rank'), elBal = q('bal'), elNow = q('now'), elNowName = q('nowname');
    var elWheel = q('wheel'), elRing = q('ring'), elWName = q('wname'), elWHint = q('whint');
    var elPhone = q('phone'), elScreen = q('screen'), elClock = q('clock');
    var elFpsVal = q('fpsval'), elFpsDot = q('fpsdot'), elOnlineVal = q('onlineval');
    var tab = 'dance', page = 'settings', last = {};
    try { var tv = localStorage.getItem('f3d_wheel_tab'); if (tv === 'dance' || tv === 'emote') tab = tv; } catch (e) { /* ok */ }

    /* ---------- HUD ---------- */
    function put(el, key, v, html) { if (last[key] === v) return; last[key] = v; if (html) el.innerHTML = v; else el.textContent = v; }
    function sync() {
      var s = st(), name = s && s.username ? s.username : 'Invité', av = '';
      try { av = typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) { /* page pas prête */ }
      if (!av || av === '🎭') av = name.charAt(0).toUpperCase();
      var boss = false; try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); } catch (e) { /* ok */ }
      put(elName, 'name', name);
      put(elAva, 'ava', av);
      var rIcon = boss ? 'fa-crown' : 'fa-fire';
      var rName = boss ? 'Patron' : 'Flambeur';
      var rClass = boss ? 'role-patron' : 'role-flambeur';
      put(elRank, 'rank', '<i class="fa-solid ' + rIcon + ' role-crown"></i> <span class="role-label">' + rName + '</span>', true);
      elRank.className = 'ph-rank role-tag ' + rClass;
      put(elBal, 'bal', s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0');
      var e = w.emoId ? F.emoteById(w.emoId) : null;
      elNow.hidden = !e;
      if (e) put(elNowName, 'now', e.name);
      // Joueurs en ligne dans la salle (moi + remotes actifs)
      var onlineCount = 1;
      if (w && w.remote) {
        var nowT = performance.now();
        Object.keys(w.remote).forEach(function (k) {
          var rem = w.remote[k];
          if (rem && (!rem.recv || nowT - rem.recv < 3500)) onlineCount++;
        });
      }
      put(elOnlineVal, 'online', String(onlineCount));
      // FPS en direct dans l'encadré en haut à droite
      var fpsVal = (F.quality && F.quality.fps) ? F.quality.fps : (w.lastFps || 0);
      if (fpsVal > 0) {
        put(elFpsVal, 'fps', String(fpsVal));
        var col = fpsVal >= 50 ? '#10b981' : (fpsVal >= 30 ? '#f59e0b' : '#ef4444');
        if (last.fpscol !== col) {
          last.fpscol = col;
          elFpsDot.style.background = col;
          elFpsDot.style.boxShadow = '0 0 8px ' + col;
        }
      }
      if (phoneOpen) {
        var d = new Date(); put(elClock, 'clock', ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));
        if (page === 'settings') {
          var qLab = F.quality && F.quality.label ? F.quality.label() : 'Auto';
          var elQL = root.querySelector('[data-ph="quallabel"]');
          if (elQL && elQL.textContent !== qLab) elQL.textContent = qLab;
        }
      }
    }

    /* ---------- roue des danses et emotes ---------- */
    var wheelOpen = false, phoneOpen = false;
    function list() { return tab === 'dance' ? F.DANCES : F.EMOTES; }
    function wheelIdle() { elWName.textContent = tab === 'dance' ? 'Danses' : 'Emotes'; elWHint.textContent = 'Clique ou touche 1 à 8'; }
    function renderWheel() {
      var R = 138, half = 190, sz = 68, html = '';
      list().forEach(function (e, i) {
        var a = (-90 + i * 45) * Math.PI / 180;
        html += '<button class="ph-slot' + (w.emoId === e.id ? ' on' : '') + '" data-emo="' + e.id + '" data-i="' + i + '" style="left:' + Math.round(half + R * Math.cos(a) - sz / 2) + 'px;top:' + Math.round(half + R * Math.sin(a) - sz / 2) + 'px;--c:' + e.color + '">' +
          '<span class="fl-logo" style="--c:' + e.color + '"><i class="fa-solid ' + e.icon + '"></i></span><kbd>' + (i + 1) + '</kbd></button>';
      });
      elRing.innerHTML = html;
      Array.prototype.forEach.call(root.querySelectorAll('.ph-wheel-tabs [data-tab]'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
      wheelIdle();
    }
    function setTab(t) {
      tab = t; try { localStorage.setItem('f3d_wheel_tab', t); } catch (e) { /* ok */ }
      renderWheel();
    }
    function openWheel(t) {
      if (!w.canEmote()) return;
      closePhone();
      if (t) { tab = t; try { localStorage.setItem('f3d_wheel_tab', t); } catch (e) { /* ok */ } }
      w._libererSouris();
      renderWheel(); elWheel.hidden = false; wheelOpen = true;
    }
    function closeWheel() { elWheel.hidden = true; wheelOpen = false; }
    function play(id) {
      var e = F.emoteById(id);
      if (!e) return;
      closeWheel(); closePhone();
      if (w.emoId === id && !e.dur) w.stopEmote();
      else if (!w.emote(id)) w.flash('Pas possible de danser ici pour le moment.');
    }

    /* ---------- téléphone ---------- */
    function app(attr, val, ic, c, label, sub) {
      return '<button class="ph-app" ' + attr + '="' + val + '">' + logo(ic, c) + '<span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    }

    function renderPhone() {
      var h = '';
      if (page === 'settings') {
        var vol = 50;
        try {
          if (typeof getMasterVolume === 'function') vol = Math.round(getMasterVolume() * 100);
          else if (typeof state !== 'undefined' && typeof state.soundVolume === 'number') vol = Math.round(state.soundVolume * 100);
        } catch (e) {}
        var volIc = vol === 0 ? 'fa-volume-xmark' : (vol < 40 ? 'fa-volume-low' : 'fa-volume-high');
        var sensiVal = (w.sensi || 1.0).toFixed(1);
        var qualLab = (F.quality && F.quality.label) ? F.quality.label() : 'Auto';
        var fullLab = w.full ? 'Mode fenêtré' : 'Grand écran';
        var fullIc = w.full ? 'fa-compress' : 'fa-expand';

        h = '<div class="ph-sect">Paramètres du jeu</div>' +
          // Sensi
          '<div class="ph-card-setting">' +
            '<div class="ph-row-head">' +
              '<div class="ph-row-title">' + logo(fa('fa-computer-mouse'), '251,191,36') + '<span><b>Sensibilité souris</b><small>Vue en grand écran</small></span></div>' +
              '<span class="ph-val-badge" data-ph="sensival">' + sensiVal + '</span>' +
            '</div>' +
            '<input type="range" min="0.2" max="3" step="0.1" value="' + sensiVal + '" class="ph-slider" data-set="sensi">' +
          '</div>' +
          // Son
          '<div class="ph-card-setting">' +
            '<div class="ph-row-head">' +
              '<div class="ph-row-title"><span data-ph="soundlogo">' + logo(fa(volIc), '56,189,248') + '</span><span><b>Volume sonore</b><small>Ambiance & effets</small></span></div>' +
              '<span class="ph-val-badge" data-ph="soundval">' + (vol === 0 ? 'Muet' : vol + '%') + '</span>' +
            '</div>' +
            '<input type="range" min="0" max="100" step="1" value="' + vol + '" class="ph-slider" data-set="sound">' +
            '<div class="ph-setting-actions">' +
              '<button class="ph-btn-action" data-act="toggle-mute">' + (vol === 0 ? fa('fa-volume-high') + ' Activer le son' : fa('fa-volume-xmark') + ' Couper le son') + '</button>' +
            '</div>' +
          '</div>' +
          // Qualité
          '<div class="ph-card-setting">' +
            '<div class="ph-row-head">' +
              '<div class="ph-row-title">' + logo(fa('fa-gear'), '192,132,252') + '<span><b>Qualité 3D</b><small>Résolution & fluidité</small></span></div>' +
            '</div>' +
            '<button class="ph-row-btn" data-act="cycle-qual"><span data-ph="quallabel">' + qualLab + '</span>' + fa('fa-arrows-rotate') + '</button>' +
          '</div>' +
          // Plein écran
          '<div class="ph-card-setting">' +
            '<div class="ph-row-head">' +
              '<div class="ph-row-title">' + logo(fa(fullIc), '250,204,21') + '<span><b>Affichage</b><small>Immersion totale</small></span></div>' +
            '</div>' +
            '<button class="ph-row-btn" data-act="toggle-full"><span data-ph="fulllabel">' + fullLab + '</span>' + fa('fa-chevron-right') + '</button>' +
          '</div>' +
          // Accueil Casino
          '<div class="ph-card-setting ph-card-danger">' +
            '<div class="ph-row-head">' +
              '<div class="ph-row-title">' + logo(fa('fa-house'), '239,68,68') + '<span><b>Accueil du Casino</b><small>Quitter le monde 3D</small></span></div>' +
            '</div>' +
            '<button class="ph-row-btn ph-btn-danger" data-act="classic-menu"><span>Retour au menu 2D</span>' + fa('fa-door-open') + '</button>' +
          '</div>';
      } else if (page === 'home') {
        var s = st(), name = s && s.username ? s.username : 'Invité', av = '';
        try { av = typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) {}
        if (!av || av === '🎭') av = name.charAt(0).toUpperCase();
        var boss = false; try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); } catch (e) {}
        var bal = s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0';

        h = '<div class="ph-profile-banner">' +
            '<div class="ph-profile-ava">' + av + '</div>' +
            '<div class="ph-profile-meta">' +
              '<b class="ph-profile-name">' + name + '</b>' +
              '<span class="ph-rank role-tag ' + (boss ? 'role-patron' : 'role-flambeur') + '"><i class="fa-solid ' + (boss ? 'fa-crown' : 'fa-fire') + ' role-crown"></i> <span class="role-label">' + (boss ? 'Patron' : 'Flambeur') + '</span></span>' +
              '<div class="ph-bal"><i class="fl-coin"></i><b>' + bal + '</b> jetons</div>' +
            '</div>' +
          '</div>' +
          '<div class="ph-explore-note">' +
            logo(fa('fa-person-walking'), '245,158,11') +
            '<span><b>Casino 3D immersif</b>Explore le hall et les salles à pied pour découvrir les machines, tables et la boutique !</span>' +
          '</div>' +
          '<div class="ph-sect">Raccourcis</div>' +
          '<div class="ph-apps">' +
            app('data-act', 'profile', fa('fa-user-pen'), '251,191,36', 'Mon Profil') +
            app('data-act', 'settings-tab', fa('fa-gear'), '192,132,252', 'Paramètres') +
            app('data-act', 'classic-menu', fa('fa-table-columns'), '148,163,184', 'Menu 2D') +
          '</div>';
      } else {
        h = '<div class="ph-sect">Danses (en boucle)</div><div class="ph-apps">' +
          F.DANCES.map(function (e) { return app('data-emo', e.id, '<i class="fa-solid ' + e.icon + '"></i>', e.color, e.name); }).join('') + '</div>' +
          '<div class="ph-sect">Emotes (instantanées)</div><div class="ph-apps">' +
          F.EMOTES.map(function (e) { return app('data-emo', e.id, '<i class="fa-solid ' + e.icon + '"></i>', e.color, e.name); }).join('') + '</div>';
      }
      elScreen.innerHTML = h; elScreen.scrollTop = 0;
      Array.prototype.forEach.call(root.querySelectorAll('.ph-tabs [data-page]'), function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    }

    function openPhone(p) {
      if (!w.canEmote()) return;
      closeWheel();
      if (p) page = p;
      w._libererSouris();
      renderPhone(); last.clock = null; elPhone.hidden = false; phoneOpen = true; sync();
    }
    function closePhone() { elPhone.hidden = true; phoneOpen = false; }
    function closeAll() { closeWheel(); closePhone(); }

    /* ---------- inputs (sliders sensi & son) ---------- */
    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var s = t.getAttribute('data-set');
      if (s === 'sensi') {
        var v = parseFloat(t.value);
        w.sensi = F.sensi(v);
        var b = root.querySelector('[data-ph="sensival"]');
        if (b) b.textContent = w.sensi.toFixed(1);
      } else if (s === 'sound') {
        var pct = parseInt(t.value, 10);
        try {
          if (typeof onSoundSliderInput === 'function') onSoundSliderInput(pct);
          else if (typeof setMasterVolume === 'function') setMasterVolume(pct / 100);
        } catch (e) {}
        var b2 = root.querySelector('[data-ph="soundval"]');
        if (b2) b2.textContent = pct === 0 ? 'Muet' : pct + '%';
        var slot = root.querySelector('[data-ph="soundlogo"]');
        if (slot) {
          var icClass = pct === 0 ? 'fa-volume-xmark' : (pct < 40 ? 'fa-volume-low' : 'fa-volume-high');
          slot.innerHTML = logo(fa(icClass), '56,189,248');
        }
      }
    });

    /* ---------- clics ---------- */
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('button,.ph-wheel') : null;
      if (!t) return;
      if (t.classList.contains('ph-wheel')) { closeWheel(); return; }
      var a = t.getAttribute('data-act');
      if (a === 'wheel-dance') { if (wheelOpen && tab === 'dance') closeWheel(); else openWheel('dance'); }
      else if (a === 'wheel-emote') { if (wheelOpen && tab === 'emote') closeWheel(); else openWheel('emote'); }
      else if (a === 'phone') { if (phoneOpen) closePhone(); else openPhone(); }
      else if (a === 'stop') w.stopEmote();
      else if (a === 'profile') { try { if (typeof openProfileModal === 'function') { w.setFull(false); openProfileModal(); } } catch (e) {} }
      else if (a === 'settings-tab') { page = 'settings'; renderPhone(); }
      else if (a === 'classic-menu') { closeAll(); if (w.opts.onMenu) w.opts.onMenu(); else w.exitGame('hall'); }
      else if (a === 'toggle-mute') {
        try { if (typeof toggleSoundMute === 'function') toggleSoundMute(); } catch (e) {}
        renderPhone();
      }
      else if (a === 'cycle-qual') {
        if (F.quality && F.quality.cycle) {
          F.quality.cycle();
          w._applyQuality();
          w.syncHud();
          var qb = root.querySelector('[data-ph="quallabel"]');
          if (qb) qb.textContent = F.quality.label();
        }
      }
      else if (a === 'toggle-full') {
        w.setFull(!w.full);
        var fb = root.querySelector('[data-ph="fulllabel"]');
        if (fb) fb.textContent = w.full ? 'Mode fenêtré' : 'Grand écran';
      }
      else if (t.hasAttribute('data-tab')) setTab(t.getAttribute('data-tab'));
      else if (t.hasAttribute('data-page')) { page = t.getAttribute('data-page'); renderPhone(); }
      else if (t.hasAttribute('data-emo')) play(t.getAttribute('data-emo'));
    });
    root.addEventListener('mouseover', function (ev) {
      var t = ev.target.closest ? ev.target.closest('.ph-slot') : null;
      if (!t) return;
      var e = F.emoteById(t.getAttribute('data-emo'));
      if (e) { elWName.textContent = e.name; elWHint.textContent = e.dur ? 'Emote · ' + Math.round(e.dur) + ' s' : 'Danse · marche pour arrêter'; }
    });
    root.addEventListener('mouseout', function (ev) { if (ev.target.closest && ev.target.closest('.ph-slot')) wheelIdle(); });

    /* ---------- clavier ---------- */
    function kd(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev) || !w.running || w.dead || !w.container.clientWidth) return;
      if (ev.code === 'Escape') {
        if (wheelOpen || phoneOpen) { ev.stopImmediatePropagation(); ev.preventDefault(); closeAll(); }
        return;
      }
      if (w.mode !== 'room' || ev.repeat) return;
      // Touche E (ou B) : ouvrir/fermer la roue des danses & emotes
      if (ev.code === 'KeyE' || ev.code === 'KeyB') { ev.preventDefault(); if (wheelOpen) closeWheel(); else openWheel(); }
      else if (ev.code === 'KeyT') { ev.preventDefault(); if (phoneOpen) closePhone(); else openPhone(); }
      else if (wheelOpen && ev.code === 'Tab') { ev.preventDefault(); setTab(tab === 'dance' ? 'emote' : 'dance'); }
      else if (wheelOpen) {
        var m = /^(?:Digit|Numpad)([1-8])$/.exec(ev.code);
        if (m && list()[+m[1] - 1]) { ev.preventDefault(); play(list()[+m[1] - 1].id); }
      }
    }
    window.addEventListener('keydown', kd, true);

    sync();
    return {
      sync: sync,
      close: closeAll,
      dispose: function () {
        window.removeEventListener('keydown', kd, true);
        if (root.parentNode) root.parentNode.removeChild(root);
        w.hud.classList.remove('has-ph');
      }
    };
  };
})();
