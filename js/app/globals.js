import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import {
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y,
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV,
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, FPS_HEAD_HIT_HEIGHT, FPS_BODY_HIT_HEIGHT, FPS_SLIDE_VISUAL_DROP, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, SMOKE_GRENADE_COOLDOWN, SMOKE_GRENADE_SPEED, SMOKE_GRENADE_RADIUS, SMOKE_GRENADE_DURATION, HOLES_PER_TOURNAMENT,
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons,
  tournamentCombinations
} from "../core/constants.js";
import { canvas, scene, camera, clock, raycaster, materials, setupLighting, resize, lights, renderScene } from "../core/engine.js";
import { game, input, world, fps } from "../core/state.js";
import { ensureAudio, playSound, silenceGameAudio, resumeGameAudio, startLobbyMusic, stopLobbyMusic, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards } from "../core/utils.js";
import { closePeer, createMatch, joinMatch, send, initNetworkLinks } from "../core/network.js";
import { holes, resetTournamentState, resetGolfHole, setupGolfObjects, ensureGolfBalls, applyTournamentHoleIds, drawTournamentHoleIds } from "../golf/logic.js";
import { setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints } from "../fps/logic.js";
import { fpsArenaThemes } from "../fps/themes.js";
import { loadGameContent } from "../content/loader.js";
import { rampLocalPoint, rampSurfaceInfo, rampSurfaceY, rampUphillDirection, rampWorldPoint } from "../core/ramps.js";
import {
  collideSphereWithTriangleMeshColliders,
  meshGroundSurface,
  meshSurfaceYAtPoint,
  raycastTriangleMeshColliders,
  resolvePlayerCeilingVsTriangleMeshColliders,
  resolvePlayerVsTriangleMeshColliders,
  sphereIntersectsTriangleMeshColliders
} from "../fps/mesh-collision.js";

const overlay = document.querySelector("#overlay"), menu = document.querySelector("#menu"), lobby = document.querySelector("#lobby"), resultPanel = document.querySelector("#result"), hud = document.querySelector("#hud"), phraseInput = document.querySelector("#phraseInput"), menuError = document.querySelector("#menuError"), holeLabel = document.querySelector("#holeLabel"), turnLabel = document.querySelector("#turnLabel"), strokeLabel = document.querySelector("#strokeLabel"), holeText = document.querySelector("#holeText"), turnText = document.querySelector("#turnText"), strokeText = document.querySelector("#strokeText"), healthChip = document.querySelector("#healthChip"), healthText = document.querySelector("#healthText"), abilityContainer = document.querySelector("#abilityContainer"), jumpOverlay = document.querySelector("#jumpOverlay"), healOverlay = document.querySelector("#healOverlay"), radarOverlay = document.querySelector("#radarOverlay"), jumpCDText = document.querySelector("#jumpCDText"), healCDText = document.querySelector("#healCDText"), radarCDText = document.querySelector("#radarCDText"), jetpackOverlay = document.querySelector("#jetpackOverlay"), jetpackCDText = document.querySelector("#jetpackCDText"), power = document.querySelector("#power"), powerFill = document.querySelector("#powerFill"), shotArrow = document.querySelector("#shotArrow"), damageLayer = document.querySelector("#damageLayer"), countdown = document.querySelector("#countdown"), settingsBtn = document.querySelector("#settingsBtn"), settingsPanel = document.querySelector("#settingsPanel"), sensitivityInput = document.querySelector("#sensitivityInput"), sensitivityValue = document.querySelector("#sensitivityValue"), menuSensitivityInput = document.querySelector("#menuSensitivityInput"), menuSensitivityValue = document.querySelector("#menuSensitivityValue"), weaponChip = document.querySelector("#weaponChip"), weaponText = document.querySelector("#weaponText"), resultTitle = document.querySelector("#resultTitle"), resultBody = document.querySelector("#resultBody"), ammoChip = document.querySelector("#ammoChip"), ammoText = document.querySelector("#ammoText"), weaponSelectOverlay = document.querySelector("#weaponSelectOverlay"), weaponSelectTimer = document.querySelector("#weaponSelectTimer"), weaponCards = document.querySelectorAll(".weapon-card"), hitMarker = document.querySelector("#hitMarker"), damageVignette = document.querySelector("#damageVignette"), grenadeOverlay = document.querySelector("#grenadeOverlay"), grenadeCDText = document.querySelector("#grenadeCDText"), smokeOverlay = document.querySelector("#smokeOverlay"), smokeCDText = document.querySelector("#smokeCDText"), killNotice = document.querySelector("#killNotice"), radarMarker = document.querySelector("#radarMarker"), lobbyStatus = document.querySelector("#lobbyStatus"), startGolfBtn = document.querySelector("#startGolfBtn"), startFpsBtn = document.querySelector("#startFpsBtn"), startRandomFpsBtn = document.querySelector("#startRandomFpsBtn"), mapJsonInput = document.querySelector("#mapJsonInput"), loadMapBtn = document.querySelector("#loadMapBtn"), saveMapBtn = document.querySelector("#saveMapBtn"), assetUrlInput = document.querySelector("#assetUrlInput"), loadAssetBtn = document.querySelector("#loadAssetBtn"), leaveBtn = document.querySelector("#leaveBtn"), createBtn = document.querySelector("#createBtn"), joinBtn = document.querySelector("#joinBtn"), soloBtn = document.querySelector("#soloBtn"), randomBtn = document.querySelector("#randomBtn"), restartBtn = document.querySelector("#restartBtn"), finalKillBackBtn = document.querySelector("#finalKillBackBtn"), finalKillReplayBtn = document.querySelector("#finalKillReplayBtn"), finalKillHostNote = document.querySelector("#finalKillHostNote");
const dashOverlay = document.querySelector("#dashOverlay"), dashCDText = document.querySelector("#dashCDText"), grappleOverlay = document.querySelector("#grappleOverlay"), grappleCDText = document.querySelector("#grappleCDText"), scopeOverlay = document.querySelector("#scopeOverlay"), enemyBoxLayer = document.querySelector("#enemyBoxLayer"), crosshairEl = document.querySelector("#crosshair"), grappleReticle = document.querySelector("#grappleReticle");
const fovInput = document.querySelector("#fovInput"), fovValue = document.querySelector("#fovValue"), ingameLeaveBtn = document.querySelector("#ingameLeaveBtn"), practiceMapOptions = document.querySelector("#practiceMapOptions"), golfMapSelect = document.querySelector("#golfMapSelect"), fpsMapSelect = document.querySelector("#fpsMapSelect"), playerCountSelect = document.querySelector("#playerCountSelect"), mapUploadInput = document.querySelector("#mapUploadInput"), practiceMapCountInput = document.querySelector("#practiceMapCountInput"), practiceRoundsInput = document.querySelector("#practiceRoundsInput"), practiceMapList = document.querySelector("#practiceMapList");

const FPS_PLAYER_RADIUS_WORLD = 0.42;
const FPS_PLAYER_HEIGHT_WORLD = 1.78;
const FPS_RAMP_PROBE_MARGIN = 0.08;
const FPS_RAMP_LAND_EPSILON = 0.10;
const FPS_RAMP_STEP_UP = 0.56;
const FPS_RAMP_STEP_DOWN = 0.72;
const FPS_RAMP_SOLID_TOP_CLEARANCE = 0.06;
const FPS_WALK_MAX_SPEED = 13.6;
const FPS_SLIDE_MAX_SPEED = 21.0;
const FPS_DEFAULT_GRAVITY = -30;
const FPS_DEFAULT_ROUNDS_PER_MAP = 3;
const ABILITY_CHOICES = [
  { id: "jump", label: "Jump Boost", defaultKey: "KeyE" },
  { id: "heal", label: "Heal", defaultKey: "KeyQ" },
  { id: "grenade", label: "Grenade", defaultKey: "KeyG" },
  { id: "smoke", label: "Smoke", defaultKey: "KeyX" },
  { id: "radar", label: "Radar", defaultKey: "KeyC" },
  { id: "jetpack", label: "Jetpack", defaultKey: "Space" },
  { id: "dash", label: "Dash", defaultKey: "KeyV" },
  { id: "grapple", label: "Grapple Hook", defaultKey: "KeyF" }
];
const DASH_COOLDOWN = 3.5;
const DASH_DURATION = 0.4;
const DASH_SPEED = 60;
const GRAPPLE_COOLDOWN = 3.5;
const GRAPPLE_RANGE = 70;
const GRAPPLE_SPEED = 74;
// Damage dealt when the grapple hook latches onto an enemy player.
const GRAPPLE_PLAYER_DAMAGE = 50;
const ABILITY_KEY_OPTIONS = ["KeyQ", "KeyE", "KeyF", "KeyG", "KeyC", "KeyV", "KeyX", "KeyZ", "Space", "ShiftLeft", "ControlLeft"];

Object.assign(globalThis, {
  THREE,
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y,
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV,
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, FPS_HEAD_HIT_HEIGHT, FPS_BODY_HIT_HEIGHT, FPS_SLIDE_VISUAL_DROP, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, SMOKE_GRENADE_COOLDOWN, SMOKE_GRENADE_SPEED, SMOKE_GRENADE_RADIUS, SMOKE_GRENADE_DURATION, HOLES_PER_TOURNAMENT,
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons, tournamentCombinations,
  canvas, scene, camera, clock, raycaster, materials, setupLighting, resize, lights, renderScene,
  game, input, world, fps,
  ensureAudio, playSound, silenceGameAudio, resumeGameAudio, startLobbyMusic, stopLobbyMusic, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards,
  closePeer, createMatch, joinMatch, send, initNetworkLinks,
  holes, resetTournamentState, resetGolfHole, setupGolfObjects, ensureGolfBalls, applyTournamentHoleIds, drawTournamentHoleIds,
  setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints,
  fpsArenaThemes, loadGameContent,
  rampLocalPoint, rampSurfaceInfo, rampSurfaceY, rampUphillDirection, rampWorldPoint,
  collideSphereWithTriangleMeshColliders, meshGroundSurface, meshSurfaceYAtPoint, raycastTriangleMeshColliders, resolvePlayerCeilingVsTriangleMeshColliders, resolvePlayerVsTriangleMeshColliders, sphereIntersectsTriangleMeshColliders,
  overlay, menu, lobby, resultPanel, hud, phraseInput, menuError, holeLabel, turnLabel, strokeLabel, holeText, turnText, strokeText, healthChip, healthText, abilityContainer, jumpOverlay, healOverlay, radarOverlay, jumpCDText, healCDText, radarCDText, jetpackOverlay, jetpackCDText, power, powerFill, shotArrow, damageLayer, countdown, settingsBtn, settingsPanel, sensitivityInput, sensitivityValue, menuSensitivityInput, menuSensitivityValue, weaponChip, weaponText, resultTitle, resultBody, ammoChip, ammoText, weaponSelectOverlay, weaponSelectTimer, weaponCards, hitMarker, damageVignette, grenadeOverlay, grenadeCDText, smokeOverlay, smokeCDText, killNotice, radarMarker, lobbyStatus, startGolfBtn, startFpsBtn, startRandomFpsBtn, mapJsonInput, loadMapBtn, saveMapBtn, assetUrlInput, loadAssetBtn, leaveBtn, createBtn, joinBtn, soloBtn, randomBtn, restartBtn, finalKillBackBtn, finalKillReplayBtn, finalKillHostNote,
  fovInput, fovValue, ingameLeaveBtn, practiceMapOptions, golfMapSelect, fpsMapSelect, playerCountSelect, mapUploadInput, practiceMapCountInput, practiceRoundsInput, practiceMapList,
  FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD, FPS_RAMP_PROBE_MARGIN, FPS_RAMP_LAND_EPSILON, FPS_RAMP_STEP_UP, FPS_RAMP_STEP_DOWN, FPS_RAMP_SOLID_TOP_CLEARANCE, FPS_WALK_MAX_SPEED, FPS_SLIDE_MAX_SPEED,
  activeDamagePops: [],
  lastFrame: performance.now(),
  hitMarkerTimeout: null,
  lastDamageSoundAt: 0,
  weaponIds: Object.keys(weaponCatalog),
  standardWeaponIds: ["pistol", "rifle", "sniper"],
  randomLoadoutPresets: [],
  practiceMapConfigs: [],
  FPS_DEFAULT_GRAVITY,
  FPS_DEFAULT_ROUNDS_PER_MAP,
  ABILITY_CHOICES,
  ABILITY_KEY_OPTIONS,
  DASH_COOLDOWN, DASH_DURATION, DASH_SPEED, GRAPPLE_COOLDOWN, GRAPPLE_RANGE, GRAPPLE_SPEED, GRAPPLE_PLAYER_DAMAGE,
  dashOverlay, dashCDText, grappleOverlay, grappleCDText, scopeOverlay, enemyBoxLayer, crosshairEl, grappleReticle
});
