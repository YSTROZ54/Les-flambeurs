// Test navigateur : blackjack solo et crash passent par le serveur ; un solde falsifié dans le navigateur ne sert à rien.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8080';
const stub = fs.readFileSync(path.join(__dirname, 'three-stub.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route('**/*', (r) => { const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes('three.min.js')) return r.fulfill({ contentType: 'application/javascript', body: stub });
    if (u.includes('tailwindcss') || u.includes('fonts')) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('  ✗ pageerror ' + e.message); bad++; });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await sleep(800);
  const name = 'Wal' + (Date.now() % 99999);
  const reg = await page.evaluate((n) => gatewayAction({ action: 'register', username: n, password: 'abc123', avatar: '🦊' }), name);
  await page.evaluate((r) => { _AntiBotGuard.verify = () => true; setAuthToken(r.token); state.username = r.row.username; state.balance = r.row.balance; localStorage.setItem(STORAGE_KEY_SESSION, r.row.username); }, reg);
  const srvBal = async () => page.evaluate(async () => { const r = await gatewayAction({ action: 'wallet_balance' }); return r.balance; });
  const cliBal = () => page.evaluate(() => state.balance);

  console.log('— Blackjack solo');
  await page.evaluate(() => switchRoom('blackjack'));
  await sleep(500);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { document.getElementById('bjBetInput').value = 100; bj.cooldownRemaining = 0; startBlackjack({}); });
    await sleep(700);
    const st = await page.evaluate(() => ({ active: bj.active, d: bj.dealer.map((c) => c.r), p: bj.player.length }));
    if (st.active) {
      ok(st.d.length === 2 && st.d[1] === '?', 'la carte cachée du croupier n\'est jamais envoyée au navigateur');
      ok((await cliBal()) === (await srvBal()), 'mise prélevée : solde navigateur = solde serveur');
      await page.evaluate(() => bjStand({}, true));
      await sleep(900);
    }
    const end = await page.evaluate(() => ({ active: bj.active, d: bj.dealer.map((c) => c.r), banner: document.getElementById('bjStatusBanner').textContent }));
    ok(!end.active && end.d.every((r) => r !== '?') && end.d.length >= 2, `manche ${i + 1} terminée, croupier révélé (${end.banner.trim().slice(0, 34)}…)`);
    ok((await cliBal()) === (await srvBal()), `manche ${i + 1} : solde navigateur = solde serveur`);
  }

  console.log('— Solde falsifié dans le navigateur');
  const real = await srvBal();
  await page.evaluate(() => { state.balance = 99999999; saveState(); });
  await page.evaluate(() => { document.getElementById('bjBetInput').value = 50000; bj.cooldownRemaining = 0; startBlackjack({}); });
  await sleep(800);
  ok(!(await page.evaluate(() => bj.active)), 'le serveur refuse une mise que le vrai solde ne permet pas');
  ok((await srvBal()) === real, 'le vrai solde n\'a pas bougé');
  ok((await cliBal()) === real, 'le navigateur est remis au vrai solde (' + (await cliBal()) + ')');
  await page.evaluate(() => { state.balance = 99999999; saveState(); pushRemoteAccount(state); });
  await sleep(500);
  ok((await srvBal()) === real, 'envoyer un faux solde au serveur ne change rien');

  console.log('— Crash');
  await page.evaluate(() => switchRoom('crash'));
  await sleep(800);
  const b0 = await srvBal();
  await page.evaluate(() => { document.getElementById('crashBetInput').value = 200; placeCrashBetInternal(false); });
  await sleep(900);
  ok((await srvBal()) === b0 - 200 && (await cliBal()) === b0 - 200, 'mise de crash prélevée par le serveur');
  await page.evaluate(() => handleCrashCancelBet());
  await sleep(1200);
  ok((await srvBal()) === b0, 'se retirer rembourse la mise');
  await page.evaluate(() => { document.getElementById('crashBetInput').value = 200; placeCrashBetInternal(false); });
  await sleep(700);
  await page.evaluate(() => handleCrashLaunch({}));
  await sleep(8800); // 7 s de compte à rebours + un peu de vol
  const pub = await page.evaluate(async () => (await (await fetch('/api/crash')).json()));
  ok(pub.status === 'crashed' || pub.crashPoint === undefined, 'le point de crash est invisible tant que la fusée vole (' + pub.status + ')');
  if (pub.status === 'flying') {
    await page.evaluate(() => performCrashCashout());
    await sleep(900);
  }
  const my = await page.evaluate(() => { const bt = getMyCrashBet(); return bt && { c: bt.cashedOut, w: bt.win, m: bt.cashMult }; });
  const sb2 = await srvBal(), cb2 = await cliBal();
  if (my && my.c) {
    ok(my.w >= 200 && sb2 === b0 - 200 + my.w && cb2 === sb2, `encaissé à ×${my.m} (+${my.w}) : gain crédité par le serveur, soldes identiques (${sb2}/${cb2})`);
  } else {
    ok(sb2 === b0 - 200 && cb2 === sb2, `explosé avant l'encaissement : mise perdue, soldes identiques (${sb2}/${cb2})`);
  }
  for (let i = 0; i < 90 && (await page.evaluate(() => crashSync.status)) !== 'crashed'; i++) await sleep(700);
  ok((await page.evaluate(() => crashSync.status)) === 'crashed', 'la fusée finit par exploser (annoncé par le serveur, ×' + (await page.evaluate(() => crashSync.crashPoint)) + ')');
  await sleep(5500);
  ok((await page.evaluate(() => crashSync.status)) === 'waiting', 'le serveur relance une manche d\'attente après l\'explosion');
  ok((await cliBal()) === (await srvBal()), 'solde final navigateur = serveur');

  await b.close();
  console.log(bad ? bad + ' erreur(s)' : 'Tout est bon');
  process.exit(bad ? 1 : 0);
})();
