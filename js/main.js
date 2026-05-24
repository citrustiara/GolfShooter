import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { 
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y, 
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV, 
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, HOLES_PER_TOURNAMENT, 
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, FPS_KILLS_TO_WIN_MAP, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons
} from "./core/constants.js";
import { canvas, renderer, scene, camera, clock, raycaster, materials, setupLighting, resize, lights } from "./core/engine.js";
import { game, input, world, fps } from "./core/state.js";
import { ensureAudio, playSound, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards } from "./core/utils.js";
import { closePeer, createMatch, joinMatch, send, initNetworkLinks } from "./core/network.js";
import { holes, resetTournamentState, resetGolfHole, setupGolfObjects, applyTournamentHoleIds, drawTournamentHoleIds } from "./golf/logic.js";
import { setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints } from "./fps/logic.js";
import { fpsArenaThemes } from "./fps/themes.js";

const overlay = document.querySelector("#overlay"), menu = document.querySelector("#menu"), lobby = document.querySelector("#lobby"), resultPanel = document.querySelector("#result"), hud = document.querySelector("#hud"), phraseInput = document.querySelector("#phraseInput"), menuError = document.querySelector("#menuError"), holeText = document.querySelector("#holeText"), turnText = document.querySelector("#turnText"), strokeText = document.querySelector("#strokeText"), healthChip = document.querySelector("#healthChip"), healthText = document.querySelector("#healthText"), abilityContainer = document.querySelector("#abilityContainer"), jumpOverlay = document.querySelector("#jumpOverlay"), healOverlay = document.querySelector("#healOverlay"), radarOverlay = document.querySelector("#radarOverlay"), jumpCDText = document.querySelector("#jumpCDText"), healCDText = document.querySelector("#healCDText"), radarCDText = document.querySelector("#radarCDText"), power = document.querySelector("#power"), powerFill = document.querySelector("#powerFill"), shotArrow = document.querySelector("#shotArrow"), damageLayer = document.querySelector("#damageLayer"), countdown = document.querySelector("#countdown"), settingsBtn = document.querySelector("#settingsBtn"), settingsPanel = document.querySelector("#settingsPanel"), sensitivityInput = document.querySelector("#sensitivityInput"), sensitivityValue = document.querySelector("#sensitivityValue"), menuSensitivityInput = document.querySelector("#menuSensitivityInput"), menuSensitivityValue = document.querySelector("#menuSensitivityValue"), weaponChip = document.querySelector("#weaponChip"), weaponText = document.querySelector("#weaponText"), resultTitle = document.querySelector("#resultTitle"), resultBody = document.querySelector("#resultBody"), ammoChip = document.querySelector("#ammoChip"), ammoText = document.querySelector("#ammoText"), weaponSelectOverlay = document.querySelector("#weaponSelectOverlay"), weaponSelectTimer = document.querySelector("#weaponSelectTimer"), weaponCards = document.querySelectorAll(".weapon-card"), hitMarker = document.querySelector("#hitMarker"), damageVignette = document.querySelector("#damageVignette"), grenadeOverlay = document.querySelector("#grenadeOverlay"), grenadeCDText = document.querySelector("#grenadeCDText"), killNotice = document.querySelector("#killNotice"), radarMarker = document.querySelector("#radarMarker"), lobbyStatus = document.querySelector("#lobbyStatus"), startGolfBtn = document.querySelector("#startGolfBtn"), startFpsBtn = document.querySelector("#startFpsBtn"), startRandomFpsBtn = document.querySelector("#startRandomFpsBtn"), mapJsonInput = document.querySelector("#mapJsonInput"), loadMapBtn = document.querySelector("#loadMapBtn"), saveMapBtn = document.querySelector("#saveMapBtn"), assetUrlInput = document.querySelector("#assetUrlInput"), loadAssetBtn = document.querySelector("#loadAssetBtn"), leaveBtn = document.querySelector("#leaveBtn"), createBtn = document.querySelector("#createBtn"), joinBtn = document.querySelector("#joinBtn"), soloBtn = document.querySelector("#soloBtn"), randomBtn = document.querySelector("#randomBtn"), restartBtn = document.querySelector("#restartBtn");
const activeDamagePops = []; let lastFrame = performance.now(), hitMarkerTimeout = null;
const weaponIds = Object.keys(weaponCatalog);
const standardWeaponIds = ["pistol", "rifle", "sniper"];
const normalWeaponChoices = [
  { active: "gun", primary: "pistol" },
  { active: "gun", primary: "rifle" },
  { active: "gun", primary: "sniper" },
  { active: "melee", primary: "pistol" }
];
const randomLoadoutPresets = [
  { id: "tank", hp: 999, speed: 0.62, abilities: ["grenade"], cooldowns: { grenade: 4.2 } },
  { id: "duelist", hp: 100, speed: 1.18, abilities: ["jump", "heal"], cooldowns: { jump: 2.8, heal: 7.5 } },
  { id: "scout", hp: 75, speed: 1.35, abilities: ["jump", "radar"], cooldowns: { jump: 2.2, radar: 6.5 } },
  { id: "bomber", hp: 140, speed: 0.95, abilities: ["grenade", "radar"], cooldowns: { grenade: 3.8, radar: 8 } },
  { id: "standard", hp: 100, speed: 1.0, abilities: ["jump", "heal", "grenade", "radar"], cooldowns: {} }
];

function weaponConfig(id = game.primaryWeapon) { return weaponCatalog[id] || weaponCatalog.pistol; }
function weaponMaxAmmo(id = game.primaryWeapon) { return weaponConfig(id).ammo; }
function weaponLabelText(id = game.primaryWeapon) { return id === "melee" ? "Club" : weaponConfig(id).label; }
function freshAmmoState() { return Object.fromEntries(weaponIds.map((id) => [id, weaponMaxAmmo(id)])); }
function chooseRandomTournamentWeapon() { return randomTournamentWeapons[Math.floor(Math.random() * randomTournamentWeapons.length)] || "heavySniper"; }
function isRandomMeleeWeapon(id = game.randomWeapon) { return id === "melee"; }
function chooseRandomLoadout() { return randomLoadoutPresets[Math.floor(Math.random() * randomLoadoutPresets.length)] || randomLoadoutPresets[0]; }
function chooseRandomFpsMap(exclude = -1) { const choices = fpsArenaThemes.map((_, index) => index).filter((index) => index !== exclude); return choices[Math.floor(Math.random() * choices.length)] ?? 0; }
function activeLoadout() { return game.randomTournament && game.randomLoadout ? game.randomLoadout : randomLoadoutPresets[randomLoadoutPresets.length - 1]; }
function abilityAllowed(name) { return activeLoadout().abilities.includes(name); }
function abilityCooldown(name, fallback) { return activeLoadout().cooldowns?.[name] ?? fallback; }
function jumpAbilityStrength() { return 28; }
function aimingSensitivityMultiplier() { const cfg = weaponConfig(); const aimFov = cfg.aimFov || FPS_AIM_FOV; return FPS_AIM_SENSITIVITY_MULTIPLIER * Math.sqrt(Math.max(0.08, aimFov / FPS_DEFAULT_FOV)); }

function showMenuScene() {
  world.golfRoot.visible = true; world.arenaRoot.visible = false; camera.position.set(-28, 12, 28); camera.lookAt(0, 0, 0); camera.fov = 62; camera.updateProjectionMatrix();
}

function setupWeapon() {
  const group = new THREE.Group(), matDark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.45, metalness: 0.25 }), matLight = new THREE.MeshStandardMaterial({ color: 0xd84545, roughness: 0.45, metalness: 0.15 }), matGold = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.34, emissive: 0xffd166, emissiveIntensity: 0.18 }), matCyanGlow = new THREE.MeshBasicMaterial({ color: 0x4df3ff }), matRedGlow = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  world.weaponMaterials = { matDark, matLight, matGold, matCyanGlow, matRedGlow };
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.42), matDark); frame.position.set(0, -0.04, -0.05); world.weaponFrame = frame;
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.48), matDark); slide.position.set(0, 0.08, -0.1); world.weaponSlide = slide;
  const barrelGroup = new THREE.Group(); barrelGroup.position.set(0, 0.08, 0.14); const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 16), matDark); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.25; barrelGroup.add(barrel); world.barrelGroup = barrelGroup;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), matDark); grip.position.set(0, -0.22, 0.1); grip.rotation.x = -0.25;
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.12), matDark); triggerGuard.position.set(0, -0.14, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.11), matGold); mag.position.set(0, -0.24, 0.1); mag.rotation.x = -0.25;
  const rifleMag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.18), matDark); rifleMag.position.set(0, -0.3, -0.15); rifleMag.rotation.x = 0.15; rifleMag.visible = false; world.rifleMag = rifleMag;
  const topDetail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.32), matLight); topDetail.position.set(0, 0.14, -0.12); world.weaponTopDetails = topDetail;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), matGold); sight.position.set(0, 0.16, -0.32);
  const glowL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.18), matCyanGlow); glowL.position.set(-0.065, 0.02, -0.1); const glowR = glowL.clone(); glowR.position.x = 0.065;
  group.add(frame, slide, barrelGroup, grip, triggerGuard, mag, rifleMag, topDetail, sight, glowL, glowR); world.weapon = group; scene.add(group); group.visible = false;
  const tip = new THREE.Group(); tip.position.set(0, 0.08, -0.48); group.add(tip); world.weaponTip = tip;
  const meleeGroup = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 14), materials.metal);
  shaft.position.set(0.36, -0.4, -0.42);
  shaft.rotation.set(-0.74, 0.1, 0.18);
  const clubGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.34, 12), matDark);
  clubGrip.position.set(0.18, 0.12, 0.05);
  clubGrip.rotation.copy(shaft.rotation);
  const clubHead = new THREE.Group();
  clubHead.position.set(0.55, -1.0, -0.98);
  clubHead.rotation.set(-0.38, 0.9, -0.12);
  const headBack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.16), matGold);
  headBack.position.set(0.04, 0.02, 0.02);
  const headFace = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.035), materials.metal);
  headFace.position.set(0.03, -0.01, -0.085);
  const headToe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.2), matDark);
  headToe.position.set(0.22, 0.01, 0.02);
  clubHead.add(headBack, headFace, headToe);
  meleeGroup.add(shaft, clubGrip, clubHead);
  world.meleeWeapon = meleeGroup; scene.add(meleeGroup); meleeGroup.visible = false;
}

function beginLocalMatch(room) { game.role = "solo"; game.room = room; game.localIndex = 0; showLobby(); }
function showMenu() { game.phase = "menu"; menu.classList.remove("hidden"); lobby.classList.add("hidden"); resultPanel.classList.add("hidden"); hud.classList.add("hidden"); document.querySelector("#network").classList.add("hidden"); weaponSelectOverlay.classList.add("hidden"); overlay.classList.remove("fps"); document.exitPointerLock?.(); showMenuScene(); }
function showLobby() { game.phase = "lobby"; lobby.classList.remove("hidden"); menu.classList.add("hidden"); resultPanel.classList.add("hidden"); hud.classList.add("hidden"); weaponSelectOverlay.classList.add("hidden"); overlay.classList.remove("fps"); showMenuScene(); if (game.role === "guest") { startGolfBtn.classList.add("hidden"); startFpsBtn.classList.add("hidden"); startRandomFpsBtn?.classList.add("hidden"); lobbyStatus.textContent = "Waiting for host to start..."; } else { startGolfBtn.classList.remove("hidden"); startFpsBtn.classList.remove("hidden"); startRandomFpsBtn?.classList.remove("hidden"); lobbyStatus.textContent = game.role === "solo" ? "Solo practice. Choose a mode." : "Peer connected! You are the host."; } }
function startGolf(courseIds = null) { resetTournamentState(courseIds); game.phase = "golf"; menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); overlay.classList.remove("fps"); world.golfRoot.visible = true; world.arenaRoot.visible = false; power.classList.remove("hidden"); resetGolfHole(); updateHud(); }
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
  game.phase = "fps"; overlay.classList.add("fps"); menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); weaponSelectOverlay.classList.add("hidden"); weaponSelectOverlay.hidden = true; weaponSelectOverlay.style.display = "none"; resultPanel.classList.add("hidden"); resultPanel.classList.remove("fps-result"); world.golfRoot.visible = false; world.arenaRoot.visible = true; world.weapon.visible = true; world.meleeWeapon.visible = true;
  power.classList.add("hidden"); shotArrow.classList.add("hidden"); game.dragging = false;
  if (!options.preserveFpsMatch) { game.fpsMapIndex = 0; game.fpsMapWins = [0, 0]; }
  game.randomTournament = Boolean(options.randomTournament ?? game.randomTournament);
  game.fpsMode = game.randomTournament ? "randomTournament" : "standard";
  if (options.randomWeapon) game.randomWeapon = options.randomWeapon;
  if (options.randomLoadout) game.randomLoadout = options.randomLoadout;
  const loadout = activeLoadout();
  game.maxHealth = loadout.hp;
  if (!options.preserveFpsMatch) {
    game.fpsKillWins = [0, 0];
    game.fpsMatchOver = false;
  }
  game.fpsRoundWinner = null; game.countdown = options.staticMock ? 0 : FPS_COUNTDOWN_DURATION; game.weaponSelectTimer = 0;
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], spawns = getArenaSpawnPoints(theme);
  const randomMelee = game.randomTournament && isRandomMeleeWeapon();
  fps.players.forEach((p, i) => { const spawn = spawns[i] || { x: i === 0 ? -42 : 42, z: 0 }; p.pos.set(spawn.x, 1, spawn.z); p.vel.set(0, 0, 0); p.yaw = i === 0 ? 0 : Math.PI; p.pitch = 0; p.health = game.maxHealth; p.maxHealth = game.maxHealth; p.grounded = false; p.sliding = false; p.weapon = randomMelee ? "melee" : "gun"; p.primaryWeapon = game.randomTournament && !randomMelee ? game.randomWeapon : "pistol"; });
  game.ammo = freshAmmoState(); game.reloading = false; game.activeWeapon = randomMelee ? "melee" : "gun"; game.primaryWeapon = game.randomTournament && !randomMelee ? game.randomWeapon : "pistol"; game.meleeSwingTimer = 0; game.weaponSwapTimer = 0; game.jumpCooldown = 0; game.healCooldown = 0; game.grenadeCooldown = 0; game.radarCooldown = 0; game.radarTimer = 0; game.slideTimer = 0; game.slideCooldown = 0; game.visualRecoil = 0;
  if (game.role === "solo") game.localIndex = 0;
  setupArena(); fps.players.forEach((p) => clampArenaPosition(p.pos, 0.5)); applyWeaponState("gun", game.primaryWeapon); syncPrimaryWeaponModel(); updateHud();
}

function updateGolf(dt) {
  input.pointerLocked = false;
  applyGolfAtmosphere(holes[game.holeIndex]);
  if (game.ballMoving) {
    resolveGolfBall(dt);
  } else {
    power.classList.remove("hidden");
    if (canControlGolf()) {
      if (input.keys.has("ArrowLeft")) game.aimAngle -= GOLF_AIM_SENSITIVITY * 150 * dt;
      if (input.keys.has("ArrowRight")) game.aimAngle += GOLF_AIM_SENSITIVITY * 150 * dt;
      if (input.keys.has("Space")) {
        game.aimPower += dt * 0.8 * input.golfChargeDir;
        if (game.aimPower >= 1) { game.aimPower = 1; input.golfChargeDir = -1; }
        if (game.aimPower <= 0) { game.aimPower = 0; input.golfChargeDir = 1; }
        powerFill.style.width = `${game.aimPower * 100}%`;
      }
    }
  }
  updateGolfCamera(dt);
  updateShotArrow();
}
function canControlGolf() { return game.role === "solo" || game.currentPlayer === game.localIndex; }
function updateGolfCamera(dt) { const hole = holes[game.holeIndex]; if (!hole) return; const desiredDir = world.ballVel.lengthSq() > 0.1 ? world.ballVel.clone().multiplyScalar(-1).setY(0).normalize() : game.golfShotDir.clone().multiplyScalar(-1); if (desiredDir.lengthSq() < 0.01) desiredDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle)); const targetCamPos = world.ball.position.clone().add(desiredDir.multiplyScalar(13)).add(new THREE.Vector3(0, game.ballMoving ? 7.2 : 6.2, 0)); camera.position.lerp(targetCamPos, Math.min(1, dt * (game.ballMoving ? 1.7 : 4.0))); camera.lookAt(world.ball.position.clone().add(new THREE.Vector3(0, 0.35, 0))); }
function updateShotArrow() {
  const showAim = game.dragging && !game.ballMoving && canControlGolf() && game.aimPower > 0.01;
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
function simulateShot(direction, power, local = false) { if (game.ballMoving || power <= 0.04) return; const dir = direction.clone().setY(0); if (dir.lengthSq() <= 0.0001) return; dir.normalize(); game.lastShotPosition.copy(world.ball.position); game.lastShotPosition.y = 0.34; game.golfFalling = false; game.ballMoving = true; world.ball.position.y = 0.34; game.strokesThisHole[game.currentPlayer]++; playSound("golfHit"); world.ballVel.copy(dir.multiplyScalar(power * GOLF_MAX_SHOT_SPEED)); if (world.golfAimArrow) world.golfAimArrow.visible = false; shotArrow.classList.add("hidden"); if (local && game.role !== "solo") send({ type: "golfShot", state: serializeGolfState() }); updateHud(); }
function isBallOnGolfSurface(hole) {
  return (hole?.surfaces || []).some((surface) => {
    if (surface.type === "circle") return flatDistance(world.ball.position, surface) <= surface.r + 0.4;
    const rot = -(surface.rot || 0);
    const local = world.ball.position.clone().sub(new THREE.Vector3(surface.x, 0, surface.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return Math.abs(local.x) <= surface.sx / 2 + 0.4 && Math.abs(local.z) <= surface.sz / 2 + 0.4;
  });
}
function resetGolfAfterFall(hole) {
  game.ballMoving = false;
  game.golfFalling = false;
  game.strokesThisHole[game.currentPlayer]++;
  world.ball.position.copy(game.lastShotPosition.lengthSq() > 0 ? game.lastShotPosition : hole.start);
  world.ball.position.y = 0.34;
  world.ballVel.set(0, 0, 0);
  game.aimPower = 0;
  powerFill.style.width = "0%";
  if (world.golfAimArrow) world.golfAimArrow.visible = false;
  updateHud();
  if (game.role !== "solo") send({ type: "golfResolved", state: serializeGolfState() });
}
function resolveGolfBall(dt) {
  const hole = holes[game.holeIndex];
  if (world.ball.position.y < (hole?.deathZoneY ?? -5)) { resetGolfAfterFall(hole); return; }
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  const wasOnIce = isBallOnIce();
  world.ball.position.addScaledVector(world.ballVel, dt);
  world.ball.position.y = 0.34;
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  world.ballVel.multiplyScalar(Math.pow(wasOnIce ? GOLF_ICE_FRICTION : GOLF_GROUND_FRICTION, dt * 60));
  if (!isBallOnGolfSurface(hole)) {
    resetGolfAfterFall(hole);
    return;
  } else if (game.golfFalling) {
    game.golfFalling = false;
    world.ball.position.y = 0.34;
  }
  for (const mound of world.mounds) { const d = flatDistance(world.ball.position, mound); if (d < mound.radius) { const push = world.ball.position.clone().sub(new THREE.Vector3(mound.x, 0, mound.z)).normalize(); world.ballVel.addScaledVector(push, (1.0 - d / mound.radius) * 12 * dt); } }
  for (const b of world.bumpers) resolveGolfBumperCollision(b);
  const distToCup = flatDistance(world.ball.position, world.cup.position); if (distToCup < CUP_PULL_RADIUS) { world.ballVel.addScaledVector(world.cup.position.clone().sub(world.ball.position).normalize(), CUP_PULL_FORCE * dt * 60); if (distToCup < CUP_SINK_RADIUS && world.ballVel.length() < CUP_SINK_SPEED_MAX) { scoreHole(); return; } }
  if (world.ballVel.length() < 0.08) { world.ballVel.set(0, 0, 0); game.ballMoving = false; world.ball.position.y = 0.34; nextTurn(); }
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
  world.ball.position.y = 0.34;
  if (world.ballVel.dot(normal) < 0) world.ballVel.reflect(normal).multiplyScalar(0.82);
}
function scoreHole() { game.ballMoving = false; game.ballVel.set(0, 0, 0); playSound("golfScore"); game.holeScores[game.currentPlayer][game.holeIndex] = game.strokesThisHole[game.currentPlayer]; if (game.role === "solo") { nextHole(); } else { if (game.role === "host") nextHole(); else send({ type: "golfResolved", state: serializeGolfState() }); } updateHud(); }
function nextTurn() { if (game.role === "solo") return; game.currentPlayer = 1 - game.currentPlayer; send({ type: "golfResolved", state: serializeGolfState() }); updateHud(); }
function nextHole() { game.holeIndex++; if (game.holeIndex >= holes.length) finishMatch(game.role === "solo" ? 0 : (totalStrokes()[0] <= totalStrokes()[1] ? 0 : 1), "golf"); else { game.currentPlayer = 0; game.strokesThisHole = [0, 0]; resetGolfHole(); if (game.role === "host") send({ type: "golfResolved", state: serializeGolfState() }); } }
function totalStrokes() { return game.holeScores.map(ps => ps.reduce((a, b) => (a || 0) + (b || 0), 0)); }
function serializeGolfState() { return { currentPlayer: game.currentPlayer, holeIndex: game.holeIndex, holeScores: game.holeScores, strokesThisHole: game.strokesThisHole, ballPos: { x: world.ball.position.x, z: world.ball.position.z }, ballVel: { x: world.ballVel.x, z: world.ballVel.z }, token: game.golfResolveToken }; }
function applyGolfState(s) { if (!s) return; const holeChanged = s.holeIndex !== game.holeIndex; game.currentPlayer = s.currentPlayer; game.holeIndex = s.holeIndex; game.holeScores = s.holeScores; game.strokesThisHole = s.strokesThisHole; if (holeChanged) resetGolfHole(); world.ball.position.set(s.ballPos.x, 0.34, s.ballPos.z); world.ballVel.set(s.ballVel.x, 0, s.ballVel.z); game.ballMoving = world.ballVel.lengthSq() > 0; updateHud(); }

function updateFps(dt, now) {
  if (game.countdown > 0) { game.countdown -= dt; countdown.textContent = Math.ceil(game.countdown); countdown.classList.remove("hidden"); if (game.countdown <= 0) countdown.classList.add("hidden"); }
  weaponSelectOverlay.classList.add("hidden");
  const isWinner = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner);
  if (isWinner && game.countdown <= 0) { updateFpsCamera(dt); updateFpsMovement(dt); }
  updateWeaponSwap(dt); if (game.reloading) { game.reloadTimer -= dt; if (game.reloadTimer <= 0) { game.reloading = false; game.ammo[game.primaryWeapon] = weaponMaxAmmo(game.primaryWeapon); updateHud(); } }
  if (game.inspectTimer > 0) game.inspectTimer -= dt; if (game.meleeSwingTimer > 0) game.meleeSwingTimer -= dt; if (game.jumpCooldown > 0) game.jumpCooldown -= dt; if (game.healCooldown > 0) game.healCooldown -= dt; if (game.grenadeCooldown > 0) game.grenadeCooldown -= dt; if (game.radarCooldown > 0) game.radarCooldown -= dt; if (game.slideTimer > 0) game.slideTimer -= dt; if (game.slideCooldown > 0) game.slideCooldown -= dt; if (game.radarTimer > 0) { game.radarTimer -= dt; updateRadarMarker(); }
  updateGrenades(dt); updateExplosions(dt); updateLasers(dt); updateDamagePops(dt); updatePlayerMeshes();
  if (game.killNoticeTimer > 0) { game.killNoticeTimer -= dt; if (game.killNoticeTimer <= 0) killNotice.classList.add("hidden"); }
  if (game.connected && now - game.lastSend > 50) { game.lastSend = now; const p = fps.players[game.localIndex]; send({ type: "fpsState", player: game.localIndex, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, sliding: p.sliding, weapon: game.activeWeapon }); }
  updateHud();
}
function updateFpsCamera(dt) {
  const p = fps.players[game.localIndex]; p.yaw = input.yaw; p.pitch = input.pitch; p.currentCamHeight = moveTowards(p.currentCamHeight || 0.72, p.sliding ? 0.35 : 0.72, dt * 2.5);
  game.visualRecoil = moveTowards(game.visualRecoil, 0, dt * 9);
  camera.position.set(p.pos.x, p.pos.y + p.currentCamHeight, p.pos.z); camera.lookAt(camera.position.clone().add(directionFromAngles(p.yaw, p.pitch + game.visualRecoil * 0.018)));
  const cfg = weaponConfig(game.primaryWeapon);
  camera.fov = moveTowards(camera.fov, input.aiming ? (cfg.aimFov || FPS_AIM_FOV) : FPS_DEFAULT_FOV, dt * 180); camera.updateProjectionMatrix(); updateWeaponModel(dt, p);
}
function updateWeaponModel(dt, p) {
  const weapon = game.activeWeapon === "gun" ? world.weapon : world.meleeWeapon; world.weapon.visible = world.meleeWeapon.visible = false; weapon.visible = true;
  const camDir = directionFromAngles(p.yaw, p.pitch), viewDir = directionFromAngles(p.yaw, 0), right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3(0, 1, 0);
  const speed = p.vel.length(), bob = Math.sin(performance.now() * 0.008) * speed * 0.005, swayX = Math.sin(performance.now() * 0.004) * 0.005;
  weapon.scale.setScalar(game.activeWeapon === "gun" ? 0.82 : 0.78);
  let offset = camDir.clone().multiplyScalar(0.34).add(right.clone().multiplyScalar(0.22 + swayX)).add(up.clone().multiplyScalar(-0.3 + bob));
  if (input.aiming && game.activeWeapon === "gun") {
    const longGun = game.primaryWeapon === "sniper" || game.primaryWeapon === "heavySniper";
    offset = camDir.clone().multiplyScalar(longGun ? 0.18 : 0.24).add(right.clone().multiplyScalar(longGun ? 0.24 : 0.28)).add(up.clone().multiplyScalar(longGun ? -0.54 : -0.46));
  }
  offset.add(camDir.clone().multiplyScalar(-game.visualRecoil * 0.12)).add(up.clone().multiplyScalar(game.visualRecoil * 0.04));
  let animY = 0, animRotZ = 0; if (game.weaponSwapTimer > 0) animY = -Math.sin((game.weaponSwapTimer / WEAPON_SWAP_DURATION) * Math.PI) * 0.5; else if (game.reloading) { const t = game.reloadTimer / (game.primaryWeapon === "pistol" ? 1.0 : 1.4); animRotZ = Math.sin(t * Math.PI) * 0.6; animY = -Math.abs(Math.sin(t * Math.PI)) * 0.15; } else if (game.inspectTimer > 0) animRotZ = Math.sin(game.inspectTimer * 2) * 0.4;
  weapon.position.copy(camera.position).add(offset).add(up.clone().multiplyScalar(animY)); weapon.quaternion.copy(camera.quaternion); weapon.rotateZ(animRotZ); if (game.activeWeapon === "melee" && game.meleeSwingTimer > 0) weapon.rotateX(Math.sin(game.meleeSwingTimer * 12) * 1.2);
}
function updateFpsMovement(dt) {
  const p = fps.players[game.localIndex], theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], forward = new THREE.Vector3(Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize(), move = new THREE.Vector3(), previousY = p.pos.y;
  if (input.keys.has("KeyW")) move.add(forward); if (input.keys.has("KeyS")) move.sub(forward); if (input.keys.has("KeyA")) move.sub(right); if (input.keys.has("KeyD")) move.add(right); if (move.lengthSq() > 0) move.normalize();
  const wasGrounded = p.grounded;
  const slideKey = input.keys.has("ShiftLeft") || input.keys.has("ControlLeft"), slidePressed = slideKey && !input.slideKeyWasDown, wantsSlide = slidePressed && p.grounded && move.lengthSq() > 0 && game.slideCooldown <= 0;
  const cfg = weaponConfig();
  const meleeSpeedBoost = game.activeWeapon === "melee" ? 1.34 : 1;
  const weaponMoveScale = (cfg.moveScale || 1) * activeLoadout().speed * meleeSpeedBoost * (game.primaryWeapon === "minigun" && input.shootHeld ? cfg.movePenalty : 1);
  if (wantsSlide) { game.slideTimer = 0.72; game.slideCooldown = 0.72; p.vel.addScaledVector(move, 13 * weaponMoveScale); playSound("slide"); }
  p.sliding = game.slideTimer > 0 && p.grounded;
  input.slideKeyWasDown = slideKey;
  const accel = p.sliding ? 42 : (p.grounded ? 160 : 34), maxSpeed = (p.sliding ? 38 : 22) * weaponMoveScale;
  p.vel.addScaledVector(move, accel * weaponMoveScale * dt); p.vel.x *= (p.sliding ? 0.982 : (p.grounded ? 0.88 : 0.985)); p.vel.z *= (p.sliding ? 0.982 : (p.grounded ? 0.88 : 0.985)); const horiz = Math.hypot(p.vel.x, p.vel.z); if (horiz > maxSpeed) { const s = maxSpeed / horiz; p.vel.x *= s; p.vel.z *= s; }
  if (input.keys.has("Space") && p.grounded) { p.vel.y = 12; p.grounded = false; playSound("jump"); } if (input.keys.has("KeyE") && abilityAllowed("jump") && game.jumpCooldown <= 0) { p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); } if (input.keys.has("KeyQ") && abilityAllowed("heal") && game.healCooldown <= 0 && p.health < game.maxHealth) { p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); }
  p.vel.y += fps.gravity * dt; p.pos.addScaledVector(p.vel, dt);
  let onPlat = false; for (const plat of world.platforms) { const b = new THREE.Box3().setFromObject(plat); const insideX = p.pos.x > b.min.x - 0.42 && p.pos.x < b.max.x + 0.42, insideZ = p.pos.z > b.min.z - 0.42 && p.pos.z < b.max.z + 0.42, crossedTop = previousY >= b.max.y - 0.05 && p.pos.y <= b.max.y + 0.72; if (insideX && insideZ && p.vel.y <= 0 && crossedTop) { p.pos.y = b.max.y; p.vel.y = 0; onPlat = true; break; } }
  if (p.pos.y <= 1) { p.pos.y = 1; p.vel.y = 0; p.grounded = true; } else p.grounded = onPlat;
  if (!wasGrounded && p.grounded) playSound("land");
  if (p.pos.y < -8) {
    const spawn = getArenaSpawnPoints(theme)[game.localIndex] || { x: 0, z: 0 };
    p.pos.set(spawn.x, 1, spawn.z);
    p.vel.set(0, 0, 0);
  }
  clampArenaPosition(p.pos, 0.5);
  for (const obs of world.obstacles) { const b = new THREE.Box3().setFromObject(obs); if (p.pos.y >= b.max.y - 0.08) continue; if (p.pos.x > b.min.x - 0.4 && p.pos.x < b.max.x + 0.4 && p.pos.z > b.min.z - 0.4 && p.pos.z < b.max.z + 0.4 && p.pos.y > b.min.y && p.pos.y < b.max.y) { const dx = Math.min(Math.abs(p.pos.x - b.min.x), Math.abs(p.pos.x - b.max.x)), dz = Math.min(Math.abs(p.pos.z - b.min.z), Math.abs(p.pos.z - b.max.z)); if (dx < dz) p.pos.x = p.pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - 0.4 : b.max.x + 0.4; else p.pos.z = p.pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - 0.4 : b.max.z + 0.4; } }
  clampArenaPosition(p.pos, 0.5);
}
function updateGrenades(dt) { for (let i = world.grenades.length - 1; i >= 0; i--) { const g = world.grenades[i]; if (g.kind === "rocket") { g.mesh.position.addScaledVector(g.vel, dt); } else { g.vel.y += (g.gravity ?? GRENADE_GRAVITY) * dt; g.mesh.position.addScaledVector(g.vel, dt); } g.mesh.rotation.x += 5 * dt; g.mesh.rotation.y += 3 * dt; g.timer -= dt; const outOfArena = !isPointInsideArena(g.mesh.position, world.arenaFloors, 0.1); const hitObstacle = projectileHitObstacle(g); const hitPlayer = projectileHitPlayer(g); const hitGround = g.mesh.position.y < 0.2; if (hitGround && g.kind !== "rocket" && g.kind !== "grenadeLauncher") { g.mesh.position.y = 0.2; g.vel.y *= -0.4; g.vel.x *= 0.8; g.vel.z *= 0.8; } if (outOfArena || hitObstacle || hitPlayer || (hitGround && g.kind === "grenadeLauncher") || g.timer <= 0) { if (g.localAuthority) explodeGrenade(g); else createExplosion(g.mesh.position.clone(), grenadeRadius(g) * 0.45); world.arenaRoot.remove(g.mesh); world.grenades.splice(i, 1); } } }
function spawnGrenade(pos, vel, local = true, owner = 0, options = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: owner === game.localIndex ? 0x243c34 : 0x4a2528, roughness: 0.38, metalness: 0.28, emissive: options.supercharged ? 0xa74dff : 0x000000, emissiveIntensity: options.supercharged ? 0.9 : 0 });
  const glowMat = new THREE.MeshBasicMaterial({ color: owner === game.localIndex ? 0x7ee2a8 : 0xff6f61 });
  if (options.kind === "rocket") {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 14), bodyMat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.28, 14), glowMat);
    nose.position.y = 0.54;
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
function throwGrenade() { if (game.phase !== "fps" || game.countdown > 0 || game.grenadeCooldown > 0 || !abilityAllowed("grenade")) return; game.grenadeCooldown = abilityCooldown("grenade", GRENADE_COOLDOWN); const p = fps.players[game.localIndex], origin = new THREE.Vector3(p.pos.x, p.pos.y + 0.72, p.pos.z), dir = directionFromAngles(p.yaw, p.pitch), vel = dir.clone().multiplyScalar(GRENADE_SPEED).add(p.vel); spawnGrenade(origin, vel, true, game.localIndex); playSound("grenade"); send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex }); updateHud(); }
function activateJumpAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("jump") || game.jumpCooldown > 0) return; const p = fps.players[game.localIndex]; p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); updateHud(); }
function activateHealAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("heal") || game.healCooldown > 0) return; const p = fps.players[game.localIndex]; if (p.health >= game.maxHealth) return; p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); }
function grenadeRadius(g) { return GRENADE_SPLASH_RADIUS * (g.radiusMultiplier || 1); }
function grenadeDamage(g) { return GRENADE_MAX_DAMAGE * (g.damageMultiplier || 1); }
function projectileHitObstacle(g) { if (g.kind !== "rocket" && g.kind !== "grenadeLauncher") return false; const radius = g.kind === "grenadeLauncher" ? 0.32 : 0.26; const b = new THREE.Box3(); for (const obs of world.obstacles) { b.setFromObject(obs); if (b.distanceToPoint(g.mesh.position) < radius) return true; } return false; }
function projectileHitPlayer(g) { if (g.kind !== "rocket" && g.kind !== "grenadeLauncher") return false; const radius = g.kind === "grenadeLauncher" ? 0.86 : 0.95; return fps.players.some((p, index) => index !== g.owner && p.pos.clone().add(new THREE.Vector3(0, 0.72, 0)).distanceTo(g.mesh.position) < radius); }
function explodeGrenade(g) { const pos = g.mesh.position.clone(); world.arenaRoot.remove(g.mesh); createExplosion(pos, grenadeRadius(g) * 0.5); playSound("explosion"); const damages = []; for (let i = 0; i < fps.players.length; i++) { const target = fps.players[i], dist = pos.distanceTo(target.pos.clone().add(new THREE.Vector3(0, 0.72, 0))), radius = grenadeRadius(g); if (dist < radius) { const dmg = Math.floor((1.0 - dist / radius) * grenadeDamage(g)); if (dmg > 0) { damages.push({ target: i, damage: dmg }); target.health = Math.max(0, target.health - dmg); showDamageDealt(dmg, target.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), false); if (i === game.localIndex) showDamageTaken(dmg); } } } send({ type: "fpsGrenadeExplode", x: pos.x, y: pos.y, z: pos.z, damage: damages[0]?.damage || 0, target: damages[0]?.target ?? null, damages, owner: g.owner, radius: grenadeRadius(g) }); const dead = damages.find((d) => fps.players[d.target].health <= 0); if (dead) startVictoryLap(dead.target === game.localIndex ? 1 - game.localIndex : game.localIndex, "deathmatch"); }
function createExplosion(pos, radius = GRENADE_SPLASH_RADIUS * 0.5) { const geo = new THREE.SphereGeometry(radius, 32, 24), mat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.8 }); const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); world.arenaRoot.add(mesh); world.explosions.push({ mesh, timer: 0.4, max: 0.4 }); }
function updateExplosions(dt) { for (let i = world.explosions.length - 1; i >= 0; i--) { const ex = world.explosions[i]; ex.timer -= dt; const s = 1.0 + (1.0 - ex.timer / ex.max) * 2.0; ex.mesh.scale.set(s, s, s); ex.mesh.material.opacity = ex.timer / ex.max; if (ex.timer <= 0) { world.arenaRoot.remove(ex.mesh); world.explosions.splice(i, 1); } } }
function removeRemoteGrenadesNear(pos) { for (let i = world.grenades.length - 1; i >= 0; i--) { if (world.grenades[i].mesh.position.distanceTo(pos) < 1.0) { world.arenaRoot.remove(world.grenades[i].mesh); world.grenades.splice(i, 1); } } }
function disposeGrenade(g, announce = false) { const pos = g.mesh.position.clone(); world.arenaRoot.remove(g.mesh); const index = world.grenades.indexOf(g); if (index >= 0) world.grenades.splice(index, 1); createExplosion(pos, 1.4); if (announce) send({ type: "fpsGrenadeShot", x: pos.x, y: pos.y, z: pos.z }); }
function superchargeGrenade(g, announce = false) { g.isSupercharged = true; g.damageMultiplier = 5; g.radiusMultiplier = 2; g.mesh.traverse((child) => { if (child.material?.color) child.material.color.setHex(0xb84dff); if (child.material?.emissive) { child.material.emissive.setHex(0xb84dff); child.material.emissiveIntensity = 1.1; } }); if (announce) { const pos = g.mesh.position; send({ type: "fpsGrenadeSupercharge", x: pos.x, y: pos.y, z: pos.z }); } }
function grenadeRayHit(origin, direction, maxDistance) {
  let best = null;
  for (const grenade of world.grenades) {
    const distance = rayHitsSphere(origin, direction, grenade.mesh.position, grenade.kind === "rocket" ? 0.38 : 0.28);
    if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { grenade, distance };
  }
  return best;
}

function fireHitscan() {
  if (game.phase !== "fps" || game.countdown > 0 || game.reloading || game.ammo[game.primaryWeapon] <= 0) { if (game.ammo[game.primaryWeapon] <= 0) startReload(); return; }
  const cfg = weaponConfig();
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  if (cfg.projectile) { fireProjectileWeapon(cfg); return; }
  game.lastShotAt = now; game.visualRecoil = Math.min(1.8, game.visualRecoil + (game.primaryWeapon === "minigun" ? 0.18 : game.primaryWeapon === "shotgun" ? 0.7 : 0.42)); playSound(game.primaryWeapon === "heavySniper" ? "sniper" : game.primaryWeapon); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload(); updateHud();
  const shooter = fps.players[game.localIndex], oppIdx = 1 - game.localIndex, opponent = fps.players[oppIdx], origin = new THREE.Vector3(shooter.pos.x, shooter.pos.y + (shooter.currentCamHeight || 0.72), shooter.pos.z);
  const pelletCount = cfg.pellets || 1, pellets = []; let totalDamage = 0, anyHit = false, anyHeadshot = false, bestLength = cfg.range || 80, firstDirection = null;
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
    const playerHitResult = rayHitsPlayer(origin, direction, opponent); let pelletHit = false, pelletDmg = 0, pelletHS = false, len = cfg.range || 80;
    if (playerHitResult) { const pDist = playerHitResult.distance, throughWall = wallHit && wallHit.distance < pDist; pelletHit = true; pelletHS = playerHitResult.headshot; pelletDmg = Math.floor(cfg.damage * (pelletHS ? cfg.crit : 1) * (throughWall ? 0.5 : 1)); len = pDist; } else if (wallHit) len = wallHit.distance;
    drawLaser(origin, direction, len, pelletHit, false, game.primaryWeapon);
    pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: len, hit: pelletHit });
    if (pelletHit) { anyHit = true; anyHeadshot ||= pelletHS; totalDamage += pelletDmg; bestLength = Math.min(bestLength, len); }
  }
  if (anyHit) { opponent.health = Math.max(0, opponent.health - totalDamage); showDamageDealt(totalDamage, opponent.pos.clone().add(new THREE.Vector3(0, anyHeadshot ? 1.75 : 1.3, 0)), anyHeadshot); showHitMarker(anyHeadshot); updateHud(); }
  send({ type: "fpsShot", ox: origin.x, oy: origin.y, oz: origin.z, dx: firstDirection.x, dy: firstDirection.y, dz: firstDirection.z, hit: anyHit, length: bestLength, damage: totalDamage, target: anyHit ? oppIdx : null, headshot: anyHeadshot, weapon: game.primaryWeapon, pellets: pelletCount > 1 ? pellets : null });
  if (anyHit && opponent.health <= 0) startVictoryLap(game.localIndex, "deathmatch");
}
function fireProjectileWeapon(cfg) {
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  game.lastShotAt = now; game.visualRecoil = Math.min(1.8, game.visualRecoil + 0.85); playSound(cfg.projectile === "rocket" ? "rocket" : "grenade"); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload();
  const shooter = fps.players[game.localIndex], origin = new THREE.Vector3(shooter.pos.x, shooter.pos.y + (shooter.currentCamHeight || 0.72), shooter.pos.z), dir = directionFromAngles(input.yaw, input.pitch).normalize();
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
  const now = performance.now(); if (now - game.lastShotAt < 250) return; game.lastShotAt = now; game.meleeSwingTimer = 0.25; playSound("melee");
  const s = fps.players[game.localIndex], oppIdx = 1 - game.localIndex, opp = fps.players[oppIdx], origin = new THREE.Vector3(s.pos.x, s.pos.y + (s.currentCamHeight || 0.72), s.pos.z), dir = directionFromAngles(input.yaw, input.pitch).normalize();
  drawMeleeSwipe(origin, dir); const hC = opp.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), bC = opp.pos.clone().add(new THREE.Vector3(0, 0.65, 0)), dH = origin.distanceTo(hC), dB = origin.distanceTo(bC);
  let hit = false, hs = false; if (dH < 2.6 && dir.dot(hC.clone().sub(origin).normalize()) > 0.72) { hit = true; hs = true; } else if (dB < 2.6 && dir.dot(bC.clone().sub(origin).normalize()) > 0.7) { hit = true; hs = false; }
  const dmg = hit ? (hs ? 100 : 50) : 0; if (hit) { opp.health = Math.max(0, opp.health - dmg); showDamageDealt(dmg, opp.pos.clone().add(new THREE.Vector3(0, hs ? 1.35 : 0.65, 0)), hs); showHitMarker(hs); }
  send({ type: "fpsShot", ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, hit, damage: dmg, target: hit ? oppIdx : null, isMelee: true, headshot: hs }); if (hit && opp.health <= 0) startVictoryLap(game.localIndex, "deathmatch");
}
function rayHitsSphere(origin, direction, sphereCenter, radius) { const toCenter = sphereCenter.clone().sub(origin), projected = toCenter.dot(direction); if (projected < 0) return null; const closest = origin.clone().addScaledVector(direction, projected); return closest.distanceTo(sphereCenter) < radius ? projected : null; }
function rayHitsPlayer(origin, direction, player) { const hC = player.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), hD = rayHitsSphere(origin, direction, hC, FPS_HEAD_HIT_RADIUS), bC = player.pos.clone().add(new THREE.Vector3(0, 0.65, 0)), bD = rayHitsSphere(origin, direction, bC, FPS_BODY_HIT_RADIUS); if (hD !== null && (bD === null || hD < bD)) return { distance: hD, headshot: true }; if (bD !== null) return { distance: bD, headshot: false }; return null; }
function drawLaser(origin, direction, length, hit, isRemote = false, weaponType = "pistol") {
  const start = new THREE.Vector3(); if (!isRemote && world.weaponTip) world.weaponTip.getWorldPosition(start); else start.copy(origin);
  const end = origin.clone().addScaledVector(direction.clone().normalize(), length), mid = start.clone().add(end).multiplyScalar(0.5), isSniper = weaponType === "sniper";
  const r = (isSniper || weaponType === "heavySniper") ? (hit ? 0.07 : 0.052) : (hit ? 0.034 : 0.024), ttl = FPS_LASER_TTL, geometry = new THREE.CylinderGeometry(r, r, start.distanceTo(end), 8, 1, true);
  const material = new THREE.MeshBasicMaterial({ color: hit ? 0xff3366 : (isSniper ? 0xfff0a6 : 0x4df3ff), transparent: true, opacity: isSniper ? 0.96 : (hit ? 0.9 : 0.78), blending: THREE.AdditiveBlending, depthWrite: false });
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
function updatePlayerMeshes() {
  for (let i = 0; i < world.playerMeshes.length; i++) {
    const mesh = world.playerMeshes[i], player = fps.players[i]; mesh.position.copy(player.pos); mesh.rotation.y = -player.yaw; const head = mesh.getObjectByName("headGroup");
    if (head) { head.rotation.x = player.pitch; const g = head.getObjectByName("gun"), m = head.getObjectByName("melee"); if (g && m) { g.visible = (player.weapon === "gun"); m.visible = (player.weapon === "melee"); if (player.primaryWeapon === "pistol") g.scale.set(1, 1, 1); else if (player.primaryWeapon === "rifle" || player.primaryWeapon === "minigun") g.scale.set(1, 1, player.primaryWeapon === "minigun" ? 2.3 : 1.8); else if (player.primaryWeapon === "sniper" || player.primaryWeapon === "heavySniper") g.scale.set(1, 1, player.primaryWeapon === "heavySniper" ? 3.8 : 3.2); else g.scale.set(1.2, 1.1, 2.1); } }
    mesh.visible = (game.phase === "fps" ? i !== game.localIndex : (game.phase === "fpsVictoryLap" ? (i === game.result.winner && i !== game.localIndex) : false));
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
  let mapOver = false, matchOver = reason === "strokes"; if (reason === "deathmatch" && !alreadyRecorded) { game.fpsKillWins[winner]++; mapOver = game.fpsKillWins[winner] >= FPS_KILLS_TO_WIN_MAP || (game.fpsKillWins[0] + game.fpsKillWins[1]) >= 3; if (mapOver) { game.fpsMapWins[winner]++; matchOver = game.fpsMapWins[winner] >= 2; game.fpsMatchOver = matchOver; } } else if (reason === "deathmatch") { mapOver = game.fpsKillWins[winner] >= FPS_KILLS_TO_WIN_MAP || (game.fpsKillWins[0] + game.fpsKillWins[1]) >= 3; matchOver = game.fpsMatchOver; }
  game.phase = "fpsVictoryLap"; game.result = { winner, reason, mapOver, matchOver }; game.fpsRoundWinner = winner; game.victoryLapStart = performance.now(); radarMarker.classList.add("hidden"); if (winner !== game.localIndex) { damageVignette.classList.remove("active"); activeDamagePops.forEach(p => p.element.remove()); activeDamagePops.length = 0; }
  if (game.randomTournament && mapOver && !matchOver && announce) { game.randomWeapon = chooseRandomTournamentWeapon(); game.randomLoadout = chooseRandomLoadout(); game.maxHealth = game.randomLoadout.hp; }
  showFpsToast((reason === "deathmatch" && !matchOver) ? (mapOver ? (winner === game.localIndex ? "MAP WON" : "MAP LOST") : (winner === game.localIndex ? "ROUND WON" : "ROUND LOST")) : (winner === game.localIndex ? "YOU WIN" : "YOU LOSE"));
  if (announce) send({ type: "matchResult", winner, reason, fpsState: serializeFpsDuelState() }); updateHud();
}
function activateRadar() { if (game.phase !== "fps" || game.countdown > 0 || game.radarCooldown > 0 || !abilityAllowed("radar")) return; game.radarTimer = RADAR_DURATION; game.radarCooldown = abilityCooldown("radar", RADAR_COOLDOWN); updateRadarMarker(); updateHud(); }
function updateRadarMarker() { if (game.radarTimer <= 0 || (game.phase !== "fps" && game.phase !== "fpsVictoryLap")) { radarMarker.classList.add("hidden"); return; } const enemy = fps.players[1 - game.localIndex]; if (!enemy) return; const s = toScreen(enemy.pos.clone().add(new THREE.Vector3(0, 1.15, 0))); radarMarker.style.left = `${Math.max(38, Math.min(window.innerWidth - 38, s.x))}px`; radarMarker.style.top = `${Math.max(38, Math.min(window.innerHeight - 38, s.y))}px`; radarMarker.classList.remove("hidden"); }
function finishMatch(winner, reason) { if (game.phase === "result") return; game.phase = "result"; game.result = { winner, reason }; document.exitPointerLock?.(); const totals = totalStrokes(); input.shootHeld = false; input.aiming = false; damageLayer.replaceChildren(); damageVignette.classList.remove("active"); killNotice.classList.add("hidden"); radarMarker.classList.add("hidden"); world.weapon.visible = false; world.meleeWeapon.visible = false; world.playerMeshes.forEach((mesh) => { mesh.visible = false; }); power.classList.add("hidden"); restartBtn.classList.toggle("hidden", game.role === "guest"); resultTitle.textContent = winner === game.localIndex ? "You win" : "You lose"; resultBody.textContent = reason === "deathmatch" ? `Deathmatch maps: ${game.fpsMapWins[0]} - ${game.fpsMapWins[1]}. Golf card: ${totals[0]} - ${totals[1]}.` : `Final golf card: ${totals[0]} - ${totals[1]}.`; if (reason === "deathmatch") { overlay.classList.add("fps"); resultPanel.classList.add("hidden"); resultPanel.classList.remove("fps-result"); showFpsToast(winner === game.localIndex ? "YOU WIN" : "YOU LOSE", `Maps ${game.fpsMapWins[0]}-${game.fpsMapWins[1]}`); } else { overlay.classList.remove("fps"); document.getElementById("victoryBanner")?.remove(); resultPanel.classList.remove("hidden"); resultPanel.classList.remove("fps-result"); } updateHud(); }
function restartTournament(announce = true) { if (announce && game.role === "guest") return; resultPanel.classList.add("hidden"); if (announce) { send({ type: "restart" }); showLobby(); } else showLobby(); }
function updateHud() {
  const totals = totalStrokes(), isFps = game.phase === "fps" || game.phase === "fpsVictoryLap";
  holeText.textContent = isFps ? `D${game.fpsMapIndex + 1}` : `${game.holeIndex + 1}`; turnText.textContent = isFps ? `${game.fpsKillWins[0]}-${game.fpsKillWins[1]}` : (game.role === "solo" ? `P${game.currentPlayer + 1}` : (game.currentPlayer === game.localIndex ? "You" : "Them")); strokeText.textContent = isFps ? `Maps ${game.fpsMapWins[0]} - ${game.fpsMapWins[1]}` : `${totals[0]} - ${totals[1]}`;
  healthChip.classList.toggle("hidden", !isFps); healthText.textContent = `${Math.ceil(fps.players[game.localIndex].health)}`; abilityContainer.classList.toggle("hidden", !isFps);
  if (isFps) {
    for (const [name, id] of [["jump", "#jumpAbility"], ["heal", "#healAbility"], ["radar", "#radarAbility"], ["grenade", "#grenadeAbility"]]) {
      const el = document.querySelector(id);
      el?.classList.toggle("disabled", !abilityAllowed(name));
      el?.classList.toggle("hidden", game.randomTournament && !abilityAllowed(name));
    }
    jumpOverlay.style.height = `${Math.max(0, game.jumpCooldown / abilityCooldown("jump", 3.0)) * 100}%`; jumpCDText.textContent = abilityAllowed("jump") && game.jumpCooldown > 0 ? Math.ceil(game.jumpCooldown) : "";
    healOverlay.style.height = `${Math.max(0, game.healCooldown / abilityCooldown("heal", 10.0)) * 100}%`; healCDText.textContent = abilityAllowed("heal") && game.healCooldown > 0 ? Math.ceil(game.healCooldown) : "";
    radarOverlay.style.height = `${Math.max(0, game.radarCooldown / abilityCooldown("radar", RADAR_COOLDOWN)) * 100}%`; radarCDText.textContent = abilityAllowed("radar") && game.radarCooldown > 0 ? Math.ceil(game.radarCooldown) : "";
    grenadeOverlay.style.height = `${Math.max(0, game.grenadeCooldown / abilityCooldown("grenade", GRENADE_COOLDOWN)) * 100}%`; grenadeCDText.textContent = abilityAllowed("grenade") && game.grenadeCooldown > 0 ? Math.ceil(game.grenadeCooldown) : "";
  }
  weaponChip.classList.toggle("hidden", !isFps); weaponText.textContent = (game.activeWeapon === "gun" ? weaponLabelText(game.primaryWeapon) : "Club");
  ammoChip.classList.toggle("hidden", !isFps || game.activeWeapon !== "gun"); if (game.activeWeapon === "gun") ammoText.textContent = game.reloading ? "RELOAD" : `${game.ammo[game.primaryWeapon]} / ${weaponMaxAmmo(game.primaryWeapon)}`; if (game.phase === "golf") power.classList.remove("hidden");
}
function switchWeapon(wt) { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0 || game.randomTournament) return; requestWeaponSwap(wt, game.primaryWeapon); }
function selectPrimaryWeapon(wp, animate = false) { if (game.randomTournament || !standardWeaponIds.includes(wp)) return; if (animate && game.countdown <= 0) requestWeaponSwap("gun", wp); else applyWeaponState("gun", wp); }
function cycleWeaponCard(dir) { if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; if (game.randomTournament) return; const ws = standardWeaponIds, nI = (ws.indexOf(game.primaryWeapon) + dir + ws.length) % ws.length; pickWeaponCard(ws[nI], game.countdown <= 0); }
function pickWeaponCard(wp, animate = false) { if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; weaponCards.forEach(c => c.classList.toggle("active", c.getAttribute("data-weapon") === wp)); selectPrimaryWeapon(wp, animate); }
function cycleActiveWeapon(dir) { if (game.randomTournament) return; const cI = game.activeWeapon === "melee" ? normalWeaponChoices.length - 1 : Math.max(0, normalWeaponChoices.findIndex(i => i.active === "gun" && i.primary === game.primaryWeapon)); const n = normalWeaponChoices[(cI + dir + normalWeaponChoices.length) % normalWeaponChoices.length]; if (n.active === "melee") switchWeapon("melee"); else pickWeaponCard(n.primary, true); }
function requestWeaponSwap(aw, pw = game.primaryWeapon) { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0 || game.randomTournament) return; game.pendingActiveWeapon = aw; game.pendingPrimaryWeapon = pw; game.weaponSwapTimer = WEAPON_SWAP_DURATION; game.weaponSwapCommitted = false; game.inspectTimer = 0; input.aiming = false; updateHud(); }
function updateWeaponSwap(dt) { if (game.weaponSwapTimer <= 0) return; game.weaponSwapTimer = Math.max(0, game.weaponSwapTimer - dt); if (!game.weaponSwapCommitted && game.weaponSwapTimer <= WEAPON_SWAP_DURATION * 0.5) { applyWeaponState(game.pendingActiveWeapon, game.pendingPrimaryWeapon); game.weaponSwapCommitted = true; } }
function applyWeaponState(aw, pw = game.primaryWeapon) { if (game.randomTournament) { if (isRandomMeleeWeapon()) { aw = "melee"; pw = "pistol"; } else { aw = "gun"; pw = game.randomWeapon; } } else if (aw !== "melee" && !standardWeaponIds.includes(pw)) pw = "pistol"; const changed = game.primaryWeapon !== pw || game.activeWeapon !== aw; game.activeWeapon = aw; game.primaryWeapon = pw; fps.players[game.localIndex].weapon = aw; fps.players[game.localIndex].primaryWeapon = pw; weaponCards.forEach(c => c.classList.toggle("active", aw === "gun" && c.getAttribute("data-weapon") === pw)); if (aw === "melee") game.reloading = false; if (changed) { syncPrimaryWeaponModel(); send({ type: "fpsWeaponChoice", weapon: pw }); } updateHud(); }
function syncPrimaryWeaponModel() { if (!world.barrelGroup) return; world.weaponTopDetails.visible = true; world.weaponSlide.scale.set(1, 1, 1); world.weaponSlide.position.set(0, 0.08, -0.1); world.weaponFrame.scale.set(1, 1, 1); world.weaponFrame.position.set(0, -0.04, -0.05); if (game.primaryWeapon === "pistol") { setWeaponPalette(0xd84545, 0xffeee8, 0x8c1f2b, 0xff3363); world.barrelGroup.scale.set(0.82, 0.9, 0.72); world.barrelGroup.position.set(0, 0, 0.14); world.weaponSlide.scale.set(1.05, 0.95, 0.78); world.weaponFrame.scale.set(1, 1, 0.82); world.rifleMag.visible = false; world.weaponTip.position.set(0, 0.08, -0.48); } else if (game.primaryWeapon === "rifle" || game.primaryWeapon === "minigun") { setWeaponPalette(game.primaryWeapon === "minigun" ? 0x4aa3ff : 0x36c489, game.primaryWeapon === "minigun" ? 0xfff0a6 : 0xe7fff1, game.primaryWeapon === "minigun" ? 0x1b4f91 : 0x1f7f59, game.primaryWeapon === "minigun" ? 0x78e0ff : 0x00f0ff); world.barrelGroup.scale.set(1.05, 1, game.primaryWeapon === "minigun" ? 1.9 : 1.45); world.barrelGroup.position.set(0, 0, -0.02); world.weaponSlide.scale.set(1.08, 1, 1.16); world.weaponFrame.scale.set(1.05, 1, 1.08); world.rifleMag.visible = true; world.weaponTip.position.set(0, 0.08, game.primaryWeapon === "minigun" ? -1.28 : -1.08); } else if (game.primaryWeapon === "sniper" || game.primaryWeapon === "heavySniper") { setWeaponPalette(0xf4f0df, 0x7db8ff, 0xb8b1a0, 0xfff0a6); world.weaponTopDetails.visible = false; world.barrelGroup.scale.set(0.82, 0.9, game.primaryWeapon === "heavySniper" ? 3.3 : 2.75); world.barrelGroup.position.set(0, 0, 0.22); world.weaponSlide.scale.set(0.92, 0.88, 1.55); world.weaponFrame.scale.set(0.92, 0.92, 1.25); world.rifleMag.visible = false; world.weaponTip.position.set(0, 0.08, game.primaryWeapon === "heavySniper" ? -1.82 : -1.52); } else if (game.primaryWeapon === "shotgun") { setWeaponPalette(0x5ab0ff, 0xf3fbff, 0x2369a5, 0xffd166); world.barrelGroup.scale.set(1.2, 1.05, 1.22); world.barrelGroup.position.set(0, 0, 0.03); world.weaponSlide.scale.set(1.08, 1, 1.1); world.weaponFrame.scale.set(1.06, 1, 1.08); world.rifleMag.visible = false; world.weaponTip.position.set(0, 0.08, -0.92); } else { setWeaponPalette(0xff6f61, 0xfff0a6, 0x9d312a, 0xff7a2f); world.barrelGroup.scale.set(1.12, 1.12, 1.35); world.barrelGroup.position.set(0, 0, 0.02); world.weaponSlide.scale.set(1.1, 1.05, 1.12); world.weaponFrame.scale.set(1.08, 1.02, 1.1); world.rifleMag.visible = false; world.weaponTip.position.set(0, 0.08, -1.0); } }
function setWeaponPalette(p, s, a, g) { const mats = world.weaponMaterials; if (!mats) return; mats.matDark.color.setHex(p); mats.matLight.color.setHex(s); mats.matGold.color.setHex(a); mats.matCyanGlow.color.setHex(g); mats.matRedGlow.color.setHex(g); if (mats.matGold.emissive) mats.matGold.emissive.setHex(a).multiplyScalar(0.18); }
function startReload() { if (game.phase !== "fps" || game.reloading || game.activeWeapon !== "gun") return; const cfg = weaponConfig(); if (game.ammo[game.primaryWeapon] === cfg.ammo) return; game.reloading = true; game.reloadTimer = cfg.reload; updateHud(); }
function resetFpsDuelState(randomTournament = false) { game.fpsMapIndex = chooseRandomFpsMap(); game.fpsMapWins = [0, 0]; game.fpsKillWins = [0, 0]; game.fpsMatchOver = false; game.randomTournament = randomTournament; game.fpsMode = randomTournament ? "randomTournament" : "standard"; game.randomWeapon = randomTournament ? chooseRandomTournamentWeapon() : "pistol"; game.randomLoadout = randomTournament ? chooseRandomLoadout() : null; game.maxHealth = game.randomLoadout?.hp || 100; }
function serializeFpsDuelState() { return { mapIndex: game.fpsMapIndex, mapWins: game.fpsMapWins, killWins: game.fpsKillWins, matchOver: game.fpsMatchOver, randomTournament: game.randomTournament, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout, customMap: game.fpsCustomMap, importedAssetUrl: game.fpsImportedAssetUrl }; }
function applyFpsDuelState(s) { if (!s) return; game.fpsMapIndex = s.mapIndex; game.fpsMapWins = s.mapWins; game.fpsKillWins = s.killWins; game.fpsMatchOver = s.matchOver; game.randomTournament = Boolean(s.randomTournament); if (s.randomWeapon) game.randomWeapon = s.randomWeapon; game.randomLoadout = s.randomLoadout || null; game.maxHealth = game.randomLoadout?.hp || 100; if (s.customMap !== undefined) game.fpsCustomMap = s.customMap; if (s.importedAssetUrl !== undefined) game.fpsImportedAssetUrl = s.importedAssetUrl; updateHud(); }
function applyRemoteFpsState(r, s) { r.pos.set(s.x, s.y, s.z); if (r.pos.y < -8) { const spawn = getArenaSpawnPoints(fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0])[s.player] || { x: 0, z: 0 }; r.pos.set(spawn.x, 1, spawn.z); } if (!isPointInsideArena(r.pos, world.arenaFloors, 0.5)) clampArenaPosition(r.pos, 0.5); r.yaw = s.yaw; r.pitch = s.pitch; }
function resetNetworkMotion() {}
function continueFpsDuel() { document.getElementById("victoryBanner")?.remove(); if (game.result?.mapOver) { game.fpsMapIndex = chooseRandomFpsMap(game.fpsMapIndex); game.fpsKillWins = [0, 0]; } enterFps(false, { preserveFpsMatch: true, staticMock: game.fpsMockStatic, randomTournament: game.randomTournament, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout }); }

function onMouseMove(e) { if (!input.pointerLocked) return; const sensitivity = input.mouseSensitivity * (input.aiming ? aimingSensitivityMultiplier() : 1); input.yaw += e.movementX * sensitivity; input.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, input.pitch - e.movementY * sensitivity)); }
function onMouseDown(e) { if (game.phase === "fps" || game.phase === "fpsVictoryLap") { if (e.button === 2) input.aiming = true; if (e.button === 0) { input.shootHeld = true; if (game.countdown <= 0 && game.activeWeapon === "gun") fireHitscan(); if (game.activeWeapon === "melee") fireMelee(); updateHud(); } } }
function onMouseUp(e) { if (e.button === 2) input.aiming = false; if (e.button === 0) input.shootHeld = false; }
function onClick(e) { if (game.phase === "fps" && e.target === canvas && !input.pointerLocked) requestPointerLockSafe(); }
function pointerGroundPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.34), point) ? point : null;
}
function updateGolfDragAim(e) {
  const point = pointerGroundPoint(e);
  if (!point) return;
  game.golfAimPoint.copy(point);
  const pull = point.clone().sub(world.ball.position).setY(0);
  const distance = pull.length();
  game.aimPower = Math.max(0, Math.min(1, distance / 9.5));
  if (distance > 0.001) {
    game.golfShotDir.copy(pull.multiplyScalar(-1).normalize());
    game.aimAngle = Math.atan2(game.golfShotDir.z, game.golfShotDir.x);
  }
  powerFill.style.width = `${game.aimPower * 100}%`;
}
function onPointerDown(e) { if (game.phase === "golf" && canControlGolf() && !game.ballMoving && e.button !== 2) { game.dragging = true; updateGolfDragAim(e); } }
function onPointerMove(e) { if (game.phase === "golf" && game.dragging) updateGolfDragAim(e); }
function finishGolfDrag() { if (game.phase === "golf" && game.dragging && canControlGolf() && !game.ballMoving) { if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true); game.aimPower = 0; input.golfChargeDir = 1; powerFill.style.width = "0%"; if (world.golfAimArrow) world.golfAimArrow.visible = false; shotArrow.classList.add("hidden"); } game.dragging = false; }
function requestPointerLockSafe() {
  if (document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
  try {
    const lockRequest = canvas.requestPointerLock();
    lockRequest?.catch?.(() => {});
  } catch {}
}
function syncSensitivity(v) { const m = Number(v); input.mouseSensitivity = FPS_BASE_MOUSE_SENSITIVITY * m; sensitivityInput.value = m; menuSensitivityInput.value = m; const l = `${m.toFixed(1)}x`; sensitivityValue.textContent = l; menuSensitivityValue.textContent = l; }
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
    if (!isW) { camera.position.set(target.pos.x, target.pos.y + (target.currentCamHeight || 0.72), target.pos.z); camera.lookAt(camera.position.clone().add(directionFromAngles(target.yaw, target.pitch))); world.weapon.visible = world.meleeWeapon.visible = false; }
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
  if (game.phase === "fps" || game.phase === "fpsVictoryLap") { if (!input.pointerLocked) requestPointerLockSafe(); if (game.countdown <= 0) { const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner); if (isW) { if (c === "KeyR") startReload(); if (c === "ArrowLeft") cycleWeaponCard(-1); else if (c === "ArrowRight") cycleWeaponCard(1); else if (c === "ArrowUp") switchWeapon("gun"); else if (c === "ArrowDown") switchWeapon("melee"); else if (/^Digit[1-3]$/.test(c) && !game.randomTournament) pickWeaponCard(standardWeaponIds[Number(c.slice(5)) - 1] || "pistol", true); else if (c === "Digit4" && !game.randomTournament) switchWeapon("melee"); else if (c === "KeyB") toggleBuildMode(); else if (c === "KeyV") placeBuildBox(); else if (c === "KeyE") activateJumpAbility(); else if (c === "KeyQ") activateHealAbility(); else if (c === "KeyF" && !game.reloading && game.meleeSwingTimer <= 0) game.inspectTimer = 2.0; else if (c === "KeyG") throwGrenade(); else if (c === "KeyC") activateRadar(); } } }
});
window.addEventListener("keyup", (e) => { const c = codeFromKeyEvent(e); if (game.phase === "golf" && c === "Space" && canControlGolf() && !game.ballMoving) { if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true); game.aimPower = 0; input.golfChargeDir = 1; powerFill.style.width = "0%"; if (world.golfAimArrow) world.golfAimArrow.visible = false; } input.keys.delete(e.code); input.keys.delete(c); });
document.addEventListener("pointerlockchange", () => input.pointerLocked = document.pointerLockElement === canvas);
document.addEventListener("mousemove", onMouseMove); document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); document.addEventListener("click", onClick);
weaponCards.forEach(c => c.addEventListener("click", () => { if (game.phase !== "fps" || game.countdown <= 0 || game.randomTournament) return; const weapon = c.getAttribute("data-weapon"); if (!standardWeaponIds.includes(weapon)) return; weaponCards.forEach(x => x.classList.remove("active")); c.classList.add("active"); selectPrimaryWeapon(weapon); }));
canvas.addEventListener("pointerdown", onPointerDown); window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", finishGolfDrag); window.addEventListener("mousedown", (e) => { if (e.button === 0 && game.phase === "golf") onPointerDown(e); }); window.addEventListener("mousemove", onPointerMove); window.addEventListener("mouseup", finishGolfDrag); canvas.addEventListener("contextmenu", (e) => e.preventDefault());
createBtn.addEventListener("click", createMatch); joinBtn.addEventListener("click", joinMatch); soloBtn.addEventListener("click", () => beginLocalMatch(cleanPhrase(phraseInput.value) || generatePhrase()));
startGolfBtn.addEventListener("click", () => { if (game.role !== "guest") { const ids = drawTournamentHoleIds(); send({ type: "startTournament", courseIds: ids }); startGolf(ids); } });
startFpsBtn.addEventListener("click", () => { if (game.role !== "guest") { resetFpsDuelState(false); send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); enterFps(false, { preserveFpsMatch: true }); } });
startRandomFpsBtn?.addEventListener("click", () => { if (game.role !== "guest") { resetFpsDuelState(true); send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); enterFps(false, { preserveFpsMatch: true, randomTournament: true, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout }); } });
leaveBtn.addEventListener("click", () => { closePeer(); showMenu(); }); randomBtn.addEventListener("click", () => { phraseInput.value = generatePhrase(); if (menuError) menuError.textContent = ""; }); restartBtn.addEventListener("click", () => restartTournament());
settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden")); sensitivityInput.addEventListener("input", () => syncSensitivity(sensitivityInput.value)); menuSensitivityInput.addEventListener("input", () => syncSensitivity(menuSensitivityInput.value));
loadMapBtn?.addEventListener("click", () => { try { game.fpsCustomMap = mapJsonInput?.value.trim() ? JSON.parse(mapJsonInput.value) : null; localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap)); if (game.phase === "fps") setupArena(); } catch { if (mapJsonInput) mapJsonInput.value = "Invalid map JSON"; } });
saveMapBtn?.addEventListener("click", () => { game.fpsCustomMap ||= { version: 1, boxes: [] }; const text = JSON.stringify(game.fpsCustomMap, null, 2); if (mapJsonInput) mapJsonInput.value = text; localStorage.setItem("golfDuelCustomArena", text); });
loadAssetBtn?.addEventListener("click", () => { game.fpsImportedAssetUrl = assetUrlInput?.value.trim() || ""; localStorage.setItem("golfDuelArenaAsset", game.fpsImportedAssetUrl); if (game.phase === "fps") setupArena(); });
window.addEventListener("wheel", (e) => { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0) return; const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner); if (isW) { cycleActiveWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
phraseInput.value = generatePhrase(); syncSensitivity(1.0);
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

function weaponLabel(wp) {
  if (weaponCatalog[wp]) return weaponCatalog[wp].label;
  return "Club";
}

setupLighting(); setupGolfObjects(); setupArena(); 
scene.add(world.golfRoot, world.arenaRoot); world.arenaRoot.visible = false;
setupWeapon(); resize(); applyTournamentHoleIds(drawTournamentHoleIds()); resetGolfHole(); showMenuScene(); updateHud(); 

initNetworkLinks({
  startGolf, enterFps, applyGolfState, applyFpsDuelState, serializeGolfState, 
  resetFpsDuelState, serializeFpsDuelState, resetNetworkMotion, applyRemoteFpsState, 
  spawnGrenade, createExplosion, removeRemoteGrenadesNear, startVictoryLap, 
  restartTournament, showLobby, showMenuScene, drawLaser, drawMeleeSwipe,
  showDamageTaken, showKilledBy, weaponLabel, showDamageDealt
});

animate();
