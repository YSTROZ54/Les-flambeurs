// MURDER côté serveur : un « Durable Object » (une salle de 6 joueurs maximum), relié aux joueurs par WebSocket.
//  - le serveur fait avancer TOUS les joueurs (30 pas/s) avec le même code que le navigateur (api/_murderSim.js) : positions, murs, portes ;
//  - rôles tirés au sort en secret : 1 meurtrier (couteau), 1 policier (revolver à 1 balle), les autres sont innocents. Le rôle de chacun n'est envoyé qu'à lui ;
//  - le meurtrier tue d'un coup de couteau (de près) ou en lançant le couteau (barre de force : portée), puis doit le ramasser en marchant dessus ;
//  - le policier tire (1 balle, rechargement 1,8 s). S'il meurt, son arme tombe : un joueur non meurtrier peut la ramasser. S'il tue un innocent, l'arme
//    tombe et il ne peut pas la reprendre avant 15 s ;
//  - fin : le meurtrier meurt → les innocents gagnent ; tous les autres sont morts → le meurtrier gagne ; temps écoulé → les innocents gagnent.
// Messages du navigateur : in · use · knife · stab · tc (début de charge) · tr (lancer) · shoot · reload.
// Messages du serveur : welcome · s (instantané 15 fois/s) · ev (rôle, coup, lancer, tir, mort, porte, ramassage…) · end (résultats).
import { readToken } from './_auth.js';
import MS from './_murderSim.js';
import { isStaffActor } from './_roles.js';

const STEP = 1 / 30, STEP_MS = 1000 / 30, SNAP_EVERY = 2, MAX_QUEUE = 8, CFG = MS.CFG;
const num = (v, lo, hi) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
const R = (v, d) => +v.toFixed(d);
const shuf = (a) => a.sort(() => Math.random() - 0.5);

export class MurderRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];
    this.players = new Map(); this.timer = null; this.last = 0; this.acc = 0; this.n = 0; this.t = 0;
    this.ph = 'lobby'; this.tl = CFG.lobby; this.win = ''; this.reason = '';
    this.open = MS.MAP.doors.map(() => false);
    this.knife = { st: 'none', x: 0, z: 0, yaw: 0, dist: 0, max: 0, by: '' };      // none (pas de manche) · hand (chez le meurtrier) · air · floor
    this.gunFloor = null;                                                          // { x, z, ammo, banK, until } quand le revolver est par terre
  }

  async admit(url) {
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    const key = String(tok.u).toLowerCase();
    if (!(await isStaffActor(key))) return { error: 'Murder est réservé au Patron, au Co Fondateur et au Staff pour l’instant', status: 403 };
    if (!/^pub-[1-5]$/.test(String(url.searchParams.get('room') || ''))) return { error: 'Salon invalide', status: 404 };
    if (this.players.size >= CFG.max && !this.players.has(key)) return { error: 'Salon complet (6 joueurs)', status: 503 };
    return { key, name: String(url.searchParams.get('name') || tok.u).slice(0, 20) };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.searchParams.get('info') === '1') return new Response(JSON.stringify(this.info()), { headers: { 'Content-Type': 'application/json' } });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
    const a = await this.admit(url);
    if (a.error) return new Response(a.error, { status: a.status });
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    this.join(server, a.key, a.name);
    return new Response(null, { status: 101, webSocket: client });
  }
  info() { return { n: this.players.size, ph: this.ph, tl: R(Math.max(0, this.tl), 0) }; }

  /* ------------------------------ joueurs ------------------------------ */
  join(ws, key, name) {
    const old = this.players.get(key);
    if (old) { try { old.ws.close(1000, 'autre connexion'); } catch (e) { /* ok */ } this.players.delete(key); }
    const used = new Set([...this.players.values()].map((q) => q.ci)); let ci = 0; while (used.has(ci)) ci++;
    const p = { k: key, n: name, ws, c: MS.newPlayer(), queue: [], last: { f: 0, s: 0, run: false, yaw: 0, pitch: 0 }, ack: 0, rc: 0, ci,
      role: 'i', alive: true, knifeOut: false, stabCd: 0, throwCd: 0, charge: 0, hasGun: false, ammo: 0, rel: 0, doorCd: 0 };
    this.players.set(key, p);
    this.place(p, [...this.players.values()].indexOf(p));
    if (this.ph !== 'lobby') p.alive = false;                                    // arrivé en pleine manche : spectateur jusqu'à la manche suivante
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.send(ws, { t: 'welcome', you: key, ci });
    if (this.ph !== 'lobby') this.send(ws, { t: 'ev', e: 'late' });
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.tick(), 15); }
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    if (p.hasGun && this.ph === 'play') this.gunFloor = { x: p.c.x, z: p.c.z, ammo: p.ammo, banK: '', until: 0 };
    if (!this.players.size) { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.toLobby(); return; }
    if (this.ph === 'play' || this.ph === 'intro') this.checkEnd();
  }
  place(p, i) {
    const s = MS.MAP.spawns[i % MS.MAP.spawns.length];
    Object.assign(p.c, { x: s[0], z: s[1], vx: 0, vz: 0 }); p.rc++; p.queue = [];
  }

  /* ------------------------------ manches ------------------------------ */
  toLobby() {
    this.ph = 'lobby'; this.tl = CFG.lobby; this.win = ''; this.reason = '';
    this.open = MS.MAP.doors.map(() => false); this.knife = { st: 'none', x: 0, z: 0, yaw: 0, dist: 0, max: 0, by: '' }; this.gunFloor = null;
    let i = 0; this.players.forEach((p) => { p.alive = true; p.role = 'i'; p.knifeOut = false; p.charge = 0; p.hasGun = false; p.ammo = 0; p.rel = 0; this.place(p, i++); });
  }
  startRound() {
    const list = shuf([...this.players.values()]);
    if (list.length < CFG.min) { this.tl = CFG.lobby; return; }
    this.open = MS.MAP.doors.map(() => false); this.gunFloor = null; this.win = ''; this.reason = '';
    const spawns = shuf(MS.MAP.spawns.map((_, i) => i));
    list.forEach((p, i) => {
      p.role = i === 0 ? 'm' : i === 1 ? 'p' : 'i'; p.alive = true; p.knifeOut = false; p.stabCd = 0; p.throwCd = 0; p.charge = 0; p.hasGun = p.role === 'p'; p.ammo = p.hasGun ? 1 : 0; p.rel = 0;
      this.place(p, spawns[i]);
    });
    const m = list[0]; this.knife = { st: 'hand', x: m.c.x, z: m.c.z, yaw: 0, dist: 0, max: 0, by: m.k };
    this.ph = 'intro'; this.tl = CFG.intro;
    this.broadcast({ t: 'ev', e: 'round' });
    list.forEach((p) => this.send(p.ws, { t: 'ev', e: 'role', r: p.role }));          // chacun ne reçoit que SON rôle
  }
  endRound(win, reason) {
    if (this.ph === 'results') return;
    this.win = win; this.reason = reason || ''; this.ph = 'results'; this.tl = CFG.results;
    this.players.forEach((p) => { p.knifeOut = false; p.charge = 0; });
    this.broadcast({ t: 'end', win, reason: this.reason, roles: [...this.players.values()].map((p) => ({ k: p.k, n: p.n, r: p.role, al: p.alive ? 1 : 0, ci: p.ci })) });
  }
  checkEnd() {
    if (this.ph !== 'play' && this.ph !== 'intro') return;
    const all = [...this.players.values()], m = all.find((p) => p.role === 'm');
    if (all.length < 2) { this.toLobby(); return; }
    if (!m) { this.endRound('i', 'Le meurtrier a quitté la partie'); return; }
    if (!m.alive) { this.endRound('i', 'Le meurtrier est mort'); return; }
    if (!all.some((p) => p.role !== 'm' && p.alive)) this.endRound('m', 'Tout le monde est mort');
  }
  kill(v, by, how) {
    if (!v.alive) return;
    v.alive = false; v.knifeOut = false; v.charge = 0;
    if (v.hasGun) { v.hasGun = false; this.gunFloor = { x: v.c.x, z: v.c.z, ammo: v.ammo, banK: '', until: 0 }; this.broadcast({ t: 'ev', e: 'gundrop', x: R(v.c.x, 2), z: R(v.c.z, 2) }); }
    this.broadcast({ t: 'ev', e: 'kill', k: v.k, by: by ? by.k : '', how, x: R(v.c.x, 2), z: R(v.c.z, 2) });
    this.checkEnd();
  }

  /* ------------------------------ messages ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 400) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'in') {
      const inp = { seq: Math.floor(Number(m.seq)) || 0, f: num(m.f, -1, 1), s: num(m.s, -1, 1), run: !!m.run, yaw: num(m.yaw, -1000, 1000), pitch: num(m.pitch, -1.5, 1.5) };
      if (p.queue.length >= MAX_QUEUE) p.queue.shift();
      p.queue.push(inp);
    } else if (this.ph !== 'play' || !p.alive) return;
    else if (m.t === 'use') this.useDoor(p);
    else if (m.t === 'knife') { if (p.role === 'm' && this.knife.st === 'hand') p.knifeOut = !p.knifeOut; }
    else if (m.t === 'stab') this.stab(p);
    else if (m.t === 'tc') { if (p.role === 'm' && this.knife.st === 'hand' && !p.charge) p.charge = this.t; }
    else if (m.t === 'tr') this.throwKnife(p, num(m.yaw, -1000, 1000));
    else if (m.t === 'shoot') this.shoot(p, num(m.yaw, -1000, 1000));
    else if (m.t === 'reload') this.reload(p);
  }
  useDoor(p) {
    if (p.doorCd > this.t) return; p.doorCd = this.t + 0.25;
    const i = MS.nearestDoor(p.c.x, p.c.z, p.last.yaw); if (i < 0) return;
    this.open[i] = !this.open[i]; this.broadcast({ t: 'ev', e: 'door', i, o: this.open[i] ? 1 : 0 });
  }
  stab(p) {
    if (p.role !== 'm' || this.knife.st !== 'hand' || p.stabCd > this.t) return;
    p.stabCd = this.t + CFG.stabCd; p.knifeOut = true; p.charge = 0;
    const c = p.c, yaw = p.last.yaw; let best = null, bd = 1e9;
    this.players.forEach((q) => {
      if (q === p || !q.alive) return;
      const dx = q.c.x - c.x, dz = q.c.z - c.z, d = Math.hypot(dx, dz); if (d > CFG.stabRange || d >= bd) return;
      const ang = Math.atan2(dx, -dz); if (Math.abs(MS.angDiff(ang, yaw)) > CFG.stabArc && d > 0.7) return;
      if (MS.rayWorld(c.x, c.z, ang, d, this.open) < d - 0.05) return;                // un mur ou une porte fermée entre nous
      best = q; bd = d;
    });
    this.broadcast({ t: 'ev', e: 'stab', k: p.k, hit: best ? 1 : 0 });
    if (best) this.kill(best, p, 'stab');
  }
  throwKnife(p, yaw) {
    if (p.role !== 'm' || this.knife.st !== 'hand' || !p.charge || p.throwCd > this.t) { p.charge = 0; return; }
    const f = Math.max(0.08, Math.min(1, (this.t - p.charge) / CFG.chargeMax)); p.charge = 0; p.throwCd = this.t + CFG.throwCd; p.knifeOut = false;
    const max = CFG.throwMin + f * (CFG.throwMax - CFG.throwMin), c = p.c;
    this.knife = { st: 'air', x: c.x + Math.sin(yaw) * 0.5, z: c.z - Math.cos(yaw) * 0.5, yaw, dist: 0, max, by: p.k };
    // si un mur est juste devant, le couteau tombe tout de suite à nos pieds
    if (MS.rayWorld(c.x, c.z, yaw, 0.5, this.open) < 0.5) { this.knife.x = c.x; this.knife.z = c.z; this.knife.st = 'floor'; }
    this.broadcast({ t: 'ev', e: 'throw', k: p.k, yaw: R(yaw, 3), f: R(f, 2), x: R(this.knife.x, 2), z: R(this.knife.z, 2), max: R(max, 1) });
  }
  reload(p) {
    if (!p.hasGun || p.ammo > 0 || p.rel > 0) return;
    p.rel = this.t + CFG.reload; this.send(p.ws, { t: 'ev', e: 'reload', d: CFG.reload });
  }
  shoot(p, yaw) {
    if (!p.hasGun || p.ammo <= 0 || p.rel > 0) return;
    p.ammo = 0; const c = p.c, wall = MS.rayWorld(c.x, c.z, yaw, CFG.gunRange, this.open);
    let best = null, bt = wall;
    this.players.forEach((q) => { if (q === p || !q.alive) return; const t = MS.rayCircle(c.x, c.z, yaw, q.c.x, q.c.z, CFG.hitR); if (t >= 0 && t < bt) { bt = t; best = q; } });
    this.broadcast({ t: 'ev', e: 'shot', k: p.k, x: R(c.x, 2), z: R(c.z, 2), yaw: R(yaw, 3), len: R(bt, 2), hit: best ? 1 : 0 });
    if (!best) return;
    const wasMurderer = best.role === 'm';
    this.kill(best, p, 'shot');
    if (!wasMurderer && this.ph === 'play') {                                       // un innocent tué : l'arme tombe, impossible de la reprendre avant 15 s
      p.hasGun = false; this.gunFloor = { x: c.x, z: c.z, ammo: 0, banK: p.k, until: this.t + CFG.gunBan };
      this.broadcast({ t: 'ev', e: 'gundrop', x: R(c.x, 2), z: R(c.z, 2), ban: CFG.gunBan, k: p.k });
    }
  }

  /* ------------------------------ la boucle ------------------------------ */
  tick() {
    const now = Date.now(); this.acc += now - this.last; this.last = now;
    let guard = 0;
    while (this.acc >= STEP_MS && guard++ < 5) { this.acc -= STEP_MS; this.step(); }
    if (this.acc > STEP_MS * 5) this.acc = 0;
  }
  step() {
    this.t += STEP; this.tl -= STEP;
    const list = [...this.players.values()], n = list.length;
    if (this.ph === 'lobby') {
      if (n < CFG.min) this.tl = CFG.lobby; else if (this.tl <= 0) this.startRound();
    } else if (this.ph === 'intro') {
      if (this.tl <= 0) { this.ph = 'play'; this.tl = CFG.play; this.broadcast({ t: 'ev', e: 'go' }); }
    } else if (this.ph === 'play') {
      if (this.tl <= 0) this.endRound('i', 'Le temps est écoulé : les innocents ont survécu');
    } else if (this.ph === 'results') {
      if (this.tl <= 0) this.toLobby();
    }
    // déplacements (figés pendant la présentation des rôles et les résultats)
    list.forEach((p) => {
      let inp = p.queue.shift();
      if (inp) { p.ack = inp.seq; p.last = inp; } else inp = p.last;
      if (this.ph === 'intro' || this.ph === 'results' || (!p.alive && this.ph !== 'lobby')) { p.c.yaw = inp.yaw; p.c.pitch = inp.pitch; p.c.vx = 0; p.c.vz = 0; return; }
      for (let i = 0; i < 3; i++) MS.stepPlayer(p.c, inp, 1 / 90, this.open);
    });
    if (this.ph === 'play') {
      this.stepKnife();
      // ramassages
      const k = this.knife;
      if (k.st === 'floor') { const m = list.find((q) => q.role === 'm' && q.alive && Math.hypot(q.c.x - k.x, q.c.z - k.z) <= CFG.pickR); if (m) { k.st = 'hand'; this.broadcast({ t: 'ev', e: 'pick', what: 'knife', k: m.k }); } }
      const g = this.gunFloor;
      if (g) { const q = list.find((u) => u.alive && u.role !== 'm' && !u.hasGun && Math.hypot(u.c.x - g.x, u.c.z - g.z) <= CFG.pickR && (g.banK !== u.k || this.t >= g.until)); if (q) { q.hasGun = true; q.ammo = g.ammo; q.rel = 0; this.gunFloor = null; this.broadcast({ t: 'ev', e: 'pick', what: 'gun', k: q.k }); } }
      list.forEach((p) => { if (p.rel && this.t >= p.rel) { p.ammo = 1; p.rel = 0; } });
    }
    this.n++;
    if (this.n % SNAP_EVERY === 0 && n) this.snapshots(list);
  }
  // le couteau lancé avance ; il s'arrête sur un mur / un meuble haut / une porte fermée, ou tue le premier joueur touché
  stepKnife() {
    const k = this.knife; if (k.st !== 'air') return;
    const L = Math.min(CFG.knifeSpeed * STEP, k.max - k.dist), wall = MS.rayWorld(k.x, k.z, k.yaw, L, this.open);
    let hit = null, ht = wall;
    this.players.forEach((q) => { if (!q.alive || q.k === k.by) return; const t = MS.rayCircle(k.x, k.z, k.yaw, q.c.x, q.c.z, CFG.hitR); if (t >= 0 && t <= L && t < ht) { ht = t; hit = q; } });
    const adv = Math.max(0, Math.min(L, hit ? ht : (wall < L ? Math.max(0, wall - 0.08) : L)));
    k.x += Math.sin(k.yaw) * adv; k.z -= Math.cos(k.yaw) * adv; k.dist += adv;
    if (hit || wall < L || k.dist >= k.max - 1e-6) {
      k.st = 'floor'; this.broadcast({ t: 'ev', e: 'land', x: R(k.x, 2), z: R(k.z, 2) });
      if (hit) this.kill(hit, this.players.get(k.by) || null, 'throw');
    }
  }

  /* ------------------------------ envoi ------------------------------ */
  snapshots(list) {
    const k = this.knife, g = this.gunFloor;
    const base = { t: 's', ph: this.ph, tl: R(Math.max(0, this.tl), 1), od: this.open.map((o, i) => o ? i : -1).filter((i) => i >= 0), win: this.win,
      al: list.filter((p) => p.alive).length, kn: k.st === 'floor' || k.st === 'air' ? { st: k.st, x: R(k.x, 2), z: R(k.z, 2), a: R(k.yaw, 2) } : null, gn: g ? { x: R(g.x, 2), z: R(g.z, 2) } : null };
    list.forEach((viewer) => {
      const pl = list.map((p) => {
        const c = p.c, o = { k: p.k, n: p.n, ci: p.ci, x: R(c.x, 2), z: R(c.z, 2), a: R(c.yaw, 3), vx: R(c.vx, 2), vz: R(c.vz, 2), al: p.alive ? 1 : 0, ko: p.knifeOut ? 1 : 0, hg: p.hasGun ? 1 : 0 };
        if (p === viewer) {
          o.ack = p.ack; o.rc = p.rc; o.r = p.role; o.am = p.ammo; o.rl = p.rel ? R(Math.max(0, p.rel - this.t), 2) : 0;
          o.ch = p.charge ? R(Math.min(1, (this.t - p.charge) / CFG.chargeMax), 2) : 0; o.ks = p.role === 'm' ? k.st : ''; o.sc = R(Math.max(0, p.stabCd - this.t), 2);
          o.gb = g && g.banK === p.k && this.t < g.until ? R(g.until - this.t, 1) : 0;
        }
        return o;
      });
      try { viewer.ws.send(JSON.stringify(Object.assign({ pl }, base))); } catch (e) { /* ok */ }
    });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
