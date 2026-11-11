/* =====================================================================
   voice3d.js — Chat vocal de proximité (WebRTC, Three.js r128)
   ---------------------------------------------------------------------
   On s'entend entre joueurs de la MÊME salle, plus ou moins fort selon la distance (comme dans la vraie vie) :
   proche on s'entend bien, loin plus du tout. Pas de serveur audio : chaque navigateur parle directement aux
   autres (WebRTC, un lien par paire), la salle de poignée de main vient de F.createRealtime (f3d-core.js), sur
   un canal à part (room.topic + '-voice') pour ne jamais se mélanger avec les messages de jeu des salles.
   Qui est là : on se cale sur world.remote (déjà tenu à jour par la position des joueurs, world3d.js) —
   pas besoin de notre propre présence : un joueur apparaît/disparaît de la liste des voisins en même temps
   que son avatar.
   Deux touches, personnalisables (téléphone › Réglages › Touches, comme ZQSD) :
     micMuted  : on coupe SON PROPRE micro (les autres ne nous entendent plus)
     deafened  : on coupe TOUT CE QU'ON REÇOIT (plus personne ne s'entend, pratique pour une pause)
   Le réglage du volume (f3d_voice_vol) suit le même principe que la musique/les bruitages (audio3d.js).
   Fichiers liés : f3d-core.js (F.createRealtime, F.me), world3d.js (cycle de vie, world.remote, les touches),
   hud3d.js (widget en bas à gauche du HUD, carte Réglages).
   ===================================================================== */
(function () {
  'use strict';

  var F = window.F3D;
  if (!F) return;

  var SUPPORTED = !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }];
  var MIN_DIST = 3, MAX_DIST = 15;                         // volume plein jusqu'à 3 m, plus rien au-delà de 15 m

  var KEY = 'f3d_voice_vol';
  function load(k, d) { try { var v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* stockage bloqué */ } }

  var V = F.voice = {
    vol: load(KEY, 0.8),
    micMuted: false, deafened: false, micBlocked: false, micAttempted: false
  };

  function ctx() { try { return typeof getAudioCtx === 'function' ? getAudioCtx() : null; } catch (e) { return null; } }
  function master() { try { return typeof getMasterVolume === 'function' ? getMasterVolume() : 0.5; } catch (e) { return 0.5; } }

  var localStream = null;                                   // notre micro (gardé d'une salle à l'autre : on ne le redemande qu'une fois)
  var masterGain = null;                                     // tout ce qu'on reçoit passe par là (déjà casque)
  var rt = null, roomTopic = '';                              // canal de signalisation de la salle actuelle
  var peers = {};                                             // k (pseudo) -> { pc, gain, source, pendingIce, polite }
  var hudEls = null;                                          // boutons et texte du widget (world3d.js nous donne le conteneur)
  var world = null;

  /* ---------- micro local : demandé une seule fois par visite (en cas de refus, on ne réinsiste pas tout seul) ---------- */
  function ensureMic() {
    if (!SUPPORTED || localStream || V.micAttempted) return;
    V.micAttempted = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (s) {
      localStream = s; V.micBlocked = false;
      s.getAudioTracks().forEach(function (t) { t.enabled = !V.micMuted; });
      // le micro arrive après coup : on l'ajoute aux liaisons déjà en cours (sinon elles étaient en écoute seule)
      Object.keys(peers).forEach(function (k) { addLocalTrack(peers[k]); });
    }, function () { V.micBlocked = true; syncHud(); });
  }
  function addLocalTrack(p) {
    if (!localStream || p.hasTrack) return;
    p.hasTrack = true;
    localStream.getAudioTracks().forEach(function (t) { try { p.pc.addTrack(t, localStream); } catch (e) { /* déjà ajouté */ } });
  }

  /* ---------- sortie : chaque voisin a son volume (distance), tous passent ensuite par le même robinet (casque) ---------- */
  function ensureMasterGain() {
    var c = ctx(); if (!c) return null;
    if (masterGain && masterGain.ctx === c) return masterGain;
    masterGain = c.createGain(); masterGain.ctx = c; masterGain.gain.value = 0.0001; masterGain.connect(c.destination);
    return masterGain;
  }
  function applyMasterGain() {
    var c = ctx(), g = ensureMasterGain(); if (!c || !g) return;
    var v = V.deafened ? 0 : V.vol * master();
    g.gain.setTargetAtTime(Math.max(0.0001, v), c.currentTime, 0.12);
  }

  /* ---------- une liaison avec un voisin ---------- */
  function closePeer(k) {
    var p = peers[k]; if (!p) return;
    delete peers[k];
    try { p.pc.close(); } catch (e) { /* ok */ }
    try { if (p.source) p.source.disconnect(); } catch (e) { /* ok */ }
    try { if (p.gain) p.gain.disconnect(); } catch (e) { /* ok */ }
    try { if (p.el) p.el.srcObject = null; } catch (e) { /* ok */ }
  }
  function closeAllPeers() { Object.keys(peers).forEach(closePeer); }

  function makePeer(k) {
    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    var p = peers[k] = { pc: pc, gain: null, source: null, hasTrack: false, pendingIce: [], gainVal: 0, t0: performance.now(), el: null };
    if (localStream) addLocalTrack(p); else { try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { /* navigateur ancien : tant pis, sans micro */ } }
    pc.onicecandidate = function (e) {
      if (e.candidate && rt) rt.send('v-ice', { to: k, from: F.me(), candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } });
    };
    pc.ontrack = function (e) {
      var c = ctx(), mg = ensureMasterGain(); if (!c || !mg) return;
      try { if (p.source) p.source.disconnect(); } catch (er) { /* ok */ }
      var stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      // Chrome/Edge : un flux WebRTC distant reste muet dans Web Audio tant qu'il n'est pas aussi branché sur un élément audio (muet : le son sort par Web Audio)
      try { if (!p.el) p.el = new Audio(); p.el.srcObject = stream; p.el.muted = true; var pl = p.el.play(); if (pl && pl.catch) pl.catch(function () { /* ok */ }); } catch (er2) { /* ok */ }
      p.source = c.createMediaStreamSource(stream);
      p.gain = c.createGain(); p.gain.gain.value = 0;
      p.source.connect(p.gain); p.gain.connect(mg);
    };
    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') closePeer(k);   // on retentera : update() le recréera tant qu'il est dans world.remote
    };
    return p;
  }
  function flushIce(p) {
    if (!p.pendingIce.length || !p.pc.remoteDescription) return;
    p.pendingIce.forEach(function (c) { p.pc.addIceCandidate(c).catch(function () { /* candidat trop tard : sans conséquence */ }); });
    p.pendingIce.length = 0;
  }

  /* ---------- signalisation : offre/réponse/candidats, adressés (« to ») — tout le monde les reçoit, seul le destinataire les garde ---------- */
  function onVoiceMsg(ev, m) {
    var me = F.me();
    if (!m || m.to !== me || !m.from || m.from === me) return;
    var k = m.from;
    if (ev === 'v-offer') {
      if (peers[k]) closePeer(k);                              // nouvelle offre = l'autre repart de zéro : on aussi
      var p = makePeer(k);
      p.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp }).then(function () {
        flushIce(p);
        return p.pc.createAnswer();
      }).then(function (ans) { return p.pc.setLocalDescription(ans); }).then(function () {
        if (rt) rt.send('v-answer', { to: k, from: me, sdp: p.pc.localDescription.sdp });
      }).catch(function () { closePeer(k); });
    } else if (ev === 'v-answer') {
      var p2 = peers[k]; if (!p2) return;
      p2.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).then(function () { flushIce(p2); }).catch(function () { closePeer(k); });
    } else if (ev === 'v-ice') {
      var p3 = peers[k]; if (!p3 || !m.candidate) return;
      var cand = new RTCIceCandidate(m.candidate);
      if (p3.pc.remoteDescription) p3.pc.addIceCandidate(cand).catch(function () { /* ok */ }); else p3.pendingIce.push(cand);
    }
  }

  /* ---------- qui parle à qui : celui dont le pseudo vient avant (ordre alphabétique) propose, l'autre répond — jamais les deux à la fois ---------- */
  function connectTo(k) {
    var me = F.me(), p = makePeer(k);
    if (me < k) {
      p.pc.createOffer().then(function (o) { return p.pc.setLocalDescription(o); }).then(function () {
        if (rt) rt.send('v-offer', { to: k, from: me, sdp: p.pc.localDescription.sdp });
      }).catch(function () { closePeer(k); });
    }
    // sinon : on attend son offre (reçue dans onVoiceMsg) — la liaison est déjà prête (recvonly ou avec notre micro) pour y répondre
  }

  /* ---------- cycle de vie : une salle = un canal de signalisation, remis à zéro à chaque changement ---------- */
  V.enterRoom = function (w) {
    world = w;
    if (!SUPPORTED) { syncHud(); return; }
    var room = w.room, topic = room && room.topic ? room.topic + '-voice' : '';
    if (rt && roomTopic === topic) { syncHud(); return; }
    V.leaveRoom();
    ensureMic();
    if (!topic) { syncHud(); return; }
    roomTopic = topic;
    rt = F.createRealtime(topic, onVoiceMsg);
    syncHud();
  };
  V.leaveRoom = function () {
    closeAllPeers();
    if (rt) { var old = rt; rt = null; roomTopic = ''; setTimeout(function () { old.close(); }, 150); }
    syncHud();
  };
  V.shutdown = function () {                                  // on quitte le monde 3D entièrement : on rend le micro
    V.leaveRoom();
    if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
    V.micAttempted = false;
    hudEls = null; world = null;
  };

  /* ---------- chaque image : qui est à portée (world.remote, déjà tenu à jour par world3d.js) et à quel volume ---------- */
  function myPos(w) {
    var room = w.room, seated = w.mode === 'seat' && room && room.seatPos ? room.seatPos() : null;
    return seated ? { x: seated.x, z: seated.z } : { x: w.player.x, z: w.player.z };
  }
  V.update = function (w) {
    if (!SUPPORTED || !rt || !rt.ready) return;
    var k, remote = w.remote, me = myPos(w);
    for (k in remote) if (!peers[k]) connectTo(k);             // nouveau voisin : on se connecte (un seul des deux lance l'offre)
    for (k in peers) if (!remote[k]) closePeer(k);             // il est parti (même règle que son avatar : world.remote l'a déjà retiré)
    var c = ctx(), now = performance.now();
    for (k in peers) {                                         // liaison qui n'aboutit pas (offre perdue, l'autre pas encore sur le canal, réseau) : on la refait à zéro
      var ist = peers[k].pc.iceConnectionState;
      if (ist !== 'connected' && ist !== 'completed' && now - peers[k].t0 > 9000) closePeer(k);
    }
    for (k in peers) {
      var p = peers[k]; if (!p.gain) continue;
      var r = remote[k], pos = r.person && r.person.group ? r.person.group.position : { x: r.tx, z: r.tz };
      var d = Math.hypot(me.x - pos.x, me.z - pos.z);
      var g = d <= MIN_DIST ? 1 : d >= MAX_DIST ? 0 : 1 - (d - MIN_DIST) / (MAX_DIST - MIN_DIST);
      if (c && Math.abs(g - p.gainVal) > 0.004) { p.gainVal = g; p.gain.gain.setTargetAtTime(g, c.currentTime, 0.2); }
    }
    applyMasterGain();
  };

  /* ---------- muet / casque : personnalisables (téléphone › Réglages › Touches, voir world3d.js) ---------- */
  V.setMicMuted = function (on) {
    V.micMuted = !!on;
    if (localStream) localStream.getAudioTracks().forEach(function (t) { t.enabled = !V.micMuted; });
    else if (!V.micMuted) ensureMic();                          // on démute sans avoir encore de micro : on le demande maintenant
    syncHud();
  };
  V.setDeafened = function (on) { V.deafened = !!on; applyMasterGain(); syncHud(); };
  V.toggleMic = function () { V.setMicMuted(!V.micMuted); };
  V.toggleDeafen = function () { V.setDeafened(!V.deafened); };
  V.setVolume = function (v) { V.vol = Math.max(0, Math.min(1, v)); save(KEY, V.vol); applyMasterGain(); };
  // une touche du jeu vient d'être pressée : si c'est l'une des deux touches du chat vocal, on la traite et on dit « c'est pris »
  V.handleKey = function (ev) {
    if (!SUPPORTED) return false;
    var cfg = F.keys ? F.keys() : {};
    if (ev.code === cfg.mic) { V.toggleMic(); return true; }
    if (ev.code === cfg.deafen) { V.toggleDeafen(); return true; }
    return false;
  };
  V.peerCount = function () { return Object.keys(peers).length; };
  // pour vérifier que ça marche vraiment (pas seulement « connecté ») : l'état WebRTC de chaque voisin
  V.debugPeers = function () {
    var out = {};
    for (var k in peers) { var p = peers[k]; out[k] = { ice: p.pc.iceConnectionState, conn: p.pc.connectionState, hasTrack: p.hasTrack, hasRemoteAudio: !!p.source, gain: Math.round(p.gainVal * 100) / 100 }; }
    return out;
  };

  /* ---------- le widget en bas à gauche du HUD (world3d.js nous donne juste le conteneur) ---------- */
  V.mountHud = function (container) {
    if (!container) return;
    if (!SUPPORTED) { container.style.display = 'none'; return; }
    container.innerHTML =
      '<div class="s3d-voice-row">' +
      '<button class="s3d-voice-btn" data-sv="mic" title="Couper le micro"><i class="fa-solid fa-microphone"></i><kbd></kbd></button>' +
      '<button class="s3d-voice-btn" data-sv="deaf" title="Couper le son des autres"><i class="fa-solid fa-headphones"></i><kbd></kbd></button>' +
      '</div><div class="s3d-voice-status"></div>';
    var micBtn = container.querySelector('[data-sv="mic"]'), deafBtn = container.querySelector('[data-sv="deaf"]'), status = container.querySelector('.s3d-voice-status');
    micBtn.addEventListener('click', function () { V.toggleMic(); });
    deafBtn.addEventListener('click', function () { V.toggleDeafen(); });
    hudEls = { root: container, mic: micBtn, deaf: deafBtn, status: status };
    syncHud();
  };
  function syncHud() {
    if (!hudEls) return;
    var cfg = F.keys ? F.keys() : {};
    hudEls.mic.querySelector('kbd').textContent = F.keyLabel ? F.keyLabel(cfg.mic) : '';
    hudEls.deaf.querySelector('kbd').textContent = F.keyLabel ? F.keyLabel(cfg.deafen) : '';
    hudEls.mic.classList.toggle('off', V.micMuted);
    hudEls.mic.classList.toggle('blocked', V.micBlocked && !V.micMuted);
    hudEls.mic.querySelector('i').className = 'fa-solid ' + (V.micBlocked ? 'fa-microphone-slash' : V.micMuted ? 'fa-microphone-slash' : 'fa-microphone');
    hudEls.mic.title = V.micBlocked ? 'Micro refusé par le navigateur' : V.micMuted ? 'Activer le micro' : 'Couper le micro';
    hudEls.deaf.classList.toggle('off', V.deafened);
    hudEls.deaf.querySelector('i').className = 'fa-solid ' + (V.deafened ? 'fa-volume-xmark' : 'fa-headphones');
    hudEls.deaf.title = V.deafened ? 'Réactiver le son des autres' : 'Couper le son des autres';
    var n = V.peerCount();
    hudEls.status.textContent = V.micBlocked ? '🎙️ Micro bloqué' : n > 0 ? n + (n > 1 ? ' voisins' : ' voisin') + ' à portée' : 'Chat vocal de proximité';
  };
  V.syncHud = syncHud;
  V.supported = function () { return SUPPORTED; };
})();
