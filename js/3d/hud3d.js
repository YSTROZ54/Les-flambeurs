/* =====================================================================
   hud3d.js — HUD du joueur, roue des danses et téléphone (monde 3D complet, PC)
   ---------------------------------------------------------------------
   - HUD en bas à gauche : chat de la salle, avatar, pseudo, rang, solde, et quatre boutons-logos (Danses [E], Emotes [A], Téléphone [T], Chat [Entrée]).
   - Inventaire en bas au milieu : 5 cases (touches 1 à 5 ou clic sur la case pour l'utiliser, molette pour changer de case) : Danses, Emotes, une case libre (cartes à gratter), Téléphone, Chat.
     Case du téléphone choisie : un clic gauche ou droit dans le monde ouvre le téléphone.
   - Menu pause : Échap (ou la souris libérée par le navigateur en grand écran) ; Échap ou « Reprendre » pour revenir.
   - Roue des danses / emotes : touche E (ou B), 1 à 8 pour choisir, Tab pour passer des danses aux emotes.
   - Téléphone : touche T. Écran d'accueil avec fond d'écran et applis (DanceFloor, Réactions, Chat, Mon Profil, Tropi Bank, Réglages) ; en bas, la barre de navigation : « retour » (revient d'un cran, puis ferme)
     et le bouton rouge (accueil, puis ferme). Chaque clic sur un bouton du téléphone fait un petit « tic ». On le déplace en attrapant l'encoche en haut au milieu.
   - Chat : Entrée pour écrire, Entrée pour envoyer, Échap pour fermer. Rien ne s'affiche à l'écran : le message sort en bulle au-dessus de la tête
     de celui qui parle (trois points pendant qu'il écrit), et l'historique est dans l'onglet Chat du téléphone. Canal temps réel de la salle (« chat », « typing »).
     * Onglet Danses : déclencher danses et emotes depuis le téléphone avec les logos colorés.
     * Onglet Paramètres : gérer la sensibilité souris, le volume du son, la qualité 3D / FPS, plein écran, accueil casino.
     * Appli Mon Profil : pseudo, mot de passe, état civil, avatar (boutique), déconnexion (remplace l'ancienne fenêtre du profil).
     * Appli Tropi Bank : la banque du club en appli (solde, envoyer, virements reçus, historique) ; mêmes fonctions et même serveur que la salle Banque.
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
      '</div>' +
      '<div class="ph-profile s3d-room-only">' +
        '<div class="ph-card">' +
          '<button class="ph-ava" data-act="profile" title="Mon profil"><span data-ph="ava">?</span></button>' +
          '<div class="ph-id"><b class="ph-name" data-ph="name">Invité</b><span class="ph-rank role-tag role-flambeur" data-ph="rank"></span></div>' +
          '<div class="ph-bal" title="Ton solde"><i class="fl-coin"></i><b data-ph="bal">0</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="ph-hotbar s3d-room-only" data-ph="hotbar"></div>' +
      '<div class="ph-inventory" data-ph="inv" hidden>' +
        '<div class="ph-inv-box">' +
          '<div class="ph-inv-skin"><span class="ph-inv-ava" data-ph="invava">?</span><b data-ph="invname">Invité</b><span class="ph-rank role-tag role-flambeur" data-ph="invrank"></span><div class="ph-bal"><i class="fl-coin"></i><b data-ph="invbal">0</b></div></div>' +
          '<div class="ph-inv-side"><h3>Inventaire</h3><div class="ph-inv-slots" data-ph="invslots"></div><small>Tab ou Échap : fermer</small></div>' +
        '</div>' +
      '</div>' +
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
          '<div class="ph-homebar">' +
            '<button class="ph-back" data-act="phone-back" title="Retour"><i class="fa-solid fa-chevron-left"></i></button>' +
            '<button class="ph-home" data-act="phone-home" title="Accueil · puis fermer le téléphone (T)"></button>' +
            '<span class="ph-nav-gap"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ph-top-right">' +
        '<div class="ph-stat-pill ph-online" title="Joueurs en ligne (toutes les salles)"><i class="fa-solid fa-users"></i> <b data-ph="onlineval">1</b> <span class="ph-stat-label">en ligne</span></div>' +
        '<div class="ph-stat-pill ph-fps" title="Images par seconde (FPS)"><span class="ph-fps-dot" data-ph="fpsdot"></span><b data-ph="fpsval">--</b> <span class="ph-stat-label">FPS</span></div>' +
        '<button class="ph-stat-pill ph-fsbtn" data-act="fullscreen" data-ph="fsbtn" title="Plein écran"><i class="fa-solid fa-expand"></i><span class="ph-stat-label">Plein écran</span></button>' +
      '</div>';
    w.hud.insertBefore(root, w.elFade);
    w.hud.classList.add('has-ph');

    function q(k) { return root.querySelector('[data-ph="' + k + '"]'); }
    var elAva = q('ava'), elName = q('name'), elRank = q('rank'), elBal = q('bal'), elNow = q('now'), elNowName = q('nowname');
    var elWheel = q('wheel'), elRing = q('ring'), elWName = q('wname'), elWHint = q('whint');
    var elPhone = q('phone'), elScreen = q('screen'), elClock = q('clock');
    var elPause = q('pause'), elPauseFull = q('pausefull');
    var elChat = q('chat'), elChatForm = q('chatform'), elChatIn = q('chatin'), elHotbar = q('hotbar');
    var elInv = q('inv'), elInvSlots = q('invslots');
    var elFpsVal = q('fpsval'), elFpsDot = q('fpsdot'), elOnlineVal = q('onlineval');
    var tab = 'dance', page = 'menu', sub = 'home', last = {};
    // les applis du téléphone : nom, sous-titre, icône, couleur
    var APPS = [
      { id: 'dance', img: 'assets/icones/applis/dancefloor.png', name: 'DanceFloor', sub: 'Danses en boucle · marche pour arrêter', ic: 'fa-music', c: '232,121,249' },
      { id: 'emote', img: 'assets/icones/applis/reactions.png', name: 'Réactions', sub: 'Emotes instantanées', ic: 'fa-face-smile', c: '251,191,36' },
      { id: 'chat', img: 'assets/icones/applis/chat.png', name: 'Chat', sub: 'Discute avec la salle', ic: 'fa-comments', c: '52,211,153' },
      { id: 'profile', img: 'assets/icones/applis/mon-profil.png', name: 'Mon Profil', sub: 'Ton profil de Flambeur', ic: 'fa-user-pen', c: '56,189,248' },
      { id: 'bank', img: 'assets/icones/services/tropi-bank.png', name: 'Tropi Bank', sub: 'Virements entre joueurs', ic: 'fa-building-columns', c: '16,185,129' },
      { id: 'settings', img: 'assets/icones/applis/reglages.png', name: 'Réglages', sub: 'Son, souris, qualité 3D', ic: 'fa-sliders', c: '148,163,184' }
    ];
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    // petit « tic » à chaque clic sur un bouton du téléphone (suit le volume du jeu ; muet = rien)
    function tick() {
      try {
        var vol = typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5;
        var ctx = typeof getAudioCtx === 'function' ? getAudioCtx() : null;
        if (!ctx || vol <= 0) return;
        var t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(1250, t0); o.frequency.exponentialRampToValueAtTime(820, t0 + 0.05);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16 * vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.08);
      } catch (e) { /* pas de son */ }
    }
    function appById(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i]; return null; }
    function dateFr() { try { return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return ''; } }
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
      var co = false; try { co = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) { /* ok */ }
      var rIcon = boss ? 'fa-crown' : co ? 'fa-gem' : 'fa-fire';
      var rName = boss ? 'Patron' : co ? 'Co Fondateur' : 'Flambeur';
      var rClass = boss ? 'role-patron' : co ? 'role-cofondateur' : 'role-flambeur';
      put(elRank, 'rank', '<i class="fa-solid ' + rIcon + ' role-crown"></i> <span class="role-label">' + rName + '</span>', true);
      elRank.className = 'ph-rank role-tag ' + rClass;
      put(elBal, 'bal', s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0');
      var e = w.emoId ? F.emoteById(w.emoId) : null;
      elNow.hidden = !e;
      if (e) put(elNowName, 'now', e.name);
      // Joueurs en ligne dans la salle (moi + remotes actifs)
      var onlineCount = 1;
      if (F.presence) { F.presence.ensure(); F.presence.setRoom(w.room && w.room.id); }   // présence de tout le casino, toutes salles
      if (w && w.remote) {
        var nowT = performance.now();
        Object.keys(w.remote).forEach(function (k) {
          var rem = w.remote[k];
          if (rem && (!rem.recv || nowT - rem.recv < 3500)) onlineCount++;
        });
      }
      put(q('fsbtn'), 'fs', '<i class="fa-solid ' + (w.full ? 'fa-compress' : 'fa-expand') + '"></i><span class="ph-stat-label">' + (w.full ? 'Quitter' : 'Plein écran') + '</span>', true);
      put(elOnlineVal, 'online', String(Math.max(onlineCount, F.presence ? F.presence.count() : 0)));   // le plus grand des deux : salle ou casino entier
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
      if (invOpen) paintInv();
      if (phoneOpen) {
        var d = new Date(), hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); put(elClock, 'clock', hm);
        var hc = q('hclock'); if (hc && hc.textContent !== hm) hc.textContent = hm;
        if (page === 'settings') {
          var qLab = F.quality && F.quality.label ? F.quality.label() : 'Auto';
          var elQL = root.querySelector('[data-ph="quallabel"]');
          if (elQL && elQL.textContent !== qLab) elQL.textContent = qLab;
        }
      }
    }

    /* ---------- roue des danses et emotes ---------- */
    var wheelOpen = false, phoneOpen = false, invOpen = false;
    function list() { return tab === 'dance' ? F.DANCES : F.EMOTES; }
    // la roue se pilote sans curseur : la molette fait tourner la flèche, un clic (ou Entrée) lance, un clic droit ou Échap ferme
    var wheelSel = 0, wheelAng = 0;
    function wheelIdle() {
      var e = list()[wheelSel];
      elWName.textContent = e ? e.name : (tab === 'dance' ? 'Danses' : 'Emotes');
      elWHint.textContent = 'Molette : choisir · Clic : lancer';
    }
    function paintSel() {
      Array.prototype.forEach.call(elRing.querySelectorAll('.ph-slot'), function (b) { b.classList.toggle('sel', +b.getAttribute('data-i') === wheelSel); });
      var nd = elRing.querySelector('.ph-needle'); if (nd) nd.style.transform = 'rotate(' + wheelAng + 'deg)';
      wheelIdle();
    }
    function moveSel(dir) {
      var n = list().length; wheelSel = (wheelSel + dir + n) % n; wheelAng += dir * 45;   // l'angle s'additionne : la flèche ne repart jamais à l'envers
      paintSel();
    }
    function confirmWheel() { var e = list()[wheelSel]; if (e) play(e.id); }
    function renderWheel() {
      var R = 36.5, html = '';   // rayon et centre en % de la roue : la taille se règle en CSS
      list().forEach(function (e, i) {
        var a = (-90 + i * 45) * Math.PI / 180;
        html += '<button class="ph-slot' + (w.emoId === e.id ? ' on' : '') + '" data-emo="' + e.id + '" data-i="' + i + '" style="left:' + (50 + R * Math.cos(a)).toFixed(2) + '%;top:' + (50 + R * Math.sin(a)).toFixed(2) + '%;--c:' + e.color + '">' +
          '<span class="fl-logo" style="--c:' + e.color + '"><i class="fa-solid ' + e.icon + '"></i></span><kbd>' + (i + 1) + '</kbd></button>';
      });
      elRing.innerHTML = html + '<div class="ph-needle" style="transform:rotate(' + wheelAng + 'deg)"></div>';
      Array.prototype.forEach.call(elRing.querySelectorAll('.ph-slot'), function (b) { b.classList.toggle('sel', +b.getAttribute('data-i') === wheelSel); });
      Array.prototype.forEach.call(root.querySelectorAll('.ph-wheel-tabs [data-tab]'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
      wheelIdle();
    }
    function setTab(t) {
      tab = t; try { localStorage.setItem('f3d_wheel_tab', t); } catch (e) { /* ok */ }
      renderWheel();
    }
    function openWheel(t) {
      if (!w.canEmote()) return;
      closePhone(); closeInv();
      if (t) { tab = t; try { localStorage.setItem('f3d_wheel_tab', t); } catch (e) { /* ok */ } }
      // pas de curseur : si la souris est verrouillée elle le reste (la vue est figée), sinon le curseur sert comme avant
      var cur = -1; list().forEach(function (e, i) { if (w.emoId === e.id) cur = i; });
      wheelSel = cur >= 0 ? cur : 0; wheelAng = wheelSel * 45;
      w.lookLocked = true;
      renderWheel(); elWheel.hidden = false; wheelOpen = true;
    }
    function closeWheel() { elWheel.hidden = true; wheelOpen = false; w.lookLocked = false; }
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

    /* ---------- appli Tropi Bank : la banque du club, même serveur (bank_state, bank_send, bank_accept, bank_decline) ---------- */
    function bankInbox() { var s = st(); return s && Array.isArray(s.pendingTransfers) ? s.pendingTransfers : []; }
    function bankHist() { var s = st(); return s && Array.isArray(s.bankTransfers) ? s.bankTransfers : []; }
    function bankRow(t, me) {
      var out = t.from === me, badge = '';
      if (t.status === 'En attente') badge = '<em class="wait">En attente</em>';
      else if (t.status === 'Accepté') badge = '<em class="ok">Accepté</em>';
      else if (t.status) badge = '<em class="ko">' + esc(t.status) + '</em>';
      return '<div class="ph-bk-row"><div><b>' + esc(out ? t.to : t.from) + '</b> ' + badge + '<small>« ' + esc(t.note || 'Bon jeu !') + ' »</small></div>' +
        '<span class="' + (out ? 'out' : 'in') + '">' + (out ? '−' : '+') + F.fmtN(t.amount || 0) + '</span></div>';
    }
    function bankHtml() {
      var s = st(), me = s && s.username || '', bal = s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0';
      var inbox = bankInbox(), hist = bankHist();
      if (!me) return '<div class="ph-cp-empty">Connecte-toi pour utiliser Tropi Bank.</div>';
      if (sub === 'send') {
        return '<label class="ph-lab">Destinataire</label>' +
          '<input class="ph-in" data-ph="bkto" type="text" maxlength="20" placeholder="Tape le pseudo…" autocomplete="off" spellcheck="false">' +
          '<div class="ph-bk-sug" data-ph="bksug"></div>' +
          '<label class="ph-lab">Montant</label>' +
          '<input class="ph-in" data-ph="bkamt" type="number" min="5" value="500">' +
          '<div class="ph-bk-chips">' + [100, 500, 1000, 5000].map(function (n) { return '<button data-amt="' + n + '">' + F.fmtN(n) + '</button>'; }).join('') + '</div>' +
          '<label class="ph-lab">Petit mot (facultatif)</label>' +
          '<input class="ph-in" data-ph="bknote" type="text" maxlength="60" placeholder="Pour te refaire au poker !" autocomplete="off">' +
          '<div class="ph-bk-msg" data-ph="bkmsg"></div>' +
          '<button class="ph-wide save" data-act="bk-send">' + fa('fa-paper-plane') + ' Envoyer</button>';
      }
      if (sub === 'inbox') {
        return inbox.length ? inbox.map(function (t) {
          return '<div class="ph-bk-in"><div class="ph-bk-row"><div><b>' + esc(t.from) + '</b><small>« ' + esc(t.note || 'Bon jeu !') + ' »</small></div><span class="in">+' + F.fmtN(t.amount || 0) + '</span></div>' +
            '<div class="ph-bk-btns"><button class="ok" data-act="bk-accept" data-id="' + esc(t.id) + '">' + fa('fa-check') + ' Encaisser</button><button class="ko" data-act="bk-decline" data-id="' + esc(t.id) + '">' + fa('fa-xmark') + ' Refuser</button></div></div>';
        }).join('') : '<div class="ph-cp-empty">Aucun virement en attente.</div>';
      }
      if (sub === 'history') {
        return hist.length ? hist.map(function (t) { return bankRow(t, me); }).join('') : '<div class="ph-cp-empty">Aucun virement pour le moment.</div>';
      }
      var boss = false, co = false; try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); co = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) { /* ok */ }
      var rc = boss ? 'role-patron' : co ? 'role-cofondateur' : 'role-flambeur', ri = boss ? 'fa-crown' : co ? 'fa-gem' : 'fa-fire', rn = boss ? 'Patron' : co ? 'Co Fondateur' : 'Flambeur';
      return '<div class="ph-bk-card">' +
        '<div class="ph-bk-who"><span class="ph-bk-ava">' + esc(myAv()) + '</span><div>' +
          '<b class="ph-bk-nm">' + esc(me) + '</b>' +
          '<span class="ph-rank role-tag ' + rc + '"><i class="fa-solid ' + ri + ' role-crown"></i> <span class="role-label">' + rn + '</span></span>' +
        '</div></div>' +
        '<small>Solde disponible</small><b><i class="fl-coin"></i> ' + bal + '</b></div>' +
        '<div class="ph-bk-acts">' +
          '<button data-bk="send"><i class="fa-solid fa-paper-plane"></i>Envoyer</button>' +
          '<button data-bk="inbox"><i class="fa-solid fa-inbox"></i>Reçus' + (inbox.length ? '<u>' + inbox.length + '</u>' : '') + '</button>' +
          '<button data-bk="history"><i class="fa-solid fa-clock-rotate-left"></i>Historique</button>' +
        '</div>' +
        '<div class="ph-sect">Derniers virements</div>' +
        (hist.length ? hist.slice(0, 4).map(function (t) { return bankRow(t, me); }).join('') : '<div class="ph-cp-empty">Aucun virement pour le moment.</div>');
    }
    // joueurs proposés quand on tape un pseudo : tous les comptes connus + les amis (comme la salle Banque)
    function bankSuggest(val) {
      var box = q('bksug'); if (!box) return;
      var query = String(val || '').trim().toLowerCase(), s = st(), me = String(s && s.username || '').toLowerCase();
      if (!query) { box.innerHTML = ''; return; }
      var cand = {};
      try { var db = typeof getAccountsDB === 'function' ? getAccountsDB() : {}; Object.keys(db).forEach(function (k) { var a = db[k]; if (a && a.username && k !== me) cand[k] = a.username; }); } catch (e) { /* ok */ }
      ((s && s.friends) || []).forEach(function (f) { var k = String(f).toLowerCase(); if (k !== me && !cand[k]) cand[k] = f; });
      var list = Object.keys(cand).map(function (k) { return cand[k]; }).filter(function (n) { return n.toLowerCase().indexOf(query) >= 0; }).sort(function (a, b) {
        var as = a.toLowerCase().indexOf(query) === 0, bs = b.toLowerCase().indexOf(query) === 0;
        return as === bs ? a.localeCompare(b) : as ? -1 : 1;
      }).slice(0, 5);
      box.innerHTML = list.length ? list.map(function (n) { return '<button data-pick="' + esc(n) + '">' + fa('fa-user') + ' ' + esc(n) + '</button>'; }).join('') : '<small>Aucun joueur trouvé.</small>';
    }
    function bankRefresh() {
      if (typeof refreshBankState !== 'function') return;
      Promise.resolve(refreshBankState()).then(function () { if (phoneOpen && page === 'bank' && !q('bkto')) renderPhone(); }, function () { /* hors ligne */ });
    }
    async function bankSend() {
      var to = q('bkto'), am = q('bkamt'), nt = q('bknote'), msg = q('bkmsg');
      var dTo = document.getElementById('bankCustomRecipient'), dAm = document.getElementById('bankAmountInput'), dNt = document.getElementById('bankNoteInput');
      if (!to || !am || !dTo || !dAm || typeof sendBankDonation !== 'function') return;
      dTo.value = to.value; dAm.value = am.value; if (dNt) dNt.value = nt ? nt.value : '';
      var box = document.getElementById('toastBox'); if (box) box.textContent = '';
      await sendBankDonation();
      if (dAm.value === '') { sub = 'home'; if (phoneOpen && page === 'bank') renderPhone(); return; }   // le virement est parti (la salle Banque vide le montant)
      msg = q('bkmsg');
      if (msg && box) msg.textContent = box.textContent.replace(/^❌\s*/, '');
    }
    async function bankAct(fn, id) {
      try { if (typeof fn === 'function') await fn(id); } catch (e) { /* le serveur répondra au prochain rafraîchissement */ }
      if (phoneOpen && page === 'bank') { renderPhone(); sync(); }
    }

    function leaveWorld() { closeAll(); try { w.setFull(false); } catch (e) { /* ok */ } }

    /* ---------- navigation : retour d'un cran, puis accueil, puis ferme ---------- */
    function goBack() {
      if (page === 'profile' && (refuse || pfEdit)) { refuse = null; pfEdit = ''; renderPhone(); }
      else if (page === 'profile' && sub === 'avpreview') { sub = 'avatars'; renderPhone(); }
      else if ((page === 'bank' || page === 'profile') && sub !== 'home') { sub = 'home'; renderPhone(); }
      else if (page !== 'menu') { page = 'menu'; sub = 'home'; renderPhone(); }
      else closePhone(true);
    }

    /* ---------- appli Mon Profil : crayons d'édition, galerie d'avatars (Mes logos / À acheter dans le Tropi Shop), aperçu, refus ---------- */
    var pfEdit = '', avSel = '', refuse = null;
    var FREE_AV = [
      { id: 'free-mask', emoji: '🎭', name: 'Le Masque', desc: 'Offert à l\'inscription.', free: true },
      { id: 'free-joker', emoji: '🃏', name: 'Le Joker', desc: 'Offert à l\'inscription.', free: true },
      { id: 'free-cool', emoji: '🕶️', name: 'Le Cool', desc: 'Offert à l\'inscription.', free: true },
      { id: 'free-lion', emoji: '🦁', name: 'Le Lion', desc: 'Offert à l\'inscription.', free: true },
      { id: 'free-dice', emoji: '🎲', name: 'Les Dés', desc: 'Offert à l\'inscription.', free: true }
    ];
    function plain(v) { return window.FL_LOGOS ? FL_LOGOS.strip(v) : String(v); }
    function curAv() { try { return typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) { return ''; } }
    // tous les avatars : offerts, puis ceux du Tropi Shop ; owned = déjà à toi
    function avatarList() {
      var s = st() || {}, owned = Array.isArray(s.ownedSkins) ? s.ownedSkins : [], cur = curAv(), out = [], nm = String(s.username || '?').charAt(0).toUpperCase();
      out.push({ id: 'initial', emoji: '', letter: nm, name: 'Initiale', desc: 'La première lettre de ton blase.', free: true, owned: true, on: cur === nm });
      FREE_AV.forEach(function (a) { out.push({ id: a.id, emoji: a.emoji, name: a.name, desc: a.desc, free: true, owned: true, on: cur === a.emoji }); });
      var cat = []; try { cat = typeof SHOP_CATALOG !== 'undefined' ? SHOP_CATALOG : []; } catch (e) { /* ok */ }
      cat.forEach(function (i) {
        if (i.category !== 'avatar' || !i.emoji) return;
        var has = owned.indexOf(i.id) >= 0 || !i.price;
        out.push({ id: i.id, emoji: i.emoji, name: plain(i.name), desc: i.desc || '', price: i.price || 0, shop: true, owned: has, on: cur === i.emoji });
      });
      return out;
    }
    function avTile(a) {
      return '<button class="ph-av' + (a.on ? ' on' : '') + (a.owned ? '' : ' locked') + '" data-av="' + esc(a.id) + '" title="' + esc(a.name) + '">' +
        '<span class="ph-av-art">' + (a.emoji ? esc(a.emoji) : esc(a.letter)) + '</span>' +
        (a.on ? '<i class="ph-av-tick fa-solid fa-check"></i>' : '') + (a.owned ? '' : '<i class="ph-av-lock fa-solid fa-lock"></i>') +
        '<small>' + esc(a.name) + '</small></button>';
    }
    function refuseHtml() {
      if (!refuse) return '';
      return '<div class="ph-refuse"><div class="ph-refuse-box"><i class="fa-solid fa-lock"></i><b>Avatar verrouillé</b>' +
          "<p>Tu as besoin de l'acheter dans le <strong>Tropi Shop</strong> avant d'utiliser cet avatar.</p>" +
          '<div class="ph-pf-btns"><button data-act="refuse-close">Fermer</button><button class="gold" data-act="pf-shop">' + fa('fa-cart-shopping') + ' Tropi Shop</button></div></div></div>';
    }
    function profileHtml() { return profileInner() + refuseHtml(); }
    function profileInner() {
      var s = st(), name = s && s.username ? s.username : 'Invité', av = curAv();
      var boss = false, coP = false; try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); coP = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) {}
      var rc = boss ? 'role-patron' : coP ? 'role-cofondateur' : 'role-flambeur', ri = boss ? 'fa-crown' : coP ? 'fa-gem' : 'fa-fire', rn = boss ? 'Patron' : coP ? 'Co Fondateur' : 'Flambeur';
      var bal = s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0', all, mine, shop, a;
      if (!av) av = name.charAt(0).toUpperCase();


      if (sub === 'avatars') {
        all = avatarList(); mine = all.filter(function (x) { return x.owned; }); shop = all.filter(function (x) { return !x.owned; });
        return '<div class="ph-sect">Mes logos <span class="ph-cnt">' + mine.length + '</span></div><div class="ph-avs">' + mine.map(avTile).join('') + '</div>' +
          '<div class="ph-sect">À acheter dans le Tropi Shop <span class="ph-cnt">' + shop.length + '</span></div>' +
          (shop.length ? '<div class="ph-avs">' + shop.map(avTile).join('') + '</div>' : '<div class="ph-cp-empty">Tu as tous les avatars !</div>');
      }
      if (sub === 'avpreview') {
        a = null; avatarList().forEach(function (x) { if (x.id === avSel) a = x; });
        if (!a) return '<div class="ph-cp-empty">Avatar introuvable.</div>';
        return '<div class="ph-avp"><div class="ph-avp-art' + (a.owned ? '' : ' locked') + '"><span>' + (a.emoji ? esc(a.emoji) : esc(a.letter)) + '</span>' + (a.owned ? '' : '<i class="fa-solid fa-lock"></i>') + '</div>' +
          '<b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small>' +
          '<div class="ph-avp-st ' + (a.on ? 'on' : a.owned ? 'own' : 'buy') + '">' + (a.on ? '<i class="fa-solid fa-check"></i> Avatar actuel' : a.owned ? '<i class="fa-solid fa-circle-check"></i> Dans Mes logos' : '<i class="fa-solid fa-lock"></i> À acheter dans le Tropi Shop · ' + F.fmtN(a.price) + ' <i class="fl-coin"></i>') + '</div>' +
          '<div class="ph-avp-prev"><span>Aperçu sur ton profil</span><div class="ph-bk-who"><span class="ph-bk-ava">' + (a.emoji ? esc(a.emoji) : esc(a.letter)) + '</span><div><b class="ph-bk-nm">' + esc(name) + '</b><span class="ph-rank role-tag ' + rc + '"><i class="fa-solid ' + ri + ' role-crown"></i> <span class="role-label">' + rn + '</span></span></div></div></div>' +
          '<button class="ph-wide save" data-act="av-use"' + (a.on ? ' disabled' : '') + '>' + fa('fa-floppy-disk') + ' Enregistrer cet avatar</button></div>';
      }
      var h = '<div class="ph-pf-head">' +
          '<button class="ph-pf-ava" data-act="pf-avatars" title="Changer d\'avatar"><span class="ph-pf-avav">' + esc(av) + '</span><span class="ph-pf-pen"><i class="fa-solid fa-pen"></i></span></button>' +
          '<div class="ph-pf-id">' +
            '<button class="ph-pf-name" data-act="pf-editname" title="Changer le pseudo (50 000 €)"><b>' + esc(name) + '</b><i class="fa-solid fa-pen"></i></button>' +
            '<span class="ph-rank role-tag ' + rc + '"><i class="fa-solid ' + ri + ' role-crown"></i> <span class="role-label">' + rn + '</span></span>' +
            '<div class="ph-bal"><i class="fl-coin"></i><b>' + bal + '</b> jetons</div>' +
          '</div></div>';
      if (pfEdit === 'name') {
        h += '<div class="ph-pf-edit"><label class="ph-lab">Nouveau pseudo</label><input class="ph-in" data-ph="pfname" type="text" maxlength="20" value="' + esc(name) + '" autocomplete="off" spellcheck="false">' +
          '<small class="ph-pf-paid">' + fa('fa-coins') + ' Changer de pseudo coûte 50 000 €</small>' +
          '<div class="ph-pf-btns"><button data-act="pf-cancel">Annuler</button><button class="gold" data-act="pf-save">' + fa('fa-check') + ' Valider (50 000 €)</button></div></div>';
      } else {
        h += '<div class="ph-pf-note">' + fa('fa-pen') + ' Passe la souris sur ta photo ou ton pseudo pour les modifier · le pseudo coûte <b>50 000 €</b></div>';
      }
      if (pfEdit === 'pass') {
        h += '<div class="ph-pf-edit"><label class="ph-lab">Nouveau mot de passe</label><input class="ph-in" data-ph="pfpass" type="password" placeholder="Choisis un mot de passe" autocomplete="new-password">' +
          '<div class="ph-pf-btns"><button data-act="pf-cancel">Annuler</button><button class="gold" data-act="pf-save">' + fa('fa-check') + ' Valider</button></div></div>';
      } else {
        h += '<button class="ph-pf-row" data-act="pf-editpass" title="Changer le mot de passe"><span>' + fa('fa-lock') + ' Mot de passe</span><em>••••••••</em><i class="fa-solid fa-pen"></i></button>';
      }
      h += '<button class="ph-wide danger" data-act="pf-logout">' + fa('fa-right-from-bracket') + ' Se déconnecter / Changer de joueur</button>';
      return h;
    }
    function avatarUse() {
      var a = null; avatarList().forEach(function (x) { if (x.id === avSel) a = x; });
      if (!a) return;
      if (!a.owned) { refuse = a; sub = 'avpreview'; renderPhone(); return; }          // pas acheté : refus
      var s = st(); if (!s) return;
      if (a.shop && typeof equipSkin === 'function') equipSkin(a.id);
      else {
        s.equipped = s.equipped || {}; s.equipped.avatar = null; s.avatarEmoji = a.emoji || a.letter;
        try { if (typeof saveState === 'function') saveState(); if (typeof updateGlobalUI === 'function') updateGlobalUI(); if (typeof pushRemoteAccount === 'function') pushRemoteAccount(s); if (typeof showToast === 'function') showToast('✔ Avatar « ' + a.name + ' » équipé !'); } catch (e) { /* ok */ }
      }
      last.ava = null; sub = 'home'; renderPhone(); sync();
    }
    async function profileSave() {
      var n = q('pfname'), p = q('pfpass'), s = st(), dn = document.getElementById('profileNameInput'), dp = document.getElementById('profilePassInput');
      if (!dn || typeof saveProfile !== 'function' || (!n && !p)) return;
      dn.value = n ? n.value : (s && s.username) || ''; if (dp) dp.value = p ? p.value : '';
      await saveProfile();
      pfEdit = '';
      if (phoneOpen && page === 'profile') renderPhone();
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
      } else if (page === 'profile') {
        h = profileHtml();
      } else if (page === 'bank') {
        h = bankHtml();
      } else if (page === 'chat') {
        h = '<div class="ph-cp"><div class="ph-cp-list" data-ph="cplist"></div>' +
          '<form class="ph-cp-form" data-ph="cpform"><input data-ph="cpin" maxlength="120" placeholder="Écrire à la salle…" autocomplete="off" spellcheck="false"><button type="submit" title="Envoyer">' + fa('fa-paper-plane') + '</button></form></div>';
      } else if (page === 'dance' || page === 'emote') {
        var list2 = page === 'dance' ? F.DANCES : F.EMOTES;
        h = '<div class="ph-apps">' + list2.map(function (e) { return app('data-emo', e.id, '<i class="fa-solid ' + e.icon + '"></i>', e.color, e.name); }).join('') + '</div>';
      } else {
        // écran d'accueil : grosse horloge puis les applis sur le fond d'écran
        var dn = new Date();
        h = '<div class="ph-hclock"><b data-ph="hclock">' + ('0' + dn.getHours()).slice(-2) + ':' + ('0' + dn.getMinutes()).slice(-2) + '</b><span>' + dateFr() + '</span></div>' +
          '<div class="ph-icons">' + APPS.map(function (a) {
            return '<button class="ph-ico" data-page="' + a.id + '">' + (a.img ? '<span class="ph-ico-sq ph-ico-img"><img src="' + a.img + '" alt=""></span>' : '<span class="ph-ico-sq" style="--c:' + a.c + '"><i class="fa-solid ' + a.ic + '"></i></span>') + '<span class="ph-ico-nm">' + a.name + '</span></button>';
          }).join('') + '</div>';
      }
      var ap = appById(page);
      if (ap) h = '<div class="ph-ah">' + (ap.img ? '<img class="ph-ah-img" src="' + ap.img + '" alt="">' : logo(fa(ap.ic), ap.c)) + '<span><b>' + ap.name + '</b><small>' + ap.sub + '</small></span></div>' + h;
      elScreen.innerHTML = h; elScreen.scrollTop = 0;
      elScreen.classList.toggle('chat', page === 'chat');
      elScreen.classList.toggle('menu', page === 'menu');
      elPhone.querySelector('.ph-body').classList.toggle('home', page === 'menu');          // fond d'écran seulement sur l'accueil
      if (page === 'chat') paintChatPage();
    }

    function openPhone(p) {
      if (!w.canEmote()) return;
      closeWheel(); closeInv();
      page = p || 'menu'; sub = 'home'; pfEdit = ''; refuse = null;                                 // on arrive toujours sur l'écran d'accueil, sauf si on demande une appli
      w._libererSouris();
      renderPhone(); last.clock = null; elPhone.hidden = false; phoneOpen = true; placePhone(); sync();
      if (page === 'bank') bankRefresh();
    }
    // en grand écran, reprend la souris (le curseur disparaît, la vue la suit) ; refusé par le navigateur sans geste de l'utilisateur : un clic sur la vue la reprendra
    function relock() {
      if (!w.full || !w.canEmote() || document.pointerLockElement === w.dom || !w.dom.requestPointerLock) return;
      try { var lock = w.dom.requestPointerLock(); if (lock && lock.catch) lock.catch(function () { /* refusé */ }); } catch (e) { /* ok */ }
    }
    // reprendreSouris : à la fermeture voulue par le joueur (bouton rouge, T, case, Échap), pas quand une autre fenêtre prend la place
    function closePhone(reprendreSouris) {
      var etaitOuvert = phoneOpen;
      elPhone.hidden = true; phoneOpen = false; typingNotify(false); markHotbar();
      if (reprendreSouris && etaitOuvert) relock();
    }
    function closeAll() { closeWheel(); closePhone(); closeChat(); closePause(); closeInv(); }

    /* ---------- inventaire (5 cases) ---------- */
    // Une case = un objet { id, name, icon, color } ; null = vide. 5 cases : Danses, Emotes, une case libre au milieu, Téléphone, Chat.
    // clic gauche ou droit dans le monde avec la case choisie : l'objet s'utilise (téléphone, roues, chat, cartes à gratter).
    var INV = [
      { id: 'dance', name: 'Danses', img: 'assets/icones/applis/dancefloor.png', icon: 'fa-music', color: '232,121,249', use: function () { if (wheelOpen && tab === 'dance') closeWheel(); else openWheel('dance'); } },
      { id: 'emote', name: 'Emotes', img: 'assets/icones/applis/reactions.png', icon: 'fa-face-smile', color: '251,191,36', use: function () { if (wheelOpen && tab === 'emote') closeWheel(); else openWheel('emote'); } },
      null,
      { id: 'phone', name: 'Téléphone', icon: 'fa-mobile-screen-button', color: '56,189,248' },
      { id: 'chat', name: 'Chat', img: 'assets/icones/applis/chat.png', icon: 'fa-comments', color: '52,211,153', use: function () { if (phoneOpen && page === 'chat') closePhone(true); else openChat(); } }
    ];
    var sel = 2;   // on démarre sur la case du milieu (vide) : le premier clic verrouille la souris au lieu d'utiliser un objet ; molette ou chiffre pour changer
    function renderHotbar() {
      elHotbar.innerHTML = INV.map(function (it, i) {
        return '<button class="ph-inv' + (it ? '' : ' empty') + '" data-slot="' + i + '"' + (it ? ' title="' + it.name + '"' : ' tabindex="-1"') + '>' +
          '<kbd>' + (i + 1) + '</kbd>' + (it ? (it.img ? '<img class="ph-inv-img" src="' + it.img + '" alt="">' : logo(fa(it.icon), it.color)) + '<span class="ph-inv-nm">' + esc(it.name) + '</span>' : '') + (it && it.id === 'dance' ? '<i class="ph-inv-key">E</i>' : it && it.id === 'emote' ? '<i class="ph-inv-key">A</i>' : it && it.id === 'phone' ? '<i class="ph-inv-key">T</i>' : it && it.id === 'chat' ? '<i class="ph-inv-key">↵</i>' : '') + '</button>';
      }).join('');
      markHotbar();
    }
    // ce que le personnage a dans la main : le téléphone (aussi pour le chat), une carte pour les objets rangés par d'autres fichiers, rien pour Danses et Emotes
    function syncHeld() {
      var it = INV[sel], id = '';
      if (it) id = it.id === 'phone' || it.id === 'chat' ? 'phone' : (it.id === 'dance' || it.id === 'emote') ? '' : (it.hold || 'card');
      if (w.setHeld) w.setHeld(id);
    }
    function markHotbar() {
      syncHeld();
      Array.prototype.forEach.call(elHotbar.querySelectorAll('.ph-inv'), function (b) {
        var it = INV[+b.getAttribute('data-slot')];
        b.classList.toggle('on', !!it && ((it.id === 'phone' && phoneOpen) || (it.id === 'dance' && wheelOpen && tab === 'dance') || (it.id === 'emote' && wheelOpen && tab === 'emote') || (it.id === 'chat' && phoneOpen && page === 'chat')));
        b.classList.toggle('sel', +b.getAttribute('data-slot') === sel);
      });
    }
    // Objets rangés par d'autres fichiers (ex. cartes à gratter du PMU) : setItems('pmu', [{ id, name, icon, color, use }]) remplace
    // tous les objets de ce genre ; ils prennent la case libre du milieu (3).
    function setItems(kind, list) {
      var i, k, free = [2];
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
      if (it.id === 'phone') { if (phoneOpen) closePhone(true); else openPhone(); }
    }

    /* ---------- inventaire (touche Tab) : ton skin, ton argent et trois cases de rangement ---------- */
    function paintInv() {
      var s = st(), name = s && s.username ? s.username : 'Invité';
      var boss = false, co = false; try { boss = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin(); co = typeof isCurrentUserCoFounder === 'function' && isCurrentUserCoFounder(); } catch (e) { /* ok */ }
      put(q('invava'), 'iava', myAv());
      put(q('invname'), 'iname', name);
      put(q('invrank'), 'irank', '<i class="fa-solid ' + (boss ? 'fa-crown' : co ? 'fa-gem' : 'fa-fire') + ' role-crown"></i> <span class="role-label">' + (boss ? 'Patron' : co ? 'Co Fondateur' : 'Flambeur') + '</span>', true);
      q('invrank').className = 'ph-rank role-tag ' + (boss ? 'role-patron' : co ? 'role-cofondateur' : 'role-flambeur');
      put(q('invbal'), 'ibal', s && typeof s.balance === 'number' ? F.fmtN(s.balance) : '0');
      if (!elInvSlots.firstChild) elInvSlots.innerHTML = '<div class="ph-inv empty"></div><div class="ph-inv empty"></div><div class="ph-inv empty"></div>';
    }
    function openInv() {
      if (!w.canEmote()) return;
      closeWheel(); closePhone(); closeChat();
      w._libererSouris();
      invOpen = true; paintInv(); elInv.hidden = false;
    }
    function closeInv(reprendreSouris) {
      if (!invOpen) return;
      invOpen = false; elInv.hidden = true;
      if (reprendreSouris) relock();
    }

    // molette : change de case (en grand écran ou souris verrouillée, hors fenêtres ouvertes)
    var wheelT = 0;
    function onWheel(ev) {
      if (wheelOpen && w.running && !w.dead) {                         // roue ouverte : la molette tourne la flèche
        ev.preventDefault();
        var tw = performance.now();
        if (tw - wheelT < 90) return;
        wheelT = tw; moveSel(ev.deltaY > 0 ? 1 : -1);
        return;
      }
      if (!w.running || w.dead || !w.canEmote() || wheelOpen || phoneOpen || chatOpen || pauseOpen || invOpen) return;
      if (!(w.full || document.pointerLockElement === w.dom)) return;
      ev.preventDefault();
      var t = performance.now();
      if (t - wheelT < 90) return;                                     // un cran de molette = une case, même sur pavé tactile
      wheelT = t;
      var dir = ev.deltaY > 0 ? 1 : -1;
      sel = sel < 0 ? (dir > 0 ? 0 : INV.length - 1) : (sel + dir + INV.length) % INV.length;
      markHotbar();
    }
    window.addEventListener('wheel', onWheel, { passive: false });

    // case du téléphone choisie : un clic gauche ou droit sur la vue ouvre le téléphone (comme un objet qu'on tient en main)
    // objet en main : le téléphone, ou un objet rangé par un autre fichier (cartes à gratter) ; clickOk() peut refuser le clic (ex. hors du PMU)
    function enMain() {
      var it = INV[sel];
      if (!it || !(it.id === 'phone' || typeof it.use === 'function')) return false;
      return typeof it.clickOk !== 'function' || !!it.clickOk();
    }
    function onWorldDown(ev) {
      if (ev.target !== w.dom || ev.pointerType !== 'mouse') return;
      if (wheelOpen) {                                                 // roue ouverte (souris verrouillée) : clic gauche = lancer, clic droit = fermer
        ev.stopPropagation(); ev.preventDefault();
        if (ev.button === 0) confirmWheel(); else if (ev.button === 2) closeWheel();
        return;
      }
      if (phoneOpen || pauseOpen || invOpen || w.modalOpen) { ev.stopPropagation(); return; }   // fenêtre ouverte : un clic à côté ne reprend pas la souris, le curseur reste visible
      if (ev.button !== 0 && ev.button !== 2) return;
      if (!enMain() || !w.running || w.dead || !w.canEmote() || chatOpen) return;
      ev.stopPropagation(); ev.preventDefault();                       // le monde ne verrouille pas la souris pour ce clic
      useSlot(sel);
    }
    function onWorldMenu(ev) { if (ev.target === w.dom && (enMain() || wheelOpen)) ev.preventDefault(); }   // pas de menu du navigateur sur le clic droit
    w.container.addEventListener('pointerdown', onWorldDown, true);
    w.container.addEventListener('contextmenu', onWorldMenu, true);

    /* ---------- menu pause (Échap) ---------- */
    var pauseOpen = false, pauseT = 0;
    function openPause() {
      if (!w.canEmote()) return;
      closeWheel(); closePhone(); closeChat(); closeInv();
      w._libererSouris();
      elPauseFull.textContent = w.full ? 'Mode fenêtré' : 'Grand écran';
      elPause.hidden = false; pauseOpen = true; pauseT = performance.now();
    }
    function closePause(reprendre) {
      if (!pauseOpen) return;
      elPause.hidden = true; pauseOpen = false;
      if (reprendre) relock();
    }
    // en grand écran, Échap rend la souris au navigateur sans que la touche nous parvienne : on ouvre la pause à ce moment
    function onLockChange() {
      if (document.pointerLockElement === w.dom) return;
      if (Date.now() - (w._relache || 0) < 400) return;                // c'est nous qui l'avons rendue (roue, téléphone, chat…)
      if (!w.full || !w.running || w.dead || wheelOpen || phoneOpen || chatOpen || pauseOpen || invOpen || w.modalOpen) return;
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
    // photo de profil : l'emoji de l'avatar, ou à défaut l'initiale du pseudo (« ?? » venu d'un mauvais encodage compris)
    function cleanAv(av, name) {
      av = String(av == null ? '' : av).trim();
      if (!av || /^[?\s]*$|^(null|undefined)$/.test(av)) av = String(name || '?').charAt(0).toUpperCase();
      return Array.from(av).slice(0, 3).join('');
    }
    function myAv() {
      var a = '';
      try { a = typeof getAvatarDisplay === 'function' ? getAvatarDisplay() : ''; } catch (e) { /* page pas prête */ }
      var s = st();
      return cleanAv(a, s && s.username);
    }
    function avBg(name) { var h = 7, i; for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return 'hsl(' + h + ',38%,26%)'; }
    function chatNode(m) {
      var line = document.createElement('div');
      line.className = 'ph-cl' + (m.cls ? ' ' + m.cls : '');
      if (m.name) { var nb = document.createElement('b'); nb.textContent = m.name; line.appendChild(nb); }
      var sp = document.createElement('span'); sp.textContent = m.text; line.appendChild(sp);
      if (!m.name) return line;                                        // message système : pas de photo
      var row = document.createElement('div'); row.className = 'ph-crow' + (m.cls === 'me' ? ' me' : '');
      var av = document.createElement('span'); av.className = 'ph-cav'; av.style.background = avBg(m.name); av.textContent = m.av || cleanAv('', m.name);
      row.appendChild(av); row.appendChild(line);
      return row;
    }
    function paintChatPage() {
      var list = q('cplist');
      if (!list) return;
      list.innerHTML = '';
      if (!chatHist.length) { var em = document.createElement('div'); em.className = 'ph-cp-empty'; em.textContent = 'Aucun message pour l\'instant. Écris le premier : il apparaîtra en bulle au-dessus de ta tête.'; list.appendChild(em); }
      chatHist.forEach(function (m) { list.appendChild(chatNode(m)); });
      list.scrollTop = list.scrollHeight;
    }
    function chatAdd(name, text, cls, av) {
      chatHist.push({ name: name, text: text, cls: cls || '', av: av || '' });
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
      var msg = { k: w._me(), name: name, av: myAv(), text: text };
      sent = !!(F.presence && F.presence.send('chat', msg));          // canal de tout le casino : toutes les salles reçoivent
      if (!sent) { try { sent = !!(w.rt && w.rt.ready && w.rt.send('chat', msg)); } catch (e) { /* ok */ } }   // repli : les joueurs de la salle
      chatAdd(name, text, 'me', myAv());
      if (w.selfPerson && w.selfPerson.say) w.selfPerson.say(text);   // visible si tu danses (caméra devant toi)
      if (!sent) chatAdd('', 'Hors ligne : personne n\'a reçu ton message.', 'sys');
      return true;
    }
    // le chat est l'appli Chat du téléphone : on l'ouvre directement, le champ prêt à écrire
    function openChat() {
      openPhone('chat');
      var inp = q('cpin'); if (inp) inp.focus();
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
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-ph') === 'bkto') bankSuggest(ev.target.value);
    });
    root.addEventListener('keydown', function (ev) {
      if (!ev.target || !ev.target.classList || !(ev.target.getAttribute('data-ph') === 'cpin' || ev.target.classList.contains('ph-in'))) return;   // champs du téléphone : ni déplacement ni raccourcis
      ev.stopPropagation();
      if (ev.code === 'Escape') { ev.preventDefault(); ev.target.blur(); closePhone(true); }
    });
    root.addEventListener('focusout', function (ev) {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-ph') === 'cpin') typingNotify(false);
    });
    function chatIn(m) {
      if (!m || typeof m.text !== 'string') return;
      var text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!text) return;
      var cn = String(m.name || m.k || '?').slice(0, 20);
      chatAdd(cn, text, '', cleanAv(m.av || (F.presence && F.presence.avatarOf(m.k)), cn));
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
      if (elPhone.contains(t)) tick();                                 // petit son à chaque bouton du téléphone
      if (a === 'wheel-dance') { if (wheelOpen && tab === 'dance') closeWheel(); else openWheel('dance'); }
      else if (a === 'wheel-emote') { if (wheelOpen && tab === 'emote') closeWheel(); else openWheel('emote'); }
      else if (a === 'phone') { if (phoneOpen) closePhone(true); else openPhone(); }
      else if (a === 'phone-back') goBack();
      else if (a === 'phone-home') { if (page !== 'menu') { page = 'menu'; sub = 'home'; renderPhone(); } else closePhone(true); }   // bouton rouge : accueil, puis ferme et la souris est reprise
      else if (a === 'resume') closePause(true);
      else if (a === 'pause-settings') { closePause(); openPhone('settings'); }
      else if (a === 'pause-profile') { closePause(); openPhone('profile'); }
      else if (a === 'pause-full') { w.setFull(!w.full); elPauseFull.textContent = w.full ? 'Mode fenêtré' : 'Grand écran'; }
      else if (a === 'chat') { if (phoneOpen && page === 'chat') closePhone(true); else openChat(); }
      else if (t.hasAttribute('data-slot')) useSlot(+t.getAttribute('data-slot'));
      else if (a === 'stop') w.stopEmote();
      else if (a === 'profile') { if (phoneOpen && page === 'profile') closePhone(true); else openPhone('profile'); }
      else if (a === 'pf-save') profileSave();
      else if (a === 'pf-avatars') { sub = 'avatars'; renderPhone(); }
      else if (a === 'pf-editname') { pfEdit = 'name'; renderPhone(); var en = q('pfname'); if (en) { en.focus(); en.select(); } }
      else if (a === 'pf-editpass') { pfEdit = 'pass'; renderPhone(); var ep = q('pfpass'); if (ep) ep.focus(); }
      else if (a === 'pf-cancel') { pfEdit = ''; renderPhone(); }
      else if (a === 'av-use') avatarUse();
      else if (a === 'refuse-close') { refuse = null; renderPhone(); }
      else if (a === 'pf-shop') { refuse = null; leaveWorld(); try { switchRoom('shop'); } catch (e) {} }
      else if (a === 'pf-logout') { leaveWorld(); try { logoutPlayer(); } catch (e) {} }
      else if (a === 'bk-send') bankSend();
      else if (a === 'bk-accept') bankAct(typeof acceptTransferById === 'function' ? acceptTransferById : null, t.getAttribute('data-id'));
      else if (a === 'bk-decline') bankAct(typeof declineTransferById === 'function' ? declineTransferById : null, t.getAttribute('data-id'));
      else if (t.hasAttribute('data-av')) { avSel = t.getAttribute('data-av'); sub = 'avpreview'; renderPhone(); }
      else if (t.hasAttribute('data-bk')) { sub = t.getAttribute('data-bk'); renderPhone(); }
      else if (t.hasAttribute('data-amt')) { var am = q('bkamt'); if (am) am.value = t.getAttribute('data-amt'); }
      else if (t.hasAttribute('data-pick')) { var to = q('bkto'); if (to) to.value = t.getAttribute('data-pick'); bankSuggest(''); var am2 = q('bkamt'); if (am2) am2.focus(); }
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
      else if (a === 'fullscreen') { w.setFull(!w.full); sync(); }
      else if (a === 'toggle-full') {
        w.setFull(!w.full);
        var fb = root.querySelector('[data-ph="fulllabel"]');
        if (fb) fb.textContent = w.full ? 'Mode fenêtré' : 'Grand écran';
      }
      else if (t.hasAttribute('data-tab')) setTab(t.getAttribute('data-tab'));
      else if (t.hasAttribute('data-page')) { page = t.getAttribute('data-page'); sub = 'home'; pfEdit = ''; refuse = null; renderPhone(); if (page === 'bank') bankRefresh(); }
      else if (t.hasAttribute('data-emo')) play(t.getAttribute('data-emo'));
    });
    root.addEventListener('mouseover', function (ev) {
      var t = ev.target.closest ? ev.target.closest('.ph-slot') : null;
      if (!t) return;
      var e = F.emoteById(t.getAttribute('data-emo'));
      if (e) { elWName.textContent = e.name; elWHint.textContent = e.dur ? 'Emote · ' + Math.round(e.dur) + ' s' : 'Danse · marche pour arrêter'; }
    });
    root.addEventListener('mouseout', function (ev) { if (ev.target.closest && ev.target.closest('.ph-slot')) wheelIdle(); });

    // clic droit sur une case de l'inventaire : comme le clic gauche (pas de menu du navigateur)
    root.addEventListener('contextmenu', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-slot]') : null;
      if (!t) return;
      ev.preventDefault();
      useSlot(+t.getAttribute('data-slot'));
    });

    /* ---------- clavier ---------- */
    function kd(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev) || !w.running || w.dead || !w.container.clientWidth || w.modalOpen) return;   // modalOpen : un ticket à gratter est ouvert, il gère ses touches
      if (ev.code === 'Escape') {
        if (pauseOpen) {
          if (performance.now() - pauseT < 250) { ev.stopImmediatePropagation(); ev.preventDefault(); return; }   // même geste que celui qui vient d'ouvrir la pause
          ev.stopImmediatePropagation(); ev.preventDefault(); closePause(true);
        } else if (wheelOpen || phoneOpen || invOpen) { var tel = phoneOpen || invOpen; ev.stopImmediatePropagation(); ev.preventDefault(); closeAll(); if (tel) relock(); }
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
      } else if (ev.code === 'Enter' && wheelOpen) {
        ev.preventDefault(); ev.stopImmediatePropagation(); confirmWheel();
      } else if (ev.code === 'Enter' && !(w.near && w.blend === 0)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        openChat();
      } else if (ev.code === 'KeyT' || ev.key === 't' || ev.key === 'T') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (phoneOpen) closePhone(true); else openPhone();
      } else if (wheelOpen && ev.code === 'Tab') {
        ev.preventDefault();
        setTab(tab === 'dance' ? 'emote' : 'dance');
      } else if (ev.code === 'Tab') {
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (invOpen) closeInv(true); else openInv();
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

    if (F.presence && F.presence.on) F.presence.on('chat', chatIn);          // les messages des autres salles arrivent par le canal commun
    sync();
    var api = {
      sync: sync,
      setItems: setItems,
      relock: relock,
      close: closeAll,
      chatIn: chatIn,
      typingIn: typingIn,
      dispose: function () {
        window.removeEventListener('keydown', kd, true);
        if (F.presence && F.presence.on) F.presence.on('chat', null);
        window.removeEventListener('wheel', onWheel);
        w.container.removeEventListener('pointerdown', onWorldDown, true);
        w.container.removeEventListener('contextmenu', onWorldMenu, true);
        document.removeEventListener('pointerlockchange', onLockChange);
        if (root.parentNode) root.parentNode.removeChild(root);
        w.hud.classList.remove('has-ph');
      }
    };
    (F.hudReady || []).forEach(function (fn) { try { fn(w, api); } catch (e) { /* un module en panne ne bloque pas le HUD */ } });   // ex. pmu3d.js : ses cartes à gratter vont dans la barre du bas
    return api;
  };
})();
