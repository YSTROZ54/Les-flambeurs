// Test navigateur : machine à sous et grattage passent par le serveur.
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
  const reg = await page.evaluate(() => gatewayAction({ action: 'register', username: 'Jeu' + Date.now() % 99999, password: 'abc123', avatar: '🦊' }));
  await page.evaluate((r) => { _AntiBotGuard.verify = () => true; setAuthToken(r.token); state.username = r.row.username; state.balance = r.row.balance; localStorage.setItem(STORAGE_KEY_SESSION, r.row.username); }, reg);

  // machine à sous
  await page.evaluate(() => switchRoom('slots'));
  await sleep(300);
  const srvBal = async () => page.evaluate(async (n) => { const r = await supabaseFetch('accounts?username=eq.' + encodeURIComponent(n)); return (await r.json())[0].balance; }, reg.row.username);
  await page.evaluate(() => { document.getElementById('slotBetInput').value = 100; setTimeout(() => pullSlotLever({}), 0); });
  await sleep(4000);
  const sb = await srvBal();
  const cb = await page.evaluate(() => state.balance);
  ok(sb === cb, `solde navigateur (${cb}) = solde serveur (${sb}) après un tour`);
  ok(await page.evaluate(() => !slotSpinning), 'la machine est de nouveau disponible');
  const banner = await page.evaluate(() => document.getElementById('slotResultBanner').textContent);
  ok(/GAGNÉ|Pas de gain/.test(banner), 'résultat affiché : ' + banner.trim().slice(0, 40));
  // 5 tours de suite : le solde reste cohérent
  for (let i = 0; i < 5; i++) { await page.evaluate(() => { setTimeout(() => pullSlotLever({}), 0); }); await sleep(3300); }
  ok((await srvBal()) === (await page.evaluate(() => state.balance)), 'solde cohérent après 6 tours');

  // grattage
  await page.evaluate(() => { switchRoom('scratch'); });
  await sleep(500);
  const before = await page.evaluate(() => state.balance);
  await page.evaluate(() => { setTimeout(() => buyScratchCard(), 0); }); await sleep(1500);
  const afterBuy = await page.evaluate(() => state.balance);
  ok(afterBuy === before - 50, `ticket débité de 50 (${before} → ${afterBuy})`);
  const win = await page.evaluate(() => scratchTicket.winAmount);
  await page.evaluate(() => { setTimeout(() => completeScratchReveal(), 0); }); await sleep(1500);
  const afterReveal = await page.evaluate(() => state.balance);
  ok(afterReveal === afterBuy + win, `gain crédité après grattage (+${win})`);
  ok((await srvBal()) === afterReveal, 'solde serveur identique après grattage');
  await b.close();
  console.log(bad ? bad + ' erreur(s)' : 'Tout est bon');
  process.exit(bad ? 1 : 0);
})();
