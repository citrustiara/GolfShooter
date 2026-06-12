import { game, world, fps } from "./state.js";
import { cleanPhrase, generatePhrase, ensureAudio, playSound } from "./utils.js";
import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export let peer = null;
export let conn = null;
const connections = new Map();

const DEFAULT_ICE_SERVERS = [
  // Free public STUN keeps the game deployable as static files on hosts like
  // Cloudflare Pages; STUN discovers addresses, it does not proxy game traffic.
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.services.mozilla.com" }
];

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStringList(item));
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== trimmed) return normalizeStringList(parsed);
  } catch {}
  return trimmed.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function additionalStunServers() {
  const urls = [];
  try {
    urls.push(...normalizeStringList(globalThis.GOLF_DUEL_STUN_URLS));
    urls.push(...normalizeStringList(localStorage.getItem("golfDuelStunUrls")));
  } catch {}
  return [...new Set(urls)].map((url) => ({ urls: url.startsWith("stun:") || url.startsWith("turn:") ? url : `stun:${url}` }));
}

function normalizeIceServers(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try { return normalizeIceServers(JSON.parse(value)); }
    catch { return null; }
  }
  if (!Array.isArray(value)) return null;
  const servers = value.filter((server) => server && (typeof server.urls === "string" || Array.isArray(server.urls)));
  return servers.length ? servers : null;
}

function peerOptions() {
  let configuredServers = null;
  try {
    configuredServers = normalizeIceServers(globalThis.GOLF_DUEL_ICE_SERVERS)
      || normalizeIceServers(localStorage.getItem("golfDuelIceServers"));
  } catch {}
  return {
    debug: 1,
    config: {
      iceServers: configuredServers || [...additionalStunServers(), ...DEFAULT_ICE_SERVERS],
      iceCandidatePoolSize: 10,
      sdpSemantics: "unified-plan"
    }
  };
}

const networkPanel = document.querySelector("#network");
const networkText = document.querySelector("#networkText");
const phraseText = document.querySelector("#phraseText");
const phraseInput = document.querySelector("#phraseInput");

// Linkable functions to avoid circular imports
export const networkLinks = {
  startGolf: null,
  enterFps: null,
  applyGolfState: null,
  applyGolfHoleScored: null,
  applyGolfForceEnd: null,
  applyFpsDuelState: null,
  serializeGolfState: null,
  resetFpsDuelState: null,
  serializeFpsDuelState: null,
  resetNetworkMotion: null,
  applyRemoteFpsState: null,
  spawnGrenade: null,
  createExplosion: null,
  createSmokeCloud: null,
  removeRemoteGrenadesNear: null,
  startVictoryLap: null,
  restartTournament: null,
  replayFpsMatch: null,
  showLobby: null,
  showMenuScene: null,
  drawLaser: null,
  drawMeleeSwipe: null,
  drawParryEffect: null,
  startParryCooldownForPlayer: null,
  showDamageTaken: null,
  showKilledBy: null,
  weaponLabel: null,
  showDamageDealt: null,
  showHitMarker: null,
  showEliminationNotice: null,
  showBattleLogElimination: null
};

export function initNetworkLinks(links) {
  Object.assign(networkLinks, links);
}

export function showNetwork(text, room) {
  networkText.textContent = text;
  phraseText.textContent = room;
  networkPanel.classList.remove("hidden");
  phraseText.classList.toggle("hidden", !room);
}

export function closePeer() {
  for (const { connection } of connections.values()) connection.close();
  connections.clear();
  if (conn) conn.close();
  if (peer) peer.destroy();
  conn = null;
  peer = null;
  game.connected = false;
  sessionStorage.removeItem("gd_room");
  sessionStorage.removeItem("gd_role");
}

export async function createMatch() {
  const room = cleanPhrase(phraseInput.value) || generatePhrase();
  phraseInput.value = room;
  // menuError set via callback or direct DOM
  const menuError = document.querySelector("#menuError");
  if (menuError) menuError.textContent = "";
  
  closePeer();
  game.role = "host";
  game.localIndex = 0;
  game.playerCount = 1;
  game.room = room;
  showNetwork(`Hosting ${room}. Waiting for players.`, room);

  try {
    peer = new Peer(room, peerOptions());
    peer.on("open", () => { if (menuError) menuError.textContent = ""; });
    peer.on("connection", (connection) => {
      attachConnection(connection);
      connection.on("open", () => {
        game.connected = true;
        const playerIndex = assignHostConnectionIndex(connection);
        game.playerCount = Math.max(game.playerCount, playerIndex + 1);
        sendToConnection(connection, {
          type: "welcome",
          playerIndex,
          playerCount: game.playerCount,
          state: networkLinks.serializeGolfState(),
          fpsState: networkLinks.serializeFpsDuelState?.()
        });
        broadcast({ type: "lobbyState", playerCount: game.playerCount }, connection);
        showNetwork(`Hosting ${room}. ${game.playerCount} players connected.`, room);
        networkLinks.showLobby();
      });
    });
    peer.on("error", (error) => {
      if (menuError) menuError.textContent = (error.type === "unavailable-id" ? "That phrase is already hosting. Pick another." : `Connection broker: ${error.type}`);
    });
  } catch (error) {
    if (menuError) menuError.textContent = "PeerJS could not start in this browser.";
  }
}

export async function joinMatch() {
  const room = cleanPhrase(phraseInput.value);
  const menuError = document.querySelector("#menuError");
  if (!room) {
    if (menuError) menuError.textContent = "Type the host phrase first.";
    return;
  }
  if (menuError) menuError.textContent = "";
  closePeer();
  game.role = "guest";
  game.localIndex = 1;
  game.room = room;
  showNetwork(`Joining ${room}.`, room);

  try {
    peer = new Peer(undefined, peerOptions());
    peer.on("open", () => {
      sessionStorage.setItem("gd_room", room);
      sessionStorage.setItem("gd_role", "guest");
      attachConnection(peer.connect(room, { reliable: true }));
    });
    peer.on("error", (error) => {
      if (menuError) menuError.textContent = error.type === "network"
        ? "Connection broker: websocket failed. Try Incognito, disable VPN/adblock, or use another network."
        : `Connection broker: ${error.type}`;
    });
  } catch (error) {
    if (menuError) menuError.textContent = "PeerJS could not start in this browser.";
  }
}

export function attachConnection(connection) {
  conn = connection;
  conn.on("open", () => {
    game.connected = true;
    showNetwork("P2P connected", game.room);
    if (game.role === "guest") send({ type: "hello" });
  });
  conn.on("data", (message) => handleMessage(message, connection));
  conn.on("close", () => {
    const entry = connections.get(connection.peer);
    if (entry && entry.playerIndex !== undefined) {
      const idx = entry.playerIndex;
      if (fps.players && fps.players[idx]) {
        fps.players[idx].health = 0;
      }
    }
    connections.delete(connection.peer);
    game.connected = connections.size > 0 || Boolean(conn?.open);
    if (game.role === "host") {
      const maxIndex = Math.max(0, ...[...connections.values()].map(e => e.playerIndex));
      game.playerCount = Math.max(1, maxIndex + 1);
      broadcast({ type: "lobbyState", playerCount: game.playerCount });
    }
    showNetwork(game.connected ? `P2P connected (${Math.max(1, game.playerCount)} players)` : "Peer disconnected", game.room);
  });
  conn.on("error", (error) => {
    console.error("Peer data connection error", error);
    showNetwork("Peer connection error. Different networks may require a TURN relay.", game.room);
  });
}

function assignHostConnectionIndex(connection) {
  const existing = connections.get(connection.peer);
  if (existing?.playerIndex !== undefined) return existing.playerIndex;
  const used = new Set([...connections.values()].map((entry) => entry.playerIndex));
  let playerIndex = 1;
  while (used.has(playerIndex)) playerIndex++;
  connections.set(connection.peer, { connection, playerIndex });
  return playerIndex;
}

function sendToConnection(connection, message) {
  if (connection && connection.open) connection.send(message);
}

function broadcast(message, exceptConnection = null) {
  for (const { connection } of connections.values()) {
    if (connection === exceptConnection) continue;
    sendToConnection(connection, message);
  }
}

function survivingFpsPlayerIndexes() {
  return fps.players.map((player, index) => player.health > 0 ? index : -1).filter((index) => index !== -1);
}

function startRoundIfOnlyOneSurvivor() {
  const alive = survivingFpsPlayerIndexes();
  if (alive.length === 1) networkLinks.startVictoryLap(alive[0], "deathmatch", false);
  // Everyone died in the same instant (trade kill / shared explosion): the
  // round must still end or the match soft-locks. -1 marks a tied round.
  else if (alive.length === 0) networkLinks.startVictoryLap(-1, "deathmatch", false);
}

function messagePlayerIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function knownRemotePlayerIsDead(index) {
  return index !== null && index !== game.localIndex && fps.players[index] && fps.players[index].health <= 0;
}

function showKillEventInBattleLog(message) {
  const victim = messagePlayerIndex(message.victim ?? message.target);
  if (victim === null) return;
  networkLinks.showBattleLogElimination?.(victim, {
    killerIndex: messagePlayerIndex(message.killer ?? message.player ?? message.owner),
    weapon: message.weapon || null,
    weaponName: message.weaponName,
    distance: message.distance,
    headshot: Boolean(message.headshot),
    finalKill: Boolean(message.finalKill)
  });
}

function handleParryShotVisuals(message) {
  const parry = message.parry;
  if (!parry) return;
  const values = [parry.x, parry.y, parry.z, parry.inDx, parry.inDy, parry.inDz, parry.outDx, parry.outDy, parry.outDz].map(Number);
  if (!values.every(Number.isFinite)) return;
  const impact = new THREE.Vector3(values[0], values[1], values[2]);
  const incoming = new THREE.Vector3(values[3], values[4], values[5]);
  const outgoing = new THREE.Vector3(values[6], values[7], values[8]);
  networkLinks.drawParryEffect?.(impact, incoming, outgoing, parry.weapon || "melee", parry.parrier === game.localIndex);
  networkLinks.drawLaser?.(impact, outgoing, parry.outLength || 32, Boolean(parry.outHit), true, "parry");
  networkLinks.startParryCooldownForPlayer?.(parry.parrier, parry.weapon || "melee", parry.cooldown);
  playSound("parry", { position: impact, volume: parry.parrier === game.localIndex ? 1 : 0.88, minDistance: 1.5, maxDistance: 65 });
}

function applyLocalParryCredit(message) {
  const parry = message.parry;
  if (!parry || parry.parrier !== game.localIndex || !Array.isArray(message.damages)) return;
  for (const entry of message.damages) {
    if (!entry?.parried || entry.target === game.localIndex) continue;
    const target = fps.players[entry.target];
    if (!target || target.health <= 0 || entry.damage <= 0) continue;
    const wasAlive = target.health > 0;
    target.health = Math.max(0, target.health - entry.damage);
    const popPos = target.pos.clone().add(new THREE.Vector3(0, entry.headshot ? 1.85 : 1.1, 0));
    networkLinks.showDamageDealt?.(entry.damage, popPos, Boolean(entry.headshot));
    networkLinks.showHitMarker?.(Boolean(entry.headshot));
    if (wasAlive && target.health <= 0) {
      networkLinks.showEliminationNotice?.(entry.target, { weaponName: entry.weaponName || `Parried ${networkLinks.weaponLabel?.(message.weapon) || "Shot"}`, distance: entry.distance, headshot: Boolean(entry.headshot) });
      startRoundIfOnlyOneSurvivor();
    }
  }
}

function shouldRelay(message) {
  return [
    "startTournament",
    "golfHoleScored",
    "golfShot",
    "golfResolved",
    "golfForceEnd",
    "phaseFps",
    "fpsWeaponChoice",
    "fpsState",
    "fpsFootstep",
    "fpsShot",
    "fpsGrappleHit",
    "fpsGrenadeThrow",
    "fpsGrenadeExplode",
    "fpsGrenadeShot",
    "fpsGrenadeSupercharge",
    "fpsSmokeDeploy",
    "fpsKillEvent",
    "matchResult",
    "restart"
  ].includes(message.type);
}

export function send(message) {
  if (game.role === "host") {
    broadcast(message);
    return;
  }
  if (conn && conn.open) conn.send(message);
}

export function handleMessage(message, sourceConnection = null) {
  if (!message || typeof message !== "object") return;

  if (game.role === "host" && sourceConnection && shouldRelay(message)) {
    broadcast(message, sourceConnection);
  }

  if (message.type === "welcome") {
    game.localIndex = message.playerIndex ?? game.localIndex;
    game.playerCount = Math.max(2, message.playerCount || game.playerCount);
    if (message.fpsState) networkLinks.applyFpsDuelState(message.fpsState);
    networkLinks.applyGolfState(message.state);
    showNetwork(`P2P connected as P${game.localIndex + 1}`, game.room);
    networkLinks.showLobby();
  }

  if (message.type === "lobbyState") {
    game.playerCount = message.playerCount || game.playerCount;
    showNetwork(`P2P connected as P${game.localIndex + 1}. ${game.playerCount} players in lobby.`, game.room);
    networkLinks.showLobby();
  }

  if (message.type === "startTournament") {
    if (message.playerCount) game.playerCount = message.playerCount;
    networkLinks.startGolf(message.courseIds);
  }

  if (message.type === "golfHoleScored") {
    networkLinks.applyGolfHoleScored(message);
  }

  if (message.type === "golfShot") {
    networkLinks.applyGolfState(message.state);
  }

  if (message.type === "golfResolved") {
    networkLinks.applyGolfState(message.state);
  }

  if (message.type === "golfForceEnd") {
    networkLinks.applyGolfForceEnd?.(message);
  }

  if (message.type === "phaseFps") {
    networkLinks.applyFpsDuelState(message.fpsState);
    networkLinks.enterFps(false, {
      preserveFpsMatch: true,
      randomTournament: game.randomTournament,
      randomWeapon: game.randomWeapon,
      randomLoadout: game.randomLoadout
    });
  }

  if (message.type === "fpsKillEvent") {
    const victim = messagePlayerIndex(message.victim);
    const killer = messagePlayerIndex(message.killer);
    if (victim !== null) {
      if (victim !== game.localIndex && fps.players[victim]) fps.players[victim].health = 0;
      if (killer !== game.localIndex) showKillEventInBattleLog(message);
      if (game.phase === "fps") startRoundIfOnlyOneSurvivor();
    }
  }

  if (message.type === "fpsWeaponChoice") {
    const remoteIdx = Number.isInteger(message.player) ? message.player : 1 - game.localIndex;
    if (remoteIdx === game.localIndex) return;
    fps.players[remoteIdx].primaryWeapon = message.weapon;
  }

  if (message.type === "fpsState") {
    const remote = fps.players[message.player];
    if (!remote || message.player === game.localIndex) return;
    networkLinks.applyRemoteFpsState(remote, message);
    const wasAlive = remote.health > 0;
    const incomingHealth = Number(message.health);
    if (Number.isFinite(incomingHealth)) {
      // Once a player is dead in this round, do not let an older in-flight
      // health packet resurrect the invisible ragdoll as an active shooter.
      if (!(game.phase === "fps" && remote.health <= 0 && incomingHealth > 0)) {
        remote.health = incomingHealth;
      }
    }
    if (wasAlive && remote.health <= 0) {
      // Do not show the center elimination popup here. Only the killer gets
      // that; everyone else gets fpsKillEvent in the side battle log.
      if (game.phase === "fps") startRoundIfOnlyOneSurvivor();
    }
    if (message.sliding !== undefined) remote.sliding = message.sliding;
    if (message.weapon !== undefined) remote.weapon = message.weapon;
    if (message.primaryWeapon !== undefined) remote.primaryWeapon = message.primaryWeapon;
    if (message.aiming !== undefined) remote.aiming = Boolean(message.aiming);
    if (message.parryCooldown !== undefined) remote.parryCooldown = Math.max(remote.parryCooldown || 0, Number(message.parryCooldown) || 0);
  }

  if (message.type === "fpsFootstep") {
    if (message.player === game.localIndex || (game.phase !== "fps" && game.phase !== "fpsVictoryLap")) return;
    const pos = new THREE.Vector3(message.x, message.y, message.z);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
    const volume = Math.max(0.04, Math.min(0.32, Number(message.volume) || 0.16));
    playSound("footstep", { position: pos, volume, minDistance: 2.0, maxDistance: 42 });
  }

  if (message.type === "fpsShot") {
    const shooterIndex = messagePlayerIndex(message.player);
    if (knownRemotePlayerIsDead(shooterIndex)) return;
    const origin = new THREE.Vector3(message.ox, message.oy, message.oz);
    const direction = new THREE.Vector3(message.dx, message.dy, message.dz);
    if (message.isMelee) {
      playSound(message.weapon === "katana" ? "katana" : "melee");
      networkLinks.drawMeleeSwipe(origin, direction);
    } else {
      playSound(message.weapon || "pistol");
      if (Array.isArray(message.pellets)) {
        for (const pellet of message.pellets) {
          networkLinks.drawLaser(origin, new THREE.Vector3(pellet.dx, pellet.dy, pellet.dz), pellet.length, pellet.hit, true, message.weapon);
        }
      } else {
        networkLinks.drawLaser(origin, direction, message.length, message.hit, true, message.weapon);
      }
      handleParryShotVisuals(message);
      applyLocalParryCredit(message);
    }
    const localDamageEntries = Array.isArray(message.damages) ? message.damages.filter((entry) => entry.target === game.localIndex) : [];
    const localDamage = localDamageEntries.length ? localDamageEntries.reduce((merged, entry) => ({
      ...merged,
      damage: (merged.damage || 0) + (Number(entry.damage) || 0),
      headshot: Boolean(merged.headshot || entry.headshot),
      distance: Math.min(merged.distance ?? Infinity, entry.distance ?? Infinity),
      parried: Boolean(merged.parried || entry.parried),
      parrier: entry.parried ? entry.parrier : merged.parrier,
      weaponName: entry.parried ? entry.weaponName : merged.weaponName
    }), { target: game.localIndex, damage: 0, distance: Infinity }) : (message.target === game.localIndex ? message : null);
    if (localDamage && localDamage.distance === Infinity) localDamage.distance = message.distance;
    if (localDamage) {
      const dmg = localDamage.damage !== undefined ? localDamage.damage : 20;
      const me = fps.players[game.localIndex];
      const wasAlive = me.health > 0;
      if (!wasAlive) return;
      me.health = Math.max(0, me.health - dmg);
      networkLinks.showDamageTaken(dmg);
      if (wasAlive && me.health <= 0) {
        const killedBy = localDamage.parried
          ? (localDamage.weaponName || `Parried ${networkLinks.weaponLabel(message.weapon)}`)
          : (message.isMelee ? (message.weapon && message.weapon !== "melee" ? networkLinks.weaponLabel(message.weapon) : "Club") : networkLinks.weaponLabel(message.weapon));
        networkLinks.showKilledBy(killedBy, {
          headshot: Boolean(localDamage.headshot ?? message.headshot),
          distance: localDamage.distance ?? message.distance,
          killerIndex: localDamage.parried ? (localDamage.parrier ?? message.parry?.parrier) : message.player
        });
        startRoundIfOnlyOneSurvivor();
      }
    }
  }

  if (message.type === "fpsGrappleHit") {
    const attackerIndex = messagePlayerIndex(message.player);
    const targetIndex = messagePlayerIndex(message.target);
    if (knownRemotePlayerIsDead(attackerIndex)) return;
    if (message.target === game.localIndex) {
      const dmg = message.damage !== undefined ? message.damage : 50;
      const me = fps.players[game.localIndex];
      const wasAlive = me.health > 0;
      if (!wasAlive) return;
      me.health = Math.max(0, me.health - dmg);
      networkLinks.showDamageTaken(dmg);
      if (wasAlive && me.health <= 0) {
        networkLinks.showKilledBy(networkLinks.weaponLabel("grapple"), { headshot: false, distance: 0, killerIndex: message.player });
        startRoundIfOnlyOneSurvivor();
      }
    } else if (message.killed && targetIndex !== null) {
      if (fps.players[targetIndex]) fps.players[targetIndex].health = 0;
      if (attackerIndex !== game.localIndex) showKillEventInBattleLog({ ...message, victim: targetIndex, killer: attackerIndex, weaponName: networkLinks.weaponLabel?.("grapple") || "Grapple Hook" });
      if (game.phase === "fps") startRoundIfOnlyOneSurvivor();
    }
  }

  if (message.type === "fpsGrenadeThrow") {
    if (knownRemotePlayerIsDead(messagePlayerIndex(message.owner))) return;
    playSound(message.kind === "smoke" ? "smoke" : (message.kind === "bouncer" ? "bouncerShot" : (message.kind === "rocket" ? "rocket" : "grenade")));
    networkLinks.spawnGrenade(
      new THREE.Vector3(message.x, message.y, message.z),
      new THREE.Vector3(message.vx, message.vy, message.vz),
      false,
      message.owner,
      message
    );
  }

  if (message.type === "fpsSmokeDeploy") {
    playSound("smoke");
    networkLinks.removeRemoteGrenadesNear(new THREE.Vector3(message.x, message.y, message.z));
    networkLinks.createSmokeCloud?.(new THREE.Vector3(message.x, message.y, message.z), message.radius, message.duration, message.id || null);
  }

  if (message.type === "fpsGrenadeExplode") {
    networkLinks.createExplosion(new THREE.Vector3(message.x, message.y, message.z), message.radius ? message.radius * 0.5 : undefined);
    networkLinks.removeRemoteGrenadesNear(new THREE.Vector3(message.x, message.y, message.z));
    const localDamage = Array.isArray(message.damages) ? message.damages.find((entry) => entry.target === game.localIndex) : (message.target === game.localIndex ? message : null);
    if (localDamage && localDamage.damage > 0) {
      const me = fps.players[game.localIndex];
      const wasAlive = me.health > 0;
      if (!wasAlive) return;
      me.health = Math.max(0, me.health - localDamage.damage);
      networkLinks.showDamageTaken(localDamage.damage);
      if (wasAlive && me.health <= 0) {
        const weaponName = localDamage.weaponName || message.weaponName || (message.weapon ? networkLinks.weaponLabel(message.weapon) : "Grenade");
        networkLinks.showKilledBy(weaponName, { distance: localDamage.distance, headshot: false, killerIndex: message.owner });
        startRoundIfOnlyOneSurvivor();
      }
    }
  }

  if (message.type === "fpsGrenadeShot") {
    networkLinks.removeRemoteGrenadesNear(new THREE.Vector3(message.x, message.y, message.z));
  }

  if (message.type === "fpsGrenadeSupercharge") {
    const pos = new THREE.Vector3(message.x, message.y, message.z);
    const grenade = world.grenades.find((g) => g.mesh.position.distanceTo(pos) < 1.5 && g.kind !== "smoke");
    if (grenade) {
      grenade.isSupercharged = true;
      grenade.damageMultiplier = 2;
      grenade.radiusMultiplier = 2;
      grenade.mesh.traverse((child) => {
        if (child.material?.color) child.material.color.setHex(0xb84dff);
        if (child.material?.emissive) {
          child.material.emissive.setHex(0xb84dff);
          child.material.emissiveIntensity = 1.1;
        }
      });
    }
  }

  if (message.type === "matchResult") {
    networkLinks.applyFpsDuelState(message.fpsState);
    networkLinks.startVictoryLap(message.winner, message.reason, false, Boolean(message.fpsState));
  }

  if (message.type === "postMatchAction" && game.role === "host") {
    const requestedBy = Number.isInteger(message.player) ? message.player : -1;
    const winner = game.fpsMatchWinner ?? game.result?.matchWinner ?? game.result?.winner;
    if (Number.isInteger(winner) && winner !== -1 && requestedBy !== -1 && requestedBy !== winner) return;
    if (message.action === "replayFps") networkLinks.replayFpsMatch?.(true);
    else if (message.action === "lobby") networkLinks.restartTournament?.(true);
  }

  if (message.type === "restart") {
    networkLinks.restartTournament(false);
  }
}
