    /* ================= LA CHAMBRE FORTE (MINES 20 CASES) ================= */
    let mines = { active: false, bet: 0, bombs: [], revealed: [], count: 3 };

    function setMinesBombCount(n) {
      if (mines.active) return;
      mines.count = n;
      [3, 5, 8, 12].forEach(k => document.getElementById(`mbomb-${k}`).classList.toggle('active', k === n));
    }

    function renderMinesGrid(revealAll = false) {
      const g = document.getElementById('minesGrid');
      if (!g) return;
      g.innerHTML = Array.from({ length: 20 }, (_, i) => {
        const rev = mines.revealed.includes(i);
        const bmb = mines.bombs.includes(i);
        let txt = '🔒', cls = 'bg-stone-900 border-emerald-500/30 hover:border-emerald-400';
        if (rev) { txt = '💎'; cls = 'bg-emerald-500/25 border-emerald-400'; }
        else if (mines.pendingIdx === i) { txt = '⏳'; cls = 'bg-amber-500/20 border-amber-400 animate-pulse'; }
        else if (revealAll && bmb) { txt = '💣'; cls = 'bg-rose-950 border-rose-500'; }
        return `<button onclick="clickMineCell(${i})" class="h-12 sm:h-14 rounded-xl border text-lg sm:text-xl transition ${cls}">${txt}</button>`;
      }).join('');
    }

    async function startMinesGame(e) {
      if (!_AntiBotGuard.verify('Mines - Lancer', e)) return;
      if (!isUserLoggedIn()) {
        showToast('🔒 Tu dois être connecté pour jouer à la Chambre Forte !');
        openAuthModal('login');
        return;
      }
      if (mines.pending) return;
      const bet = parseInt(document.getElementById('minesBetInput').value) || 0;
      const cnt = mines.count || 3;
      if (bet <= 0 || bet > state.balance) return showToast('❌ Mise invalide.');
      mines.pending = true;
      // affichage immédiat : la grille s'ouvre tout de suite, le serveur confirme juste après
      document.getElementById('minesStartBtn').classList.add('hidden');
      document.getElementById('minesCashoutBtn').classList.remove('hidden');
      mines.active = true; mines.bombs = []; mines.revealed = []; mines.bet = bet;
      renderMinesGrid(false);
      const r = await serverGame({ action: 'mines_start', bet, count: cnt });
      mines.pending = false;
      if (!r.ok) {
        mines.active = false;
        document.getElementById('minesStartBtn').classList.remove('hidden');
        document.getElementById('minesCashoutBtn').classList.add('hidden');
        renderMinesGrid(false);
        return showToast('❌ ' + (r.error || 'Partie impossible.'));
      }
      // les bombes restent sur le serveur : le navigateur ne connaît que les cases déjà retournées
      mines = { active: true, bet: r.game.bet, bombs: [], revealed: [], count: r.game.count, mult: 1, pending: false };
      document.getElementById('minesStartBtn').classList.add('hidden');
      document.getElementById('minesCashoutBtn').classList.remove('hidden');
      document.getElementById('minesCurrentMult').textContent = '1.00×';
      document.getElementById('minesCurrentWin').textContent = fmt(mines.bet);
      renderMinesGrid(false);
    }

    function getMinesMult() {
      return mines.mult || 1;
    }

    async function clickMineCell(idx, e) {
      if (!_AntiBotGuard.verify('Mines - Case', e)) return;
      if (!mines.active || mines.pending || mines.revealed.includes(idx)) return;
      mines.pending = true;
      mines.pendingIdx = idx;
      renderMinesGrid(false); // la case réagit tout de suite (⏳) pendant que le serveur répond
      const r = await serverGame({ action: 'mines_pick', idx });
      mines.pending = false;
      mines.pendingIdx = -1;
      if (!r.ok) { renderMinesGrid(false); return showToast('❌ ' + (r.error || 'Action impossible.')); }
      if (r.boom) {
        mines.active = false;
        mines.bombs = r.bombs || [];
        playBoomSound();
        document.getElementById('minesStartBtn').classList.remove('hidden');
        document.getElementById('minesCashoutBtn').classList.add('hidden');
        renderMinesGrid(true);
        showToast('💥 BOOM ! Bombe touchée !');
        return;
      }
      mines.revealed = r.game.revealed;
      mines.mult = r.game.mult;
      playCoinWinSound();
      document.getElementById('minesCurrentMult').textContent = `${mines.mult.toFixed(2)}×`;
      document.getElementById('minesCurrentWin').textContent = fmt(mines.bet * mines.mult);
      renderMinesGrid(false);
    }

    async function cashoutMines(e) {
      if (!_AntiBotGuard.verify('Mines - Retrait', e)) return;
      if (!mines.active || mines.pending || !mines.revealed.length) return;
      mines.pending = true;
      const r = await serverGame({ action: 'mines_cashout' });
      mines.pending = false;
      if (!r.ok) return showToast('❌ ' + (r.error || 'Retrait impossible.'));
      mines.active = false;
      mines.bombs = r.bombs || [];
      playCoinWinSound();
      document.getElementById('minesStartBtn').classList.remove('hidden');
      document.getElementById('minesCashoutBtn').classList.add('hidden');
      renderMinesGrid(true);
      showToast(`💰 +${fmt(r.win)} pièces récupérées !`);
    }

