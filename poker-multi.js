/**
 * =============================================================================
 * POKER 3D MULTIJOUEUR — Lobby, salons et synchronisation avec le serveur
 * -----------------------------------------------------------------------------
 * Le serveur (/api/poker, protocole v2) est l'unique source de vérité :
 * cartes, mises, tours, pots. Ce module :
 *   - affiche le lobby (solo, tables publiques, salons par type),
 *   - gère la mise de départ (jetons pris sur le solde, rendus en quittant),
 *   - interroge le serveur et projette son état dans la scène 3D existante
 *     (via un objet « jeu » qui remplace le moteur solo tant qu'on est en ligne).
 * =============================================================================
 */
(function () {
  'use strict';

  const DEVICE_KEY = 'flambeurs_poker_device';
  const POLL_MS = 900;
  const LOBBY_POLL_MS = 2000;
  const SLOT_LAYOUT = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ----------------------------------------------------------------------- */
  /* OUTILS                                                                  */
  /* ----------------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${Math.floor(Number(n) || 0).toLocaleString('fr-FR')} €`;
  const toast = (msg) => { if (typeof showToast === 'function') showToast(msg); else console.log('[Poker]', msg); };

  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  let memoryDevice = null;
  function deviceId() {
    try {
      let d = localStorage.getItem(DEVICE_KEY);
      if (!d || d.length < 16) {
        d = randomHex(16);
        localStorage.setItem(DEVICE_KEY, d);
      }
      return d;
    } catch (e) {
      if (!memoryDevice) memoryDevice = randomHex(16);
      return memoryDevice;
    }
  }

  function guestName() {
    try {
      let tag = localStorage.getItem('flambeurs_guest_tag');
      if (!tag) {
        tag = 'Joueur #' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('flambeurs_guest_tag', tag);
      }
      return tag;
    } catch (e) { return 'Joueur'; }
  }

  function identity() {
    const hasState = typeof state !== 'undefined' && state;
    const name = hasState && state.username ? state.username : guestName();
    const avatar = typeof getAvatarDisplay === 'function' && hasState ? getAvatarDisplay(state) : '😎';
    return { name, avatar };
  }

  const getBalance = () => (typeof state !== 'undefined' && state ? Math.floor(state.balance || 0) : 0);

  // Le solde réel est géré par le serveur : le navigateur ne fait que l'afficher (valeur renvoyée par l'API).
  function addBalance() { /* volontairement vide */ }
  function applyServerBalance(value) {
    if (typeof state === 'undefined' || !state || typeof value !== 'number') return;
    state.balance = Math.max(0, Math.floor(value));
    state.lastBalanceChange = Date.now();
    try { if (typeof saveState === 'function') saveState(); } catch (e) {}
    try { if (typeof updateGlobalUI === 'function') updateGlobalUI(); } catch (e) {}
  }

  function apiUrl() {
    return window.location && window.location.protocol === 'file:' ? 'http://localhost:8080/api/poker' : '/api/poker';
  }

  class LegacyServerError extends Error {}

  async function api(method, payload) {
    const opts = { cache: 'no-store' };
    let url = apiUrl();
    if (method === 'GET') {
      url += '?' + new URLSearchParams(payload).toString();
    } else {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(payload);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.v !== 2) throw new LegacyServerError('serveur ancien');
    if (typeof data.balance === 'number') applyServerBalance(data.balance);
    return data;
  }

  const base = () => {
    const id = identity();
    let token = '';
    try { token = typeof getAuthToken === 'function' ? getAuthToken() : ''; } catch (e) {}
    return { username: id.name, avatar: id.avatar, device: deviceId(), token };
  };

  /* ----------------------------------------------------------------------- */
  /* « JEU » EN LIGNE : même interface que le moteur solo pour la scène 3D   */
  /* ----------------------------------------------------------------------- */
  function emptyPlayer(id, label) {
    return {
      id, name: label || '', avatar: '🪑', stack: 0, isHero: id === 0, currentBet: 0, folded: true,
      allIn: false, hand: [], status: '', bestHand: null, empty: true, noCards: true, handTotal: 0
    };
  }

  const realCards = (cards) => (Array.isArray(cards) ? cards.filter((c) => c && !c.hidden) : []);

  class MultiGame {
    constructor(exp, ctrl) {
      this.exp = exp;
      this.ctrl = ctrl;
      this.isMulti = true;
      this.players = [0, 1, 2, 3, 4, 5].map((i) => emptyPlayer(i, ''));
      this.communityCards = [];
      this.pot = 0;
      this.phase = 'waiting';
      this.phaseLabel = 'En attente…';
      this.currentTurn = -1;
      this.currentMaxBet = 0;
      this.bigBlind = 100;
      this.smallBlind = 50;
      this.lastRaiseSize = 100;
      this.isHeroTurn = false;
      this.activeSeatIndices = [0, 1, 2, 3, 4, 5];
      // propriétés lues par Poker3DExperience.pause()/resume()
      this.botTimer = null;
      this.nextHandTimer = null;
      this.countdownInterval = null;
      this.phaseTimers = [];

      this.view = null;
      this.slotByKey = {};
      this.heroKey = null;
      this._bounds = { min: 0, max: 0 };
      this._shown = 0;
      this._handId = null;
      this._target = [];
      this._prevStatus = null;
      this._prevHandId = null;
    }

    /* --- interface attendue par le reste du site --- */
    startNewHand() { /* géré par le croupier du serveur */ }
    setTableFormat() {}
    setBigBlind() {}
    executeBotAI() {}
    updateHeroIdentity() { if (this.view) this.exp.syncTable3D(); }
    getRaiseBounds() { return this._bounds; }

    onSliderInput(val) {
      const num = parseInt(val, 10);
      const disp = $('demoRaiseDisplay');
      const btn = $('btnRaiseAmount');
      if (disp) disp.textContent = money(num);
      if (btn) btn.textContent = money(num);
    }

    setQuickRaise(type) {
      const b = this._bounds;
      let val = b.min;
      if (type === 'min') val = b.min;
      else if (type === 'allin') val = b.max;
      else if (typeof type === 'number') val = Math.min(b.max, Math.max(b.min, type));
      const slider = $('demoRaiseSlider');
      if (slider) slider.value = val;
      this.onSliderInput(val);
    }

    heroFold() {
      if (!this.isHeroTurn) return;
      this._lockTurn();
      this.ctrl.sendAction('fold');
    }

    heroCheckOrCall() {
      if (!this.isHeroTurn) return;
      const hero = this.players[0];
      const toCall = this.currentMaxBet - hero.currentBet;
      this._lockTurn();
      this.ctrl.sendAction(toCall <= 0 ? 'check' : 'call');
    }

    heroRaise() {
      if (!this.isHeroTurn) return;
      const slider = $('demoRaiseSlider');
      const b = this._bounds;
      let target = slider ? parseInt(slider.value, 10) : b.min;
      if (!Number.isFinite(target)) target = b.min;
      target = Math.min(b.max, Math.max(b.min, target));
      this._lockTurn();
      if (target >= b.max) this.ctrl.sendAction('allin');
      else this.ctrl.sendAction('raise', target);
    }

    _lockTurn() {
      this.isHeroTurn = false;
      this.exp.syncHUD();
    }

    /* --- projection de l'état serveur dans la scène --- */
    apply(view) {
      this.view = view;
      const exp = this.exp;
      const me = view.me;
      const max = view.maxSeats;
      const seats = view.seats;
      const myIdx = me ? me.seat : 0;
      this.heroKey = me ? me.key : null;

      const layout = SLOT_LAYOUT[Math.min(5, Math.max(1, max - 1))];
      exp.applySeatLayout(layout.map((id) => id - 1));
      exp.tableFormat = max === 2 ? '1v1' : max <= 4 ? '4max' : '6max';

      this.bigBlind = view.bigBlind;
      this.smallBlind = view.smallBlind;
      this.currentMaxBet = view.currentBet;
      this.lastRaiseSize = view.minRaise;
      this.pot = view.pot;
      this.isHeroTurn = !!(me && me.isTurn);
      this._bounds = me ? { min: me.minRaiseTo, max: me.maxRaiseTo } : { min: 0, max: 0 };
      this.slotByKey = {};

      const fill = (pl, s, isHero) => {
        const dealer = view.dealerSeat === s.seat && view.status !== 'waiting';
        pl.id = isHero ? 0 : pl.id;
        pl.isHero = isHero;
        pl.name = s.username + (dealer ? ' Ⓓ' : '');
        pl.avatar = s.avatar;
        pl.stack = s.stack;
        pl.currentBet = s.bet;
        pl.handTotal = s.total;
        pl.folded = s.inHand ? s.folded : false;
        pl.allIn = s.allIn;
        pl.hand = realCards(s.cards);
        pl.noCards = !s.inHand;
        pl.empty = false;
        pl.bestHand = null;
        let st = s.status || '';
        if (s.sittingOut) st = 'Attend la prochaine main';
        else if (view.status === 'waiting' || view.status === 'countdown') st = s.ready ? '✔ Prêt' : 'Pas prêt';
        if (s.idleMs > 20000) st = '📡 Connexion perdue';
        pl.status = st;
      };

      // joueur principal
      const hero = this.players[0];
      const heroSeat = me ? seats[myIdx] : null;
      if (heroSeat) {
        fill(hero, heroSeat, true);
        this.slotByKey[heroSeat.key] = 0;
      } else {
        const id = identity();
        Object.assign(hero, emptyPlayer(0, id.name), { avatar: id.avatar, empty: false, folded: false, noCards: true, isHero: true });
      }

      // adversaires : dans l'ordre des sièges après le nôtre
      for (let id = 1; id <= 5; id++) this.players[id] = emptyPlayer(id, layout.includes(id) ? 'Siège libre' : '');
      for (let j = 1; j < max; j++) {
        const si = (myIdx + j) % max;
        const slot = layout[j - 1];
        const s = seats[si];
        if (s && slot) {
          fill(this.players[slot], s, false);
          this.players[slot].id = slot;
          this.slotByKey[s.key] = slot;
        }
      }

      this.currentTurn = view.turn && view.status === 'playing'
        ? (this.slotByKey[view.turn] != null ? this.slotByKey[view.turn] : -1)
        : -1;

      // phase affichée
      this.phase = view.status === 'playing' ? (view.phase || 'preflop') : (view.status === 'showdown' ? 'showdown' : 'waiting');
      if (view.status === 'waiting') {
        const seated = seats.filter(Boolean).length;
        this.phaseLabel = seated < 2 ? 'En attente d\'un adversaire' : (me && me.ready ? 'En attente des autres' : 'Clique sur PRÊT');
      } else if (view.status === 'countdown') {
        this.phaseLabel = 'Départ imminent';
      } else {
        this.phaseLabel = null;
      }

      this._syncCommunity(view);
      this._syncBanner(view);

      // curseur de relance borné
      const slider = $('demoRaiseSlider');
      if (slider) slider.step = String(Math.max(1, Math.floor(view.smallBlind / 2)));

      exp.syncTable3D();
      this._prevStatus = view.status;
      this._prevHandId = view.handId;
    }

    _clearPhaseTimers() {
      (this.phaseTimers || []).forEach((t) => clearTimeout(t));
      this.phaseTimers = [];
    }

    _syncCommunity(view) {
      const target = view.community || [];
      this._target = target;
      const newHand = this._handId !== null && (view.handId !== this._handId || target.length < this._shown);
      if (this._handId === null || newHand) {
        this._clearPhaseTimers();
        this._shown = this._handId === null ? target.length : 0;
        this.communityCards = target.slice(0, this._shown);
      }
      this._handId = view.handId;
      if (target.length > this._shown) {
        const start = this._shown;
        this._shown = target.length;
        for (let i = start; i < target.length; i++) {
          const delay = (i - start) * 450;
          const reveal = () => {
            this.communityCards = this._target.slice(0, i + 1);
            this.exp.animateDealCommunityCard(i, this._target[i]);
            this.exp.syncTable3D();
          };
          if (delay === 0) {
            this.communityCards = target.slice(0, i + 1);
            this.exp.animateDealCommunityCard(i, target[i]);
          } else {
            this.phaseTimers.push(setTimeout(reveal, delay));
          }
        }
        if (typeof playPokerCardDealSound === 'function') { try { playPokerCardDealSound(); } catch (e) {} }
      }
    }

    _syncBanner(view) {
      const modal = $('winnerBannerModal');
      if (!modal) return;
      if (view.status !== 'showdown' || !view.result) {
        modal.classList.add('hidden');
        return;
      }
      const res = view.result;
      const seatsByKey = {};
      view.seats.forEach((s) => { if (s) seatsByKey[s.key] = s; });
      const main = res.pots[0];
      const winnerKeys = [];
      res.pots.forEach((p) => p.winners.forEach((w) => { if (!winnerKeys.includes(w.key)) winnerKeys.push(w.key); }));
      const names = winnerKeys.map((k) => {
        const s = seatsByKey[k];
        return s ? `${s.avatar} ${s.username}` : k;
      }).join(' & ');
      let gained = 0;
      winnerKeys.forEach((k) => { if (seatsByKey[k]) gained += seatsByKey[k].won || 0; });

      const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
      set('bannerTitle', res.uncontested ? 'Tous couchés • Vainqueur' : (main && main.winners.length > 1 ? 'Partage du pot !' : 'Abattage • Vainqueur'));
      set('bannerWinnerName', names || '—');
      set('bannerPotWon', `+ ${(gained || res.total).toLocaleString('fr-FR')} €`);
      set('bannerHandDescription', res.uncontested ? 'Tous les adversaires se sont couchés' : ((main && main.winners[0] && main.winners[0].handName) || 'Meilleure combinaison'));

      const details = $('bannerHandDetails');
      if (details) {
        if (res.uncontested) {
          details.innerHTML = `<div class="text-stone-300 font-medium">${esc(names)} remporte le pot sans abattage.</div>`;
        } else {
          details.innerHTML = res.revealed.map((k) => {
            const s = seatsByKey[k];
            if (!s) return '';
            const isW = winnerKeys.includes(k);
            const cards = (s.cards || []).filter((c) => c && c.rank).map((c) => `${esc(c.rank)}${esc(c.suit)}`).join(' ');
            return `<div class="flex items-center justify-between py-1 border-b border-white/5 ${isW ? 'text-amber-300 font-black' : 'text-stone-400 font-medium'}">
              <span>${esc(s.avatar)} ${esc(s.username)} <span class="font-mono text-[10px] text-stone-500">(${cards})</span></span>
              <span>${esc(s.handName || '')}</span></div>`;
          }).join('');
        }
      }
      const justEnded = this._prevStatus !== 'showdown' || this._prevHandId !== view.handId;
      modal.classList.remove('hidden');
      if (justEnded) {
        const mine = this.heroKey && seatsByKey[this.heroKey];
        if (mine && mine.won > 0 && typeof playCoinWinSound === 'function') { try { playCoinWinSound(); } catch (e) {} }
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* INTERFACE : LOBBY, MISE DE DÉPART, BARRE DE TABLE                       */
  /* ----------------------------------------------------------------------- */
  const CSS = `
    #pmLobby, #pmBuyIn { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    #pmLobby .pm-scroll { scrollbar-width: thin; scrollbar-color: rgba(251,191,36,.4) transparent; }
    #pmBar .pm-btn { transition: transform .1s, filter .15s; }
    #pmBar .pm-btn:active { transform: scale(.96); }
    .pm-card { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); border-radius: 1rem; }
    .pm-chip { display:inline-flex; align-items:center; justify-content:center; width:1.55rem; height:1.55rem; border-radius:9999px; font-size:.85rem; background:#1c1917; border:1px solid rgba(251,191,36,.5); }
    .pm-chip.empty { border-style:dashed; opacity:.4; border-color: rgba(255,255,255,.3); }
    .pm-seg { padding:.45rem .5rem; border-radius:.75rem; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.05); color:#d6d3d1; font-weight:700; font-size:.75rem; }
    #pmReadyBox { position:fixed; left:50%; top:42%; transform:translate(-50%,-50%); z-index:45; display:none; flex-direction:column; align-items:center; gap:.5rem; text-align:center; pointer-events:none; }
    #pmReadyBox.show { display:flex; }
    #pmReadyBtn { pointer-events:auto; padding:.9rem 2.2rem; border-radius:9999px; border:2px solid #fde68a; background:linear-gradient(90deg,#f59e0b,#34d399); color:#000; font-weight:900; font-size:1.05rem; letter-spacing:.04em; text-transform:uppercase; box-shadow:0 0 35px rgba(251,191,36,.55); cursor:pointer; }
    #pmReadyBtn.pm-pulse { animation: pmPulse 1.2s ease-in-out infinite; }
    #pmReadyBtn:disabled { cursor:default; background:#292524; color:#d6d3d1; border-color:rgba(255,255,255,.2); box-shadow:none; animation:none; }
    #pmReadyHint { font-size:.8rem; font-weight:700; color:#fde68a; text-shadow:0 1px 6px #000; }
    @keyframes pmPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.06); } }
    .pm-tile { cursor:pointer; text-align:left; transition:transform .12s, border-color .15s, background .15s; }
    .pm-tile:hover { border-color:#fbbf24; background:rgba(245,158,11,.1); transform:translateY(-2px); }
    /* le poker est plein écran : on masque l'en-tête du site (il recouvrait le haut de la table et du lobby) */
    body:has(#view-poker:not(.hidden)) #smartHeader { display: none !important; }
    /* cartes lisibles en HTML (surtout sur téléphone, où la 3D est trop petite) */
    #pmCards { position:fixed; left:0; right:0; z-index:44; display:none; justify-content:center; align-items:flex-end; gap:14px; pointer-events:none; padding:0 8px; }
    #pmCards.show { display:flex; }
    #pmCards .pm-grp { display:flex; gap:5px; align-items:flex-end; }
    #pmCards .pm-board .pm-pcard { width:44px; height:62px; font-size:15px; border-radius:6px; }
    #pmCards .pm-board .pm-pcard .su { font-size:22px; }
    #pmCards .pm-hand .pm-pcard { width:62px; height:88px; font-size:21px; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,.6); }
    #pmCards .pm-hand .pm-pcard .su { font-size:32px; }
    .pm-pcard { position:relative; background:#fff; color:#111; font-weight:900; font-family:system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1; border:1px solid #d6d3d1; }
    .pm-pcard.red { color:#dc2626; }
    .pm-pcard .rk { position:absolute; top:3px; left:5px; }
    .pm-pcard.empty { background:rgba(255,255,255,.06); border:1px dashed rgba(255,255,255,.25); box-shadow:none; }
    /* les cartes se jouent directement sur la table 3D : plus de doublon en HTML */
    #pmCards { display:none !important; }
    @media (max-width: 480px) {
      /* HUD du haut compact : tout tient sur une ligne, boutons visibles */
      #headerTableFormatTag, #headerTableFormatTag + span { display:none; }
      .poker-hud-overlay span.text-base, .poker-hud-overlay span.animate-pulse { display:none; }
      .poker-hud-overlay .hud-interactive { padding-left:.6rem; padding-right:.6rem; }
      .poker-hud-overlay .hud-interactive button { padding-left:.5rem; padding-right:.5rem; }
      .poker-hud-overlay .hud-interactive.flex { gap:.3rem; }
      #headerBlindTag { white-space:nowrap; font-size:10px; }
      #potCenterDisplay { white-space:nowrap; }
      #tablePhaseDisplay { font-size:10px; white-space:nowrap; max-width:62px; overflow:hidden; text-overflow:ellipsis; }
    }
    @media (max-width: 380px) {
      .poker-hud-overlay .hud-interactive:has(> #headerBlindTag) { display:none; }
    }
    @media (max-width: 767px) {
      #pmReadyBox { top:47%; gap:.3rem; width:92%; }
      #pmReadyBtn { padding:.55rem 1.3rem; font-size:.85rem; }
      #pmReadyHint { font-size:.7rem; }
    }
    @media (max-width: 767px) { .poker-hud-overlay { padding-bottom: calc(4.6rem + env(safe-area-inset-bottom)) !important; } }
    .pm-seg.on { border-color:#fbbf24; background:rgba(245,158,11,.2); color:#fcd34d; }
  `;

  // « Duel • Salon 1 », « Table de 4 • Salon 2 »… (les noms « Salon n » se répètent d'un type à l'autre)
  function fullName(v) {
    const kind = v.maxSeats === 2 ? 'Duel' : v.maxSeats === 4 ? 'Table de 4' : v.maxSeats === 6 ? 'Table de 6' : '';
    return kind ? `${kind} • ${v.name}` : v.name;
  }

  // cartes en HTML : main du joueur + tapis, bien lisibles
  function renderCards() {
    const box = $('pmCards');
    const root = $('view-poker');
    if (!box || !root || root.classList.contains('hidden')) return;
    const g = window.pokerGame;
    const hero = g && g.players && g.players[0];
    const hand = hero && !hero.empty && !hero.noCards && Array.isArray(hero.hand) ? hero.hand.filter((c) => c && c.rank) : [];
    const board = g && Array.isArray(g.communityCards) ? g.communityCards.filter((c) => c && c.rank) : [];
    if (!hand.length && !board.length) { box.classList.remove('show'); return; }
    const face = (c) => `<div class="pm-pcard${c.suit === '♥' || c.suit === '♦' ? ' red' : ''}"><span class="rk">${esc(c.rank)}</span><span class="su">${esc(c.suit)}</span></div>`;
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(board[i] ? face(board[i]) : '<div class="pm-pcard empty"></div>');
    const html = `<div class="pm-grp pm-board">${slots.join('')}</div><div class="pm-grp pm-hand">${hand.map(face).join('')}</div>`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    box.classList.add('show');
    // juste au-dessus de la zone des boutons du joueur
    const hud = $('bottomHudContainer');
    if (hud) {
      const r = hud.getBoundingClientRect();
      box.style.bottom = Math.max(0, window.innerHeight - r.top + 8) + 'px';
    }
  }

  function buildDom(view) {
    if ($('pmLobby')) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const lobby = document.createElement('div');
    lobby.id = 'pmLobby';
    lobby.className = 'hidden fixed inset-0 z-[60] bg-[#07070b]/95 backdrop-blur-md flex flex-col';
    lobby.innerHTML = `
      <div class="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-white/10">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-2xl">♠️</span>
          <div class="min-w-0">
            <div class="font-black text-white text-base sm:text-lg tracking-wide uppercase truncate">Poker • Salons</div>
            <div class="text-[11px] text-stone-400">Choisis ton type de salon, ou joue seul contre les bots.</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <div class="text-[9px] uppercase tracking-widest text-amber-400/80 font-bold">Ton solde</div>
            <div id="pmLobbyBalance" class="font-mono text-sm font-black text-amber-300">0 €</div>
          </div>
          <button onclick="PokerMulti.openRules()" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold">❓ <span class="hidden sm:inline">Règles</span></button>
          <button onclick="switchRoom('hall')" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold">← <span class="hidden sm:inline">Casino</span></button>
        </div>
      </div>
      <div id="pmLobbyMsg" class="hidden mx-3 sm:mx-6 mt-3 px-3 py-2 rounded-xl border border-rose-400/40 bg-rose-950/40 text-rose-200 text-xs font-bold"></div>
      <div class="pm-scroll flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        <div class="max-w-5xl mx-auto space-y-6" id="pmLobbyBody"></div>
      </div>`;

    const buyin = document.createElement('div');
    buyin.id = 'pmBuyIn';
    buyin.className = 'hidden fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
    buyin.innerHTML = `
      <div class="w-full max-w-sm bg-gradient-to-b from-[#12131c] to-[#090a0f] border-2 border-amber-500/50 rounded-3xl p-5 shadow-[0_0_50px_rgba(251,191,36,0.25)] space-y-3">
        <div class="flex items-center justify-between">
          <h3 id="pmBuyInTitle" class="font-black text-white uppercase tracking-wide text-sm"></h3>
          <button onclick="PokerMulti.cancelBuyIn()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-stone-300 font-bold">✕</button>
        </div>
        <div id="pmBuyInInfo" class="text-xs text-stone-400"></div>
        <div>
          <label class="text-[10px] font-black tracking-widest text-amber-400/90 uppercase">Mise de départ (jetons à table)</label>
          <input id="pmBuyInInput" type="number" inputmode="numeric" class="mt-1 w-full bg-black/70 border border-amber-400/50 rounded-xl px-3 py-2 text-white font-mono font-black text-lg focus:outline-none focus:border-amber-400">
          <input id="pmBuyInRange" type="range" class="poker-range-slider w-full mt-3">
          <div class="grid grid-cols-4 gap-1.5 mt-2 text-[11px] font-bold">
            <button class="pm-seg" onclick="PokerMulti.quickBuyIn(0)">Min</button>
            <button class="pm-seg" onclick="PokerMulti.quickBuyIn(.33)">⅓</button>
            <button class="pm-seg" onclick="PokerMulti.quickBuyIn(.66)">⅔</button>
            <button class="pm-seg" onclick="PokerMulti.quickBuyIn(1)">Max</button>
          </div>
        </div>
        <div class="text-[11px] text-stone-400">Ces jetons sont retirés de ton solde et te sont rendus (avec tes gains ou pertes) quand tu quittes la table.</div>
        <div id="pmBuyInErr" class="hidden text-xs font-bold text-rose-300"></div>
        <button id="pmBuyInGo" onclick="PokerMulti.confirmBuyIn()" class="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:brightness-110 font-black text-black text-xs uppercase tracking-wider shadow-lg">S'asseoir à la table</button>
      </div>`;

    const bar = document.createElement('div');
    bar.id = 'pmBar';
    bar.className = 'hidden absolute left-0 right-0 top-[3.6rem] sm:top-[4.1rem] z-30 flex justify-center px-2 pointer-events-none';
    bar.innerHTML = `
      <div class="pointer-events-auto w-full max-w-xl flex items-center gap-2 bg-black/85 border border-white/15 rounded-2xl px-3 py-2 shadow-2xl backdrop-blur-md">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <span id="pmTableName" class="font-black text-[11px] sm:text-xs text-white truncate"></span>
          </div>
          <div id="pmAnnounce" class="text-[11px] text-amber-200/90 leading-tight truncate"></div>
        </div>
        <div id="pmTimer" class="font-mono text-xs font-black text-sky-300 whitespace-nowrap"></div>
        <button id="pmLeaveBtn" onclick="PokerMulti.leave()" class="pm-btn px-2.5 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 border border-rose-300/40 text-white font-black text-[11px] uppercase tracking-wide">Quitter</button>
      </div>`;

    const root = $('view-poker');
    root.appendChild(lobby);
    root.appendChild(buyin);
    root.appendChild(bar);
    const readyBox = document.createElement('div');
    readyBox.id = 'pmReadyBox';
    readyBox.innerHTML = '<button id="pmReadyBtn" onclick="PokerMulti.ready()">👍 Je suis prêt</button><div id="pmReadyHint"></div>';
    root.appendChild(readyBox);
    const cards = document.createElement('div');
    cards.id = 'pmCards';
    root.appendChild(cards);
    setInterval(renderCards, 300);

    // bouton « Salons » dans la barre du haut
    const topButtons = root.querySelector('.hud-interactive button[title="Options de Table & Blindes"]');
    if (topButtons && topButtons.parentElement && !$('pmSalonsBtn')) {
      const b = document.createElement('button');
      b.id = 'pmSalonsBtn';
      b.title = 'Salons & tables';
      b.className = 'px-2.5 sm:px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold transition flex items-center gap-1 shadow-md';
      b.innerHTML = '<span>🌐</span> <span class="hidden sm:inline">Salons</span>';
      b.onclick = () => PM.openLobbyFromTable();
      topButtons.parentElement.insertBefore(b, topButtons);
    }
    // bouton de changement de vue (PC) : 3e personne / 1re personne (touche V)
    if (topButtons && topButtons.parentElement && !$('pokerViewBtn')) {
      const v = document.createElement('button');
      v.id = 'pokerViewBtn';
      v.title = 'Changer de vue (V) — clic maintenu + glisser pour regarder autour';
      v.className = 'hidden md:flex px-2.5 sm:px-3 py-1.5 rounded-full bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-bold transition items-center gap-1 shadow-md';
      v.innerHTML = '<span>👁️</span> <span class="pv-label">3e pers.</span>';
      v.onclick = () => window.pokerExp && window.pokerExp.toggleViewMode();
      topButtons.parentElement.insertBefore(v, topButtons);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* CONTRÔLEUR                                                              */
  /* ----------------------------------------------------------------------- */
  const PM = {
    mode: 'none',            // none | lobby | solo | multi
    exp: null,
    game: null,
    tableId: null,
    tableMeta: null,
    pollTimer: null,
    tickTimer: null,
    lastSeq: -1,
    skew: 0,
    failures: 0,
    inflight: false,
    pending: null,           // { tableId, name, min, max, create }
    soloFormat: '6max',
    soloBlind: 100,
    lobbyTables: [],
    code: '',
    lobbyView: 'home',       // home | solo | 1v1 | 4max | 6max
    lastView: null,
    leaving: false,

    /* ----- ouverture de la salle ----- */
    async open() {
      const wi = this.worldIntent; this.worldIntent = null;   // vient de la salle de poker 3D ? { tableId, seat } ou { solo }
      buildDom();
      try { if (typeof refreshWallet === 'function') refreshWallet(); } catch (e) {} // jetons éventuellement rendus par le serveur
      if (!this.ensureExp()) return;
      this.hideSoloOnlyUi(false);
      if (this.mode === 'solo') { this.exp.resume(); return; }
      if (this.mode === 'multi' && this.tableId) { this.exp.resume(); this.startPolling(); return; }
      this.fromWorld = !!(wi && wi.tableId);
      this.lobbyView = wi && wi.solo ? 'solo' : 'home';
      if (this.fromWorld) { await this.openFromWorld(wi); return; }
      this.showLobby();
      try {
        const data = await api('GET', Object.assign({}, { user: base().username, device: deviceId() }));
        if (data.pendingCashout > 0) await this.claim(true);
        if (data.mySeat && !this.leaving) {
          // on était déjà assis (rechargement de la page) : reprise directe
          this.enterMulti(data.mySeat.tableId, null);
          return;
        }
        this.lobbyTables = data.tables || [];
        this.renderLobby();
        if (this.inviteTable) await this.handleInvite();
      } catch (e) {
        this.lobbyError(e);
        this.renderLobby();
      }
      this.startLobbyPolling();
    },

    // chaise choisie dans la salle 3D : on saute le lobby et on demande directement la mise de départ
    async openFromWorld(wi) {
      this.mode = 'lobby';
      this.hideLobby();
      try {
        const data = await api('GET', { user: base().username, device: deviceId() });
        if (data.pendingCashout > 0) await this.claim(true);
        if (data.mySeat && !this.leaving) { this.enterMulti(data.mySeat.tableId, null); return; }
        this.lobbyTables = data.tables || [];
        const t = this.lobbyTables.find((x) => x.id === wi.tableId);
        if (!t || t.count >= t.maxSeats || (wi.seat != null && t.players.some((p) => p && p.seat === wi.seat))) { toast('Cette place vient d’être prise.'); this.backToWorld(); return; }
        this.openBuyIn({ tableId: t.id, name: fullName(t), min: t.minBuyIn, max: t.maxBuyIn, bb: t.bigBlind, create: null, seat: wi.seat });
      } catch (e) {
        toast('Connexion au serveur impossible.');
        this.backToWorld();
      }
    },

    // retour debout dans la salle de poker 3D (PC)
    backToWorld() {
      this.fromWorld = false;
      this.stopPolling();
      this.hideLobby();
      const b = $('pmBuyIn');
      if (b) b.classList.add('hidden');
      this.pending = null;
      this.mode = 'none';
      this.tableId = null;
      this.lastView = null;
      this.leaving = false;
      this.game = null;
      if (this.exp) { this.exp.game = this.exp.soloGame; window.pokerGame = this.exp.soloGame; try { this.exp.pause(); } catch (e) {} }
      const bar = $('pmBar');
      if (bar) bar.classList.add('hidden');
      const banner = $('winnerBannerModal');
      if (banner) banner.classList.add('hidden');
      window.__f3dPlace = 'pokerroom';
      if (typeof switchRoom === 'function') switchRoom('world3d');
    },

    ensureExp() {
      if (this.exp && window.pokerExp === this.exp) return this.exp;
      let exp = window.pokerExp;
      if (!exp) {
        const container = $('poker3dContainer');
        if (!container || typeof Poker3DExperience === 'undefined') return null;
        exp = new Poker3DExperience(container, { autoStart: false });
        window.pokerExp = exp;
        window.pokerGame = exp.game;
      }
      this.exp = exp;
      this.game = null;
      return exp;
    },

    hideSoloOnlyUi(isMulti) {
      const tableBtn = document.querySelector('button[title="Options de Table & Blindes"]');
      if (tableBtn) tableBtn.style.display = isMulti ? 'none' : '';
      const nextBtn = $('btnNextHand');
      if (nextBtn && nextBtn.parentElement) nextBtn.parentElement.style.display = isMulti ? 'none' : '';
      const stackEl = $('playerTotalStack');
      if (stackEl && stackEl.previousElementSibling) stackEl.previousElementSibling.textContent = isMulti ? 'Jetons' : 'Solde';
    },

    /* ----- lobby ----- */
    showLobby() {
      this.mode = this.mode === 'multi' ? 'multi' : 'lobby';
      const lobby = $('pmLobby');
      if (lobby) lobby.classList.remove('hidden');
      if (this.exp && this.mode === 'lobby') { try { this.exp.pause(); } catch (e) {} }
      const bal = $('pmLobbyBalance');
      if (bal) bal.textContent = money(getBalance());
      const bar = $('pmBar');
      if (bar && this.mode !== 'multi') bar.classList.add('hidden');
    },

    hideLobby() {
      this.stopLobbyPolling();
      const lobby = $('pmLobby');
      if (lobby) lobby.classList.add('hidden');
    },

    lobbyError(e) {
      const box = $('pmLobbyMsg');
      if (!box) return;
      if (e instanceof LegacyServerError) {
        box.textContent = '⚠️ Le serveur local est une ancienne version : le multijoueur nécessite le nouveau serveur (voir le README : « node serveur-local.mjs ») ou le site en ligne. Le mode solo reste disponible.';
      } else {
        box.textContent = '⚠️ Connexion au serveur impossible pour le moment. Le mode solo reste disponible.';
      }
      box.classList.remove('hidden');
    },

    startLobbyPolling() {
      this.stopLobbyPolling();
      const loop = async () => {
        if (this.mode !== 'lobby') return;
        try {
          const data = await api('GET', { user: base().username, device: deviceId() });
          this.lobbyTables = data.tables || [];
          const box = $('pmLobbyMsg');
          if (box) box.classList.add('hidden');
          this.renderLobby();
        } catch (e) { this.lobbyError(e); }
        this.lobbyTimer = setTimeout(loop, LOBBY_POLL_MS);
      };
      this.lobbyTimer = setTimeout(loop, LOBBY_POLL_MS);
    },

    stopLobbyPolling() {
      if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
      this.lobbyTimer = null;
    },

    renderLobby() {
      const body = $('pmLobbyBody');
      if (!body) return;
      const bal = $('pmLobbyBalance');
      if (bal) bal.textContent = money(getBalance());

      const FORMATS = {
        '1v1': { icon: '⚔️', title: 'Duel', sub: '2 joueurs' },
        '4max': { icon: '👥', title: 'Table de 4', sub: '4 joueurs' },
        '6max': { icon: '👑', title: 'Table de 6', sub: '6 joueurs' }
      };
      const statusLabel = { waiting: 'En attente', countdown: 'Départ imminent', playing: 'Main en cours', showdown: 'Abattage' };
      const tables = this.lobbyTables || [];
      const view = this.lobbyView;
      const seg = (arr, cur, fn) => arr.map(([v, label]) => `<button class="pm-seg ${v === cur ? 'on' : ''}" onclick="${fn}(${typeof v === 'string' ? `'${v}'` : v})">${label}</button>`).join('');
      const backBtn = '<button onclick="PokerMulti.setLobbyView(\'home\')" class="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold">← Retour</button>';

      // suspension d'une partie solo
      let suspendedHtml = '';
      if (this.soloSuspended && this.exp && this.exp.soloGame) {
        const g = this.exp.soloGame;
        const engaged = g.players[0] ? (g.players[0].handTotal || 0) : 0;
        const inHand = g.phase !== 'showdown' && g.phase !== 'finished';
        suspendedHtml = `<div class="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] text-amber-100">
          Ta partie solo est en pause${inHand && engaged > 0 ? ` (mises engagées : <b>${money(engaged)}</b> — perdues si tu ne reprends pas la main)` : ''}.
          <button onclick="PokerMulti.resumeSolo()" class="mt-2 w-full py-2 rounded-lg bg-amber-500 text-black font-black text-xs uppercase tracking-wide">↩ Reprendre la partie</button></div>`;
      }

      if (view === 'solo') {
        body.innerHTML = `
          <div class="max-w-xl mx-auto space-y-4">
            <div class="flex items-center gap-3">${backBtn}<div class="font-black text-white text-sm uppercase tracking-wide">🤖 Seul contre les bots</div></div>
            <div class="pm-card p-4 space-y-3">
              <div class="text-[11px] text-stone-400">Ta mise de départ est ton solde complet, comme avant.</div>
              <div class="grid grid-cols-3 gap-2">${seg([['1v1', '⚔️ Duel'], ['4max', '👥 Table de 4'], ['6max', '👑 6-Max']], this.soloFormat, 'PokerMulti.setSoloFormat')}</div>
              <div class="grid grid-cols-3 gap-2">${seg([[100, 'Blindes 50/100'], [500, '250/500'], [1000, '500/1 000']], this.soloBlind, 'PokerMulti.setSoloBlind')}</div>
              ${suspendedHtml}
              <button onclick="PokerMulti.startSolo()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 hover:brightness-110 font-black text-black text-xs uppercase tracking-wider shadow">${this.soloSuspended ? 'Nouvelle partie solo' : 'Lancer la partie solo'}</button>
            </div>
          </div>`;
        return;
      }

      if (FORMATS[view]) {
        const f = FORMATS[view];
        const list = tables.filter((t) => t.category === view);
        const card = (t) => {
          const seats = [];
          for (let i = 0; i < t.maxSeats; i++) {
            const p = t.players[i];
            seats.push(p ? `<span class="pm-chip" title="${esc(p.username)}">${esc(p.avatar)}</span>` : '<span class="pm-chip empty">·</span>');
          }
          const full = t.count >= t.maxSeats;
          const canAfford = getBalance() >= t.minBuyIn;
          const off = full || !canAfford;
          return `<div class="pm-card p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="font-black text-white text-sm leading-tight">${esc(t.name)}</div>
              <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${t.status === 'waiting' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/15 text-amber-300 border border-amber-400/30'}">${statusLabel[t.status] || ''}</span>
            </div>
            <div class="flex items-center gap-1 flex-wrap">${seats.join('')}<span class="ml-1 text-[11px] text-stone-400">${t.count}/${t.maxSeats}</span></div>
            <button ${off ? 'disabled' : ''} onclick="PokerMulti.askJoin('${t.id}')" class="mt-auto py-2 rounded-xl font-black text-xs uppercase tracking-wide ${off ? 'bg-stone-800 text-stone-500 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:brightness-110 shadow'}">${full ? 'Salon complet' : (!canAfford ? 'Solde insuffisant' : 'Rejoindre')}</button>
          </div>`;
        };
        const ref = list[0];
        body.innerHTML = `
          <div class="space-y-4">
            <div class="flex items-center gap-3">${backBtn}<div class="font-black text-white text-sm uppercase tracking-wide">${f.icon} ${f.title}</div></div>
            ${ref ? `<div class="text-[11px] text-stone-400">Blindes <b class="text-amber-300">${ref.smallBlind.toLocaleString('fr-FR')}/${ref.bigBlind.toLocaleString('fr-FR')} €</b> · Mise de départ ${ref.minBuyIn.toLocaleString('fr-FR')} – ${ref.maxBuyIn.toLocaleString('fr-FR')} €</div>` : ''}
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${list.map(card).join('') || '<div class="text-stone-400 text-sm">Chargement des salons…</div>'}</div>
          </div>`;
        return;
      }

      // accueil : choix du type de salon
      const tile = (key, icon, title, sub, extra) => `<button class="pm-card pm-tile p-4 flex flex-col gap-1" onclick="PokerMulti.setLobbyView('${key}')">
          <span class="text-3xl">${icon}</span>
          <span class="font-black text-white text-sm uppercase tracking-wide">${title}</span>
          <span class="text-[11px] text-stone-400">${sub}</span>
          ${extra ? `<span class="text-[11px] font-bold text-emerald-300">${extra}</span>` : ''}
        </button>`;
      const online = (cat) => tables.filter((t) => t.category === cat).reduce((n, t) => n + (t.count || 0), 0);
      const onl = (cat) => { const n = online(cat); return n ? `${n} joueur${n > 1 ? 's' : ''} en ligne` : 'Aucun joueur pour l\'instant'; };
      body.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="text-[11px] font-black tracking-widest text-amber-400/90 uppercase">Choisis ton type de salon</div>
          ${suspendedHtml}
          <div class="grid grid-cols-2 gap-3">
            ${tile('1v1', '⚔️', 'Duel', '2 joueurs', onl('1v1'))}
            ${tile('4max', '👥', 'Table de 4', '4 joueurs', onl('4max'))}
            ${tile('6max', '👑', 'Table de 6', '6 joueurs', onl('6max'))}
            ${tile('solo', '🤖', 'Seul contre les bots', 'Sans attendre personne', '')}
          </div>
        </div>`;
    },

    setLobbyView(v) { this.lobbyView = v; this.renderLobby(); const sc = document.querySelector('#pmLobby .pm-scroll'); if (sc) sc.scrollTop = 0; },

    setSoloFormat(f) { this.soloFormat = f; this.renderLobby(); },
    setSoloBlind(b) { this.soloBlind = b; this.renderLobby(); },

    openRules() { if (typeof openPokerRulesModal === 'function') openPokerRulesModal(); },

    /* ----- solo ----- */
    startSolo() {
      if (!this.ensureExp()) return;
      this.soloSuspended = false;
      this.stopPolling();
      this.hideLobby();
      const exp = this.exp;
      exp.game = exp.soloGame;
      window.pokerGame = exp.soloGame;
      const g = exp.soloGame;
      g.players.forEach((p) => { p.empty = false; p.noCards = false; });
      this.mode = 'solo';
      this.tableId = null;
      this.hideSoloOnlyUi(false);
      const bar = $('pmBar');
      if (bar) bar.classList.add('hidden');
      const banner = $('winnerBannerModal');
      if (banner) banner.classList.add('hidden');

      g.bigBlind = this.soloBlind;
      g.smallBlind = Math.floor(this.soloBlind / 2);
      exp.resume();
      exp.tableFormat = this.soloFormat;
      exp.applyFormat(this.soloFormat);
      g.setTableFormat(this.soloFormat); // distribue une nouvelle main

      const tag = $('headerTableFormatTag');
      if (tag) tag.textContent = this.soloFormat === '1v1' ? '1v1 (Duel)' : (this.soloFormat === '4max' ? 'Table de 4' : '6-Max');
      const blindTag = $('headerBlindTag');
      if (blindTag) blindTag.textContent = `${Math.floor(this.soloBlind / 2)}/${this.soloBlind} €`;
      ['1v1', '4max', '6max'].forEach((f) => {
        const b = $('btnFormat' + f);
        if (b) b.className = f === this.soloFormat
          ? 'py-2.5 px-1.5 rounded-xl border border-amber-400 bg-amber-500/20 font-black text-xs text-amber-300 transition flex flex-col items-center shadow-md'
          : 'py-2.5 px-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-bold text-xs text-stone-300 transition flex flex-col items-center';
      });
      [100, 500, 1000].forEach((l) => {
        const b = $('btnBlind' + l);
        if (b) b.className = l === this.soloBlind
          ? 'py-2 px-1 rounded-xl border border-amber-400 bg-amber-500/20 font-black text-xs text-amber-300 transition shadow-md'
          : 'py-2 px-1 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 font-bold text-xs text-stone-300 transition';
      });
    },

    /* ----- rejoindre une table ----- */
    askJoin(tableId) {
      const t = (this.lobbyTables || []).find((x) => x.id === tableId);
      if (!t) return;
      this.openBuyIn({ tableId, name: fullName(t), min: t.minBuyIn, max: t.maxBuyIn, bb: t.bigBlind, create: null });
    },


    openBuyIn(info) {
      this.pending = info;
      const bal = getBalance();
      const max = Math.min(info.max, bal);
      const min = info.min;
      $('pmBuyInTitle').textContent = info.name;
      $('pmBuyInInfo').innerHTML = `Blindes ${(info.bb / 2).toLocaleString('fr-FR')}/${info.bb.toLocaleString('fr-FR')} € · Départ ${min.toLocaleString('fr-FR')} – ${info.max.toLocaleString('fr-FR')} € · Ton solde : <b class="text-amber-300">${money(bal)}</b>`;
      const err = $('pmBuyInErr');
      const go = $('pmBuyInGo');
      const input = $('pmBuyInInput');
      const range = $('pmBuyInRange');
      if (max < min) {
        err.textContent = `Solde insuffisant : il faut au moins ${money(min)} pour cette table.`;
        err.classList.remove('hidden');
        go.disabled = true;
        go.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        err.classList.add('hidden');
        go.disabled = false;
        go.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      const step = Math.max(1, Math.floor(info.bb / 2));
      input.min = range.min = String(min);
      input.max = range.max = String(Math.max(min, max));
      range.step = String(step);
      const def = Math.min(Math.max(min, info.bb * 50), Math.max(min, max));
      input.value = range.value = String(def);
      input.oninput = () => { range.value = input.value; };
      range.oninput = () => { input.value = range.value; };
      $('pmBuyIn').classList.remove('hidden');
    },

    quickBuyIn(ratio) {
      const input = $('pmBuyInInput');
      const range = $('pmBuyInRange');
      const min = parseInt(range.min, 10);
      const max = parseInt(range.max, 10);
      const v = Math.round(min + (max - min) * ratio);
      input.value = range.value = String(v);
    },

    closeBuyIn() {
      $('pmBuyIn').classList.add('hidden');
      this.pending = null;
    },

    // croix de la fenêtre : si on venait de la salle 3D, on y retourne
    cancelBuyIn() {
      this.closeBuyIn();
      if (this.fromWorld && this.mode === 'lobby') this.backToWorld();
    },

    async confirmBuyIn() {
      const info = this.pending;
      if (!info) return;
      const err = $('pmBuyInErr');
      const amount = Math.floor(Number($('pmBuyInInput').value));
      const bal = getBalance();
      const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
      if (!Number.isFinite(amount) || amount < info.min) return fail(`Mise minimum : ${money(info.min)}.`);
      if (amount > info.max) return fail(`Mise maximum : ${money(info.max)}.`);
      if (amount > bal) return fail('Solde insuffisant.');
      const go = $('pmBuyInGo');
      go.disabled = true;
      try {
        const payload = Object.assign(base(), { action: 'join', tableId: info.tableId, buyIn: amount });
        if (info.create) Object.assign(payload, { create: true, maxSeats: info.create.maxSeats, bigBlind: info.create.bigBlind });
        if (info.seat != null) payload.seat = info.seat;
        const data = await api('POST', payload);
        if (!data.ok) { go.disabled = false; return fail(data.error || 'Impossible de rejoindre.'); }
        if (data.joined) addBalance(-amount); // les jetons sont maintenant à la table
        this.closeBuyIn();
        this.enterMulti(info.tableId, data);
      } catch (e) {
        go.disabled = false;
        fail(e instanceof LegacyServerError ? 'Serveur local obsolète : lance « node serveur-local.mjs » ou utilise le site en ligne.' : 'Connexion au serveur impossible. Réessaie.');
      }
    },

    /* ----- partie en ligne ----- */
    enterMulti(tableId, firstData) {
      if (!this.ensureExp()) return;
      this.stopLobbyPolling();
      this.hideLobby();
      const exp = this.exp;
      if (!(exp.game instanceof MultiGame)) {
        const g = new MultiGame(exp, this);
        exp.game = g;
      }
      window.pokerGame = exp.game;
      this.game = exp.game;
      this.mode = 'multi';
      this.tableId = tableId;
      this.leaving = false;
      this.lastSeq = -1;
      this.lastAcceptedAt = 0;
      this.noSeatStreak = 0;
      this.failures = 0;
      this.soloSuspended = false;
      this.hideSoloOnlyUi(true);
      exp.resume();
      const banner = $('winnerBannerModal');
      if (banner) banner.classList.add('hidden');
      const bar = $('pmBar');
      if (bar) bar.classList.remove('hidden');
      if (firstData && firstData.table) this.onData(firstData);
      this.startPolling();
      this.startTick();
    },

    startPolling() {
      this.stopPolling();
      const loop = async () => {
        if (this.mode !== 'multi' || !this.tableId) return;
        try {
          const data = await api('GET', { table: this.tableId, user: base().username, device: deviceId() });
          this.failures = 0;
          this.onData(data);
        } catch (e) {
          this.failures++;
          if (e instanceof LegacyServerError) { this.handleKicked('Serveur incompatible.'); return; }
          if (this.failures === 4) {
            const an = $('pmAnnounce');
            if (an) an.textContent = '📡 Connexion au serveur perdue… nouvelle tentative';
          }
        }
        this.pollTimer = setTimeout(loop, document.hidden ? 2500 : POLL_MS);
      };
      this.pollTimer = setTimeout(loop, 50);
    },

    stopPolling() {
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = null;
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = null;
    },

    startTick() {
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = setInterval(() => this.renderTimer(), 400);
    },

    onData(data) {
      if (this.mode !== 'multi') return;
      const view = data.table;
      if (!view || view.tableId !== this.tableId) {
        this.handleKicked('La table n\'existe plus.');
        return;
      }
      const nowMs = Date.now();
      // réponse périmée d'une autre instance du serveur : on l'ignore (sauf si elle dure)
      if (view.seq < this.lastSeq && nowMs - (this.lastAcceptedAt || 0) < 5000) return;

      if (!view.me) {
        // plus de siège ? on attend 3 réponses d'affilée avant de conclure (évite les faux positifs)
        this.noSeatStreak = (this.noSeatStreak || 0) + 1;
        if (this.noSeatStreak < 3) return;
      } else {
        this.noSeatStreak = 0;
      }
      this.lastAcceptedAt = nowMs;
      this.lastSeq = view.seq;
      this.skew = (data.serverTime || Date.now()) - Date.now();
      this.lastView = view;
      this.tableMeta = view;

      if (!view.me) {
        // plus de siège : éjecté, ruiné, déconnecté…
        const why = view.removedMe ? view.removedMe.reason : 'leave';
        const msg = why === 'bust' ? '💸 Tu n\'as plus de jetons : tu quittes la table.'
          : why === 'afk' ? '⏱️ Tu as été retiré de la table (inactivité).'
          : why === 'timeout' ? '📡 Tu as été déconnecté de la table.'
          : 'Tu as quitté la table.';
        this.handleKicked(msg);
        return;
      }
      this.game.apply(view);
      this.renderBar(view);
    },

    renderBar(view) {
      const me = view.me;
      const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
      set('pmTableName', fullName(view));
      set('pmAnnounce', view.announcement || '');
      const tag = $('headerTableFormatTag');
      if (tag) tag.textContent = (view.maxSeats === 2 ? '1v1 (Duel)' : `${view.maxSeats}-Max`);
      const bt = $('headerBlindTag');
      if (bt) bt.textContent = `${view.smallBlind.toLocaleString('fr-FR')}/${view.bigBlind.toLocaleString('fr-FR')} €`;

      const box = $('pmReadyBox');
      const ready = $('pmReadyBtn');
      const hint = $('pmReadyHint');
      if (box && ready) {
        const seated = view.seats.filter(Boolean);
        const readyCount = seated.filter((x) => x.ready).length;
        box.classList.toggle('show', view.status === 'waiting');
        if (seated.length < 2) {
          ready.disabled = true; ready.classList.remove('pm-pulse');
          ready.textContent = '⏳ En attente d\'un joueur';
          if (hint) hint.textContent = 'Partage le salon à tes amis pour qu\'ils te rejoignent.';
        } else if (!me.ready) {
          ready.disabled = false; ready.classList.add('pm-pulse');
          ready.textContent = '👍 Je suis prêt';
          if (hint) hint.textContent = `${readyCount}/${seated.length} joueurs prêts`;
        } else {
          ready.disabled = true; ready.classList.remove('pm-pulse');
          ready.textContent = '✓ Tu es prêt';
          if (hint) hint.textContent = `${readyCount}/${seated.length} joueurs prêts — la partie démarre quand tout le monde est prêt`;
        }
      }
      this.renderTimer();
    },

    renderTimer() {
      const view = this.lastView;
      const el = $('pmTimer');
      if (!view || !el) return;
      const now = Date.now() + this.skew;
      let txt = '';
      if (view.status === 'playing' && view.turnEndsAt) {
        const left = Math.max(0, Math.ceil((view.turnEndsAt - now) / 1000));
        txt = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        el.className = 'font-mono text-xs font-black whitespace-nowrap ' + (left <= 15 ? 'text-rose-400' : 'text-sky-300');
      } else if (view.status === 'countdown') {
        txt = `Donne ${Math.max(0, Math.ceil((view.countdownEndsAt - now) / 1000))}s`;
        el.className = 'font-mono text-xs font-black text-amber-300 whitespace-nowrap';
      } else if (view.status === 'showdown') {
        const s = Math.max(0, Math.ceil((view.nextHandAt - now) / 1000));
        txt = `Suite ${s}s`;
        const cd = $('nextHandCountdown');
        if (cd) cd.textContent = `(${s}s)`;
        el.className = 'font-mono text-xs font-black text-amber-300 whitespace-nowrap';
      }
      el.textContent = txt;
    },

    /* ----- actions ----- */
    async sendAction(action, amount) {
      if (this.mode !== 'multi' || !this.tableId) return;
      try {
        const payload = Object.assign(base(), { action, tableId: this.tableId });
        if (amount != null) payload.amount = amount;
        const data = await api('POST', payload);
        if (!data.ok && data.error) toast('⚠️ ' + data.error);
        this.onData(data);
      } catch (e) {
        toast('📡 Action non envoyée, réessaie.');
      }
    },

    async ready() {
      await this.sendAction('ready');
    },

    async leave() {
      if (this.mode !== 'multi' || !this.tableId || this.leaving) return;
      this.leaving = true;
      const tableId = this.tableId;
      let cashout = 0;
      try {
        const data = await api('POST', Object.assign(base(), { action: 'leave', tableId }));
        cashout = data.cashout || 0;
      } catch (e) {
        toast('📡 Serveur injoignable : tes jetons te seront rendus automatiquement.');
      }
      if (cashout > 0) {
        addBalance(cashout);
        toast(`💰 ${money(cashout)} rendus sur ton solde.`);
      }
      this.backToLobby();
    },

    // le serveur nous a retirés de la table
    async handleKicked(msg) {
      if (this.mode !== 'multi') return;
      toast(msg);
      await this.claim(true);
      this.backToLobby();
    },

    backToLobby() {
      this.stopPolling();
      this.mode = 'lobby';
      this.tableId = null;
      this.lastView = null;
      this.leaving = false;
      const exp = this.exp;
      if (exp) {
        exp.game = exp.soloGame;
        window.pokerGame = exp.soloGame;
        try { exp.pause(); } catch (e) {}
      }
      this.game = null;
      this.hideSoloOnlyUi(false);
      const bar = $('pmBar');
      if (bar) bar.classList.add('hidden');
      const banner = $('winnerBannerModal');
      if (banner) banner.classList.add('hidden');
      if (this.fromWorld && window.F3D && F3D.canWorld()) { this.backToWorld(); return; }
      this.showLobby();
      this.renderLobby();
      this.startLobbyPolling();
    },

    openLobbyFromTable() {
      if (this.mode === 'multi') {
        this.leave();
      } else if (this.mode === 'solo') {
        // depuis le solo : retour au lobby (la main en cours est suspendue)
        this.soloSuspended = true;
        this.mode = 'lobby';
        this.showLobby();
        this.renderLobby();
        this.startLobbyPolling();
      } else {
        this.showLobby();
      }
    },

    resumeSolo() {
      if (!this.ensureExp()) return;
      this.stopLobbyPolling();
      this.hideLobby();
      this.mode = 'solo';
      this.soloSuspended = false;
      this.hideSoloOnlyUi(false);
      this.exp.resume();
    },

    /* ----- invitations d'amis ----- */
    invitePayload() {
      if (this.mode !== 'multi' || !this.tableId || !this.lastView) return null;
      const v = this.lastView;
      return { tableId: this.tableId, name: fullName(v), isPrivate: false, code: '' };
    },

    async joinFromInvite(tableId) {
      if (!tableId) return;
      this.inviteTable = String(tableId).toLowerCase();
      if (this.mode === 'multi' && this.tableId === this.inviteTable) { this.inviteTable = null; return; }
      if (this.mode === 'multi') { await this.leave(); }
      if (this.mode === 'lobby' && (this.lobbyTables || []).length) await this.handleInvite();
    },

    async handleInvite() {
      const id = this.inviteTable;
      this.inviteTable = null;
      if (!id) return;
      const known = (this.lobbyTables || []).find((t) => t.id === id);
      if (known) { this.askJoin(id); return; }
    },

    async claim(silent) {
      try {
        const data = await api('POST', Object.assign(base(), { action: 'claim' }));
        if (data.cashout > 0) {
          addBalance(data.cashout);
          if (!silent) toast(`💰 ${money(data.cashout)} récupérés de ta dernière table.`);
          else toast(`💰 ${money(data.cashout)} rendus sur ton solde.`);
        }
      } catch (e) { /* réessayé à la prochaine ouverture */ }
    },

    /* ----- sortie de la salle de poker (changement de jeu / fermeture) ----- */
    onLeaveRoom() {
      this.stopLobbyPolling();
      if (this.mode === 'multi' && this.tableId) {
        const payload = JSON.stringify(Object.assign(base(), { action: 'leave', tableId: this.tableId, beacon: true }));
        let sent = false;
        try {
          if (navigator.sendBeacon) sent = navigator.sendBeacon(apiUrl(), new Blob([payload], { type: 'application/json' }));
        } catch (e) {}
        if (!sent) {
          try { fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {}); } catch (e) {}
        }
        this.stopPolling();
        this.mode = 'none';
        this.tableId = null;
        this.lastView = null;
        if (this.exp) { this.exp.game = this.exp.soloGame; window.pokerGame = this.exp.soloGame; }
        this.game = null;
        // l'argent est récupéré (réclamé) à la prochaine ouverture du poker
      } else if (this.mode === 'lobby') {
        this.mode = 'none';
      }
    }
  };

  window.addEventListener('pagehide', () => {
    if (PM.mode === 'multi') PM.onLeaveRoom();
  });

  // Interface publique
  window.PokerMulti = PM;
  window.PokerMultiInternals = { MultiGame, api, deviceId };
})();
