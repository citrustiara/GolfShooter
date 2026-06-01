import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { 
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y, 
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV, 
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, HOLES_PER_TOURNAMENT, 
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, FPS_KILLS_TO_WIN_MAP, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons,
  tournamentCombinations
} from "./core/constants.js";
import { canvas, renderer, scene, camera, clock, raycaster, materials, setupLighting, resize, lights } from "./core/engine.js";
import { game, input, world, fps } from "./core/state.js";
import { ensureAudio, playSound, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards } from "./core/utils.js";
import { closePeer, createMatch, joinMatch, send, initNetworkLinks } from "./core/network.js";
import { holes, resetTournamentState, resetGolfHole, setupGolfObjects, ensureGolfBalls, applyTournamentHoleIds, drawTournamentHoleIds } from "./golf/logic.js";
import { setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints } from "./fps/logic.js";
import { fpsArenaThemes } from "./fps/themes.js";
import { loadGameContent } from "./content/loader.js";
import { rampLocalPoint, rampSurfaceInfo, rampSurfaceY, rampUphillDirection, rampWorldPoint } from "./core/ramps.js";

const overlay = document.querySelector("#overlay"), menu = document.querySelector("#menu"), lobby = document.querySelector("#lobby"), resultPanel = document.querySelector("#result"), hud = document.querySelector("#hud"), phraseInput = document.querySelector("#phraseInput"), menuError = document.querySelector("#menuError"), holeLabel = document.querySelector("#holeLabel"), turnLabel = document.querySelector("#turnLabel"), strokeLabel = document.querySelector("#strokeLabel"), holeText = document.querySelector("#holeText"), turnText = document.querySelector("#turnText"), strokeText = document.querySelector("#strokeText"), healthChip = document.querySelector("#healthChip"), healthText = document.querySelector("#healthText"), abilityContainer = document.querySelector("#abilityContainer"), jumpOverlay = document.querySelector("#jumpOverlay"), healOverlay = document.querySelector("#healOverlay"), radarOverlay = document.querySelector("#radarOverlay"), jumpCDText = document.querySelector("#jumpCDText"), healCDText = document.querySelector("#healCDText"), radarCDText = document.querySelector("#radarCDText"), jetpackOverlay = document.querySelector("#jetpackOverlay"), jetpackCDText = document.querySelector("#jetpackCDText"), power = document.querySelector("#power"), powerFill = document.querySelector("#powerFill"), shotArrow = document.querySelector("#shotArrow"), damageLayer = document.querySelector("#damageLayer"), countdown = document.querySelector("#countdown"), settingsBtn = document.querySelector("#settingsBtn"), settingsPanel = document.querySelector("#settingsPanel"), sensitivityInput = document.querySelector("#sensitivityInput"), sensitivityValue = document.querySelector("#sensitivityValue"), menuSensitivityInput = document.querySelector("#menuSensitivityInput"), menuSensitivityValue = document.querySelector("#menuSensitivityValue"), weaponChip = document.querySelector("#weaponChip"), weaponText = document.querySelector("#weaponText"), resultTitle = document.querySelector("#resultTitle"), resultBody = document.querySelector("#resultBody"), ammoChip = document.querySelector("#ammoChip"), ammoText = document.querySelector("#ammoText"), weaponSelectOverlay = document.querySelector("#weaponSelectOverlay"), weaponSelectTimer = document.querySelector("#weaponSelectTimer"), weaponCards = document.querySelectorAll(".weapon-card"), hitMarker = document.querySelector("#hitMarker"), damageVignette = document.querySelector("#damageVignette"), grenadeOverlay = document.querySelector("#grenadeOverlay"), grenadeCDText = document.querySelector("#grenadeCDText"), killNotice = document.querySelector("#killNotice"), radarMarker = document.querySelector("#radarMarker"), lobbyStatus = document.querySelector("#lobbyStatus"), startGolfBtn = document.querySelector("#startGolfBtn"), startFpsBtn = document.querySelector("#startFpsBtn"), startRandomFpsBtn = document.querySelector("#startRandomFpsBtn"), mapJsonInput = document.querySelector("#mapJsonInput"), loadMapBtn = document.querySelector("#loadMapBtn"), saveMapBtn = document.querySelector("#saveMapBtn"), assetUrlInput = document.querySelector("#assetUrlInput"), loadAssetBtn = document.querySelector("#loadAssetBtn"), leaveBtn = document.querySelector("#leaveBtn"), createBtn = document.querySelector("#createBtn"), joinBtn = document.querySelector("#joinBtn"), soloBtn = document.querySelector("#soloBtn"), randomBtn = document.querySelector("#randomBtn"), restartBtn = document.querySelector("#restartBtn");
const fovInput = document.querySelector("#fovInput"), fovValue = document.querySelector("#fovValue"), ingameLeaveBtn = document.querySelector("#ingameLeaveBtn"), practiceMapOptions = document.querySelector("#practiceMapOptions"), golfMapSelect = document.querySelector("#golfMapSelect"), fpsMapSelect = document.querySelector("#fpsMapSelect"), playerCountSelect = document.querySelector("#playerCountSelect"), mapUploadInput = document.querySelector("#mapUploadInput");
const FPS_PLAYER_RADIUS_WORLD = 0.42;
const FPS_PLAYER_HEIGHT_WORLD = 1.78;
const FPS_RAMP_PROBE_MARGIN = 0.08;
const FPS_RAMP_LAND_EPSILON = 0.10;
const FPS_RAMP_STEP_UP = 0.46;
const FPS_RAMP_STEP_DOWN = 0.72;
const FPS_RAMP_SOLID_TOP_CLEARANCE = 0.06;
const activeDamagePops = []; let lastFrame = performance.now(), hitMarkerTimeout = null;
let weaponIds = Object.keys(weaponCatalog);
let standardWeaponIds = ["pistol", "rifle", "sniper"];
let randomLoadoutPresets = [];

function weaponConfig(id = game.primaryWeapon) { return weaponCatalog[id] || weaponCatalog.pistol; }
function weaponMaxAmmo(id = game.primaryWeapon) { return weaponConfig(id).ammo; }
function weaponLabelText(id = game.primaryWeapon) { return id === "melee" ? "Club" : weaponConfig(id).label; }
function freshAmmoState() { return Object.fromEntries(weaponIds.map((id) => [id, weaponMaxAmmo(id)])); }
function chooseRandomTournamentWeapon() { return randomTournamentWeapons[Math.floor(Math.random() * randomTournamentWeapons.length)] || "heavySniper"; }
function isRandomMeleeWeapon(id = game.randomWeapon) { return id === "melee"; }
function defaultLoadout() { return { id: "standard", hp: 100, speed: 1.0, abilities: ["jump", "heal", "grenade", "radar"], cooldowns: {} }; }
function chooseRandomLoadout() { const presets = randomLoadoutPresets.length ? randomLoadoutPresets : [defaultLoadout()]; return presets[Math.floor(Math.random() * presets.length)] || presets[0]; }
function chooseRandomFpsMap(exclude = -1) { const choices = fpsArenaThemes.map((_, index) => index).filter((index) => index !== exclude); return choices[Math.floor(Math.random() * choices.length)] ?? 0; }
function currentMapConfig() {
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0];
  return theme ? (theme.config || theme.loadout || null) : null;
}
function getAbilityKey(abilityName) {
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0];
  if (theme) {
    if (theme.config?.abilityKeys?.[abilityName]) return theme.config.abilityKeys[abilityName];
    if (theme.abilityKeys?.[abilityName]) return theme.abilityKeys[abilityName];
  }
  const loadout = activeLoadout();
  if (loadout) {
    if (loadout.config?.abilityKeys?.[abilityName]) return loadout.config.abilityKeys[abilityName];
    if (loadout.abilityKeys?.[abilityName]) return loadout.abilityKeys[abilityName];
  }
  const defaults = {
    jump: "KeyE",
    heal: "KeyQ",
    grenade: "KeyG",
    radar: "KeyC",
    jetpack: "Space"
  };
  return defaults[abilityName] || "KeyE";
}
function activeWeaponIds() {
  const mapCfg = currentMapConfig();
  if (mapCfg && mapCfg.weapons && mapCfg.weapons.length > 0) {
    return mapCfg.weapons;
  }
  return standardWeaponIds;
}
function activeLoadout() {
  const mapCfg = currentMapConfig();
  if (mapCfg) {
    return {
      id: mapCfg.id || "map-custom",
      hp: mapCfg.hp ?? 100,
      speed: mapCfg.speed ?? 1.0,
      abilities: mapCfg.abilities || ["jump", "heal", "grenade", "radar"],
      cooldowns: mapCfg.cooldowns || {},
      weapons: mapCfg.weapons || ["pistol"],
      abilityKeys: mapCfg.abilityKeys || {}
    };
  }
  return game.randomTournament && game.randomLoadout ? game.randomLoadout : (randomLoadoutPresets[randomLoadoutPresets.length - 1] || defaultLoadout());
}
function abilityAllowed(name) { return activeLoadout().abilities.includes(name); }
function abilityCooldown(name, fallback) { return activeLoadout().cooldowns?.[name] ?? fallback; }
function jumpAbilityStrength() { return 22.5; }
function aimingSensitivityMultiplier() { const cfg = weaponConfig(); const aimFov = cfg.aimFov || FPS_AIM_FOV; return FPS_AIM_SENSITIVITY_MULTIPLIER * Math.sqrt(Math.max(0.08, aimFov / FPS_DEFAULT_FOV)); }
function clearVictoryBanner() { document.getElementById("victoryBanner")?.remove(); }
function activeGolfPlayerIndex() { return game.role === "solo" ? game.currentPlayer : game.localIndex; }
function golfBallForPlayer(index = activeGolfPlayerIndex()) { return world.golfBalls[index] || world.golfBalls[0]; }
function useGolfBall(index = activeGolfPlayerIndex()) {
  const ball = golfBallForPlayer(index);
  if (ball) {
    world.ball = ball.mesh;
    world.ballVel = ball.vel;
    game.ballMoving = ball.moving;
    game.golfFalling = ball.falling;
    game.currentPlayer = index;
    game.lastShotPosition = ball.lastShot;
  }
  return ball;
}
function aliveFpsPlayerIndexes() { return fps.players.map((p, i) => p.health > 0 ? i : -1).filter(i => i !== -1); }
function opposingFpsPlayers() { return fps.players.map((p, i) => ({ player: p, index: i })).filter(({ index, player }) => index !== game.localIndex && player.health > 0); }
function formatScores(values) { return values.map((score, index) => `P${index + 1} ${score}`).join(" - "); }
function ensureFpsPlayers(count = game.playerCount) {
  const targetCount = Math.max(2, Math.floor(count || 2));
  game.playerCount = targetCount;
  while (fps.players.length < targetCount) {
    fps.players.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), yaw: 0, pitch: 0, health: 100, grounded: false, groundSurface: null, primaryWeapon: "pistol" });
  }
  if (fps.players.length > targetCount) fps.players.length = targetCount;
  for (const prop of ["fpsMapWins", "fpsKillWins"]) {
    while (game[prop].length < targetCount) game[prop].push(0);
    if (game[prop].length > targetCount) game[prop].length = targetCount;
  }
}
function syncPlayerCountFromUi() {
  const value = Number(playerCountSelect?.value || game.playerCount || 2);
  game.playerCount = Math.max(2, Math.min(8, Math.floor(value || 2)));
}
function getSpawnY(spawn, theme) {
  if (!spawn) return 1.0;
  if (spawn.y !== undefined) return spawn.y;
  let bestY = 1.0;
  if (!theme) return bestY;
  const spawnX = Number(spawn.x || 0);
  const spawnZ = Number(spawn.z || 0);
  const pointInBoxFootprint = (item, margin = 0.42) => {
    const rot = Number(item.rot ?? item.rotY ?? 0);
    const dx = spawnX - Number(item.x || 0);
    const dz = spawnZ - Number(item.z || 0);
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    return Math.abs(localX) <= Number(item.sx || 0) / 2 + margin &&
      Math.abs(localZ) <= Number(item.sz || 0) / 2 + margin;
  };
  const considerBoxTop = (item) => {
    if (!item || !pointInBoxFootprint(item)) return;
    const topY = Number(item.y || 0) + Number(item.sy || 0);
    if (topY > bestY) bestY = topY;
  };
  const floors = theme.floors || [];
  for (const floor of floors) {
    if (floor.type === "circle") {
      if (Math.hypot(spawnX - floor.x, spawnZ - floor.z) <= (floor.r || 0) + 0.42) {
        const y = Number(floor.y || 0);
        if (y > bestY) bestY = y;
      }
    } else {
      const halfX = Number(floor.sx || 1) / 2 + 0.42;
      const halfZ = Number(floor.sz || 1) / 2 + 0.42;
      if (Math.abs(spawnX - floor.x) <= halfX && Math.abs(spawnZ - floor.z) <= halfZ) {
        const y = Number(floor.y || 0);
        if (y > bestY) bestY = y;
      }
    }
  }
  const boxes = theme.boxes || [];
  for (const box of boxes) {
    if (box.collidable !== false && (box.isPlatform !== false || box.platformOnly)) considerBoxTop(box);
  }
  for (const platform of theme.platforms || []) {
    if (platform.collidable !== false) considerBoxTop(platform);
  }
  const ramps = theme.ramps || [];
  for (const ramp of ramps) {
    const y = rampSurfaceY(ramp, { x: spawnX, z: spawnZ }, 0.42);
    if (y !== null && y > bestY) {
      bestY = y;
    }
  }
  return bestY + 0.05;
}

async function populateMapSelects() {
  if (golfMapSelect.options.length > 1) return;
  try {
    const res = await fetch("maps/manifest.json");
    const manifest = await res.json();
    manifest.golfMaps?.forEach((path, i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = path.split("/").pop().replace(".json", "");
      golfMapSelect.appendChild(opt);
    });
    manifest.fpsMaps?.forEach((path, i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = path.split("/").pop().replace(".json", "");
      fpsMapSelect.appendChild(opt);
    });
  } catch (e) {
    console.error("Failed to load map manifest", e);
  }
}

function showMenuScene() {
  world.golfRoot.visible = true; world.arenaRoot.visible = false; camera.position.set(-28, 12, 28); camera.lookAt(0, 0, 0); camera.fov = 62; camera.updateProjectionMatrix();
}

function rebuildWeaponMesh(weaponId, targetGroup) {
  if (!targetGroup) return;
  while (targetGroup.children.length > 0) {
    targetGroup.remove(targetGroup.children[0]);
  }
  const cfg = weaponCatalog[weaponId];
  if (!cfg) return;

  const parts = cfg.parts || [];
  parts.forEach(part => {
    let geom;
    const sx = part.sx ?? 0.1;
    const sy = part.sy ?? 0.1;
    const sz = part.sz ?? 0.1;
    if (part.type === "cylinder") {
      geom = new THREE.CylinderGeometry(sx, sz, sy, 16);
    } else if (part.type === "sphere") {
      geom = new THREE.SphereGeometry(sx, 16, 16);
    } else {
      geom = new THREE.BoxGeometry(sx, sy, sz);
    }

    const color = part.color ?? 0x1b1f24;
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.45,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(part.x ?? 0, part.y ?? 0, part.z ?? 0);
    mesh.rotation.set(part.rotX ?? 0, part.rotY ?? 0, part.rotZ ?? 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    targetGroup.add(mesh);
  });

  const tip = new THREE.Group();
  const muzzle = cfg.muzzle || { x: 0, y: 0.08, z: -1.0 };
  tip.position.set(muzzle.x, muzzle.y, muzzle.z);
  targetGroup.add(tip);
  
  if (targetGroup === world.weapon) {
    world.weaponTip = tip;
  }
}

function buildRadarDeviceMesh(targetGroup) {
  if (!targetGroup) return;
  while (targetGroup.children.length > 0) {
    targetGroup.remove(targetGroup.children[0]);
  }
  const bodyGeom = new THREE.BoxGeometry(0.24, 0.16, 0.04);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.6 });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  targetGroup.add(bodyMesh);

  const screenGeom = new THREE.BoxGeometry(0.2, 0.12, 0.01);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  const screenMesh = new THREE.Mesh(screenGeom, screenMat);
  screenMesh.position.set(0, 0.005, 0.02);
  targetGroup.add(screenMesh);

  const gripGeom = new THREE.BoxGeometry(0.03, 0.16, 0.05);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x5ab0ff, roughness: 0.6 });
  const leftGrip = new THREE.Mesh(gripGeom, gripMat);
  leftGrip.position.set(-0.135, 0, 0);
  targetGroup.add(leftGrip);
  const rightGrip = leftGrip.clone();
  rightGrip.position.set(0.135, 0, 0);
  targetGroup.add(rightGrip);

  const antGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8);
  const antMat = new THREE.MeshStandardMaterial({ color: 0xff6f61, metalness: 0.8 });
  const antenna = new THREE.Mesh(antGeom, antMat);
  antenna.position.set(0.08, 0.1, 0);
  antenna.rotation.x = Math.PI / 2;
  targetGroup.add(antenna);
}

function setupWeapon() {
  world.weapon = new THREE.Group();
  scene.add(world.weapon);
  world.weapon.visible = false;

  world.meleeWeapon = new THREE.Group();
  scene.add(world.meleeWeapon);
  world.meleeWeapon.visible = false;

  world.radarDevice = new THREE.Group();
  scene.add(world.radarDevice);
  world.radarDevice.visible = false;
  buildRadarDeviceMesh(world.radarDevice);
}

function beginLocalMatch(room) { game.role = "solo"; game.room = room; game.localIndex = 0; showLobby(); }
function showMenu() { clearVictoryBanner(); game.phase = "menu"; menu.classList.remove("hidden"); lobby.classList.add("hidden"); resultPanel.classList.add("hidden"); hud.classList.add("hidden"); document.querySelector("#network").classList.add("hidden"); weaponSelectOverlay.classList.add("hidden"); overlay.classList.remove("fps"); document.exitPointerLock?.(); showMenuScene(); }
function showLobby() { clearVictoryBanner(); game.phase = "lobby"; lobby.classList.remove("hidden"); menu.classList.add("hidden"); resultPanel.classList.add("hidden"); hud.classList.add("hidden"); weaponSelectOverlay.classList.add("hidden"); overlay.classList.remove("fps"); showMenuScene(); if (game.role === "guest") { startGolfBtn.classList.add("hidden"); startFpsBtn.classList.add("hidden"); startRandomFpsBtn?.classList.add("hidden"); lobbyStatus.textContent = "Waiting for host to start..."; practiceMapOptions?.classList.add("hidden"); } else { startGolfBtn.classList.remove("hidden"); startFpsBtn.classList.remove("hidden"); startRandomFpsBtn?.classList.remove("hidden"); lobbyStatus.textContent = game.role === "solo" ? "Solo practice. Choose a mode." : `Peer connected! You are the host. Players: ${game.playerCount}`; if (game.role === "solo" && practiceMapOptions) { practiceMapOptions.classList.remove("hidden"); startGolfBtn.textContent = "Play Selected Golf Map"; startFpsBtn.textContent = "Play Selected FPS Map"; startRandomFpsBtn.textContent = "Random Loadout Duel"; populateMapSelects(); } else { practiceMapOptions?.classList.add("hidden"); startGolfBtn.textContent = "Start Tournament"; startFpsBtn.textContent = "Start FPS Match"; startRandomFpsBtn.textContent = "Random FPS Duel"; } } }
function startGolf(courseIds = null) { clearVictoryBanner(); ensureGolfBalls(game.playerCount); resetTournamentState(courseIds); game.phase = "golf"; menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); overlay.classList.remove("fps"); world.golfRoot.visible = true; world.arenaRoot.visible = false; power.classList.remove("hidden"); resetGolfHole(); useGolfBall(activeGolfPlayerIndex()); updateHud(); }
function applyGolfAtmosphere(hole) {
  if (!hole) return;
  const sky = hole.skyColor ?? 0x8fd3f4;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 28, 86);
  if (lights.hemi) lights.hemi.intensity = 0.9 * (hole.lightIntensity ?? 1.4);
  if (lights.sun) {
    lights.sun.intensity = 1.35 * (hole.lightIntensity ?? 1.4);
    lights.sun.position.set(hole.lightIntensity < 0.8 ? -9 : 10, hole.lightIntensity < 0.8 ? 12 : 18, hole.lightIntensity < 1.3 ? 16 : 7);
  }
}
function enterFps(isSimulation = false, options = {}) {
  clearVictoryBanner(); ensureFpsPlayers(game.playerCount);
  game.phase = "fps"; overlay.classList.add("fps"); menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); weaponSelectOverlay.classList.add("hidden"); weaponSelectOverlay.hidden = true; weaponSelectOverlay.style.display = "none"; resultPanel.classList.add("hidden"); resultPanel.classList.remove("fps-result"); world.golfRoot.visible = false; world.arenaRoot.visible = true; world.weapon.visible = true; world.meleeWeapon.visible = true;
  power.classList.add("hidden"); shotArrow.classList.add("hidden"); game.dragging = false;
  if (!options.preserveFpsMatch) { game.fpsMapIndex = 0; game.fpsMapWins = Array(game.playerCount).fill(0); }
  game.randomTournament = Boolean(options.randomTournament ?? game.randomTournament);
  game.fpsMode = game.randomTournament ? "randomTournament" : "standard";
  if (options.randomWeapon) game.randomWeapon = options.randomWeapon;
  if (options.randomLoadout) game.randomLoadout = options.randomLoadout;
  const loadout = activeLoadout();
  game.maxHealth = loadout.hp;
  if (!options.preserveFpsMatch) {
    game.fpsKillWins = Array(game.playerCount).fill(0);
    game.fpsMatchOver = false;
  }
  game.fpsRoundWinner = null; game.countdown = options.staticMock ? 0 : FPS_COUNTDOWN_DURATION; game.weaponSelectTimer = 0;
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], spawns = getArenaSpawnPoints(theme);
  const randomMelee = game.randomTournament && isRandomMeleeWeapon();
  const startingWeapon = game.randomTournament && !randomMelee ? game.randomWeapon : 
                         (loadout.weapons && loadout.weapons.length ? loadout.weapons[0] : "pistol");
  const startAsMelee = startingWeapon === "melee";
  fps.players.forEach((p, i) => { const spawn = spawns[i] || spawns[i % Math.max(1, spawns.length)] || { x: i === 0 ? -42 : 42, z: 0 }; p.pos.set(spawn.x, getSpawnY(spawn, theme), spawn.z); p.vel.set(0, 0, 0); p.yaw = i === 0 ? 0 : Math.PI; p.pitch = 0; p.health = game.maxHealth; p.maxHealth = game.maxHealth; p.grounded = false; p.sliding = false; p.weapon = startAsMelee ? "melee" : "gun"; p.primaryWeapon = startingWeapon; p.targetPos = p.pos.clone(); p.targetYaw = p.yaw; p.targetPitch = p.pitch; });
  game.ammo = freshAmmoState(); game.reloading = false; game.reloadTimer = 0; game.reloadWeapon = null; game.activeWeapon = startAsMelee ? "melee" : "gun"; game.primaryWeapon = startingWeapon; game.meleeSwingTimer = 0; game.weaponSwapTimer = 0; game.jumpCooldown = 0; game.healCooldown = 0; game.grenadeCooldown = 0; game.radarCooldown = 0; game.radarTimer = 0; game.slideTimer = 0; game.slideCooldown = 0; game.visualRecoil = 0;
  if (game.role === "solo") game.localIndex = 0;
  setupArena(); fps.players.forEach((p) => clampArenaPosition(p.pos, 0.5)); applyWeaponState("gun", game.primaryWeapon); syncPrimaryWeaponModel(); updateHud();
}

function updateGolf(dt) {
  ensureGolfBalls(game.playerCount);
  const localBall = useGolfBall(activeGolfPlayerIndex());
  input.pointerLocked = false;
  applyGolfAtmosphere(holes[game.holeIndex]);
  // Handle hole transition delay
  if (game.holeTransitionTimer > 0) {
    game.holeTransitionTimer -= dt;
    // Animate ball sinking into the cup
    for (const ball of world.golfBalls) {
      if (game.holeScores[world.golfBalls.indexOf(ball)]?.[game.holeIndex] !== null && ball.mesh.position.y > 0.08) {
        ball.mesh.position.y -= dt * 0.35;
      }
    }
    if (game.holeTransitionTimer <= 0) {
      game.holeTransitionTimer = 0;
      if (game.role !== "guest") {
        advanceAfterScore();
      }
    }
    updateGolfCamera(dt);
    return;
  }
  const anyMoving = world.golfBalls.some((ball, index) => game.holeScores[index]?.[game.holeIndex] === null && ball.moving);
  if (anyMoving) {
    for (let i = 0; i < world.golfBalls.length; i++) {
      if (game.holeScores[i]?.[game.holeIndex] !== null || !world.golfBalls[i].moving) continue;
      useGolfBall(i);
      resolveGolfBall(dt);
    }
    useGolfBall(activeGolfPlayerIndex());
  }
  if (canControlGolf()) {
    power.classList.remove("hidden");
    if (input.keys.has("ArrowLeft") || input.keys.has("ArrowRight")) {
      if (input.keys.has("ArrowLeft")) game.aimAngle -= GOLF_AIM_SENSITIVITY * 150 * dt;
      if (input.keys.has("ArrowRight")) game.aimAngle += GOLF_AIM_SENSITIVITY * 150 * dt;
      game.golfShotDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle));
    }
    if (input.keys.has("Space")) {
      game.aimPower += dt * 0.8 * input.golfChargeDir;
      if (game.aimPower >= 1) { game.aimPower = 1; input.golfChargeDir = -1; }
      if (game.aimPower <= 0) { game.aimPower = 0; input.golfChargeDir = 1; }
      powerFill.style.width = `${game.aimPower * 100}%`;
    }
  }
  if (localBall) useGolfBall(activeGolfPlayerIndex());
  updateGolfCamera(dt);
  updateShotArrow();
}
function canControlGolf() {
  const index = activeGolfPlayerIndex();
  const ball = golfBallForPlayer(index);
  return Boolean(ball) && !ball.moving && game.holeScores[index]?.[game.holeIndex] === null && (game.role === "solo" || index === game.localIndex);
}
function updateGolfCamera(dt) {
  const hole = holes[game.holeIndex];
  if (!hole) return;
  const desiredDir = game.golfShotDir.clone().multiplyScalar(-1);
  if (desiredDir.lengthSq() < 0.01) desiredDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle));
  const targetCamPos = world.ball.position.clone().add(desiredDir.multiplyScalar(13)).add(new THREE.Vector3(0, game.ballMoving ? 7.2 : 6.2, 0));
  camera.position.lerp(targetCamPos, Math.min(1, dt * (game.ballMoving ? 6.5 : 4.0)));
  camera.lookAt(world.ball.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
}
function updateShotArrow() {
  const showAim = game.dragging && canControlGolf() && game.aimPower > 0.01;
  shotArrow.classList.add("hidden");
  if (!world.golfAimArrow) return;
  world.golfAimArrow.visible = showAim;
  if (!showAim) return;
  const arrow = world.golfAimArrow;
  const shaft = arrow.userData.shaft, head = arrow.userData.head, material = arrow.userData.material;
  const length = 1.3 + game.aimPower * 5.8;
  const color = new THREE.Color(0x7ee2a8).lerp(new THREE.Color(0xffd166), Math.min(1, game.aimPower * 1.4)).lerp(new THREE.Color(0xff4a5f), Math.max(0, game.aimPower - 0.65) / 0.35);
  material.color.copy(color);
  arrow.position.copy(world.ball.position).add(new THREE.Vector3(0, 0.14, 0));
  arrow.rotation.set(0, -Math.atan2(game.golfShotDir.z, game.golfShotDir.x), 0);
  shaft.scale.set(1, length, 1);
  shaft.position.x = length * 0.5;
  head.position.x = length + 0.18;
}
function simulateShot(direction, power, local = false) { const playerIndex = activeGolfPlayerIndex(); const ball = useGolfBall(playerIndex); if (!ball || ball.moving || power <= 0.04 || game.holeScores[playerIndex]?.[game.holeIndex] !== null) return; const dir = direction.clone().setY(0); if (dir.lengthSq() <= 0.0001) return; dir.normalize(); ball.lastShot.copy(ball.mesh.position); ball.lastShot.y = golfBallSurfaceY(); ball.falling = false; ball.moving = true; game.ballMoving = true; ball.mesh.position.y = golfBallSurfaceY(); game.strokesThisHole[playerIndex]++; playSound("golfHit"); ball.vel.copy(dir.multiplyScalar(power * GOLF_MAX_SHOT_SPEED)); if (world.golfAimArrow) world.golfAimArrow.visible = false; shotArrow.classList.add("hidden"); if (local && game.role !== "solo") send({ type: "golfShot", state: serializeGolfState() }); updateHud(); }
function isBallOnGolfSurface(hole) {
  if (golfRampAt(world.ball.position)) return true;
  return (hole?.surfaces || []).some((surface) => {
    if (surface.type === "circle") return flatDistance(world.ball.position, surface) <= surface.r + 0.4;
    const rot = -(surface.rot || 0);
    const local = world.ball.position.clone().sub(new THREE.Vector3(surface.x, 0, surface.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return Math.abs(local.x) <= surface.sx / 2 + 0.4 && Math.abs(local.z) <= surface.sz / 2 + 0.4;
  });
}
function resetGolfAfterFall(hole) {
  const ball = golfBallForPlayer(game.currentPlayer);
  if (!ball) return;
  ball.moving = false;
  ball.falling = false;
  game.ballMoving = false;
  game.golfFalling = false;
  game.strokesThisHole[game.currentPlayer]++;
  ball.mesh.position.copy(ball.lastShot.lengthSq() > 0 ? ball.lastShot : hole.start);
  ball.mesh.position.y = golfBallSurfaceY();
  ball.vel.set(0, 0, 0);
  game.aimPower = 0;
  powerFill.style.width = "0%";
  if (world.golfAimArrow) world.golfAimArrow.visible = false;
  updateHud();
  if (game.role !== "solo") send({ type: "golfResolved", state: serializeGolfState() });
}
function resolveGolfBall(dt) {
  const hole = holes[game.holeIndex];
  const ball = golfBallForPlayer(game.currentPlayer);
  if (world.ball.position.y < (hole?.deathZoneY ?? -5)) { resetGolfAfterFall(hole); return; }
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  const wasOnIce = isBallOnIce();
  world.ballVel.y = 0; // Constrain to X-Z plane
  world.ball.position.addScaledVector(world.ballVel, dt);
  world.ball.position.y = golfBallSurfaceY();
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  const ramp = golfRampAt(world.ball.position);
  if (ramp) {
    const downhill = rampUphillDirection(ramp.ramp).multiplyScalar(-1);
    const slope = ramp.ramp.height / Math.max(0.001, ramp.ramp.length);
    world.ballVel.addScaledVector(downhill, 18 * slope * dt);
    world.ball.position.y = ramp.y + 0.34;
  }
  world.ballVel.multiplyScalar(Math.pow(wasOnIce ? GOLF_ICE_FRICTION : GOLF_GROUND_FRICTION, dt * 60));
  if (!isBallOnGolfSurface(hole)) {
    resetGolfAfterFall(hole);
    return;
  } else if (game.golfFalling) {
    game.golfFalling = false;
    world.ball.position.y = golfBallSurfaceY();
  }
  for (const mound of world.mounds) {
    const d = flatDistance(world.ball.position, mound);
    if (d < mound.radius + 0.34) {
      const push = world.ball.position.clone().sub(new THREE.Vector3(mound.x, 0, mound.z)).setY(0).normalize();
      const overlap = (mound.radius + 0.34) - d;
      world.ball.position.addScaledVector(push, overlap);
      if (world.ballVel.dot(push) < 0) {
        world.ballVel.reflect(push).multiplyScalar(0.8);
        world.ballVel.y = 0; // Constrain to X-Z plane
      }
    }
  }
  for (const b of world.bumpers) resolveGolfBumperCollision(b);
  const distToCup = flatDistance(world.ball.position, world.cup.position);
  const ballSpeed = world.ballVel.length();
  // Wide gentle pull zone — attracts the ball toward the cup
  if (distToCup < 0.9 && ballSpeed < 8.0) {
    const pullNormal = world.cup.position.clone().sub(world.ball.position).setY(0).normalize();
    // Stronger pull the closer the ball is
    const pullStrength = (1.0 - distToCup / 0.9) * 2.0;
    world.ballVel.addScaledVector(pullNormal, pullStrength * dt * 60);
  }
  // Inner cup zone — strong pull + damping to capture the ball
  if (distToCup < CUP_PULL_RADIUS) {
    const pullNormal = world.cup.position.clone().sub(world.ball.position).setY(0).normalize();
    world.ballVel.addScaledVector(pullNormal, CUP_PULL_FORCE * dt * 60);
    world.ballVel.multiplyScalar(Math.pow(0.82, dt * 60));
  }
  // Sink into hole — requires ball to be slow enough (max entry speed)
  if ((distToCup < CUP_SINK_RADIUS && ballSpeed < CUP_SINK_SPEED_MAX) || distToCup < 0.12) {
    scoreHole();
    return;
  }
  if (ballSpeed < 0.08) { world.ballVel.set(0, 0, 0); game.ballMoving = false; if (ball) ball.moving = false; world.ball.position.y = golfBallSurfaceY(); }
}
function isBallOnIce() {
  return world.icePatches.some((ice) => {
    if (ice.type === "circle") return flatDistance(world.ball.position, ice) <= ice.r + 0.34;
    const rot = -(ice.rot || 0);
    const local = world.ball.position.clone().sub(new THREE.Vector3(ice.x, 0, ice.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return Math.abs(local.x) <= ice.sx / 2 + 0.34 && Math.abs(local.z) <= ice.sz / 2 + 0.34;
  });
}
function resolveGolfBumperCollision(b) {
  const radius = 0.34;
  const rot = -(b.rot || 0);
  const local = world.ball.position.clone().sub(new THREE.Vector3(b.x, 0, b.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  const clampedX = Math.max(-b.sx / 2, Math.min(b.sx / 2, local.x));
  const clampedZ = Math.max(-b.sz / 2, Math.min(b.sz / 2, local.z));
  const dx = local.x - clampedX;
  const dz = local.z - clampedZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > radius * radius) return;
  let normalLocal;
  if (distSq > 0.0001) {
    normalLocal = new THREE.Vector3(dx, 0, dz).normalize();
  } else {
    const pushX = b.sx / 2 - Math.abs(local.x);
    const pushZ = b.sz / 2 - Math.abs(local.z);
    normalLocal = pushX < pushZ ? new THREE.Vector3(Math.sign(local.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(local.z) || 1);
  }
  const normal = normalLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rot || 0).normalize();
  const overlap = radius - Math.sqrt(Math.max(0.0001, distSq));
  world.ball.position.addScaledVector(normal, overlap + 0.015);
  world.ball.position.y = 0.53;
  if (world.ballVel.dot(normal) < 0) {
    world.ballVel.reflect(normal).multiplyScalar(0.82);
    world.ballVel.y = 0; // Constrain to X-Z plane
  }
}
function scoreHole() {
  const playerIndex = game.currentPlayer;
  const ball = golfBallForPlayer(playerIndex);
  if (!ball) return;
  game.ballMoving = false;
  ball.moving = false;
  ball.vel.set(0, 0, 0);
  playSound("golfScore");
  // Snap ball to cup center
  ball.mesh.position.x = world.cup.position.x;
  ball.mesh.position.z = world.cup.position.z;
  ball.mesh.position.y = 0.38; // Start sinking animation from surface level
  game.holeScores[playerIndex][game.holeIndex] = game.strokesThisHole[playerIndex];
  // Start a 2-second delay before advancing
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) game.holeTransitionTimer = 2.0;
  else if (game.role === "solo") {
    const nextPlayer = game.holeScores.findIndex((scores) => scores[game.holeIndex] === null);
    if (nextPlayer !== -1) useGolfBall(nextPlayer);
  }
  updateHud();

  if (game.role !== "solo") {
    send({
      type: "golfHoleScored",
      currentPlayer: playerIndex,
      strokes: game.strokesThisHole[playerIndex],
      state: serializeGolfState()
    });
  }
}
function applyGolfHoleScored(message) {
  if (message.state) applyGolfState(message.state);
  game.holeScores[message.currentPlayer][game.holeIndex] = message.strokes;
  playSound("golfScore");
  const ball = golfBallForPlayer(message.currentPlayer);
  if (ball) {
    ball.mesh.position.x = world.cup.position.x;
    ball.mesh.position.z = world.cup.position.z;
    ball.mesh.position.y = 0.38; // Start sinking
    ball.moving = false;
    ball.vel.set(0, 0, 0);
  }
  game.ballMoving = world.golfBalls.some((b) => b.moving);
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) game.holeTransitionTimer = 2.0;
  updateHud();
}
function advanceAfterScore() {
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) nextHole();
}
function nextHole() {
  game.holeIndex++;
  if (game.holeIndex >= holes.length) {
    let winner = 0;
    if (game.role !== "solo") {
      const totals = totalStrokes();
      const best = Math.min(...totals);
      const winners = totals.map((score, index) => score === best ? index : -1).filter((index) => index !== -1);
      winner = winners.length === 1 ? winners[0] : -1;
    }
    if (winner === -1 && game.role !== "solo") {
      if (game.role === "host") {
        resetFpsDuelState(true);
        send({ type: "phaseFps", fpsState: serializeFpsDuelState() });
        enterFps(false, { preserveFpsMatch: true, randomTournament: true, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout });
      }
    } else {
      finishMatch(winner, "golf");
    }
  } else {
    game.currentPlayer = activeGolfPlayerIndex();
    game.strokesThisHole = Array(game.playerCount).fill(0);
    resetGolfHole();
    if (game.role !== "solo") send({ type: "golfResolved", state: serializeGolfState() });
  }
}
function totalStrokes() { return game.holeScores.map(ps => ps.reduce((a, b) => (a || 0) + (b || 0), 0)); }
function serializeGolfState() {
  return {
    playerCount: game.playerCount,
    currentPlayer: game.currentPlayer,
    holeIndex: game.holeIndex,
    holeScores: game.holeScores,
    strokesThisHole: game.strokesThisHole,
    balls: world.golfBalls.map((ball) => ({ x: ball.mesh.position.x, y: ball.mesh.position.y, z: ball.mesh.position.z, vx: ball.vel.x, vz: ball.vel.z, moving: ball.moving, falling: ball.falling, lastX: ball.lastShot.x, lastZ: ball.lastShot.z })),
    ballPos: { x: world.ball.position.x, z: world.ball.position.z },
    ballVel: { x: world.ballVel.x, z: world.ballVel.z },
    token: game.golfResolveToken
  };
}
function applyGolfState(s) {
  if (!s) return;
  const holeChanged = s.holeIndex !== game.holeIndex;
  game.playerCount = Math.max(2, s.playerCount || s.holeScores?.length || game.playerCount);
  ensureGolfBalls(game.playerCount);
  game.currentPlayer = s.currentPlayer ?? activeGolfPlayerIndex();
  game.holeIndex = s.holeIndex;
  game.holeScores = s.holeScores || game.holeScores;
  game.strokesThisHole = s.strokesThisHole || game.strokesThisHole;
  if (holeChanged) resetGolfHole();
  const ballStates = Array.isArray(s.balls) ? s.balls : [{ ...s.ballPos, vx: s.ballVel?.x || 0, vz: s.ballVel?.z || 0, moving: Boolean(s.ballVel?.x || s.ballVel?.z) }];
  ballStates.forEach((state, index) => {
    const ball = world.golfBalls[index];
    if (!ball || !state) return;
    ball.mesh.position.set(state.x ?? 0, state.y ?? 0.53, state.z ?? 0);
    ball.vel.set(state.vx || 0, 0, state.vz || 0);
    ball.moving = Boolean(state.moving || ball.vel.lengthSq() > 0);
    ball.falling = Boolean(state.falling);
    ball.lastShot.set(state.lastX ?? ball.mesh.position.x, 0.53, state.lastZ ?? ball.mesh.position.z);
  });
  useGolfBall(activeGolfPlayerIndex());
  game.ballMoving = world.golfBalls.some((ball) => ball.moving);
  updateHud();
}

function updateFps(dt, now) {
  if (game.countdown > 0) { game.countdown -= dt; countdown.textContent = Math.ceil(game.countdown); countdown.classList.remove("hidden"); if (game.countdown <= 0) countdown.classList.add("hidden"); }
  if (game.connected) {
    for (let remoteIdx = 0; remoteIdx < fps.players.length; remoteIdx++) {
      if (remoteIdx === game.localIndex) continue;
      const remote = fps.players[remoteIdx];
      if (remote && remote.targetPos) {
        if (remote.pos.distanceTo(remote.targetPos) > 4.5) {
          remote.pos.copy(remote.targetPos);
        } else {
          remote.pos.lerp(remote.targetPos, Math.min(1, dt * 18.0));
        }
        let diffYaw = remote.targetYaw - remote.yaw;
        diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
        remote.yaw += diffYaw * Math.min(1, dt * 18.0);
        remote.pitch += (remote.targetPitch - remote.pitch) * Math.min(1, dt * 18.0);
      }
    }
  }
  weaponSelectOverlay.classList.add("hidden");
  const isWinner = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner);
  if (isWinner && game.countdown <= 0) {
    if (game.radarTimer > 0) input.aiming = false;
    updateFpsCamera(dt);
    updateFpsMovement(dt);
  }
  updateWeaponSwap(dt);
  const bar = document.getElementById("reloadBar");
  const progress = document.getElementById("reloadProgress");
  if (game.reloading) {
    game.reloadTimer -= dt;
    const reloadingWeapon = game.reloadWeapon || game.primaryWeapon;
    const total = weaponConfig(reloadingWeapon).reload || 1;
    const pct = Math.max(0, Math.min(100, ((total - game.reloadTimer) / total) * 100));
    if (bar && progress) {
      progress.classList.remove("hidden");
      bar.style.width = `${pct}%`;
      bar.style.background = "#5ab0ff";
      bar.style.boxShadow = "0 0 8px rgba(90, 176, 255, 0.9)";
    }
    if (game.reloadTimer <= 0) {
      game.reloading = false;
      game.reloadTimer = 0;
      game.ammo[reloadingWeapon] = weaponMaxAmmo(reloadingWeapon);
      game.reloadWeapon = null;
      if (progress) progress.classList.add("hidden");
      updateHud();
    }
  } else if (game.radarTimer > 0) {
    const pct = Math.max(0, Math.min(100, (game.radarTimer / RADAR_DURATION) * 100));
    if (bar && progress) {
      progress.classList.remove("hidden");
      bar.style.width = `${pct}%`;
      bar.style.background = "#00ffcc";
      bar.style.boxShadow = "0 0 8px rgba(0, 255, 204, 0.9)";
    }
  } else {
    if (progress) progress.classList.add("hidden");
  }
  if (game.inspectTimer > 0) game.inspectTimer -= dt; if (game.meleeSwingTimer > 0) game.meleeSwingTimer -= dt; if (game.jumpCooldown > 0) game.jumpCooldown -= dt; if (game.healCooldown > 0) game.healCooldown -= dt; if (game.grenadeCooldown > 0) game.grenadeCooldown -= dt; if (game.radarCooldown > 0) game.radarCooldown -= dt; if (game.slideTimer > 0) game.slideTimer -= dt; if (game.slideCooldown > 0) game.slideCooldown -= dt;
  if (game.radarTimer > 0) {
    game.radarTimer -= dt;
    if (game.radarTimer <= 0) {
      game.radarTimer = 0;
      game.radarCooldown = abilityCooldown("radar", RADAR_COOLDOWN);
      updateHud();
    }
    updateRadarMarker();
  }
  updateGrenades(dt); updateExplosions(dt); updateLasers(dt); updateDamagePops(dt); updatePlayerMeshes();
  if (game.killNoticeTimer > 0) { game.killNoticeTimer -= dt; if (game.killNoticeTimer <= 0) killNotice.classList.add("hidden"); }
  if (game.connected && now - game.lastSend > 50) { game.lastSend = now; const p = fps.players[game.localIndex]; send({ type: "fpsState", player: game.localIndex, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, sliding: p.sliding, weapon: game.activeWeapon }); }
  updateHud();
}
function updateFpsCamera(dt) {
  const p = fps.players[game.localIndex]; p.yaw = input.yaw; p.pitch = input.pitch; p.currentCamHeight = moveTowards(p.currentCamHeight || 1.58, p.sliding ? 0.8 : 1.58, dt * 2.5);
  game.visualRecoil = moveTowards(game.visualRecoil, 0, dt * 9);
  camera.position.set(p.pos.x, p.pos.y + p.currentCamHeight, p.pos.z); camera.lookAt(camera.position.clone().add(directionFromAngles(p.yaw, p.pitch + game.visualRecoil * 0.018)));
  const cfg = weaponConfig(game.primaryWeapon);
  camera.fov = moveTowards(camera.fov, input.aiming ? (cfg.aimFov || FPS_AIM_FOV) : FPS_DEFAULT_FOV, dt * (cfg.aimSpeed || 180)); camera.updateProjectionMatrix(); updateWeaponModel(dt, p);
}
function updateWeaponModel(dt, p) {
  const isRadarActive = game.radarTimer > 0;
  
  world.weapon.visible = false;
  world.meleeWeapon.visible = false;
  world.radarDevice.visible = false;
  
  let weapon;
  let cfg;
  if (isRadarActive) {
    weapon = world.radarDevice;
    weapon.visible = true;
    cfg = {
      scale: 1.0,
      firstPersonOffset: { x: 0.0, y: -0.22, z: -0.28 }
    };
  } else {
    weapon = game.activeWeapon === "gun" ? world.weapon : world.meleeWeapon;
    weapon.visible = true;
    cfg = game.activeWeapon === "gun" ? weaponConfig(game.primaryWeapon) : weaponConfig("melee");
  }

  const camDir = directionFromAngles(p.yaw, p.pitch), viewDir = directionFromAngles(p.yaw, 0), right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3(0, 1, 0);
  const speed = p.vel.length(), bob = Math.sin(performance.now() * 0.008) * speed * 0.005, swayX = Math.sin(performance.now() * 0.004) * 0.005;
  
  if (isRadarActive) {
    weapon.scale.setScalar(0.8);
  } else {
    weapon.scale.setScalar(game.activeWeapon === "gun" ? (cfg.scale || 1.0) * 0.82 : 0.78);
  }
  const fpOffset = cfg.firstPersonOffset || { x: 0.22, y: -0.3, z: -0.34 };

  // Calculate inspect progress (0.0 to 1.0)
  let inspectProgress = 0;
  if (!isRadarActive && game.inspectTimer > 0) {
    const inspectTotal = 2.0;
    const elapsed = inspectTotal - game.inspectTimer;
    if (elapsed < 0.5) {
      inspectProgress = Math.sin((elapsed / 0.5) * Math.PI / 2);
    } else if (elapsed > 1.5) {
      inspectProgress = Math.sin(((inspectTotal - elapsed) / 0.5) * Math.PI / 2);
    } else {
      inspectProgress = 1.0;
    }
  }

  // Interpolate weapon offset based on inspect progress to center it and bring it closer
  const targetX = THREE.MathUtils.lerp(fpOffset.x, 0.02, inspectProgress);
  const targetY = THREE.MathUtils.lerp(fpOffset.y, -0.16, inspectProgress);
  const targetZ = THREE.MathUtils.lerp(fpOffset.z, -0.24, inspectProgress);

  let offset = camDir.clone().multiplyScalar(-targetZ).add(right.clone().multiplyScalar(targetX + swayX)).add(up.clone().multiplyScalar(targetY + bob));
  if (!isRadarActive && input.aiming && game.activeWeapon === "gun" && inspectProgress === 0) {
    const longGun = game.primaryWeapon === "sniper" || game.primaryWeapon === "heavySniper" || game.primaryWeapon === "tacticalSniper";
    offset = camDir.clone().multiplyScalar(-fpOffset.z - (longGun ? 0.06 : 0.1)).add(right.clone().multiplyScalar(fpOffset.x * 0.15 + swayX)).add(up.clone().multiplyScalar(fpOffset.y - (longGun ? 0.24 : 0.16) + bob));
  }
  offset.add(camDir.clone().multiplyScalar(-game.visualRecoil * 0.12)).add(up.clone().multiplyScalar(game.visualRecoil * 0.04));

  // Compute animation-related Y offset
  let animY = 0;
  if (!isRadarActive && game.weaponSwapTimer > 0) {
    animY = -Math.sin((game.weaponSwapTimer / WEAPON_SWAP_DURATION) * Math.PI) * 0.5;
  } else if (!isRadarActive && game.reloading) {
    const total = cfg.reload || 1.4;
    const t = game.reloadTimer / total;
    const reloadFactor = Math.sin(t * Math.PI);
    
    // Dynamic drop amount to prevent clipping through floor
    let dropAmount = 0.75;
    let groundY = world.arenaFloors.length > 0 ? 0.0 : -60;
    for (const plat of world.platforms) {
      const b = new THREE.Box3().setFromObject(plat);
      if (camera.position.x > b.min.x && camera.position.x < b.max.x && camera.position.z > b.min.z && camera.position.z < b.max.z) {
        groundY = Math.max(groundY, b.max.y);
      }
    }
    for (const ramp of world.ramps) {
      const y = rampSurfaceY(ramp, camera.position, 0);
      if (y !== null) groundY = Math.max(groundY, y);
    }
    const minWeaponY = groundY + 0.18;
    const weaponYWithoutAnim = camera.position.y + offset.y;
    const maxAllowableDrop = weaponYWithoutAnim - minWeaponY;
    if (maxAllowableDrop > 0 && dropAmount > maxAllowableDrop) {
      dropAmount = Math.max(0.15, maxAllowableDrop);
    }
    
    animY = -reloadFactor * dropAmount;
  } else if (!isRadarActive && game.activeWeapon === "melee" && game.meleeSwingTimer > 0) {
    const progress = (0.25 - game.meleeSwingTimer) / 0.25;
    animY = -Math.sin(progress * Math.PI) * 1.5;
  }

  weapon.position.copy(camera.position).add(offset).add(up.clone().multiplyScalar(animY));

  // Apply ground safety clamp for normal movement
  let groundY = world.arenaFloors.length > 0 ? 0.0 : -60;
  for (const plat of world.platforms) {
    const b = new THREE.Box3().setFromObject(plat);
    if (weapon.position.x > b.min.x && weapon.position.x < b.max.x && weapon.position.z > b.min.z && weapon.position.z < b.max.z) {
      groundY = Math.max(groundY, b.max.y);
    }
  }
  for (const ramp of world.ramps) {
    const y = rampSurfaceY(ramp, weapon.position, 0);
    if (y !== null) groundY = Math.max(groundY, y);
  }
  const minWeaponY = groundY + 0.18;
  if (weapon.position.y < minWeaponY) {
    weapon.position.y = minWeaponY;
  }

  // Apply camera orientation and add local rotations for inspection
  weapon.quaternion.copy(camera.quaternion);
  if (isRadarActive) {
    weapon.rotateX(0.5);
  } else if (inspectProgress > 0) {
    weapon.rotateY(1.3 * inspectProgress);
    weapon.rotateX(0.15 * inspectProgress);
    weapon.rotateZ(-0.25 * inspectProgress);
  }
}
function updateFpsMovement(dt) {
  const p = fps.players[game.localIndex], theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], forward = new THREE.Vector3(Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize(), move = new THREE.Vector3();
  const previousPosition = p.pos.clone();
  const previousY = previousPosition.y;
  if (input.keys.has("KeyW")) move.add(forward); if (input.keys.has("KeyS")) move.sub(forward); if (input.keys.has("KeyA")) move.sub(right); if (input.keys.has("KeyD")) move.add(right); if (move.lengthSq() > 0) move.normalize();
  const wasGrounded = p.grounded;
  const wasGroundSurface = p.groundSurface || null;
  const slideKey = input.keys.has("ShiftLeft") || input.keys.has("ControlLeft"), slidePressed = slideKey && !input.slideKeyWasDown, wantsSlide = slidePressed && p.grounded && move.lengthSq() > 0 && game.slideCooldown <= 0;
  const activeWeaponId = game.activeWeapon === "melee" ? "melee" : game.primaryWeapon;
  const cfg = weaponConfig(activeWeaponId);
  const weaponMoveScale = (cfg.moveScale || 1) * activeLoadout().speed * (activeWeaponId === "minigun" && input.shootHeld ? cfg.movePenalty : 1);
  if (wantsSlide) { game.slideTimer = 0.58; game.slideCooldown = 0.65; p.vel.addScaledVector(move, 7.5 * weaponMoveScale); playSound("slide"); }
  p.sliding = game.slideTimer > 0 && p.grounded;
  input.slideKeyWasDown = slideKey;
  
  // Snappy movement: accel 220, friction 0.80 when moving, 0.65 when stopping
  const accel = p.sliding ? 32 : (p.grounded ? 220 : 25), maxSpeed = (p.sliding ? 22 : 14.5) * weaponMoveScale;
  p.vel.addScaledVector(move, accel * weaponMoveScale * dt);
  const baseFriction = p.sliding ? 0.976 : (p.grounded ? (move.lengthSq() > 0 ? 0.80 : 0.65) : 0.985);
  const friction = Math.pow(baseFriction, dt * 60);
  p.vel.x *= friction;
  p.vel.z *= friction;
  const horiz = Math.hypot(p.vel.x, p.vel.z);
  if (horiz > maxSpeed) {
    const s = maxSpeed / horiz;
    p.vel.x *= s;
    p.vel.z *= s;
  }
  
  if (input.keys.has("Space") && p.grounded) { p.vel.y = 10.4; p.grounded = false; playSound("jump"); } if (input.keys.has(getAbilityKey("jump")) && abilityAllowed("jump") && game.jumpCooldown <= 0) { p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); } if (input.keys.has(getAbilityKey("heal")) && abilityAllowed("heal") && game.healCooldown <= 0 && p.health < game.maxHealth) { p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); } if (input.keys.has(getAbilityKey("jetpack")) && abilityAllowed("jetpack") && p.pos.y < (game.jetpackHeightLimit || 40.0)) { p.vel.y = Math.min(p.vel.y + 60 * dt, 12); p.grounded = false; }
  p.vel.y += fps.gravity * dt; p.pos.addScaledVector(p.vel, dt);
  
  // Ceiling collision check: stop player from phasing through ceilings when jumping upwards
  if (p.vel.y > 0) {
    const previousHead = previousY + FPS_PLAYER_HEIGHT_WORLD;
    const currentHead = p.pos.y + FPS_PLAYER_HEIGHT_WORLD;
    const CEILING_TOLERANCE = 0.20;
    const ceilingBlockers = [...world.platforms, ...world.obstacles];
    for (const block of ceilingBlockers) {
      if (block.userData?.isRamp) continue;
      const b = new THREE.Box3().setFromObject(block);
      const insideX = p.pos.x > b.min.x - FPS_PLAYER_RADIUS_WORLD && p.pos.x < b.max.x + FPS_PLAYER_RADIUS_WORLD;
      const insideZ = p.pos.z > b.min.z - FPS_PLAYER_RADIUS_WORLD && p.pos.z < b.max.z + FPS_PLAYER_RADIUS_WORLD;
      if (insideX && insideZ) {
        if (previousHead <= b.min.y + CEILING_TOLERANCE && currentHead >= b.min.y) {
          p.pos.y = b.min.y - FPS_PLAYER_HEIGHT_WORLD - 0.01;
          p.vel.y = 0;
          break;
        }
      }
    }
  }
  
  let onPlat = false;
  let platSurface = null;
  
  for (const ramp of world.ramps) resolvePlayerVsRampSolid(p, previousPosition, ramp, FPS_PLAYER_RADIUS_WORLD);

  const rampSurface = fpsRampSurface(p, previousPosition, p.vel.y, wasGrounded, wasGroundSurface);
  if (rampSurface) {
    p.pos.y = rampSurface.y;
    p.vel.y = 0;
    onPlat = true;
    platSurface = rampSurface.surface;
  } else {
    const flatSurface = fpsFlatSurfaceY(p.pos, previousY, p.vel.y, wasGrounded, wasGroundSurface);
    if (flatSurface) {
      p.pos.y = flatSurface.y;
      p.vel.y = 0;
      onPlat = true;
      platSurface = flatSurface.surface;
    }
  }
  if (onPlat) {
    p.groundSurface = platSurface;
  }

  // Check floors
  let onFloor = false;
  let bestFloorY = -Infinity;
  for (const floor of world.arenaFloors) {
    if (floor.type === "circle") {
      if (Math.hypot(p.pos.x - floor.x, p.pos.z - floor.z) <= floor.r + FPS_PLAYER_RADIUS_WORLD) {
        const y = Number(floor.y || 0);
        if (y > bestFloorY) { bestFloorY = y; onFloor = true; }
      }
    } else {
      const halfX = (floor.sx || 1) / 2 + FPS_PLAYER_RADIUS_WORLD;
      const halfZ = (floor.sz || 1) / 2 + FPS_PLAYER_RADIUS_WORLD;
      if (Math.abs(p.pos.x - floor.x) <= halfX && Math.abs(p.pos.z - floor.z) <= halfZ) {
        const y = Number(floor.y || 0);
        if (y > bestFloorY) { bestFloorY = y; onFloor = true; }
      }
    }
  }

  if (!onPlat && onFloor && p.pos.y <= bestFloorY) {
    p.pos.y = bestFloorY;
    p.vel.y = 0;
    p.grounded = true;
    p.groundSurface = "floor";
  } else {
    p.grounded = onPlat;
    if (!p.grounded) {
      p.groundSurface = null;
    }
  }
  
  if (!wasGrounded && p.grounded) playSound("land");
  if (p.pos.y < -8) {
    p.health = 0;
    updateHud();
    const alive = aliveFpsPlayerIndexes();
    if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
    const spawn = getArenaSpawnPoints(theme)[game.localIndex] || { x: 0, z: 0 };
    p.pos.set(spawn.x, getSpawnY(spawn, theme), spawn.z);
    p.vel.set(0, 0, 0);
  }
  clampArenaPosition(p.pos, FPS_PLAYER_RADIUS_WORLD);
  for (const obs of world.obstacles) {
    if (obs.userData?.isRamp) continue;
    if (shouldSkipCompositeSurfaceCollision(p, obs)) continue;
    resolvePlayerVsMeshObb(p.pos, obs, FPS_PLAYER_RADIUS_WORLD);
  }
  clampArenaPosition(p.pos, FPS_PLAYER_RADIUS_WORLD);
}

function shouldSkipCompositeSurfaceCollision(player, obstacle) {
  const support = player.groundSurface;
  if (!player.grounded || !support || support === "floor" || support === obstacle || obstacle.userData?.isRamp) return false;
  if (!support.isObject3D) return false;
  const supportBox = new THREE.Box3().setFromObject(support);
  const obstacleBox = new THREE.Box3().setFromObject(obstacle);
  const standingOnSupport = Math.abs(player.pos.y - supportBox.max.y) <= 0.12;
  const obstacleCrossesFeet = obstacleBox.min.y <= player.pos.y + 0.08 && obstacleBox.max.y > player.pos.y + 0.08;
  const overlapsX = supportBox.min.x < obstacleBox.max.x - 0.02 && supportBox.max.x > obstacleBox.min.x + 0.02;
  const overlapsZ = supportBox.min.z < obstacleBox.max.z - 0.02 && supportBox.max.z > obstacleBox.min.z + 0.02;
  return standingOnSupport && obstacleCrossesFeet && overlapsX && overlapsZ;
}

function fpsFlatSurfaceY(position, previousY, velocityY, wasGrounded, wasGroundSurface) {
  if (velocityY > 0) return null;
  const surfaces = new Set([...world.platforms, ...world.obstacles.filter((obs) => !obs.userData?.isRamp)]);
  let best = null;
  for (const surface of surfaces) {
    const b = new THREE.Box3().setFromObject(surface);
    const insideX = position.x > b.min.x - FPS_PLAYER_RADIUS_WORLD && position.x < b.max.x + FPS_PLAYER_RADIUS_WORLD;
    const insideZ = position.z > b.min.z - FPS_PLAYER_RADIUS_WORLD && position.z < b.max.z + FPS_PLAYER_RADIUS_WORLD;
    const canSnap = (wasGrounded && wasGroundSurface === surface) ||
                    (previousY >= b.max.y - 0.05 && position.y <= b.max.y);
    if (insideX && insideZ && canSnap && (!best || b.max.y > best.y)) {
      best = { y: b.max.y, surface };
    }
  }
  return best;
}

function fpsRampSurface(p, previousPosition, velocityY, wasGrounded, wasGroundSurface) {
  let best = null;
  for (const ramp of world.ramps) {
    const info = rampSurfaceInfo(ramp, p.pos, FPS_RAMP_PROBE_MARGIN);
    if (!info) continue;

    const alreadyOnRamp = wasGrounded && wasGroundSurface === ramp;
    if (velocityY > 0) continue;

    const previousInfo = rampSurfaceInfo(ramp, previousPosition, FPS_RAMP_PROBE_MARGIN);
    const previousSurfaceY = previousInfo?.y ?? info.y;
    const maxStepUp = alreadyOnRamp ? FPS_RAMP_STEP_UP : Math.min(FPS_RAMP_STEP_UP, Math.max(0.18, Math.abs(velocityY) * 0.04 + 0.18));
    const nearSurfaceNow = p.pos.y >= info.y - FPS_RAMP_STEP_DOWN && p.pos.y <= info.y + FPS_RAMP_LAND_EPSILON;
    const crossedSurface = previousPosition.y >= previousSurfaceY - 0.05 && nearSurfaceNow;
    const canStepUp = wasGrounded && previousPosition.y >= info.y - maxStepUp && nearSurfaceNow;
    const canContinueOnRamp = alreadyOnRamp && p.pos.y <= info.y + FPS_RAMP_STEP_DOWN;
    const canLandOrStepOn = velocityY <= 0 && (crossedSurface || canStepUp);

    if ((canContinueOnRamp || canLandOrStepOn) && (!best || info.y > best.y)) {
      best = { y: info.y, surface: ramp, normal: info.normal };
    }
  }
  return best;
}

function resolvePlayerVsRampSolid(player, previousPosition, ramp, radius) {
  const position = player.pos;
  const local = rampLocalPoint(ramp, position);
  const halfWidth = ramp.width / 2;
  const halfLength = ramp.length / 2;
  if (
    local.x < -halfWidth - radius ||
    local.x > halfWidth + radius ||
    local.z < -halfLength - radius ||
    local.z > halfLength + radius
  ) {
    return;
  }

  const clampedX = Math.max(-halfWidth, Math.min(halfWidth, local.x));
  const clampedZ = Math.max(-halfLength, Math.min(halfLength, local.z));
  const surfaceT = (clampedZ + halfLength) / ramp.length;
  const solidTopY = ramp.y + surfaceT * ramp.height;
  const topInfo = rampSurfaceInfo(ramp, position, FPS_RAMP_PROBE_MARGIN);
  const previousTopInfo = rampSurfaceInfo(ramp, previousPosition, FPS_RAMP_PROBE_MARGIN);
  const wasOnRampTop = previousTopInfo &&
    previousPosition.y >= previousTopInfo.y - 0.08 &&
    previousPosition.y <= previousTopInfo.y + FPS_RAMP_LAND_EPSILON;
  if (wasOnRampTop && topInfo && player.vel.y > 0) {
    position.y = Math.max(position.y, topInfo.y + 0.04);
    return;
  }

  const canUseTopSurface = topInfo &&
    player.vel.y <= 0 &&
    previousPosition.y >= topInfo.y - FPS_RAMP_STEP_UP &&
    position.y >= topInfo.y - FPS_RAMP_STEP_DOWN &&
    position.y <= topInfo.y + FPS_RAMP_LAND_EPSILON;
  if (canUseTopSurface) return;

  if (position.y >= solidTopY - FPS_RAMP_SOLID_TOP_CLEARANCE) return;
  if (position.y + FPS_PLAYER_HEIGHT_WORLD <= ramp.y + 0.05) return;

  const fromLowEnd = local.z < -halfLength && previousPosition.y >= ramp.y - FPS_RAMP_SOLID_TOP_CLEARANCE;
  if (fromLowEnd) return;

  let targetLocal = null;
  let normalLocal = null;
  const dx = local.x - clampedX;
  const dz = local.z - clampedZ;
  const distSq = dx * dx + dz * dz;

  if (distSq > 0.0001) {
    if (distSq >= radius * radius) return;
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    targetLocal = {
      x: local.x + (dx / dist) * push,
      z: local.z + (dz / dist) * push
    };
    normalLocal = new THREE.Vector3(dx / dist, 0, dz / dist);
  } else {
    const previousLocal = rampLocalPoint(ramp, previousPosition);
    if (previousLocal.x < -halfWidth) {
      targetLocal = { x: -halfWidth - radius, z: local.z };
      normalLocal = new THREE.Vector3(-1, 0, 0);
    } else if (previousLocal.x > halfWidth) {
      targetLocal = { x: halfWidth + radius, z: local.z };
      normalLocal = new THREE.Vector3(1, 0, 0);
    } else if (previousLocal.z > halfLength) {
      targetLocal = { x: local.x, z: halfLength + radius };
      normalLocal = new THREE.Vector3(0, 0, 1);
    } else if (previousLocal.z < -halfLength && previousPosition.y < ramp.y - FPS_RAMP_SOLID_TOP_CLEARANCE) {
      targetLocal = { x: local.x, z: -halfLength - radius };
      normalLocal = new THREE.Vector3(0, 0, -1);
    } else {
      return;
    }
  }

  const worldPoint = rampWorldPoint(ramp, targetLocal);
  position.x = worldPoint.x;
  position.z = worldPoint.z;

  const normalWorld = normalLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ramp.rot).normalize();
  const inwardVelocity = player.vel.dot(normalWorld);
  if (inwardVelocity < 0) player.vel.addScaledVector(normalWorld, -inwardVelocity);
}

function resolvePlayerVsMeshObb(position, mesh, radius) {
  if (!mesh.geometry) return;
  const MICRO_STEP_HEIGHT = 0.36;
  const TOP_CLEARANCE = 0.08;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(size);
  size.multiply(mesh.scale);
  const halfSize = size.clone().multiplyScalar(0.5);

  const localCenter = new THREE.Vector3();
  mesh.geometry.boundingBox.getCenter(localCenter);
  localCenter.multiply(mesh.scale);

  const center = localCenter.clone().applyQuaternion(mesh.quaternion).add(mesh.position);
  const quaternion = mesh.quaternion.clone();
  const inverseQuaternion = quaternion.clone().invert();

  const corners = [];
  for (const x of [-halfSize.x, halfSize.x]) {
    for (const y of [-halfSize.y, halfSize.y]) {
      for (const z of [-halfSize.z, halfSize.z]) {
        corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(center));
      }
    }
  }
  const bottom = Math.min(...corners.map(c => c.y));
  const top = Math.max(...corners.map(c => c.y));

  if (position.y >= top - TOP_CLEARANCE || position.y + FPS_PLAYER_HEIGHT_WORLD < bottom) return;

  const local = new THREE.Vector3(position.x, Math.max(bottom, Math.min(top, position.y)), position.z)
    .sub(center)
    .applyQuaternion(inverseQuaternion);

  const localYAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const sinPhi = Math.sqrt(Math.max(0, 1 - localYAxis.y * localYAxis.y));
  const maxProj = FPS_PLAYER_HEIGHT_WORLD * Math.abs(localYAxis.y) + radius * sinPhi;
  if (Math.abs(local.y) > halfSize.y + maxProj) return;

  const closestX = Math.max(-halfSize.x, Math.min(halfSize.x, local.x));
  const closestZ = Math.max(-halfSize.z, Math.min(halfSize.z, local.z));
  let dx = local.x - closestX;
  let dz = local.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return;

  const stepHeight = top - position.y;
  if (stepHeight > TOP_CLEARANCE && stepHeight <= MICRO_STEP_HEIGHT) {
    position.y = top;
    return;
  }

  if (distSq < 0.0001) {
    const pushX = halfSize.x - Math.abs(local.x);
    const pushZ = halfSize.z - Math.abs(local.z);
    if (pushX < pushZ) {
      dx = Math.sign(local.x || 1);
      dz = 0;
      local.x += dx * (pushX + radius);
    } else {
      dx = 0;
      dz = Math.sign(local.z || 1);
      local.z += dz * (pushZ + radius);
    }
  } else {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    local.x += (dx / dist) * push;
    local.z += (dz / dist) * push;
  }

  const worldPos = local.applyQuaternion(quaternion).add(center);
  position.x = worldPos.x;
  position.z = worldPos.z;
}
function collideGrenadeWithObstacle(g, obs, radius) {
  if (!obs.geometry) return false;
  if (!obs.geometry.boundingBox) obs.geometry.computeBoundingBox();
  
  const box3 = new THREE.Box3().setFromObject(obs);
  const closestPoint = new THREE.Vector3();
  box3.clampPoint(g.mesh.position, closestPoint);
  
  const diff = g.mesh.position.clone().sub(closestPoint);
  const dist = diff.length();
  
  if (dist < radius) {
    let normal;
    let depth;
    if (dist > 0.0001) {
      normal = diff.clone().normalize();
      depth = radius - dist;
    } else {
      const min = box3.min;
      const max = box3.max;
      const pos = g.mesh.position;
      
      const dl = pos.x - min.x;
      const dr = max.x - pos.x;
      const db = pos.y - min.y;
      const dt = max.y - pos.y;
      const df = pos.z - min.z;
      const dk = max.z - pos.z;
      
      const minDist = Math.min(dl, dr, db, dt, df, dk);
      normal = new THREE.Vector3();
      if (minDist === dl) { normal.set(-1, 0, 0); depth = radius + dl; }
      else if (minDist === dr) { normal.set(1, 0, 0); depth = radius + dr; }
      else if (minDist === db) { normal.set(0, -1, 0); depth = radius + db; }
      else if (minDist === dt) { normal.set(0, 1, 0); depth = radius + dt; }
      else if (minDist === df) { normal.set(0, 0, -1); depth = radius + df; }
      else { normal.set(0, 0, 1); depth = radius + dk; }
    }
    
    g.mesh.position.addScaledVector(normal, depth);
    
    const dot = g.vel.dot(normal);
    if (dot < 0) {
      const normalVel = normal.clone().multiplyScalar(dot);
      const tangentVel = g.vel.clone().sub(normalVel);
      g.vel.copy(tangentVel.multiplyScalar(0.8).add(normalVel.multiplyScalar(-0.4)));
    }
    return true;
  }
  return false;
}
function updateGrenades(dt) {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const g = world.grenades[i];
    if (g.kind === "rocket") {
      g.mesh.position.addScaledVector(g.vel, dt);
    } else {
      g.vel.y += (g.gravity ?? GRENADE_GRAVITY) * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
    }
    
    // Rockets should not rotate around X/Y to preserve forward direction
    if (g.kind !== "rocket") {
      g.mesh.rotation.x += 5 * dt;
      g.mesh.rotation.y += 3 * dt;
    }
    
    g.timer -= dt;
    
    let hitObstacle = false;
    if (g.kind === "rocket" || g.kind === "grenadeLauncher") {
      hitObstacle = projectileHitObstacle(g);
    } else {
      for (const obs of world.obstacles) {
        collideGrenadeWithObstacle(g, obs, 0.22);
      }
    }
    
    const outOfArena = !isPointInsideArena(g.mesh.position, world.arenaFloors, 0.1);
    const hitPlayer = projectileHitPlayer(g);
    
    let hitGround = false;
    let bestFloorY = -Infinity;
    for (const floor of world.arenaFloors) {
      if (floor.type === "circle") {
        if (Math.hypot(g.mesh.position.x - floor.x, g.mesh.position.z - floor.z) <= floor.r) {
          const y = Number(floor.y || 0);
          if (y > bestFloorY) bestFloorY = y;
        }
      } else {
        const halfX = (floor.sx || 1) / 2;
        const halfZ = (floor.sz || 1) / 2;
        if (Math.abs(g.mesh.position.x - floor.x) <= halfX && Math.abs(g.mesh.position.z - floor.z) <= halfZ) {
          const y = Number(floor.y || 0);
          if (y > bestFloorY) bestFloorY = y;
        }
      }
    }
    if (bestFloorY !== -Infinity && g.mesh.position.y < bestFloorY + 0.22) {
      hitGround = true;
    }
    
    if (hitGround && g.kind !== "rocket" && g.kind !== "grenadeLauncher") {
      g.mesh.position.y = bestFloorY + 0.22;
      g.vel.y *= -0.4;
      g.vel.x *= 0.8;
      g.vel.z *= 0.8;
    }
    
    if (outOfArena || hitObstacle || hitPlayer || (hitGround && (g.kind === "rocket" || g.kind === "grenadeLauncher")) || g.timer <= 0 || g.mesh.position.y < -8) {
      if (g.localAuthority) explodeGrenade(g);
      else createExplosion(g.mesh.position.clone(), grenadeRadius(g) * 0.45);
      world.arenaRoot.remove(g.mesh);
      world.grenades.splice(i, 1);
    }
  }
}
function spawnGrenade(pos, vel, local = true, owner = 0, options = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: owner === game.localIndex ? 0x243c34 : 0x4a2528, roughness: 0.38, metalness: 0.28, emissive: options.supercharged ? 0xa74dff : 0x000000, emissiveIntensity: options.supercharged ? 0.9 : 0 });
  const glowMat = new THREE.MeshBasicMaterial({ color: owner === game.localIndex ? 0x7ee2a8 : 0xff6f61 });
  if (options.kind === "rocket") {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 14), bodyMat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.28, 14), glowMat);
    nose.position.y = -0.14; // Align visual nose tip at local y = 0
    shell.position.y = -0.68; // Align cylinder top at base of nose cone
    group.add(shell, nose);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.clone().normalize());
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), bodyMat);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 24), glowMat);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.45 }));
    band.rotation.x = Math.PI / 2;
    pin.position.set(0.12, 0.18, 0);
    pin.rotation.y = Math.PI / 2;
    group.add(body, band, pin);
  }
  group.position.copy(pos);
  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  world.arenaRoot.add(group);
  world.grenades.push({ mesh: group, vel, timer: options.timer ?? 2.5, owner, localAuthority: local, kind: options.kind || "grenade", gravity: options.gravity ?? GRENADE_GRAVITY, damageMultiplier: options.damageMultiplier || 1, radiusMultiplier: options.radiusMultiplier || 1, isSupercharged: Boolean(options.supercharged) });
}
function throwGrenade() {
  if (game.phase !== "fps" || game.countdown > 0 || game.grenadeCooldown > 0 || !abilityAllowed("grenade")) return;
  game.grenadeCooldown = abilityCooldown("grenade", GRENADE_COOLDOWN);
  const p = fps.players[game.localIndex];
  const origin = new THREE.Vector3();
  if (world.weaponTip) {
    world.weaponTip.getWorldPosition(origin);
  } else {
    origin.set(p.pos.x, p.pos.y + 0.65, p.pos.z);
  }
  const dir = directionFromAngles(p.yaw, p.pitch), vel = dir.clone().multiplyScalar(GRENADE_SPEED).add(p.vel);
  spawnGrenade(origin, vel, true, game.localIndex);
  playSound("grenade");
  send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex });
  updateHud();
}
function activateJumpAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("jump") || game.jumpCooldown > 0) return; const p = fps.players[game.localIndex]; p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); updateHud(); }
function activateHealAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("heal") || game.healCooldown > 0) return; const p = fps.players[game.localIndex]; if (p.health >= game.maxHealth) return; p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); }
function grenadeRadius(g) { return GRENADE_SPLASH_RADIUS * (g.radiusMultiplier || 1); }
function grenadeDamage(g) { return GRENADE_MAX_DAMAGE * (g.damageMultiplier || 1); }
function projectileHitObstacle(g) { if (g.kind !== "rocket" && g.kind !== "grenadeLauncher") return false; const radius = g.kind === "grenadeLauncher" ? 0.32 : 0.26; const b = new THREE.Box3(); for (const obs of world.obstacles) { b.setFromObject(obs); if (b.distanceToPoint(g.mesh.position) < radius) return true; } return false; }
function projectileHitPlayer(g) { if (g.kind !== "rocket" && g.kind !== "grenadeLauncher") return false; const radius = g.kind === "grenadeLauncher" ? 0.86 : 0.95; return fps.players.some((p, index) => index !== g.owner && p.health > 0 && p.pos.clone().add(new THREE.Vector3(0, 0.72, 0)).distanceTo(g.mesh.position) < radius); }
function explodeGrenade(g) { const pos = g.mesh.position.clone(); world.arenaRoot.remove(g.mesh); createExplosion(pos, grenadeRadius(g) * 0.5); playSound("explosion"); const damages = []; for (let i = 0; i < fps.players.length; i++) { const target = fps.players[i], dist = pos.distanceTo(target.pos.clone().add(new THREE.Vector3(0, 0.72, 0))), radius = grenadeRadius(g); if (dist < radius && target.health > 0) { const dmg = Math.floor((1.0 - dist / radius) * grenadeDamage(g)); if (dmg > 0) { damages.push({ target: i, damage: dmg }); const wasAlive = target.health > 0; target.health = Math.max(0, target.health - dmg); showDamageDealt(dmg, target.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), false); if (i === game.localIndex) showDamageTaken(dmg); if (wasAlive && target.health === 0 && i !== game.localIndex && g.owner === game.localIndex) { showEliminationNotice(i); } } } } send({ type: "fpsGrenadeExplode", x: pos.x, y: pos.y, z: pos.z, damage: damages[0]?.damage || 0, target: damages[0]?.target ?? null, damages, owner: g.owner, radius: grenadeRadius(g) }); const alive = aliveFpsPlayerIndexes(); if (alive.length === 1) startVictoryLap(alive[0], "deathmatch"); }
function createExplosion(pos, radius = GRENADE_SPLASH_RADIUS * 0.5) { const geo = new THREE.SphereGeometry(radius, 32, 24), mat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.8 }); const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); world.arenaRoot.add(mesh); world.explosions.push({ mesh, timer: 0.4, max: 0.4 }); }
function updateExplosions(dt) { for (let i = world.explosions.length - 1; i >= 0; i--) { const ex = world.explosions[i]; ex.timer -= dt; const s = 1.0 + (1.0 - ex.timer / ex.max) * 2.0; ex.mesh.scale.set(s, s, s); ex.mesh.material.opacity = ex.timer / ex.max; if (ex.timer <= 0) { world.arenaRoot.remove(ex.mesh); world.explosions.splice(i, 1); } } }
function removeRemoteGrenadesNear(pos) { for (let i = world.grenades.length - 1; i >= 0; i--) { if (world.grenades[i].mesh.position.distanceTo(pos) < 1.0) { world.arenaRoot.remove(world.grenades[i].mesh); world.grenades.splice(i, 1); } } }
function disposeGrenade(g, announce = false) { const pos = g.mesh.position.clone(); world.arenaRoot.remove(g.mesh); const index = world.grenades.indexOf(g); if (index >= 0) world.grenades.splice(index, 1); createExplosion(pos, 1.4); if (announce) send({ type: "fpsGrenadeShot", x: pos.x, y: pos.y, z: pos.z }); }
function superchargeGrenade(g, announce = false) { g.isSupercharged = true; g.damageMultiplier = 2; g.radiusMultiplier = 2; g.mesh.traverse((child) => { if (child.material?.color) child.material.color.setHex(0xb84dff); if (child.material?.emissive) { child.material.emissive.setHex(0xb84dff); child.material.emissiveIntensity = 1.1; } }); if (announce) { const pos = g.mesh.position; send({ type: "fpsGrenadeSupercharge", x: pos.x, y: pos.y, z: pos.z }); } }
function grenadeRayHit(origin, direction, maxDistance) {
  let best = null;
  for (const grenade of world.grenades) {
    const distance = rayHitsSphere(origin, direction, grenade.mesh.position, grenade.kind === "rocket" ? 0.38 : 0.28);
    if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { grenade, distance };
  }
  return best;
}

function fireHitscan() {
  if (game.radarTimer > 0) return;
  if (game.phase !== "fps" || game.countdown > 0 || game.reloading || game.ammo[game.primaryWeapon] <= 0) { if (game.ammo[game.primaryWeapon] <= 0) startReload(); return; }
  const cfg = weaponConfig();
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  if (cfg.projectile) { fireProjectileWeapon(cfg); return; }
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : (game.primaryWeapon === "minigun" ? 0.18 : game.primaryWeapon === "shotgun" ? 0.7 : 0.42); game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(game.primaryWeapon === "heavySniper" ? "sniper" : game.primaryWeapon); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload(); updateHud();
  const shooter = fps.players[game.localIndex], origin = new THREE.Vector3(shooter.pos.x, shooter.pos.y + (shooter.currentCamHeight || 0.72), shooter.pos.z);
  const pelletCount = cfg.pellets || 1, pellets = [], hitDamages = new Map(), hitHeadshots = new Map(); let totalDamage = 0, anyHit = false, anyHeadshot = false, bestLength = cfg.range || 80, firstDirection = null, hitTarget = null, hitWorldPos = null;
  for (let i = 0; i < pelletCount; i++) {
    const spread = input.aiming ? (cfg.aimSpread ?? 0) : (cfg.spread ?? 0);
    const direction = spread > 0 ? directionFromAngles(input.yaw + (Math.random() - 0.5) * spread * 2, input.pitch + (Math.random() - 0.5) * spread).normalize() : directionFromAngles(input.yaw, input.pitch).normalize();
    firstDirection ||= direction;
    const ray = new THREE.Raycaster(origin, direction, 0, cfg.range || 150), intersects = ray.intersectObjects(world.obstacles); let wallHit = intersects.length > 0 ? intersects[0] : null;
    const grenadeHit = grenadeRayHit(origin, direction, wallHit ? wallHit.distance : (cfg.range || 150));
    if (grenadeHit) {
      if (grenadeHit.grenade.owner === game.localIndex) superchargeGrenade(grenadeHit.grenade, true);
      else disposeGrenade(grenadeHit.grenade, true);
      drawLaser(origin, direction, grenadeHit.distance, true, false, game.primaryWeapon);
      pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: grenadeHit.distance, hit: true });
      continue;
    }
    let playerHitResult = null;
    for (const candidate of opposingFpsPlayers()) {
      const hit = rayHitsPlayer(origin, direction, candidate.player);
      if (hit && (!playerHitResult || hit.distance < playerHitResult.distance)) playerHitResult = { ...hit, index: candidate.index, player: candidate.player };
    }
    let pelletHit = false, pelletDmg = 0, pelletHS = false, len = cfg.range || 80;
    if (playerHitResult) { const pDist = playerHitResult.distance, throughWall = wallHit && wallHit.distance < pDist; pelletHit = !throughWall || true; pelletHS = playerHitResult.headshot; pelletDmg = Math.floor(cfg.damage * (pelletHS ? cfg.crit : 1) * (throughWall ? 0.5 : 1)); len = pDist; hitTarget ??= playerHitResult.index; hitWorldPos ??= playerHitResult.player.pos.clone(); } else if (wallHit) len = wallHit.distance;
    drawLaser(origin, direction, len, pelletHit, false, game.primaryWeapon);
    pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: len, hit: pelletHit });
    if (pelletHit) { anyHit = true; anyHeadshot ||= pelletHS; totalDamage += pelletDmg; bestLength = Math.min(bestLength, len); hitDamages.set(playerHitResult.index, (hitDamages.get(playerHitResult.index) || 0) + pelletDmg); hitHeadshots.set(playerHitResult.index, Boolean(hitHeadshots.get(playerHitResult.index) || pelletHS)); }
  }
  const damages = [...hitDamages.entries()].map(([target, damage]) => ({ target, damage, headshot: Boolean(hitHeadshots.get(target)) }));
  for (const entry of damages) {
    const target = fps.players[entry.target];
    const wasAlive = target.health > 0;
    target.health = Math.max(0, target.health - entry.damage);
    showDamageDealt(entry.damage, target.pos.clone().add(new THREE.Vector3(0, entry.headshot ? 1.85 : 1.3, 0)), entry.headshot);
    if (wasAlive && target.health === 0 && entry.target !== game.localIndex) {
      showEliminationNotice(entry.target);
    }
  }
  if (anyHit) { showHitMarker(anyHeadshot); updateHud(); }
  send({ type: "fpsShot", player: game.localIndex, ox: origin.x, oy: origin.y, oz: origin.z, dx: firstDirection.x, dy: firstDirection.y, dz: firstDirection.z, hit: anyHit, length: bestLength, damage: damages[0]?.damage || totalDamage, target: anyHit ? hitTarget : null, damages, headshot: anyHeadshot, weapon: game.primaryWeapon, pellets: pelletCount > 1 ? pellets : null });
  if (anyHit && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
}
function isPointInsideProjectileBlocker(point, radius = 0.18) {
  const box = new THREE.Box3();
  for (const obstacle of world.obstacles) {
    box.setFromObject(obstacle);
    if (box.distanceToPoint(point) < radius) return true;
  }
  return false;
}
function firstPersonProjectileOrigin(direction) {
  const camPos = camera.position.clone();
  const flatDir = directionFromAngles(input.yaw, 0);
  const right = new THREE.Vector3().crossVectors(flatDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const visualMuzzle = camPos.clone()
    .addScaledVector(direction, 0.55)
    .addScaledVector(right, 0.14)
    .addScaledVector(up, -0.12);

  if (!isPointInsideProjectileBlocker(visualMuzzle)) return visualMuzzle;

  for (const distance of [0.22, 0.36, 0.5, 0.68]) {
    const fallback = camPos.clone().addScaledVector(direction, distance);
    if (!isPointInsideProjectileBlocker(fallback, 0.12)) return fallback;
  }
  return camPos.clone().addScaledVector(direction, 0.16);
}
function fireProjectileWeapon(cfg) {
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : 0.85; game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(cfg.projectile === "rocket" ? "rocket" : "grenade"); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload();
  const shooter = fps.players[game.localIndex];
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const origin = firstPersonProjectileOrigin(dir);
  if (cfg.projectile === "rocket") {
    const vel = dir.clone().multiplyScalar(58).add(shooter.vel.clone().multiplyScalar(0.25));
    spawnGrenade(origin, vel, true, game.localIndex, { kind: "rocket", timer: 4, gravity: 0, damageMultiplier: 1.14, radiusMultiplier: 0.85 });
    send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, kind: "rocket", timer: 4, gravity: 0, damageMultiplier: 1.14, radiusMultiplier: 0.85 });
  } else {
    const vel = dir.clone().multiplyScalar(54).add(shooter.vel);
    spawnGrenade(origin, vel, true, game.localIndex, { kind: "grenadeLauncher", timer: 1.65, gravity: GRENADE_GRAVITY * 0.82, damageMultiplier: 0.86, radiusMultiplier: 0.82 });
    send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, kind: "grenadeLauncher", timer: 1.65, gravity: GRENADE_GRAVITY * 0.82, damageMultiplier: 0.86, radiusMultiplier: 0.82 });
  }
  updateHud();
}
function fireMelee() {
  if (game.radarTimer > 0) return;
  const now = performance.now(); if (now - game.lastShotAt < 250) return; game.lastShotAt = now; game.meleeSwingTimer = 0.25; playSound("melee");
  const s = fps.players[game.localIndex], origin = new THREE.Vector3(s.pos.x, s.pos.y + (s.currentCamHeight || 0.72), s.pos.z), dir = directionFromAngles(input.yaw, input.pitch).normalize();
  drawMeleeSwipe(origin, dir);
  let hit = false, hs = false, targetIndex = null, targetDist = Infinity;
  for (const { player: opp, index } of opposingFpsPlayers()) {
    const hC = opp.pos.clone().add(new THREE.Vector3(0, 1.58, 0)), bC = opp.pos.clone().add(new THREE.Vector3(0, 0.65, 0)), dH = origin.distanceTo(hC), dB = origin.distanceTo(bC);
    if (dH < targetDist && dH < 2.6 && dir.dot(hC.clone().sub(origin).normalize()) > 0.72) { hit = true; hs = true; targetIndex = index; targetDist = dH; }
    else if (dB < targetDist && dB < 2.6 && dir.dot(bC.clone().sub(origin).normalize()) > 0.7) { hit = true; hs = false; targetIndex = index; targetDist = dB; }
  }
  const dmg = hit ? (hs ? 100 : 50) : 0; if (hit) { const opp = fps.players[targetIndex]; const wasAlive = opp.health > 0; opp.health = Math.max(0, opp.health - dmg); showDamageDealt(dmg, opp.pos.clone().add(new THREE.Vector3(0, hs ? 1.58 : 0.65, 0)), hs); showHitMarker(hs); if (wasAlive && opp.health === 0 && targetIndex !== game.localIndex) { showEliminationNotice(targetIndex); } }
  send({ type: "fpsShot", player: game.localIndex, ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, hit, damage: dmg, target: hit ? targetIndex : null, isMelee: true, headshot: hs }); if (hit && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
}
function rayHitsSphere(origin, direction, sphereCenter, radius) { const toCenter = sphereCenter.clone().sub(origin), projected = toCenter.dot(direction); if (projected < 0) return null; const closest = origin.clone().addScaledVector(direction, projected); return closest.distanceTo(sphereCenter) < radius ? projected : null; }
function rayHitsPlayer(origin, direction, player) { const hC = player.pos.clone().add(new THREE.Vector3(0, 1.58, 0)), hD = rayHitsSphere(origin, direction, hC, FPS_HEAD_HIT_RADIUS), bC = player.pos.clone().add(new THREE.Vector3(0, 0.65, 0)), bD = rayHitsSphere(origin, direction, bC, FPS_BODY_HIT_RADIUS); if (hD !== null && (bD === null || hD < bD)) return { distance: hD, headshot: true }; if (bD !== null) return { distance: bD, headshot: false }; return null; }
function drawLaser(origin, direction, length, hit, isRemote = false, weaponType = "pistol") {
  const start = new THREE.Vector3();
  if (!isRemote && world.weaponTip) {
    world.weaponTip.getWorldPosition(start);
    if (isPointInsideProjectileBlocker(start, 0.12)) {
      start.copy(firstPersonProjectileOrigin(direction));
    }
  } else {
    start.copy(origin);
  }
  const end = origin.clone().addScaledVector(direction.clone().normalize(), length), mid = start.clone().add(end).multiplyScalar(0.5), isSniper = weaponType === "sniper";
  const isSperm = weaponType === "spermShooter" || weaponType === "heavySpermShooter" || weaponType === "heaviestSpermShooter";
  const r = (isSniper || weaponType === "heavySniper") ? (hit ? 0.07 : 0.052) : (hit ? 0.034 : 0.024), ttl = FPS_LASER_TTL, geometry = new THREE.CylinderGeometry(r, r, start.distanceTo(end), 8, 1, true);
  const material = new THREE.MeshBasicMaterial({ color: hit ? 0xff3366 : (isSniper ? 0xfff0a6 : (isSperm ? 0xfff9e6 : 0x4df3ff)), transparent: true, opacity: isSniper ? 0.96 : (hit ? 0.9 : 0.78), blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(geometry, material); beam.position.copy(mid); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(r * 3.2, r * 3.2, start.distanceTo(end), 10, 1, true), new THREE.MeshBasicMaterial({ color: material.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.copy(mid); glow.quaternion.copy(beam.quaternion);
  const group = new THREE.Group(); group.add(glow, beam); world.arenaRoot.add(group); world.lasers.push({ beam: group, ttl, maxTtl: ttl });
}
function drawMeleeSwipe(origin, direction) {
  const swipeGroup = new THREE.Group(), right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, direction).normalize(), radius = 1.8, segments = 6, points = [];
  for (let i = 0; i <= segments; i++) { const theta = -Math.PI / 3 + (i / segments) * (2 * Math.PI / 3); points.push(origin.clone().add(right.clone().multiplyScalar(Math.sin(theta) * radius)).add(direction.clone().multiplyScalar(Math.cos(theta) * radius)).add(up.clone().multiplyScalar(Math.sin(theta * 0.5) * 0.35))); }
  for (let i = 0; i < points.length - 1; i++) { const p1 = points[i], p2 = points[i + 1], mid = p1.clone().add(p2).multiplyScalar(0.5); const geom = new THREE.CylinderGeometry(0.04, 0.04, p1.distanceTo(p2), 6); const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }); const mesh = new THREE.Mesh(geom, mat); mesh.position.copy(mid); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize()); swipeGroup.add(mesh); }
  world.arenaRoot.add(swipeGroup); world.lasers.push({ beam: swipeGroup, ttl: 0.15, maxTtl: 0.15, isSwipe: true });
}
function updateLasers(dt) { for (let i = world.lasers.length - 1; i >= 0; i--) { const l = world.lasers[i]; l.ttl -= dt; const opacity = Math.max(0, l.ttl / l.maxTtl); if (l.beam.isGroup) l.beam.children.forEach(c => { if (c.material) c.material.opacity = opacity; }); else l.beam.material.opacity = opacity; if (l.ttl <= 0) { world.arenaRoot.remove(l.beam); world.lasers.splice(i, 1); } } }
function showHitMarker(hs = false) { hitMarker.classList.toggle("headshot", hs); hitMarker.classList.remove("active"); void hitMarker.offsetWidth; hitMarker.classList.add("active"); playSound("hit"); clearTimeout(hitMarkerTimeout); hitMarkerTimeout = window.setTimeout(() => hitMarker.classList.remove("active", "headshot"), hs ? 190 : 145); }
function showDamageDealt(amt, worldPos, hs = false) { const pop = document.createElement("div"); pop.className = "damage-pop" + (hs ? " headshot" : ""); pop.textContent = hs ? `HEADSHOT -${amt}` : `-${amt}`; damageLayer.appendChild(pop); activeDamagePops.push({ element: pop, pos: worldPos.clone(), timer: 0.84, maxTimer: 0.84, headshot: hs }); }
function updateDamagePops(dt) { for (let i = activeDamagePops.length - 1; i >= 0; i--) { const p = activeDamagePops[i]; p.timer -= dt; if (p.timer <= 0) { p.element.remove(); activeDamagePops.splice(i, 1); } else { const off = p.pos.clone().add(new THREE.Vector3(0, (1.0 - p.timer / p.maxTimer) * 0.8, 0)), screen = toScreen(off); p.element.style.left = `${screen.x}px`; p.element.style.top = `${screen.y}px`; p.element.style.opacity = `${p.timer / p.maxTimer}`; p.element.style.transform = `translate(-50%, -50%) scale(${(p.headshot ? 1.2 : 1.0) + (1.0 - p.timer / p.maxTimer) * 0.35})`; } } }
function thirdPersonWeaponScale(weaponId) {
  const cfg = weaponConfig(weaponId);
  if (weaponId === "melee") return 0.58;
  return 0.78 * (cfg.scale || 1);
}

function syncThirdPersonWeaponMesh(group, weaponId) {
  if (!group || !weaponId) return;
  if (group.userData.weaponId !== weaponId) {
    const wasVisible = group.visible;
    rebuildWeaponMesh(weaponId, group);
    group.userData.weaponId = weaponId;
    group.visible = wasVisible;
  }

  if (weaponId === "melee") {
    group.position.set(0.05, 0.08, -0.16);
    group.rotation.set(0.35, -0.25, -0.5);
  } else {
    group.position.set(0.32, -0.08, -0.3);
    group.rotation.set(0.05, -0.1, 0.08);
  }
  group.scale.setScalar(thirdPersonWeaponScale(weaponId));
}

function updatePlayerMeshes() {
  const isRadarActive = game.radarTimer > 0;
  for (let i = 0; i < world.playerMeshes.length; i++) {
    const mesh = world.playerMeshes[i], player = fps.players[i];
    mesh.position.copy(player.pos);
    mesh.rotation.y = -player.yaw;

    const head = mesh.getObjectByName("headGroup");
    if (head) {
      head.rotation.x = player.pitch;
      const g = head.getObjectByName("gun"), m = mesh.getObjectByName("melee");
      if (g && m) {
        syncThirdPersonWeaponMesh(g, player.primaryWeapon || "pistol");
        syncThirdPersonWeaponMesh(m, "melee");
        g.visible = player.weapon === "gun";
        m.visible = player.weapon === "melee";
      }
    }

    mesh.visible = player.health > 0 && (game.phase === "fps" ? i !== game.localIndex : (game.phase === "fpsVictoryLap" ? (i === game.result.winner && i !== game.localIndex) : false));

    // Wallhack uses per-mesh cloned materials so shared player materials are never left hidden/mutated.
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.userData.baseMaterial) {
        child.userData.baseMaterial = child.material;
        child.userData.baseRenderOrder = child.renderOrder || 0;
      }
      if (isRadarActive && mesh.visible) {
        if (!child.userData.wallhackMaterial) {
          const cloned = child.userData.baseMaterial.clone();
          cloned.depthTest = false;
          cloned.depthWrite = false;
          cloned.transparent = cloned.transparent || false;
          child.userData.wallhackMaterial = cloned;
        }
        child.material = child.userData.wallhackMaterial;
        child.renderOrder = 9999;
      } else {
        child.material = child.userData.baseMaterial;
        child.renderOrder = child.userData.baseRenderOrder || 0;
      }
    });
  }
}
function showFpsToast(text, detail = "") {
  document.getElementById("victoryBanner")?.remove();
  const banner = document.createElement("div");
  banner.className = "victory-banner";
  banner.id = "victoryBanner";
  banner.textContent = detail ? `${text} · ${detail}` : text;
  overlay.appendChild(banner);
}
function startVictoryLap(winner, reason, announce = true, alreadyRecorded = false) {
  if (game.phase === "result" || game.phase === "fpsVictoryLap") return;
  let mapOver = false, matchOver = reason === "strokes"; if (reason === "deathmatch" && !alreadyRecorded) { game.fpsKillWins[winner]++; mapOver = game.fpsKillWins[winner] >= FPS_KILLS_TO_WIN_MAP || game.fpsKillWins.reduce((sum, wins) => sum + wins, 0) >= Math.max(3, game.playerCount); if (mapOver) { game.fpsMapWins[winner]++; matchOver = game.fpsMapWins[winner] >= 2; game.fpsMatchOver = matchOver; } } else if (reason === "deathmatch") { mapOver = game.fpsKillWins[winner] >= FPS_KILLS_TO_WIN_MAP || game.fpsKillWins.reduce((sum, wins) => sum + wins, 0) >= Math.max(3, game.playerCount); matchOver = game.fpsMatchOver; }
  game.phase = "fpsVictoryLap"; game.result = { winner, reason, mapOver, matchOver }; game.fpsRoundWinner = winner; game.victoryLapStart = performance.now(); radarMarker.classList.add("hidden"); if (winner !== game.localIndex) { damageVignette.classList.remove("active"); activeDamagePops.forEach(p => p.element.remove()); activeDamagePops.length = 0; }
  if (game.randomTournament && mapOver && !matchOver && announce) { applyRandomTournamentCombination(game.fpsMapIndex); }
  showFpsToast((reason === "deathmatch" && !matchOver) ? (mapOver ? (winner === game.localIndex ? "MAP WON" : "MAP LOST") : (winner === game.localIndex ? "ROUND WON" : "ROUND LOST")) : (winner === game.localIndex ? "YOU WIN" : "YOU LOSE"));
  if (announce) send({ type: "matchResult", winner, reason, fpsState: serializeFpsDuelState() }); updateHud();
}
function activateRadar() {
  if (game.phase !== "fps" || game.countdown > 0) return;
  if (!abilityAllowed("radar")) return;
  
  if (game.radarTimer > 0) {
    game.radarTimer = 0;
    game.radarCooldown = abilityCooldown("radar", RADAR_COOLDOWN);
    updateRadarMarker();
    updateHud();
    return;
  }
  
  if (game.radarCooldown > 0) return;
  
  game.radarTimer = RADAR_DURATION;
  updateRadarMarker();
  updateHud();
}
function updateRadarMarker() { if (game.radarTimer <= 0 || (game.phase !== "fps" && game.phase !== "fpsVictoryLap")) { radarMarker.classList.add("hidden"); return; } const enemy = opposingFpsPlayers().sort((a, b) => a.player.pos.distanceTo(fps.players[game.localIndex].pos) - b.player.pos.distanceTo(fps.players[game.localIndex].pos))[0]?.player; if (!enemy) return; const s = toScreen(enemy.pos.clone().add(new THREE.Vector3(0, 1.15, 0))); radarMarker.style.left = `${Math.max(38, Math.min(window.innerWidth - 38, s.x))}px`; radarMarker.style.top = `${Math.max(38, Math.min(window.innerHeight - 38, s.y))}px`; radarMarker.classList.remove("hidden"); }
function finishMatch(winner, reason) {
  if (game.phase === "result") return;
  game.phase = "result";
  game.result = { winner, reason };
  document.exitPointerLock?.();
  const totals = totalStrokes();
  input.shootHeld = false;
  input.aiming = false;
  damageLayer.replaceChildren();
  damageVignette.classList.remove("active");
  killNotice.classList.add("hidden");
  radarMarker.classList.add("hidden");
  world.weapon.visible = false;
  world.meleeWeapon.visible = false;
  world.playerMeshes.forEach((mesh) => { mesh.visible = false; });
  power.classList.add("hidden");
  restartBtn.classList.toggle("hidden", game.role === "guest");
  resultPanel.classList.remove("win-result", "lose-result", "tie-result", "fps-result");
  if (winner === -1) {
    resultTitle.textContent = "It's a Tie!";
    resultPanel.classList.add("tie-result");
  } else {
    const localWon = winner === game.localIndex;
    resultTitle.textContent = localWon ? "You win" : "You lose";
    resultPanel.classList.add(localWon ? "win-result" : "lose-result");
  }
  resultBody.textContent = reason === "deathmatch" ? `Arena score: ${formatScores(game.fpsMapWins)}. Golf scorecard: ${formatScores(totals)}.` : `Golf scorecard: ${formatScores(totals)}.`;
  if (reason === "deathmatch") {
    overlay.classList.add("fps");
    resultPanel.classList.remove("hidden");
    showFpsToast(winner === game.localIndex ? "YOU WIN" : "YOU LOSE", `Maps ${formatScores(game.fpsMapWins)}`);
  } else {
    overlay.classList.remove("fps");
    document.getElementById("victoryBanner")?.remove();
    resultPanel.classList.remove("hidden");
  }
  updateHud();
}
function restartTournament(announce = true) { if (announce && game.role === "guest") return; resultPanel.classList.add("hidden"); if (announce) { send({ type: "restart" }); showLobby(); } else showLobby(); }
function updateHud() {
  const totals = totalStrokes(), isFps = game.phase === "fps" || game.phase === "fpsVictoryLap";
  holeLabel.textContent = isFps ? "Arena" : "Hole";
  turnLabel.textContent = isFps ? "Rounds" : "Turn";
  strokeLabel.textContent = isFps ? "Maps" : "Strokes";
  holeText.textContent = isFps ? `D${game.fpsMapIndex + 1}` : `${game.holeIndex + 1}`; turnText.textContent = isFps ? formatScores(game.fpsKillWins) : (game.role === "solo" ? "Solo" : `P${game.localIndex + 1}`); strokeText.textContent = isFps ? formatScores(game.fpsMapWins) : (game.role === "solo" ? `${totals[0]}` : formatScores(totals));
  healthChip.classList.toggle("hidden", !isFps); healthText.textContent = `${Math.ceil(fps.players[game.localIndex].health)}`; abilityContainer.classList.toggle("hidden", !isFps);
  if (isFps) {
    for (const [name, id] of [["jump", "#jumpAbility"], ["heal", "#healAbility"], ["radar", "#radarAbility"], ["grenade", "#grenadeAbility"], ["jetpack", "#jetpackAbility"]]) {
      const el = document.querySelector(id);
      if (el) {
        el.classList.toggle("disabled", !abilityAllowed(name));
        el.classList.toggle("hidden", !abilityAllowed(name));
        const hint = el.querySelector(".key-hint");
        if (hint) {
          const rawKey = getAbilityKey(name);
          hint.textContent = rawKey.startsWith("Key") ? rawKey.substring(3) : rawKey;
        }
      }
    }
    jumpOverlay.style.height = `${Math.max(0, game.jumpCooldown / abilityCooldown("jump", 3.0)) * 100}%`; jumpCDText.textContent = abilityAllowed("jump") && game.jumpCooldown > 0 ? Math.ceil(game.jumpCooldown) : "";
    healOverlay.style.height = `${Math.max(0, game.healCooldown / abilityCooldown("heal", 10.0)) * 100}%`; healCDText.textContent = abilityAllowed("heal") && game.healCooldown > 0 ? Math.ceil(game.healCooldown) : "";
    radarOverlay.style.height = `${Math.max(0, game.radarCooldown / abilityCooldown("radar", RADAR_COOLDOWN)) * 100}%`; radarCDText.textContent = abilityAllowed("radar") && game.radarCooldown > 0 ? Math.ceil(game.radarCooldown) : "";
    grenadeOverlay.style.height = `${Math.max(0, game.grenadeCooldown / abilityCooldown("grenade", GRENADE_COOLDOWN)) * 100}%`; grenadeCDText.textContent = abilityAllowed("grenade") && game.grenadeCooldown > 0 ? Math.ceil(game.grenadeCooldown) : "";
    if (jetpackOverlay) jetpackOverlay.style.height = "0%";
    if (jetpackCDText) jetpackCDText.textContent = "";
  }
  weaponChip.classList.toggle("hidden", !isFps); weaponText.textContent = (game.activeWeapon === "gun" ? weaponLabelText(game.primaryWeapon) : "Club");
  ammoChip.classList.toggle("hidden", !isFps || game.activeWeapon !== "gun"); if (game.activeWeapon === "gun") ammoText.textContent = game.reloading ? "RELOAD" : `${game.ammo[game.primaryWeapon]} / ${weaponMaxAmmo(game.primaryWeapon)}`; if (game.phase === "golf") power.classList.remove("hidden");
  const progress = document.getElementById("reloadProgress");
  if (progress && !game.reloading) progress.classList.add("hidden");
}
function switchWeapon(wt) { if (game.radarTimer > 0) return; if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0 || game.randomTournament) return; requestWeaponSwap(wt, game.primaryWeapon); }
function selectPrimaryWeapon(wp, animate = false) { if (game.radarTimer > 0) return; if (game.randomTournament || !activeWeaponIds().includes(wp)) return; if (animate && game.countdown <= 0) requestWeaponSwap("gun", wp); else applyWeaponState("gun", wp); }
function cycleWeaponCard(dir) { if (game.radarTimer > 0) return; if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; if (game.randomTournament) return; const ws = activeWeaponIds(), nI = (ws.indexOf(game.primaryWeapon) + dir + ws.length) % ws.length; pickWeaponCard(ws[nI], game.countdown <= 0); }
function pickWeaponCard(wp, animate = false) { if (game.radarTimer > 0) return; if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; weaponCards.forEach(c => c.classList.toggle("active", c.getAttribute("data-weapon") === wp)); selectPrimaryWeapon(wp, animate); }
function normalWeaponChoices() { return [...activeWeaponIds().map((primary) => ({ active: "gun", primary })), { active: "melee", primary: activeWeaponIds()[0] || "pistol" }]; }
function applyRandomTournamentCombination(excludeMapIndex = -1) {
  if (!game.randomTournamentPlayedMaps) {
    game.randomTournamentPlayedMaps = [];
  }
  let choices = tournamentCombinations.filter(c => {
    const mapId = c.map.split("/").pop().replace(".json", "");
    const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
    if (excludeMapIndex !== -1 && mapIndex === excludeMapIndex) return false;
    return !game.randomTournamentPlayedMaps.includes(c.map);
  });
  if (choices.length === 0) {
    game.randomTournamentPlayedMaps = [];
    choices = tournamentCombinations.filter(c => {
      const mapId = c.map.split("/").pop().replace(".json", "");
      const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
      return excludeMapIndex === -1 || mapIndex !== excludeMapIndex;
    });
    if (choices.length === 0) choices = tournamentCombinations;
  }
  const combo = choices[Math.floor(Math.random() * choices.length)];
  if (!combo) return;
  if (!game.randomTournamentPlayedMaps.includes(combo.map)) {
    game.randomTournamentPlayedMaps.push(combo.map);
  }
  const mapId = combo.map.split("/").pop().replace(".json", "");
  const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
  game.fpsMapIndex = mapIndex !== -1 ? mapIndex : 0;
  
  game.randomLoadout = {
    id: combo.id,
    hp: combo.hp ?? 100,
    speed: combo.speed ?? 1.0,
    abilities: combo.abilities || ["jump", "heal", "grenade", "radar"],
    weapons: combo.weapons || ["pistol"],
    abilityKeys: combo.abilityKeys || {},
    cooldowns: combo.cooldowns || {}
  };
  game.randomWeapon = game.randomLoadout.weapons[0] || "pistol";
  game.maxHealth = game.randomLoadout.hp;
}
function cycleActiveWeapon(dir) {
  if (game.radarTimer > 0) return;
  if (game.randomTournament) {
    if (game.randomLoadout && game.randomLoadout.weapons && game.randomLoadout.weapons.length > 1) {
      const weapons = game.randomLoadout.weapons;
      const currentWeaponId = game.activeWeapon === "melee" ? "melee" : game.primaryWeapon;
      const currentIdx = weapons.indexOf(currentWeaponId);
      if (currentIdx !== -1) {
        const nextIdx = (currentIdx + dir + weapons.length) % weapons.length;
        const nextWeapon = weapons[nextIdx];
        if (nextWeapon === "melee") {
          requestWeaponSwap("melee", game.primaryWeapon);
        } else {
          requestWeaponSwap("gun", nextWeapon);
        }
      }
    }
    return;
  }
  const choices = normalWeaponChoices();
  const cI = game.activeWeapon === "melee" ? choices.length - 1 : Math.max(0, choices.findIndex(i => i.active === "gun" && i.primary === game.primaryWeapon));
  const n = choices[(cI + dir + choices.length) % choices.length];
  if (n.active === "melee") switchWeapon("melee");
  else pickWeaponCard(n.primary, true);
}
function requestWeaponSwap(aw, pw = game.primaryWeapon) {
  if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0) return;
  if (game.randomTournament) {
    if (!game.randomLoadout || !game.randomLoadout.weapons) return;
    const targetWeapon = aw === "melee" ? "melee" : pw;
    if (!game.randomLoadout.weapons.includes(targetWeapon)) return;
  } else {
    if (aw !== "melee" && !standardWeaponIds.includes(pw)) return;
  }
  game.pendingActiveWeapon = aw;
  game.pendingPrimaryWeapon = pw;
  game.weaponSwapTimer = WEAPON_SWAP_DURATION;
  game.weaponSwapCommitted = false;
  game.inspectTimer = 0;
  input.aiming = false;
  updateHud();
}
function updateWeaponSwap(dt) { if (game.weaponSwapTimer <= 0) return; game.weaponSwapTimer = Math.max(0, game.weaponSwapTimer - dt); if (!game.weaponSwapCommitted && game.weaponSwapTimer <= WEAPON_SWAP_DURATION * 0.5) { applyWeaponState(game.pendingActiveWeapon, game.pendingPrimaryWeapon); game.weaponSwapCommitted = true; } }
function cancelReload() {
  if (!game.reloading) return;
  game.reloading = false;
  game.reloadTimer = 0;
  game.reloadWeapon = null;
  document.getElementById("reloadProgress")?.classList.add("hidden");
}

function applyWeaponState(aw, pw = game.primaryWeapon) {
  if (game.randomTournament) {
    if (game.randomLoadout && game.randomLoadout.weapons) {
      const allowed = game.randomLoadout.weapons;
      if (aw === "melee") {
        if (!allowed.includes("melee")) {
          aw = "gun";
          pw = allowed.find(w => w !== "melee") || "pistol";
        }
      } else {
        if (!allowed.includes(pw)) {
          pw = allowed.find(w => w !== "melee") || "pistol";
        }
      }
    } else {
      if (isRandomMeleeWeapon()) { aw = "melee"; pw = "pistol"; }
      else { aw = "gun"; pw = game.randomWeapon; }
    }
  } else {
    if (aw !== "melee" && !standardWeaponIds.includes(pw)) pw = "pistol";
  }
  const changed = game.primaryWeapon !== pw || game.activeWeapon !== aw;
  game.activeWeapon = aw;
  game.primaryWeapon = pw;
  fps.players[game.localIndex].weapon = aw;
  fps.players[game.localIndex].primaryWeapon = pw;
  weaponCards.forEach(c => c.classList.toggle("active", aw === "gun" && c.getAttribute("data-weapon") === pw));
  if (changed) cancelReload();
  if (aw === "melee") cancelReload();
  if (changed) {
    syncPrimaryWeaponModel();
    send({ type: "fpsWeaponChoice", player: game.localIndex, weapon: pw });
  }
  updateHud();
}
function syncPrimaryWeaponModel() {
  rebuildWeaponMesh(game.primaryWeapon, world.weapon);
  rebuildWeaponMesh("melee", world.meleeWeapon);
}
function setWeaponPalette() {}
function startReload() { if (game.phase !== "fps" || game.reloading || game.activeWeapon !== "gun" || game.radarTimer > 0) return; const cfg = weaponConfig(); if (game.ammo[game.primaryWeapon] === cfg.ammo) return; game.reloading = true; game.reloadTimer = cfg.reload; game.reloadWeapon = game.primaryWeapon; updateHud(); }
function resetFpsDuelState(randomTournament = false) {
  ensureFpsPlayers(game.playerCount);
  game.fpsMapWins = Array(game.playerCount).fill(0);
  game.fpsKillWins = Array(game.playerCount).fill(0);
  game.fpsMatchOver = false;
  game.randomTournament = randomTournament;
  game.fpsMode = randomTournament ? "randomTournament" : "standard";
  if (randomTournament) {
    game.randomTournamentPlayedMaps = [];
    applyRandomTournamentCombination();
  } else {
    game.fpsMapIndex = chooseRandomFpsMap();
    game.randomWeapon = "pistol";
    game.randomLoadout = null;
    game.maxHealth = 100;
  }
}
function serializeFpsDuelState() { return { playerCount: game.playerCount, mapIndex: game.fpsMapIndex, mapWins: game.fpsMapWins, killWins: game.fpsKillWins, matchOver: game.fpsMatchOver, randomTournament: game.randomTournament, randomTournamentPlayedMaps: game.randomTournamentPlayedMaps, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout, customMap: game.fpsCustomMap, importedAssetUrl: game.fpsImportedAssetUrl }; }
function applyFpsDuelState(s) { if (!s) return; game.playerCount = Math.max(2, s.playerCount || s.mapWins?.length || s.killWins?.length || game.playerCount); ensureFpsPlayers(game.playerCount); game.fpsMapIndex = s.mapIndex; game.fpsMapWins = s.mapWins || game.fpsMapWins; game.fpsKillWins = s.killWins || game.fpsKillWins; game.fpsMatchOver = s.matchOver; game.randomTournament = Boolean(s.randomTournament); if (s.randomTournamentPlayedMaps !== undefined) game.randomTournamentPlayedMaps = s.randomTournamentPlayedMaps; if (s.randomWeapon) game.randomWeapon = s.randomWeapon; game.randomLoadout = s.randomLoadout || null; game.maxHealth = game.randomLoadout?.hp || 100; if (s.customMap !== undefined) game.fpsCustomMap = s.customMap; if (s.importedAssetUrl !== undefined) game.fpsImportedAssetUrl = s.importedAssetUrl; updateHud(); }
function applyRemoteFpsState(r, s) { if (!r.targetPos) r.targetPos = new THREE.Vector3(); const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]; const spawn = getArenaSpawnPoints(theme)[s.player] || { x: s.x ?? 0, z: s.z ?? 0 }; const x = Number.isFinite(s.x) ? s.x : spawn.x; const z = Number.isFinite(s.z) ? s.z : spawn.z; const y = Number.isFinite(s.y) ? s.y : getSpawnY({ x, z }, theme); r.targetPos.set(x, y, z); if (r.targetPos.y < -8) { r.targetPos.set(spawn.x, getSpawnY(spawn, theme), spawn.z); } if (!isPointInsideArena(r.targetPos, world.arenaFloors, 0.5)) clampArenaPosition(r.targetPos, 0.5); r.targetYaw = s.yaw; r.targetPitch = s.pitch; }
function resetNetworkMotion() {}
function continueFpsDuel() {
  document.getElementById("victoryBanner")?.remove();
  if (game.role !== "guest") {
    if (game.result?.mapOver) {
      if (!game.randomTournament) {
        game.fpsMapIndex = chooseRandomFpsMap(game.fpsMapIndex);
      }
      game.fpsKillWins = Array(game.playerCount).fill(0);
    }
    if (game.role === "host") {
      send({ type: "phaseFps", fpsState: serializeFpsDuelState() });
    }
    enterFps(false, {
      preserveFpsMatch: true,
      staticMock: game.fpsMockStatic,
      randomTournament: game.randomTournament,
      randomWeapon: game.randomWeapon,
      randomLoadout: game.randomLoadout
    });
  }
}

function onMouseMove(e) { if (!input.pointerLocked) return; const sensitivity = input.mouseSensitivity * (input.aiming ? aimingSensitivityMultiplier() : 1); input.yaw += e.movementX * sensitivity; input.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, input.pitch - e.movementY * sensitivity)); }
function onMouseDown(e) { if (game.phase === "fps" || game.phase === "fpsVictoryLap") { if (e.button === 2) input.aiming = true; if (e.button === 0) { input.shootHeld = true; if (game.countdown <= 0 && game.activeWeapon === "gun") fireHitscan(); if (game.activeWeapon === "melee") fireMelee(); updateHud(); } } }
function onMouseUp(e) { if (e.button === 2) input.aiming = false; if (e.button === 0) input.shootHeld = false; }
function onClick(e) { if (game.phase === "fps" && e.target === canvas && !input.pointerLocked) requestPointerLockSafe(); }
function pointerGroundPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.53), point) ? point : null;
}
function updateGolfDragAim(e) {
  const dx = e.clientX - game.dragStart.x;
  
  if (canControlGolf()) {
    const ballScreen = toScreen(world.ball.position.clone().setY(golfBallSurfaceY()));
    const belowBall = e.clientY - ballScreen.y;
    if (belowBall > 0) {
      const maxDragDist = Math.max(70, Math.min(window.innerWidth, window.innerHeight) * 0.16);
      game.aimPower = Math.max(0, Math.min(1, belowBall / maxDragDist));
      powerFill.style.width = `${game.aimPower * 100}%`;
    }
  }
  
  const sensitivity = 0.004; // Precise, comfortable rotation sensitivity
  game.aimAngle = game.dragStart.angle + dx * sensitivity;
  
  // Update shot direction vector
  game.golfShotDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle));
}
function onPointerDown(e) {
  if (game.phase === "golf" && e.button !== 2) {
    settingsBtn.classList.add("hidden");
    settingsPanel.classList.add("hidden");
    game.dragging = true;
    game.dragStart.x = e.clientX;
    game.dragStart.y = e.clientY;
    game.dragStart.angle = game.aimAngle;
    updateGolfDragAim(e);
  }
}
function onPointerMove(e) { if (game.phase === "golf" && game.dragging) updateGolfDragAim(e); }
function finishGolfDrag() {
  if (game.phase === "golf" && game.dragging && canControlGolf()) {
    if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true);
    game.aimPower = 0;
    input.golfChargeDir = 1;
    powerFill.style.width = "0%";
    if (world.golfAimArrow) world.golfAimArrow.visible = false;
    shotArrow.classList.add("hidden");
  }
  game.dragging = false;
}
function requestPointerLockSafe() {
  if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  try {
    const lockRequest = canvas.requestPointerLock();
    lockRequest?.catch?.(() => {});
  } catch {}
}
function syncSensitivity(v) { const m = Number(v); input.mouseSensitivity = FPS_BASE_MOUSE_SENSITIVITY * m; sensitivityInput.value = m; if (menuSensitivityInput) menuSensitivityInput.value = m; const l = `${m.toFixed(1)}x`; sensitivityValue.textContent = l; if (menuSensitivityValue) menuSensitivityValue.textContent = l; }
function codeFromKeyEvent(e) { if (e.code) return e.code; const k = e.key || ""; if (k === " ") return "Space"; if (k.startsWith("Arrow")) return k; if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`; if (/^[0-9]$/.test(k)) return `Digit${k}`; return k; }
function toggleBuildMode() { game.buildMode = !game.buildMode; lobbyStatus.textContent = game.buildMode ? "Build mode on. Press V to place a block." : lobbyStatus.textContent; }
function placeBuildBox() {
  if (!game.buildMode || game.phase !== "fps") return;
  const p = fps.players[game.localIndex], dir = directionFromAngles(p.yaw, p.pitch), pos = p.pos.clone().add(dir.multiplyScalar(7));
  pos.y = 0;
  clampArenaPosition(pos, 1.6);
  game.fpsCustomMap ||= { version: 1, boxes: [] };
  game.fpsCustomMap.boxes.push({ x: Number(pos.x.toFixed(2)), y: 0, z: Number(pos.z.toFixed(2)), sx: 4, sy: 2.5, sz: 4, color: 0x5ab0ff, isPlatform: true });
  mapJsonInput && (mapJsonInput.value = JSON.stringify(game.fpsCustomMap, null, 2));
  setupArena();
}

function animate(now = performance.now()) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000 || clock.getDelta()); lastFrame = now;
  if (game.phase === "golf") updateGolf(dt); if (game.phase === "fps") { if (input.shootHeld && game.activeWeapon === "gun") fireHitscan(); updateFps(dt, now); }
  if (game.phase === "fpsVictoryLap") {
    updateFps(dt, now); const elapsed = (now - game.victoryLapStart) / 1000, target = fps.players[game.result.winner], isW = game.localIndex === game.result.winner;
    if (!isW) {
      const dir = directionFromAngles(target.yaw, target.pitch);
      camera.position.set(
        target.pos.x + dir.x * 0.28,
        target.pos.y + (target.currentCamHeight || 0.72) + dir.y * 0.28,
        target.pos.z + dir.z * 0.28
      );
      camera.lookAt(camera.position.clone().add(dir));
      world.weapon.visible = world.meleeWeapon.visible = false;
    }
    const m = world.playerMeshes[game.result.winner]; if (m) { const g = m.getObjectByName("gun"), ml = m.getObjectByName("melee"); if (g && ml) { g.visible = (target.weapon === "gun"); ml.visible = (target.weapon === "melee"); } }
    if (elapsed >= 3.2) { if (game.result.reason === "deathmatch" && !game.result.matchOver) continueFpsDuel(); else finishMatch(game.result.winner, game.result.reason); }
  }
  renderer.render(scene, camera); requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  const c = codeFromKeyEvent(e); if (e.code === "Escape" && game.phase === "fps") { document.exitPointerLock?.(); input.aiming = false; }
  ensureAudio(); input.keys.add(e.code); input.keys.add(c); if (game.phase === "golf" && ["Space", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
  if ((game.phase === "fps" || game.phase === "fpsVictoryLap") && c.startsWith("Arrow")) e.preventDefault();
  if (game.phase === "fps" || game.phase === "fpsVictoryLap") {
    if (!input.pointerLocked) requestPointerLockSafe();
    if (game.countdown <= 0) {
      const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner);
      if (isW) {
        if (c === "KeyR") startReload();
        else if (c === "ArrowLeft") { if (game.randomTournament) cycleActiveWeapon(-1); else cycleWeaponCard(-1); }
        else if (c === "ArrowRight") { if (game.randomTournament) cycleActiveWeapon(1); else cycleWeaponCard(1); }
        else if (c === "ArrowUp") { if (game.randomTournament) cycleActiveWeapon(-1); else switchWeapon("gun"); }
        else if (c === "ArrowDown") { if (game.randomTournament) cycleActiveWeapon(1); else switchWeapon("melee"); }
        else if (/^Digit[1-9]$/.test(c)) {
          const digit = Number(c.slice(5));
          if (game.randomTournament) {
            if (game.randomLoadout && game.randomLoadout.weapons) {
              const weapons = game.randomLoadout.weapons;
              if (digit <= weapons.length) {
                const selectedWeapon = weapons[digit - 1];
                if (selectedWeapon === "melee") requestWeaponSwap("melee", game.primaryWeapon);
                else requestWeaponSwap("gun", selectedWeapon);
              }
            }
          } else {
            const aw = activeWeaponIds();
            if (digit <= aw.length) pickWeaponCard(aw[digit - 1] || "pistol", true);
            else if (digit === aw.length + 1) switchWeapon("melee");
          }
        }
        else if (c === "KeyB") toggleBuildMode();
        else if (c === "KeyV") placeBuildBox();
        else if (c === getAbilityKey("jump")) activateJumpAbility();
        else if (c === getAbilityKey("heal")) activateHealAbility();
        else if (c === "KeyF" && !game.reloading && game.meleeSwingTimer <= 0) game.inspectTimer = 2.0;
        else if (c === getAbilityKey("grenade")) throwGrenade();
        else if (c === getAbilityKey("radar")) activateRadar();
      }
    }
  }
});
window.addEventListener("keyup", (e) => { const c = codeFromKeyEvent(e); if (game.phase === "golf" && c === "Space" && canControlGolf()) { if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true); game.aimPower = 0; input.golfChargeDir = 1; powerFill.style.width = "0%"; if (world.golfAimArrow) world.golfAimArrow.visible = false; } input.keys.delete(e.code); input.keys.delete(c); });
document.addEventListener("pointerlockchange", () => input.pointerLocked = document.pointerLockElement === canvas);
document.addEventListener("mousemove", onMouseMove); document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); document.addEventListener("click", onClick);
weaponCards.forEach(c => c.addEventListener("click", () => { if (game.phase !== "fps" || game.countdown <= 0 || game.randomTournament) return; const weapon = c.getAttribute("data-weapon"); if (!activeWeaponIds().includes(weapon)) return; weaponCards.forEach(x => x.classList.remove("active")); c.classList.add("active"); selectPrimaryWeapon(weapon); }));
canvas.addEventListener("pointerdown", onPointerDown); window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", finishGolfDrag); window.addEventListener("mousedown", (e) => { if (e.button === 0 && game.phase === "golf") onPointerDown(e); }); window.addEventListener("mousemove", onPointerMove); window.addEventListener("mouseup", finishGolfDrag); canvas.addEventListener("contextmenu", (e) => e.preventDefault());
createBtn.addEventListener("click", createMatch); joinBtn.addEventListener("click", joinMatch); soloBtn.addEventListener("click", () => beginLocalMatch(cleanPhrase(phraseInput.value) || generatePhrase()));
startGolfBtn.addEventListener("click", () => { 
  if (game.role !== "guest") { 
    if (game.role === "solo") syncPlayerCountFromUi();
    let ids = drawTournamentHoleIds();
    if (game.role === "solo" && golfMapSelect?.value !== "") {
      ids = [golfMapSelect.value];
    }
    send({ type: "startTournament", courseIds: ids, playerCount: game.playerCount }); 
    startGolf(ids); 
  } 
});
startFpsBtn.addEventListener("click", () => { 
  if (game.role !== "guest") { 
    if (game.role === "solo") syncPlayerCountFromUi();
    resetFpsDuelState(false); 
    if (game.role === "solo" && fpsMapSelect?.value !== "") {
       if (fpsMapSelect.value === "custom" && game.fpsCustomMap) {
         game.fpsMapIndex = 0;
       } else {
         game.fpsMapIndex = Number(fpsMapSelect.value);
         game.fpsCustomMap = null;
       }
    } else {
       game.fpsCustomMap = null;
    }
    send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); 
    enterFps(false, { preserveFpsMatch: true }); 
  } 
});
startRandomFpsBtn?.addEventListener("click", () => { if (game.role !== "guest") { if (game.role === "solo") syncPlayerCountFromUi(); resetFpsDuelState(true); send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); enterFps(false, { preserveFpsMatch: true, randomTournament: true, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout }); } });
leaveBtn.addEventListener("click", () => { closePeer(); showMenu(); }); randomBtn.addEventListener("click", () => { phraseInput.value = generatePhrase(); if (menuError) menuError.textContent = ""; }); restartBtn.addEventListener("click", () => restartTournament());
settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden")); sensitivityInput.addEventListener("input", () => syncSensitivity(sensitivityInput.value)); menuSensitivityInput?.addEventListener("input", () => syncSensitivity(menuSensitivityInput.value));
fovInput?.addEventListener("input", () => syncFov(fovInput.value));
ingameLeaveBtn?.addEventListener("click", () => { document.exitPointerLock?.(); closePeer(); showMenu(); });
function syncFov(v) { const fov = Number(v); game.fov = fov; if (fovInput) fovInput.value = fov; if (fovValue) fovValue.textContent = `${fov}°`; }
loadMapBtn?.addEventListener("click", () => { try { game.fpsCustomMap = mapJsonInput?.value.trim() ? JSON.parse(mapJsonInput.value) : null; localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap)); if (game.phase === "fps") setupArena(); } catch { if (mapJsonInput) mapJsonInput.value = "Invalid map JSON"; } });
saveMapBtn?.addEventListener("click", () => { game.fpsCustomMap ||= { version: 1, boxes: [] }; const text = JSON.stringify(game.fpsCustomMap, null, 2); if (mapJsonInput) mapJsonInput.value = text; localStorage.setItem("golfDuelCustomArena", text); });
loadAssetBtn?.addEventListener("click", () => { game.fpsImportedAssetUrl = assetUrlInput?.value.trim() || ""; localStorage.setItem("golfDuelArenaAsset", game.fpsImportedAssetUrl); if (game.phase === "fps") setupArena(); });
window.addEventListener("wheel", (e) => { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0) return; const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner); if (isW) { cycleActiveWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
phraseInput.value = generatePhrase(); syncSensitivity(1.0);
const gdRoom = sessionStorage.getItem("gd_room");
const gdRole = sessionStorage.getItem("gd_role");
if (gdRoom && gdRole) {
  phraseInput.value = gdRoom;
  if (gdRole === "solo") beginLocalMatch(gdRoom);
  else if (gdRole === "host") createMatch();
  else if (gdRole === "guest") joinMatch();
}
try { const savedMap = localStorage.getItem("golfDuelCustomArena"); if (savedMap) { game.fpsCustomMap = JSON.parse(savedMap); if (mapJsonInput) mapJsonInput.value = JSON.stringify(game.fpsCustomMap, null, 2); } game.fpsImportedAssetUrl = localStorage.getItem("golfDuelArenaAsset") || ""; if (assetUrlInput) assetUrlInput.value = game.fpsImportedAssetUrl; } catch {}
function showDamageTaken(amount) {
  damageVignette.classList.remove("active");
  void damageVignette.offsetWidth;
  damageVignette.classList.add("active");
  playSound("hurt");
}

function showKilledBy(weaponName) {
  game.killNoticeTimer = 4.0;
  killNotice.textContent = `KILLED BY ${weaponName}`;
  killNotice.classList.remove("hidden");
}

function showEliminationNotice(victimIndex) {
  game.killNoticeTimer = 4.0;
  killNotice.textContent = `PLAYER ${victimIndex + 1} ELIMINATED`;
  killNotice.classList.remove("hidden");
}

function weaponLabel(wp) {
  if (weaponCatalog[wp]) return weaponCatalog[wp].label;
  return "Club";
}

function applyLoadedContent(content) {
  if (Array.isArray(content.standardWeaponIds) && content.standardWeaponIds.length) {
    standardWeaponIds = content.standardWeaponIds;
  }
  if (Array.isArray(content.loadouts) && content.loadouts.length) {
    randomLoadoutPresets = content.loadouts;
  }
  weaponIds = Object.keys(weaponCatalog);
  game.ammo = freshAmmoState();
  syncWeaponCardText();
}

function syncWeaponCardText() {
  weaponCards.forEach((card) => {
    const id = card.getAttribute("data-weapon");
    const cfg = weaponCatalog[id];
    if (!cfg) return;
    const title = card.querySelector("h3");
    const stats = card.querySelectorAll(".weapon-stat");
    if (title) title.textContent = cfg.label.toUpperCase();
    if (stats[0]) stats[0].textContent = `Damage: ${cfg.damage} (${Math.round(cfg.damage * (cfg.crit || 1))} Crit)`;
    if (stats[1]) stats[1].textContent = `Ammo: ${cfg.ammo} Rounds`;
    if (stats[2]) stats[2].textContent = `Type: ${cfg.projectile ? "Projectile" : (cfg.fireDelay <= 90 ? "Full-Auto" : "Semi-Auto")}`;
  });
}

function golfRampAt(pos, margin = 0.34) {
  let best = null;
  for (const ramp of world.ramps) {
    const y = rampSurfaceY(ramp, pos, margin);
    if (y === null) continue;
    if (!best || y > best.y) best = { ramp, y };
  }
  return best;
}

function golfBallSurfaceY() {
  const ramp = golfRampAt(world.ball.position);
  return ramp ? ramp.y + 0.34 : 0.53;
}

applyLoadedContent(await loadGameContent());
setupLighting(); setupGolfObjects(); setupArena(); 
scene.add(world.golfRoot, world.arenaRoot); world.arenaRoot.visible = false;
setupWeapon(); resize(); applyTournamentHoleIds(drawTournamentHoleIds()); resetGolfHole(); showMenuScene(); updateHud(); 

initNetworkLinks({
  startGolf, enterFps, applyGolfState, applyGolfHoleScored, applyFpsDuelState, serializeGolfState, 
  resetFpsDuelState, serializeFpsDuelState, resetNetworkMotion, applyRemoteFpsState, 
  spawnGrenade, createExplosion, removeRemoteGrenadesNear, startVictoryLap, 
  restartTournament, showLobby, showMenuScene, drawLaser, drawMeleeSwipe,
  showDamageTaken, showKilledBy, weaponLabel, showDamageDealt, showEliminationNotice
});

animate();

