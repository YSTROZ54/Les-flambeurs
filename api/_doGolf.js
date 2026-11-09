// MINI GOLF côté serveur : un « Durable Object » par parcours (golfjardin, golfneon), relié aux joueurs par WebSocket.
//  - le serveur simule CHAQUE coup (même physique que le navigateur : api/_golfSim.js) et renvoie la trajectoire : impossible de tricher sur un coup ;
//  - c'est lui qui compte les coups, décide quand un trou est fini, passe au trou suivant (quand tout le monde a fini, ou 60 s après le premier arrivé)
//    et établit le classement ;
//  - les obstacles qui bougent (moulin, blocs) suivent l'heure du serveur ; chaque joueur la reçoit à la connexion.
// Messages du navigateur : { t:'shot', yaw, power } · { t:'reset' }.
// Messages du serveur : welcome · players · hole · shot · over.
import { readToken } from './_auth.js';
import GS from './_golfSim.js';
import { isStaffActor } from './_roles.js';

const TICK_MS = 500, DONE_DELAY_MS = 2600, OVER_MS = 14000, MAX_SIM_S = 30, TRAJ_DT = 1 / 30;
const COLORS = 8;
const COURSE_IDS = ['golfjardin', 'golfneon'];

export class GolfRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];   // la clé de vérification des jetons vient des variables d'environnement
    this.course = ''; this.holes = null; this.players = new Map();
    this.game = { gid: 0, hole: 0, phase: 'play', holeStart: 0, firstDone: 0, overAt: 0, lastDone: 0 };
    this.timer = null;
  }

  // vérifie la demande de connexion ; renvoie { error, status } ou { key, name }
  async admit(url) {
    const course = url.searchParams.get('course');
    if (!COURSE_IDS.includes(course)) return { error: 'Parcours inconnu', status: 404 };
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    if (!(await isStaffActor(String(tok.u).toLowerCase()))) return { error: 'Réservé au Patron, au Co Fondateur et au Staff', status: 403 };     // le golf est encore en test
    if (!this.course) { this.course = course; this.holes = GS.COURSES[course].holes.map((h) => GS.buildHoleData(h)); }
    return { key: String(tok.u).toLowerCase(), name: String(url.searchParams.get('name') || tok.u).slice(0, 20) };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
    const a = await this.admit(url);
    if (a.error) return new Response(a.error, { status: a.status });
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    this.join(server, a.key, a.name);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ------------------------------ joueurs ------------------------------ */
  join(ws, key, name) {
    const old = this.players.get(key);
    if (old) { try { old.ws.close(1000, 'autre connexion'); } catch (e) { /* ok */ } this.players.delete(key); }
    const used = new Set([...this.players.values()].map((p) => p.c));
    let c = 0; while (used.has(c) && c < COLORS - 1) c++;
    const p = { k: key, n: name, c, ws, card: [], strokes: 0, done: false, sunk: false, ball: null, safe: null, busyUntil: 0, seen: Date.now() };
    this.players.set(key, p);
    if (!this.game.gid) this.newGame(true); else this.placeOnHole(p);
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.send(ws, { t: 'welcome', now: Date.now(), course: this.course, you: key, game: this.pubGame(), players: this.pubPlayers(), c });
    this.broadcast({ t: 'players', game: this.pubGame(), players: this.pubPlayers() });
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    this.broadcast({ t: 'players', game: this.pubGame(), players: this.pubPlayers() });
    if (!this.players.size && this.timer) { clearInterval(this.timer); this.timer = null; this.game.gid = 0; }
  }
  placeOnHole(p) {
    const H = this.holes[Math.min(this.game.hole, this.holes.length - 1)];
    p.strokes = 0; p.done = false; p.sunk = false; p.busyUntil = 0;
    p.ball = { x: H.tee[0], z: H.tee[1], y: GS.floorH(H, H.tee[0], H.tee[1]), vx: 0, vy: 0, vz: 0, air: false };
    p.safe = { x: H.tee[0], z: H.tee[1] };
  }

  /* ------------------------------ la partie ------------------------------ */
  newGame(silent) {
    this.game = { gid: Date.now(), hole: 0, phase: 'play', holeStart: Date.now(), firstDone: 0, overAt: 0, lastDone: 0 };
    this.players.forEach((p) => { p.card = []; this.placeOnHole(p); });
    if (!silent) this.broadcast({ t: 'hole', game: this.pubGame(), players: this.pubPlayers() });
  }
  nextHole() {
    this.game.hole++;
    if (this.game.hole >= this.holes.length) {
      this.game.phase = 'over'; this.game.overAt = Date.now() + OVER_MS; this.game.hole = this.holes.length;
      this.broadcast({ t: 'over', game: this.pubGame(), players: this.pubPlayers() });
      return;
    }
    this.game.holeStart = Date.now(); this.game.firstDone = 0; this.game.lastDone = 0;
    this.players.forEach((p) => this.placeOnHole(p));
    this.broadcast({ t: 'hole', game: this.pubGame(), players: this.pubPlayers() });
  }
  tick() {
    const now = Date.now(), g = this.game;
    if (!this.players.size) return;
    if (g.phase === 'over') { if (now >= g.overAt) this.newGame(); return; }
    const H = this.holes[g.hole], list = [...this.players.values()];
    if (g.firstDone && now - g.firstDone > GS.WAIT_S * 1000) {          // les retardataires finissent avec une pénalité
      list.forEach((p) => { if (!p.done && now >= p.busyUntil) this.finish(p, Math.min(GS.MAXSHOTS + 1, Math.max(p.strokes + 2, H.par + 3)), 'time'); });
    }
    if (list.every((p) => p.done) && g.lastDone && now - g.lastDone > DONE_DELAY_MS) this.nextHole();
  }
  finish(p, score, how) {
    p.done = true; p.card[this.game.hole] = score; p.busyUntil = 0;
    const now = Date.now(); if (!this.game.firstDone) this.game.firstDone = now; this.game.lastDone = now;
    this.broadcast({ t: 'done', k: p.k, score, how, par: this.holes[this.game.hole].par, game: this.pubGame(), players: this.pubPlayers() });
  }

  /* ------------------------------ les coups ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 2000) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    p.seen = Date.now();
    if (m.t === 'shot') this.shot(p, Number(m.yaw), Number(m.power));
    else if (m.t === 'reset') this.resetBall(p);
  }
  canAct(p) { return this.game.phase === 'play' && !p.done && !p.sunk && Date.now() >= p.busyUntil; }
  shot(p, yaw, power) {
    if (!this.canAct(p) || !isFinite(yaw) || !isFinite(power) || power < 0.03) return;
    power = Math.min(1, power);
    const g = this.game, H = this.holes[g.hole], R = GS.R, b = p.ball;
    const sp = Math.pow(power, 1.15) * GS.VMAX;
    b.vx = Math.sin(yaw) * sp; b.vz = -Math.cos(yaw) * sp; b.vy = 0; b.air = false;
    p.safe = { x: b.x, z: b.z }; p.strokes++;
    // les autres balles posées sur le trou sont des obstacles fixes (sauf celle qui est au même endroit que la nôtre : le départ)
    const others = [];
    this.players.forEach((q) => { if (q !== p && !q.done && !q.sunk && q.ball && Math.hypot(q.ball.x - b.x, q.ball.z - b.z) >= R * 2.2) others.push({ x: q.ball.x, z: q.ball.z, r: R, y0: q.ball.y - 0.2, y1: q.ball.y + 0.2, e: 0.85 }); });
    const t0 = Date.now() / 1000, traj = [[+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]];
    let res = '', t = t0, steps = 0, frames = 0, shotT = 0;
    const DT = 1 / 60;
    while (!res && shotT < MAX_SIM_S) {
      const spd = Math.hypot(b.vx, b.vz, b.vy), n = Math.min(40, Math.max(1, Math.ceil(spd * DT / 0.02))), sub = DT / n;
      let r2 = '';
      for (let i = 0; i < n && !r2; i++) r2 = GS.simStep(b, H, sub, t, others, null);
      t += DT; shotT += DT; steps++;
      if (steps % 2 === 0) traj.push([+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]);
      if (r2 === 'cup') res = 'cup'; else if (r2 === 'out') res = 'out';
      else {
        const fl = GS.floorAt(H, b.x, b.z, b.y + 0.12), steep = fl ? Math.hypot(fl.f.gx, fl.f.gz) : 0;
        if (!b.air && Math.hypot(b.vx, b.vz) < 0.07 && (steep < 0.02 || shotT > 20)) { b.vx = b.vz = b.vy = 0; res = 'rest'; }
      }
    }
    if (!res) { b.vx = b.vz = b.vy = 0; res = 'rest'; }
    frames = traj.length;
    let how = '';
    if (res === 'cup') { p.sunk = true; b.x = H.cup[0]; b.z = H.cup[1]; }
    else if (res === 'out') { p.strokes++; b.x = p.safe.x; b.z = p.safe.z; b.y = GS.floorH(H, b.x, b.z); b.vx = b.vz = b.vy = 0; b.air = false; how = 'out'; }
    p.busyUntil = Date.now() + frames * TRAJ_DT * 1000 + 250;
    this.broadcast({ t: 'shot', k: p.k, yaw, power, t0: Math.round(t0 * 1000), dt: TRAJ_DT, traj, res, how, end: [+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)], strokes: p.strokes });
    if (res === 'cup') setTimeout(() => { if (this.game.hole === g.hole && this.game.gid === g.gid && !p.done && this.players.get(p.k) === p) this.finish(p, p.strokes, ''); }, frames * TRAJ_DT * 1000 + 150);
    else if (p.strokes >= GS.MAXSHOTS) setTimeout(() => { if (this.game.hole === g.hole && this.game.gid === g.gid && !p.done && this.players.get(p.k) === p) this.finish(p, GS.MAXSHOTS + 1, 'max'); }, frames * TRAJ_DT * 1000 + 150);
  }
  resetBall(p) {
    if (!this.canAct(p) || !p.safe) return;
    const b = p.ball;
    if (Math.hypot(b.x - p.safe.x, b.z - p.safe.z) < 0.05) return;
    const H = this.holes[this.game.hole];
    b.x = p.safe.x; b.z = p.safe.z; b.y = GS.floorH(H, b.x, b.z); b.vx = b.vz = b.vy = 0; b.air = false; p.strokes++;
    this.broadcast({ t: 'reset', k: p.k, end: [+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)], strokes: p.strokes });
    if (p.strokes >= GS.MAXSHOTS && !p.done) this.finish(p, GS.MAXSHOTS + 1, 'max');
  }

  /* ------------------------------ envoi ------------------------------ */
  pubGame() { const g = this.game; return { gid: g.gid, hole: g.hole, phase: g.phase, holeStart: g.holeStart, firstDone: g.firstDone, overAt: g.overAt, now: Date.now() }; }
  pubPlayers() {
    return [...this.players.values()].map((p) => ({ k: p.k, n: p.n, c: p.c, s: p.strokes, d: p.done ? 1 : 0, sk: p.sunk ? 1 : 0, card: p.card.slice(0, this.holes.length).map((v) => (v == null ? null : v)), x: +p.ball.x.toFixed(3), y: +p.ball.y.toFixed(3), z: +p.ball.z.toFixed(3) }));
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
