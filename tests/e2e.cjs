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
  await page.evaluate(([n, b]) => {
    state.username = n;
    state.balance = b;
    state.avatarEmoji = n === 'Alice' ? '🦊' : '🐺';
    try { saveState(); } catch (e) {}
  }, [name, balance]);
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
      const shown = await waitFor(() => p.page.evaluate(() => !document.getElementById('pmLobby').classList.contains('hidden') && document.querySelectorAll('#pmLobbyBody .pm-card').length > 3));
      ok(shown, `${p.name} voit le lobby avec les tables`);
    }
    const nCards = await A.page.evaluate(() => document.querySelectorAll('#pmLobbyBody button[onclick^="PokerMulti.askJoin"]').length);
    ok(nCards === 9, `9 tables publiques affichées (${nCards})`);

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
    await A.page.evaluate(() => PokerMulti.ready());
    await B.page.evaluate(() => PokerMulti.ready());
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

    console.log('— Salon privé par code');
    await A.page.evaluate(() => { PokerMulti.setPrivSeats(3); PokerMulti.setPrivBlind(100); PokerMulti.createPrivate(); });
    await A.page.evaluate(() => { document.getElementById('pmBuyInInput').value = '3000'; });
    await A.page.evaluate(() => PokerMulti.confirmBuyIn());
    ok(await waitFor(async () => (await A.page.evaluate(() => PokerMulti.mode)) === 'multi'), 'Alice a créé un salon privé');
    const code = await A.page.evaluate(() => PokerMulti.tableId.slice(5).toUpperCase());
    ok(/^[A-Z0-9]{6}$/.test(code), `code du salon : ${code}`);
    ok(await waitFor(() => A.page.evaluate(() => !document.getElementById('pmCodeBtn').classList.contains('hidden'))), 'le code est affiché dans la barre');
    await B.page.evaluate((c) => { document.getElementById('pmJoinCode').value = c; PokerMulti.joinPrivate(); }, code);
    ok(await waitFor(() => B.page.evaluate(() => !document.getElementById('pmBuyIn').classList.contains('hidden'))), 'Bob entre le code et choisit sa mise');
    await B.page.evaluate(() => { document.getElementById('pmBuyInInput').value = '2000'; });
    await B.page.evaluate(() => PokerMulti.confirmBuyIn());
    ok(await waitFor(async () => { const v = await view(B); return v && v.seats.filter(Boolean).length === 2; }), 'Bob est dans le salon privé');
    const vp = await view(B);
    ok(vp.isPrivate && vp.maxSeats === 3, 'salon privé de 3 places');
    ok(await waitFor(() => B.page.evaluate(() => PokerMulti.game.players.filter((p) => p.empty && p.name === 'Siège libre').length >= 1)), 'les sièges libres sont indiqués');
    // mauvais code
    await B.page.evaluate(() => PokerMulti.leave());
    await waitFor(async () => (await B.page.evaluate(() => PokerMulti.mode)) === 'lobby');
    await B.page.evaluate(() => { document.getElementById('pmJoinCode').value = 'ZZZZZZ'; PokerMulti.joinPrivate(); });
    await sleep(700);
    ok(await B.page.evaluate(() => document.getElementById('pmBuyIn').classList.contains('hidden')), 'un code inconnu n\'ouvre pas de table');

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
  } catch (e) {
    console.error('ERREUR TEST', e);
    errors.push(String(e));
  } finally {
    await browser.close();
  }
  console.log(`\n${checks} vérifications, ${errors.length} erreur(s)`);
  process.exit(errors.length ? 1 : 0);
})();
