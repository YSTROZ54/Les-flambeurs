// PROP HUNT côté serveur : un « Durable Object » (une salle), relié aux joueurs par WebSocket.
//  - le serveur fait avancer TOUS les joueurs (30 pas/s) avec le même code que le navigateur (api/_propSim.js) : positions, collisions, sauts ;
//  - il gère les manches : salon (20 s, on s'entraîne) → cachette (30 s : les chasseurs sont bloqués et AUCUN caché n'est envoyé aux chasseurs) → chasse (4 min)
//    → résultats (12 s) ; il choisit la carte (vote), les chasseurs, les points de départ ;
//  - un caché se transforme en objet de la carte seulement si le serveur confirme qu'il est tout près de cet objet ;
//  - les tirs sont calculés ICI (rayon depuis l'œil du chasseur contre murs, objets et cachés) : munitions, cadence, dégâts, rechargement, tout vient du serveur.
//    Tirer sur un objet « normal » coûte de la vie au chasseur. Un caché touché à mort devient chasseur.
// Messages du navigateur : in · morph · lock · taunt · shoot · weapon · reload · vote.
// Messages du serveur : welcome · s (instantané 15 fois/s) · ev (tir, touche, mort, provocation, aïe) · end (résultats).
import { readToken } from './_auth.js';
import PS from './_propSim.js';
import { isStaffActor } from './_roles.js';

const STEP = 1 / 30, STEP_MS = 1000 / 30, SUB = 3, SNAP_EVERY = 2, MAX_PLAYERS = 16, MAX_QUEUE = 8;
const num = (v, lo, hi) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
const R = (v, d) => +v.toFixed(d);

export class PropRoom {
  constructor(state, env) {
    this.state = state; this.env = env;
    for (const k of Object.keys(env || {})) if (typeof env[k] === 'string') process.env[k] = env[k];
    this.players = new Map(); this.timer = null; this.last = 0; this.acc = 0; this.n = 0;
    this.ph = 'lobby'; this.tl = PS.TIMES.lobby; this.mapId = PS.MAP_IDS[0]; this.map = PS.makeMap(this.mapId); this.t = 0; this.lastSeekers = new Set(); this.win = '';
    // la salle : « pub-<carte> » (publique, une par carte, la manche démarre toute seule) ou « priv-<CODE> » (salon privé : le chef de salle lance la manche)
    this.cfg = null; this.host = ''; this.starting = false;
  }

  async admit(url) {
    const tok = readToken(String(url.searchParams.get('token') || ''));
    if (!tok) return { error: 'Connexion requise', status: 401 };
    const key = String(tok.u).toLowerCase();
    if (!(await isStaffActor(key))) return { error: 'Réservé au Patron, au Co Fondateur et au Staff', status: 403 };     // le Prop Hunt est encore en test
    const room = String(url.searchParams.get('room') || '');
    if (!/^(pub-(manoir|casino|marche|station|musee|port)|priv-[A-Z0-9]{4,6})$/.test(room)) return { error: 'Salon invalide', status: 404 };
    if (!this.cfg) {
      if (room.startsWith('pub-')) this.cfg = { map: room.slice(4), priv: false, code: '' };
      else {
        const m = String(url.searchParams.get('map') || '');
        if (url.searchParams.get('create') !== '1') return { error: 'Salon introuvable : vérifie le code', status: 404 };
        if (!PS.MAPS[m]) return { error: 'Carte inconnue', status: 400 };
        this.cfg = { map: m, priv: true, code: room.slice(5) };
      }
    }
    if (this.players.size >= MAX_PLAYERS && !this.players.has(key)) return { error: 'Salle complète', status: 503 };
    return { key, name: String(url.searchParams.get('name') || tok.u).slice(0, 20) };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.searchParams.get('info') === '1') return new Response(JSON.stringify({ n: this.players.size, ph: this.ph }), { headers: { 'Content-Type': 'application/json' } });   // pour l'écran d'accueil : combien de joueurs ?
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
    const p = { k: key, n: name, ws, c: PS.newPlayer(), queue: [], last: { f: 0, s: 0, run: false, jump: false, yaw: 0, pitch: 0 }, ack: 0, r: 'h', type: '', lock: false, hp: 100, sc: 0, rc: 0,
      w: 'pistolet', ammo: {}, cd: 0, rel: 0, stun: 0, morphCd: 0, tauntCd: 0, dead: false };
    if (!this.players.size && this.cfg && this.cfg.map !== this.mapId) { this.mapId = this.cfg.map; this.map = PS.makeMap(this.mapId); }
    this.players.set(key, p);
    if (!this.host || !this.players.has(this.host)) this.host = key;
    this.respawn(p, this.ph === 'hunt' ? 's' : 'h');                    // arrivé en pleine chasse : on est chasseur
    ws.addEventListener('message', (ev) => this.onMessage(p, ev));
    const bye = () => this.leave(p);
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    this.send(ws, { t: 'welcome', you: key, maps: PS.MAP_IDS });
    if (!this.timer) { this.last = Date.now(); this.acc = 0; this.timer = setInterval(() => this.tick(), 15); }
  }
  leave(p) {
    if (this.players.get(p.k) !== p) return;
    this.players.delete(p.k);
    if (this.host === p.k) this.host = this.players.size ? [...this.players.keys()][0] : '';
    if (!this.players.size) { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.toLobby(); if (this.cfg && this.cfg.priv) this.cfg = null; }   // un salon privé disparaît quand le dernier part
  }
  // remet un joueur sur un point de départ avec le rôle voulu
  respawn(p, role, spawnIndex) {
    p.r = role; p.hp = 100; p.dead = false; p.lock = false; p.stun = 0; p.rc++; p.queue = [];
    const list = role === 's' ? this.map.spawnS : this.map.spawnH, s = list[(spawnIndex === undefined ? Math.floor(Math.random() * list.length) : spawnIndex) % list.length] || [0, 0];
    Object.assign(p.c, { x: s[0], y: 0, z: s[1], vx: 0, vz: 0, vy: 0, air: false });
    if (role === 'h') { const cand = this.map.props.filter((q) => q.y === 0 && !PS.WALLT[q.t]), o = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null; p.type = o ? o.t : 'crate'; p.pvar = o ? (o.v || 0) : 0; PS.setShape(p.c, p.type); }
    else { p.type = ''; PS.setShape(p.c, ''); }
    p.w = 'pistolet'; PS.WEAPON_IDS.forEach((w) => { p.ammo[w] = PS.WEAPONS[w].mag; }); p.cd = 0; p.rel = 0;
  }

  /* ------------------------------ manches ------------------------------ */
  toLobby() {
    this.ph = 'lobby'; this.tl = PS.TIMES.lobby; this.win = ''; this.starting = false;
    this.players.forEach((p) => this.respawn(p, 'h'));
  }
  startRound() {
    const ids = [...this.players.keys()];
    if (ids.length < 2) { this.tl = PS.TIMES.lobby; this.starting = false; return; }
    // les chasseurs : au hasard, 1 pour 4 joueurs
    const nS = Math.max(1, Math.floor(ids.length / 4));
    const shuf = (a) => a.sort(() => Math.random() - 0.5), chosen = shuf(ids.slice()).slice(0, nS);
    this.lastSeekers = new Set(chosen);
    const hs = shuf(this.map.spawnH.map((_, i) => i)); let hi = 0, si = 0;
    this.players.forEach((p) => { p.sc = 0; if (chosen.includes(p.k)) this.respawn(p, 's', si++); else this.respawn(p, 'h', hs[hi++ % hs.length]); });
    this.ph = 'hide'; this.tl = PS.TIMES.hide; this.win = '';
    this.broadcast({ t: 'ev', e: 'round', map: this.mapId });
  }
  endRound(win) {
    this.win = win; this.ph = 'results'; this.tl = PS.TIMES.results;
    this.players.forEach((p) => { if (win === 'h' && p.r === 'h' && !p.dead) p.sc += 150; if (win === 's' && p.r === 's') p.sc += 50; });
    const sc = [...this.players.values()].map((p) => ({ k: p.k, n: p.n, sc: p.sc, r: p.r })).sort((a, b) => b.sc - a.sc);
    this.broadcast({ t: 'end', win, sc });
  }

  /* ------------------------------ messages ------------------------------ */
  onMessage(p, ev) {
    let m; try { if (typeof ev.data !== 'string' || ev.data.length > 600) return; m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'in') {
      const inp = { seq: Math.floor(Number(m.seq)) || 0, f: num(m.f, -1, 1), s: num(m.s, -1, 1), run: !!m.run, jump: !!m.jump, yaw: num(m.yaw, -1000, 1000), pitch: num(m.pitch, -1.5, 1.5) };
      if (p.queue.length >= MAX_QUEUE) p.queue.shift();
      p.queue.push(inp);
    } else if (m.t === 'morph') {
      if (p.r !== 'h' || p.dead || this.ph === 'results' || p.morphCd > this.t) return;
      const o = this.map.props[Math.floor(Number(m.i))]; if (!o) return;
      if (Math.hypot(o.x - p.c.x, o.z - p.c.z) > 5.5) return;                 // il faut être tout près de l'objet
      p.type = o.t; p.pvar = o.v || 0; PS.setShape(p.c, o.t); p.morphCd = this.t + 0.35;
    } else if (m.t === 'lock') {
      if (p.r === 'h' && !p.dead) p.lock = !p.lock;
    } else if (m.t === 'taunt') {
      if (p.r !== 'h' || p.dead || p.tauntCd > this.t || this.ph === 'results') return;
      p.tauntCd = this.t + 14; if (this.ph === 'hunt') p.sc += 10;
      this.broadcast({ t: 'ev', e: 'taunt', k: p.k, x: R(p.c.x, 2), y: R(p.c.y, 2), z: R(p.c.z, 2), snd: Math.floor(Math.random() * 5) });
    } else if (m.t === 'weapon') {
      if (p.r === 's' && PS.WEAPONS[m.w] && p.rel <= this.t) { p.w = m.w; p.cd = this.t + 0.3; }
    } else if (m.t === 'reload') {
      this.reload(p);
    } else if (m.t === 'start') {                                                  // salon privé : le chef de salle lance la manche (2 joueurs minimum)
      if (this.cfg && this.cfg.priv && p.k === this.host && this.ph === 'lobby' && this.players.size >= 2 && !this.starting) { this.starting = true; this.tl = 5; }
    } else if (m.t === 'shoot') {
      this.shoot(p, num(m.yaw, -1000, 1000), num(m.pitch, -1.5, 1.5));
    }
  }
  reload(p) {
    if (p.r !== 's' || p.dead || this.ph !== 'hunt' || p.rel > this.t) return;
    const W = PS.WEAPONS[p.w]; if (p.ammo[p.w] >= W.mag || !(W.reload > 0)) return;       // le lance-grenade ne se recharge pas
    p.rel = this.t + W.reload; this.send(p.ws, { t: 'ev', e: 'reload', w: p.w, d: W.reload });
  }
  shoot(p, yaw, pitch) {
    if (p.r !== 's' || p.dead || this.ph !== 'hunt' || p.stun > this.t) return;
    if (p.rel > this.t) return;
    if (p.rel && p.rel <= this.t) { p.ammo[p.w] = PS.WEAPONS[p.w].mag; p.rel = 0; }
    const W = PS.WEAPONS[p.w]; if (p.cd > this.t) return;
    if (p.ammo[p.w] <= 0) { this.reload(p); return; }
    p.ammo[p.w]--; p.cd = this.t + W.cd * 0.92;
    const c = p.c, ox = c.x, oy = c.y + c.eye, oz = c.z;
    const jy = yaw + (Math.random() - 0.5) * 2 * W.spread, jp = pitch + (Math.random() - 0.5) * 2 * W.spread;
    const hiders = [...this.players.values()].filter((q) => q.r === 'h' && !q.dead).map((q) => ({ k: q.k, x: q.c.x, z: q.c.z, r: q.c.r, y0: q.c.y, h: q.c.y + q.c.h, p: q }));
    const hit = PS.raycast(this.map, ox, oy, oz, jy, jp, 70, hiders);
    const cp = Math.cos(jp), tx = ox + Math.sin(jy) * cp * hit.t, ty = oy + Math.sin(jp) * hit.t, tz = oz - Math.cos(jy) * cp * hit.t;
    const ev = { t: 'ev', e: 'shot', k: p.k, w: p.w, ox: R(ox, 2), oy: R(oy, 2), oz: R(oz, 2), tx: R(tx, 2), ty: R(ty, 2), tz: R(tz, 2), h: hit.kind || '' };
    const victims = [];
    if (W.radius) {
      // grenade : explosion à l'impact, tous les cachés dans le rayon sont touchés (moins fort quand on est loin du centre)
      ev.ex = W.radius;
      for (const q of this.players.values()) {
        if (q.r !== 'h' || q.dead) continue;
        const d = Math.max(0, Math.hypot(q.c.x - tx, q.c.y + q.c.h / 2 - ty, q.c.z - tz) - q.c.r);
        if (d <= W.radius) victims.push([q, Math.round(W.dmg * (1 - 0.6 * d / W.radius))]);
      }
    } else if (hit.kind === 'hider') victims.push([hit.ref.p, W.dmg]);
    else if (hit.kind === 'prop') {                                                // un objet « normal » : le chasseur se blesse
      p.hp -= 4; this.send(p.ws, { t: 'ev', e: 'ouch', hp: Math.max(0, p.hp) });
      if (p.hp <= 0) { p.stun = this.t + 4; p.hp = 60; this.send(p.ws, { t: 'ev', e: 'stun', d: 4 }); }
    }
    ev.hit = victims.length; const dead = [];
    victims.forEach(([v, dmg]) => {
      v.hp -= dmg; this.send(v.ws, { t: 'ev', e: 'hurt', hp: Math.max(0, v.hp), by: p.k });
      if (v.hp <= 0) { v.dead = true; p.sc += 100; ev.kill = 1; dead.push(v); }
    });
    this.broadcast(ev);
    dead.forEach((v) => this.killed(v, p));
  }
  killed(v, by) {
    this.broadcast({ t: 'ev', e: 'kill', k: v.k, by: by.k });
    this.respawn(v, 's', Math.floor(Math.random() * 6));                          // un caché trouvé rejoint les chasseurs
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
    // phases
    if (this.ph === 'lobby') {
      const priv = !!(this.cfg && this.cfg.priv);
      if (n < 2) { this.tl = PS.TIMES.lobby; this.starting = false; }
      else if (!priv || this.starting) { if (this.tl <= 0) this.startRound(); }      // salon public : compte à rebours automatique ; privé : seulement après « Lancer »
      else this.tl = PS.TIMES.lobby;
    } else if (this.ph === 'hide') {
      if (this.tl <= 0) { this.ph = 'hunt'; this.tl = PS.TIMES.hunt; this.broadcast({ t: 'ev', e: 'hunt' }); }
    } else if (this.ph === 'hunt') {
      const hl = list.filter((p) => p.r === 'h' && !p.dead).length, sl = list.filter((p) => p.r === 's').length;
      if (n < 2 || !sl) this.toLobby();
      else if (!hl) this.endRound('s');
      else if (this.tl <= 0) this.endRound('h');
    } else if (this.ph === 'results') {
      if (this.tl <= 0) this.toLobby();
    }
    if (this.ph === 'hide' && n < 2) this.toLobby();
    // déplacements
    list.forEach((p) => {
      let inp = p.queue.shift();
      if (inp) { p.ack = inp.seq; p.last = inp; } else inp = p.last;
      const frozen = (p.r === 's' && (this.ph === 'hide' || p.stun > this.t)) || (p.r === 'h' && p.lock) || this.ph === 'results';
      if (frozen) { p.c.yaw = inp.yaw; p.c.pitch = inp.pitch; p.c.vx = 0; p.c.vz = 0; return; }
      for (let i = 0; i < SUB; i++) PS.stepPlayer(p.c, inp, 1 / 90, this.map);
    });
    // le rechargement se termine
    list.forEach((p) => { if (p.rel && p.rel <= this.t) { p.ammo[p.w] = PS.WEAPONS[p.w].mag; p.rel = 0; } });
    this.n++;
    if (this.n % SNAP_EVERY === 0 && n) this.snapshots(list);
  }

  /* ------------------------------ envoi ------------------------------ */
  snapshots(list) {
    const base = { t: 's', ph: this.ph, tl: R(Math.max(0, this.tl), 1), m: this.mapId, win: this.win, pv: this.cfg && this.cfg.priv ? 1 : 0, code: this.cfg ? this.cfg.code : '', host: this.host, go: this.starting ? 1 : 0 };
    list.forEach((viewer) => {
      const hideHiders = viewer.r === 's' && this.ph === 'hide';                  // pendant la cachette, les chasseurs ne reçoivent rien sur les cachés
      const pl = [];
      list.forEach((p) => {
        if (hideHiders && p.r === 'h') return;
        const c = p.c, o = { k: p.k, n: p.n, r: p.r, x: R(c.x, 2), y: R(c.y, 2), z: R(c.z, 2), a: R(c.yaw, 3), vx: R(c.vx, 2), vz: R(c.vz, 2), sc: p.sc };
        if (p.r === 'h') { o.ty = p.type; o.vr = p.pvar || 0; o.d = p.dead ? 1 : 0; o.lk = p.lock ? 1 : 0; } else { o.w = p.w; o.pi = R(c.pitch, 2); }
        if (p === viewer) { o.ack = p.ack; o.rc = p.rc; o.hp = p.hp; o.am = p.ammo[p.w]; o.mg = PS.WEAPONS[p.w].mag; o.rl = p.rel ? R(Math.max(0, p.rel - this.t), 2) : 0; o.st = p.stun > this.t ? R(p.stun - this.t, 1) : 0; o.tc = R(Math.max(0, p.tauntCd - this.t), 1); }
        pl.push(o);
      });
      try { viewer.ws.send(JSON.stringify(Object.assign({ pl }, base, { alive: list.filter((p) => p.r === 'h' && !p.dead).length }))); } catch (e) { /* ok */ }
    });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { /* connexion fermée */ } }
  broadcast(o) { const s = JSON.stringify(o); this.players.forEach((p) => { try { p.ws.send(s); } catch (e) { /* ok */ } }); }
}
