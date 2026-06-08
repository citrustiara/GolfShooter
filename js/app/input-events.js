import "./globals.js";

function onMouseMove(e) { if (!input.pointerLocked) return; const sensitivity = input.mouseSensitivity * (input.aiming ? aimingSensitivityMultiplier() : 1); input.yaw += e.movementX * sensitivity; input.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, input.pitch - e.movementY * sensitivity)); }
function onMouseDown(e) { if (game.phase === "fps" || game.phase === "fpsVictoryLap") { ensureAudio(); if (!input.pointerLocked) { input.shootHeld = false; input.aiming = false; if (e.target === canvas && game.phase === "fps") requestPointerLockSafe(); return; } if (e.button === 2) input.aiming = true; if (e.button === 0) { input.shootHeld = true; if (game.countdown <= 0 && game.activeWeapon === "gun") fireHitscan(); if (game.activeWeapon === "melee") fireMelee(); updateHud(); } } }
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
function updateFpsSettingsVisibility() {
  const show = game.phase === "fps" && !input.pointerLocked;
  settingsBtn.classList.toggle("hidden", !show);
  settingsPanel.classList.toggle("hidden", !show);
  if (show) {
    input.aiming = false;
    input.shootHeld = false;
  }
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
    const victoryHold = game.result.reason === "deathmatch" ? 5.2 : 3.2;
    if (elapsed >= victoryHold) { if (game.result.reason === "deathmatch" && !game.result.matchOver) continueFpsDuel(); else finishMatch(game.result.matchWinner ?? game.result.winner, game.result.reason); }
  }
  const comicMono = victoryComicMonochromeAmount(now);
  const radarMono = game.radarTimer > 0 && (game.phase === "fps" || game.phase === "fpsVictoryLap");
  const monoAmount = radarMono ? 1 : comicMono;
  renderScene(now * 0.001, {
    grayscale: monoAmount,
    inkStrength: radarMono ? 1.05 : 0.62 + comicMono * 0.24,
    colorSteps: radarMono ? 2 : (comicMono > 0.01 ? 4 : 5),
    contrast: radarMono ? 1.85 : 1.18 + comicMono * 0.18,
    brightness: radarMono ? 0.08 : 0.06,
    redHighlight: radarMono ? 1 : 0
  });
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  const c = codeFromKeyEvent(e); if (e.code === "Escape" && game.phase === "fps") { document.exitPointerLock?.(); input.aiming = false; }
  ensureAudio(); input.keys.add(e.code); input.keys.add(c); if (game.phase === "golf" && ["Space", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
  if ((game.phase === "fps" || game.phase === "fpsVictoryLap") && c.startsWith("Arrow")) e.preventDefault();
  if (game.phase === "fps" || game.phase === "fpsVictoryLap") {
    if (!input.pointerLocked) return;
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
            else if (meleeAllowed() && digit === aw.length + 1) switchWeapon("melee");
          }
        }
        else if (c === "KeyB") toggleBuildMode();
        else if (c === "KeyV") placeBuildBox();
        else if (c === getAbilityKey("jump")) activateJumpAbility();
        else if (c === getAbilityKey("heal")) activateHealAbility();
        else if (c === "KeyF" && !game.reloading && game.meleeSwingTimer <= 0) game.inspectTimer = 2.0;
        else if (c === getAbilityKey("grenade")) throwGrenade();
        else if (c === getAbilityKey("smoke")) throwSmokeGrenade();
        else if (c === getAbilityKey("radar")) activateRadar();
      }
    }
  }
});
window.addEventListener("keyup", (e) => { const c = codeFromKeyEvent(e); if (game.phase === "golf" && c === "Space" && canControlGolf()) { if (game.aimPower > 0.04) simulateShot(game.golfShotDir, game.aimPower, true); game.aimPower = 0; input.golfChargeDir = 1; powerFill.style.width = "0%"; if (world.golfAimArrow) world.golfAimArrow.visible = false; } input.keys.delete(e.code); input.keys.delete(c); });
document.addEventListener("pointerlockchange", () => { input.pointerLocked = document.pointerLockElement === canvas; updateFpsSettingsVisibility(); });
document.addEventListener("mousemove", onMouseMove); document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); document.addEventListener("click", onClick);
weaponCards.forEach(c => c.addEventListener("click", () => { if (game.phase !== "fps" || game.countdown <= 0 || game.randomTournament) return; const weapon = c.getAttribute("data-weapon"); if (!activeWeaponIds().includes(weapon)) return; weaponCards.forEach(x => x.classList.remove("active")); c.classList.add("active"); selectPrimaryWeapon(weapon); }));
canvas.addEventListener("pointerdown", onPointerDown); window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", finishGolfDrag); window.addEventListener("mousedown", (e) => { if (e.button === 0 && game.phase === "golf") onPointerDown(e); }); window.addEventListener("mousemove", onPointerMove); window.addEventListener("mouseup", finishGolfDrag); canvas.addEventListener("contextmenu", (e) => e.preventDefault());
createBtn.addEventListener("click", createMatch); joinBtn.addEventListener("click", joinMatch); soloBtn.addEventListener("click", () => beginLocalMatch(cleanPhrase(phraseInput.value) || generatePhrase()));
startGolfBtn.addEventListener("click", () => { 
  if (game.role !== "guest") { 
    if (game.role === "solo") syncPlayerCountFromUi();
    let ids = drawTournamentHoleIds();
    if (golfMapSelect?.value !== "") ids = [golfMapSelect.value];
    send({ type: "startTournament", courseIds: ids, playerCount: game.playerCount }); 
    startGolf(ids); 
  } 
});
startFpsBtn.addEventListener("click", () => { 
  if (game.role !== "guest") { 
    if (game.role === "solo") syncPlayerCountFromUi();
    resetFpsDuelState(false);
    game.fpsMatchConfig = buildFpsMatchConfigFromUi();
    applyFpsMatchMapSlot(0);
    send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); 
    enterFps(false, { preserveFpsMatch: true }); 
  } 
});
startRandomFpsBtn?.addEventListener("click", () => { if (game.role !== "guest") { if (game.role === "solo") syncPlayerCountFromUi(); resetFpsDuelState(true); send({ type: "phaseFps", fpsState: serializeFpsDuelState() }); enterFps(false, { preserveFpsMatch: true, randomTournament: true, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout }); } });
leaveBtn.addEventListener("click", () => { closePeer(); showMenu(); }); randomBtn.addEventListener("click", () => { phraseInput.value = generatePhrase(); if (menuError) menuError.textContent = ""; }); restartBtn.addEventListener("click", () => restartTournament());
settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden")); sensitivityInput.addEventListener("input", () => syncSensitivity(sensitivityInput.value)); menuSensitivityInput?.addEventListener("input", () => syncSensitivity(menuSensitivityInput.value));
practiceMapCountInput?.addEventListener("input", () => syncPracticeMapPlanner());
practiceRoundsInput?.addEventListener("input", () => syncPracticeMapPlanner());
fovInput?.addEventListener("input", () => syncFov(fovInput.value));
ingameLeaveBtn?.addEventListener("click", () => { document.exitPointerLock?.(); closePeer(); showMenu(); });
function syncFov(v) { const fov = Number(v); game.fov = fov; if (fovInput) fovInput.value = fov; if (fovValue) fovValue.textContent = `${fov}°`; }
loadMapBtn?.addEventListener("click", () => { try { game.fpsCustomMap = mapJsonInput?.value.trim() ? JSON.parse(mapJsonInput.value) : null; localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap)); if (game.fpsCustomMap) { addCustomMapOptionSelect(); selectCustomMapForPractice(); } else syncPracticeMapPlanner(); if (game.phase === "fps") setupArena(); } catch { if (mapJsonInput) mapJsonInput.value = "Invalid map JSON"; } });
saveMapBtn?.addEventListener("click", () => { game.fpsCustomMap ||= { version: 1, boxes: [] }; const text = JSON.stringify(game.fpsCustomMap, null, 2); if (mapJsonInput) mapJsonInput.value = text; localStorage.setItem("golfDuelCustomArena", text); });
loadAssetBtn?.addEventListener("click", () => { game.fpsImportedAssetUrl = assetUrlInput?.value.trim() || ""; localStorage.setItem("golfDuelArenaAsset", game.fpsImportedAssetUrl); if (game.phase === "fps") setupArena(); });

mapUploadInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  if (file.name.endsWith(".json")) {
    reader.onload = (event) => {
      try {
        game.fpsCustomMap = JSON.parse(event.target.result);
        localStorage.setItem("golfDuelCustomArena", JSON.stringify(game.fpsCustomMap));
        if (mapJsonInput) mapJsonInput.value = JSON.stringify(game.fpsCustomMap, null, 2);
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
      if (mapJsonInput) mapJsonInput.value = JSON.stringify(game.fpsCustomMap, null, 2);
      addCustomMapOptionSelect();
      selectCustomMapForPractice();
      console.log("Successfully loaded custom GLB map", game.fpsCustomMap);
    };
    reader.readAsDataURL(file);
  }
});
window.addEventListener("wheel", (e) => { if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0) return; const isW = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner); if (isW) { cycleActiveWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
phraseInput.value = generatePhrase(); syncSensitivity(1.0); syncFov(game.fov || FPS_DEFAULT_FOV);
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
try { const savedMap = localStorage.getItem("golfDuelCustomArena"); if (savedMap) { game.fpsCustomMap = JSON.parse(savedMap); if (mapJsonInput) mapJsonInput.value = JSON.stringify(game.fpsCustomMap, null, 2); addCustomMapOptionSelect(); } game.fpsImportedAssetUrl = localStorage.getItem("golfDuelArenaAsset") || ""; if (assetUrlInput) assetUrlInput.value = game.fpsImportedAssetUrl; } catch {}

Object.assign(globalThis, {
  onMouseMove,
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
  syncSensitivity,
  codeFromKeyEvent,
  toggleBuildMode,
  placeBuildBox,
  animate,
  syncFov
});
