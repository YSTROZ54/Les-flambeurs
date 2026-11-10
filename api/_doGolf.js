// MINI GOLF côté serveur : un « Durable Object » par salle (pub-<carte> pour les 5 salles publiques, priv-<CODE> pour les parties privées),
// plus un objet « hub » qui garde le classement (parties gagnées).
//  - le serveur fait rouler TOUTES les balles en même temps, 30 fois par seconde (physique : api/_golfSim.js) : les balles se percutent
//    (plus on arrive vite, plus l'autre part loin), tombent à l'eau, prennent les dés, collent dans les flaques… personne ne peut tricher ;
//  - il envoie la position des balles 15 fois par seconde ; le navigateur ne fait que dessiner ;
//  - salle d'attente : l'hôte (premier arrivé) choisit les mods (dés bonus, pouvoirs, chocs, gel offert, 10 ou 20 trous) et lance la partie ;
//    dans une salle publique, la partie démarre aussi toute seule 60 s après l'arrivée d'un 2e joueur ;
//  - tombé à l'eau ou dans le vide : la balle revient là où on a tiré la dernière fois (pas de coup en plus).
// Messages du navigateur : shot {yaw, power} · use {p, yaw} (un seul bonus à la fois : saut, miel, gel) · reset · opts {o} · start
// Messages du serveur : welcome · lobby · hole · s (positions) · ev (évènements) · done · over · glue · top
import { readToken } from './_auth.js';
import GS from './_golfSim.js';
import { isStaffActor } from './_roles.js';

const TICK_MS = 1000 / 30, DONE_DELAY_MS = 2600, OVER_MS = 16000, HOLE_MAX_MS = 5 * 60000, AUTO_START_MS = 60000, GONE_KEEP_MS = 3 * 60000;
const COLORS = 8, GLUE_MS = 10000, GLUE_R = 0.42, DICE_EVERY_MS = 10000, DICE_MAX = 6, MAX_POWERS = 1;
const ROOM_RE = /^(pub-(prairie|automne|canyon|neige|ile)|priv-[A-Z0-9]{5})$/;
const LOCAL_HUB = globalThis.__golfHub || (globalThis.__golfHub = { stats: {} });   // sans Cloudflare (serveur local) : classement en mémoire

export class GolfRoom {
  constructor(state, env) {
    this.state = state; this.env = env || {};
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];
    this.room = ''; this.map = ''; this.players = new Map(); this.gone = new Map();
    this.phase = 'lobby'; this.host = ''; this.opts = { ...GS.DEFAULT_OPTS }; this.lobbyT = 0;
    this.game = null; this.glue = []; this.dice = []; this.timer = null; this.tickN = 0; this.dirty = true; this.nextId = 1; this.mapSwitchT = 0; this.nextDice = 1; this.diceT = 0;
  }

  /* ------------------------------ le classement (objet « hub ») ------------------------------ */
  async hubLoad() {
    if (this.state && this.state.storage) { this.stats = this.stats || (await this.state.storage.get('stats')) || {}; return this.stats; }
    return LOCAL_HUB.stats;
  }
  async hubSave() { if (this.state && this.state.storage) await this.state.storage.put('stats', this.stats); }
  static topOf(stats) { return Object.entries(stats).map(([k, v]) => ({ k, n: v.n, w: v.w | 0, g: v.g | 0 })).filter((r) => r.w > 0).sort((a, b) => b.w - a.w || a.g - b.g).slice(0, 10); }
  async top() {
    if (this.env.GOLF) { try { const r = await this.env.GOLF.get(this.env.GOLF.idFromName('hub')).fetch('https://golf/hub/top'); return await r.json(); } catch (e) { return []; } }
    return GolfRoom.topOf(LOCAL_HUB.stats);
  }
  async record(players, winners) {
    const body = JSON.stringify({ players, winners });
    if (this.env.GOLF) { try { await this.env.GOLF.get(this.env.GOLF.idFromName('hub')).fetch('https://golf/hub/win', { method: 'POST', body }); } catch (e) { /* tant pis */ } return; }
    GolfRoom.applyWin(LOCAL_HUB.stats, players, winners);
  }
  static applyWin(stats, players, winners) {
    (players || []).forEach((p) => { const s = stats[p.k] || (stats[p.k] = { n: p.n, w: 0, g: 0 }); s.n = String(p.n).slice(0, 20); s.g++; });
    (winners || []).forEach((k) => { if (stats[k]) stats[k].w++; });
  }

  /* ------------------------------ connexion ------------------------------ */
  async admit(url) {
    const room = String(url.searchParams.get('room') || '');
    if (!ROOM_RE.test(room)) return { error: 'Salle inconnue', status: 404 };
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    if (!(await isStaffActor(String(tok.u).toLowerCase()))) return { error: 'Réservé au Patron, au Co Fondateur et au Staff', status: 403 };     // le golf est encore en test
    if (!this.room) {
      this.room = room;
      const m = room.startsWith('pub-') ? room.slice(4) : String(url.searchParams.get('map') || 'prairie');
      this.setMap(GS.MAP_IDS.includes(m) ? m : 'prairie');
    }
    return { key: String(tok.u).toLowerCase(), name: String(url.searchParams.get('name') || tok.u).slice(0, 20) };
  }
  setMap(m) { this.map = m; this.opts.map = m; this.course = GS.buildCourse(m); }
  switching() { return this.phase === 'lobby' && Date.now() - this.mapSwitchT < 12000; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/hub/top') { const st = await this.hubLoad(); return Response.json(GolfRoom.topOf(st)); }
    if (url.pathname === '/hub/win' && request.method === 'POST') { const st = await this.hubLoad(); let b = {}; try { b = await request.json(); } catch (e) { /* vide */ } GolfRoom.applyWin(st, b.players, b.winners); await this.hubSave(); return new Response('ok'); }
    if (url.searchParams.get('info')) return Response.json(this.info());
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
    const a = await this.admit(url);
    if (a.error) return new Response(a.error, { status: a.status });
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    await this.join(server, a.key, a.name);
    return new Response(null, { status: 101, webSocket: client });
  }
  info() { return { n: this.players.size, ph: this.phase, map: this.map || '', hole: this.game ? this.game.hi + 1 : 0, of: this.game ? this.game.list.length : 0 }; }

  /* ------------------------------ joueurs ------------------------------ */
  async join(ws, key, name) {
    const old = this.players.get(key);
    if (old) { try { old.ws.close(1000, 'autre connexion'); } catch (e) { /* ok */ } this.players.delete(key); }
    const back = this.gone.get(key); this.gone.delete(key);
    const used = new Set([...this.players.values()].map((p) => p.c));
    let c = back && !used.has(back.c) ? back.c : 0; if (!back || used.has(c)) { c = 0; while (used.has(c) && c < COLORS - 1) c++; }
    const p = back && this.game && back.gid === this.game.gid ? Object.assign(back, { ws, n: name, c }) : { k: key, n: name, c, id: this.nextId++, ws, card: [], strokes: 0, done: false, sunk: false, ball: null, safe: null, moving: false, powers: [], lastWall: 0 };
    p.ws = ws; p.seen = Date.now();
    this.players.set(key, p);
    if (!this.host || (!this.players.has(this.host) && !this.switching())) this.host = key;              // en changeant de carte, l'hôte garde sa place
    if (this.phase === 'play' && (!p.ball || p.gid !== this.game.gid)) { p.gid = this.game.gid; p.card = []; this.placeOnHole(p, true); }
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (this.phase === 'lobby' && this.players.size >= 2 && !this.lobbyT && this.room.startsWith('pub-')) this.lobbyT = Date.now() + AUTO_START_MS;
    this.send(ws, { t: 'welcome', now: Date.now(), room: this.room, map: this.map, you: key, id: p.id, ...this.pubState(), top: await this.top() });
    this.broadcast({ t: 'players', ...this.pubState() });
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    if (this.phase !== 'lobby') { p.ws = null; p.left = Date.now(); this.gone.set(p.k, p); }
    if (this.host === p.k && !this.switching()) this.host = this.players.size ? this.players.keys().next().value : '';
    if (this.players.size < 2) this.lobbyT = 0;
    this.broadcast({ t: 'players', ...this.pubState() });
    if (!this.players.size && !this.switching()) { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.phase = 'lobby'; this.game = null; this.glue = []; this.gone.clear(); }
  }
  hole() { return this.course.holes[this.game.list[this.game.hi]]; }
  placeOnHole(p, late) {
    const H = this.hole();
    p.strokes = 0; p.done = false; p.sunk = false; p.moving = false;
    p.ball = { x: H.tee[0], z: H.tee[1], y: H.teeH, vx: 0, vy: 0, vz: 0, air: false, rail: null };
    p.safe = { x: H.tee[0], z: H.tee[1], y: H.teeH };
  }

  /* ------------------------------ la partie ------------------------------ */
  startGame() {
    const list = GS.holeList(this.opts.holes);
    this.game = { gid: Date.now(), list, hi: 0, holeStart: Date.now(), firstDone: 0, lastDone: 0, overAt: 0 };
    this.phase = 'play'; this.lobbyT = 0; this.gone.clear();
    this.players.forEach((p) => { p.gid = this.game.gid; p.card = []; p.powers = []; });
    this.startHole();
  }
  startHole() {
    const g = this.game, H = this.hole();
    g.holeStart = Date.now(); g.firstDone = 0; g.lastDone = 0; this.glue = [];
    this.dice = []; this.diceT = Date.now() + DICE_EVERY_MS;
    if (this.opts.dice) H.dice.forEach((d) => this.dice.push({ i: this.nextDice++, x: d.x, z: d.z, h: d.h }));
    this.players.forEach((p) => this.placeOnHole(p));
    this.broadcast({ t: 'hole', ...this.pubState() }); this.dirty = true;
  }
  nextHole() {
    const g = this.game; g.hi++;
    if (g.hi >= g.list.length) { this.endGame(); return; }
    this.startHole();
  }
  totals() {
    const g = this.game, holes = g.list.map((i) => this.course.holes[i]);
    return [...this.players.values()].map((p) => {
      let t = 0, played = 0;
      holes.forEach((H, k) => { const v = p.card[k]; if (v == null) t += H.par + 3; else { t += v; played++; } });
      return { k: p.k, n: p.n, t, played };
    }).sort((a, b) => a.t - b.t);
  }
  endGame() {
    const g = this.game; g.hi = g.list.length - 1; this.phase = 'over'; g.overAt = Date.now() + OVER_MS;
    const tot = this.totals(), real = tot.filter((r) => r.played >= Math.ceil(g.list.length / 2));
    let winners = [];
    if (real.length >= 2) { const best = real[0].t; winners = real.filter((r) => r.t === best).map((r) => r.k); this.record(real.map((r) => ({ k: r.k, n: r.n })), winners); }
    this.broadcast({ t: 'over', ...this.pubState(), rank: tot, winners });
    setTimeout(async () => { this.broadcast({ t: 'top', top: await this.top() }); }, 800);
  }
  finish(p, score, how) {
    if (p.done) return;
    p.done = true; p.moving = false; p.card[this.game.hi] = score;
    const now = Date.now(); if (!this.game.firstDone) this.game.firstDone = now; this.game.lastDone = now;
    this.broadcast({ t: 'done', k: p.k, score, how, par: this.hole().par, ...this.pubState() });
  }

  /* ------------------------------ la boucle (30 fois par seconde) ------------------------------ */
  tick() {
    const now = Date.now(); this.tickN++;
    this.gone.forEach((p, k) => { if (now - p.left > GONE_KEEP_MS) this.gone.delete(k); });
    if (!this.players.size) return;
    if (this.phase === 'lobby') { if (this.lobbyT && now >= this.lobbyT && this.players.size >= 2) this.startGame(); return; }
    if (this.phase === 'over') { if (now >= this.game.overAt) { this.phase = 'lobby'; this.game = null; this.lobbyT = this.players.size >= 2 && this.room.startsWith('pub-') ? now + AUTO_START_MS : 0; this.broadcast({ t: 'lobby', ...this.pubState() }); } return; }
    const g = this.game, H = this.hole(), list = [...this.players.values()];
    this.physics(H, now / 1000);
    // un nouveau bonus apparaît sur la piste toutes les 10 s ; les flaques sèchent
    const n0 = this.glue.length; this.glue = this.glue.filter((q) => q.until > now); if (this.glue.length !== n0) this.broadcast({ t: 'glue', glue: this.pubGlue() });
    // fin du trou : tout le monde a fini, ou 60 s après le premier (les retardataires prennent une pénalité), ou 5 min en tout
    const late = (g.firstDone && now - g.firstDone > GS.WAIT_S * 1000) || now - g.holeStart > HOLE_MAX_MS;
    if (late) list.forEach((p) => { if (!p.done && !p.moving) this.finish(p, Math.min(GS.MAXSHOTS + 1, Math.max(p.strokes + 2, H.par + 3)), 'time'); });
    if (list.every((p) => p.done) && g.lastDone && now - g.lastDone > DONE_DELAY_MS) this.nextHole();
    // positions des balles : 15 fois par seconde tant que quelque chose bouge
    if (this.opts.dice && now >= this.diceT) { this.diceT = now + DICE_EVERY_MS; this.spawnDice(H); }
    const moving = list.some((p) => p.moving);
    if ((moving || this.dirty) && this.tickN % 2 === 0) { this.broadcast(this.snap(now)); this.dirty = moving; }
  }
  physics(H, t) {
    const DT = TICK_MS / 1000, list = [...this.players.values()].filter((p) => p.moving && p.ball);
    if (!list.length) return;
    let n = 1;
    list.forEach((p) => { const b = p.ball, sp = b.rail ? Math.abs(b.rail.v) : Math.hypot(b.vx, b.vz, b.vy); n = Math.max(n, Math.ceil(sp * DT / 0.02)); });
    n = Math.min(n, 60);
    const sub = DT / n, all = [...this.players.values()].filter((p) => p.ball && !p.sunk && !p.done && p.strokes > 0);
    for (let s = 0; s < n; s++) {
      for (const p of list) {
        if (!p.moving) continue;
        const b = p.ball;
        const ctx = { glue: this.glue, ev: (type, f) => this.onEv(p, type, f) };
        const r = GS.simStep(b, H, sub, t + s * sub, ctx);
        if (r) { this.result(p, r, H); continue; }
        this.pickDice(p);
      }
      if (this.opts.collide) this.collide(all);
    }
    for (const p of list) if (p.moving && GS.atRest(p.ball, H)) this.rest(p, H);
  }
  // un bonus de plus quelque part sur la piste (jamais sur du sable ou de la glace, ni près du départ, du trou ou d'un autre bonus)
  spawnDice(H) {
    if (this.dice.length >= DICE_MAX) return;
    const fl = H.floors.filter((f) => !f.zone && f.len > 0.4);
    for (let k = 0; k < 30 && fl.length; k++) {
      const f = fl[Math.floor(Math.random() * fl.length)], t = Math.random(), lat = (Math.random() - 0.5) * Math.max(0.1, f.w0 - 0.5);
      const x = f.ax + f.dx * f.len * t - f.dz * lat, z = f.az + f.dz * f.len * t + f.dx * lat;
      if (!GS.inPoly(f.poly, x, z) || Math.hypot(x - H.cup[0], z - H.cup[1]) < 2 || Math.hypot(x - H.tee[0], z - H.tee[1]) < 1.6) continue;
      if (this.dice.some((d) => Math.hypot(d.x - x, d.z - z) < 1.3) || H.dyn.some((d) => Math.hypot(d.x - x, d.z - z) < 1.0) || H.circles.some((c) => Math.hypot(c.x - x, c.z - z) < 0.8)) continue;
      this.dice.push({ i: this.nextDice++, x, z, h: GS.fH(f, x, z) });
      this.broadcast({ t: 'players', ...this.pubState() }); return;
    }
  }
  // choc entre deux balles (même poids) : la vitesse passe de l'une à l'autre selon l'angle, un peu amortie
  collide(all) {
    const R2 = GS.R * 2;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const A = all[i], B = all[j], a = A.ball, b = B.ball;
      if (!A.moving && !B.moving) continue;
      if (a.rail || b.rail || Math.abs(a.y - b.y) > GS.R) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R2 || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, ov = (R2 - d) / 2;
      a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv >= 0) continue;
      const e = 0.9, jimp = -(1 + e) * rv / 2;
      a.vx -= jimp * nx; a.vz -= jimp * nz; b.vx += jimp * nx; b.vz += jimp * nz;
      if (!A.moving || !B.moving) { A.moving = true; B.moving = true; this.broadcast({ t: 'players', ...this.pubState() }); }
      this.broadcast({ t: 'ev', e: 'bb', a: A.id, b: B.id, f: +(-rv).toFixed(2), x: +((a.x + b.x) / 2).toFixed(2), z: +((a.z + b.z) / 2).toFixed(2) });
    }
  }
  onEv(p, type, f) {
    const now = Date.now();
    if (type === 'wall') { if (now - p.lastWall < 90) return; p.lastWall = now; this.broadcast({ t: 'ev', e: 'w', id: p.id, f: +f.toFixed(2) }); }
    else if (type === 'bump' || type === 'glue' || type === 'loop' || type === 'land') this.broadcast({ t: 'ev', e: type, id: p.id, f: +f.toFixed(2) });
  }
  pickDice(p) {
    if (!this.dice.length || p.powers.length >= MAX_POWERS) return;           // un seul bonus à la fois : il faut d'abord utiliser le sien
    const b = p.ball;
    for (const d of this.dice) {
      if (Math.abs(b.y - d.h) > 0.35 || Math.hypot(b.x - d.x, b.z - d.z) > 0.26) continue;
      const pool = GS.POWERS.filter((k) => this.opts[k]); if (!pool.length) return;
      const pw = pool[Math.floor(Math.random() * pool.length)];
      p.powers.push(pw); this.dice.splice(this.dice.indexOf(d), 1);
      this.broadcast({ t: 'ev', e: 'dice', id: p.id, i: d.i, p: pw });
      this.broadcast({ t: 'players', ...this.pubState() });
      return;
    }
  }
  result(p, r, H) {
    const b = p.ball;
    if (r === 'cup') {
      p.sunk = true; p.moving = false; b.x = H.cup[0]; b.z = H.cup[1]; b.y = H.cupH; b.vx = b.vz = b.vy = 0; b.rail = null;
      this.broadcast({ t: 'ev', e: 'cup', id: p.id, s: p.strokes }); this.dirty = true;
      const gid = this.game.gid, hi = this.game.hi;
      setTimeout(() => { if (this.game && this.game.gid === gid && this.game.hi === hi && this.players.get(p.k) === p) this.finish(p, p.strokes, ''); }, 700);
      return;
    }
    // dans l'eau ou dans le vide : retour là où on a tiré la dernière fois
    this.broadcast({ t: 'ev', e: r, id: p.id, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) });
    b.x = p.safe.x; b.z = p.safe.z; b.y = p.safe.y; b.vx = b.vz = b.vy = 0; b.air = false; b.rail = null; p.moving = false; this.dirty = true;
    if (p.strokes >= GS.MAXSHOTS) this.finish(p, GS.MAXSHOTS + 1, 'max'); else this.broadcast({ t: 'players', ...this.pubState() });
  }
  rest(p, H) {
    const b = p.ball; b.vx = b.vz = b.vy = 0; p.moving = false; this.dirty = true;
    if (!p.done && !p.sunk && p.strokes >= GS.MAXSHOTS) this.finish(p, GS.MAXSHOTS + 1, 'max'); else this.broadcast({ t: 'players', ...this.pubState() });
  }

  /* ------------------------------ messages des joueurs ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 2000) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string' || this.players.get(p.k) !== p) return;
    p.seen = Date.now();
    if (m.t === 'shot') this.shot(p, Number(m.yaw), Number(m.power));
    else if (m.t === 'use') this.usePower(p, String(m.p || ''), Number(m.yaw));
    else if (m.t === 'reset') this.resetBall(p);
    else if (m.t === 'opts') this.setOpts(p, m.o || {});
    else if (m.t === 'start') { if (this.phase === 'lobby' && p.k === this.host) this.startGame(); }
  }
  canPlay(p) { return this.phase === 'play' && p.ball && !p.done && !p.sunk; }
  shot(p, yaw, power) {
    if (!this.canPlay(p) || p.moving || !isFinite(yaw) || !isFinite(power) || power < 0.03) return;
    power = Math.min(1, power);
    const b = p.ball, sp = Math.pow(power, 1.15) * GS.VMAX;
    p.safe = { x: b.x, z: b.z, y: b.y };
    b.vx = Math.sin(yaw) * sp; b.vz = -Math.cos(yaw) * sp; b.vy = 0; b.air = false; b.rail = null;
    p.strokes++; p.moving = true; this.dirty = true;
    this.broadcast({ t: 'ev', e: 'shot', id: p.id, pw: +power.toFixed(2), s: p.strokes });
    this.broadcast({ t: 'players', ...this.pubState() });
  }
  usePower(p, k, yaw) {
    const at = p.powers.indexOf(k); if (at < 0 || !this.canPlay(p)) return;
    const b = p.ball;
    if (k === 'jump') { if (!p.moving || b.rail) return; b.vy = Math.max(b.air ? b.vy : 0, 0) + 3.4; b.air = true; }
    else if (k === 'ice') { if (!p.moving || b.rail) return; b.vx = 0; b.vz = 0; if (!b.air) { b.vy = 0; } }
    else if (k === 'glue') { if (!this.dropGlue(p, yaw)) return; }
    else return;
    p.powers.splice(at, 1); this.dirty = true;
    this.broadcast({ t: 'ev', e: 'pow', id: p.id, p: k, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) });
    this.broadcast({ t: 'players', ...this.pubState() });
  }
  // le miel se pose derrière la balle (à l'opposé de sa course, ou de la visée si elle est à l'arrêt) : on ne choisit pas où
  dropGlue(p, yaw) {
    const H = this.hole(), b = p.ball, sp = Math.hypot(b.vx, b.vz);
    let bx, bz;
    if (sp > 0.4) { bx = -b.vx / sp; bz = -b.vz / sp; } else { const y = isFinite(yaw) ? yaw : H.teeYaw; bx = -Math.sin(y); bz = Math.cos(y); }
    for (const dist of [0.5, 0.35, 0.2, 0]) {
      const x = b.x + bx * dist, z = b.z + bz * dist, fl = GS.floorAt(H, x, z, b.y + 0.4);
      if (!fl || Math.hypot(x - H.cup[0], z - H.cup[1]) < 0.5) continue;
      this.glue.push({ x, z, h: fl.h, r: GLUE_R, until: Date.now() + GLUE_MS, by: p.id });
      this.broadcast({ t: 'glue', glue: this.pubGlue(), by: p.id, x: +x.toFixed(2), z: +z.toFixed(2) });
      return true;
    }
    return false;
  }
  resetBall(p) {
    if (!this.canPlay(p) || p.moving || !p.safe) return;
    const b = p.ball; if (Math.hypot(b.x - p.safe.x, b.z - p.safe.z) < 0.05) return;
    b.x = p.safe.x; b.z = p.safe.z; b.y = p.safe.y; b.vx = b.vz = b.vy = 0; b.air = false; p.strokes++; this.dirty = true;
    this.broadcast({ t: 'ev', e: 'reset', id: p.id, s: p.strokes });
    if (p.strokes >= GS.MAXSHOTS) this.finish(p, GS.MAXSHOTS + 1, 'max');
  }
  setOpts(p, o) {
    if (this.phase !== 'lobby' || p.k !== this.host) return;
    const O = this.opts;
    ['dice', 'jump', 'glue', 'ice', 'collide'].forEach((k) => { if (typeof o[k] === 'boolean') O[k] = o[k]; });
    if (o.holes === 10 || o.holes === 20) O.holes = o.holes;
    if (this.room.startsWith('priv-') && GS.MAP_IDS.includes(o.map) && o.map !== this.map) { this.setMap(o.map); this.mapSwitchT = Date.now(); }
    this.broadcast({ t: 'lobby', ...this.pubState() });
  }

  /* ------------------------------ envoi ------------------------------ */
  pubGame() { const g = this.game; return g ? { gid: g.gid, list: g.list, hi: g.hi, holeStart: g.holeStart, firstDone: g.firstDone, overAt: g.overAt } : null; }
  pubPlayers() {
    return [...this.players.values()].map((p) => ({ k: p.k, n: p.n, c: p.c, id: p.id, s: p.strokes, d: p.done ? 1 : 0, sk: p.sunk ? 1 : 0, card: (p.card || []).map((v) => (v == null ? null : v)), pw: p.powers, mv: p.moving ? 1 : 0, b: p.ball ? [+p.ball.x.toFixed(3), +p.ball.y.toFixed(3), +p.ball.z.toFixed(3)] : null }));
  }
  pubGlue() { return this.glue.map((q) => ({ x: +q.x.toFixed(2), z: +q.z.toFixed(2), h: +q.h.toFixed(2), r: q.r, until: q.until, by: q.by })); }
  pubState() { return { now: Date.now(), phase: this.phase, map: this.map, host: this.host, opts: this.opts, lobbyT: this.lobbyT, game: this.pubGame(), players: this.pubPlayers(), glue: this.pubGlue(), dice: this.dice.map((d) => ({ i: d.i, x: +d.x.toFixed(2), z: +d.z.toFixed(2), h: +d.h.toFixed(3) })) }; }
  snap(now) {
    const b = [];
    this.players.forEach((p) => { if (!p.ball) return; const q = p.ball; b.push([p.id, +q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), (p.moving ? 1 : 0) | (p.sunk ? 2 : 0) | (q.rail ? 4 : 0) | (q.air ? 8 : 0)]); });
    return { t: 's', n: now, b };
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
