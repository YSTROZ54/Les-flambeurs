    /* ================= BLACKJACK (SOLO DIRECT VS CROUPIER & LOBBY MULTI SYNCHRONISÉ) ================= */
    let bj = {
      turn: 'player', // 'player' | 'friend'
      active: false,
      cooldownRemaining: 0,
      deck: [],
      player: [],
      dealer: [],
      coPlayer: [],
      coPlayerName: 'Roxy (Bot)',
      bet: 0
    };

    let bjSyncTable = {
      tableId: 'public',
      roundId: 0,
      status: 'waiting', // 'waiting', 'playing', 'dealer_turn', 'finished'
      dealer: { cards: [], score: 0, hidden: true },
      players: {},
      playerOrder: [],
      turn: null,
      forfeit: null,
      updatedAt: 0
    };
    let myProcessedBjRoundId = null;
    let isBjSyncing = false;

    function getBjApiUrl() {
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        return 'http://localhost:8080/api/blackjack';
      }
      return '/api/blackjack';
    }

    function getBjCurrentTableId() {
      if (!lobbies.bj?.publicTableId) return null;
      return (lobbies.bj.publicTableId || 'bj_pub_1').toLowerCase().trim();
    }

    function setBjGameMode(m) {
      if (bj.active) return showToast('Termine d\'abord la main de Blackjack en cours !');
      if (lobbies.bj.mode === 'multi' && m === 'solo') {
        try { handlePlayerLeavingGame('blackjack'); } catch (e) {}
      }
      lobbies.bj.mode = m;
      if (m === 'multi') {
        // Le joueur choisit librement sa table parmi les 5 salons : aucune attribution automatique !
        lobbies.bj.publicTableId = null;
        if (!state.currentTable) state.currentTable = {};
        state.currentTable.leftTable = true;
        state.currentTable.publicTableId = null;
        state.currentTable.game = 'blackjack';
        state.currentTable.mode = 'multi';
      } else {
        lobbies.bj.publicTableId = null;
        if (state.currentTable) {
          state.currentTable.leftTable = true;
          state.currentTable.publicTableId = null;
        }
      }
      updateCurrentTable('blackjack');
      updateLobbyUI('bj');
      renderBlackjack();
      showToast(m === 'solo' ? '🤖 Blackjack : Solo direct contre le Croupier' : '🌐 Blackjack Multijoueur : Choisis ta table pour t\'asseoir');
      if (m === 'multi') {
        try { onBjBetChange(); } catch (e) {}
      }
    }

    function getBjTableOccupants(targetTableId) {
      const normTarget = (targetTableId || 'bj_pub_1').toLowerCase().trim();
      const db = getAccountsDB();
      const now = Date.now();
      const PRESENCE_TIMEOUT_MS = 25000;
      const occupants = [];
      const seen = new Set();
      const me = (state.username || '').toLowerCase().trim();

      // 1. Joueur courant
      if (lobbies.bj && lobbies.bj.mode === 'multi') {
        const myCurrentTableId = (lobbies.bj.publicTableId || '').toLowerCase().trim();
        const isLeft = state.currentTable?.leftTable === true || !lobbies.bj.publicTableId;
        if (!isLeft && myCurrentTableId === normTarget && me) {
          seen.add(me);
          occupants.push({
            username: state.username,
            avatar: state.avatarEmoji || '👤',
            isMe: true,
            updatedAt: now
          });
        }
      }

      // 2. Autres comptes dans la DB
      Object.values(db).forEach(acc => {
        if (!acc || !acc.username) return;
        const u = acc.username.toLowerCase().trim();
        if (seen.has(u)) return;

        const ct = acc.currentTable || acc.data?.currentTable;
        if (!ct || ct.leftTable) return;

        const accGame = (ct.game === 'bj' ? 'blackjack' : ct.game);
        if (accGame !== 'blackjack' || ct.mode !== 'multi') return;

        const ctTime = typeof ct.updatedAt === 'number' ? ct.updatedAt : (acc.updated_at ? new Date(acc.updated_at).getTime() : 0);
        if (ctTime > 0 && (now - ctTime > PRESENCE_TIMEOUT_MS)) return;

        const ctTableId = (ct.publicTableId || 'bj_pub_1').toLowerCase().trim();
        if (ctTableId === normTarget) {
          seen.add(u);
          occupants.push({
            username: acc.username,
            avatar: acc.avatarEmoji || acc.avatar || '👤',
            isMe: (u === me),
            updatedAt: ctTime
          });
        }
      });

      return {
        tableId: normTarget,
        players: occupants,
        count: Math.min(2, occupants.length),
        isFull: occupants.length >= 2,
        isUserHere: occupants.some(p => p.isMe)
      };
    }

    function renderBjPublicTablesBrowser() {
      const grid = document.getElementById('bjPublicTablesGrid');
      if (!grid) return;

      const isMulti = lobbies.bj?.mode === 'multi';
      if (!isMulti) return;

      const currentPubId = (lobbies.bj.publicTableId || '').toLowerCase().trim();
      const isSeated = !state.currentTable?.leftTable && Boolean(lobbies.bj.publicTableId);

      const newHtml = BJ_PUBLIC_TABLES.map(t => {
        const occ = getBjTableOccupants(t.id);
        const isCurrent = isSeated && (currentPubId === t.id.toLowerCase());
        const isFull = occ.isFull;

        // Badge Statut
        let statusBadge = '';
        if (occ.count === 0) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">🟢 0/2 Libre</span>`;
        } else if (occ.count === 1) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 animate-pulse">🟡 1/2 Libre</span>`;
        } else {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-400/40">🔴 2/2 Pleine</span>`;
        }

        // Sièges
        const p1 = occ.players[0] || null;
        const p2 = occ.players[1] || null;

        const seat1Html = p1
          ? `<div class="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-xs truncate">
               <span class="text-sm">${p1.avatar || '👤'}</span>
               <span class="font-bold text-stone-200 truncate">${p1.username}${p1.isMe ? ' (Toi)' : ''}</span>
             </div>`
          : `<div class="flex items-center justify-center gap-1 bg-white/[0.02] border border-dashed border-white/15 rounded-xl px-2 py-1 text-[11px] text-stone-500 italic">
               <span>➕ Place libre</span>
             </div>`;

        const seat2Html = p2
          ? `<div class="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-xs truncate">
               <span class="text-sm">${p2.avatar || '👤'}</span>
               <span class="font-bold text-stone-200 truncate">${p2.username}${p2.isMe ? ' (Toi)' : ''}</span>
             </div>`
          : `<div class="flex items-center justify-center gap-1 bg-white/[0.02] border border-dashed border-white/15 rounded-xl px-2 py-1 text-[11px] text-stone-500 italic">
               <span>➕ Place libre</span>
             </div>`;

        // Bouton d'action
        let actionBtn = '';
        if (isCurrent) {
          actionBtn = `
            <div class="flex items-center gap-1.5 w-full">
              <div class="flex-1 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-center font-black text-xs shadow-sm truncate">
                ✓ Assis ici
              </div>
              <button onclick="leaveBjCurrentTable()" title="Quitter cette table" class="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 text-xs font-bold transition">
                🚪
              </button>
            </div>
          `;
        } else if (isFull) {
          actionBtn = `
            <button disabled class="w-full py-2 rounded-xl bg-stone-900 border border-white/5 text-stone-500 text-xs font-bold cursor-not-allowed">
              🚫 Pleine (2/2)
            </button>
          `;
        } else {
          actionBtn = `
            <button onclick="joinBjPublicTable('${t.id}')" class="w-full py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold text-xs shadow-md transition active:scale-95">
              👉 S'asseoir à la table
            </button>
          `;
        }

        const cardBorder = isCurrent
          ? 'border-amber-400/80 bg-amber-500/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/50'
          : 'border-white/10 bg-black/50 hover:border-amber-500/30';

        return `
          <div class="rounded-2xl p-3 border ${cardBorder} flex flex-col justify-between gap-2.5 transition backdrop-blur-md">
            <div>
              <div class="flex items-center justify-between gap-1 mb-2">
                <span class="font-serif-title font-extrabold text-xs text-white truncate flex items-center gap-1.5">
                  <span class="text-base">${t.icon}</span> <span class="truncate font-black">${t.name}</span>
                </span>
                ${statusBadge}
              </div>
              <div class="space-y-1">
                ${seat1Html}
                ${seat2Html}
              </div>
            </div>
            <div>
              ${actionBtn}
            </div>
          </div>
        `;
      }).join('');

      // CRITIQUE : Ne remplacer innerHTML que si le contenu a réellement changé pour empêcher tout clignotement / flicker au hover !
      if (grid.innerHTML !== newHtml) {
        grid.innerHTML = newHtml;
      }
    }

    function joinBjPublicTable(targetTableId) {
      if (bj.active) return showToast('Termine d\'abord la main de Blackjack en cours !');
      const occ = getBjTableOccupants(targetTableId);
      const me = (state.username || '').toLowerCase().trim();
      const isAlreadyIn = occ.players.some(p => p.username.toLowerCase().trim() === me);

      if (!isAlreadyIn && occ.isFull) {
        return showToast('🚫 Cette table est déjà complète (2/2 joueurs). Choisis un autre salon libre !');
      }

      lobbies.bj.mode = 'multi';
      lobbies.bj.tableType = 'public';
      lobbies.bj.publicTableId = targetTableId;

      if (!state.currentTable) state.currentTable = {};
      state.currentTable.leftTable = false;
      state.currentTable.game = 'blackjack';
      state.currentTable.mode = 'multi';
      state.currentTable.tableType = 'public';
      state.currentTable.publicTableId = targetTableId;
      state.currentTable.updatedAt = Date.now();

      bjSyncTable = null;
      myBjReady = false;
      myProcessedBjRoundId = null;

      updateCurrentTable('blackjack');
      updateLobbyUI('bj');
      renderBlackjack();

      const tableObj = BJ_PUBLIC_TABLES.find(t => t.id === targetTableId);
      showToast(`🎰 Tu t'es assis à la ${tableObj?.name || 'table'} !`);
      syncBjMultiplayer();

      const betEl = document.getElementById('bjBetInput');
      if (betEl) betEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function leaveBjCurrentTable() {
      if (bj.active) {
        if (!confirm('Une partie est en cours. Si tu quittes maintenant, la partie sera déclarée forfait et l\'adversaire remportera la mise. Confirmer ?')) {
          return;
        }
      }

      const tableId = getBjCurrentTableId();
      if (tableId) {
        try {
          await fetch(getBjApiUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'leave',
              tableId: tableId,
              username: state.username
            })
          });
        } catch (e) {}
      }

      lobbies.bj.publicTableId = null;
      if (!state.currentTable) state.currentTable = {};
      state.currentTable.leftTable = true;
      state.currentTable.publicTableId = null;
      state.currentTable.game = null;
      state.currentTable.updatedAt = Date.now();
      saveState();
      pushRemoteAccount(state);

      bj.active = false;
      bj.player = [];
      bj.dealer = [];
      bjSyncTable = null;
      myBjReady = false;
      stopBjTurnTimer();
      document.getElementById('bjActionControls')?.classList.add('hidden');
      document.getElementById('bjReadyBtn')?.classList.add('hidden');
      document.getElementById('bjDealBtn')?.classList.add('hidden');

      updateLobbyUI('bj');
      renderBlackjack();
      showToast('🚪 Tu as quitté la table.');
    }

    function scrollToBjBrowser() {
      const el = document.getElementById('bjPublicTablesBrowser') || document.getElementById('bjLobbyBanner');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setBjTableType(t) {
      lobbies.bj.tableType = 'public';
      updateLobbyUI('bj');
    }

    /* ================= GESTION DU TEMPS LIMITE DE TOUR BLACKJACK (30S) ================= */
    let _bjTurnSecondsLeft = 30;
    let _bjTurnTimerInterval = null;

    function startBjTurnTimer() {
      stopBjTurnTimer();
      _bjTurnSecondsLeft = 30;
      updateBjTurnTimerUI();

      _bjTurnTimerInterval = setInterval(() => {
        _bjTurnSecondsLeft--;
        updateBjTurnTimerUI();

        if (_bjTurnSecondsLeft <= 0) {
          stopBjTurnTimer();
          showToast('⏰ Temps de tour écoulé (30s) ! Tu restes automatiquement.');
          bjStand(null, true);
        }
      }, 1000);
    }

    function stopBjTurnTimer() {
      if (_bjTurnTimerInterval) {
        clearInterval(_bjTurnTimerInterval);
        _bjTurnTimerInterval = null;
      }
    }

    function updateBjTurnTimerUI() {
      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      const playerBadge = document.getElementById('bjPlayerTurnBadge');
      const banner = document.getElementById('bjStatusBanner');

      const isMyActiveTurn = isMulti
        ? (bjSyncTable?.status === 'playing' && (bjSyncTable?.turn || '').toLowerCase().trim() === (state.username || '').toLowerCase().trim())
        : (bj.active && bj.turn === 'player');

      if (playerBadge && isMyActiveTurn) {
        const isUrgent = _bjTurnSecondsLeft <= 5;
        playerBadge.textContent = `🃏 TON TOUR (${_bjTurnSecondsLeft}s)`;
        playerBadge.className = isUrgent
          ? 'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500 text-white animate-bounce shadow-lg'
          : 'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-400 text-black animate-pulse';
        playerBadge.classList.remove('hidden');
      }

      if (banner && isMyActiveTurn) {
        const isUrgent = _bjTurnSecondsLeft <= 5;
        banner.innerHTML = `C'est ton tour (${state.username}) <span class="px-2 py-0.5 rounded-full ${isUrgent ? 'bg-rose-500 text-white font-extrabold animate-pulse' : 'bg-emerald-500/20 text-emerald-300 font-mono-num font-bold'} ml-1.5">${_bjTurnSecondsLeft}s</span> : Tirer, Rester ou Doubler.`;
      }
    }

    function setBjMode(m) {
      if (m === 'ai') setBjGameMode('solo');
      else setBjGameMode('multi');
    }

    function bjScore(h) {
      if (!Array.isArray(h)) return 0;
      let t = 0, a = 0;
      h.forEach(c => {
        if (!c) return;
        if (c.r === 'A') { a++; t += 11; }
        else if (['K','Q','J'].includes(c.r)) t += 10;
        else t += +c.r;
      });
      while (t > 21 && a > 0) { t -= 10; a--; }
      return t;
    }

    let _bjBetSyncDebounce = null;
    function onBjBetChange() {
      const inputEl = document.getElementById('bjBetInput');
      if (!inputEl) return;
      let val = parseInt(inputEl.value);
      if (isNaN(val) || val < 10) val = 10;
      if (val > 50000) val = 50000;
      inputEl.value = val;
      state.bjBet = val;
      if (!state.currentTable) state.currentTable = {};
      state.currentTable.bjBet = val;
      state.currentTable.updatedAt = Date.now();
      saveState();

      const myBetDisp = document.getElementById('bjMyBetDisplay');
      if (myBetDisp) myBetDisp.textContent = `(${fmt(val)} €)`;

      clearTimeout(_bjBetSyncDebounce);
      _bjBetSyncDebounce = setTimeout(() => {
        pushRemoteAccount(state);
        syncBjBetToServer(val);
        if (myBjReady) {
          syncBjReadyBet(val);
        }
      }, 200);
    }

    async function syncBjBetToServer(bet) {
      if (!lobbies.bj || lobbies.bj.mode !== 'multi') return;
      try {
        const tableId = getBjCurrentTableId();
        if (!tableId) return;
        const boundedBet = Math.min(50000, Math.max(10, bet));
        await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_bet',
            tableId: tableId,
            username: state.username,
            bet: boundedBet,
            host: state.currentTable?.host || (isBjHost() ? state.username : undefined)
          })
        });
      } catch (e) {}
    }

    function isBjHost() {
      if (!lobbies.bj || lobbies.bj.mode !== 'multi') return true;
      const realPlayers = getTableParticipants('blackjack');
      if (realPlayers.length === 0) return true;

      const designatedHost = (state.currentTable?.host || bjSyncTable?.host || '').toLowerCase().trim();
      const myKey = (state.username || '').toLowerCase().trim();

      if (designatedHost) {
        return designatedHost === myKey;
      }
      return true;
    }

    let myBjReady = false;

    async function toggleBjReady() {
      if (!lobbies.bj || lobbies.bj.mode !== 'multi') return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Connecte-toi pour jouer.');
        openAuthModal('login');
        return;
      }
      if (bj.cooldownRemaining > 0) return;

      const inputEl = document.getElementById('bjBetInput');
      let betVal = parseInt(inputEl?.value) || state.bjBet || 100;
      if (betVal < 10) betVal = 10;
      if (betVal > 50000) betVal = 50000;
      if (inputEl) inputEl.value = betVal;
      if (betVal > state.balance) {
        showToast('❌ Solde insuffisant pour cette mise !');
        return;
      }

      myBjReady = !myBjReady;
      state.bjBet = betVal;
      if (!state.currentTable) state.currentTable = {};
      state.currentTable.bjBet = betVal;
      saveState();

      const readyBtn = document.getElementById('bjReadyBtn');
      if (readyBtn) {
        if (myBjReady) {
          readyBtn.className = "w-full py-3.5 rounded-xl font-extrabold text-sm bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg transition active:scale-[0.98] animate-pulse";
          readyBtn.textContent = "✅ Prêt ! (En attente du joueur...)";
          showToast('👍 Tu es prêt ! Dès que le co-joueur est prêt, la partie démarre.');
        } else {
          readyBtn.className = "w-full py-3.5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-lg hover:brightness-110 active:scale-[0.98] transition";
          readyBtn.textContent = "👍 Prêt ?";
          showToast('⏸️ Tu as annulé ton statut prêt.');
        }
      }

      const tableId = getBjCurrentTableId();
      try {
        const res = await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_ready',
            tableId: tableId,
            username: state.username,
            avatar: state.avatarEmoji || '👤',
            bet: betVal,
            ready: myBjReady,
            host: state.currentTable?.host || bjSyncTable?.host
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.table) {
            mergeBjServerState(data.table);
          }
        }
      } catch (e) {}

      renderBlackjack();
      setTimeout(syncBjMultiplayer, 100);
      setTimeout(syncBjMultiplayer, 300);
    }

    async function syncBjReadyBet(bet) {
      if (!lobbies.bj || lobbies.bj.mode !== 'multi' || !myBjReady) return;
      const tableId = getBjCurrentTableId();
      try {
        await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_ready',
            tableId: tableId,
            username: state.username,
            avatar: state.avatarEmoji || '👤',
            bet: bet,
            ready: true,
            host: state.currentTable?.host || bjSyncTable?.host
          })
        });
      } catch (e) {}
    }

    function updateCardSlot(el, html) {
      if (!el) return;
      if (el.dataset.rawHtml !== html) {
        el.innerHTML = html;
        el.dataset.rawHtml = html;
      }
    }

    function renderBlackjack(hide = true) {
      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      const coBox = document.getElementById('bjCoPlayerBox');
      if (coBox) coBox.classList.toggle('hidden', !isMulti);

      const playerBox = document.getElementById('bjPlayerBox');
      const playerBadge = document.getElementById('bjPlayerTurnBadge');
      const coBadge = document.getElementById('bjCoTurnBadge');
      const dealerBox = document.getElementById('bjDealerBox');
      const dealerBadge = document.getElementById('bjDealerTurnBadge');
      const dealBtn = document.getElementById('bjDealBtn');
      const readyBtn = document.getElementById('bjReadyBtn');

      if (!isMulti) {
        // --- RENDU SOLO LOCAL (INCHANGÉ) ---
        if (readyBtn) readyBtn.classList.add('hidden');
        if (dealBtn) {
          dealBtn.classList.toggle('hidden', bj.active);
          dealBtn.disabled = (bj.cooldownRemaining > 0);
          if (bj.cooldownRemaining <= 0) {
            dealBtn.className = "w-full py-3.5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-amber-300 to-amber-500 text-black shadow-lg hover:brightness-110 active:scale-[0.98] transition";
            dealBtn.textContent = '🃏 Distribuer';
          }
        }

        // la carte cachée du croupier ne l'est que pendant la manche : une fois terminée, tout est visible
        hide = hide && bj.active;
        const pCardsHtml = bj.player.map(c => renderCardHTML(c, 'lg', false, 'blackjack')).join('');
        const dCardsHtml = bj.dealer.map((c, i) => renderCardHTML(c, 'lg', hide && i === 1, 'blackjack')).join('');
        updateCardSlot(document.getElementById('bjPlayerCards'), pCardsHtml);
        updateCardSlot(document.getElementById('bjDealerCards'), dCardsHtml);
        document.getElementById('bjPlayerScore').textContent = bjScore(bj.player);
        document.getElementById('bjDealerScore').textContent = hide && bj.dealer.length ? bjScore([bj.dealer[0]]) : bjScore(bj.dealer);

        const myBetDisp = document.getElementById('bjMyBetDisplay');
        if (myBetDisp) {
          const myBetVal = bj.active ? (bj.bet || 100) : (Math.max(10, parseInt(document.getElementById('bjBetInput')?.value) || state.bjBet || 100));
          myBetDisp.textContent = `(${fmt(myBetVal)} €)`;
        }

        if (bj.active) {
          if (bj.turn === 'player') {
            if (playerBox) { playerBox.classList.add('bj-active-turn-me'); playerBox.classList.remove('bj-active-turn-opp'); }
            if (playerBadge) playerBadge.classList.remove('hidden');
            if (dealerBox) dealerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
            if (dealerBadge) dealerBadge.classList.add('hidden');
          } else {
            if (playerBox) playerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
            if (playerBadge) playerBadge.classList.add('hidden');
            if (dealerBox) dealerBox.classList.add('bj-active-turn-me');
            if (dealerBadge) dealerBadge.classList.remove('hidden');
          }
        } else {
          if (playerBox) playerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (playerBadge) playerBadge.classList.add('hidden');
          if (dealerBox) dealerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (dealerBadge) dealerBadge.classList.add('hidden');
        }
        return;
      }

      // --- RENDU MULTIJOUEUR SYNCHRONISÉ EN TEMPS RÉEL ---
      const myKey = (state.username || '').toLowerCase().trim();

      // Si le joueur n'est pas assis ou a quitté la table : désactiver les commandes et vider le tapis
      if (!getBjCurrentTableId() || state.currentTable?.leftTable) {
        if (dealBtn) dealBtn.classList.add('hidden');
        if (readyBtn) readyBtn.classList.add('hidden');
        const actionControls = document.getElementById('bjActionControls');
        if (actionControls) actionControls.classList.add('hidden');
        updateCardSlot(document.getElementById('bjPlayerCards'), renderCardHTML(null, 'lg', true, 'blackjack') + renderCardHTML(null, 'lg', true, 'blackjack'));
        updateCardSlot(document.getElementById('bjDealerCards'), renderCardHTML(null, 'lg', true, 'blackjack') + renderCardHTML(null, 'lg', true, 'blackjack'));
        document.getElementById('bjPlayerScore').textContent = '0';
        document.getElementById('bjDealerScore').textContent = '0';
        document.getElementById('bjStatusBanner').textContent = 'Choisis une table dans le salon ci-dessus pour t\'asseoir et jouer en multijoueur.';
        if (playerBadge) playerBadge.classList.add('hidden');
        if (coBadge) coBadge.classList.add('hidden');
        if (dealerBadge) dealerBadge.classList.add('hidden');
        return;
      }

      const status = bjSyncTable?.status || 'waiting';
      const isWaiting = !bjSyncTable || status === 'waiting';
      const myPl = (!isWaiting && bjSyncTable && bjSyncTable.players) ? bjSyncTable.players[myKey] : null;
      const hasPlayed = !!((bjSyncTable && (bjSyncTable.hasPlayedRound || (bjSyncTable.roundId && status !== 'waiting'))) || (myProcessedBjRoundId !== null));

      // 0. EN MULTIJOUEUR : RETRAIT DÉFINITIF DU BOUTON DISTRIBUER, SEUL LE BOUTON PRÊT EXISTE
      if (dealBtn) dealBtn.classList.add('hidden');

      if (status === 'playing' || status === 'dealer_turn') {
        if (readyBtn) readyBtn.classList.add('hidden');
      } else {
        // Phase d'attente ou fin de manche : les deux joueurs valident "Prêt ?"
        if (readyBtn) {
          readyBtn.classList.remove('hidden');
          readyBtn.disabled = false;
          if (myBjReady) {
            readyBtn.className = "w-full py-3.5 rounded-xl font-extrabold text-sm bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg transition active:scale-[0.98] animate-pulse";
            readyBtn.textContent = "✅ Prêt ! (En attente du joueur...)";
          } else {
            readyBtn.className = "w-full py-3.5 rounded-xl font-extrabold text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-lg hover:brightness-110 active:scale-[0.98] transition";
            readyBtn.textContent = "👍 Prêt ?";
          }
        }
      }

      // 1. Cartes du Croupier
      const dealer = (bjSyncTable && bjSyncTable.dealer) ? bjSyncTable.dealer : { cards: [], score: 0, hidden: true };
      const dHidden = (dealer.hidden !== false) && (status === 'playing');
      const dealerCardsEl = document.getElementById('bjDealerCards');
      if (dealerCardsEl) {
        const dHtml = (!isWaiting && dealer.cards && dealer.cards.length)
          ? dealer.cards.map((c, i) => renderCardHTML(c, 'lg', dHidden && i === 1, 'blackjack')).join('')
          : renderCardHTML(null, 'lg', true, 'blackjack') + renderCardHTML(null, 'lg', true, 'blackjack');
        updateCardSlot(dealerCardsEl, dHtml);
      }
      const dealerScoreEl = document.getElementById('bjDealerScore');
      if (dealerScoreEl) {
        dealerScoreEl.textContent = (!isWaiting && dHidden && dealer.cards.length) ? bjScore([dealer.cards[0]]) : (!isWaiting && dealer.cards.length ? bjScore(dealer.cards) : '0');
      }

      // 2. Mes Cartes ("Ta Main")
      const myCardsEl = document.getElementById('bjPlayerCards');
      const myScoreEl = document.getElementById('bjPlayerScore');
      const myBetDisp = document.getElementById('bjMyBetDisplay');
      if (myBetDisp) {
        const myBetVal = (!isWaiting && myPl && myPl.bet)
          ? myPl.bet
          : (Math.max(10, parseInt(document.getElementById('bjBetInput')?.value) || state.bjBet || 100));
        myBetDisp.textContent = `(${fmt(myBetVal)} €)`;
      }

      if (!isWaiting && myPl && Array.isArray(myPl.cards) && myPl.cards.length > 0) {
        if (myCardsEl) {
          const myHtml = myPl.cards.map(c => renderCardHTML(c, 'lg', false, 'blackjack')).join('');
          updateCardSlot(myCardsEl, myHtml);
        }
        if (myScoreEl) myScoreEl.textContent = bjScore(myPl.cards);
      } else {
        if (myCardsEl) {
          const emptyHtml = renderCardHTML(null, 'lg', true, 'blackjack') + renderCardHTML(null, 'lg', true, 'blackjack');
          updateCardSlot(myCardsEl, emptyHtml);
        }
        if (myScoreEl) myScoreEl.textContent = '0';
      }

      // 3. Cartes du Co-joueur (Joueur réel invité uniquement)
      const coNameEl = document.getElementById('bjCoPlayerName');
      const coScoreEl = document.getElementById('bjCoPlayerScore');
      const coCardsEl = document.getElementById('bjCoPlayerCards');

      let oppPl = null;
      if (!isWaiting && bjSyncTable && bjSyncTable.players) {
        const otherKey = Object.keys(bjSyncTable.players).find(k => k !== myKey);
        if (otherKey) oppPl = bjSyncTable.players[otherKey];
      }

      if (!isWaiting && oppPl && Array.isArray(oppPl.cards) && oppPl.cards.length > 0) {
        let statusBadge = '';
        if (oppPl.status === 'busted') statusBadge = ' <span class="text-red-400 font-bold">(Sauté)</span>';
        else if (oppPl.status === 'blackjack') statusBadge = ' <span class="text-amber-300 font-bold">(Blackjack 21!)</span>';
        else if (oppPl.status === 'stand') statusBadge = ' <span class="text-stone-400 font-bold">(Reste)</span>';

        if (coNameEl) {
          coNameEl.innerHTML = `<span class="mr-1">${oppPl.avatar || '👤'}</span>${oppPl.username} <span class="text-amber-300 font-mono-num font-bold">(${fmt(oppPl.bet)} €)</span>${statusBadge}`;
        }
        if (coCardsEl) {
          const oppHtml = oppPl.cards.map(c => renderCardHTML(c, 'lg', false, 'blackjack')).join('');
          updateCardSlot(coCardsEl, oppHtml);
        }
        if (coScoreEl) {
          coScoreEl.textContent = bjScore(oppPl.cards);
        }
      } else {
        const realPlayers = getTableParticipants('blackjack');
        if (realPlayers.length > 0) {
          const p = realPlayers[0];
          const oppKey = (p.username || '').toLowerCase().trim();
          const oppBet = (bjSyncTable?.readyBets && bjSyncTable.readyBets[oppKey]) ? bjSyncTable.readyBets[oppKey] : (p.bjBet || 100);
          if (coNameEl) coNameEl.innerHTML = `<span class="mr-1">${p.avatarEmoji || '👤'}</span>${p.username} <span class="text-amber-300 font-mono-num font-bold">(Mise: ${fmt(oppBet)} €)</span>`;
        } else {
          if (coNameEl) coNameEl.innerHTML = `En attente d'un joueur invité...`;
        }
        if (coCardsEl) {
          const emptyHtml = renderCardHTML(null, 'lg', true, 'blackjack') + renderCardHTML(null, 'lg', true, 'blackjack');
          updateCardSlot(coCardsEl, emptyHtml);
        }
        if (coScoreEl) coScoreEl.textContent = '0';
      }

      // 4. MISE EN VALEUR DU TOUR OU DES PRÊTS (Turn Glow & Ready Badges)
      const curTurn = (bjSyncTable?.turn || '').toLowerCase().trim();

      if (status === 'playing') {
        if (curTurn === myKey) {
          if (playerBox) { playerBox.classList.add('bj-active-turn-me'); playerBox.classList.remove('bj-active-turn-opp'); }
          if (playerBadge) {
            const isUrgent = _bjTurnSecondsLeft <= 5;
            playerBadge.textContent = `🃏 TON TOUR (${_bjTurnSecondsLeft}s)`;
            playerBadge.className = isUrgent
              ? 'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500 text-white animate-bounce shadow-lg'
              : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400 text-black animate-pulse';
            playerBadge.classList.remove('hidden');
          }
          if (coBox) coBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (coBadge) coBadge.classList.add('hidden');
          if (dealerBox) dealerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (dealerBadge) dealerBadge.classList.add('hidden');
        } else {
          if (playerBox) playerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (playerBadge) playerBadge.classList.add('hidden');
          if (coBox) { coBox.classList.add('bj-active-turn-opp'); coBox.classList.remove('bj-active-turn-me'); }
          if (coBadge) {
            coBadge.textContent = '👥 SON TOUR (30s)';
            coBadge.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-300 text-black animate-pulse';
            coBadge.classList.remove('hidden');
          }
          if (dealerBox) dealerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
          if (dealerBadge) dealerBadge.classList.add('hidden');
        }
      } else if (status === 'dealer_turn') {
        if (playerBox) playerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
        if (playerBadge) playerBadge.classList.add('hidden');
        if (coBox) coBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
        if (coBadge) coBadge.classList.add('hidden');
        if (dealerBox) { dealerBox.classList.add('bj-active-turn-me'); dealerBox.classList.remove('bj-active-turn-opp'); }
        if (dealerBadge) dealerBadge.classList.remove('hidden');
      } else {
        // En attente ou fin de manche
        if (playerBox) playerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
        if (dealerBox) dealerBox.classList.remove('bj-active-turn-me', 'bj-active-turn-opp');
        if (dealerBadge) dealerBadge.classList.add('hidden');

        // Badges d'état "Prêt ?"
        const otherKey = Object.keys(bjSyncTable?.readyPlayers || {}).find(k => k !== myKey)
          || Object.keys(bjSyncTable?.players || {}).find(k => k !== myKey)
          || Object.keys(bjSyncTable?.knownPlayers || {}).find(k => k !== myKey);

        if (playerBadge) {
          playerBadge.textContent = myBjReady ? '✅ PRÊT !' : '⏳ CHOISIS TA MISE';
          playerBadge.className = myBjReady
            ? 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400 text-black animate-pulse'
            : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/80 text-black';
          playerBadge.classList.remove('hidden');
        }
        if (coBadge && otherKey) {
          const oppIsReady = Boolean(bjSyncTable?.readyPlayers && bjSyncTable.readyPlayers[otherKey]?.ready);
          coBadge.textContent = oppIsReady ? '✅ PRÊT !' : '⏳ CHOISIT SA MISE...';
          coBadge.className = oppIsReady
            ? 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400 text-black animate-pulse'
            : 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/80 text-black';
          coBadge.classList.remove('hidden');
        } else if (coBadge) {
          coBadge.classList.add('hidden');
        }
      }
    }

    function startBlackjackCooldown(seconds = 0) {
      bj.cooldownRemaining = 0;
      if (window._bjCooldownInterval) clearInterval(window._bjCooldownInterval);
      window._bjCooldownInterval = null;
      renderBlackjack();
    }

    function startBlackjack(e) {
      if (!_AntiBotGuard.verify('Blackjack - Distribuer', e)) return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour jouer au Blackjack !');
        openAuthModal('login');
        return;
      }
      if (bj.active || bj.cooldownRemaining > 0) return;
      if (lobbies.bj && lobbies.bj.mode === 'multi') {
        if (bjSyncTable && (bjSyncTable.status === 'playing' || bjSyncTable.status === 'dealer_turn')) {
          showToast('🃏 Une main de Blackjack est déjà en cours !');
          return;
        }
      }
      const bet = parseInt(document.getElementById('bjBetInput').value) || 0;
      if (bet < 10 || bet > 50000) return showToast('❌ La mise doit être comprise entre 10 € et 50 000 €.');
      if (bet > state.balance) return showToast('❌ Solde insuffisant pour cette mise !');

      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      if (isMulti && (!lobbies.bj.publicTableId || state.currentTable?.leftTable)) {
        return showToast('👉 Choisis d\'abord une table parmi les 5 salons ci-dessus pour t\'asseoir !');
      }
      if (!isMulti) {
        // --- MODE SOLO DIRECT VS CROUPIER : tout est tiré et réglé par le serveur ---
        bjSoloStart(bet);
        return;
      }

      // --- VÉRIFICATION HÔTE SUR MANCHE 1 : Uniquement en table privée ---
      const hasPlayed = !!((bjSyncTable && (bjSyncTable.hasPlayedRound || (bjSyncTable.roundId && bjSyncTable.status !== 'waiting'))) || (myProcessedBjRoundId !== null));
      if (!hasPlayed && !isBjHost() && lobbies.bj.tableType === 'private') {
        const hostName = state.currentTable?.host || bjSyncTable?.host || "l'hôte";
        showToast(`🔒 Seul ${hostName} qui a créé la table privée peut lancer la première main !`);
        return;
      }

      const realPlayers = getTableParticipants('blackjack');
      if (realPlayers.length === 0) {
        if (lobbies.bj.tableType === 'public') {
          const curPub = BJ_PUBLIC_TABLES.find(t => t.id === (lobbies.bj.publicTableId || 'bj_pub_1'));
          showToast(`⏳ Tu es assis à ${curPub?.name || 'la table'}. Attends qu'un second joueur te rejoigne (accès libre) !`);
        } else {
          showToast('👥 En table privée, invite un ami pour jouer face au Croupier !');
        }
        return;
      }

      // --- MODE MULTIJOUEUR SYNCHRONISÉ EN DIRECT ---
      startBjMultiHand(bet);
    }

    let myDeductedRoundId = null;

    async function startBjMultiHand(bet) {
      // En multijoueur, la manche démarre toute seule quand les deux joueurs cliquent « Prêt ? » ;
      // la mise est alors prélevée par le serveur.
      showToast('👍 Clique sur « Prêt ? » : la manche démarre quand les deux joueurs sont prêts.');
    }

    /* ---- Blackjack solo : le navigateur ne fait que demander, le serveur tire les cartes et règle la mise ---- */
    let bjSoloBusy = false;
    function bjApplySolo(r) {
      bj.player = Array.isArray(r.player) ? r.player : [];
      bj.dealer = Array.isArray(r.dealer) ? r.dealer : [];
      if (typeof r.bet === 'number') bj.bet = r.bet;
    }
    function bjSoloFinish(r) {
      bjApplySolo(r);
      bj.active = false;
      renderBlackjack(false);
      const p = r.pScore, d = r.dScore;
      if (r.result === 'bust') endBj('💥 Tu as dépassé 21 !', 0);
      else if (r.result === 'win') endBj(`🏆 Gagné (${p} vs ${d}) ! +${fmt(r.win)} 🪙`, r.win);
      else if (r.result === 'push') endBj('🤝 Égalité avec le Croupier ! Mise remboursée.', r.win);
      else endBj(`Perdu (${d} vs ${p}).`, 0);
    }
    async function bjSoloStart(bet) {
      if (bjSoloBusy) return;
      bjSoloBusy = true;
      const dealBtn = document.getElementById('bjDealBtn');
      if (dealBtn) dealBtn.disabled = true;
      const r = await serverGame({ action: 'bj_start', bet });
      bjSoloBusy = false;
      if (dealBtn) dealBtn.disabled = false;
      if (!r.ok) { showToast('❌ ' + (r.error || 'Impossible de distribuer.')); return; }
      bj.active = true;
      bj.turn = 'player';
      bj.hasRealOpponent = false;
      bj.coPlayer = [];
      bjApplySolo(r);
      if (dealBtn) dealBtn.classList.add('hidden');
      document.getElementById('bjActionControls').classList.remove('hidden');
      setBjButtonsDisabled(false);
      document.getElementById('bjDoubleBtn').disabled = false;
      playCardFlipSound();
      renderBlackjack(true);
      if (r.done) { bjSoloFinish(r); return; }
      startBjTurnTimer();
    }
    async function bjSoloAction(action) {
      if (!bj.active || bjSoloBusy) return;
      bjSoloBusy = true;
      stopBjTurnTimer();
      setBjButtonsDisabled(true);
      const r = await serverGame({ action });
      bjSoloBusy = false;
      if (!r.ok) {
        showToast('⚠️ ' + (r.error || 'Action impossible.'));
        if (r.status === 400 && /Aucune manche/.test(r.error || '')) { bj.active = false; document.getElementById('bjActionControls').classList.add('hidden'); renderBlackjack(false); return; }
        setBjButtonsDisabled(false);
        startBjTurnTimer();
        return;
      }
      bjApplySolo(r);
      renderBlackjack(true);
      if (r.done) bjSoloFinish(r);
      else { setBjButtonsDisabled(false); startBjTurnTimer(); }
    }

    // solde du serveur (après une manche multijoueur : mise prélevée ou gain versé)
    async function refreshWallet() {
      try { await serverGame({ action: 'wallet_balance' }); } catch (e) {}
    }

    function setBjButtonsDisabled(val) {
      const hBtn = document.getElementById('bjHitBtn');
      const sBtn = document.getElementById('bjStandBtn');
      const dBtn = document.getElementById('bjDoubleBtn');
      if (hBtn) hBtn.disabled = val;
      if (sBtn) sBtn.disabled = val;
      if (dBtn) dBtn.disabled = val;
    }

    async function bjHit(e) {
      if (!_AntiBotGuard.verify('Blackjack - Tirer', e)) return;
      playCardFlipSound();
      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      if (!isMulti) {
        bjSoloAction('bj_hit');
        return;
      }

      // Multi
      const tableId = getBjCurrentTableId();
      if (!tableId || state.currentTable?.leftTable) return;
      const myKey = (state.username || '').toLowerCase().trim();
      const curTurn = (bjSyncTable?.turn || '').toLowerCase().trim();
      if (!bjSyncTable || bjSyncTable.status !== 'playing' || curTurn !== myKey) return;

      setBjButtonsDisabled(true);
      try {
        const res = await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'hit',
            tableId: tableId,
            username: state.username
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.table) {
            mergeBjServerState(data.table);
          }
        }
      } catch (e) {
      } finally {
        setBjButtonsDisabled(false);
      }
      setTimeout(syncBjMultiplayer, 100);
      setTimeout(syncBjMultiplayer, 250);
    }

    async function bjDouble(e) {
      if (!_AntiBotGuard.verify('Blackjack - Doubler', e)) return;
      stopBjTurnTimer();
      playCardFlipSound();
      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      if (!isMulti) {
        if (!bj.active || bj.turn !== 'player' || bj.player.length !== 2 || state.balance < bj.bet) return;
        bjSoloAction('bj_double');
        return;
      }

      // Multi
      const tableId = getBjCurrentTableId();
      if (!tableId || state.currentTable?.leftTable) return;
      const myKey = (state.username || '').toLowerCase().trim();
      const curTurn = (bjSyncTable?.turn || '').toLowerCase().trim();
      const myBet = (bjSyncTable?.players?.[myKey]?.bet) || bj.bet;
      if (!bjSyncTable || bjSyncTable.status !== 'playing' || curTurn !== myKey || state.balance < myBet) return;

      setBjButtonsDisabled(true);
      try {
        const res = await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'double',
            tableId: tableId,
            username: state.username
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok === false && data.error) showToast('⚠️ ' + data.error);
          if (data && data.table) {
            mergeBjServerState(data.table);
          }
          refreshWallet();
        }
      } catch (e) {
      } finally {
        setBjButtonsDisabled(false);
      }
      setTimeout(syncBjMultiplayer, 100);
      setTimeout(syncBjMultiplayer, 250);
    }

    async function bjStand(e, isInternal = false) {
      if (!isInternal && !_AntiBotGuard.verify('Blackjack - Rester', e)) return;
      stopBjTurnTimer();
      playCardFlipSound();
      const isMulti = (lobbies.bj && lobbies.bj.mode === 'multi');
      if (!isMulti) {
        bjSoloAction('bj_stand');
        return;
      }

      // Multi
      const tableId = getBjCurrentTableId();
      if (!tableId || state.currentTable?.leftTable) return;
      const myKey = (state.username || '').toLowerCase().trim();
      const curTurn = (bjSyncTable?.turn || '').toLowerCase().trim();
      if (!bjSyncTable || bjSyncTable.status !== 'playing' || curTurn !== myKey) return;

      // Optimistic instant visual feedback
      const actionControls = document.getElementById('bjActionControls');
      if (actionControls) actionControls.classList.add('hidden');
      document.getElementById('bjStatusBanner').textContent = 'Tu restes. Au tour du joueur suivant...';
      setBjButtonsDisabled(true);

      try {
        const res = await fetch(getBjApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stand',
            tableId: tableId,
            username: state.username
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.table) {
            mergeBjServerState(data.table);
          }
        }
      } catch (e) {
      } finally {
        setBjButtonsDisabled(false);
      }
      setTimeout(syncBjMultiplayer, 100);
      setTimeout(syncBjMultiplayer, 250);
    }

    function endBj(msg, win) {
      stopBjTurnTimer();
      bj.active = false;
      bj.wasInitiator = false;
      if (win > 0) playCoinWinSound();
      updateGlobalUI();
      document.getElementById('bjStatusBanner').textContent = `${msg} — Change ta mise ou clique sur Distribuer pour rejouer.`;
      document.getElementById('bjActionControls').classList.add('hidden');
      startBlackjackCooldown(0);
    }

    function mergeBjServerState(srv) {
      if (!srv || typeof srv !== 'object') return;
      bjSyncTable = srv;
      const myKey = (state.username || '').toLowerCase().trim();
      const myPl = srv.players ? srv.players[myKey] : null;
      const dealBtn = document.getElementById('bjDealBtn');
      const actionControls = document.getElementById('bjActionControls');

      // 1. MANCHE EN COURS
      if (srv.status === 'playing') {
        myBjReady = false;
        if (dealBtn) {
          dealBtn.classList.add('hidden');
          dealBtn.disabled = true;
        }

        const isMyTurn = ((srv.turn || '').toLowerCase().trim() === myKey);
        const doubleBtn = document.getElementById('bjDoubleBtn');

        if (myPl) {
          bj.active = true;
          bj.bet = myPl.bet || bj.bet || 100;

          // nouvelle manche : la mise a été prélevée par le serveur, on relit le solde
          if (srv.roundId && myDeductedRoundId !== srv.roundId) {
            myDeductedRoundId = srv.roundId;
            refreshWallet();
            playCardFlipSound();
          }

          if (isMyTurn && myPl.status === 'playing') {
            if (actionControls) actionControls.classList.remove('hidden');
            setBjButtonsDisabled(false);
            if (doubleBtn) doubleBtn.disabled = (myPl.cards.length !== 2 || state.balance < (myPl.bet || bj.bet));
            if (!_bjTurnTimerInterval) {
              startBjTurnTimer();
            } else {
              updateBjTurnTimerUI();
            }
          } else {
            stopBjTurnTimer();
            if (actionControls) actionControls.classList.add('hidden');
            const turnPlayer = srv.players && srv.players[srv.turn];
            const turnName = turnPlayer ? turnPlayer.username : srv.turn;
            document.getElementById('bjStatusBanner').textContent = `👥 Tour de ${turnName}... En attente de son action (30s max).`;
          }
        } else {
          stopBjTurnTimer();
          bj.active = false;
          if (actionControls) actionControls.classList.add('hidden');
          const turnPlayer = srv.players && srv.players[srv.turn];
          const turnName = turnPlayer ? turnPlayer.username : (srv.turn || 'Joueur');
          document.getElementById('bjStatusBanner').textContent = `👥 Manche en cours (${turnName})...`;
        }
      }
      // 2. TOUR DU CROUPIER
      else if (srv.status === 'dealer_turn') {
        stopBjTurnTimer();
        if (dealBtn) {
          dealBtn.classList.add('hidden');
          dealBtn.disabled = true;
        }
        bj.active = !!myPl;
        if (actionControls) actionControls.classList.add('hidden');
        document.getElementById('bjStatusBanner').textContent = `🃏 Le Croupier joue sa main...`;
      }
      // 3. MANCHE TERMINÉE
      else if (srv.status === 'finished') {
        stopBjTurnTimer();
        bj.active = false;
        bj.wasInitiator = false;
        if (actionControls) actionControls.classList.add('hidden');
        if (dealBtn) dealBtn.classList.add('hidden');

        // Attribution des gains si pas encore validés pour cette manche
        if (srv.roundId && myProcessedBjRoundId !== srv.roundId) {
          myProcessedBjRoundId = srv.roundId;
          myBjReady = false;
          if (myPl) {
            if (myPl.payout > 0) playCoinWinSound();
            refreshWallet();
            setTimeout(refreshWallet, 1500);

            if (myPl.result === 'win') {
              const profit = myPl.payout - (myPl.bet || 100);
              document.getElementById('bjStatusBanner').textContent = `🏆 Tu as battu le Croupier ! (+${fmt(profit)} € de gain) — Prends ton temps pour ajuster ta mise, puis clique sur « Prêt ? » pour relancer.`;
              showToast(`🏆 Victoire au Blackjack (+${fmt(profit)} €) !`);
            } else if (myPl.result === 'push') {
              document.getElementById('bjStatusBanner').textContent = `🤝 Égalité avec le Croupier ! Mise remboursée (${fmt(myPl.bet || 100)} €) — Prends ton temps pour ajuster ta mise, puis clique sur « Prêt ? » pour relancer.`;
            } else if (myPl.result === 'forfeit_win') {
              const loserName = srv.forfeit ? srv.forfeit.loser : 'L\'adversaire';
              document.getElementById('bjStatusBanner').textContent = `🏆 ${loserName} a quitté le jeu ! Tu gagnes ce qui était parié (+${fmt(myPl.payout)} €) ! — Prends ton temps pour ajuster ta mise, puis clique sur « Prêt ? » pour relancer.`;
              showToast(`🏆 ${loserName} a quitté le jeu ! Tu remportes la mise (+${fmt(myPl.payout)} €) !`);
            } else {
              document.getElementById('bjStatusBanner').textContent = `💥 Perdu face au Croupier (${srv.dealer.score} vs ${myPl.score}) (-${fmt(myPl.bet || 100)} €) — Prends ton temps pour ajuster ta mise, puis clique sur « Prêt ? » pour relancer.`;
            }
          }
          startBlackjackCooldown(0);
        }
      }
      // 4. TABLE EN ATTENTE
      else if (srv.status === 'waiting') {
        stopBjTurnTimer();
        bj.active = false;
        bj.wasInitiator = false;
        if (actionControls) actionControls.classList.add('hidden');
        if (bj.cooldownRemaining <= 0) {
          const hasPlayed = !!((srv.hasPlayedRound || (srv.roundId && srv.status !== 'waiting')) || (myProcessedBjRoundId !== null));
          const realPlayers = getTableParticipants('blackjack');
          if (hasPlayed) {
            document.getElementById('bjStatusBanner').textContent = 'Manche terminée ! Prends ton temps pour ajuster ta mise, puis clique sur « Prêt ? » quand tu souhaites relancer.';
          } else if (realPlayers.length > 0) {
            if (isBjHost()) {
              document.getElementById('bjStatusBanner').textContent = `Ami connecté (${realPlayers[0].username}). Ajuste ta mise et clique sur Distribuer pour lancer la manche.`;
            } else {
              const hostName = state.currentTable?.host || srv.host || "l'hôte";
              document.getElementById('bjStatusBanner').textContent = `En attente de ${hostName} pour distribuer la première main...`;
            }
          } else {
            document.getElementById('bjStatusBanner').textContent = 'Invite un ami pour jouer ensemble face au Croupier (aucun bot en multi).';
          }
        }
      }

      if (srv.status === 'playing' || srv.status === 'dealer_turn') {
        myBjReady = false;
      } else if (srv.readyPlayers && srv.readyPlayers[myKey]) {
        myBjReady = Boolean(srv.readyPlayers[myKey].ready);
      }

      renderBlackjack(srv.status === 'playing');
    }

    /* ================= SYNCHRONISATION MULTIJOUEUR BLACKJACK EN TEMPS RÉEL (< 400MS) ================= */
    async function syncBjMultiplayer() {
      if (currentRoomKey !== 'blackjack' || !lobbies.bj || lobbies.bj.mode !== 'multi') return;
      if (isBjSyncing) return;
      isBjSyncing = true;

      try {
        const tableId = getBjCurrentTableId();
        if (!tableId || state.currentTable?.leftTable) {
          isBjSyncing = false;
          return;
        }

        if (state.currentTable && !state.currentTable.leftTable) {
          state.currentTable.updatedAt = Date.now();
        }

        let srvTable = null;

        // 1. Appel HTTP à /api/blackjack
        try {
          const res = await fetch(`${getBjApiUrl()}?table=${encodeURIComponent(tableId)}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && (data.status || data.players)) {
              srvTable = data;
            }
          }
        } catch (e) {}

        if (srvTable) {
          mergeBjServerState(srvTable);
        }

      } catch (err) {
      } finally {
        isBjSyncing = false;
      }
    }

