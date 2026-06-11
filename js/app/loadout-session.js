import "./globals.js";

function weaponConfig(id = game.primaryWeapon) { return weaponCatalog[id] || weaponCatalog.pistol; }
function weaponMaxAmmo(id = game.primaryWeapon) { return weaponConfig(id).ammo; }
function weaponLabelText(id = game.primaryWeapon) { return id === "melee" ? "Club" : weaponConfig(id).label; }
function freshAmmoState() { return Object.fromEntries(weaponIds.map((id) => [id, weaponMaxAmmo(id)])); }
function chooseRandomTournamentWeapon() { return randomTournamentWeapons[Math.floor(Math.random() * randomTournamentWeapons.length)] || "heavySniper"; }
function isRandomMeleeWeapon(id = game.randomWeapon) { return id === "melee"; }
function defaultWeaponList() { return [...standardWeaponIds, "melee"].filter((id, index, arr) => id && arr.indexOf(id) === index); }
function defaultAbilityKeys() { return Object.fromEntries(ABILITY_CHOICES.map((ability) => [ability.id, ability.defaultKey])); }
function defaultLoadout() { return { id: "standard", hp: 100, speed: 1.0, gravity: FPS_DEFAULT_GRAVITY, abilities: ["jump", "heal", "grenade", "smoke", "radar"], cooldowns: {}, weapons: defaultWeaponList(), abilityKeys: defaultAbilityKeys() }; }
function chooseRandomLoadout() { const presets = randomLoadoutPresets.length ? randomLoadoutPresets : [defaultLoadout()]; return presets[Math.floor(Math.random() * presets.length)] || presets[0]; }
function chooseRandomFpsMap(exclude = -1) { const choices = fpsArenaThemes.map((_, index) => index).filter((index) => index !== exclude); return choices[Math.floor(Math.random() * choices.length)] ?? 0; }
function activeFpsMatchEntry(slot = game.fpsMatchConfig?.currentMapSlot ?? 0) {
  const maps = game.fpsMatchConfig?.maps;
  return Array.isArray(maps) && maps.length ? maps[Math.max(0, Math.min(maps.length - 1, Number(slot) || 0))] : null;
}
function mergeMapConfig(base = null, override = null) {
  if (!base && !override) return null;
  return {
    ...(base || {}),
    ...(override || {}),
    cooldowns: { ...(base?.cooldowns || {}), ...(override?.cooldowns || {}) },
    abilityKeys: { ...(base?.abilityKeys || {}), ...(override?.abilityKeys || {}) },
    weapons: override?.weapons || base?.weapons,
    abilities: override?.abilities || base?.abilities
  };
}
function currentMapConfig() {
  if (game.randomTournament) return null;
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0];
  const themeCfg = theme ? (theme.config || theme.loadout || null) : null;
  const customCfg = game.fpsCustomMapActive && game.fpsCustomMap ? (game.fpsCustomMap.config || game.fpsCustomMap.loadout || null) : null;
  const entryCfg = activeFpsMatchEntry()?.config || null;
  return mergeMapConfig(mergeMapConfig(themeCfg, customCfg), entryCfg);
}
function getAbilityKey(abilityName) {
  const loadout = activeLoadout();
  if (loadout?.abilityKeys?.[abilityName]) return loadout.abilityKeys[abilityName];
  const cfg = currentMapConfig();
  if (cfg?.abilityKeys?.[abilityName]) return cfg.abilityKeys[abilityName];
  return ABILITY_CHOICES.find((ability) => ability.id === abilityName)?.defaultKey || "KeyE";
}
function loadoutWeaponList(loadout = activeLoadout()) {
  return (Array.isArray(loadout?.weapons) && loadout.weapons.length ? loadout.weapons : defaultWeaponList()).filter((id, index, arr) => id && arr.indexOf(id) === index);
}
function activeWeaponIds() { return loadoutWeaponList().filter((id) => id !== "melee" && weaponCatalog[id]); }
function meleeAllowed() { return loadoutWeaponList().includes("melee"); }
function activeLoadout() {
  const mapCfg = currentMapConfig();
  if (mapCfg) {
    return {
      id: mapCfg.id || "map-custom",
      hp: mapCfg.hp ?? 100,
      speed: mapCfg.speed ?? 1.0,
      gravity: mapCfg.gravity ?? FPS_DEFAULT_GRAVITY,
      abilities: mapCfg.abilities || ["jump", "heal", "grenade", "smoke", "radar"],
      cooldowns: mapCfg.cooldowns || {},
      weapons: mapCfg.weapons || defaultWeaponList(),
      abilityKeys: { ...defaultAbilityKeys(), ...(mapCfg.abilityKeys || {}) }
    };
  }
  const loadout = game.randomTournament && game.randomLoadout ? game.randomLoadout : (randomLoadoutPresets[randomLoadoutPresets.length - 1] || defaultLoadout());
  return { ...defaultLoadout(), ...loadout, cooldowns: { ...(loadout?.cooldowns || {}) }, abilityKeys: { ...defaultAbilityKeys(), ...(loadout?.abilityKeys || {}) }, weapons: loadout?.weapons || defaultWeaponList() };
}
function activeFpsRules() {
  const match = game.fpsMatchConfig || {};
  const mapCount = Math.max(1, Math.min(9, Math.floor(Number(match.mapCount || match.maps?.length || FPS_MAPS_PER_DUEL) || FPS_MAPS_PER_DUEL)));
  const roundsPerMap = Math.max(1, Math.min(99, Math.floor(Number(match.roundsPerMap || currentMapConfig()?.roundsPerMap || FPS_DEFAULT_ROUNDS_PER_MAP) || FPS_DEFAULT_ROUNDS_PER_MAP)));
  const fallbackSlot = game.fpsCompletedMaps || (Array.isArray(game.fpsMapWins) ? game.fpsMapWins.reduce((sum, wins) => sum + wins, 0) : 0);
  const currentMapSlot = Math.max(0, Math.min(mapCount - 1, Math.floor(Number(match.currentMapSlot ?? fallbackSlot) || 0)));
  const gravity = Number.isFinite(Number(activeLoadout().gravity)) ? Number(activeLoadout().gravity) : FPS_DEFAULT_GRAVITY;
  return { mapCount, roundsPerMap, currentMapSlot, gravity };
}
function abilityAllowed(name) { return activeLoadout().abilities.includes(name); }
function abilityCooldown(name, fallback) { return activeLoadout().cooldowns?.[name] ?? fallback; }
function jumpAbilityStrength() { return 22.5; }
function aimingSensitivityMultiplier() {
  // Standard shooter ADS scaling ("zoom ratio"): sensitivity follows the ratio
  // of the tangents of the half-FOVs, so a target moves across the screen at
  // the same perceived speed whether hip-firing or hard-scoped with a sniper.
  const cfg = weaponConfig();
  const aimFov = cfg.aimFov || FPS_AIM_FOV;
  const baseFov = game.fov || FPS_DEFAULT_FOV;
  const ratio = Math.tan((aimFov * Math.PI) / 360) / Math.tan((baseFov * Math.PI) / 360);
  return Math.max(0.05, Math.min(1, ratio));
}
let finalKillRevealTimeout = null;
let finalKillSoundTimeout = null;

function clearFinalKillCinematic() {
  if (finalKillRevealTimeout) {
    clearTimeout(finalKillRevealTimeout);
    finalKillRevealTimeout = null;
  }
  if (finalKillSoundTimeout) {
    clearTimeout(finalKillSoundTimeout);
    finalKillSoundTimeout = null;
  }
  game.finalKillCinematicActive = false;
  game.finalKillCinematicRevealed = false;
  overlay?.classList.remove("final-kill-running");
  const root = document.getElementById("finalKillOverlay");
  if (!root) return;
  root.classList.add("hidden");
  root.classList.remove("active", "revealed");
  root.setAttribute("aria-hidden", "true");
}

function fpsScoreLeader(values = []) {
  const best = Math.max(...values);
  const leaders = values.map((score, index) => score === best ? index : -1).filter((index) => index !== -1);
  return leaders.length === 1 ? leaders[0] : -1;
}

function willFpsKillWinMapOrMatch(winner = game.localIndex) {
  if (!Number.isInteger(winner) || winner < 0) return false;
  const rules = activeFpsRules();
  const nextKillWins = [...game.fpsKillWins];
  while (nextKillWins.length <= winner) nextKillWins.push(0);
  nextKillWins[winner] = (nextKillWins[winner] || 0) + 1;
  const roundWinsNeeded = Math.floor(rules.roundsPerMap / 2) + 1;
  const playedRounds = nextKillWins.reduce((sum, wins) => sum + wins, 0);
  const mapOver = playedRounds >= rules.roundsPerMap || Math.max(...nextKillWins) >= roundWinsNeeded;
  if (!mapOver) return false;
  const mapWinner = fpsScoreLeader(nextKillWins);
  const nextMapWins = [...game.fpsMapWins];
  if (mapWinner !== -1) nextMapWins[mapWinner] = (nextMapWins[mapWinner] || 0) + 1;
  const matchOver = game.fpsMatchConfig?.maps?.length
    ? rules.currentMapSlot >= rules.mapCount - 1
    : Math.max(...nextMapWins) >= Math.ceil(rules.mapCount / 2) || (game.fpsCompletedMaps || 0) + 1 >= rules.mapCount;
  const matchWinner = matchOver ? fpsScoreLeader(nextMapWins) : null;
  return (mapWinner === winner) || (matchWinner === winner);
}

function finalKillStatusText(result = game.result) {
  if (result?.matchOver && result.matchWinner === game.localIndex) return "YOU WON THE MATCH";
  if (result?.mapOver && !result.mapTied && fpsScoreLeader(game.fpsKillWins) === game.localIndex) return "YOU WON THE MAP";
  return "YOU WON";
}

function showFinalKillCinematic(result = game.result) {
  const root = document.getElementById("finalKillOverlay");
  if (!root) return false;
  document.getElementById("victoryBanner")?.remove();
  clearFinalKillCinematic();
  game.finalKillCinematicActive = true;
  game.finalKillCinematicRevealed = false;
  hideKillNotice();
  damageVignette?.classList.remove("active");
  hitMarker?.classList.remove("active", "headshot");
  const status = document.getElementById("finalKillStatus");
  if (status) status.textContent = finalKillStatusText(result);
  overlay?.classList.add("final-kill-running");
  root.classList.remove("hidden");
  root.classList.add("active");
  root.classList.remove("revealed");
  root.setAttribute("aria-hidden", "false");
  void root.offsetWidth;
  finalKillSoundTimeout = window.setTimeout(() => {
    finalKillSoundTimeout = null;
    if (!game.finalKillCinematicActive || game.phase !== "fpsVictoryLap") return;
    playSound("targetEliminated", { volume: result?.matchOver ? 1 : 0.9 });
  }, 1100);
  finalKillRevealTimeout = window.setTimeout(() => {
    finalKillRevealTimeout = null;
    if (!game.finalKillCinematicActive || game.phase !== "fpsVictoryLap") return;
    game.finalKillCinematicRevealed = true;
    root.classList.add("revealed");
  }, 1500);
  return true;
}

function clearVictoryBanner() {
  document.getElementById("victoryBanner")?.remove();
  clearFinalKillCinematic();
}
function hideKillNotice() { game.killNoticeTimer = 0; killNotice.classList.add("hidden"); killNotice.replaceChildren(); killNotice.dataset.victim = ""; killNotice.dataset.detailed = "0"; }
function resultOverlayVisible() { return game.phase === "result" || game.finalKillCinematicActive; }
function victoryComicMonochromeAmount(now = performance.now()) {
  if (game.phase !== "fpsVictoryLap" || game.result?.reason !== "deathmatch") return 0;
  return 0;
}
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
    fps.players.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), yaw: 0, pitch: 0, health: 100, grounded: false, groundSurface: null, sliding: false, visualSlide: 0, currentCamHeight: 1.58, primaryWeapon: "pistol" });
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

Object.assign(globalThis, {
  weaponConfig,
  weaponMaxAmmo,
  weaponLabelText,
  freshAmmoState,
  chooseRandomTournamentWeapon,
  isRandomMeleeWeapon,
  defaultWeaponList,
  defaultAbilityKeys,
  defaultLoadout,
  chooseRandomLoadout,
  chooseRandomFpsMap,
  activeFpsMatchEntry,
  mergeMapConfig,
  currentMapConfig,
  getAbilityKey,
  loadoutWeaponList,
  activeWeaponIds,
  meleeAllowed,
  activeLoadout,
  activeFpsRules,
  abilityAllowed,
  abilityCooldown,
  jumpAbilityStrength,
  aimingSensitivityMultiplier,
  clearFinalKillCinematic,
  willFpsKillWinMapOrMatch,
  showFinalKillCinematic,
  clearVictoryBanner,
  hideKillNotice,
  resultOverlayVisible,
  victoryComicMonochromeAmount,
  activeGolfPlayerIndex,
  golfBallForPlayer,
  useGolfBall,
  aliveFpsPlayerIndexes,
  opposingFpsPlayers,
  formatScores,
  ensureFpsPlayers,
  syncPlayerCountFromUi,
  getSpawnY
});
