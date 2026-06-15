import "./globals.js";

function clonePlain(value) {
  if (value === undefined || value === null) return null;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function cloneFpsMatchConfig(config) {
  const cloned = sanitizeFpsMatchConfig(clonePlain(config));
  if (cloned) cloned.currentMapSlot = 0;
  return cloned;
}

function captureFpsReplaySnapshot() {
  const matchConfig = cloneFpsMatchConfig(game.fpsMatchConfig);
  game.fpsReplaySnapshot = {
    playerCount: game.playerCount,
    randomTournament: Boolean(game.randomTournament),
    fpsMatchConfig: matchConfig,
    mapIndex: game.fpsMapIndex,
    randomWeapon: game.randomWeapon,
    randomLoadout: clonePlain(game.randomLoadout),
    customMap: clonePlain(game.fpsCustomMap),
    customMapActive: Boolean(game.fpsCustomMapActive),
    importedAssetUrl: game.fpsImportedAssetUrl,
    randomTournamentPlayedMaps: clonePlain(game.randomTournamentPlayedMaps || [])
  };
  return game.fpsReplaySnapshot;
}

function resetFpsDuelState(randomTournament = false) {
  ensureFpsPlayers(game.playerCount);
  game.fpsMapWins = Array(game.playerCount).fill(0);
  game.fpsKillWins = Array(game.playerCount).fill(0);
  game.fpsRoundWinner = null;
  game.fpsLastMapOver = false;
  game.fpsLastMapTied = false;
  game.fpsCompletedMaps = 0;
  game.fpsMatchWinner = null;
  game.fpsMatchOver = false;
  game.randomTournament = randomTournament;
  game.fpsMode = randomTournament ? "randomTournament" : "standard";
  game.fpsMatchConfig = null;
  if (randomTournament) {
    game.randomTournamentPlayedMaps = [];
    applyRandomTournamentCombination();
    captureFpsReplaySnapshot();
  } else {
    game.fpsMapIndex = chooseRandomFpsMap();
    game.randomWeapon = "pistol";
    game.randomLoadout = null;
    game.maxHealth = 100;
    fps.gravity = FPS_DEFAULT_GRAVITY;
    game.fpsReplaySnapshot = null;
  }
}
function serializeFpsDuelState() {
  return {
    playerCount: game.playerCount,
    playerNames: playerNamesPayload?.() || game.playerNames,
    matchFlow: game.matchFlow,
    mapIndex: game.fpsMapIndex,
    fpsMatchConfig: game.fpsMatchConfig,
    mapWins: game.fpsMapWins,
    killWins: game.fpsKillWins,
    roundWinner: game.fpsRoundWinner,
    lastMapOver: game.fpsLastMapOver,
    lastMapTied: game.fpsLastMapTied,
    completedMaps: game.fpsCompletedMaps,
    matchWinner: game.fpsMatchWinner,
    matchOver: game.fpsMatchOver,
    randomTournament: game.randomTournament,
    randomTournamentPlayedMaps: game.randomTournamentPlayedMaps,
    randomWeapon: game.randomWeapon,
    randomLoadout: game.randomLoadout,
    customMap: game.fpsCustomMap,
    importedAssetUrl: game.fpsImportedAssetUrl,
    customMapActive: game.fpsCustomMapActive,
    replaySnapshot: game.fpsReplaySnapshot
  };
}
function applyFpsDuelState(s) {
  if (!s) return;
  game.playerCount = Math.max(2, s.playerCount || s.mapWins?.length || s.killWins?.length || game.playerCount);
  ensureFpsPlayers(game.playerCount);
  applyPlayerNames?.(s.playerNames);
  if (s.matchFlow) game.matchFlow = s.matchFlow;
  game.fpsMapIndex = s.mapIndex ?? game.fpsMapIndex;
  game.fpsMatchConfig = sanitizeFpsMatchConfig(s.fpsMatchConfig);
  game.fpsMapWins = s.mapWins || game.fpsMapWins;
  game.fpsKillWins = s.killWins || game.fpsKillWins;
  game.fpsRoundWinner = s.roundWinner ?? game.fpsRoundWinner;
  game.fpsLastMapOver = Boolean(s.lastMapOver);
  game.fpsLastMapTied = Boolean(s.lastMapTied);
  game.fpsCompletedMaps = Math.max(0, Math.floor(Number(s.completedMaps || 0) || 0));
  game.fpsMatchWinner = s.matchWinner ?? null;
  game.fpsMatchOver = Boolean(s.matchOver);
  game.randomTournament = Boolean(s.randomTournament);
  if (s.randomTournamentPlayedMaps !== undefined) game.randomTournamentPlayedMaps = s.randomTournamentPlayedMaps;
  if (s.randomWeapon) game.randomWeapon = s.randomWeapon;
  game.randomLoadout = s.randomLoadout || null;
  game.maxHealth = game.randomLoadout?.hp || activeLoadout().hp || 100;
  if (s.customMap !== undefined) game.fpsCustomMap = s.customMap;
  if (s.importedAssetUrl !== undefined) game.fpsImportedAssetUrl = s.importedAssetUrl;
  if (s.customMapActive !== undefined) game.fpsCustomMapActive = s.customMapActive;
  if (s.replaySnapshot !== undefined) game.fpsReplaySnapshot = clonePlain(s.replaySnapshot);
  if (game.fpsMatchConfig?.maps?.length) applyFpsMatchMapSlot(game.fpsMatchConfig.currentMapSlot || 0);
  updateHud();
}
function applyRemoteFpsState(r, s) { if (!r.targetPos) r.targetPos = new THREE.Vector3(); const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]; const spawn = getArenaSpawnPoints(theme)[s.player] || { x: s.x ?? 0, z: s.z ?? 0 }; const x = Number.isFinite(s.x) ? s.x : spawn.x; const z = Number.isFinite(s.z) ? s.z : spawn.z; const y = Number.isFinite(s.y) ? s.y : getSpawnY({ x, z }, theme); r.targetPos.set(x, y, z); if (r.targetPos.y < -8) { r.targetPos.set(spawn.x, getSpawnY(spawn, theme), spawn.z); } if (!isPointInsideArena(r.targetPos, world.arenaFloors, 0.5)) clampArenaPosition(r.targetPos, 0.5); r.targetYaw = s.yaw; r.targetPitch = s.pitch; }
function resetNetworkMotion() {}
function resetFpsScoresForReplay(playerCount = game.playerCount) {
  ensureFpsPlayers(playerCount);
  game.fpsMapWins = Array(game.playerCount).fill(0);
  game.fpsKillWins = Array(game.playerCount).fill(0);
  game.fpsRoundWinner = null;
  game.fpsLastMapOver = false;
  game.fpsLastMapTied = false;
  game.fpsCompletedMaps = 0;
  game.fpsMatchWinner = null;
  game.fpsMatchOver = false;
}
function replayFpsMatch(announce = true) {
  if (announce && game.role === "guest") {
    send({ type: "postMatchAction", action: "replayFps", player: game.localIndex });
    setFinalKillActionNote?.("Replay request sent — waiting for the host.");
    return;
  }
  const snapshot = clonePlain(game.fpsReplaySnapshot) || clonePlain(captureFpsReplaySnapshot());
  if (!snapshot) return;
  const playerCount = Math.max(2, Math.floor(Number(snapshot.playerCount || game.playerCount) || 2));
  game.playerCount = playerCount;
  resetFpsScoresForReplay(playerCount);
  game.randomTournament = Boolean(snapshot.randomTournament);
  game.fpsMode = game.randomTournament ? "randomTournament" : "standard";
  game.fpsMatchConfig = cloneFpsMatchConfig(snapshot.fpsMatchConfig);
  game.fpsMapIndex = Number.isFinite(Number(snapshot.mapIndex)) ? Number(snapshot.mapIndex) : game.fpsMapIndex;
  game.randomWeapon = snapshot.randomWeapon || "pistol";
  game.randomLoadout = clonePlain(snapshot.randomLoadout);
  game.randomTournamentPlayedMaps = clonePlain(snapshot.randomTournamentPlayedMaps || []);
  if (snapshot.customMap !== undefined) game.fpsCustomMap = clonePlain(snapshot.customMap);
  game.fpsCustomMapActive = Boolean(snapshot.customMapActive);
  game.fpsImportedAssetUrl = snapshot.importedAssetUrl || "";
  if (game.fpsMatchConfig?.maps?.length) applyFpsMatchMapSlot(0);
  game.fpsReplaySnapshot = snapshot;
  clearVictoryBanner();
  if (game.role === "host") send({ type: "phaseFps", fpsState: serializeFpsDuelState() });
  enterFps(false, {
    preserveFpsMatch: true,
    randomTournament: game.randomTournament,
    randomWeapon: game.randomWeapon,
    randomLoadout: game.randomLoadout
  });
}
function continueFpsDuel() {
  document.getElementById("victoryBanner")?.remove();
  if (game.role !== "guest") {
    if (game.result?.mapOver) {
      if (game.fpsMatchConfig?.maps?.length && !game.randomTournament) {
        applyFpsMatchMapSlot((game.fpsMatchConfig.currentMapSlot || 0) + 1);
      } else if (!game.randomTournament) {
        game.fpsMapIndex = chooseRandomFpsMap(game.fpsMapIndex);
      }
      game.fpsKillWins = Array(game.playerCount).fill(0);
      game.fpsLastMapOver = false;
      game.fpsLastMapTied = false;
    }
    if (game.role === "host") send({ type: "phaseFps", fpsState: serializeFpsDuelState() });
    enterFps(false, {
      preserveFpsMatch: true,
      staticMock: game.fpsMockStatic,
      randomTournament: game.randomTournament,
      randomWeapon: game.randomWeapon,
      randomLoadout: game.randomLoadout
    });
  }
}

Object.assign(globalThis, {
  clonePlain,
  cloneFpsMatchConfig,
  captureFpsReplaySnapshot,
  resetFpsDuelState,
  serializeFpsDuelState,
  applyFpsDuelState,
  applyRemoteFpsState,
  resetNetworkMotion,
  replayFpsMatch,
  continueFpsDuel
});
