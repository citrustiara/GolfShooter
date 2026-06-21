import "./app/globals.js";

await import("./app/player-names.js");
await import("./app/loadout-session.js");
await import("./app/practice-planner.js");
await import("./app/scene-flow.js?v=8");
await import("./app/golf-runtime.js");
await import("./app/fps-frame.js");
await import("./app/fps-movement.js");
await import("./app/fps-combat.js");
await import("./app/fps-grenades.js");
await import("./app/fps-grapple.js");
await import("./app/fps-parry.js");
await import("./app/fps-bot.js");
await import("./app/match-results.js");
await import("./app/hud-weapons.js?v=2");
await import("./app/fps-network-state.js");
await import("./app/input-events.js?v=8");
await import("./app/notices-content.js");
await import("./app/menu-bg.js");

const app = globalThis;

app.applyLoadedContent(await app.loadGameContent());
app.setupLighting();
app.setupGolfObjects();
app.setupArena();
app.scene.add(app.world.golfRoot, app.world.arenaRoot);
app.world.arenaRoot.visible = false;
app.setupWeapon();
app.resize();
app.applyTournamentHoleIds(app.drawTournamentHoleIds());
app.resetGolfHole();
app.showMenuScene();
app.initializePlayerNamesUi();
app.updateHud();

app.initNetworkLinks({
  startGolf: app.startGolf,
  enterFps: app.enterFps,
  applyGolfState: app.applyGolfState,
  applyGolfHoleScored: app.applyGolfHoleScored,
  applyGolfForceEnd: app.applyGolfForceEnd,
  applyFpsDuelState: app.applyFpsDuelState,
  serializeGolfState: app.serializeGolfState,
  resetFpsDuelState: app.resetFpsDuelState,
  serializeFpsDuelState: app.serializeFpsDuelState,
  resetNetworkMotion: app.resetNetworkMotion,
  applyRemoteFpsState: app.applyRemoteFpsState,
  spawnGrenade: app.spawnGrenade,
  createExplosion: app.createExplosion,
  createSmokeCloud: app.createSmokeCloud,
  removeRemoteGrenadesNear: app.removeRemoteGrenadesNear,
  startVictoryLap: app.startVictoryLap,
  restartTournament: app.restartTournament,
  replayFpsMatch: app.replayFpsMatch,
  showLobby: app.showLobby,
  showMenuScene: app.showMenuScene,
  drawLaser: app.drawLaser,
  drawMeleeSwipe: app.drawMeleeSwipe,
  drawParryEffect: app.drawParryEffect,
  startParryCooldownForPlayer: app.startParryCooldownForPlayer,
  showDamageTaken: app.showDamageTaken,
  showKilledBy: app.showKilledBy,
  weaponLabel: app.weaponLabel,
  showDamageDealt: app.showDamageDealt,
  showHitMarker: app.showHitMarker,
  markEnemyOnHit: app.markEnemyOnHit,
  markLocalPlayerOnHit: app.markLocalPlayerOnHit,
  showEliminationNotice: app.showEliminationNotice,
  showBattleLogElimination: app.showBattleLogElimination,
  triggerKillFade: app.triggerKillFade,
  showChatMessage: app.showChatMessage
});

app.animate();
