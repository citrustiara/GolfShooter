import { game, world, fps } from "./state.js";
import { cleanPhrase, generatePhrase, ensureAudio, playSound } from "./utils.js";
import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

export let peer = null;
export let conn = null;

const networkPanel = document.querySelector("#network");
const networkText = document.querySelector("#networkText");
const phraseText = document.querySelector("#phraseText");
const phraseInput = document.querySelector("#phraseInput");

// Linkable functions to avoid circular imports
export const networkLinks = {
  startGolf: null,
  enterFps: null,
  applyGolfState: null,
  applyFpsDuelState: null,
  serializeGolfState: null,
  resetFpsDuelState: null,
  serializeFpsDuelState: null,
  resetNetworkMotion: null,
  applyRemoteFpsState: null,
  spawnGrenade: null,
  createExplosion: null,
  removeRemoteGrenadesNear: null,
  startVictoryLap: null,
  restartTournament: null,
  showLobby: null,
  showMenuScene: null,
  drawLaser: null,
  drawMeleeSwipe: null,
  showDamageTaken: null,
  showKilledBy: null,
  weaponLabel: null,
  showDamageDealt: null
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
  if (conn) conn.close();
  if (peer) peer.destroy();
  conn = null;
  peer = null;
  game.connected = false;
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
  game.room = room;
  showNetwork(`Hosting ${room}. Waiting for guest.`, room);

  try {
    peer = new Peer(room, { debug: 1 });
    peer.on("open", () => { if (menuError) menuError.textContent = ""; });
    peer.on("connection", (connection) => {
      if (conn) {
        connection.close();
        return;
      }
      attachConnection(connection);
      connection.on("open", () => {
        game.connected = true;
        send({ type: "welcome", state: networkLinks.serializeGolfState() });
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
    peer = new Peer(undefined, { debug: 1 });
    peer.on("open", () => {
      attachConnection(peer.connect(room, { reliable: true }));
    });
    peer.on("error", (error) => { if (menuError) menuError.textContent = `Connection broker: ${error.type}`; });
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
  conn.on("data", handleMessage);
  conn.on("close", () => {
    game.connected = false;
    showNetwork("Peer disconnected", game.room);
  });
  conn.on("error", () => showNetwork("Peer connection error", game.room));
}

export function send(message) {
  if (conn && conn.open) conn.send(message);
}

export function handleMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "welcome") {
    networkLinks.applyGolfState(message.state);
    networkLinks.showLobby();
  }

  if (message.type === "startTournament") {
    networkLinks.startGolf(message.courseIds);
  }

  if (message.type === "golfShot") {
    networkLinks.applyGolfState(message.state);
  }

  if (message.type === "golfResolved") {
    networkLinks.applyGolfState(message.state);
  }

  if (message.type === "phaseFps") {
    networkLinks.applyFpsDuelState(message.fpsState);
    networkLinks.enterFps(false, { preserveFpsMatch: true });
  }

  if (message.type === "fpsWeaponChoice") {
    const remoteIdx = 1 - game.localIndex;
    fps.players[remoteIdx].primaryWeapon = message.weapon;
  }

  if (message.type === "fpsState") {
    const remote = fps.players[message.player];
    if (!remote || message.player === game.localIndex) return;
    networkLinks.applyRemoteFpsState(remote, message);
    remote.health = message.health;
    if (message.sliding !== undefined) remote.sliding = message.sliding;
    if (message.weapon !== undefined) remote.weapon = message.weapon;
  }

  if (message.type === "fpsShot") {
    const origin = new THREE.Vector3(message.ox, message.oy, message.oz);
    const direction = new THREE.Vector3(message.dx, message.dy, message.dz);
    if (message.isMelee) {
      playSound("melee");
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
    }
    if (message.target === game.localIndex) {
      const dmg = message.damage !== undefined ? message.damage : 20;
      fps.players[game.localIndex].health = Math.max(0, fps.players[game.localIndex].health - dmg);
      const popOffset = message.headshot ? 1.75 : 1.3;
      networkLinks.showDamageDealt(dmg, fps.players[game.localIndex].pos.clone().add(new THREE.Vector3(0, popOffset, 0)), message.headshot);
      networkLinks.showDamageTaken(dmg);
      if (fps.players[game.localIndex].health <= 0) {
        networkLinks.showKilledBy(message.isMelee ? "Club" : networkLinks.weaponLabel(message.weapon));
        networkLinks.startVictoryLap(1 - game.localIndex, "deathmatch", false);
      }
    }
  }

  if (message.type === "fpsGrenadeThrow") {
    playSound("grenade");
    networkLinks.spawnGrenade(
      new THREE.Vector3(message.x, message.y, message.z),
      new THREE.Vector3(message.vx, message.vy, message.vz),
      false,
      message.owner,
      message
    );
  }

  if (message.type === "fpsGrenadeExplode") {
    networkLinks.createExplosion(new THREE.Vector3(message.x, message.y, message.z), message.radius ? message.radius * 0.5 : undefined);
    networkLinks.removeRemoteGrenadesNear(new THREE.Vector3(message.x, message.y, message.z));
    const localDamage = Array.isArray(message.damages) ? message.damages.find((entry) => entry.target === game.localIndex) : (message.target === game.localIndex ? message : null);
    if (localDamage && localDamage.damage > 0) {
      fps.players[game.localIndex].health = Math.max(0, fps.players[game.localIndex].health - localDamage.damage);
      networkLinks.showDamageDealt(localDamage.damage, fps.players[game.localIndex].pos.clone().add(new THREE.Vector3(0, 1.1, 0)), false);
      networkLinks.showDamageTaken(localDamage.damage);
      if (fps.players[game.localIndex].health <= 0) {
        networkLinks.showKilledBy("Grenade");
        networkLinks.startVictoryLap(message.owner, "deathmatch", false);
      }
    }
  }

  if (message.type === "fpsGrenadeShot") {
    networkLinks.removeRemoteGrenadesNear(new THREE.Vector3(message.x, message.y, message.z));
  }

  if (message.type === "fpsGrenadeSupercharge") {
    const pos = new THREE.Vector3(message.x, message.y, message.z);
    const grenade = world.grenades.find((g) => g.mesh.position.distanceTo(pos) < 1.5);
    if (grenade) {
      grenade.isSupercharged = true;
      grenade.damageMultiplier = 5;
      grenade.radiusMultiplier = 2;
      if (grenade.mesh.material) {
        grenade.mesh.material.color.setHex(0xb84dff);
        if (grenade.mesh.material.emissive) {
          grenade.mesh.material.emissive.setHex(0xb84dff);
          grenade.mesh.material.emissiveIntensity = 1.1;
        }
      }
    }
  }

  if (message.type === "matchResult") {
    networkLinks.applyFpsDuelState(message.fpsState);
    networkLinks.startVictoryLap(message.winner, message.reason, false, Boolean(message.fpsState));
  }

  if (message.type === "restart") {
    networkLinks.restartTournament(false);
  }
}
