import "./globals.js";

const FPS_PITCH_LIMIT = Math.PI / 2 - 0.1;
const PERF_STATS_UPDATE_MS = 250;
const MOUSE_FIX_STORAGE_KEY = "golfDuelMouseFix";
const MOUSE_STALE_EVENT_MS = 80;
const MOUSE_FRAME_DELTA_LIMIT = 900;
const GOLF_MOUSE_FIX_DRAG_LIMIT_FACTOR = 1.25;
const CHAT_MAX_LENGTH = 120;
const CHAT_MAX_MESSAGES = 7;
let smoothedPerfFps = 0;
let lastPerfStatsAt = 0;
let chatMessageSeq = 0;
let lastPauseOpenedByPointerUnlockAt = 0;

function updatePerfStats(dt, now) {
  updateNetworkPing?.(now);
  if (dt > 0) {
    const frameFps = 1 / dt;
    smoothedPerfFps = smoothedPerfFps > 0 ? smoothedPerfFps * 0.9 + frameFps * 0.1 : frameFps;
  }
  if (!perfStats || now - lastPerfStatsAt < PERF_STATS_UPDATE_MS) return;
  lastPerfStatsAt = now;
  const fpsValue = smoothedPerfFps > 0 ? Math.round(smoothedPerfFps) : "--";
  const pingValue = Number.isFinite(game.networkPingMs) ? `${Math.round(game.networkPingMs)}ms` : "--";
  perfStats.textContent = `FPS ${fpsValue} · Ping ${pingValue}`;
}

function canCaptureMouseLook() {
  return input.pointerLocked && !game.finalKillCinematicActive && !(game.phase === "fps" && fps.players[game.localIndex]?.health <= 0);
}

function mouseEventAgeMs(e, now) {
  const eventTime = Number(e?.timeStamp);
  if (!Number.isFinite(eventTime)) return 0;
  const age = now - eventTime;
  return age >= 0 && age < 60000 ? age : 0;
}

function queueMouseMovement(e, now) {
  if (input.mouseFixEnabled && mouseEventAgeMs(e, now) > MOUSE_STALE_EVENT_MS) return;
  const dx = Number(e?.movementX);
  const dy = Number(e?.movementY);
  if (Number.isFinite(dx)) input.mouseDeltaX += dx;
  if (Number.isFinite(dy)) input.mouseDeltaY += dy;
}

function onMouseMove(e) {
  if (!canCaptureMouseLook()) return;
  const now = performance.now();
  const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
  if (coalesced?.length) {
    for (const event of coalesced) queueMouseMovement(event, now);
  } else {
    queueMouseMovement(e, now);
  }
}

function resetPendingMouseLook() {
  input.mouseDeltaX = 0;
  input.mouseDeltaY = 0;
}

function applyPendingMouseLook() {
  if (!canCaptureMouseLook()) {
    resetPendingMouseLook();
    return;
  }
  let dx = input.mouseDeltaX || 0;
  let dy = input.mouseDeltaY || 0;
  if (dx === 0 && dy === 0) return;
  resetPendingMouseLook();
  if (input.mouseFixEnabled) {
    const length = Math.hypot(dx, dy);
    if (length > MOUSE_FRAME_DELTA_LIMIT) {
      const scale = MOUSE_FRAME_DELTA_LIMIT / length;
      dx *= scale;
      dy *= scale;
    }
  }
  const sensitivity = input.mouseSensitivity * (input.aiming ? aimingSensitivityMultiplier() : 1);
  input.yaw += dx * sensitivity;
  input.pitch = Math.max(-FPS_PITCH_LIMIT, Math.min(FPS_PITCH_LIMIT, input.pitch - dy * sensitivity));
}
function onMouseDown(e) {
  if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return;
  ensureAudio();
  if (game.finalKillCinematicActive || (game.phase === "fps" && fps.players[game.localIndex]?.health <= 0)) {
    input.shootHeld = false;
    input.aiming = false;
    cancelParryGuard();
    return;
  }
  if (!input.pointerLocked) {
    input.shootHeld = false;
    input.aiming = false;
    cancelParryGuard();
    if (e.target === canvas && game.phase === "fps") requestPointerLockSafe();
    return;
  }
  applyPendingMouseLook();
  if (e.button === 2) {
    input.aiming = false;
    if (!localParryGuardWeapon()) input.aiming = true;
    else startParryGuard();
  }
  if (e.button === 0) {
    if (game.parryGuardActive) {
      input.shootHeld = false;
      updateHud();
      return;
    }
    input.shootHeld = true;
    if (game.countdown <= 0 && game.activeWeapon === "gun") fireHitscan();
    if (game.activeWeapon === "melee") fireMelee();
    updateHud();
  }
}
function onMouseUp(e) {
  if (e.button === 2) {
    if (game.parryGuardActive) endParryGuard(true);
    input.aiming = false;
  }
  if (e.button === 0) input.shootHeld = false;
}
function onClick(e) { if (game.phase === "fps" && e.target === canvas && !input.pointerLocked) requestPointerLockSafe(); }
function pointerGroundPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.53), point) ? point : null;
}
function updateGolfDragAim(e) {
  if (input.mouseFixEnabled && mouseEventAgeMs(e, performance.now()) > MOUSE_STALE_EVENT_MS) return;
  const rawDx = e.clientX - game.dragStart.x;
  const maxFixedDx = Math.max(window.innerWidth, window.innerHeight, 1) * GOLF_MOUSE_FIX_DRAG_LIMIT_FACTOR;
  const dx = input.mouseFixEnabled ? Math.max(-maxFixedDx, Math.min(maxFixedDx, rawDx)) : rawDx;
  
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
  if (game.phase === "golf" && e.button !== 2 && e.target === canvas && settingsPanel.classList.contains("hidden")) {
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
  if (!input.mouseFixEnabled) {
    requestStandardPointerLock();
    return;
  }
  try {
    const lockRequest = canvas.requestPointerLock({ unadjustedMovement: true });
    lockRequest?.catch?.(() => requestStandardPointerLock());
  } catch {
    requestStandardPointerLock();
  }
}
function requestStandardPointerLock() {
  try {
    const lockRequest = canvas.requestPointerLock();
    lockRequest?.catch?.(() => {});
  } catch {}
}
function canUsePauseMenu() { return game.phase === "fps" || game.phase === "golf"; }
function syncAbilityKeySettings() {
  if (!abilityKeySettings || !abilityKeyList) return;
  const show = game.phase === "fps";
  abilityKeySettings.classList.toggle("hidden", !show);
  if (!show) {
    abilityKeyList.replaceChildren();
    return;
  }
  abilityKeyList.replaceChildren();
  for (const ability of ABILITY_CHOICES) {
    if (!abilityAllowed(ability.id)) continue;
    const row = document.createElement("label");
    row.className = "settings-key-row";
    const name = document.createElement("span");
    name.textContent = ability.label;
    const select = document.createElement("select");
    for (const key of ABILITY_KEY_OPTIONS) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = keyLabel(key);
      select.appendChild(option);
    }
    select.value = getAbilityKey(ability.id);
    select.addEventListener("change", () => {
      setLocalAbilityKey?.(ability.id, select.value);
      syncAbilityKeySettings();
    });
    row.append(name, select);
    abilityKeyList.appendChild(row);
  }
  abilityKeySettings.classList.toggle("hidden", abilityKeyList.children.length === 0);
}
function setPauseMenuOpen(open = true) {
  if (!canUsePauseMenu()) return;
  const shouldOpen = Boolean(open);
  settingsPanel.classList.toggle("hidden", !shouldOpen);
  overlay.classList.toggle("fps-pause-open", shouldOpen);
  syncChatInputVisibility(shouldOpen);
  if (shouldOpen) {
    if (game.phase === "fps") {
      if (game.parryGuardActive) endParryGuard(true);
      document.exitPointerLock?.();
      input.pointerLocked = false;
    }
    input.aiming = false;
    input.shootHeld = false;
    input.keys.clear();
    resetPendingMouseLook();
    if (game.phase === "golf") {
      game.aimPower = 0;
      input.golfChargeDir = 1;
      powerFill.style.width = "0%";
      if (world.golfAimArrow) world.golfAimArrow.visible = false;
      shotArrow.classList.add("hidden");
    }
    game.dragging = false;
    syncAbilityKeySettings();
    focusChatInputSoon();
  } else {
    overlay.classList.remove("fps-pause-open");
    if (document.activeElement === chatInput) chatInput.blur();
  }
}
function updateFpsSettingsVisibility() {
  const canPause = canUsePauseMenu();
  const showButton = canPause && (game.phase === "golf" || !input.pointerLocked);
  settingsBtn.classList.toggle("hidden", !showButton);
  if (!canPause || (game.phase === "fps" && input.pointerLocked)) {
    settingsPanel.classList.add("hidden");
    overlay.classList.remove("fps-pause-open");
    syncChatInputVisibility(false);
  } else if (!settingsPanel.classList.contains("hidden")) {
    overlay.classList.add("fps-pause-open");
    syncAbilityKeySettings();
    syncChatInputVisibility(true);
  } else {
    overlay.classList.remove("fps-pause-open");
    syncChatInputVisibility(false);
  }
  if (canPause && game.phase === "fps" && !input.pointerLocked) {
    if (game.parryGuardActive) endParryGuard(true);
    input.aiming = false;
    input.shootHeld = false;
  }
}
function syncSensitivity(v) { const m = Number(v); input.mouseSensitivity = FPS_BASE_MOUSE_SENSITIVITY * m; sensitivityInput.value = m; const l = `${m.toFixed(1)}x`; sensitivityValue.textContent = l; }
function savedMouseFixEnabled() {
  try {
    const saved = localStorage.getItem(MOUSE_FIX_STORAGE_KEY);
    return saved === null || (saved !== "0" && saved !== "false");
  } catch {
    return true;
  }
}
function syncMouseFix(enabled, persist = true) {
  input.mouseFixEnabled = enabled !== false;
  if (mouseFixInput) mouseFixInput.checked = input.mouseFixEnabled;
  resetPendingMouseLook();
  if (!persist) return;
  try {
    localStorage.setItem(MOUSE_FIX_STORAGE_KEY, input.mouseFixEnabled ? "1" : "0");
  } catch {}
}
function cleanChatText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f<>`{}[\]\\|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}
function isTextEntryTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
function chatSenderName(player = game.localIndex) {
  const cleaned = cleanPlayerName?.(game.playerNames?.[player] || fps.players?.[player]?.nickname || "") || "";
  return cleaned || playerDisplayName?.(player, `P${player + 1}`) || `P${player + 1}`;
}
function appendChatMessage({ player = -1, name = "", text = "", local = false } = {}) {
  if (!chatLog) return;
  if (canUsePauseMenu()) chatHud?.classList.remove("hidden");
  const cleanText = cleanChatText(text);
  if (!cleanText) return;
  const row = document.createElement("div");
  row.className = `chat-message${local ? " local" : ""}`;
  const who = document.createElement("span");
  who.className = "chat-name";
  const playerIndex = Number.isInteger(player) ? player : -1;
  who.textContent = `${cleanPlayerName?.(name) || chatSenderName(playerIndex >= 0 ? playerIndex : game.localIndex)}:`;
  const body = document.createElement("span");
  body.className = "chat-text";
  body.textContent = cleanText;
  row.append(who, body);
  chatLog.appendChild(row);
  while (chatLog.children.length > CHAT_MAX_MESSAGES) chatLog.removeChild(chatLog.firstElementChild);
  setTimeout(() => {
    if (!row.isConnected) return;
    row.classList.add("expired");
    setTimeout(() => row.remove(), 260);
  }, 10000);
}
function showChatMessage(message = {}) {
  appendChatMessage({
    player: Number.isInteger(message.player) ? message.player : -1,
    name: message.name,
    text: message.text,
    local: Boolean(message.local)
  });
}
function sendChatMessage(value = chatInput?.value) {
  const text = cleanChatText(value);
  if (!text) return false;
  const player = Number.isInteger(game.localIndex) ? game.localIndex : 0;
  const name = syncLocalPlayerNameFromUi?.() || chatSenderName(player);
  const payload = {
    type: "chat",
    id: `${Date.now().toString(36)}-${player}-${++chatMessageSeq}`,
    player,
    name,
    text
  };
  showChatMessage({ ...payload, local: true });
  if (game.connected || game.role === "host") send(payload);
  if (chatInput) chatInput.value = "";
  return true;
}
function syncChatInputVisibility(open = false) {
  const inGame = canUsePauseMenu();
  const show = Boolean(open && inGame);
  chatHud?.classList.toggle("hidden", !inGame);
  chatHud?.classList.toggle("chat-open", show);
  chatForm?.classList.toggle("hidden", !show);
  if (!show && document.activeElement === chatInput) chatInput.blur();
}
function focusChatInputSoon() {
  if (!chatInput || !chatForm || chatForm.classList.contains("hidden")) return;
  setTimeout(() => {
    if (canUsePauseMenu() && !settingsPanel.classList.contains("hidden") && !chatForm.classList.contains("hidden")) {
      chatInput.focus({ preventScroll: true });
    }
  }, 0);
}
function codeFromKeyEvent(e) { if (e.code) return e.code; const k = e.key || ""; if (k === " ") return "Space"; if (k.startsWith("Arrow")) return k; if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`; if (/^[0-9]$/.test(k)) return `Digit${k}`; return k; }
function toggleBuildMode() { game.buildMode = !game.buildMode; lobbyStatus.textContent = game.buildMode ? "Build mode on. Press V to place a block." : lobbyStatus.textContent; }
function placeBuildBox() {
  if (!game.buildMode || game.phase !== "fps") return;
  const p = fps.players[game.localIndex], dir = directionFromAngles(p.yaw, p.pitch), pos = p.pos.clone().add(dir.multiplyScalar(7));
  pos.y = 0;
  clampArenaPosition(pos, 1.6);
  game.fpsCustomMap ||= { version: 1, boxes: [] };
  game.fpsCustomMap.boxes.push({ x: Number(pos.x.toFixed(2)), y: 0, z: Number(pos.z.toFixed(2)), sx: 4, sy: 2.5, sz: 4, color: 0x5ab0ff, isPlatform: true });
  setupArena();
}
function tryActivateAbilityKey(code) {
  if (fps.players[game.localIndex]?.health <= 0) return false;
  const handlers = [
    ["jump", activateJumpAbility],
    ["heal", activateHealAbility],
    ["grenade", throwGrenade],
    ["smoke", throwSmokeGrenade],
    ["radar", activateRadar],
    ["dash", activateDashAbility],
    ["grapple", activateGrappleAbility]
  ];
  for (const [name, handler] of handlers) {
    if (abilityAllowed(name) && code === getAbilityKey(name)) {
      handler();
      return true;
    }
  }
  if (code === getAbilityKey("grenade") && !abilityAllowed("grenade") && abilityAllowed("smoke")) {
    throwSmokeGrenade();
    return true;
  }
  return false;
}

function animate(now = performance.now()) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000 || clock.getDelta()); lastFrame = now;
  updatePerfStats(dt, now);
  if (game.killFadeTimer > 0) game.killFadeTimer = Math.max(0, game.killFadeTimer - dt);
  if (game.phase === "fps" || game.phase === "fpsVictoryLap") applyPendingMouseLook();
  if (game.phase === "golf") updateGolf(dt); else hideGolfHoleTimer(); if (game.phase === "fps") { if (input.shootHeld && game.activeWeapon === "gun") fireHitscan(); updateFps(dt, now); }
  if (game.phase === "fpsVictoryLap") {
    updateFps(dt, now); const elapsed = (now - game.victoryLapStart) / 1000, target = fps.players[game.result.winner] || fps.players[game.localIndex], isW = game.localIndex === game.result.winner;
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
    // Remote winners can be watching the same TARGET EXECUTED cinematic;
    // keep the host from advancing the map before that reveal finishes.
    const finalKillHold = game.finalKillCinematicActive || fpsResultHasFinalKillCinematic(game.result);
    const victoryHold = finalKillHold
      ? (game.result.matchOver ? 11.4 : 4.4)
      : (game.result.reason === "deathmatch" ? 5.2 : 3.2);
    if (elapsed >= victoryHold) {
      if (game.result.reason === "deathmatch" && !game.result.matchOver) continueFpsDuel();
      else if (!(game.finalKillCinematicActive && game.result.matchOver && game.result.matchWinner === game.localIndex)) finishMatch(game.result.matchWinner ?? game.result.winner, game.result.reason);
    }
  }
  const comicMono = victoryComicMonochromeAmount(now);
  const killFadeAmount = game.killFadeDuration > 0 && game.killFadeTimer > 0
    ? Math.pow(Math.max(0, Math.min(1, game.killFadeTimer / game.killFadeDuration)), 0.72) * (game.killFadeStrength || 0)
    : 0;
  const finalKillCinematic = Boolean(game.finalKillCinematicActive);
  const radarMono = !finalKillCinematic && game.radarTimer > 0 && game.phase === "fps";
  // Scoped sniper view: fully desaturated (black-and-white) with the red channel boosted so highlighted enemies pop.
  const scopeMono = !finalKillCinematic && game.phase === "fps" ? (game.scopeAmount || 0) * 1.0 : 0;
  // Low-health: the view drains toward grayscale, then fades back as the timer runs out.
  const lowHpMono = (!finalKillCinematic && game.phase === "fps" && fps.players[game.localIndex]?.health > 0)
    ? Math.min(LOW_HP_MAX_GRAY, (game.lowHpEffectTimer / LOW_HP_EFFECT_DURATION) * LOW_HP_MAX_GRAY)
    : 0;
  const monoAmount = finalKillCinematic ? 1.0 : (radarMono ? 1.0 : Math.max(comicMono, lowHpMono, killFadeAmount));
  renderScene(now * 0.001, {
    grayscale: monoAmount,
    desaturate: finalKillCinematic ? 1.0 : scopeMono,
    inkStrength: finalKillCinematic ? 1.08 : (radarMono ? 1.18 : 0.92 + comicMono * 0.2),
    colorSteps: finalKillCinematic ? 3 : (radarMono ? 2 : (comicMono > 0.01 ? 4 : 5)),
    contrast: finalKillCinematic ? 1.48 : (radarMono ? 1.85 : 1.18 + comicMono * 0.18),
    brightness: finalKillCinematic ? 0.0 : (radarMono ? 0.08 : 0.06),
    redHighlight: finalKillCinematic ? 0.0 : (radarMono ? 1.0 : (scopeMono > 0.3 ? 1.0 : 0.0))
  });
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
// Global UI feedback: any click on a control gives a soft tick, and the first
// gesture unlocks WebAudio so the menu/lobby music can start.
document.addEventListener("pointerdown", (e) => {
  ensureAudio();
  if (game.phase === "lobby" || (!game.phase && !menu.classList.contains("hidden")) || game.phase === "menu") startLobbyMusic();
  if (e.target.closest?.("button, .weapon-card, select, input, .map-pill")) playSound("uiClick", { volume: 0.8 });
});
window.addEventListener("keydown", (e) => {
  const c = codeFromKeyEvent(e);
  if (isTextEntryTarget(e.target) && e.code !== "Escape") return;
  if (e.code === "Escape" && canUsePauseMenu()) {
    e.preventDefault();
    if (!settingsPanel.classList.contains("hidden") && performance.now() - lastPauseOpenedByPointerUnlockAt < 250) return;
    setPauseMenuOpen(settingsPanel.classList.contains("hidden") || (game.phase === "fps" && input.pointerLocked));
    return;
  }
  ensureAudio(); input.keys.add(e.code); input.keys.add(c); if (game.phase === "golf" && ["Space", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
  if ((game.phase === "fps" || game.phase === "fpsVictoryLap") && c.startsWith("Arrow")) e.preventDefault();
  if (game.phase === "fps" || game.phase === "fpsVictoryLap") {
    applyPendingMouseLook();
    if (game.finalKillCinematicActive) return;
    if (!input.pointerLocked) return;
    if (game.countdown <= 0) {
      const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner);
      if (isW && fps.players[game.localIndex]?.health > 0) {
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
            else if (meleeAllowed() && digit === aw.length + 1) switchWeapon("melee");
          }
        }
        else if (tryActivateAbilityKey(c)) {}
        else if (c === "KeyB") toggleBuildMode();
        else if (c === "KeyV") placeBuildBox();
        else if (c === "KeyF" && !game.parryGuardActive && !game.reloading && game.meleeSwingTimer <= 0 && game.throwBlockTimer <= 0) game.inspectTimer = 2.0;
      }
    }
  }
});
window.addEventListener("keyup", (e) => { const c = codeFromKeyEvent(e); input.keys.delete(e.code); input.keys.delete(c); if (isTextEntryTarget(e.target)) return; if (game.phase === "fps" && game.grapple?.active && abilityAllowed("grapple") && (c === getAbilityKey("grapple") || e.code === getAbilityKey("grapple"))) releaseGrapple(); if (game.phase === "golf" && c === "Space" && canControlGolf()) { if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true); game.aimPower = 0; input.golfChargeDir = 1; powerFill.style.width = "0%"; if (world.golfAimArrow) world.golfAimArrow.visible = false; } });
document.addEventListener("pointerlockchange", () => {
  const wasPointerLocked = input.pointerLocked;
  input.pointerLocked = document.pointerLockElement === canvas;
  resetPendingMouseLook();
  if (wasPointerLocked && !input.pointerLocked && game.phase === "fps" && canUsePauseMenu() && settingsPanel.classList.contains("hidden")) {
    lastPauseOpenedByPointerUnlockAt = performance.now();
    setPauseMenuOpen(true);
    return;
  }
  updateFpsSettingsVisibility();
});
document.addEventListener("mousemove", onMouseMove, { passive: true }); document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); document.addEventListener("click", onClick);
weaponCards.forEach(c => c.addEventListener("click", () => { if (game.phase !== "fps" || game.countdown <= 0 || game.randomTournament) return; const weapon = c.getAttribute("data-weapon"); if (!activeWeaponIds().includes(weapon)) return; weaponCards.forEach(x => x.classList.remove("active")); c.classList.add("active"); selectPrimaryWeapon(weapon); }));
canvas.addEventListener("pointerdown", onPointerDown); window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", finishGolfDrag); window.addEventListener("mousedown", (e) => { if (e.button === 0 && game.phase === "golf") onPointerDown(e); }); window.addEventListener("mousemove", onPointerMove); window.addEventListener("mouseup", finishGolfDrag); canvas.addEventListener("contextmenu", (e) => e.preventDefault());
createBtn?.addEventListener("click", () => { syncLocalPlayerNameFromUi?.(); createMatch(); });
joinBtn?.addEventListener("click", () => { syncLocalPlayerNameFromUi?.(); joinMatch(); });
soloBtn?.addEventListener("click", () => { syncLocalPlayerNameFromUi?.(); beginLocalMatch(cleanPhrase(phraseInput.value) || generatePhrase()); });
function syncLobbyPlayerCount() {
  if (game.role === "solo") syncPlayerCountFromUi();
  else ensureFpsPlayers?.(game.playerCount);
}
function selectedGolfCourseIds(useSelection = true) {
  if (useSelection && golfMapSelect?.value !== "") return [golfMapSelect.value];
  return drawTournamentHoleIds();
}
function startConfiguredGolf(courseIds, flow = "golfOnly", includeFpsState = false) {
  if (game.role === "guest") return;
  syncLobbyPlayerCount();
  game.matchFlow = flow;
  const state = includeFpsState ? serializeFpsDuelState() : null;
  send({ type: "startTournament", courseIds, playerCount: game.playerCount, playerNames: playerNamesPayload?.() || game.playerNames, matchFlow: flow, fpsState: state });
  startGolf(courseIds);
}
function startConfiguredFps(random = false) {
  if (game.role === "guest") return;
  syncLobbyPlayerCount();
  game.matchFlow = "fpsOnly";
  resetFpsDuelState(Boolean(random));
  if (!random) {
    game.fpsMatchConfig = buildFpsMatchConfigFromUi();
    applyFpsMatchMapSlot(0);
  }
  captureFpsReplaySnapshot();
  send({ type: "phaseFps", fpsState: serializeFpsDuelState(), playerNames: playerNamesPayload?.() || game.playerNames });
  enterFps(false, { preserveFpsMatch: true, randomTournament: Boolean(random), randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout });
}
function prepareCustomFpsForAfterGolf() {
  resetFpsDuelState(false);
  game.fpsMatchConfig = buildFpsMatchConfigFromUi();
  applyFpsMatchMapSlot(0);
  captureFpsReplaySnapshot();
}
quickTournamentBtn?.addEventListener("click", () => {
  startConfiguredGolf(selectedGolfCourseIds(false), "golfOnly", false);
});
quickFpsDuelBtn?.addEventListener("click", () => {
  startConfiguredFps(true);
});
customLobbyBtn?.addEventListener("click", () => {
  setLobbyCustomVisible?.(true);
});
customBackBtn?.addEventListener("click", () => {
  setLobbyCustomVisible?.(false);
});
startGolfBtn?.addEventListener("click", () => {
  if (game.role !== "guest") { 
    startConfiguredGolf(selectedGolfCourseIds(true), "golfOnly", false);
  } 
});
startFpsBtn?.addEventListener("click", () => {
  if (game.role !== "guest") { 
    startConfiguredFps(false);
  } 
});
startCustomBothBtn?.addEventListener("click", () => {
  if (game.role !== "guest") {
    syncLobbyPlayerCount();
    prepareCustomFpsForAfterGolf();
    startConfiguredGolf(selectedGolfCourseIds(true), "golfThenFps", true);
  }
});
startRandomFpsBtn?.addEventListener("click", () => { startConfiguredFps(true); });
leaveBtn?.addEventListener("click", () => { closePeer(); showMenu(); }); randomBtn?.addEventListener("click", () => { phraseInput.value = generatePhrase(); if (menuError) menuError.textContent = ""; }); restartBtn?.addEventListener("click", () => restartTournament());
finalKillBackBtn?.addEventListener("click", () => finalKillBackToLobby()); finalKillReplayBtn?.addEventListener("click", () => replayFpsMatch());
defeatBackBtn?.addEventListener("click", () => finalKillBackToLobby());
defeatReplayBtn?.addEventListener("click", () => replayFpsMatch());
settingsBtn.addEventListener("click", () => setPauseMenuOpen(settingsPanel.classList.contains("hidden"))); sensitivityInput.addEventListener("input", () => syncSensitivity(sensitivityInput.value)); mouseFixInput?.addEventListener("change", () => syncMouseFix(mouseFixInput.checked));
chatForm?.addEventListener("submit", (e) => { e.preventDefault(); sendChatMessage(); });
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    sendChatMessage();
  }
});
practiceMapCountInput?.addEventListener("input", () => syncPracticeMapPlanner());
practiceRoundsInput?.addEventListener("input", () => syncPracticeMapPlanner());
fovInput?.addEventListener("input", () => syncFov(fovInput.value));
nicknameInput?.addEventListener("change", () => {
  const name = syncLocalPlayerNameFromUi?.();
  if (game.connected) send({ type: "playerInfo", player: game.localIndex, name, playerNames: playerNamesPayload?.() || game.playerNames });
});
ingameLeaveBtn?.addEventListener("click", () => { input.keys.clear(); resetPendingMouseLook(); document.exitPointerLock?.(); closePeer(); showMenu(); });
function syncFov(v) { const fov = Number(v); game.fov = fov; if (fovInput) fovInput.value = fov; if (fovValue) fovValue.textContent = `${fov}°`; }

mapUploadInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  if (file.name.endsWith(".json")) {
    reader.onload = (event) => {
      try {
        game.fpsCustomMap = JSON.parse(event.target.result);
        localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap));
        addCustomMapOptionSelect();
        selectCustomMapForPractice();
        console.log("Successfully loaded custom JSON map", game.fpsCustomMap);
      } catch (err) {
        alert("Failed to parse JSON map");
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith(".glb") || file.name.endsWith(".gltf")) {
    reader.onload = (event) => {
      game.fpsCustomMap = {
        version: 1,
        id: "custom-uploaded-glb",
        name: file.name.replace(/\.(glb|gltf)$/i, ""),
        glb: event.target.result,
        glbCollidable: true,
        glbCollision: "mesh",
        floorCollision: false,
        generatedArena: false,
        bounds: { x: 50, z: 50 },
        spawnPoints: [
          { x: -20, y: 1.2, z: -20 },
          { x: 20, y: 1.2, z: 20 }
        ]
      };
      localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap));
      addCustomMapOptionSelect();
      selectCustomMapForPractice();
      console.log("Successfully loaded custom GLB map", game.fpsCustomMap);
    };
    reader.readAsDataURL(file);
  }
});
window.addEventListener("wheel", (e) => { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0 || game.finalKillCinematicActive || fps.players[game.localIndex]?.health <= 0) return; const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner); if (isW) { cycleActiveWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
phraseInput.value = generatePhrase(); loadLocalAbilityKeys?.(); syncSensitivity(1.0); syncFov(game.fov || FPS_DEFAULT_FOV); syncMouseFix(savedMouseFixEnabled(), false); syncChatInputVisibility(false);
const gdRoom = sessionStorage.getItem("gd_room");
const gdRole = sessionStorage.getItem("gd_role");
if (gdRoom && gdRole) {
  phraseInput.value = gdRoom;
  if (gdRole === "solo") beginLocalMatch(gdRoom);
  else if (gdRole === "guest") joinMatch();
  else {
    sessionStorage.removeItem("gd_room");
    sessionStorage.removeItem("gd_role");
  }
}
try { const savedMap = localStorage.getItem("golfDuelCustomArena"); if (savedMap) { game.fpsCustomMap = JSON.parse(savedMap); addCustomMapOptionSelect(); } game.fpsImportedAssetUrl = localStorage.getItem("golfDuelArenaAsset") || ""; } catch {}

Object.assign(globalThis, {
  onMouseMove,
  applyPendingMouseLook,
  resetPendingMouseLook,
  onMouseDown,
  onMouseUp,
  onClick,
  pointerGroundPoint,
  updateGolfDragAim,
  onPointerDown,
  onPointerMove,
  finishGolfDrag,
  requestPointerLockSafe,
  updateFpsSettingsVisibility,
  syncAbilityKeySettings,
  setPauseMenuOpen,
  syncSensitivity,
  syncMouseFix,
  cleanChatText,
  showChatMessage,
  sendChatMessage,
  syncChatInputVisibility,
  codeFromKeyEvent,
  toggleBuildMode,
  placeBuildBox,
  tryActivateAbilityKey,
  animate,
  syncFov
});
