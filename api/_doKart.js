// COURSE DE VOITURES côté serveur : un « Durable Object » (une salle « kart »), relié aux joueurs par WebSocket.
//  - le serveur fait avancer TOUTES les voitures, 30 fois par seconde, avec la même physique que le navigateur (api/_kartSim.js) à partir des touches
//    que chaque joueur envoie (accélérer, freiner, tourner, frein à main) : la position vient du serveur, personne ne peut « téléporter » sa voiture ;
//  - il gère les chocs entre voitures, les tours, les points de contrôle, l'arrivée, le classement ;
//  - SALLE D'ATTENTE : la course démarre toute seule dès que 2 pilotes sont présents. Un pilote seul peut lancer une course contre des bots (message « solo ») :
//    le serveur complète alors la grille avec des bots jusqu'à 6 voitures. Les bots sont pilotés ici (KS.botInput), pas dans les navigateurs ;
//  - le navigateur ne fait que PRÉDIRE sa propre voiture (pour qu'elle réponde tout de suite) et se recale sur le serveur : il rejoue ses touches pas encore
//    prises en compte (« ack »). Le serveur ne fait avancer une voiture que lorsqu'il a reçu une touche : pas de pas « à vide » qui ferait sauter la voiture en avant.
// Messages du navigateur : { t:'in', seq, th, br, st, h } · { t:'car', id } · { t:'respawn' } · { t:'solo' }.
// Messages du serveur : welcome · s (instantané de toutes les voitures, 15 fois par seconde) · ev (tour, point de contrôle…) · fin.
import { readToken } from './_auth.js';
import KS from './_kartSim.js';
import { isStaffActor } from './_roles.js';

const STEP_MS = 1000 / 30, SUB = 3, SNAP_EVERY = 2, MAX_PLAYERS = 12, MAX_QUEUE = 8, GRID_CARS = 6;
export const CAR_IDS = ['eb110', 'gt3r', 'ferrari', 'rb22', 'bolide', 'noire', 'muscle', 'mystery'];
const BOT_NAMES = ['Max', 'Lola', 'Yuki', 'Enzo', 'Sasha', 'Rico', 'Nina', 'Tom', 'Zoé', 'Luca', 'Ines', 'Hugo'];

const num = (v, lo, hi) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };

export class KartRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];   // la clé de vérification des jetons vient des variables d'environnement
    this.players = new Map(); this.bots = []; this.timer = null; this.last = 0; this.acc = 0; this.n = 0; this.offset = 0;   // offset : décalage d'horloge, uniquement pour les tests
    this.cs = -1; this.cut = 0; this.cyc = 0; this.withBots = false; this.early = false;                                                    // cs : heure de départ de la course en cours (-1 : salle d'attente)
  }
  now() { return Date.now() + this.offset; }

  // vérifie la demande de connexion ; renvoie { error, status } ou { key, name, car }
  async admit(url) {
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    const key = String(tok.u).toLowerCase();
    if (!(await isStaffActor(key))) return { error: 'Réservé au Patron, au Co Fondateur et au Staff', status: 403 };     // la course est encore en test
    if (this.players.size >= MAX_PLAYERS && !this.players.has(key)) return { error: 'Course complète', status: 503 };
    const car = url.searchParams.get('car');
    return { key, name: String(url.searchParams.get('name') || tok.u).slice(0, 20), car: CAR_IDS.includes(car) ? car : CAR_IDS[0] };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket requis', { status: 426 });
    const a = await this.admit(url);
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
    this.assignSlot(p);
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.send(ws, { t: 'welcome', now: this.now(), you: key, cs: this.cs, cut: this.cut, cyc: this.cyc, cars: this.snapCars() });
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.tick(), 15); }
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    if (!this.players.size) { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.cs = -1; this.cut = 0; this.bots = []; this.withBots = false; this.early = false; }
  }
  racers() { return [...[...this.players.values()].sort((a, b) => (a.k < b.k ? -1 : 1)), ...this.bots]; }
  resetCar(p, slot, raceStart) {
    const c = p.car; KS.placeOnGrid(c, slot); c.lap = 0; c.cp = 0; c.fin = 0; c.best = 0; c.wrong = 0; c.lapStart = raceStart; p.queue = []; p.rc = (p.rc || 0) + 1;
    if (p.bot) p.b.stuck = 0;
  }
  // un pilote qui arrive : il prend sa place sur la grille
  assignSlot(p) {
    const list = this.racers(), slot = this.cs >= 0 ? list.length - 1 : Math.max(0, list.indexOf(p));
    this.resetCar(p, slot, this.cs >= 0 ? this.cs + KS.GRID_MS + KS.COUNT_MS : 0);
  }
  // lance une course : grille 20 s, compte à rebours, course. withBots : on complète jusqu'à 6 voitures avec des bots.
  startCycle(now, withBots) {
    this.cyc++; this.cs = now; this.cut = 0; this.withBots = !!withBots; this.early = false; this.bots = [];
    if (withBots) {
      const nb = Math.max(0, GRID_CARS - this.players.size), names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < nb; i++) this.bots.push({ bot: true, k: 'bot' + (i + 1), n: 'Bot ' + names[i % names.length], carId: CAR_IDS[Math.floor(Math.random() * CAR_IDS.length)], car: KS.newCar(), b: { skill: 0.88 + Math.random() * 0.1, lat: (Math.random() - 0.5) * 6, stuck: 0 }, rc: 0 });
    }
    const raceStart = now + KS.GRID_MS + KS.COUNT_MS;
    this.racers().forEach((p, slot) => this.resetCar(p, slot, raceStart));
  }
  stopCycle() { this.cs = -1; this.cut = 0; this.bots = []; this.withBots = false; this.early = false; this.cyc++; this.racers().forEach((p, slot) => this.resetCar(p, slot, 0)); }

  /* ------------------------------ messages ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 600) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'in') {
      const inp = { seq: Math.floor(Number(m.seq)) || 0, th: num(m.th, 0, 1), br: num(m.br, 0, 1), steer: num(m.st, -1, 1), hand: !!m.h };
      if (p.queue.length >= MAX_QUEUE) p.queue.shift();
      p.queue.push(inp);
    } else if (m.t === 'car') {
      const pi = KS.phaseAt(this.now(), this.cs, this.cyc, this.cut);
      if (CAR_IDS.includes(m.id) && (pi.p === 'grid' || pi.p === 'wait')) { p.carId = m.id; this.broadcast({ t: 'car', k: p.k, c: p.carId }); }
    } else if (m.t === 'respawn') {
      const pi = KS.phaseAt(this.now(), this.cs, this.cyc, this.cut);
      if (pi.p === 'race' || pi.p === 'results') { KS.placeAtCheckpoint(p.car); p.queue = []; p.rc++; }
    } else if (m.t === 'solo') {                                  // « jouer contre des bots » : seulement si personne ne court et que je suis seul
      const pi = KS.phaseAt(this.now(), this.cs, this.cyc, this.cut);
      if (pi.p === 'wait' && this.players.size === 1) this.startCycle(this.now(), true);
    }
  }

  /* ------------------------------ la boucle : 30 pas par seconde, 15 instantanés par seconde ------------------------------ */
  tick() {
    const now = Date.now(); this.acc += now - this.last; this.last = now;
    let guard = 0;
    while (this.acc >= STEP_MS && guard++ < 5) { this.acc -= STEP_MS; this.step(now - this.acc + this.offset); }
    if (this.acc > STEP_MS * 5) this.acc = 0;
  }
  // salle d'attente / fin de course : qui lance la suivante ?
  flow(now) {
    let pi = KS.phaseAt(now, this.cs, this.cyc, this.cut);
    if (pi.p === 'wait') { if (this.players.size >= 2) { this.startCycle(now, false); pi = KS.phaseAt(now, this.cs, this.cyc, this.cut); } }
    else if (pi.end) { if (this.players.size >= 2) this.startCycle(now, false); else this.stopCycle(); pi = KS.phaseAt(now, this.cs, this.cyc, this.cut); }
    else if ((pi.p === 'grid' || pi.p === 'count') && !this.withBots && this.players.size < 2) { this.stopCycle(); pi = KS.phaseAt(now, this.cs, this.cyc, this.cut); }
    return pi;
  }
  step(now) {
    const pi = this.flow(now);
    const locked = pi.p === 'grid' || pi.p === 'count' || pi.p === 'wait', humans = [...this.players.values()], list = this.racers();
    humans.forEach((p) => {
      // une touche reçue = un pas de simulation (2 si le navigateur a pris du retard) : le serveur ne « rejoue » jamais deux fois la même touche
      let n = p.queue.length > 3 ? 2 : 1;
      p.car.ev.length = 0;
      while (n-- > 0 && p.queue.length) {
        const inp0 = p.queue.shift(); p.ack = inp0.seq; p.last = inp0; let inp = inp0;
        if (pi.p === 'results') { const vf = p.car.vx * Math.sin(p.car.yaw) - p.car.vz * Math.cos(p.car.yaw); inp = { th: 0, br: vf > 0.6 ? 0.6 : 0, steer: inp0.steer, hand: false }; }   // on freine jusqu'à l'arrêt, sans reculer
        for (let i = 0; i < SUB; i++) KS.stepCar(p.car, inp, 1 / 90, locked);
      }
    });
    this.bots.forEach((b) => {
      const c = b.car; let inp = locked ? { th: 0, br: 0, steer: 0, hand: false } : KS.botInput(c, b.b, STEP_MS / 1000);
      if (pi.p === 'results') inp = { th: 0, br: 0.7, steer: 0, hand: false };
      if (pi.p !== 'race') b.b.stuck = 0;
      if (b.b.stuck > 1.5) { KS.placeAtCheckpoint(c); b.b.stuck = 0; }
      c.ev.length = 0;
      for (let i = 0; i < SUB; i++) KS.stepCar(c, inp, 1 / 90, locked);
    });
    if (!locked) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) KS.pairCollide(list[i].car, list[j].car);
    list.forEach((p) => {
      KS.trackProgress(p.car, pi, now).forEach((e) => {
        if (e.k === 'finish') this.broadcast({ t: 'fin', k: p.k, time: e.time });
        else if (!p.bot) this.send(p.ws, { t: 'ev', e });
      });
    });
    // tous les pilotes humains sont arrivés : on passe aux résultats 5 secondes plus tard
    if (pi.p === 'race' && !this.early && humans.length && humans.every((p) => p.car.fin)) { this.early = true; this.cut = Math.min(now - this.cs + 5000, KS.GRID_MS + KS.COUNT_MS + KS.RACE_MS); }
    this.n++;
    if (this.n % SNAP_EVERY === 0 && humans.length) this.broadcast({ t: 's', n: now, cs: this.cs, cut: this.cut, cyc: this.cyc, cars: this.snapCars() });
  }

  /* ------------------------------ envoi ------------------------------ */
  snapCars() {
    const r = (v, d) => +v.toFixed(d);
    return this.racers().map((p) => {
      const c = p.car;
      return { k: p.k, n: p.n, c: p.carId, bt: p.bot ? 1 : 0, x: r(c.x, 2), z: r(c.z, 2), a: r(c.yaw, 3), vx: r(c.vx, 2), vz: r(c.vz, 2), p: r(c.prog, 4), f: c.fin, l: c.lap, b: c.best, cp: c.cp, ack: p.ack || 0, st: r(c.st, 3), bo: r(c.boost, 2), dr: r(c.driftT, 2), rc: p.rc, sh: r(c.shake, 2), w: c.wrong > 1.5 ? 1 : 0 };
    });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
