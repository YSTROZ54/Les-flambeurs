// COURSE DE VOITURES côté serveur : un « Durable Object » (une salle « kart »), relié aux joueurs par WebSocket.
//  - le serveur fait avancer TOUTES les voitures, 30 fois par seconde, avec la même physique que le navigateur (api/_kartSim.js) à partir des touches
//    que chaque joueur envoie (accélérer, freiner, tourner, frein à main) : la position vient du serveur, personne ne peut « téléporter » sa voiture ;
//  - il gère les chocs entre voitures, les tours, les points de contrôle, l'arrivée, le classement, et le rythme des courses (grille → départ → course → résultats,
//    selon l'horloge du serveur) ;
//  - le navigateur ne fait que PRÉDIRE sa propre voiture (pour qu'elle réponde tout de suite) et se recale sur le serveur : il rejoue ses touches pas encore
//    prises en compte (« ack »).
// Messages du navigateur : { t:'in', seq, th, br, st, h } · { t:'car', id } · { t:'respawn' }.
// Messages du serveur : welcome · s (instantané de toutes les voitures, 15 fois par seconde) · ev (tour, arrivée…) · fin.
import { readToken } from './_auth.js';
import KS from './_kartSim.js';

const STEP_MS = 1000 / 30, SUB = 3, SNAP_EVERY = 2, MAX_PLAYERS = 12, MAX_QUEUE = 8;
export const CAR_IDS = ['eb110', 'gt3r', 'ferrari', 'rb22', 'bolide', 'noire', 'muscle', 'mystery'];

const num = (v, lo, hi) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };

export class KartRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];   // la clé de vérification des jetons vient des variables d'environnement
    this.players = new Map(); this.cyc = -1; this.timer = null; this.last = 0; this.acc = 0; this.n = 0; this.offset = 0;   // offset : décalage d'horloge, uniquement pour les tests
  }
  now() { return Date.now() + this.offset; }

  // vérifie la demande de connexion ; renvoie { error, status } ou { key, name, car }
  admit(url) {
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    const key = String(tok.u).toLowerCase();
    if (this.players.size >= MAX_PLAYERS && !this.players.has(key)) return { error: 'Course complète', status: 503 };
    const car = url.searchParams.get('car');
    return { key, name: String(url.searchParams.get('name') || tok.u).slice(0, 20), car: CAR_IDS.includes(car) ? car : CAR_IDS[0] };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
    const a = this.admit(url);
    if (a.error) return new Response(a.error, { status: a.status });
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    this.join(server, a.key, a.name, a.car);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ------------------------------ joueurs ------------------------------ */
  join(ws, key, name, carId) {
    const old = this.players.get(key);
    if (old) { try { old.ws.close(1000, 'autre connexion'); } catch (e) { /* ok */ } this.players.delete(key); }
    const p = { k: key, n: name, carId, ws, car: KS.newCar(), queue: [], last: { th: 0, br: 0, steer: 0, hand: false }, ack: 0, rc: 0, joined: Date.now() };
    this.players.set(key, p);
    const pi = KS.phaseInfo(this.now());
    this.cyc = this.cyc === -1 ? pi.cyc : this.cyc;
    this.assignSlot(p, pi);
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.send(ws, { t: 'welcome', now: this.now(), you: key, cars: this.snapCars() });
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.tick(), 15); }
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    if (!this.players.size && this.timer) { clearInterval(this.timer); this.timer = null; this.cyc = -1; }
  }
  // la place sur la grille : selon l'ordre alphabétique des pilotes présents ; en cours de course on repart de la grille avec le chronomètre de la course
  assignSlot(p, pi) {
    const names = [...this.players.values()].map((q) => q.k).sort(), slot = Math.max(0, names.indexOf(p.k));
    const c = p.car; KS.placeOnGrid(c, slot); c.lap = 0; c.cp = 0; c.fin = 0; c.best = 0; c.wrong = 0; c.lapStart = pi.raceStart; p.queue = []; p.rc++;
  }
  startCycle(pi) {
    this.cyc = pi.cyc;
    const names = [...this.players.values()].map((q) => q.k).sort();
    this.players.forEach((p) => {
      const c = p.car, slot = names.indexOf(p.k);
      KS.placeOnGrid(c, slot); c.lap = 0; c.cp = 0; c.fin = 0; c.best = 0; c.wrong = 0; c.lapStart = pi.raceStart; p.queue = []; p.rc++;
    });
  }

  /* ------------------------------ messages ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 600) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'in') {
      const inp = { seq: Math.floor(Number(m.seq)) || 0, th: num(m.th, 0, 1), br: num(m.br, 0, 1), steer: num(m.st, -1, 1), hand: !!m.h };
      if (p.queue.length >= MAX_QUEUE) p.queue.shift();
      p.queue.push(inp);
    } else if (m.t === 'car') {
      if (CAR_IDS.includes(m.id) && KS.phaseInfo(this.now()).p === 'grid') { p.carId = m.id; this.broadcast({ t: 'car', k: p.k, c: p.carId }); }
    } else if (m.t === 'respawn') {
      const pi = KS.phaseInfo(this.now());
      if (pi.p === 'race' || pi.p === 'results') { KS.placeAtCheckpoint(p.car); p.queue = []; p.rc++; }
    }
  }

  /* ------------------------------ la boucle : 30 pas par seconde, 15 instantanés par seconde ------------------------------ */
  tick() {
    const now = Date.now(); this.acc += now - this.last; this.last = now;
    let guard = 0;
    while (this.acc >= STEP_MS && guard++ < 5) { this.acc -= STEP_MS; this.step(now - this.acc + this.offset); }
    if (this.acc > STEP_MS * 5) this.acc = 0;
  }
  step(now) {
    const pi = KS.phaseInfo(now);
    if (pi.cyc !== this.cyc) this.startCycle(pi);
    const locked = pi.p === 'grid' || pi.p === 'count', list = [...this.players.values()];
    list.forEach((p) => {
      let inp = p.queue.shift();
      if (inp) { p.ack = inp.seq; p.last = inp; } else inp = p.last;
      if (pi.p === 'results') { const vf = p.car.vx * Math.sin(p.car.yaw) - p.car.vz * Math.cos(p.car.yaw); inp = { th: 0, br: vf > 0.6 ? 0.6 : 0, steer: inp.steer, hand: false }; }   // on freine jusqu'à l'arrêt, sans reculer
      p.car.ev.length = 0;
      for (let i = 0; i < SUB; i++) KS.stepCar(p.car, inp, 1 / 90, locked);
    });
    if (!locked) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) KS.pairCollide(list[i].car, list[j].car);
    list.forEach((p) => {
      KS.trackProgress(p.car, pi, now).forEach((e) => {
        if (e.k === 'finish') this.broadcast({ t: 'fin', k: p.k, time: e.time });
        else this.send(p.ws, { t: 'ev', e });
      });
    });
    this.n++;
    if (this.n % SNAP_EVERY === 0 && list.length) this.broadcast({ t: 's', n: now, cyc: pi.cyc, cars: this.snapCars() });
  }

  /* ------------------------------ envoi ------------------------------ */
  snapCars() {
    const r = (v, d) => +v.toFixed(d);
    return [...this.players.values()].map((p) => {
      const c = p.car;
      return { k: p.k, n: p.n, c: p.carId, x: r(c.x, 2), z: r(c.z, 2), a: r(c.yaw, 3), vx: r(c.vx, 2), vz: r(c.vz, 2), p: r(c.prog, 4), f: c.fin, l: c.lap, b: c.best, cp: c.cp, ack: p.ack, st: r(c.st, 3), bo: r(c.boost, 2), dr: r(c.driftT, 2), rc: p.rc, sh: r(c.shake, 2), w: c.wrong > 1.5 ? 1 : 0 };
    });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
