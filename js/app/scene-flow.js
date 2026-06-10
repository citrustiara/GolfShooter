import "./globals.js";

function showMenuScene() {
  world.golfRoot.visible = true; world.arenaRoot.visible = false; camera.position.set(-28, 12, 28); camera.lookAt(0, 0, 0); camera.fov = 62; camera.updateProjectionMatrix();
}

// Sticker-style double rim: a bold white halo hugging the weapon with a black
// contour just outside it, so weapons stay readable against any terrain color.
const weaponOutlineWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xfffdf5, side: THREE.BackSide, depthWrite: false });
const weaponOutlineInkMaterial = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide, depthWrite: false });

function makeOutlineHull(mesh, material, scale, orderShift) {
  const outline = new THREE.Mesh(mesh.geometry, material);
  outline.name = "weaponComicOutline";
  outline.userData.isWeaponOutline = true;
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.quaternion.copy(mesh.quaternion);
  outline.scale.copy(mesh.scale).multiplyScalar(scale);
  outline.renderOrder = (mesh.renderOrder || 0) - orderShift;
  outline.frustumCulled = mesh.frustumCulled;
  return outline;
}

function addWeaponOutlineForMesh(mesh, scale = 1.07) {
  if (!mesh?.isMesh || mesh.userData?.isWeaponOutline || !mesh.geometry || !mesh.parent) return;
  const whiteHull = makeOutlineHull(mesh, weaponOutlineWhiteMaterial, scale, 1);
  const inkHull = makeOutlineHull(mesh, weaponOutlineInkMaterial, scale * 1.045 + 0.012, 2);
  mesh.parent.add(inkHull);
  mesh.parent.add(whiteHull);
}

function addWeaponOutlines(root, scale = 1.07) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh && !child.userData?.isWeaponOutline) meshes.push(child);
  });
  meshes.forEach((mesh) => addWeaponOutlineForMesh(mesh, scale));
}

function rebuildWeaponMesh(weaponId, targetGroup) {
  if (!targetGroup) return;
  while (targetGroup.children.length > 0) {
    targetGroup.remove(targetGroup.children[0]);
  }
  const cfg = weaponCatalog[weaponId];
  if (!cfg) return;

  if (cfg.glbModel) {
    const clone = cfg.glbModel.clone();
    targetGroup.add(clone);
    addWeaponOutlines(clone, targetGroup === world.weapon || targetGroup === world.meleeWeapon ? 1.09 : 1.065);
    
    const tip = new THREE.Group();
    const muzzle = cfg.muzzle || { x: 0, y: 0.08, z: -1.0 };
    tip.position.set(muzzle.x, muzzle.y, muzzle.z);
    targetGroup.add(tip);
    
    if (targetGroup === world.weapon) {
      world.weaponTip = tip;
    }
    return;
  }

  const parts = cfg.parts || [];
  parts.forEach(part => {
    let geom;
    const sx = part.sx ?? 0.1;
    const sy = part.sy ?? 0.1;
    const sz = part.sz ?? 0.1;
    if (part.type === "cylinder") {
      geom = new THREE.CylinderGeometry(sx, sz, sy, 16);
    } else if (part.type === "sphere") {
      geom = new THREE.SphereGeometry(sx, 16, 16);
    } else {
      geom = new THREE.BoxGeometry(sx, sy, sz);
    }

    const color = part.color ?? 0x1b1f24;
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.45,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(part.x ?? 0, part.y ?? 0, part.z ?? 0);
    mesh.rotation.set(part.rotX ?? 0, part.rotY ?? 0, part.rotZ ?? 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    targetGroup.add(mesh);
    addWeaponOutlineForMesh(mesh, targetGroup === world.weapon || targetGroup === world.meleeWeapon ? 1.09 : 1.065);
  });

  const tip = new THREE.Group();
  const muzzle = cfg.muzzle || { x: 0, y: 0.08, z: -1.0 };
  tip.position.set(muzzle.x, muzzle.y, muzzle.z);
  targetGroup.add(tip);
  
  if (targetGroup === world.weapon) {
    world.weaponTip = tip;
  }
}

function buildRadarDeviceMesh(targetGroup) {
  if (!targetGroup) return;
  while (targetGroup.children.length > 0) {
    targetGroup.remove(targetGroup.children[0]);
  }
  const bodyGeom = new THREE.BoxGeometry(0.24, 0.16, 0.04);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.6 });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  targetGroup.add(bodyMesh);

  const screenGeom = new THREE.BoxGeometry(0.2, 0.12, 0.01);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  const screenMesh = new THREE.Mesh(screenGeom, screenMat);
  screenMesh.position.set(0, 0.005, 0.02);
  targetGroup.add(screenMesh);

  const gripGeom = new THREE.BoxGeometry(0.03, 0.16, 0.05);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x5ab0ff, roughness: 0.6 });
  const leftGrip = new THREE.Mesh(gripGeom, gripMat);
  leftGrip.position.set(-0.135, 0, 0);
  targetGroup.add(leftGrip);
  const rightGrip = leftGrip.clone();
  rightGrip.position.set(0.135, 0, 0);
  targetGroup.add(rightGrip);

  const antGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8);
  const antMat = new THREE.MeshStandardMaterial({ color: 0xff6f61, metalness: 0.8 });
  const antenna = new THREE.Mesh(antGeom, antMat);
  antenna.position.set(0.08, 0.1, 0);
  antenna.rotation.x = Math.PI / 2;
  targetGroup.add(antenna);
}

function setupWeapon() {
  world.weapon = new THREE.Group();
  scene.add(world.weapon);
  world.weapon.visible = false;

  world.meleeWeapon = new THREE.Group();
  scene.add(world.meleeWeapon);
  world.meleeWeapon.visible = false;

  world.radarDevice = new THREE.Group();
  scene.add(world.radarDevice);
  world.radarDevice.visible = false;
  buildRadarDeviceMesh(world.radarDevice);
}

function beginLocalMatch(room) { game.role = "solo"; game.room = room; game.localIndex = 0; showLobby(); }

function hideFpsHudUi() {
  healthChip?.classList.add("hidden");
  abilityContainer?.classList.add("hidden");
  weaponChip?.classList.add("hidden");
  ammoChip?.classList.add("hidden");
  document.getElementById("reloadProgress")?.classList.add("hidden");
  hitMarker?.classList.remove("active", "headshot");
  killNotice?.classList.add("hidden");
  radarMarker?.classList.add("hidden");
  countdown?.classList.add("hidden");
  damageVignette?.classList.remove("active");
  if (damageLayer) damageLayer.replaceChildren();
  if (Array.isArray(activeDamagePops)) activeDamagePops.length = 0;
  game.killNoticeTimer = 0;
  game.reloading = false;
  game.reloadTimer = 0;
  game.reloadWeapon = null;
  game.radarTimer = 0;
  input.shootHeld = false;
  input.aiming = false;
  world.weapon && (world.weapon.visible = false);
  world.meleeWeapon && (world.meleeWeapon.visible = false);
  world.radarDevice && (world.radarDevice.visible = false);
}

function showMenu() {
  clearVictoryBanner();
  game.phase = "menu";
  menu.classList.remove("hidden");
  lobby.classList.add("hidden");
  resultPanel.classList.add("hidden");
  hud.classList.add("hidden");
  document.querySelector("#network").classList.add("hidden");
  weaponSelectOverlay.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  settingsPanel.classList.add("hidden");
  overlay.classList.remove("fps");
  hideFpsHudUi();
  document.exitPointerLock?.();
  showMenuScene();
}
function showLobby() {
  clearVictoryBanner();
  game.phase = "lobby";
  lobby.classList.remove("hidden");
  menu.classList.add("hidden");
  resultPanel.classList.add("hidden");
  hud.classList.add("hidden");
  weaponSelectOverlay.classList.add("hidden");
  overlay.classList.remove("fps");
  settingsBtn.classList.add("hidden");
  settingsPanel.classList.add("hidden");
  hideFpsHudUi();
  showMenuScene();
  if (game.role === "guest") {
    startGolfBtn.classList.add("hidden");
    startFpsBtn.classList.add("hidden");
    startRandomFpsBtn?.classList.add("hidden");
    lobbyStatus.textContent = "Waiting for host to start practice...";
    practiceMapOptions?.classList.add("hidden");
    return;
  }
  startGolfBtn.classList.remove("hidden");
  startFpsBtn.classList.remove("hidden");
  startRandomFpsBtn?.classList.remove("hidden");
  lobbyStatus.textContent = game.role === "solo" ? "Solo practice. Choose a mode." : `Host practice lobby. Players: ${game.playerCount}`;
  if (practiceMapOptions) practiceMapOptions.classList.remove("hidden");
  if (playerCountSelect) {
    playerCountSelect.disabled = game.role !== "solo";
    playerCountSelect.value = String(Math.max(2, Math.min(6, game.playerCount || 2)));
  }
  startGolfBtn.textContent = game.role === "solo" ? "Play Selected Golf Map" : "Start Practice Tournament";
  startFpsBtn.textContent = "Start Practice FPS";
  startRandomFpsBtn.textContent = game.role === "solo" ? "Random Loadout Duel" : "Random FPS Duel";
  populateMapSelects().then(() => syncPracticeMapPlanner());
}
function startGolf(courseIds = null) { clearVictoryBanner(); ensureGolfBalls(game.playerCount); resetTournamentState(courseIds); game.phase = "golf"; menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); settingsBtn.classList.add("hidden"); settingsPanel.classList.add("hidden"); overlay.classList.remove("fps"); world.golfRoot.visible = true; world.arenaRoot.visible = false; power.classList.remove("hidden"); resetGolfHole(); useGolfBall(activeGolfPlayerIndex()); updateHud(); }
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
  clearVictoryBanner(); ensureFpsPlayers(game.playerCount);
  game.phase = "fps"; overlay.classList.add("fps"); menu.classList.add("hidden"); lobby.classList.add("hidden"); hud.classList.remove("hidden"); weaponSelectOverlay.classList.add("hidden"); weaponSelectOverlay.hidden = true; weaponSelectOverlay.style.display = "none"; resultPanel.classList.add("hidden"); resultPanel.classList.remove("fps-result"); world.golfRoot.visible = false; world.arenaRoot.visible = true; world.weapon.visible = true; world.meleeWeapon.visible = true;
  updateFpsSettingsVisibility();
  power.classList.add("hidden"); shotArrow.classList.add("hidden"); game.dragging = false;
  if (!options.preserveFpsMatch) { game.fpsMapIndex = 0; game.fpsMapWins = Array(game.playerCount).fill(0); }
  game.randomTournament = Boolean(options.randomTournament ?? game.randomTournament);
  game.fpsMode = game.randomTournament ? "randomTournament" : "standard";
  if (options.randomWeapon) game.randomWeapon = options.randomWeapon;
  if (options.randomLoadout) game.randomLoadout = options.randomLoadout;
  if (game.fpsMatchConfig?.maps?.length) applyFpsMatchMapSlot(game.fpsMatchConfig.currentMapSlot || 0);
  const loadout = activeLoadout();
  game.maxHealth = loadout.hp;
  fps.gravity = activeFpsRules().gravity;
  if (!options.preserveFpsMatch) {
    game.fpsKillWins = Array(game.playerCount).fill(0);
    game.fpsMatchOver = false;
  }
  game.fpsRoundWinner = null; game.countdown = options.staticMock ? 0 : FPS_COUNTDOWN_DURATION; game.weaponSelectTimer = 0;
  const theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], spawns = getArenaSpawnPoints(theme);
  const randomMelee = game.randomTournament && isRandomMeleeWeapon();
  const allowedWeapons = loadoutWeaponList(loadout);
  const startingWeapon = game.randomTournament && !randomMelee ? game.randomWeapon : 
                         (allowedWeapons.find((id) => id !== "melee") || allowedWeapons[0] || "pistol");
  const startAsMelee = randomMelee || startingWeapon === "melee";
  fps.players.forEach((p, i) => { const spawn = spawns[i] || spawns[i % Math.max(1, spawns.length)] || { x: i === 0 ? -42 : 42, z: 0 }; p.pos.set(spawn.x, getSpawnY(spawn, theme), spawn.z); p.vel.set(0, 0, 0); p.yaw = i === 0 ? 0 : Math.PI; p.pitch = 0; p.health = game.maxHealth; p.maxHealth = game.maxHealth; p.grounded = false; p.sliding = false; p.visualSlide = 0; p.stepTimer = 0; p.stepSide = 0; p.currentCamHeight = 1.58; p.weapon = startAsMelee ? "melee" : "gun"; p.primaryWeapon = startingWeapon; p.targetPos = p.pos.clone(); p.targetYaw = p.yaw; p.targetPitch = p.pitch; });
  game.ammo = freshAmmoState(); game.reloading = false; game.reloadTimer = 0; game.reloadWeapon = null; game.activeWeapon = startAsMelee ? "melee" : "gun"; game.primaryWeapon = startingWeapon; game.meleeSwingTimer = 0; game.throwTimer = 0; game.throwBlockTimer = 0; game.throwKind = ""; game.weaponSwapTimer = 0; game.jumpCooldown = 0; game.healCooldown = 0; game.grenadeCooldown = 0; game.smokeCooldown = 0; game.radarCooldown = 0; game.radarTimer = 0; game.slideTimer = 0; game.slideCooldown = 0; game.visualRecoil = 0;
  if (game.role === "solo") game.localIndex = 0;
  setupArena(); fps.players.forEach((p) => clampArenaPosition(p.pos, 0.5)); applyWeaponState(game.activeWeapon, game.primaryWeapon); syncPrimaryWeaponModel(); updateHud();
}

Object.assign(globalThis, {
  showMenuScene,
  rebuildWeaponMesh,
  buildRadarDeviceMesh,
  setupWeapon,
  beginLocalMatch,
  hideFpsHudUi,
  showMenu,
  showLobby,
  startGolf,
  applyGolfAtmosphere,
  enterFps
});
