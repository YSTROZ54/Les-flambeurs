/* =====================================================================
   hud3d.js — HUD du joueur, roue des danses et téléphone (monde 3D complet, PC)
   ---------------------------------------------------------------------
   - HUD en bas à gauche : chat de la salle, avatar, pseudo, rang, solde, et quatre boutons-logos (Danses [E], Emotes [A], Téléphone [T], Chat [Entrée]).
   - Inventaire en bas au milieu : 5 cases (touches 1 à 5 ou clic pour utiliser, molette pour changer de case), le téléphone est au milieu (3e case).
   - Menu pause : Échap (ou la souris libérée par le navigateur en grand écran) ; Échap ou « Reprendre » pour revenir.
   - Roue des danses / emotes : touche E (ou B), 1 à 8 pour choisir, Tab pour passer des danses aux emotes.
   - Téléphone : touche T, bouton ✕ pour le fermer, on le déplace en attrapant l'encoche en haut au milieu.
   - Chat : Entrée pour écrire, Entrée pour envoyer, Échap pour fermer. Rien ne s'affiche à l'écran : le message sort en bulle au-dessus de la tête
     de celui qui parle (trois points pendant qu'il écrit), et l'historique est dans l'onglet Chat du téléphone. Canal temps réel de la salle (« chat », « typing »).
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
        '<div class="ph-chat" data-ph="chat">' +
          '<form class="ph-chat-form" data-ph="chatform" hidden><input data-ph="chatin" maxlength="120" placeholder="Écris un message… (Entrée : envoyer · Échap : fermer)" autocomplete="off" spellcheck="false"></form>' +
        '</div>' +
        '<div class="ph-now" data-ph="now" hidden><span><i class="fa-solid fa-music"></i> <b data-ph="nowname"></b></span><button data-act="stop">Arrêter</button></div>' +
        '<div class="ph-card">' +
          '<button class="ph-ava" data-act="profile" title="Mon profil"><span data-ph="ava">?</span></button>' +
          '<div class="ph-id"><b class="ph-name" data-ph="name">Invité</b><span class="ph-rank role-tag role-flambeur" data-ph="rank"></span></div>' +
          '<div class="ph-bal" title="Ton solde"><i class="fl-coin"></i><b data-ph="bal">0</b></div>' +
        '</div>' +
        '<div class="ph-dock">' +
          '<button class="ph-btn" data-act="wheel-dance" title="Danses">' + logo(fa('fa-music'), '232,121,249') + '<span>Danses</span><kbd>E</kbd></button>' +
          '<button class="ph-btn" data-act="wheel-emote" title="Emotes">' + logo(fa('fa-face-smile'), '251,191,36') + '<span>Emotes</span><kbd>A</kbd></button>' +
          '<button class="ph-btn" data-act="phone" title="Téléphone">' + logo(fa('fa-mobile-screen-button'), '56,189,248') + '<span>Téléphone</span><kbd>T</kbd></button>' +
          '<button class="ph-btn" data-act="chat" title="Chat de la salle">' + logo(fa('fa-comments'), '52,211,153') + '<span>Chat</span><kbd>↵</kbd></button>' +
        '</div>' +
      '</div>' +
      '<div class="ph-hotbar s3d-room-only" data-ph="hotbar"></div>' +
      '<div class="ph-pause" data-ph="pause" hidden>' +
        '<div class="ph-pause-box">' +
          '<h2>Pause</h2>' +
          '<button class="ph-pause-btn main" data-act="resume">' + fa('fa-play') + '<span>Reprendre</span></button>' +
          '<button class="ph-pause-btn" data-act="pause-settings">' + fa('fa-gear') + '<span>Paramètres</span></button>' +
          '<button class="ph-pause-btn" data-act="pause-profile">' + fa('fa-user') + '<span>Mon profil</span></button>' +
          '<button class="ph-pause-btn" data-act="pause-full">' + fa('fa-expand') + '<span data-ph="pausefull">Grand écran</span></button>' +
          '<button class="ph-pause-btn danger" data-act="classic-menu">' + fa('fa-door-open') + '<span>Retour au menu du casino</span></button>' +
          '<small>Échap : reprendre</small>' +
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
            '<button data-page="chat">' + fa('fa-comments') + '<span>Chat</span></button>' +
            '<button data-page="settings">' + fa('fa-gear') + '<span>Paramètres</span></button>' +
            '<button data-page="home">' + fa('fa-user') + '<span>Profil</span></button>' +
          '</nav>' +
        '</div>' +
        '<button class="ph-close" data-act="close-phone" title="Fermer le téléphone (T)">' + fa('fa-xmark') + '</button>' +
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
    var elPause = q('pause'), elPauseFull = q('pausefull');
    var elChat = q('chat'), elChatForm = q('chatform'), elChatIn = q('chatin'), elHotbar = q('hotbar');
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
      var R = 36.5, html = '';   // rayon et centre en % de la roue : la taille se règle en CSS
      list().forEach(function (e, i) {
        var a = (-90 + i * 45) * Math.PI / 180;
        html += '<button class="ph-slot' + (w.emoId === e.id ? ' on' : '') + '" data-emo="' + e.id + '" data-i="' + i + '" style="left:' + (50 + R * Math.cos(a)).toFixed(2) + '%;top:' + (50 + R * Math.sin(a)).toFixed(2) + '%;--c:' + e.color + '">' +
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
      } else if (page === 'chat') {
        h = '<div class="ph-cp"><div class="ph-cp-list" data-ph="cplist"></div>' +
          '<form class="ph-cp-form" data-ph="cpform"><input data-ph="cpin" maxlength="120" placeholder="Écrire à la salle…" autocomplete="off" spellcheck="false"><button type="submit" title="Envoyer">' + fa('fa-paper-plane') + '</button></form></div>';
      } else {
        h = '<div class="ph-sect">Danses (en boucle)</div><div class="ph-apps">' +
          F.DANCES.map(function (e) { return app('data-emo', e.id, '<i class="fa-solid ' + e.icon + '"></i>', e.color, e.name); }).join('') + '</div>' +
          '<div class="ph-sect">Emotes (instantanées)</div><div class="ph-apps">' +
          F.EMOTES.map(function (e) { return app('data-emo', e.id, '<i class="fa-solid ' + e.icon + '"></i>', e.color, e.name); }).join('') + '</div>';
      }
      elScreen.innerHTML = h; elScreen.scrollTop = 0;
      elScreen.classList.toggle('chat', page === 'chat');
      if (page === 'chat') paintChatPage();
      Array.prototype.forEach.call(root.querySelectorAll('.ph-tabs [data-page]'), function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    }

    function openPhone(p) {
      if (!w.canEmote()) return;
      closeWheel();
      if (p) page = p;
      w._libererSouris();
      renderPhone(); last.clock = null; elPhone.hidden = false; phoneOpen = true; placePhone(); sync();
    }
    function closePhone() { elPhone.hidden = true; phoneOpen = false; typingNotify(false); markHotbar(); }
    function closeAll() { closeWheel(); closePhone(); closeChat(); closePause(); }

    /* ---------- inventaire (5 cases) ---------- */
    // Une case = un objet { id, name, icon, color } ; null = vide. Le téléphone est au milieu (3e case).
    var INV = [null, null, { id: 'phone', name: 'Téléphone', icon: 'fa-mobile-screen-button', color: '56,189,248' }, null, null];
    var sel = 2;   // case choisie (molette) ; le téléphone au départ
    function renderHotbar() {
      elHotbar.innerHTML = INV.map(function (it, i) {
        return '<button class="ph-inv' + (it ? '' : ' empty') + '" data-slot="' + i + '"' + (it ? ' title="' + it.name + '"' : ' tabindex="-1"') + '>' +
          '<kbd>' + (i + 1) + '</kbd>' + (it ? logo(fa(it.icon), it.color) : '') + '</button>';
      }).join('');
      markHotbar();
    }
    function markHotbar() {
      Array.prototype.forEach.call(elHotbar.querySelectorAll('.ph-inv'), function (b) {
        var it = INV[+b.getAttribute('data-slot')];
        b.classList.toggle('on', !!it && it.id === 'phone' && phoneOpen);
        b.classList.toggle('sel', +b.getAttribute('data-slot') === sel);
      });
    }
    // Objets rangés par d'autres fichiers (ex. cartes à gratter du PMU) : setItems('pmu', [{ id, name, icon, color, use }]) remplace
    // tous les objets de ce genre ; ils prennent les cases libres (1, 2, 4, 5 : la 3e reste au téléphone).
    function setItems(kind, list) {
      var i, k, free = [0, 1, 3, 4];
      for (i = 0; i < INV.length; i++) if (INV[i] && INV[i].kind === kind) INV[i] = null;
      (list || []).forEach(function (it) {
        it.kind = kind;
        for (k = 0; k < free.length; k++) if (!INV[free[k]]) { INV[free[k]] = it; break; }
      });
      renderHotbar();
    }
    function useSlot(i) {
      sel = i; markHotbar();
      var it = INV[i];
      if (!it) return;
      if (typeof it.use === 'function') { it.use(); return; }
      if (it.id === 'phone') { if (phoneOpen) closePhone(); else openPhone(); }
    }

    // molette : change de case (en grand écran ou souris verrouillée, hors fenêtres ouvertes)
    var wheelT = 0;
    function onWheel(ev) {
      if (!w.running || w.dead || !w.canEmote() || wheelOpen || phoneOpen || chatOpen || pauseOpen) return;
      if (!(w.full || document.pointerLockElement === w.dom)) return;
      ev.preventDefault();
      var t = performance.now();
      if (t - wheelT < 90) return;                                     // un cran de molette = une case, même sur pavé tactile
      wheelT = t;
      sel = (sel + (ev.deltaY > 0 ? 1 : -1) + INV.length) % INV.length;
      markHotbar();
    }
    window.addEventListener('wheel', onWheel, { passive: false });

    /* ---------- menu pause (Échap) ---------- */
    var pauseOpen = false, pauseT = 0;
    function openPause() {
      if (!w.canEmote()) return;
      closeWheel(); closePhone(); closeChat();
      w._libererSouris();
      elPauseFull.textContent = w.full ? 'Mode fenêtré' : 'Grand écran';
      elPause.hidden = false; pauseOpen = true; pauseT = performance.now();
    }
    function closePause(relock) {
      if (!pauseOpen) return;
      elPause.hidden = true; pauseOpen = false;
      if (relock && w.full && w.canEmote() && document.pointerLockElement !== w.dom && w.dom.requestPointerLock) {
        try { var lock = w.dom.requestPointerLock(); if (lock && lock.catch) lock.catch(function () { /* refusé : un clic sur la vue le reprendra */ }); } catch (e) { /* ok */ }
      }
    }
    // en grand écran, Échap rend la souris au navigateur sans que la touche nous parvienne : on ouvre la pause à ce moment
    function onLockChange() {
      if (document.pointerLockElement === w.dom) return;
      if (Date.now() - (w._relache || 0) < 400) return;                // c'est nous qui l'avons rendue (roue, téléphone, chat…)
      if (!w.full || !w.running || w.dead || wheelOpen || phoneOpen || chatOpen || pauseOpen) return;
      openPause();
    }
    document.addEventListener('pointerlockchange', onLockChange);

    /* ---------- déplacer le téléphone : on l'attrape par l'encoche, en haut au milieu ---------- */
    var phoneDX = 0, phoneDY = 0, phoneDrag = null, elNotch = elPhone.querySelector('.ph-notch');
    function placePhone() {
      var rw = root.clientWidth, rh = root.clientHeight, h = elPhone.offsetHeight || 560;
      phoneDX = Math.max(-rw / 2 + 40, Math.min(rw / 2 - 40, phoneDX));
      phoneDY = Math.max(h / 2 - rh / 2, Math.min(rh - 50 - rh / 2 + h / 2, phoneDY));   // l'encoche reste toujours dans l'écran
      elPhone.style.left = 'calc(50% + ' + Math.round(phoneDX) + 'px)';
      elPhone.style.top = 'calc(50% + ' + Math.round(phoneDY) + 'px)';
    }
    elNotch.addEventListener('pointerdown', function (ev) {
      phoneDrag = { x: ev.clientX, y: ev.clientY, dx: phoneDX, dy: phoneDY };
      try { elNotch.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      elPhone.classList.add('moving');
      ev.preventDefault();
    });
    elNotch.addEventListener('pointermove', function (ev) {
      if (!phoneDrag) return;
      phoneDX = phoneDrag.dx + ev.clientX - phoneDrag.x;
      phoneDY = phoneDrag.dy + ev.clientY - phoneDrag.y;
      placePhone();
    });
    function endPhoneDrag() { phoneDrag = null; elPhone.classList.remove('moving'); }
    elNotch.addEventListener('pointerup', endPhoneDrag);
    elNotch.addEventListener('pointercancel', endPhoneDrag);
    elNotch.addEventListener('dblclick', function () { phoneDX = 0; phoneDY = 0; placePhone(); });   // double-clic : retour au centre

    /* ---------- chat de la salle ---------- */
    // Rien à l'écran : bulle au-dessus de la tête de celui qui parle, historique dans l'onglet Chat du téléphone.
    var chatOpen = false, chatLast = 0, chatHist = [], typingOn = false, typingSent = 0;
    function chatNode(m) {
      var line = document.createElement('div');
      line.className = 'ph-cl' + (m.cls ? ' ' + m.cls : '');
      if (m.name) { var nb = document.createElement('b'); nb.textContent = m.name; line.appendChild(nb); }
      var sp = document.createElement('span'); sp.textContent = m.text; line.appendChild(sp);
      return line;
    }
    function paintChatPage() {
      var list = q('cplist');
      if (!list) return;
      list.innerHTML = '';
      if (!chatHist.length) { var em = document.createElement('div'); em.className = 'ph-cp-empty'; em.textContent = 'Aucun message pour l\'instant. Écris le premier : il apparaîtra en bulle au-dessus de ta tête.'; list.appendChild(em); }
      chatHist.forEach(function (m) { list.appendChild(chatNode(m)); });
      list.scrollTop = list.scrollHeight;
    }
    function chatAdd(name, text, cls) {
      chatHist.push({ name: name, text: text, cls: cls || '' });
      if (chatHist.length > 100) chatHist.shift();
      var list = q('cplist');
      if (!list) return;
      if (chatHist.length === 1) list.innerHTML = '';
      list.appendChild(chatNode(chatHist[chatHist.length - 1]));
      while (list.children.length > 100) list.removeChild(list.firstChild);
      list.scrollTop = list.scrollHeight;
    }
    // « est en train d'écrire » : envoyé à l'apparition du texte, renouvelé toutes les 3,5 s, coupé à l'envoi ou quand on arrête
    function typingNotify(on) {
      var now = Date.now();
      if (on) { if (typingOn && now - typingSent < 3500) return; typingOn = true; typingSent = now; }
      else { if (!typingOn) return; typingOn = false; }
      try { if (w.rt && w.rt.ready) w.rt.send('typing', { k: w._me(), on: on }); } catch (e) { /* ok */ }
      if (w.selfPerson && w.selfPerson.typing) w.selfPerson.typing(on);
    }
    function sendText(raw) {
      var text = String(raw).replace(/\s+/g, ' ').trim().slice(0, 120);
      typingNotify(false);
      var now = Date.now();
      if (!text || now - chatLast < 800) return false;                 // un message par seconde au plus
      chatLast = now;
      var s = st(), name = String((s && s.username) || 'Invité').slice(0, 20);
      var sent = false;
      try { sent = !!(w.rt && w.rt.ready && w.rt.send('chat', { k: w._me(), name: name, text: text })); } catch (e) { /* ok */ }
      chatAdd(name, text, 'me');
      if (w.selfPerson && w.selfPerson.say) w.selfPerson.say(text);   // visible si tu danses (caméra devant toi)
      if (!sent) chatAdd('', 'Hors ligne : personne n\'a reçu ton message.', 'sys');
      return true;
    }
    function openChat() {
      if (!w.canEmote()) return;
      closeWheel(); closePhone();
      w._libererSouris();
      chatOpen = true; elChat.classList.add('open'); elChatForm.hidden = false;
      elChatIn.focus();
    }
    function closeChat() {
      if (!chatOpen) return;
      chatOpen = false; elChat.classList.remove('open'); elChatForm.hidden = true;
      elChatIn.value = ''; elChatIn.blur(); typingNotify(false);
    }
    elChatForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = elChatIn.value;
      closeChat();
      sendText(text);
    });
    elChatIn.addEventListener('input', function () { typingNotify(elChatIn.value.trim().length > 0); });
    elChatIn.addEventListener('keydown', function (ev) {
      ev.stopPropagation();                                            // ni déplacement, ni raccourcis, ni sortie du grand écran
      if (ev.code === 'Escape') { ev.preventDefault(); closeChat(); }
    });
    elChatIn.addEventListener('blur', closeChat);
    // champ de l'onglet Chat du téléphone
    root.addEventListener('submit', function (ev) {
      var f = ev.target;
      if (!f || f.getAttribute('data-ph') !== 'cpform') return;
      ev.preventDefault();
      var inp = f.querySelector('input');
      if (inp && sendText(inp.value)) inp.value = '';
    });
    root.addEventListener('input', function (ev) {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-ph') === 'cpin') typingNotify(ev.target.value.trim().length > 0);
    });
    root.addEventListener('keydown', function (ev) {
      if (!ev.target || !ev.target.getAttribute || ev.target.getAttribute('data-ph') !== 'cpin') return;
      ev.stopPropagation();
      if (ev.code === 'Escape') { ev.preventDefault(); ev.target.blur(); closePhone(); }
    });
    root.addEventListener('focusout', function (ev) {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-ph') === 'cpin') typingNotify(false);
    });
    function chatIn(m) {
      if (!m || typeof m.text !== 'string') return;
      var text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!text) return;
      chatAdd(String(m.name || m.k || '?').slice(0, 20), text);
      var r = w.remote && w.remote[m.k];
      if (r && r.person && r.person.say) r.person.say(text);
    }
    function typingIn(m) {
      var r = m && w.remote && w.remote[m.k];
      if (r && r.person && r.person.typing) r.person.typing(!!m.on);
    }
    renderHotbar();

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
      var t = ev.target.closest ? ev.target.closest('button,.ph-wheel,.ph-pause') : null;
      if (!t) return;
      if (t.classList.contains('ph-pause')) { if (ev.target === t) closePause(true); return; }
      if (t.classList.contains('ph-wheel')) { closeWheel(); return; }
      var a = t.getAttribute('data-act');
      if (a === 'wheel-dance') { if (wheelOpen && tab === 'dance') closeWheel(); else openWheel('dance'); }
      else if (a === 'wheel-emote') { if (wheelOpen && tab === 'emote') closeWheel(); else openWheel('emote'); }
      else if (a === 'phone') { if (phoneOpen) closePhone(); else openPhone(); }
      else if (a === 'close-phone') closePhone();
      else if (a === 'resume') closePause(true);
      else if (a === 'pause-settings') { closePause(); openPhone('settings'); }
      else if (a === 'pause-profile') { closePause(); try { if (typeof openProfileModal === 'function') { w.setFull(false); openProfileModal(); } } catch (e) {} }
      else if (a === 'pause-full') { w.setFull(!w.full); elPauseFull.textContent = w.full ? 'Mode fenêtré' : 'Grand écran'; }
      else if (a === 'chat') { if (chatOpen) closeChat(); else openChat(); }
      else if (t.hasAttribute('data-slot')) useSlot(+t.getAttribute('data-slot'));
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
        if (pauseOpen) {
          if (performance.now() - pauseT < 250) { ev.stopImmediatePropagation(); ev.preventDefault(); return; }   // même geste que celui qui vient d'ouvrir la pause
          ev.stopImmediatePropagation(); ev.preventDefault(); closePause(true);
        } else if (wheelOpen || phoneOpen) { ev.stopImmediatePropagation(); ev.preventDefault(); closeAll(); }
        else if (w.canEmote()) { ev.stopImmediatePropagation(); ev.preventDefault(); openPause(); }
        return;
      }
      // Touche E (ou B) : ouvrir/fermer la roue sur l'onglet Danses
      // Touche A : ouvrir/fermer la roue sur l'onglet Emotes
      var isKeyE = (ev.code === 'KeyE' || ev.code === 'KeyB' || ev.key === 'e' || ev.key === 'E');
      var isKeyA = (ev.key === 'a' || ev.key === 'A');
      if (isKeyE) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (wheelOpen && tab === 'dance') closeWheel(); else openWheel('dance');
      } else if (isKeyA) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (wheelOpen && tab === 'emote') closeWheel(); else openWheel('emote');
      } else if (ev.code === 'Enter' && !(w.near && w.blend === 0)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        openChat();
      } else if (ev.code === 'KeyT' || ev.key === 't' || ev.key === 'T') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (phoneOpen) closePhone(); else openPhone();
      } else if (wheelOpen && ev.code === 'Tab') {
        ev.preventDefault();
        setTab(tab === 'dance' ? 'emote' : 'dance');
      }
      else if (wheelOpen) {
        var m = /^(?:Digit|Numpad)([1-8])$/.exec(ev.code);
        if (m && list()[+m[1] - 1]) { ev.preventDefault(); play(list()[+m[1] - 1].id); }
      } else {
        var h = /^(?:Digit|Numpad)([1-5])$/.exec(ev.code);               // cases de l'inventaire
        if (h && INV[+h[1] - 1]) { ev.preventDefault(); useSlot(+h[1] - 1); }
      }
    }
    window.addEventListener('keydown', kd, true);

    sync();
    var api = {
      sync: sync,
      setItems: setItems,
      close: closeAll,
      chatIn: chatIn,
      typingIn: typingIn,
      dispose: function () {
        window.removeEventListener('keydown', kd, true);
        window.removeEventListener('wheel', onWheel);
        document.removeEventListener('pointerlockchange', onLockChange);
        if (root.parentNode) root.parentNode.removeChild(root);
        w.hud.classList.remove('has-ph');
      }
    };
    (F.hudReady || []).forEach(function (fn) { try { fn(w, api); } catch (e) { /* un module en panne ne bloque pas le HUD */ } });   // ex. pmu3d.js : ses cartes à gratter vont dans la barre du bas
    return api;
  };
})();
