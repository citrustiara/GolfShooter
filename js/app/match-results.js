import "./globals.js";

function showFpsToast(text, detail = "") {
  document.getElementById("victoryBanner")?.remove();
  const banner = document.createElement("div");
  banner.className = "victory-banner";
  banner.id = "victoryBanner";
  banner.textContent = detail ? `${text} · ${detail}` : text;
  overlay.appendChild(banner);
}
function scoreLeader(values) {
  const best = Math.max(...values);
  const leaders = values.map((score, index) => score === best ? index : -1).filter((index) => index !== -1);
  return leaders.length === 1 ? leaders[0] : -1;
}
function startVictoryLap(winner, reason, announce = true, alreadyRecorded = false) {
  if (game.phase === "result" || game.phase === "fpsVictoryLap") return;
  if (reason === "deathmatch" && !Number.isInteger(winner)) return;
  const rules = activeFpsRules();
  let mapOver = false;
  let mapTied = false;
  let matchOver = reason === "strokes";
  let matchWinner = winner;

  // "Rounds per map" is a best-of-X setting: the map ends as soon as one
  // player has more round wins than anyone could still catch up to.
  const roundWinsNeeded = Math.floor(rules.roundsPerMap / 2) + 1;
  if (reason === "deathmatch" && !alreadyRecorded) {
    if (Number.isInteger(winner) && winner >= 0 && winner < game.fpsKillWins.length) game.fpsKillWins[winner]++;
    const playedRounds = game.fpsKillWins.reduce((sum, wins) => sum + wins, 0);
    mapOver = playedRounds >= rules.roundsPerMap || Math.max(...game.fpsKillWins) >= roundWinsNeeded;
    if (mapOver) {
      const mapWinner = scoreLeader(game.fpsKillWins);
      mapTied = mapWinner === -1;
      game.fpsCompletedMaps = (game.fpsCompletedMaps || 0) + 1;
      if (!mapTied) game.fpsMapWins[mapWinner]++;
      if (game.fpsMatchConfig?.maps?.length) {
        matchOver = rules.currentMapSlot >= rules.mapCount - 1;
      } else {
        const bestMapWins = Math.max(...game.fpsMapWins);
        matchOver = bestMapWins >= Math.ceil(rules.mapCount / 2) || (game.fpsCompletedMaps || 0) >= rules.mapCount;
      }
      if (matchOver) matchWinner = scoreLeader(game.fpsMapWins);
      game.fpsMatchOver = matchOver;
      game.fpsMatchWinner = matchOver ? matchWinner : null;
    }
  } else if (reason === "deathmatch") {
    mapOver = game.fpsLastMapOver
      || game.fpsKillWins.reduce((sum, wins) => sum + wins, 0) >= rules.roundsPerMap
      || Math.max(...game.fpsKillWins) >= roundWinsNeeded;
    mapTied = Boolean(game.fpsLastMapTied);
    matchOver = game.fpsMatchOver;
    matchWinner = game.fpsMatchWinner ?? winner;
  }

  game.fpsLastMapOver = mapOver;
  game.fpsLastMapTied = mapTied;
  game.phase = "fpsVictoryLap";
  game.result = { winner, reason, mapOver, mapTied, matchOver, matchWinner };
  game.fpsRoundWinner = winner;
  game.victoryLapStart = performance.now();
  game.parryCooldown = 0;
  game.parryReloadTotal = 0;
  game.parryAnimTimer = 0;
  document.getElementById("reloadProgress")?.classList.add("hidden");
  radarMarker.classList.add("hidden");
  if (winner !== game.localIndex) {
    damageVignette.classList.remove("active");
    activeDamagePops.forEach(p => p.element.remove());
    activeDamagePops.length = 0;
  }
  if (game.randomTournament && mapOver && !matchOver && announce) applyRandomTournamentCombination(game.fpsMapIndex);
  const localWonRound = winner === game.localIndex;
  const localWonMatch = matchOver && matchWinner === game.localIndex;
  const mapWinner = mapOver ? scoreLeader(game.fpsKillWins) : null;
  const localWonMap = mapOver && !mapTied && mapWinner === game.localIndex;
  const toast = reason === "deathmatch" && !matchOver
    ? (mapOver ? (mapTied ? "MAP TIED" : (localWonMap ? "MAP WON" : "MAP LOST")) : (winner === -1 ? "ROUND TIED" : (localWonRound ? "ROUND WON" : "ROUND LOST")))
    : (matchWinner === -1 ? "MATCH TIED" : (localWonMatch ? "YOU WIN" : "YOU LOSE"));
  const useFinalKillCinematic = winner === game.localIndex && fpsResultHasFinalKillCinematic(game.result);
  if (useFinalKillCinematic && showFinalKillCinematic(game.result)) {
    // The cinematic handles its own delayed stinger and result text.
  } else {
    showFpsToast(toast, reason === "deathmatch" && mapOver ? `Rounds ${formatScores(game.fpsKillWins)}` : "");
    if (matchOver) {
      if (matchWinner !== -1) playSound(localWonMatch ? "matchWin" : "matchLose", { volume: 0.9 });
    } else if (winner !== -1) {
      playSound(localWonRound ? "roundWin" : "roundLose", { volume: 0.8 });
    }
  }
  if (announce) send({ type: "matchResult", winner, reason, fpsState: serializeFpsDuelState() });
  updateHud();
}
function activateRadar() {
  if (game.phase !== "fps" || game.countdown > 0 || fps.players[game.localIndex]?.health <= 0) return;
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
function updateRadarMarker() { radarMarker.classList.add("hidden"); }
function finishMatch(winner, reason) {
  if (game.phase === "result") return;
  game.phase = "result";
  game.result = { winner, reason };
  // FPS matches already play their stinger in startVictoryLap.
  if (reason === "golf" && winner !== -1) playSound(winner === game.localIndex || game.role === "solo" ? "matchWin" : "matchLose", { volume: 0.9 });
  document.exitPointerLock?.();
  const totals = totalStrokes();
  input.shootHeld = false;
  input.aiming = false;
  input.pointerLocked = false;
  damageLayer.replaceChildren();
  damageVignette.classList.remove("active");
  killNotice.classList.add("hidden");
  clearBattleLog?.();
  radarMarker.classList.add("hidden");
  world.weapon.visible = false;
  world.meleeWeapon.visible = false;
  world.playerMeshes.forEach((mesh) => { mesh.visible = false; });
  power.classList.add("hidden");
  overlay.classList.remove("fps");
  settingsBtn.classList.add("hidden");
  settingsPanel.classList.add("hidden");
  clearVictoryBanner();

  let waitText = resultPanel.querySelector(".result-wait");
  if (!waitText) {
    waitText = document.createElement("div");
    waitText.className = "result-wait hidden";
    resultPanel.appendChild(waitText);
  }
  const guestWaiting = game.role === "guest";
  restartBtn.classList.toggle("hidden", guestWaiting);
  waitText.classList.toggle("hidden", !guestWaiting);
  waitText.textContent = guestWaiting ? "Waiting for the host to return everyone to the lobby." : "";

  resultPanel.classList.remove("win-result", "lose-result", "tie-result", "fps-result", "guest-result");
  resultPanel.classList.toggle("guest-result", guestWaiting);
  if (winner === -1) {
    resultTitle.textContent = "DRAW";
    resultPanel.classList.add("tie-result");
  } else {
    const localWon = winner === game.localIndex;
    resultTitle.textContent = localWon ? "YOU WON" : "YOU LOST";
    resultPanel.classList.add(localWon ? "win-result" : "lose-result");
  }

  const arenaScore = `Arena score: ${formatScores(game.fpsMapWins)}.`;
  const golfScore = `Golf scorecard: ${formatScores(totals)}.`;
  resultBody.textContent = reason === "deathmatch" ? `${arenaScore} ${golfScore}` : golfScore;
  resultPanel.classList.remove("hidden");
  updateHud();
}
function finalKillBackToLobby() {
  if (game.role === "guest") {
    send({ type: "postMatchAction", action: "lobby", player: game.localIndex });
    setFinalKillActionNote?.("Request sent — waiting for the host.");
    return;
  }
  restartTournament();
}
function restartTournament(announce = true) { if (announce && game.role === "guest") return; resultPanel.classList.add("hidden"); if (announce) { send({ type: "restart" }); showLobby(); } else showLobby(); }

Object.assign(globalThis, {
  showFpsToast,
  scoreLeader,
  startVictoryLap,
  activateRadar,
  updateRadarMarker,
  finishMatch,
  finalKillBackToLobby,
  restartTournament
});
