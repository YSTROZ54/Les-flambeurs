    /* ================= JEU DE GRATTAGE 3D « LES FLAMBEURS » ================= */
    let scratchTicket = {
      active: false,
      cost: 50,
      winAmount: 0,
      isRevealed: false,
      serial: '№ 2654177'
    };
    let isScratching = false;
    let scratchLastX = 0, scratchLastY = 0;
    let scratchFoilSoundTimer = 0;

    function initScratchGame() {
      setupScratch3DInteraction();
      setupScratchCanvas();
      updateScratchUI();
      renderScratchLeaderboard();
    }

    function setupScratch3DInteraction() {
      const card = document.getElementById('scratch3dCard');
      if (card) {
        card.style.transform = 'none';
      }
    }

    function playScratchFoilSound() {
      const now = Date.now();
      if (now - scratchFoilSoundTimer < 90) return;
      scratchFoilSoundTimer = now;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const masterVol = typeof getMasterVolume === 'function' ? getMasterVolume() : 0.8;
      if (masterVol <= 0) return;

      try {
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200 + Math.random() * 800, ctx.currentTime);
        filter.Q.setValueAtTime(3.0, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22 * masterVol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
      } catch (e) {}
    }

    function playScratchWinSound(isJackpot = false) {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const masterVol = typeof getMasterVolume === 'function' ? getMasterVolume() : 0.8;
      if (masterVol <= 0) return;

      const notes = isJackpot 
        ? [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98] 
        : [440, 554.37, 659.25, 880];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = isJackpot ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
        g.gain.linearRampToValueAtTime(0.25 * masterVol, ctx.currentTime + i * 0.1 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.42);
      });
    }

    function drawScratchFoil(ctx, width, height) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#94a3b8');
      grad.addColorStop(0.25, '#e2e8f0');
      grad.addColorStop(0.5, '#cbd5e1');
      grad.addColorStop(0.75, '#f8fafc');
      grad.addColorStop(1, '#64748b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      for (let i = -width; i < width * 2; i += 18) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 40, height);
        ctx.stroke();
      }

      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 4;
      ctx.font = 'bold 15px "Cinzel", "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨ GRATTEZ ICI ✨', width / 2, height / 2 - 10);
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('PIÈCE OU DOIGT', width / 2, height / 2 + 14);
      ctx.restore();
    }

    function setupScratchCanvas() {
      const canvas = document.getElementById('scratchCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width || 290;
      const h = canvas.height || 115;

      if (!scratchTicket.active || scratchTicket.isRevealed) {
        drawScratchFoil(ctx, w, h);
      }

      if (canvas._hasScratchEvents) return;
      canvas._hasScratchEvents = true;

      const getPos = (e) => {
        const cRect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / cRect.width;
        const scaleY = canvas.height / cRect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - cRect.left) * scaleX,
          y: (clientY - cRect.top) * scaleY
        };
      };

      const scratch = (x, y) => {
        if (!scratchTicket.active || scratchTicket.isRevealed) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 36;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(scratchLastX, scratchLastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        scratchLastX = x;
        scratchLastY = y;
        playScratchFoilSound();
        checkScratchProgress();
      };

      const startScratch = (e) => {
        if (!scratchTicket.active || scratchTicket.isRevealed) {
          if (!scratchTicket.active) showToast('🎟️ Clique sur « Acheter un ticket (50 €) » pour commencer !');
          return;
        }
        isScratching = true;
        const pos = getPos(e);
        scratchLastX = pos.x;
        scratchLastY = pos.y;
        scratch(pos.x, pos.y);
      };

      const moveScratch = (e) => {
        if (!isScratching) return;
        e.preventDefault();
        const pos = getPos(e);
        scratch(pos.x, pos.y);
      };

      const stopScratch = () => {
        isScratching = false;
      };

      canvas.addEventListener('mousedown', startScratch);
      window.addEventListener('mousemove', moveScratch);
      window.addEventListener('mouseup', stopScratch);

      canvas.addEventListener('touchstart', startScratch, { passive: false });
      window.addEventListener('touchmove', moveScratch, { passive: false });
      window.addEventListener('touchend', stopScratch);
    }

    function checkScratchProgress() {
      const canvas = document.getElementById('scratchCanvas');
      if (!canvas || !scratchTicket.active || scratchTicket.isRevealed) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      let cleared = 0;
      const totalPixels = data.length / 4;
      for (let i = 3; i < data.length; i += 16) {
        if (data[i] === 0) cleared++;
      }
      const percent = Math.min(100, Math.round((cleared / (totalPixels / 4)) * 100));

      const pText = document.getElementById('scratchProgressText');
      const pBar = document.getElementById('scratchProgressBar');
      if (pText) pText.textContent = `${percent}%`;
      if (pBar) pBar.style.width = `${percent}%`;

      if (percent >= 55) {
        completeScratchReveal();
      }
    }

    let scratchBuying = false;
    async function buyScratchCard() {
      if (scratchTicket && scratchTicket.active && !scratchTicket.isRevealed) {
        showToast('⚠️ Tu as déjà un ticket en cours ! Gratte-le complètement avant d\'en acheter un nouveau.');
        return;
      }
      if (state.balance < 50) {
        showToast('❌ Solde insuffisant ! Un ticket coûte 50 pièces.');
        return;
      }
      if (scratchBuying) return;
      scratchBuying = true;

      // Le serveur débite le ticket et tire le résultat ; le gain n'est crédité qu'au grattage complet.
      const srv = await serverGame({ action: 'scratch_buy' });
      scratchBuying = false;
      if (!srv.ok || typeof srv.win !== 'number') {
        showToast('❌ ' + (srv.error || 'Ticket indisponible, réessaie.'));
        updateScratchUI();
        return;
      }
      state.scratchCardsPlayed = (state.scratchCardsPlayed || 0) + 1;
      saveState();
      const winAmount = srv.win;

      scratchTicket = {
        active: true,
        cost: 50,
        winAmount: winAmount,
        ticketId: srv.ticketId,
        isRevealed: false,
        serial: '№ ' + Math.floor(1000000 + Math.random() * 9000000)
      };

      const serialLabel = document.getElementById('scratchSerialLabel');
      if (serialLabel) serialLabel.textContent = scratchTicket.serial;

      const resLayer = document.getElementById('scratchResultLayer');
      if (resLayer) {
        if (winAmount > 0) {
          const isJackpot = winAmount >= 5000;
          resLayer.innerHTML = `
            <div class="flex flex-col items-center justify-center animate-bounce">
              <span class="text-3xl">${isJackpot ? '💎👑💎' : '🎉💰🎉'}</span>
              <span class="text-xs uppercase font-black tracking-wider text-amber-300">${isJackpot ? '★ JACKPOT ROYALE ★' : 'TICKET GAGNANT !'}</span>
              <span class="text-2xl font-mono-num font-black ${isJackpot ? 'text-amber-200' : 'text-emerald-400'}">+${fmt(winAmount)}</span>
            </div>
          `;
        } else {
          resLayer.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center">
              <span class="text-2xl">💔</span>
              <span class="text-xs font-bold text-stone-300">Pas de chance cette fois !</span>
              <span class="text-[11px] text-stone-500 font-mono-num">0 € • Réessaie au prochain ticket !</span>
            </div>
          `;
        }
      }

      const canvas = document.getElementById('scratchCanvas');
      if (canvas) {
        canvas.style.opacity = '1';
        const ctx = canvas.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        drawScratchFoil(ctx, canvas.width, canvas.height);
      }

      const pText = document.getElementById('scratchProgressText');
      const pBar = document.getElementById('scratchProgressBar');
      if (pText) pText.textContent = '0%';
      if (pBar) pBar.style.width = '0%';

      playCoinWinSound();
      showToast('🎟️ Nouveau ticket acheté pour 50 pièces ! Gratte pour découvrir.');
      updateScratchUI();
    }

    function autoRevealScratch() {
      if (!scratchTicket.active || scratchTicket.isRevealed) return;
      completeScratchReveal();
    }

    function completeScratchReveal() {
      if (!scratchTicket.active || scratchTicket.isRevealed) return;
      scratchTicket.isRevealed = true;
      scratchTicket.active = false;

      const canvas = document.getElementById('scratchCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas.style.opacity = '0';
      }

      const pText = document.getElementById('scratchProgressText');
      const pBar = document.getElementById('scratchProgressBar');
      if (pText) pText.textContent = '100%';
      if (pBar) pBar.style.width = '100%';

      if (scratchTicket.winAmount > 0) {
        const win = scratchTicket.winAmount;
        // crédit fait par le serveur (une seule fois par ticket)
        serverGame({ action: 'scratch_claim', ticketId: scratchTicket.ticketId }).then(() => { updateGlobalUI(); updateScratchUI(); });
        state.scratchTotalWon = (state.scratchTotalWon || 0) + win;
        state.scratchBestWin = Math.max(state.scratchBestWin || 0, win);

        playScratchWinSound(win >= 5000);
        playCoinWinSound();

        showToast(`🎉 FÉLICITATIONS ! Tu as gagné ${fmt(win)} au ticket ${scratchTicket.serial} !`);
        addScratchRecentWin(state.username || 'Moi', win);
      } else {
        showToast('😢 Carte perdante. Tente ta chance sur le prochain ticket !');
      }

      saveState();
      updateScratchUI();
      renderScratchLeaderboard();
    }

    function addScratchRecentWin(player, amount) {
      const list = document.getElementById('scratchRecentWinsList');
      if (!list) return;
      const isJackpot = amount >= 5000;
      const entry = document.createElement('div');
      entry.className = `p-2 rounded-xl flex items-center justify-between border ${isJackpot ? 'bg-amber-500/20 border-amber-400/40 text-amber-200' : 'bg-black/60 border-white/10 text-stone-300'}`;
      entry.innerHTML = `
        <div class="flex items-center gap-2">
          <span>${isJackpot ? '👑' : '🎟️'}</span>
          <span class="font-bold text-xs">${player}</span>
        </div>
        <span class="font-mono-num font-black ${isJackpot ? 'text-amber-300' : 'text-emerald-400'}">+${fmt(amount)}</span>
      `;
      if (list.querySelector('.text-stone-400.text-center')) {
        list.innerHTML = '';
      }
      list.prepend(entry);
      while (list.children.length > 5) {
        list.removeChild(list.lastChild);
      }
    }

    function updateScratchUI() {
      const bal = document.getElementById('scratchBalanceDisplay');
      if (bal) bal.textContent = fmt(state.balance);

      const best = document.getElementById('scratchMyBestWin');
      if (best) best.textContent = fmt(state.scratchBestWin || 0);

      const total = document.getElementById('scratchMyTotalWon');
      if (total) total.textContent = fmt(state.scratchTotalWon || 0);

      const cards = document.getElementById('scratchMyCardsPlayed');
      if (cards) cards.textContent = state.scratchCardsPlayed || 0;

      const buyBtn = document.getElementById('scratchBuyBtn');
      const revBtn = document.getElementById('scratchRevealBtn');
      const hasActiveTicket = Boolean(scratchTicket && scratchTicket.active && !scratchTicket.isRevealed);

      if (buyBtn) {
        if (hasActiveTicket) {
          buyBtn.disabled = true;
          buyBtn.className = "py-3 px-4 rounded-xl font-extrabold text-sm bg-stone-800 text-stone-400 border border-white/10 opacity-60 cursor-not-allowed flex items-center justify-center gap-2";
          buyBtn.innerHTML = `<span>⏳</span> <span>Ticket en cours (gratte-le !)</span>`;
        } else {
          buyBtn.disabled = (state.balance < 50);
          buyBtn.className = "py-3 px-4 rounded-xl font-extrabold text-sm bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:brightness-110 text-black shadow-lg shadow-amber-500/20 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
          buyBtn.innerHTML = `<span>🎟️</span> <span>Acheter un ticket (50 €)</span>`;
        }
      }

      if (revBtn) {
        revBtn.disabled = !hasActiveTicket;
        revBtn.className = hasActiveTicket
          ? "py-3 px-4 rounded-xl font-bold text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2"
          : "py-3 px-4 rounded-xl font-bold text-xs bg-white/10 text-stone-400 border border-white/10 hover:text-white hover:bg-white/15 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed";
      }
    }

    function renderScratchLeaderboard() {
      const container = document.getElementById('scratchLeaderboardList');
      if (!container) return;

      const db = getAccountsDB();
      const meKey = (state.username || '').toLowerCase().trim();
      const players = [];
      const seen = new Set();

      Object.keys(db).forEach(k => {
        const acc = db[k];
        if (acc && acc.username && !k.startsWith('__') && !isUsernameBanned(k)) {
          const uKey = acc.username.toLowerCase().trim();
          const best = Math.max(acc.scratchBestWin || 0, acc.data?.scratchBestWin || 0);
          if (best > 0) {
            seen.add(uKey);
            players.push({
              name: acc.username,
              avatar: getAvatarDisplay(acc),
              bestWin: best,
              totalWon: Math.max(acc.scratchTotalWon || 0, acc.data?.scratchTotalWon || 0),
              isMe: isUserLoggedIn() && uKey === meKey
            });
          }
        }
      });

      if (isUserLoggedIn() && state.username && (state.scratchBestWin || 0) > 0 && !seen.has(meKey)) {
        players.push({
          name: state.username,
          avatar: getAvatarDisplay(state),
          bestWin: state.scratchBestWin || 0,
          totalWon: state.scratchTotalWon || 0,
          isMe: true
        });
      }

      players.sort((a, b) => b.bestWin - a.bestWin || b.totalWon - a.totalWon);

      if (players.length === 0) {
        container.innerHTML = `
          <div class="p-4 rounded-xl bg-black/40 border border-white/5 text-center text-xs text-stone-500">
            Aucun gagnant pour l'instant. Sois le premier à remporter un gros gain au grattage !
          </div>
        `;
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];
      container.innerHTML = players.slice(0, 10).map((p, idx) => `
        <div class="flex items-center justify-between p-2.5 rounded-xl border ${p.isMe ? 'bg-amber-500/15 border-amber-400/50 ring-1 ring-amber-400/30' : 'bg-black/50 border-white/5'}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-sm font-black w-6 text-center">${medals[idx] || (idx + 1)}</span>
            <div class="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-base shrink-0">
              ${p.avatar}
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold truncate ${p.isMe ? 'text-amber-200' : 'text-stone-200'}">
                ${p.name} ${p.isMe ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-extrabold ml-1">Moi</span>' : ''}
              </div>
              <div class="text-[10px] text-stone-400 font-mono-num">Total : ${fmt(p.totalWon)}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono-num font-black text-xs text-amber-300">+${fmt(p.bestWin)}</div>
            <div class="text-[9px] text-stone-500 uppercase">Record</div>
          </div>
        </div>
      `).join('');
    }
