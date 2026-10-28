/* ========================================================================== */
/*  POKER 3D — ANIMATIONS : distribution des cartes, jetons, fin de main      */
/*  Chargé après poker3d.js et poker3d-scene.js.                              */
/*  Tout est déduit de l'état du jeu (solo ou en ligne) à chaque mise à jour. */
/* ========================================================================== */
(function () {
  'use strict';
  if (typeof Poker3DExperience === 'undefined' || typeof THREE === 'undefined') return;
  const P = Poker3DExperience.prototype;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const keyOf = (c) => (c ? `${c.rank}${c.suit}` : '');
  const DEALER_HAND = V3(0, 0.55, -1.9);   // main du croupier (devant lui, au-dessus de la table)

  /* ------------------------------------------------------------------------ */
  /* Mini gestionnaire d'animations (appelé à chaque image)                    */
  /* ------------------------------------------------------------------------ */
  P.addAnim = function (delay, dur, update, done) {
    (this._anims = this._anims || []).push({ t0: performance.now() + delay, dur, update, done });
  };

  P.tickAnims = function (now) {
    if (this._anims && this._anims.length) {
      const keep = [];
      for (const a of this._anims) {
        if (now < a.t0) { keep.push(a); continue; }
        const k = Math.min(1, (now - a.t0) / a.dur);
        try { a.update(k); } catch (e) { /* une animation ratée ne doit jamais bloquer le jeu */ }
        if (k < 1) keep.push(a);
        else if (a.done) { try { a.done(); } catch (e) { /* idem */ } }
      }
      this._anims = keep;
    }
    if (this.win) this.applyWinBadges();
  };

  /* ------------------------------------------------------------------------ */
  /* Positions utiles                                                          */
  /* ------------------------------------------------------------------------ */
  P.seatOrigin = function (i) {
    if (i === 0) return this.portraitMode ? V3(0, 0.3, Poker3DExperience.PORTRAIT.heroZ) : V3(0, 0.3, 1.55);
    const pair = this.botCards && this.botCards[i - 1];
    if (!pair) return V3(0, 0.3, 0);
    return V3((pair[0].position.x + pair[1].position.x) / 2, 0.3, (pair[0].position.z + pair[1].position.z) / 2);
  };

  P.betSpot = function (i) {
    const PT = Poker3DExperience.PORTRAIT;
    if (this.portraitMode) {
      if (i === 0) return V3(PT.heroChip[0], 0.02, PT.heroChip[1]);
      const s = PT.bots[i - 1];
      return s ? V3(s.chips[0], 0.02, s.chips[1]) : V3(0, 0.02, 0);
    }
    if (i === 0) return V3(-0.75, 0.02, 1.35 * 0.62);
    const th = this.thetas[i - 1];
    return V3(Math.cos(th + 0.35) * 2.6 * 0.68, 0.02, Math.sin(th + 0.35) * 1.35 * 0.68);
  };

  P.potSpot = function () {
    return V3(0, 0.02, this.portraitMode ? Poker3DExperience.PORTRAIT.potZ : -1.05);
  };

  /* ------------------------------------------------------------------------ */
  /* Vol de jetons d'un point à un autre                                       */
  /* ------------------------------------------------------------------------ */
  P.flyChips = function (from, to, n, color, delay, onDone) {
    const geo = this._chipGeo || (this._chipGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.015, 24));
    const mats = this.getChipMaterials(color);
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mats);
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      const a = from.clone().add(V3((Math.random() - 0.5) * 0.14, 0, (Math.random() - 0.5) * 0.14));
      const b = to.clone().add(V3((Math.random() - 0.5) * 0.1, i * 0.016, (Math.random() - 0.5) * 0.1));
      this.addAnim(delay + i * 70, 520, (k) => {
        const e = easeOut(k);
        m.visible = true;
        m.position.set(lerp(a.x, b.x, e), lerp(a.y, b.y, e) + Math.sin(Math.PI * k) * 0.55, lerp(a.z, b.z, e));
        m.rotation.y += 0.35;
      }, () => {
        this.scene.remove(m);
        if (++landed === n && onDone) onDone();
      });
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Distribution des cartes du joueur et des adversaires                       */
  /* ------------------------------------------------------------------------ */
  P._hasCards = function (i) {
    const g = this.game;
    const p = g && g.players && g.players[i];
    if (!p || p.empty) return false;
    if (i > 0 && !(this.activeBotIndices || []).includes(i - 1)) return false;
    return (p.hand && p.hand.length >= 2) || p.noCards === false;
  };

  P.startDealAnimation = function () {
    const g = this.game;
    if (!g || !g.players) return;
    const n = g.players.length;
    const dealer = g.dealerIndex != null ? g.dealerIndex : 0;
    const order = [];
    for (let s = 1; s <= n; s++) { const i = (dealer + s) % n; if (this._hasCards(i)) order.push(i); }
    if (!order.length) return;

    this.dealerGesture();
    this.dealPending = new Set();
    this.heroHandHold = order.includes(0);
    clearTimeout(this._dealSafety);
    this._dealSafety = setTimeout(() => { this.dealPending = new Set(); this.heroHandHold = false; this.syncTable3D(); }, 5000);

    let t = 0;
    for (let r = 0; r < 2; r++) {
      order.forEach((i) => {
        const target = i === 0 ? this.heroCards[r] : (this.botCards[i - 1] || [])[r];
        if (!target) return;
        this.dealPending.add(target);
        const card = this.createCardObject('?', '?', true, i === 0 ? 0.75 : 0.55);
        card.rotation.set(-Math.PI / 2, 0, 0);
        card.scale.copy(target.scale);
        card.visible = false;
        this.scene.add(card);
        const end = target.position.clone();
        const endRot = target.rotation.z;
        const last = r === 1;
        this.addAnim(t, 430, (k) => {
          const e = easeOut(k);
          card.visible = true;
          card.position.set(lerp(DEALER_HAND.x, end.x, e), lerp(DEALER_HAND.y, end.y, e) + Math.sin(Math.PI * k) * 0.45, lerp(DEALER_HAND.z, end.z, e));
          card.rotation.z = lerp(0, endRot + Math.PI * 2, e);
        }, () => {
          this.scene.remove(card);
          this.dealPending.delete(target);
          if (i === 0 && last) this.heroHandHold = false;
          this.syncTable3D();
        });
        t += 150;
      });
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Cartes communes : le croupier les lance et elles se retournent             */
  /* ------------------------------------------------------------------------ */
  P.animateDealCommunityCard = function (index, card) {
    const mesh = this.communityCardMeshes[index];
    if (!mesh) return;
    this.dealerGesture();
    const end = mesh.position.clone();
    end.y = 0.01;
    const baseX = mesh.scale.x;
    mesh._flying = true;
    mesh._flipBack = true;
    this.setCardBack(mesh);
    this.setCardOpacity(mesh, 1.0);
    mesh.visible = true;
    mesh.position.copy(DEALER_HAND);
    this.addAnim(0, 560, (k) => {
      const e = easeOut(k);
      mesh.visible = true;
      mesh.position.set(lerp(DEALER_HAND.x, end.x, e), lerp(DEALER_HAND.y, end.y, e) + Math.sin(Math.PI * k) * 0.7, lerp(DEALER_HAND.z, end.z, e));
      mesh.scale.x = baseX * Math.max(0.03, Math.abs(Math.cos(Math.PI * k)));
      if (k >= 0.5 && mesh._flipBack) {
        this.setCardFace(mesh, card.rank, card.suit);
        mesh._flipBack = false;
      }
    }, () => {
      mesh._flying = false;
      mesh._flipBack = false;
      mesh.scale.x = baseX;
      mesh.position.copy(end);
      this.setCardFace(mesh, card.rank, card.suit);
      this._boardLanded = Math.max(this._boardLanded || 0, index + 1);
      this.updateBoardWidget();
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Jetons : mises qui glissent vers le centre, pot qui part chez le gagnant  */
  /* ------------------------------------------------------------------------ */
  P.resyncChips = function () {
    if (this._chipArgs && this.game) this.syncChips3D(this._chipArgs[0], this._chipArgs[1]);
  };

  P.chipColorFor = function (i) {
    return i === 0 ? '#d97706' : (i % 2 === 0 ? '#16a34a' : '#2563eb');
  };

  // Compare la mise de chaque joueur avec la précédente et lance les vols de jetons
  P.detectChipMoves = function (pot, players) {
    const prev = this._prevBets || [];
    this.betHold = this.betHold || {};
    if (!this.awarded && !this.awardPending) {
      let gather = false;
      players.forEach((p, i) => {
        const cur = (p && p.currentBet) || 0;
        const pv = prev[i] || 0;
        if (cur > pv && !p.empty) {
          this.betHold[i] = (this.betHold[i] || 0) + 1;
          const n = Math.min(5, Math.max(2, Math.ceil((cur - pv) / 200)));
          this.flyChips(this.seatOrigin(i), this.betSpot(i), n, this.chipColorFor(i), 0, () => {
            this.betHold[i] = Math.max(0, (this.betHold[i] || 1) - 1);
            this.resyncChips();
          });
        } else if (cur === 0 && pv > 0) {
          gather = true;
          const n = Math.min(5, Math.max(2, Math.ceil(pv / 200)));
          this._gathering = (this._gathering || 0) + 1;
          if (this.potFrozen == null) this.potFrozen = this._prevPot || 0;
          this.flyChips(this.betSpot(i), this.potSpot(), n, this.chipColorFor(i), 0, () => {
            this._gathering = Math.max(0, (this._gathering || 1) - 1);
            if (!this._gathering) { this.potFrozen = null; this.resyncChips(); }
          });
        }
      });
      void gather;
    }
    this._prevBets = players.map((p) => (p && p.currentBet) || 0);
    this._prevPot = pot;
  };

  P.syncChips3D = function (potAmount, players) {
    this._chipArgs = [potAmount, players];
    this.detectChipMoves(potAmount, players);
    const PT = Poker3DExperience.PORTRAIT;
    const portrait = !!this.portraitMode;
    const chipRadius = 0.08;
    const chipHeight = 0.015;
    if (!this._chipGeo) this._chipGeo = new THREE.CylinderGeometry(chipRadius, chipRadius, chipHeight, 24);
    const chipGeo = this._chipGeo;
    const hold = this.betHold || {};
    const shownPot = this.awarded ? 0 : (this.potFrozen != null ? this.potFrozen : potAmount);
    const potSpot = this.potSpot();

    const addChip = (group, mats, x, h, z, jitter) => {
      const chip = new THREE.Mesh(chipGeo, mats);
      chip.position.set(x + (Math.random() - 0.5) * jitter, chipHeight / 2 + h * chipHeight, z + (Math.random() - 0.5) * jitter);
      chip.rotation.y = Math.random() * Math.PI;
      chip.castShadow = true;
      chip.receiveShadow = true;
      group.add(chip);
    };

    while (this.centerPotGroup.children.length > 0) this.centerPotGroup.remove(this.centerPotGroup.children[0]);
    if (shownPot > 0) {
      const stacks = [{ x: -0.17, color: '#d97706' }, { x: 0.0, color: '#dc2626' }, { x: 0.17, color: '#16a34a' }];
      const count = Math.min(5, Math.max(1, Math.ceil(shownPot / 1500)));
      stacks.forEach((st) => {
        const mats = this.getChipMaterials(st.color);
        for (let h = 0; h < count; h++) addChip(this.centerPotGroup, mats, st.x, h, potSpot.z, 0.002);
      });
    }

    while (this.heroChipGroup.children.length > 0) this.heroChipGroup.remove(this.heroChipGroup.children[0]);
    const hero = players[0];
    if (!this.awarded && !hold[0] && hero && hero.currentBet > 0) {
      const spot = this.betSpot(0);
      const mats = this.getChipMaterials('#d97706');
      const count = Math.min(5, Math.max(1, Math.ceil(hero.currentBet / 200)));
      for (let h = 0; h < count; h++) addChip(this.heroChipGroup, mats, spot.x, h, spot.z, 0.003);
    }

    for (let i = 1; i < players.length; i++) {
      const bot = players[i];
      const grp = this.botChipGroups[i - 1];
      if (!grp) continue;
      while (grp.children.length > 0) grp.remove(grp.children[0]);
      if (!this.awarded && !hold[i] && this.activeBotIndices.includes(i - 1) && bot && bot.currentBet > 0) {
        const spot = this.betSpot(i);
        const mats = this.getChipMaterials(this.chipColorFor(i));
        const count = Math.min(5, Math.max(1, Math.ceil(bot.currentBet / 200)));
        for (let h = 0; h < count; h++) addChip(grp, mats, spot.x, h, spot.z, 0.003);
      }
    }
    void PT; void portrait;
  };

  /* ------------------------------------------------------------------------ */
  /* Détection d'une nouvelle main et de la fin de main                         */
  /* ------------------------------------------------------------------------ */
  P.resetHandAnimState = function () {
    this.awarded = false;
    this.awardPending = false;
    this.potFrozen = null;
    this._gathering = 0;
    this.betHold = {};
    this._prevBets = [];
    this._prevPot = 0;
    this._boardLanded = 0;
    if (this.game) this.game.lastWon = null;
    this.clearWin();
    (this.communityCardMeshes || []).forEach((m) => { m._flying = false; m._flipBack = false; });
  };

  P.detectHandEvents = function () {
    const g = this.game;
    if (!g || !g.players || !this.heroCards) return;
    const hero = g.players[0];
    const key = (hero && hero.hand && hero.hand.length === 2)
      ? hero.hand.map(keyOf).join('')
      : (g._handId != null ? 'm' + g._handId : null);
    if (!key) { this._dealKey = null; }
    else if (key !== this._dealKey) {
      this._dealKey = key;
      this.resetHandAnimState();
      if (!(g.communityCards && g.communityCards.length)) this.startDealAnimation();
      else this._boardLanded = null;
    }
    // fin de main : dès que le jeu désigne un gagnant, on laisse 0,9 s pour voir les cartes puis le pot part
    const ph = g.phase;
    if ((ph === 'showdown' || ph === 'finished') && !this.awarded && !this.awardPending && this.winnerIndexes().length) {
      this.awardPending = true;
      const hk = this._dealKey;
      setTimeout(() => this.doAward(hk, 0), 900);
    }
    this._prevPhase = ph;
  };

  P.winnerIndexes = function () {
    const g = this.game;
    const out = [];
    (g.players || []).forEach((p, i) => {
      if (!p || p.empty) return;
      if ((p.won > 0) || (g.lastWon && g.lastWon[p.id] > 0) || /Vainqueur/i.test(p.status || '')) out.push(i);
    });
    // main terminée parce que tout le monde s'est couché : le seul joueur encore en jeu gagne
    if (!out.length && g.phase === 'finished') {
      const alive = (g.players || []).map((p, i) => [p, i]).filter(([p, i]) => p && !p.empty && !p.folded && (i === 0 || (this.activeBotIndices || []).includes(i - 1)));
      if (alive.length === 1) out.push(alive[0][1]);
    }
    return out;
  };

  P.doAward = function (handKey, tries) {
    const g = this.game;
    if (!g || handKey !== this._dealKey || this.awarded) return;
    const winners = this.winnerIndexes();
    if (!winners.length) {
      if (tries < 4) setTimeout(() => this.doAward(handKey, tries + 1), 500);
      else this.awardPending = false;
      return;
    }
    this.awarded = true;
    this.awardPending = false;

    // le pot et les mises restantes volent vers le(s) gagnant(s)
    const prevBets = this._prevBets || [];
    const colors = ['#d97706', '#dc2626', '#16a34a'];
    if ((this._prevPot || g.pot || 0) > 0) {
      winners.forEach((w, wi) => {
        colors.forEach((col, ci) => this.flyChips(this.potSpot(), this.seatOrigin(w), 3, col, wi * 160 + ci * 90, null));
      });
    }
    (g.players || []).forEach((p, i) => {
      if ((prevBets[i] || 0) > 0) this.flyChips(this.betSpot(i), this.seatOrigin(winners[0]), 3, this.chipColorFor(i), 0, null);
    });
    this.resyncChips();

    // mise en valeur : combinaison gagnante
    const comm = g.communityCards || [];
    const boardKeys = new Set();
    const holeKeys = new Set();
    const names = {};
    winners.forEach((w) => {
      const p = g.players[w];
      if (p.hand && p.hand.length === 2 && comm.length >= 3 && typeof evaluateBestHand3D === 'function') {
        const best = evaluateBestHand3D([...p.hand, ...comm]);
        if (best && best.cards) {
          const used = new Set(best.cards.map(keyOf));
          comm.forEach((c) => { if (used.has(keyOf(c))) boardKeys.add(keyOf(c)); });
          p.hand.forEach((c) => { if (used.has(keyOf(c))) holeKeys.add(keyOf(c)); });
        }
        if (best && best.name) names[w] = best.name.replace(/[👑🔥💣♦️⚡🎯✨]/g, '').trim();
      } else if (p.bestHand && p.bestHand.name) {
        names[w] = p.bestHand.name.replace(/[👑🔥💣♦️⚡🎯✨]/g, '').trim();
      }
    });
    this.win = { idx: winners, boardKeys, holeKeys, names };
    this.applyWinHighlights3D();
    this.applyWinBadges();
  };

  /* ------------------------------------------------------------------------ */
  /* Mise en valeur du gagnant                                                  */
  /* ------------------------------------------------------------------------ */
  P.applyWinHighlights3D = function () {
    const w = this.win;
    const g = this.game;
    if (!w || !g) return;
    const comm = g.communityCards || [];
    const hasBest = w.boardKeys.size > 0;
    (this.communityCardMeshes || []).forEach((m, i) => {
      if (m._flying || i >= comm.length) return;
      const inBest = !hasBest || w.boardKeys.has(keyOf(comm[i]));
      this.setCardOpacity(m, inBest ? 1 : 0.4);
      m.position.y = hasBest && inBest ? 0.06 : 0.01;
    });
    (this.botCards || []).forEach((pair, i) => {
      const idx = i + 1;
      const p = g.players[idx];
      if (!p || !this.activeBotIndices.includes(i) || p.empty || p.noCards || p.folded) return;
      const isWin = w.idx.includes(idx);
      pair.forEach((m) => {
        if (m._baseY == null) m._baseY = m.position.y;
        this.setCardOpacity(m, isWin ? 1 : 0.4);
        m.position.y = m._baseY + (isWin ? 0.05 : 0);
      });
    });
  };

  P.applyWinBadges = function () {
    const w = this.win;
    if (!w) return;
    if (!document.getElementById('pk-win-css')) {
      const st = document.createElement('style');
      st.id = 'pk-win-css';
      st.textContent = `
        .pk-winner { border-color:#fbbf24 !important; box-shadow:0 0 26px rgba(251,191,36,.85), 0 4px 16px rgba(0,0,0,.85) !important; opacity:1 !important; animation:pkWinPulse 1.1s ease-in-out infinite; }
        @keyframes pkWinPulse { 0%,100% { transform:translate(-50%,-100%) scale(1); } 50% { transform:translate(-50%,-100%) scale(1.06); } }
        .pk-win-badge { position:absolute; left:50%; bottom:calc(100% + 6px); transform:translateX(-50%); background:linear-gradient(90deg,#f59e0b,#fde68a); color:#111; font:900 11px system-ui,sans-serif; padding:3px 9px; border-radius:9999px; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,.6); }
        #pokerHeroHandWidget.win .hh-card { box-shadow:0 0 22px rgba(251,191,36,.95), 0 6px 18px rgba(0,0,0,.65); border-color:#fbbf24; }`;
      document.head.appendChild(st);
    }
    (this.htmlNameplateElements || []).forEach((el, bi) => {
      const idx = bi + 1;
      const isWin = w.idx.includes(idx);
      let badge = el.querySelector('.pk-win-badge');
      if (isWin) {
        el.classList.add('pk-winner');
        const txt = '🏆 ' + (w.names[idx] || 'Vainqueur');
        if (!badge) { badge = document.createElement('div'); badge.className = 'pk-win-badge'; el.appendChild(badge); }
        if (badge.textContent !== txt) badge.textContent = txt;
      } else {
        el.classList.remove('pk-winner');
        if (badge) badge.remove();
      }
    });
    const hw = document.getElementById('pokerHeroHandWidget');
    if (hw) hw.classList.toggle('win', w.idx.includes(0));
  };

  P.clearWin = function () {
    const had = !!this.win;
    this.win = null;
    (this.htmlNameplateElements || []).forEach((el) => {
      el.classList.remove('pk-winner');
      const b = el.querySelector('.pk-win-badge');
      if (b) b.remove();
    });
    const hw = document.getElementById('pokerHeroHandWidget');
    if (hw) hw.classList.remove('win');
    if (had) {
      (this.communityCardMeshes || []).forEach((m) => { if (!m._flying) { m.position.y = 0.01; this.setCardOpacity(m, 1); } });
      (this.botCards || []).forEach((pair) => pair.forEach((m) => { if (m._baseY != null) m.position.y = m._baseY; }));
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Branchement sur la mise à jour de la scène                                 */
  /* ------------------------------------------------------------------------ */
  const origSync = P.syncTable3D;
  P.syncTable3D = function () {
    try { this.detectHandEvents(); } catch (e) { console.warn('[poker anim]', e); }
    const r = origSync.apply(this, arguments);
    try {
      // cartes encore en vol : invisibles tant qu'elles ne sont pas arrivées
      if (this.dealPending && this.dealPending.size) this.dealPending.forEach((m) => { m.visible = false; });
      (this.communityCardMeshes || []).forEach((m) => { if (m._flying && m._flipBack) this.setCardBack(m); });
      if (this.win) this.applyWinHighlights3D();
    } catch (e) { console.warn('[poker anim]', e); }
    return r;
  };
})();
