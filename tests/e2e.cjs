// Test de bout en bout : deux navigateurs, une table de poker, une main complète.
// Usage : node tests/e2e.cjs   (le serveur local doit tourner sur le port 8099)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
const stub = fs.readFileSync(path.join(__dirname, 'three-stub.js'), 'utf8');
const errors = [];
let checks = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) { console.error('  ✗ ' + msg); errors.push(msg); } else console.log('  ✓ ' + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, name, balance) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.includes('three.min.js')) return route.fulfill({ contentType: 'application/javascript', body: stub });
    if (url.includes('tailwindcss')) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.includes('fonts.googleapis')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] pageerror: ${e.message}`); console.error(`  ✗ [${name}] pageerror: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) console.log(`  [${name}] console.error: ${m.text()}`); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.hidden{display:none !important}' });
  await sleep(600);
  // vrai compte créé sur le serveur (le solde est géré par le serveur)
  const reg = await page.evaluate((n) => gatewayAction({ action: 'register', username: n, password: 'abc123', avatar: n === 'Alice' ? '🦊' : '🐺' }), name);
  if (!reg.ok) throw new Error('inscription impossible : ' + JSON.stringify(reg));
  await fetch(`${BASE}/__test/balance?user=${encodeURIComponent(name)}&value=${balance}`);
  await page.evaluate(async ([r, b]) => {
    _AntiBotGuard.verify = () => true;
    setAuthToken(r.token);
    state.username = r.row.username;
    state.balance = b;
    state.avatarEmoji = r.row.avatar;
    localStorage.setItem(STORAGE_KEY_SESSION, r.row.username);
    try { saveState(); } catch (e) {}
    await refreshWallet();
  }, [reg, balance]);
  return { ctx, page, name };
}

const view = (p) => p.page.evaluate(() => PokerMulti.lastView && JSON.parse(JSON.stringify(PokerMulti.lastView)));
const bal = (p) => p.page.evaluate(() => state.balance);
const waitFor = async (fn, ms = 8000, step = 150) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
};

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('— Connexion de deux joueurs');
    const A = await newPlayer(browser, 'Alice', 20000);
    const B = await newPlayer(browser, 'Bob', 20000);

    for (const p of [A, B]) {
      await p.page.evaluate(() => switchRoom('poker'));
      const shown = await waitFor(() => p.page.evaluate(() => !document.getElementById('pmLobby').classList.contains('hidden') && document.querySelectorAll('#pmLobbyBody .pm-tile').length === 4));
      ok(shown, `${p.name} voit d'abord le choix du type de salon (4 cartes)`);
    }
    ok(await A.page.evaluate(() => !/priv/i.test(document.getElementById('pmLobby').innerText) && !document.getElementById('pmJoinCode')), 'plus aucune trace de salon privé dans le lobby');
    ok((await A.page.evaluate(() => document.querySelectorAll('#pmLobbyBody button[onclick^="PokerMulti.askJoin"]').length)) === 0, 'aucun salon affiché tant qu\'un type n\'est pas choisi');
    for (const cat of ['1v1', '4max', '6max']) {
      await A.page.evaluate((c) => PokerMulti.setLobbyView(c), cat);
      const names = await A.page.evaluate(() => [...document.querySelectorAll('#pmLobbyBody .pm-card .font-black.text-white')].map((e) => e.textContent.trim()));
      ok(JSON.stringify(names) === JSON.stringify(['Salon 1', 'Salon 2', 'Salon 3']), `type ${cat} : Salon 1, 2, 3 (${names})`);
    }
    await A.page.evaluate(() => PokerMulti.setLobbyView('1v1'));
    await B.page.evaluate(() => PokerMulti.setLobbyView('1v1'));

    console.log('— Alice rejoint le duel (mise 5 000 €)');
    await A.page.evaluate(() => PokerMulti.askJoin('poker_1v1_1'));
    ok(await A.page.evaluate(() => !document.getElementById('pmBuyIn').classList.contains('hidden')), 'fenêtre de mise de départ ouverte');
    await A.page.evaluate(() => { document.getElementById('pmBuyInInput').value = '5000'; });
    await A.page.evaluate(() => PokerMulti.confirmBuyIn());
    ok(await waitFor(async () => (await A.page.evaluate(() => PokerMulti.mode)) === 'multi'), 'Alice est en mode multi');
    ok((await bal(A)) === 15000, `solde d'Alice débité de la mise (${await bal(A)})`);

    console.log('— Bob rejoint la même table');
    await B.page.evaluate(() => PokerMulti.askJoin('poker_1v1_1'));
    await B.page.evaluate(() => { document.getElementById('pmBuyInInput').value = '5000'; });
    await B.page.evaluate(() => PokerMulti.confirmBuyIn());
    ok(await waitFor(async () => (await B.page.evaluate(() => PokerMulti.mode)) === 'multi'), 'Bob est en mode multi');
    ok(await waitFor(async () => { const v = await view(A); return v && v.seats.filter(Boolean).length === 2; }), 'Alice voit Bob assis');
    ok(await A.page.evaluate(() => PokerMulti.game.players[3].name.includes('Bob')), 'Bob apparaît sur le siège en face (1v1)');

    console.log('— Les deux se déclarent prêts');
    ok(await waitFor(() => A.page.evaluate(() => { const b = document.getElementById('pmReadyBtn'); const r = document.getElementById('pmReadyBox'); return r.classList.contains('show') && !b.disabled && /prêt/i.test(b.textContent); })), 'le gros bouton « Je suis prêt » est affiché au centre');
    await A.page.evaluate(() => document.getElementById('pmReadyBtn').click());
    ok(await waitFor(() => A.page.evaluate(() => /Tu es prêt/.test(document.getElementById('pmReadyBtn').textContent))), 'après clic : « Tu es prêt » (1/2 prêts)');
    await B.page.evaluate(() => document.getElementById('pmReadyBtn').click());
    ok(await waitFor(async () => { const v = await view(A); return v && v.status === 'playing'; }, 12000), 'la main démarre après le décompte');
    await sleep(1200);

    for (const p of [A, B]) {
      const info = await p.page.evaluate(() => {
        const g = PokerMulti.game;
        return { hero: g.players[0].hand.length, opp: g.players[3].hand.length, oppNoCards: g.players[3].noCards, pot: g.pot, heroTurn: g.isHeroTurn, bb: g.bigBlind };
      });
      ok(info.hero === 2, `${p.name} voit ses 2 cartes`);
      ok(info.opp === 0 && info.oppNoCards === false, `${p.name} ne voit PAS les cartes de l'adversaire`);
      ok(info.pot === 150, `pot = blindes (150 €) côté ${p.name} (${info.pot})`);
    }

    console.log('— Une main jouée via les vrais boutons du HUD');
    const turnOf = async () => {
      for (const p of [A, B]) if (await p.page.evaluate(() => PokerMulti.game.isHeroTurn)) return p;
      return null;
    };
    const click = (p, id) => p.page.evaluate((i) => document.getElementById(i).click(), id);
    // pré-flop : petite blinde suit, grosse blinde parole
    let actor = await waitFor(turnOf, 4000);
    ok(!!actor, 'un joueur a la main');
    const sbLabel = await actor.page.evaluate(() => document.getElementById('btnCheckCallMainText').textContent);
    ok(sbLabel === 'SUIVRE', `la petite blinde doit suivre (bouton: ${sbLabel})`);
    await click(actor, 'btnActionCheckCall');
    const other = actor === A ? B : A;
    ok(await waitFor(() => other.page.evaluate(() => PokerMulti.game.isHeroTurn), 4000), 'la grosse blinde a ensuite la parole');
    await click(other, 'btnActionCheckCall');
    ok(await waitFor(async () => (await view(A)).phase === 'flop', 4000), 'le flop est distribué');
    await sleep(1800);
    ok((await A.page.evaluate(() => PokerMulti.game.communityCards.length)) === 3, 'le flop (3 cartes) est affiché');

    // flop : relance de celui qui parle, l'autre se couche
    actor = await waitFor(turnOf, 4000);
    await actor.page.evaluate(() => { const s = document.getElementById('demoRaiseSlider'); s.value = s.min; PokerMulti.game.onSliderInput(s.value); });
    await click(actor, 'btnActionRaise');
    const defender = actor === A ? B : A;
    ok(await waitFor(() => defender.page.evaluate(() => PokerMulti.game.isHeroTurn), 4000), 'le second joueur répond à la relance');
    const tocall = await defender.page.evaluate(() => document.getElementById('btnCheckCallSubText').textContent);
    ok(/\d/.test(tocall) && !tocall.startsWith('0 '), `montant à suivre affiché (${tocall})`);
    await click(defender, 'btnActionFold');
    ok(await waitFor(async () => (await view(A)).status === 'showdown', 4000), 'fin de main (adversaire couché)');
    await sleep(500);
    const banner = await A.page.evaluate(() => ({ hidden: document.getElementById('winnerBannerModal').classList.contains('hidden'), name: document.getElementById('bannerWinnerName').textContent, pot: document.getElementById('bannerPotWon').textContent }));
    ok(!banner.hidden, 'la bannière du vainqueur est affichée');
    ok(banner.name.includes(actor.name), `le vainqueur affiché est ${actor.name} (${banner.name})`);
    const vEnd = await view(A);
    const stacks = vEnd.seats.filter(Boolean).reduce((s, x) => s + x.stack, 0);
    ok(stacks === 10000, `jetons conservés à table (${stacks})`);

    console.log('— Départ : les jetons reviennent sur le solde');
    await A.page.evaluate(() => PokerMulti.leave());
    await B.page.evaluate(() => PokerMulti.leave());
    ok(await waitFor(async () => (await A.page.evaluate(() => PokerMulti.mode)) === 'lobby' && (await B.page.evaluate(() => PokerMulti.mode)) === 'lobby'), 'retour au lobby');
    const total = (await bal(A)) + (await bal(B));
    ok(total === 40000, `argent total conservé : ${total} (Alice ${await bal(A)}, Bob ${await bal(B)})`);

    console.log('— Table de 6 : sièges libres');
    await A.page.evaluate(() => { PokerMulti.setLobbyView('6max'); PokerMulti.askJoin('poker_6max_1'); });
    await A.page.evaluate(() => { document.getElementById('pmBuyInInput').value = '3000'; });
    await A.page.evaluate(() => PokerMulti.confirmBuyIn());
    ok(await waitFor(async () => (await A.page.evaluate(() => PokerMulti.mode)) === 'multi'), 'Alice rejoint le Salon 1 de la table de 6');
    ok(await waitFor(() => A.page.evaluate(() => /Table de 6 • Salon 1/.test(document.getElementById('pmTableName').textContent))), 'la barre affiche « Table de 6 • Salon 1 »');
    ok(await waitFor(() => A.page.evaluate(() => PokerMulti.game.players.filter((p) => p.empty && p.name === 'Siège libre').length >= 4)), 'les sièges libres sont indiqués');
    ok(await A.page.evaluate(() => document.getElementById('pmReadyBox').classList.contains('show') && document.getElementById('pmReadyBtn').disabled), 'seul : bouton « en attente d\'un joueur » (grisé)');

    console.log('— Fermeture brutale de l\'onglet d\'Alice : sa mise est récupérable');
    const balBefore = await bal(A);
    await A.page.evaluate(() => PokerMulti.onLeaveRoom());
    await sleep(500);
    await A.page.evaluate(() => switchRoom('hall'));
    await A.page.evaluate(() => switchRoom('poker'));
    await sleep(1500);
    const balAfter = await bal(A);
    ok(balAfter === balBefore + 3000, `mise de 3 000 € rendue après départ brutal (${balBefore} → ${balAfter})`);

    console.log('— Mode solo toujours fonctionnel');
    await A.page.evaluate(() => { PokerMulti.setSoloFormat('4max'); PokerMulti.setSoloBlind(100); PokerMulti.startSolo(); });
    await sleep(800);
    const solo = await A.page.evaluate(() => ({ mode: PokerMulti.mode, hand: pokerGame.players[0].hand.length, bots: pokerGame.getActivePlayers().length, multi: !!pokerGame.isMulti }));
    ok(solo.mode === 'solo' && solo.hand === 2 && solo.bots === 4 && !solo.multi, `partie solo lancée (${JSON.stringify(solo)})`);
    const soloBefore = await bal(A);
    await sleep(2500);
    ok((await bal(A)) === soloBefore && soloBefore === (await A.page.evaluate(async () => (await gatewayAction({ action: 'wallet_balance' })).balance)), 'poker solo = jetons d\'entraînement : le vrai solde ne bouge pas');
  } catch (e) {
    console.error('ERREUR TEST', e);
    errors.push(String(e));
  } finally {
    await browser.close();
  }
  console.log(`\n${checks} vérifications, ${errors.length} erreur(s)`);
  process.exit(errors.length ? 1 : 0);
})();
