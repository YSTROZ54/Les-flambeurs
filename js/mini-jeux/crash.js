    /* ================= FUSÉE CRASH MULTIJOUEUR EN LIGNE SYNCHRONISÉ (DÉPART RÉEL SUR MISE, 7S DÉLAI, MULTIPLIER DÉTERMINISTE) ================= */
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function getCrashApiUrl() {
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        return 'http://localhost:8080/api/crash';
      }
      return '/api/crash';
    }

    function getCrashCurrentUsername() {
      if (state.username && state.username.trim().length > 0) {
        return state.username.trim();
      }
      try {
        let tag = localStorage.getItem('flambeurs_guest_tag');
        if (!tag) {
          tag = 'Joueur #' + Math.floor(1000 + Math.random() * 9000);
          localStorage.setItem('flambeurs_guest_tag', tag);
        }
        return tag;
      } catch (e) {
        return 'Joueur';
      }
    }

    function getCrashCurrentAvatar() {
      if (typeof getAvatarDisplay === 'function') {
        return getAvatarDisplay(state);
      }
      if (state.equipped && state.equipped.avatar && typeof SHOP_CATALOG !== 'undefined') {
        const it = SHOP_CATALOG.find(i => i.id === state.equipped.avatar);
        if (it && it.emoji) return it.emoji;
      }
      return state.avatarEmoji || '🧑‍🚀';
    }

    let crashSync = {
      id: 0,
      status: 'waiting', // 'waiting' | 'countdown' | 'flying' | 'crashed'
      countdownStartTime: 0,
      countdownDuration: 7000, // 7 secondes avant le vol
      launchTime: 0,
      crashPoint: 2.00,
      crashedAtTime: 0,
      bets: {},
      history: [2.45, 1.35, 4.10, 1.15, 3.20, 1.80],
      updatedAt: Date.now()
    };

    // Suivi strict de la mise active du joueur local pour la manche courante
    let myActiveCrashBet = null;

    let localCrash = {
      stars: Array.from({ length: 65 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.8 + Math.random() * 2,
        speed: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2
      })),
      clouds: [
        { x: 0.16, y: 0.54 },
        { x: 0.52, y: 0.38 },
        { x: 0.78, y: 0.48 }
      ],
      meteors: [
        { x: 0.84, y: 0.16 },
        { x: 0.46, y: 0.10 }
      ]
    };

    function getMyCrashBet() {
      const myName = getCrashCurrentUsername().toLowerCase();

      // 1. Vérifier si un pari correspondant existe dans crashSync.bets
      if (crashSync && crashSync.bets) {
        for (const key of Object.keys(crashSync.bets)) {
          if (key.trim().toLowerCase() === myName) {
            const sBet = crashSync.bets[key];
            if (myActiveCrashBet) {
              if (myActiveCrashBet.cashedOut) {
                sBet.cashedOut = true;
                sBet.cashMult = myActiveCrashBet.cashMult;
                sBet.win = myActiveCrashBet.win;
              }
              myActiveCrashBet.roundId = crashSync.id;
            } else {
              myActiveCrashBet = { ...sBet, roundId: crashSync.id };
            }
            return sBet;
          }
        }
      }

      // 2. Si myActiveCrashBet existe localement
      if (myActiveCrashBet) {
        // En attente ou en compte à rebours : la mise reste toujours active pour le décollage
        if (crashSync.status === 'waiting' || crashSync.status === 'countdown') {
          myActiveCrashBet.roundId = crashSync.id;
          return myActiveCrashBet;
        }
        // En plein vol : valide si roundId concorde
        if (crashSync.status === 'flying' && myActiveCrashBet.roundId === crashSync.id) {
          return myActiveCrashBet;
        }
      }

      return null;
    }

    function setCrashQuickBet(amount) {
      const input = document.getElementById('crashBetInput');
      if (input) {
        input.value = Math.min(state.balance || amount, amount);
      }
      [50, 100, 200, 300, 500].forEach(val => {
        const chip = document.getElementById(`cbet-${val}`);
        if (chip) {
          if (val === amount) {
            chip.className = 'py-1.5 rounded-lg text-xs font-mono-num font-bold bg-sky-500 text-black border border-sky-300 shadow-md transition scale-105';
          } else {
            chip.className = 'py-1.5 rounded-lg text-xs font-mono-num font-bold bg-white/10 hover:bg-sky-500/25 text-stone-200 border border-white/10 transition';
          }
        }
      });
    }

    function renderCrashHistoryPills() {
      const container = document.getElementById('crashHistoryPills');
      if (!container) return;
      const history = (crashSync && crashSync.history && crashSync.history.length > 0)
        ? crashSync.history
        : [2.45, 1.35, 4.10, 1.15, 3.20, 1.80];

      container.innerHTML = history.slice(0, 10).map(m => {
        const val = parseFloat(m) || 1.0;
        let badgeClass = 'bg-stone-800 text-stone-300 border-stone-700';
        if (val >= 10.0) {
          badgeClass = 'bg-amber-500/25 text-amber-300 border-amber-400/50 shadow-sm font-black';
        } else if (val >= 2.0) {
          badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 font-bold';
        } else if (val >= 1.4) {
          badgeClass = 'bg-sky-500/20 text-sky-300 border-sky-400/30';
        } else {
          badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-400/30';
        }
        return `<span class="px-2.5 py-1 rounded-full text-xs font-mono-num border whitespace-nowrap ${badgeClass}">${val.toFixed(2)}×</span>`;
      }).join('');
    }

    function renderCrashLiveBets() {
      const container = document.getElementById('crashLiveBetsList');
      const countBadge = document.getElementById('crashPlayersCountBadge');
      if (!container) return;

      const betsList = crashSync && crashSync.bets ? Object.values(crashSync.bets) : [];
      if (countBadge) {
        countBadge.textContent = betsList.length === 1 ? '1 parieur' : `${betsList.length} parieurs`;
      }

      if (betsList.length === 0) {
        container.innerHTML = `
          <div class="p-2.5 rounded-xl bg-black/40 border border-white/5 text-stone-400 text-center text-xs">
            En attente qu'un joueur place sa mise...
          </div>`;
        return;
      }

      const myKey = getCrashCurrentUsername().toLowerCase();

      container.innerHTML = betsList.map(b => {
        const isMe = (b.name || '').trim().toLowerCase() === myKey;
        let statusBadge = '';
        let rowBg = 'bg-black/50 border-white/5';

        if (b.cashedOut) {
          rowBg = 'bg-emerald-950/40 border-emerald-500/30';
          statusBadge = `<span class="text-xs font-mono-num font-extrabold text-emerald-300">✅ ${b.cashMult ? b.cashMult.toFixed(2) + '×' : 'Encaissé'} (+${fmt(b.win || 0)})</span>`;
        } else if (crashSync.status === 'crashed') {
          rowBg = 'bg-rose-950/40 border-rose-500/30';
          statusBadge = `<span class="text-xs font-scifi font-bold text-rose-400">💥 Crashé</span>`;
        } else if (crashSync.status === 'flying') {
          const curMult = getCrashMultiplierAt(Date.now());
          const curGain = Math.floor(b.bet * curMult);
          statusBadge = `<span class="text-xs font-mono-num text-sky-300 flex items-center gap-1 font-bold"><span>🚀</span> <span>${fmt(curGain)}</span></span>`;
        } else if (crashSync.status === 'countdown') {
          statusBadge = `<span class="text-xs text-amber-300 font-bold">⏳ Paré au vol</span>`;
        } else {
          statusBadge = `<span class="text-xs text-sky-300 font-bold">🪙 Mise prête</span>`;
        }

        return `
          <div class="flex items-center justify-between p-2 rounded-xl ${rowBg} border transition-all text-xs">
            <div class="flex items-center gap-2">
              <span class="text-base">${b.avatar || '🧑‍🚀'}</span>
              <div>
                <div class="font-bold text-white flex items-center gap-1.5">
                  <span>${escapeHtml(b.name || 'Joueur')}</span>
                  ${isMe ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-200 border border-sky-400/40 font-black">Moi</span>' : ''}
                </div>
                <div class="text-[11px] font-mono-num text-stone-400 font-bold">${fmt(b.bet)} 🪙</div>
              </div>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>
        `;
      }).join('');
    }

    function getCrashMultiplierAt(now) {
      if (crashSync.status !== 'flying' && crashSync.status !== 'crashed') return 1.0;
      const launchTime = crashSync.launchTime || (crashSync.countdownStartTime + crashSync.countdownDuration);
      if (!launchTime || now < launchTime) return 1.0;
      const elapsed = (now - launchTime) / 1000;
      const mult = Math.pow(Math.E, 0.15 * elapsed);
      return mult;
    }

    function updateCrashCommittedBetDisplay() {
      const banner = document.getElementById('crashActiveBetBanner');
      const valEl = document.getElementById('crashActiveBetValue');
      const statusEl = document.getElementById('crashActiveBetStatus');

      const myBet = getMyCrashBet();
      if (myBet && myBet.bet > 0) {
        if (banner) {
          banner.className = 'p-3 rounded-xl bg-sky-500/15 border border-sky-400/50 flex items-center justify-between transition-all shadow-md';
        }
        if (valEl) {
          valEl.textContent = `${fmt(myBet.bet)} pièces`;
        }

        let statusText = '⏳ Mise prête';
        let statusClass = 'px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30';

        if (myBet.cashedOut) {
          statusText = `✅ Encaissé (${myBet.cashMult ? myBet.cashMult.toFixed(2) + '×' : ''})`;
          statusClass = 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
        } else if (crashSync.status === 'crashed') {
          statusText = '💥 Crashé';
          statusClass = 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30';
        } else if (crashSync.status === 'flying') {
          const curMult = getCrashMultiplierAt(Date.now());
          const curGain = Math.floor(myBet.bet * curMult);
          statusText = `🚀 En vol (+${fmt(curGain)})`;
          statusClass = 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 animate-pulse';
        } else if (crashSync.status === 'countdown') {
          const secLeft = Math.max(0, Math.ceil((crashSync.launchTime - Date.now()) / 1000));
          statusText = `⏳ Décollage (${secLeft}s)`;
          statusClass = 'px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 animate-pulse';
        }

        if (statusEl) {
          statusEl.textContent = statusText;
          statusEl.className = statusClass;
        }
      } else {
        if (banner) {
          banner.className = 'p-3 rounded-xl bg-sky-950/60 border border-sky-500/30 flex items-center justify-between transition-all';
        }
        if (valEl) {
          valEl.textContent = '0 pièce (aucune)';
        }
        if (statusEl) {
          statusEl.textContent = 'Non misé';
          statusEl.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-stone-400 border border-white/10';
        }
      }
    }

    function updateCrashActionBtnText() {
      const actionBtn = document.getElementById('crashActionBtn');
      const actionIcon = document.getElementById('crashActionBtnIcon');
      const actionText = document.getElementById('crashActionBtnText');

      const launchBtn = document.getElementById('crashLaunchBtn');
      const launchIcon = document.getElementById('crashLaunchBtnIcon');
      const launchText = document.getElementById('crashLaunchBtnText');

      const cancelBtn = document.getElementById('crashCancelBtn');
      const cancelText = document.getElementById('crashCancelBtnText');

      if (!actionBtn || !actionText) return;

      const myBet = getMyCrashBet();
      const totalBetsCount = crashSync.bets ? Object.keys(crashSync.bets).length : 0;

      // Met à jour la cartouche visuelle de la mise engagée
      updateCrashCommittedBetDisplay();

      if (crashSync.status === 'waiting') {
        if (myBet) {
          actionBtn.disabled = true;
          actionBtn.className = 'w-full py-3.5 rounded-xl font-scifi font-extrabold text-sm bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 opacity-95 flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = '✅';
          actionText.textContent = `MISE DE ${fmt(myBet.bet)} 🪙 PRÊTE À BORD`;

          if (launchBtn) {
            launchBtn.classList.remove('hidden');
            launchBtn.disabled = false;
            launchBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-gradient-to-r from-sky-400 to-indigo-500 text-black hover:brightness-110 active:scale-[0.98] transition shadow-lg cursor-pointer animate-pulse flex items-center justify-center gap-2';
            if (launchIcon) launchIcon.textContent = '🚀';
            if (launchText) launchText.textContent = 'LANCER LE DÉCOLLAGE (7S)';
          }

          if (cancelBtn) {
            cancelBtn.classList.remove('hidden');
            if (cancelText) cancelText.textContent = `Se retirer (${fmt(myBet.bet)} 🪙)`;
          }
        } else {
          actionBtn.disabled = false;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-gradient-to-r from-sky-400 to-indigo-500 text-black hover:brightness-110 active:scale-[0.98] transition shadow-lg cursor-pointer flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = isUserLoggedIn() ? '💰' : '🔒';
          actionText.textContent = isUserLoggedIn() ? 'MISER SANS LANCER' : 'SE CONNECTER POUR MISER';

          // RÈGLE : Si tu n'as pas misé tu ne peux pas cliquer sur décoller -> bouton retiré
          if (launchBtn) {
            launchBtn.classList.add('hidden');
          }

          if (cancelBtn) {
            cancelBtn.classList.add('hidden');
          }
        }
      } else if (crashSync.status === 'countdown') {
        const secLeft = Math.max(0, Math.ceil((crashSync.launchTime - Date.now()) / 1000));
        if (launchBtn) launchBtn.classList.add('hidden');

        if (myBet) {
          // Le joueur est DÉJÀ À BORD : aucune obligation de recliquer sur rejoindre !
          actionBtn.disabled = true;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/50 text-emerald-300 opacity-95 flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = '🚀';
          actionText.textContent = `À BORD DU VOL ! DÉCOLLAGE DANS ${secLeft}S`;

          // Possibilité de se retirer avant le décollage
          if (cancelBtn) {
            cancelBtn.classList.remove('hidden');
            if (cancelText) cancelText.textContent = `Se retirer du vol (${fmt(myBet.bet)} 🪙)`;
          }
        } else {
          if (cancelBtn) cancelBtn.classList.add('hidden');
          actionBtn.disabled = false;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-gradient-to-r from-emerald-400 to-teal-500 text-black hover:brightness-110 active:scale-[0.98] transition shadow-lg cursor-pointer animate-pulse flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = isUserLoggedIn() ? '➕' : '🔒';
          actionText.textContent = isUserLoggedIn() ? `REJOINDRE LE VOL (${secLeft}S)` : `SE CONNECTER POUR REJOINDRE (${secLeft}S)`;
        }
      } else if (crashSync.status === 'flying') {
        const curMult = getCrashMultiplierAt(Date.now());
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (launchBtn) launchBtn.classList.add('hidden');

        if (myBet && !myBet.cashedOut) {
          const currentGain = Math.floor(myBet.bet * curMult);
          actionBtn.disabled = false;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-gradient-to-r from-emerald-400 to-teal-500 text-black hover:brightness-110 active:scale-[0.98] transition shadow-lg cursor-pointer flex items-center justify-center gap-2 animate-pulse';
          if (actionIcon) actionIcon.textContent = '🪂';
          actionText.textContent = `S'ÉJECTER & ENCAISSER (${fmt(currentGain)} 🪙)`;
        } else if (myBet && myBet.cashedOut) {
          actionBtn.disabled = true;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-stone-800 border border-emerald-500/40 text-emerald-300 opacity-90 cursor-not-allowed flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = '✅';
          actionText.textContent = `ENCAISSÉ À ${myBet.cashMult ? myBet.cashMult.toFixed(2) + '×' : ''} (+${fmt(myBet.win || 0)} 🪙)`;
        } else {
          actionBtn.disabled = true;
          actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-stone-800 border border-sky-500/30 text-sky-300 opacity-80 cursor-not-allowed flex items-center justify-center gap-2';
          if (actionIcon) actionIcon.textContent = '👀';
          actionText.textContent = `MODE SPECTATEUR (${curMult.toFixed(2)}×)`;
        }
      } else if (crashSync.status === 'crashed') {
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (launchBtn) launchBtn.classList.add('hidden');
        actionBtn.disabled = true;
        actionBtn.className = 'w-full py-4 rounded-xl font-scifi font-extrabold text-sm bg-rose-950/80 border border-rose-500/50 text-rose-300 opacity-80 cursor-not-allowed flex items-center justify-center gap-2';
        if (actionIcon) actionIcon.textContent = '💥';
        actionText.textContent = `CRASH À ${crashSync.crashPoint.toFixed(2)}×`;
      }
    }

    // BOUTON 1 : MISER SANS LANCER / REJOINDRE LE VOL / S'ÉJECTER
    function handleCrashButton(e) {
      if (!_AntiBotGuard.verify('Crash - Bouton', e)) return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour pouvoir miser et jouer !');
        openAuthModal('login');
        return;
      }
      const myBet = getMyCrashBet();

      // 1. En vol : Éjection immédiate
      if (crashSync.status === 'flying') {
        if (myBet && !myBet.cashedOut) {
          performCrashCashout();
        }
        return;
      }

      // 2. Si crash en cours
      if (crashSync.status === 'crashed') {
        return showToast('⏳ Attends la fin du crash pour la prochaine manche !');
      }

      // 3. En compte à rebours : rejoindre
      if (crashSync.status === 'countdown') {
        if (myBet) {
          const secLeft = Math.max(0, Math.ceil((crashSync.launchTime - Date.now()) / 1000));
          return showToast(`🚀 Tu es déjà à bord ! Décollage dans ${secLeft}s.`);
        }
        placeCrashBetInternal(false);
        return;
      }

      // 4. En attente : Mise sans lancer
      if (crashSync.status === 'waiting') {
        if (myBet) {
          return showToast(`✅ Ta mise de ${fmt(myBet.bet)} 🪙 est déjà enregistrée. Clique sur "DÉCOLLER" pour lancer le compte à rebours !`);
        }
        placeCrashBetInternal(false);
      }
    }

    // BOUTON 2 : DÉCOLLER (LANCER LE COMPTE À REBOURS DE 7S)
    function handleCrashLaunch(e) {
      if (!_AntiBotGuard.verify('Crash - Décollage', e)) return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour pouvoir jouer !');
        openAuthModal('login');
        return;
      }
      if (crashSync.status === 'countdown') {
        return showToast('⏳ Le compte à rebours est déjà en cours !');
      }
      if (crashSync.status === 'flying' || crashSync.status === 'crashed') {
        return showToast('⏳ Attends la fin du vol en cours.');
      }

      let myBet = getMyCrashBet();
      if (!myBet) {
        return showToast('❌ Tu dois miser d\'abord avant de pouvoir faire décoller la fusée !');
      }

      // Le serveur lance le compte à rebours de 7 s et tire lui-même le point de crash (secret)
      crashCall({ action: 'launch' }).then((r) => {
        if (!r.ok) return showToast('⚠️ ' + (r.error || 'Décollage impossible.'));
        showToast('🚀 Décollage lancé ! Compte à rebours de 7s activé pour tout le serveur.');
        updateCrashActionBtnText();
        renderCrashLiveBets();
        startCrashAnimLoop();
      });
    }

    // BOUTON 3 : ANNULER LA MISE / SE RETIRER DU VOL
    function handleCrashCancelBet() {
      if (crashSync.status !== 'waiting' && crashSync.status !== 'countdown') {
        return showToast('❌ Impossible de se retirer une fois le vol décollé !');
      }
      const myBet = getMyCrashBet();
      if (!myBet) return;
      crashCall({ action: 'cancel' }).then(async (r) => {
        if (!r.ok) return showToast('⚠️ ' + (r.error || 'Impossible de se retirer.'));
        myActiveCrashBet = null;
        const myKey = getCrashCurrentUsername().toLowerCase();
        for (const k of Object.keys(crashSync.bets || {})) {
          if (k.trim().toLowerCase() === myKey) { delete crashSync.bets[k]; break; }
        }
        await refreshWallet();
        showCrashBalance();
        renderCrashLiveBets();
        updateCrashActionBtnText();
        showToast(`✖ Tu t'es retiré du vol. Mise de ${fmt(myBet.bet)} 🪙 remboursée.`);
      });
    }

    function showCrashBalance() {
      const balDisplay = document.getElementById('crashUserBalanceDisplay');
      if (balDisplay) balDisplay.textContent = fmt(state.balance);
      try { updateGlobalUI(); } catch (e) {}
    }

    // appel de l'API Crash (le serveur décide de tout : mise, décollage, gains)
    let crashLastMutationAt = 0; // un état « en vol » demandé avant notre dernière action ne doit pas l'écraser
    async function crashCall(payload) {
      try {
        const res = await fetch(getCrashApiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        let data = {};
        try { data = await res.json(); } catch (e) {}
        if (res.status === 401) handleAuthExpired();
        crashLastMutationAt = Date.now();
        if (typeof data.balance === 'number') {
          state.balance = data.balance; state.lastBalanceChange = Date.now(); saveState(); showCrashBalance();
        }
        if (data && data.state) mergeCrashServerState(data.state);
        return { ...data, ok: res.ok && data.ok !== false };
      } catch (e) {
        return { ok: false, error: 'Serveur injoignable. Vérifie ta connexion.' };
      }
    }

    let crashBusy = false;
    async function placeCrashBetInternal(startLaunchDirectly) {
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour pouvoir miser !');
        openAuthModal('login');
        return;
      }
      if (crashBusy) return;
      const betInput = document.getElementById('crashBetInput');
      const bet = parseInt(betInput ? betInput.value : '0') || 0;
      if (bet <= 0) return showToast('❌ Précise une mise valide (minimum 10 pièces).');
      if (bet > state.balance) return showToast('❌ Solde insuffisant pour cette mise.');
      crashBusy = true;
      const r = await crashCall({ action: 'bet', amount: bet, avatar: getCrashCurrentAvatar() });
      crashBusy = false;
      if (!r.ok) return showToast('⚠️ ' + (r.error || 'Mise refusée.'));

      const myKey = getCrashCurrentUsername();
      const mine = Object.values(crashSync.bets || {}).find((b) => (b.name || '').toLowerCase() === myKey.toLowerCase());
      myActiveCrashBet = { ...(mine || { name: myKey, bet, cashedOut: false, cashMult: null, win: 0, avatar: getCrashCurrentAvatar() }), roundId: crashSync.id };
      if (crashSync.status === 'countdown') {
        const secLeft = Math.max(0, Math.ceil((crashSync.launchTime - Date.now()) / 1000));
        showToast(`🚀 Tu as rejoint le vol ! Décollage dans ${secLeft}s.`);
      } else {
        showToast(`💰 Mise de ${fmt(bet)} 🪙 enregistrée ! Ton blaze est prêt à bord.`);
      }
      renderCrashLiveBets();
      updateCrashActionBtnText();
      startCrashAnimLoop();
    }

    async function performCrashCashout() {
      const myBet = getMyCrashBet();
      if (!myBet || myBet.cashedOut || crashSync.status !== 'flying' || crashBusy) return;
      crashBusy = true;
      const r = await crashCall({ action: 'cashout' });
      crashBusy = false;
      if (!r.ok) {
        showToast('💥 ' + (r.error || 'Encaissement impossible.'));
        return;
      }
      myBet.cashedOut = true; myBet.cashMult = r.mult; myBet.win = r.win;
      if (myActiveCrashBet) { myActiveCrashBet.cashedOut = true; myActiveCrashBet.cashMult = r.mult; myActiveCrashBet.win = r.win; }
      playCoinWinSound();
      updateCrashActionBtnText();
      renderCrashLiveBets();
      showToast(`🪂 Encaissé à ${r.mult.toFixed(2)}× : +${fmt(r.win)} pièces !`);
    }

    let isCrashSyncing = false;
    async function syncCrashMultiplayer() {
      if (isCrashSyncing) return;
      isCrashSyncing = true;
      try {
        const startedAt = Date.now();
        const res = await fetch(getCrashApiUrl(), { cache: 'no-store' });
        if (res.ok) {
          const st = await res.json();
          if (startedAt >= crashLastMutationAt && !crashBusy && st && (st.status || st.bets)) mergeCrashServerState(st);
        }
      } catch (e) {
      } finally {
        isCrashSyncing = false;
      }
    }

    function mergeCrashServerState(srvIn) {
      if (!srvIn || typeof srvIn !== 'object') return;
      const now = Date.now();
      // les dates du serveur sont ramenées à l'horloge de ce navigateur
      const srv = { ...srvIn };
      if (typeof srv.serverNow === 'number') {
        const delta = now - srv.serverNow;
        ['launchTime', 'countdownStartTime', 'crashedAtTime'].forEach((k) => { if (srv[k]) srv[k] += delta; });
      }
      const prevStatus = crashSync.status;
      const myName = getCrashCurrentUsername();
      const myKey = myName.toLowerCase();

      // Vérifier si le serveur détient notre mise
      let srvHasMyBet = null;
      if (srv.bets && typeof srv.bets === 'object') {
        for (const k of Object.keys(srv.bets)) {
          if (k.trim().toLowerCase() === myKey) {
            srvHasMyBet = srv.bets[k];
            break;
          }
        }
      }

      // 1. Nouvelle manche (ID différent)
      if (srv.id && srv.id !== crashSync.id) {
        crashSync.id = srv.id;
        crashSync.status = srv.status;
        crashSync.countdownStartTime = srv.countdownStartTime || 0;
        crashSync.countdownDuration = srv.countdownDuration || 7000;
        crashSync.launchTime = srv.launchTime || 0;
        crashSync.crashPoint = srv.crashPoint || 0;
        crashSync.crashedAtTime = srv.crashedAtTime || 0;
        
        if (srvHasMyBet) {
          myActiveCrashBet = { ...(myActiveCrashBet || {}), ...srvHasMyBet, roundId: srv.id };
        } else if (!crashBusy) {
          myActiveCrashBet = null;
        }

        crashSync.bets = srv.bets || {};
        if (myActiveCrashBet) {
          crashSync.bets[myName] = myActiveCrashBet;
        }

        if (Array.isArray(srv.history) && srv.history.length > 0) {
          crashSync.history = srv.history;
        }
        crashSync.updatedAt = srv.updatedAt || now;

        if (crashSync.status === 'countdown' || crashSync.status === 'flying') {
          startCrashAnimLoop();
        }

        renderCrashHistoryPills();
        renderCrashLiveBets();
        updateCrashActionBtnText();
        return;
      }

      // 2. Changement de statut ou mise à jour de la manche en cours
      let hasChange = false;
      if (srv.status && srv.status !== crashSync.status) {
        crashSync.status = srv.status;
        crashSync.countdownStartTime = srv.countdownStartTime || crashSync.countdownStartTime;
        crashSync.countdownDuration = srv.countdownDuration || crashSync.countdownDuration;
        crashSync.launchTime = srv.launchTime || crashSync.launchTime;
        crashSync.crashPoint = srv.crashPoint || crashSync.crashPoint;
        crashSync.crashedAtTime = srv.crashedAtTime || crashSync.crashedAtTime;
        hasChange = true;
      }

      // 3. Gestion des paris reçus du serveur (le serveur fait foi : pas de mise chez lui = pas de mise)
      if (srvHasMyBet) {
        myActiveCrashBet = { ...(myActiveCrashBet || {}), ...srvHasMyBet, roundId: crashSync.id };
      } else if (!crashBusy) {
        myActiveCrashBet = null;
      }

      crashSync.bets = srv.bets || {};
      if (myActiveCrashBet) {
        const sBet = crashSync.bets[myName] || myActiveCrashBet;
        if (myActiveCrashBet.cashedOut) {
          sBet.cashedOut = true;
          sBet.cashMult = myActiveCrashBet.cashMult;
          sBet.win = myActiveCrashBet.win;
        }
        crashSync.bets[myName] = sBet;
      }
      hasChange = true;

      if (Array.isArray(srv.history) && srv.history.length > 0) {
        crashSync.history = srv.history;
      }

      // la fusée vient d'exploser (annoncé par le serveur)
      if (srv.status === 'crashed' && prevStatus !== 'crashed' && prevStatus !== undefined) {
        try { playBoomSound(); } catch (e) {}
        const mb = getMyCrashBet();
        if (mb && !mb.cashedOut) showToast(`💥 Trop tard ! La fusée a explosé à ${Number(srv.crashPoint || 0).toFixed(2)}×.`);
      }

      if (hasChange) {
        crashSync.updatedAt = now;
        if (crashSync.status === 'countdown' || crashSync.status === 'flying') {
          startCrashAnimLoop();
        }
        renderCrashHistoryPills();
        renderCrashLiveBets();
        updateCrashActionBtnText();
      }
    }

    // Polling régulier de synchronisation multijoueur (400ms)
    setInterval(() => {
      if (currentRoomKey === 'crash') {
        syncCrashMultiplayer();
      } else if (currentRoomKey === 'blackjack' && lobbies.bj && lobbies.bj.mode === 'multi') {
        syncBjMultiplayer();
      } else if (currentRoomKey === 'poker' && lobbies.poker && lobbies.poker.mode === 'multi') {
        syncPokerMultiplayer();
      }
    }, 400);

    // pendant le vol on interroge le serveur plus souvent pour que l'explosion s'affiche sans retard
    setInterval(() => { if (currentRoomKey === 'crash' && crashSync.status === 'flying') syncCrashMultiplayer(); }, 150);

    let crashAnimReqId = null;
    function startCrashAnimLoop() {
      if (crashAnimReqId) return;
      crashAnimReqId = requestAnimationFrame(stepCrashLoop);
    }

    function stepCrashLoop() {
      crashAnimReqId = null;
      try {
        const now = Date.now();
        const multText = document.getElementById('crashMultiplierText');
        const subText = document.getElementById('crashStatusSub');
        const myBet = getMyCrashBet();

        if (crashSync.status === 'countdown') {
          // En attente du décollage (7s)
          if (now >= crashSync.launchTime) {
            crashSync.status = 'flying';
            crashSync.updatedAt = now;
            if (subText) {
              subText.textContent = '🚀 DÉCOLLAGE IMMÉDIAT !';
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-sky-500/30 backdrop-blur-md text-xs uppercase tracking-widest text-sky-200 font-scifi border border-sky-400/40 text-center';
            }
            renderCrashLiveBets();
          } else {
            const secLeft = Math.max(0, Math.ceil((crashSync.launchTime - now) / 1000));
            if (multText) multText.textContent = '1.00×';
            if (subText) {
              subText.textContent = `⏳ DÉCOLLAGE DANS ${secLeft}S !`;
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-amber-500/30 backdrop-blur-md text-xs uppercase tracking-widest text-amber-300 font-scifi border border-amber-400/40 text-center animate-pulse';
            }
            drawCrashScene(false, 1.0);
          }
          updateCrashActionBtnText();
        } else if (crashSync.status === 'flying') {
          // Vol en cours
          let curMult = getCrashMultiplierAt(now);

          // Retrait automatique
          const autoInput = document.getElementById('crashAutoInput');
          const autoVal = autoInput ? parseFloat(autoInput.value) : NaN;
          if (myBet && !myBet.cashedOut && autoVal >= 1.1 && curMult >= autoVal) {
            performCrashCashout();
          }

          // Le crash n'est connu que du serveur : on continue de monter jusqu'à son annonce
          if (multText) {
            multText.textContent = `${curMult.toFixed(2)}×`;
            multText.className = 'font-scifi text-5xl md:text-7xl font-black text-white drop-shadow-[0_4px_25px_rgba(0,0,0,0.95)]';
          }
          if (subText) {
            if (myBet && !myBet.cashedOut) {
              const curGain = Math.floor(myBet.bet * curMult);
              subText.textContent = `GAIN ACTUEL : ${fmt(curGain)} 🪙`;
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-emerald-950/80 backdrop-blur-md text-xs uppercase tracking-widest text-emerald-300 font-scifi border border-emerald-400/40 text-center';
            } else if (myBet && myBet.cashedOut) {
              subText.textContent = `✅ ENCAISSÉ À ${myBet.cashMult.toFixed(2)}× (+${fmt(myBet.win)} 🪙)`;
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-xs uppercase tracking-widest text-emerald-400 font-scifi border border-emerald-500/30 text-center';
            } else {
              subText.textContent = `👀 VOL MULTIJOUEUR EN DIRECT`;
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-xs uppercase tracking-widest text-sky-300 font-scifi border border-sky-400/30 text-center';
            }
          }
          drawCrashScene(false, curMult);
          updateCrashActionBtnText();
        } else if (crashSync.status === 'crashed') {
          // Explosion annoncée par le serveur ; il relance lui-même une manche d'attente après 4 s
          const cp = crashSync.crashPoint || 1;
          if (multText) {
            multText.textContent = `${cp.toFixed(2)}×`;
            multText.className = 'font-scifi text-5xl md:text-7xl font-black text-rose-500 drop-shadow-[0_4px_25px_rgba(244,63,94,0.7)]';
          }
          if (subText) {
            subText.textContent = `💥 EXPLOSION À ${cp.toFixed(2)}× !`;
            subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-rose-950/90 backdrop-blur-md text-xs uppercase tracking-widest text-rose-300 font-scifi border border-rose-500/50 text-center';
          }
          drawCrashScene(true, cp);
        } else if (crashSync.status === 'waiting') {
          if (multText) {
            multText.textContent = '1.00×';
            multText.className = 'font-scifi text-5xl md:text-7xl font-black text-white drop-shadow-[0_4px_25px_rgba(0,0,0,0.95)]';
          }
          if (subText) {
            const betsCount = crashSync.bets ? Object.keys(crashSync.bets).length : 0;
            if (betsCount > 0) {
              subText.textContent = `${betsCount} PARIEUR(S) PRÊT(S) AU DÉCOLLAGE`;
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-sky-500/20 backdrop-blur-md text-xs uppercase tracking-widest text-sky-200 font-scifi border border-sky-400/30 text-center';
            } else {
              subText.textContent = "EN ATTENTE D'UNE MISE";
              subText.className = 'mt-2.5 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-xs uppercase tracking-widest text-sky-300 font-scifi border border-white/15 text-center';
            }
          }
          drawCrashScene(false, 1.0);
          updateCrashActionBtnText();
        }
      } catch (err) {
        console.error('Crash step loop error', err);
      }

      // Maintenir la boucle si dans la salle ou si vol actif
      if (currentRoomKey === 'crash' || crashSync.status === 'flying' || crashSync.status === 'countdown' || crashSync.status === 'crashed') {
        crashAnimReqId = requestAnimationFrame(stepCrashLoop);
      }
    }

    function drawFlyingCarpetOnCanvas(ctx, x, y, now) {
      ctx.save();
      ctx.translate(x, y);
      const wave = Math.sin((now || performance.now()) / 140) * 4;
      ctx.beginPath();
      ctx.moveTo(-26, 6 + wave);
      ctx.quadraticCurveTo(0, -8 - wave, 26, -2 + wave);
      ctx.lineTo(22, 12 + wave);
      ctx.quadraticCurveTo(0, 2 - wave, -22, 16 + wave);
      ctx.closePath();
      ctx.fillStyle = '#991b1b';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();

      // Franges dorées aux extrémités du tapis volant
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-29, 6 + wave, 4, 10);
      ctx.fillRect(25, -2 + wave, 4, 10);
      ctx.restore();
    }

    function drawCrashScene(exploded, overrideMult) {
      const canvas = document.getElementById('crashCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      // Détection dynamique et haute résolution (évite toute déformation/écrasement sur smartphone)
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const displayW = Math.max(280, Math.round(rect.width || 820));
      const displayH = Math.max(340, Math.round(rect.height || 460));

      if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
        canvas.width = Math.round(displayW * dpr);
        canvas.height = Math.round(displayH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = displayW;
      const h = displayH;
      ctx.clearRect(0, 0, w, h);

      const currentMult = (overrideMult !== undefined)
        ? overrideMult
        : (crashSync.status === 'flying' ? getCrashMultiplierAt(Date.now()) : 1.0);

      const alt = Math.max(0, currentMult - 1);

      // Ciel dégradé selon l'altitude (transition fluide vers l'espace infini)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (alt < 0.6) {
        // Basse altitude : crépuscule d'aérodrome avec halo d'horizon
        skyGrad.addColorStop(0, '#0c162d');
        skyGrad.addColorStop(0.4, '#1e3a8a');
        skyGrad.addColorStop(0.75, '#0284c7');
        skyGrad.addColorStop(1, '#38bdf8');
      } else if (alt < 2.0) {
        // Haute altitude : mésosphère bleu-nuit / violet cosmique
        skyGrad.addColorStop(0, '#020617');
        skyGrad.addColorStop(0.45, '#0f172a');
        skyGrad.addColorStop(0.75, '#1e1b4b');
        skyGrad.addColorStop(1, '#1e40af');
      } else {
        // Espace infini : cosmos profond étoilé
        skyGrad.addColorStop(0, '#02040a');
        skyGrad.addColorStop(0.5, '#05091a');
        skyGrad.addColorStop(1, '#090d24');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Nébuleuse lumineuse dans l'espace
      if (alt > 1.2) {
        const nebAlpha = Math.min(0.35, (alt - 1.2) * 0.15);
        const nebGrad = ctx.createRadialGradient(w * 0.7, h * 0.28, 10, w * 0.7, h * 0.28, w * 0.5);
        nebGrad.addColorStop(0, `rgba(168, 85, 247, ${nebAlpha})`);
        nebGrad.addColorStop(0.4, `rgba(56, 189, 248, ${nebAlpha * 0.5})`);
        nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Étoiles scintillantes avec parallaxe selon l'altitude
      const starAlpha = Math.min(1, Math.max(0.2, (alt - 0.3) / 1.5));
      if (localCrash.stars) {
        localCrash.stars.forEach(s => {
          const sx = (s.x * w) % w;
          const sy = ((s.y * h) + alt * 95 * s.speed) % h;
          const tw = 0.7 + Math.sin(Date.now() / 300 + s.twinkle) * 0.3;
          ctx.beginPath();
          ctx.arc(sx, sy, s.r * tw, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha * tw})`;
          ctx.fill();
        });
      }

      // Planète lointaine & Météores à haute altitude
      if (alt >= 1.5) {
        const planetX = Math.round(w * 0.82);
        const planetY = Math.round(h * 0.18);
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 15;
        ctx.font = `${Math.round(Math.min(w, h) * 0.08) + 18}px sans-serif`;
        ctx.fillText('🪐', planetX, planetY);
        ctx.restore();

        if (localCrash.meteors) {
          ctx.font = '24px sans-serif';
          localCrash.meteors.forEach((m, idx) => {
            const mx = ((m.x * w) - alt * 130 + idx * 240 + 2000) % w;
            const my = ((m.y * h) + alt * 80) % (h - 70);
            ctx.fillText('☄️', mx, my);
          });
        }
      }

      // Nuages atmosphériques au décollage
      const cloudOffsetY = alt * 180;
      if (cloudOffsetY < 360 && localCrash.clouds) {
        ctx.font = `${Math.round(Math.min(w, h) * 0.08) + 20}px sans-serif`;
        localCrash.clouds.forEach(c => {
          const cx = (c.x * w);
          const cy = (c.y * h) + cloudOffsetY;
          if (cy < h + 50) {
            ctx.fillText('☁️', cx, cy);
            ctx.fillText('☁️', (cx + 100) % w, cy - 25);
          }
        });
      }

      // Sol & Pas de tir (s'efface progressivement vers le bas au fur et à mesure de l'envol)
      const groundY = (h - 55) + alt * 220;
      if (groundY < h + 70) {
        // Pelouse et piste
        ctx.fillStyle = '#15803d';
        ctx.fillRect(0, groundY, w, 80);
        ctx.fillStyle = '#166534';
        ctx.fillRect(0, groundY + 12, w, 70);

        // Pas de tir / Base de lancement sous la fusée
        const padX = Math.round(w * 0.16);
        ctx.fillStyle = '#475569';
        ctx.fillRect(padX - 35, groundY - 8, 70, 10);

        // Tour de lancement
        ctx.fillStyle = '#64748b';
        ctx.fillRect(padX - 25, groundY - 50, 7, 44);
        ctx.fillRect(padX - 27, groundY - 34, 20, 4);

        // Silhouettes d'arbres et bâtiment bien espacées selon la largeur
        ctx.font = '22px sans-serif';
        ctx.fillText('🌲', Math.round(w * 0.38), groundY);
        ctx.fillText('🌲', Math.round(w * 0.65), groundY);
        ctx.fillText('🏢', Math.round(w * 0.85), groundY);
      }

      // Trajectoire de vol en arc fluide et spacieux
      const isFlying = crashSync.status === 'flying' || exploded;
      const progress = isFlying ? Math.min(1, alt / 5.5) : 0;
      const startX = Math.round(w * 0.16);
      const startY = Math.min(h - 22, groundY - 14);
      const endX = startX + progress * (w * 0.72);
      const endY = (h * 0.82) - Math.pow(progress, 0.78) * (h * 0.65);

      // Traînée lumineuse si en vol
      if (isFlying && progress > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        const cpx = startX + (endX - startX) * 0.5;
        const cpy = Math.max(h * 0.85, (startY + endY) * 0.5 + (h * 0.15));
        ctx.quadraticCurveTo(cpx, cpy, endX, endY);
        ctx.strokeStyle = exploded ? '#f43f5e' : '#38bdf8';
        ctx.lineWidth = 5;
        ctx.shadowColor = exploded ? '#f43f5e' : '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      // Flamme de réacteur au sol lors du décompte
      if (crashSync.status === 'countdown') {
        const flicker = Math.sin(Date.now() / 70) * 4;
        ctx.beginPath();
        ctx.arc(startX, startY + 12, 11 + flicker, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
        ctx.fill();
      }

      const veh = (typeof SHOP_CATALOG !== 'undefined' && state && state.equipped)
        ? (SHOP_CATALOG.find(i => i.id === state.equipped.crashVehicle) || SHOP_CATALOG[0])
        : { icon: '🚀', isCarpet: false };

      if (exploded) {
        ctx.beginPath();
        ctx.arc(endX, endY, 48, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fill();
        ctx.font = '54px sans-serif';
        ctx.fillText('💥', endX - 27, endY + 20);
      } else {
        const targetX = isFlying ? endX : startX;
        const targetY = isFlying ? endY : startY - 8;

        // Flamme réacteur active en plein vol
        if (isFlying) {
          const flameSize = 10 + Math.sin(Date.now() / 40) * 4;
          ctx.beginPath();
          ctx.arc(targetX - 16, targetY + 12, flameSize, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.6)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(targetX - 14, targetY + 10, flameSize * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
          ctx.fill();
        }

        if (veh.isCarpet) {
          drawFlyingCarpetOnCanvas(ctx, targetX, targetY, performance.now());
        } else {
          ctx.font = '46px sans-serif';
          ctx.fillText(veh.icon || '🚀', targetX - 22, targetY + 14);
        }
      }

      ctx.restore();
    }

