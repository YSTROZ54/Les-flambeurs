    /* ================= LES GOBELETS (POSITIONNEMENT % RESPONSIVE MOBILE) ================= */
    const CUP_PERCENTS = ['20%', '50%', '80%'];
    let cupsGame = {
      mode: 'bot',
      speed: 'fast',
      canPick: false,
      bet: 100,
      mult: 1.25,
      positions: [0, 1, 2],
      ballCupId: 1,
      hider: 'opponent', // Seul le ( Bot ) cache la bille
      activeRoundId: null,
      lastFinishedRoundId: null,
      isShuffling: false
    };

    function setCupsHider(h) {
      cupsGame.hider = 'opponent';
    }

    function updateCupsSetupBoxVisibility() {
      const startBtn = document.getElementById('cupsStartBtn');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '🥤 Lancer la partie vs ( Bot )';
      }
    }

    function setCupsGameMode(m) {}
    function setCupsTableType(t) {}
    function toggleCupsFillBots() {}
    function setCupsMode(m) {}

    function setCupsSpeed(s) {
      cupsGame.speed = 'fast';
      cupsGame.mult = 1.25;
    }
    function setCupsStart(n) {
      cupsGame.startPos = n;
    }
    function setCupsEnd(n) {
      cupsGame.endPos = n;
    }

    function updateCupVisualPositions() {
      [0, 1, 2].forEach(cupId => {
        const posIndex = cupsGame.positions[cupId];
        const el = document.getElementById(`cupSlot${cupId}`);
        if (el) el.style.left = CUP_PERCENTS[posIndex];
      });
      const ballPosIndex = cupsGame.positions[cupsGame.ballCupId];
      const ball = document.getElementById('cupGoldenBall');
      if (ball) ball.style.left = CUP_PERCENTS[ballPosIndex];
    }

    async function startCupsGame(e) {
      if (!_AntiBotGuard.verify('Gobelets - Lancer', e)) return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour jouer aux Gobelets !');
        openAuthModal('login');
        return;
      }
      if (cupsGame.isShuffling || cupsGame.canPick) return;
      let bet = parseInt(document.getElementById('cupsBetInput').value) || 100;
      if (bet < 10) bet = 10;
      if (bet > 250) {
        bet = 250;
        document.getElementById('cupsBetInput').value = 250;
        showToast('ℹ️ Mise plafonnée à 250 pièces maximum sur les Gobelets.');
      }
      if (bet > state.balance) return showToast('❌ Solde insuffisant.');

      const speedMode = 'fast';
      cupsGame.speed = 'fast';
      cupsGame.mult = 1.25; // Gain strict x1.25 peu importe la somme mise
      cupsGame.bet = bet;
      cupsGame.positions = [0, 1, 2];
      cupsGame.hider = 'opponent';

      // Le serveur déduit la mise et choisit le gobelet qui cache la bille
      cupsGame.isShuffling = true;
      const srv = await serverGame({ action: 'cups_start', bet });
      if (!srv.ok || typeof srv.ballCup !== 'number') {
        cupsGame.isShuffling = false;
        return showToast('❌ ' + (srv.error || 'Partie impossible, réessaie.'));
      }
      cupsGame.bet = srv.bet;

      const startPos = srv.ballCup;
      cupsGame.ballCupId = startPos;
      cupsGame.isShuffling = true;
      updateCupVisualPositions();

      const ball = document.getElementById('cupGoldenBall');
      if (ball) ball.style.opacity = '1';
      [0, 1, 2].forEach(id => document.getElementById(`cupSlot${id}`)?.classList.toggle('lifted', id === cupsGame.ballCupId));
      document.getElementById('cupsBanner').textContent = '👀 Regarde bien sous quel gobelet le ( Bot ) cache la bille...';

      setTimeout(() => {
        [0, 1, 2].forEach(id => document.getElementById(`cupSlot${id}`)?.classList.remove('lifted'));
        setTimeout(() => {
          if (ball) ball.style.opacity = '0';
          runCupsShuffle(speedMode, () => {
            cupsGame.isShuffling = false;
            cupsGame.canPick = true;
            document.getElementById('cupsBanner').textContent = '👇 Clique sur le gobelet qui cache la bille !';
          });
        }, 320);
      }, 850);
    }

    function runCupsShuffle(speedMode, onComplete) {
      const steps = 9;
      const interval = 320; // Vitesse vive et rythmée, mais parfaitement humaine et traçable à l'œil nu
      let currentStep = 0;
      let lastSwappedPair = '';

      document.getElementById('cupsBanner').textContent = '🌀 Le ( Bot ) mélange les gobelets... Ouvre bien l\'œil !';

      const timer = setInterval(() => {
        currentStep++;

        // Choisir deux gobelets différents à intervertir (en évitant d'annuler immédiatement le même échange)
        let c1, c2, pairKey;
        let attempts = 0;
        do {
          c1 = Math.floor(Math.random() * 3);
          c2 = (c1 + 1 + Math.floor(Math.random() * 2)) % 3;
          pairKey = Math.min(c1, c2) + '-' + Math.max(c1, c2);
          attempts++;
        } while (pairKey === lastSwappedPair && attempts < 5);

        lastSwappedPair = pairKey;

        // Échange réel et visible de positions
        const tmp = cupsGame.positions[c1];
        cupsGame.positions[c1] = cupsGame.positions[c2];
        cupsGame.positions[c2] = tmp;

        updateCupVisualPositions();
        playCupShuffleSound();

        if (currentStep >= steps) {
          clearInterval(timer);
          setTimeout(() => {
            if (typeof onComplete === 'function') onComplete();
          }, interval);
        }
      }, interval);
    }

    async function pickCup(clickedCupId, e) {
      if (!_AntiBotGuard.verify('Gobelets - Choix', e)) return;
      if (!cupsGame.canPick) return;
      cupsGame.canPick = false;

      // le serveur vérifie le choix et crédite le gain
      const srv = await serverGame({ action: 'cups_pick', cup: clickedCupId });
      if (!srv.ok) {
        cupsGame.canPick = /pas terminé/.test(srv.error || '');
        return showToast('❌ ' + (srv.error || 'Choix impossible.'));
      }

      const ball = document.getElementById('cupGoldenBall');
      updateCupVisualPositions();
      if (ball) ball.style.opacity = '1';

      document.getElementById(`cupSlot${clickedCupId}`)?.classList.add('lifted');
      document.getElementById(`cupSlot${cupsGame.ballCupId}`)?.classList.add('lifted');

      if (srv.correct) {
        const win = srv.win;
        state.cupsStreak = (state.cupsStreak || 0) + 1;
        if (!state.cupsBestStreak || state.cupsStreak > state.cupsBestStreak) {
          state.cupsBestStreak = state.cupsStreak;
        }
        playCoinWinSound();
        saveState();
        updateGlobalUI();
        document.getElementById('cupsBanner').textContent = `🎉 BIEN VU ! Tu as battu le ( Bot ) : +${fmt(win)} pièces (×1.25) !`;
        showToast(`🥤 Victoire vs ( Bot ) ! Série en cours : 🔥 ${state.cupsStreak} d'affilée !`);
      } else {
        state.cupsStreak = 0;
        saveState();
        updateGlobalUI();
        document.getElementById('cupsBanner').textContent = '❌ Raté ! Le ( Bot ) a gardé la bille sous un autre gobelet.';
        showToast('❌ Le ( Bot ) a remporté la manche.');
      }

      updateCupsAccountStreak();
      renderCupsLeaderboard();
    }

    function updateCupsAccountStreak() {
      const db = getAccountsDB();
      const meKey = (state.username || '').toLowerCase().trim();
      if (meKey) {
        if (!db[meKey]) {
          db[meKey] = { ...DEFAULT_USER_STATE, ...state };
        }
        db[meKey].cupsStreak = state.cupsStreak || 0;
        db[meKey].cupsBestStreak = state.cupsBestStreak || 0;
        saveAccountsDB(db);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {}
        pushRemoteAccount(db[meKey]).catch(() => {});
      }
    }

    function renderCupsLeaderboard() {
      const container = document.getElementById('cupsLeaderboardGrid');
      if (!container) return;

      const myStreakEl = document.getElementById('cupsCurrentStreakText');
      const myBestEl = document.getElementById('cupsBestStreakText');
      if (myStreakEl) myStreakEl.textContent = state.cupsStreak || 0;
      if (myBestEl) myBestEl.textContent = state.cupsBestStreak || 0;

      const db = getAccountsDB();
      const meKey = (state.username || '').toLowerCase().trim();
      const FAKE_TEST_PROFILES = ['maxime', 'lucas', 'théo', 'theo', 'don corleone', 'don_corleone', 'karim', 'grandfrigo', 'flambeur_as', 'luckystrike', 'mysticcup'];

      // Nettoyer d'anciens profils d'exemple s'ils s'étaient glissés dans le stockage local
      ['flambeur_as', 'luckystrike', 'mysticcup'].forEach(f => {
        if (db[f]) { delete db[f]; saveAccountsDB(db); }
      });

      const players = [];
      const seen = new Set();

      // 1. Uniquement les VRAIS comptes ayant joué et réussi au moins 1 victoire
      Object.keys(db).forEach(k => {
        const acc = db[k];
        if (acc && acc.username && !k.startsWith('__') && !isUsernameBanned(k)) {
          const uKey = acc.username.toLowerCase().trim();
          if (FAKE_TEST_PROFILES.includes(uKey)) return;
          const streak = Math.max(acc.cupsBestStreak || 0, acc.cupsStreak || 0);
          if (streak > 0) {
            seen.add(uKey);
            players.push({
              name: acc.username,
              avatar: getAvatarDisplay(acc),
              streak: streak,
              isMe: isUserLoggedIn() && uKey === meKey
            });
          }
        }
      });

      // 2. Assurer la présence du joueur actif connecté s'il a au moins 1 victoire
      const myStreak = Math.max(state.cupsBestStreak || 0, state.cupsStreak || 0);
      if (isUserLoggedIn() && state.username && !isUsernameBanned(meKey) && !FAKE_TEST_PROFILES.includes(meKey) && myStreak > 0) {
        if (!seen.has(meKey)) {
          players.push({
            name: state.username,
            avatar: getAvatarDisplay(state),
            streak: myStreak,
            isMe: true
          });
        }
      }

      // Trier les vrais joueurs par série décroissante
      players.sort((a, b) => b.streak - a.streak);
      const top3 = players.slice(0, 3);

      const podiumConfig = [
        {
          rankLabel: '1ère Place',
          badgeIcon: '🥇',
          cardBorder: 'border-amber-400/70 bg-gradient-to-b from-amber-500/20 via-black/80 to-stone-950 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/40',
          textColor: 'text-amber-300',
          badgeBg: 'bg-amber-400/20 text-amber-300 border-amber-400/40'
        },
        {
          rankLabel: '2ème Place',
          badgeIcon: '🥈',
          cardBorder: 'border-stone-400/60 bg-gradient-to-b from-stone-400/15 via-black/80 to-stone-950 shadow-md ring-1 ring-stone-400/30',
          textColor: 'text-stone-200',
          badgeBg: 'bg-stone-400/20 text-stone-200 border-stone-400/40'
        },
        {
          rankLabel: '3ème Place',
          badgeIcon: '🥉',
          cardBorder: 'border-amber-700/60 bg-gradient-to-b from-amber-700/15 via-black/80 to-stone-950 shadow-md ring-1 ring-amber-700/30',
          textColor: 'text-amber-500',
          badgeBg: 'bg-amber-700/20 text-amber-400 border-amber-700/40'
        }
      ];

      // Construction des 3 emplacements du podium (occupés par les vrais joueurs, ou libres pour les prochains gagnants)
      let slotsHtml = '';
      for (let idx = 0; idx < 3; idx++) {
        const conf = podiumConfig[idx];
        const p = top3[idx];
        if (p) {
          slotsHtml += `
            <div class="rounded-2xl p-4 border ${conf.cardBorder} flex flex-col justify-between gap-3 backdrop-blur-md relative overflow-hidden transition hover:scale-[1.02]">
              <div class="flex items-center justify-between">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black border ${conf.badgeBg}">
                  <span>${conf.badgeIcon}</span> <span>${conf.rankLabel}</span>
                </span>
                ${p.isMe ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-400/40">✓ Toi</span>' : ''}
              </div>
              <div class="flex items-center gap-3 my-1">
                <div class="w-12 h-12 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center text-2xl shadow-inner shrink-0">
                  ${p.avatar || '👤'}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-serif-title font-extrabold text-sm sm:text-base text-white truncate flex items-center gap-1.5">
                    <span class="truncate">${p.name}</span>
                  </div>
                  <div class="text-[11px] text-stone-400">Maître des Gobelets</div>
                </div>
              </div>
              <div class="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span class="text-stone-400">Victoires d'affilée :</span>
                <span class="font-mono-num font-black ${conf.textColor} text-sm flex items-center gap-1">
                  <span>🔥</span> <span>${p.streak}</span> <span>d'affilée</span>
                </span>
              </div>
            </div>
          `;
        } else {
          slotsHtml += `
            <div class="rounded-2xl p-4 border border-dashed border-white/15 bg-black/30 flex flex-col justify-between gap-3 backdrop-blur-md opacity-60">
              <div class="flex items-center justify-between">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black border border-white/10 text-stone-400">
                  <span>${conf.badgeIcon}</span> <span>${conf.rankLabel}</span>
                </span>
                <span class="text-[10px] text-stone-500 font-bold uppercase tracking-wider">Place libre</span>
              </div>
              <div class="flex items-center gap-3 my-1">
                <div class="w-12 h-12 rounded-2xl bg-white/[0.03] border border-dashed border-white/15 flex items-center justify-center text-xl text-stone-500 shrink-0">
                  ➕
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-serif-title font-bold text-xs text-stone-300">En attente d'un joueur</div>
                  <div class="text-[11px] text-stone-500">Sois le prochain à entrer dans le Top 3</div>
                </div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-stone-500 italic">
                Gagne une partie pour prendre cette place
              </div>
            </div>
          `;
        }
      }

      container.innerHTML = slotsHtml;
    }

    function syncCupsMultiplayer() {}

