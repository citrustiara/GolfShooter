import "./globals.js";

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
  } else {
    game.fpsMapIndex = chooseRandomFpsMap();
    game.randomWeapon = "pistol";
    game.randomLoadout = null;
    game.maxHealth = 100;
    fps.gravity = FPS_DEFAULT_GRAVITY;
  }
}
function serializeFpsDuelState() {
  return {
    playerCount: game.playerCount,
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
    customMapActive: game.fpsCustomMapActive
  };
}
function applyFpsDuelState(s) {
  if (!s) return;
  game.playerCount = Math.max(2, s.playerCount || s.mapWins?.length || s.killWins?.length || game.playerCount);
  ensureFpsPlayers(game.playerCount);
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
  if (game.fpsMatchConfig?.maps?.length) applyFpsMatchMapSlot(game.fpsMatchConfig.currentMapSlot || 0);
  updateHud();
}
function applyRemoteFpsState(r, s) { if (!r.targetPos) r.targetPos = new THREE.Vector3(); const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0]; const spawn = getArenaSpawnPoints(theme)[s.player] || { x: s.x ?? 0, z: s.z ?? 0 }; const x = Number.isFinite(s.x) ? s.x : spawn.x; const z = Number.isFinite(s.z) ? s.z : spawn.z; const y = Number.isFinite(s.y) ? s.y : getSpawnY({ x, z }, theme); r.targetPos.set(x, y, z); if (r.targetPos.y < -8) { r.targetPos.set(spawn.x, getSpawnY(spawn, theme), spawn.z); } if (!isPointInsideArena(r.targetPos, world.arenaFloors, 0.5)) clampArenaPosition(r.targetPos, 0.5); r.targetYaw = s.yaw; r.targetPitch = s.pitch; }
function resetNetworkMotion() {}
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
  resetFpsDuelState,
  serializeFpsDuelState,
  applyFpsDuelState,
  applyRemoteFpsState,
  resetNetworkMotion,
  continueFpsDuel
});
