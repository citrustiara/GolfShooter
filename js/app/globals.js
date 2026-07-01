import * as THREE from "three";
import {
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y,
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV,
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, FPS_HEAD_HIT_HEIGHT, FPS_BODY_HIT_HEIGHT, FPS_SLIDE_VISUAL_DROP, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, SMOKE_GRENADE_COOLDOWN, SMOKE_GRENADE_SPEED, SMOKE_GRENADE_RADIUS, SMOKE_GRENADE_DURATION, HOLES_PER_TOURNAMENT,
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons,
  tournamentCombinations,
  FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD, FPS_RAMP_PROBE_MARGIN, FPS_RAMP_LAND_EPSILON, FPS_RAMP_STEP_UP, FPS_RAMP_STEP_DOWN, FPS_RAMP_SOLID_TOP_CLEARANCE, FPS_WALK_MAX_SPEED, FPS_SLIDE_MAX_SPEED, FPS_DEFAULT_GRAVITY, FPS_DEFAULT_ROUNDS_PER_MAP, ABILITY_CHOICES, DASH_COOLDOWN, DASH_DURATION, DASH_SPEED, GRAPPLE_COOLDOWN, GRAPPLE_RANGE, GRAPPLE_SPEED, GRAPPLE_HOLD_LIMIT, GRAPPLE_PLAYER_DAMAGE, GRAPPLE_MAX_CHARGES, GRAPPLE_QUICK_GAP, GRAPPLE_LOCK_DAMAGE, GRAPPLE_LOCK_CONE_DEG, PARRY_GUARD_DURATION, PARRY_GUARD_COOLDOWN, LOW_HP_THRESHOLD, LOW_HP_EFFECT_DURATION, LOW_HP_HEARTBEAT_INTERVAL, LOW_HP_MAX_GRAY, HEAL_EFFECT_DURATION, DAMAGE_EFFECT_DURATION, PLAYER_HUD_COLORS, ROUND_TIME_LIMIT, ABILITY_KEY_OPTIONS
} from "../core/constants.js";
import { canvas, scene, camera, clock, raycaster, materials, setupLighting, resize, lights, renderScene, setSceneRenderProfile } from "../core/engine.js";
import { game, input, world, fps } from "../core/state.js";
import { ensureAudio, playSound, silenceGameAudio, resumeGameAudio, startLobbyMusic, stopLobbyMusic, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards } from "../core/utils.js";
import { closePeer, createMatch, joinMatch, send, initNetworkLinks, updateNetworkPing } from "../core/network.js";
import { holes, resetTournamentState, resetGolfHole, setupGolfObjects, ensureGolfBalls, applyTournamentHoleIds, drawTournamentHoleIds } from "../golf/logic.js";
import { setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints } from "../fps/logic.js";
import { updatePlayerAnimation } from "../fps/player-animation.js";
import { setPlayerOutlineVisible } from "../fps/player-outline.js";
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

const overlay = document.querySelector("#overlay"), menu = document.querySelector("#menu"), lobby = document.querySelector("#lobby"), resultPanel = document.querySelector("#result"), hud = document.querySelector("#hud"), nicknameInput = document.querySelector("#nicknameInput"), phraseInput = document.querySelector("#phraseInput"), menuError = document.querySelector("#menuError"), holeLabel = document.querySelector("#holeLabel"), turnLabel = document.querySelector("#turnLabel"), strokeLabel = document.querySelector("#strokeLabel"), holeText = document.querySelector("#holeText"), turnText = document.querySelector("#turnText"), strokeText = document.querySelector("#strokeText"), healthChip = document.querySelector("#healthChip"), healthText = document.querySelector("#healthText"), abilityContainer = document.querySelector("#abilityContainer"), jumpOverlay = document.querySelector("#jumpOverlay"), healOverlay = document.querySelector("#healOverlay"), radarOverlay = document.querySelector("#radarOverlay"), jumpCDText = document.querySelector("#jumpCDText"), healCDText = document.querySelector("#healCDText"), radarCDText = document.querySelector("#radarCDText"), jetpackOverlay = document.querySelector("#jetpackOverlay"), jetpackCDText = document.querySelector("#jetpackCDText"), power = document.querySelector("#power"), powerFill = document.querySelector("#powerFill"), shotArrow = document.querySelector("#shotArrow"), damageLayer = document.querySelector("#damageLayer"), countdown = document.querySelector("#countdown"), settingsBtn = document.querySelector("#settingsBtn"), settingsPanel = document.querySelector("#settingsPanel"), sensitivityInput = document.querySelector("#sensitivityInput"), sensitivityValue = document.querySelector("#sensitivityValue"), weaponChip = document.querySelector("#weaponChip"), weaponText = document.querySelector("#weaponText"), resultTitle = document.querySelector("#resultTitle"), resultBody = document.querySelector("#resultBody"), ammoChip = document.querySelector("#ammoChip"), ammoText = document.querySelector("#ammoText"), weaponSelectOverlay = document.querySelector("#weaponSelectOverlay"), weaponSelectTimer = document.querySelector("#weaponSelectTimer"), weaponCards = document.querySelectorAll(".weapon-card"), hitMarker = document.querySelector("#hitMarker"), damageVignette = document.querySelector("#damageVignette"), grenadeOverlay = document.querySelector("#grenadeOverlay"), grenadeCDText = document.querySelector("#grenadeCDText"), smokeOverlay = document.querySelector("#smokeOverlay"), smokeCDText = document.querySelector("#smokeCDText"), killNotice = document.querySelector("#killNotice"), battleLog = document.querySelector("#battleLog"), radarMarker = document.querySelector("#radarMarker"), lobbyStatus = document.querySelector("#lobbyStatus"), startGolfBtn = document.querySelector("#startGolfBtn"), startFpsBtn = document.querySelector("#startFpsBtn"), startRandomFpsBtn = document.querySelector("#startRandomFpsBtn"), leaveBtn = document.querySelector("#leaveBtn"), createBtn = document.querySelector("#createBtn"), joinBtn = document.querySelector("#joinBtn"), soloBtn = document.querySelector("#soloBtn"), randomBtn = document.querySelector("#randomBtn"), restartBtn = document.querySelector("#restartBtn"), finalKillBackBtn = document.querySelector("#finalKillBackBtn"), finalKillReplayBtn = document.querySelector("#finalKillReplayBtn"), finalKillHostNote = document.querySelector("#finalKillHostNote");
const dashOverlay = document.querySelector("#dashOverlay"), dashCDText = document.querySelector("#dashCDText"), grappleOverlay = document.querySelector("#grappleOverlay"), grappleCDText = document.querySelector("#grappleCDText"), grappleChargesEl = document.querySelector("#grappleCharges"), scopeOverlay = document.querySelector("#scopeOverlay"), enemyBoxLayer = document.querySelector("#enemyBoxLayer"), grappleLockBox = document.querySelector("#grappleLockBox"), crosshairEl = document.querySelector("#crosshair"), grappleReticle = document.querySelector("#grappleReticle"), healVignette = document.querySelector("#healVignette"), spectateBanner = document.querySelector("#spectateBanner"), spectateBannerName = document.querySelector("#spectateBannerName"), spectateBannerSub = document.querySelector("#spectateBannerSub"), defeatOverlay = document.querySelector("#defeatOverlay"), defeatKilledByEl = document.querySelector("#defeatKilledBy"), defeatStatusEl = document.querySelector("#defeatStatus"), defeatBackBtn = document.querySelector("#defeatBackBtn"), defeatReplayBtn = document.querySelector("#defeatReplayBtn"), defeatHostNote = document.querySelector("#defeatHostNote"), fpsScoreboard = document.querySelector("#fpsScoreboard"), fpsScoreLeft = document.querySelector("#fpsScoreLeft"), fpsScoreRight = document.querySelector("#fpsScoreRight"), fpsScoreTimer = document.querySelector("#fpsScoreTimer"), fpsScoreMaps = document.querySelector("#fpsScoreMaps");
const perfStats = document.querySelector("#perfStats"), fovInput = document.querySelector("#fovInput"), fovValue = document.querySelector("#fovValue"), mouseFixInput = document.querySelector("#mouseFixInput"), ingameLeaveBtn = document.querySelector("#ingameLeaveBtn"), chatHud = document.querySelector("#chatHud"), chatLog = document.querySelector("#chatLog"), chatForm = document.querySelector("#chatForm"), chatInput = document.querySelector("#chatInput"), abilityKeySettings = document.querySelector("#abilityKeySettings"), abilityKeyList = document.querySelector("#abilityKeyList"), lobbyModePicker = document.querySelector("#lobbyModePicker"), quickTournamentBtn = document.querySelector("#quickTournamentBtn"), quickFpsDuelBtn = document.querySelector("#quickFpsDuelBtn"), customLobbyBtn = document.querySelector("#customLobbyBtn"), customActionGrid = document.querySelector("#customActionGrid"), customBackBtn = document.querySelector("#customBackBtn"), startCustomBothBtn = document.querySelector("#startCustomBothBtn"), practiceMapOptions = document.querySelector("#practiceMapOptions"), golfMapSelect = document.querySelector("#golfMapSelect"), fpsMapSelect = document.querySelector("#fpsMapSelect"), playerCountSelect = document.querySelector("#playerCountSelect"), practiceMapCountInput = document.querySelector("#practiceMapCountInput"), practiceRoundsInput = document.querySelector("#practiceRoundsInput"), practiceMapList = document.querySelector("#practiceMapList");

Object.assign(globalThis, {
  THREE,
  GOLF_AIM_SENSITIVITY, GOLF_MAX_SHOT_SPEED, GOLF_GROUND_FRICTION, GOLF_ICE_FRICTION, CUP_PULL_RADIUS, CUP_PULL_FORCE, CUP_SINK_RADIUS, CUP_SINK_SPEED_MAX, CUP_SURFACE_Y,
  FPS_LASER_TTL, FPS_BASE_MOUSE_SENSITIVITY, FPS_PLAYER_HIT_RADIUS, FPS_AIM_SENSITIVITY_MULTIPLIER, FPS_DEFAULT_FOV, FPS_AIM_FOV, FPS_SNIPER_AIM_FOV,
  FPS_HEAD_HIT_RADIUS, FPS_BODY_HIT_RADIUS, FPS_HEAD_HIT_HEIGHT, FPS_BODY_HIT_HEIGHT, FPS_SLIDE_VISUAL_DROP, GRENADE_COOLDOWN, GRENADE_SPEED, GRENADE_GRAVITY, GRENADE_SPLASH_RADIUS, GRENADE_MAX_DAMAGE, SMOKE_GRENADE_COOLDOWN, SMOKE_GRENADE_SPEED, SMOKE_GRENADE_RADIUS, SMOKE_GRENADE_DURATION, HOLES_PER_TOURNAMENT,
  FPS_COUNTDOWN_DURATION, WEAPON_SWAP_DURATION, FPS_MAPS_PER_DUEL, RADAR_DURATION, RADAR_COOLDOWN, weaponCatalog, randomTournamentWeapons, tournamentCombinations,
  canvas, scene, camera, clock, raycaster, materials, setupLighting, resize, lights, renderScene, setSceneRenderProfile,
  game, input, world, fps,
  ensureAudio, playSound, silenceGameAudio, resumeGameAudio, startLobbyMusic, stopLobbyMusic, generatePhrase, cleanPhrase, flatDistance, toScreen, directionFromAngles, lerpAngle, moveTowards,
  closePeer, createMatch, joinMatch, send, initNetworkLinks, updateNetworkPing,
  holes, resetTournamentState, resetGolfHole, setupGolfObjects, ensureGolfBalls, applyTournamentHoleIds, drawTournamentHoleIds,
  setupArena, makePlayerMesh, clampArenaPosition, isPointInsideArena, getArenaSpawnPoints,
  updatePlayerAnimation, setPlayerOutlineVisible,
  fpsArenaThemes, loadGameContent,
  rampLocalPoint, rampSurfaceInfo, rampSurfaceY, rampUphillDirection, rampWorldPoint,
  collideSphereWithTriangleMeshColliders, meshGroundSurface, meshSurfaceYAtPoint, raycastTriangleMeshColliders, resolvePlayerCeilingVsTriangleMeshColliders, resolvePlayerVsTriangleMeshColliders, sphereIntersectsTriangleMeshColliders,
  overlay, menu, lobby, resultPanel, hud, nicknameInput, phraseInput, menuError, holeLabel, turnLabel, strokeLabel, holeText, turnText, strokeText, healthChip, healthText, abilityContainer, jumpOverlay, healOverlay, radarOverlay, jumpCDText, healCDText, radarCDText, jetpackOverlay, jetpackCDText, power, powerFill, shotArrow, damageLayer, countdown, settingsBtn, settingsPanel, sensitivityInput, sensitivityValue, weaponChip, weaponText, resultTitle, resultBody, ammoChip, ammoText, weaponSelectOverlay, weaponSelectTimer, weaponCards, hitMarker, damageVignette, grenadeOverlay, grenadeCDText, smokeOverlay, smokeCDText, killNotice, battleLog, radarMarker, lobbyStatus, startGolfBtn, startFpsBtn, startRandomFpsBtn, leaveBtn, createBtn, joinBtn, soloBtn, randomBtn, restartBtn, finalKillBackBtn, finalKillReplayBtn, finalKillHostNote,
  perfStats, fovInput, fovValue, mouseFixInput, ingameLeaveBtn, chatHud, chatLog, chatForm, chatInput, abilityKeySettings, abilityKeyList, lobbyModePicker, quickTournamentBtn, quickFpsDuelBtn, customLobbyBtn, customActionGrid, customBackBtn, startCustomBothBtn, practiceMapOptions, golfMapSelect, fpsMapSelect, playerCountSelect, practiceMapCountInput, practiceRoundsInput, practiceMapList,
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
  DASH_COOLDOWN, DASH_DURATION, DASH_SPEED, GRAPPLE_COOLDOWN, GRAPPLE_RANGE, GRAPPLE_SPEED, GRAPPLE_HOLD_LIMIT, GRAPPLE_PLAYER_DAMAGE,
  GRAPPLE_MAX_CHARGES, GRAPPLE_QUICK_GAP, GRAPPLE_LOCK_DAMAGE, GRAPPLE_LOCK_CONE_DEG, PARRY_GUARD_DURATION, PARRY_GUARD_COOLDOWN,
  LOW_HP_THRESHOLD, LOW_HP_EFFECT_DURATION, LOW_HP_HEARTBEAT_INTERVAL, LOW_HP_MAX_GRAY, HEAL_EFFECT_DURATION, DAMAGE_EFFECT_DURATION, PLAYER_HUD_COLORS, ROUND_TIME_LIMIT,
  dashOverlay, dashCDText, grappleOverlay, grappleCDText, grappleChargesEl, scopeOverlay, enemyBoxLayer, grappleLockBox, crosshairEl, grappleReticle, healVignette,
  spectateBanner, spectateBannerName, spectateBannerSub, defeatOverlay, defeatKilledByEl, defeatStatusEl, defeatBackBtn, defeatReplayBtn, defeatHostNote,
  fpsScoreboard, fpsScoreLeft, fpsScoreRight, fpsScoreTimer, fpsScoreMaps
});
