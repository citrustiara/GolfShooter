import "./globals.js";

function updateFps(dt, now) {
  if (game.countdown > 0) { const prevTick = Math.ceil(game.countdown); game.countdown -= dt; const curTick = Math.ceil(game.countdown); countdown.textContent = curTick; countdown.classList.remove("hidden"); if (curTick !== prevTick) playSound(curTick > 0 ? "countdownTick" : "countdownGo", { volume: 0.7 }); if (game.countdown <= 0) countdown.classList.add("hidden"); }
  if (game.connected) {
    for (let remoteIdx = 0; remoteIdx < fps.players.length; remoteIdx++) {
      if (remoteIdx === game.localIndex) continue;
      const remote = fps.players[remoteIdx];
      if (remote && remote.targetPos) {
        if (remote.pos.distanceTo(remote.targetPos) > 4.5) {
          remote.pos.copy(remote.targetPos);
        } else {
          remote.pos.lerp(remote.targetPos, Math.min(1, dt * 18.0));
        }
        let diffYaw = remote.targetYaw - remote.yaw;
        diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
        remote.yaw += diffYaw * Math.min(1, dt * 18.0);
        remote.pitch += (remote.targetPitch - remote.pitch) * Math.min(1, dt * 18.0);
      }
    }
  }
  weaponSelectOverlay.classList.add("hidden");
  const localPlayer = fps.players[game.localIndex];
  const localAlive = Boolean(localPlayer && localPlayer.health > 0);
  const isWinner = game.phase === "fps" || (game.phase === "fpsVictoryLap" && game.localIndex === game.result.winner);
  if (isWinner && localAlive && game.countdown <= 0 && !game.finalKillCinematicActive) {
    if (game.radarTimer > 0 || game.throwBlockTimer > 0) input.aiming = false;
    updateFpsCamera(dt);
    updateFpsMovement(dt);
  } else if (!localAlive && game.phase === "fps") {
    input.shootHeld = false;
    input.aiming = false;
    releaseGrapple?.();
    resolveSpectateTarget();
    game.reloading = false;
    game.reloadTimer = 0;
    game.scopeAmount = 0;
    scopeOverlay?.classList.add("hidden");
    if (crosshairEl) crosshairEl.style.opacity = "";
    document.getElementById("reloadProgress")?.classList.add("hidden");
    if (world.weapon) world.weapon.visible = false;
    if (world.meleeWeapon) world.meleeWeapon.visible = false;
    if (world.radarDevice) world.radarDevice.visible = false;
  }
  updateWeaponSwap(dt);
  if (!localAlive && game.phase === "fps") {
    if (world.weapon) world.weapon.visible = false;
    if (world.meleeWeapon) world.meleeWeapon.visible = false;
    if (world.radarDevice) world.radarDevice.visible = false;
  }
  if (game.parryCooldown > 0) game.parryCooldown = Math.max(0, game.parryCooldown - dt);
  if (game.parryAnimTimer > 0) game.parryAnimTimer = Math.max(0, game.parryAnimTimer - dt);
  for (let i = 0; i < fps.players.length; i++) {
    const player = fps.players[i];
    if (!player) continue;
    if (i !== game.localIndex && player.parryCooldown > 0) player.parryCooldown = Math.max(0, player.parryCooldown - dt);
    if (player.parryEffectTimer > 0) player.parryEffectTimer = Math.max(0, player.parryEffectTimer - dt);
  }
  if (localPlayer) {
    localPlayer.aiming = localAlive && input.aiming;
    localPlayer.parryCooldown = game.parryCooldown;
    localPlayer.parryReloadTotal = game.parryReloadTotal;
    localPlayer.parryWeapon = activeFpsWeaponId();
  }
  const bar = document.getElementById("reloadBar");
  const progress = document.getElementById("reloadProgress");
  if (game.reloading) {
    game.reloadTimer -= dt;
    const reloadingWeapon = game.reloadWeapon || game.primaryWeapon;
    const total = weaponConfig(reloadingWeapon).reload || 1;
    const pct = Math.max(0, Math.min(100, ((total - game.reloadTimer) / total) * 100));
    if (bar && progress) {
      progress.classList.remove("hidden");
      bar.style.width = "100%";
      bar.style.transform = `scaleX(${pct / 100})`;
      bar.style.background = "#21d0ff";
      bar.style.boxShadow = "none";
    }
    if (game.reloadTimer <= 0) {
      game.reloading = false;
      game.reloadTimer = 0;
      game.ammo[reloadingWeapon] = weaponMaxAmmo(reloadingWeapon);
      game.reloadWeapon = null;
      playSound("reloadEnd", { volume: 0.8 });
      if (progress) progress.classList.add("hidden");
      if (bar) bar.style.transform = "scaleX(0)";
      updateHud();
    }
  } else if (game.radarTimer > 0) {
    const pct = Math.max(0, Math.min(100, (game.radarTimer / RADAR_DURATION) * 100));
    if (bar && progress) {
      progress.classList.remove("hidden");
      bar.style.width = "100%";
      bar.style.transform = `scaleX(${pct / 100})`;
      bar.style.background = "#6bf178";
      bar.style.boxShadow = "none";
    }
  } else if (game.parryCooldown > 0) {
    const total = Math.max(0.1, game.parryReloadTotal || parryReloadForWeapon(activeFpsWeaponId()));
    const pct = Math.max(0, Math.min(100, ((total - game.parryCooldown) / total) * 100));
    if (bar && progress) {
      progress.classList.remove("hidden");
      bar.style.width = "100%";
      bar.style.transform = `scaleX(${pct / 100})`;
      bar.style.background = "linear-gradient(90deg, #7ee2ff, #fff4a8 55%, #ff6f61)";
      bar.style.boxShadow = "0 0 12px rgba(126, 226, 255, 0.75)";
    }
  } else {
    if (progress) progress.classList.add("hidden");
    if (bar) {
      bar.style.transform = "scaleX(0)";
      bar.style.boxShadow = "none";
    }
  }
  if (game.inspectTimer > 0) game.inspectTimer -= dt; if (game.meleeSwingTimer > 0) game.meleeSwingTimer -= dt; if (game.throwTimer > 0) game.throwTimer = Math.max(0, game.throwTimer - dt); if (game.throwBlockTimer > 0) game.throwBlockTimer = Math.max(0, game.throwBlockTimer - dt); if (game.throwTimer <= 0) game.throwKind = ""; if (game.jumpCooldown > 0) game.jumpCooldown -= dt; if (game.healCooldown > 0) game.healCooldown -= dt; if (game.grenadeCooldown > 0) game.grenadeCooldown -= dt; if (game.smokeCooldown > 0) game.smokeCooldown -= dt; if (game.radarCooldown > 0) game.radarCooldown -= dt; if (game.slideTimer > 0) game.slideTimer -= dt; if (game.slideCooldown > 0) game.slideCooldown -= dt; if (game.dashCooldown > 0) game.dashCooldown -= dt; if (game.dashTimer > 0) game.dashTimer -= dt; if (game.grappleCooldown > 0) game.grappleCooldown -= dt;
  // Grapple charges: tick the short inter-throw gap, and refill banked hooks one
  // at a time at the per-hook recharge rate.
  if (game.grappleGapTimer > 0) game.grappleGapTimer = Math.max(0, game.grappleGapTimer - dt);
  const grappleCap = grappleMaxCharges();
  if (game.grappleCharges < grappleCap) {
    if (game.grappleChargeTimer <= 0) game.grappleChargeTimer = grappleRechargeTime();
    game.grappleChargeTimer -= dt;
    if (game.grappleChargeTimer <= 0) {
      game.grappleCharges = Math.min(grappleCap, game.grappleCharges + 1);
      game.grappleChargeTimer = game.grappleCharges < grappleCap ? grappleRechargeTime() : 0;
      updateHud();
    }
  } else if (game.grappleChargeTimer !== 0) {
    game.grappleChargeTimer = 0;
  }
  // Low-health screen state pulses a heartbeat while it lasts; both it and the
  // green heal flash fade on their own timers so neither lingers permanently.
  const localHp = fps.players[game.localIndex];
  if (game.lowHpEffectTimer > 0) {
    game.lowHpEffectTimer = Math.max(0, game.lowHpEffectTimer - dt);
    if (localHp && localHp.health > 0 && game.phase === "fps") {
      game.lowHpHeartbeatTimer -= dt;
      if (game.lowHpHeartbeatTimer <= 0) {
        playSound("heartbeat", { volume: 0.9 });
        game.lowHpHeartbeatTimer = LOW_HP_HEARTBEAT_INTERVAL;
      }
    } else {
      game.lowHpHeartbeatTimer = 0;
    }
  }
  if (game.healEffectTimer > 0) game.healEffectTimer = Math.max(0, game.healEffectTimer - dt);
  if (healVignette) healVignette.style.opacity = `${Math.min(1, game.healEffectTimer / HEAL_EFFECT_DURATION) * 0.8}`;
  // Red damage hue: hold full for the first half of its life, then ease out, and
  // only while the local player is alive (so it doesn't bleed into spectating).
  if (game.damageEffectTimer > 0) game.damageEffectTimer = Math.max(0, game.damageEffectTimer - dt);
  if (damageVignette) {
    const dmgAlive = localHp && localHp.health > 0 && game.phase === "fps";
    damageVignette.style.opacity = `${(dmgAlive ? Math.min(1, game.damageEffectTimer / (DAMAGE_EFFECT_DURATION * 0.5)) : 0) * 0.85}`;
  }
  if (game.radarTimer > 0) {
    game.radarTimer -= dt;
    if (game.radarTimer <= 0) {
      game.radarTimer = 0;
      game.radarCooldown = abilityCooldown("radar", RADAR_COOLDOWN);
      updateHud();
    }
    updateRadarMarker();
  }
  updateGrenades(dt); updateSmokeClouds(dt); updateExplosions(dt); updateLasers(dt); updateDamagePops(dt); updatePlayerMeshes(dt); updateGrappleRope(); updateScopeEnemyBoxes(); updateGrappleReticle();
  // While dead in an ongoing round, watch the killer (or a survivor) through
  // their own first-person camera; otherwise keep the spectate banner hidden.
  if (!localAlive && game.phase === "fps") updateSpectatorView(dt);
  else setSpectatorBanner(-1);
  // Round timer: counts down once the opening countdown clears; on expiry the
  // round is settled by HP (highest wins; a tie splits a point). Host decides.
  if (game.phase === "fps" && game.countdown <= 0 && !game.roundTimedOut) {
    game.roundTimeLeft = Math.max(0, (game.roundTimeLeft ?? ROUND_TIME_LIMIT) - dt);
    if (game.roundTimeLeft <= 0) {
      game.roundTimedOut = true;
      resolveRoundTimeout();
    }
  }
  // Round-end watchdog: if every kill/death message path failed (dropped
  // packet, race with phase changes), a round with <=1 survivors must still
  // end. The short grace period lets the normal paths win first.
  if (game.phase === "fps" && game.countdown <= 0) {
    const aliveNow = aliveFpsPlayerIndexes();
    if (aliveNow.length <= 1 && fps.players.length >= 2) {
      game.roundEndGrace = (game.roundEndGrace || 0) + dt;
      if (game.roundEndGrace > 0.6) {
        game.roundEndGrace = 0;
        startVictoryLap(aliveNow.length === 1 ? aliveNow[0] : -1, "deathmatch");
      }
    } else {
      game.roundEndGrace = 0;
    }
  } else {
    game.roundEndGrace = 0;
  }
  if (game.killNoticeTimer > 0) { game.killNoticeTimer -= dt; if (game.killNoticeTimer <= 0) killNotice.classList.add("hidden"); }
  if (game.connected && now - game.lastSend > 50) { game.lastSend = now; const p = fps.players[game.localIndex]; send({ type: "fpsState", player: game.localIndex, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, sliding: p.sliding, weapon: game.activeWeapon, primaryWeapon: game.primaryWeapon, aiming: input.aiming, parryCooldown: game.parryCooldown, reloading: game.reloading, reloadTimer: game.reloadTimer, inspectTimer: game.inspectTimer, throwTimer: game.throwTimer, weaponSwapTimer: game.weaponSwapTimer, meleeSwingTimer: game.meleeSwingTimer, parryAnimTimer: game.parryAnimTimer, visualRecoil: game.visualRecoil, radar: game.radarTimer > 0, scopeAmount: game.scopeAmount, camH: p.currentCamHeight }); }
  updateHud();
}
function updateFpsCamera(dt) {
  const p = fps.players[game.localIndex]; p.yaw = input.yaw; p.pitch = input.pitch; p.currentCamHeight = moveTowards(p.currentCamHeight || 1.58, p.sliding ? 0.8 : 1.58, dt * 2.5);
  game.visualRecoil = moveTowards(game.visualRecoil, 0, dt * 9);
  camera.position.set(p.pos.x, p.pos.y + p.currentCamHeight, p.pos.z); camera.lookAt(camera.position.clone().add(directionFromAngles(p.yaw, p.pitch + game.visualRecoil * 0.018)));
  const cfg = weaponConfig(activeFpsWeaponId());
  const baseFov = game.fov || FPS_DEFAULT_FOV;
  camera.fov = moveTowards(camera.fov, input.aiming ? (cfg.aimFov || FPS_AIM_FOV) : baseFov, dt * (cfg.aimSpeed || 180)); camera.updateProjectionMatrix();
  updateScopeState(cfg, baseFov);
  // Spectating someone may have swapped the shared viewmodel to their weapon;
  // make sure it's back to ours before drawing our own first-person hands.
  ensureWeaponModelFor(game.primaryWeapon);
  updateWeaponModel(dt, p);
}
// Keep the shared first-person viewmodel group (world.weapon) built for `weaponId`,
// rebuilding only when it actually changes (weapon switch, or spectate handoff).
function ensureWeaponModelFor(weaponId) {
  const id = weaponId || "pistol";
  if (world.weaponModelId === id) return;
  rebuildWeaponMesh(id, world.weapon);
  world.weaponModelId = id;
}
// Resolve who the dead local player should watch: their killer while they're
// alive, otherwise any remaining survivor. Returns -1 when nobody is left.
function resolveSpectateTarget() {
  const me = fps.players[game.localIndex];
  if (!me || me.health > 0 || game.phase !== "fps") { game.spectateTarget = -1; return -1; }
  const valid = (i) => Number.isInteger(i) && i >= 0 && i !== game.localIndex && fps.players[i] && fps.players[i].health > 0;
  if (valid(game.spectateTarget)) return game.spectateTarget;
  const alive = fps.players.map((pl, i) => (i !== game.localIndex && pl && pl.health > 0) ? i : -1).filter((i) => i >= 0);
  game.spectateTarget = alive.length ? alive[0] : -1;
  return game.spectateTarget;
}
function setSpectatorBanner(idx) {
  if (!spectateBanner) return;
  if (idx === null || idx === undefined || idx < 0) { spectateBanner.classList.add("hidden"); return; }
  if (spectateBannerName) spectateBannerName.textContent = `P${idx + 1}`;
  if (spectateBannerSub) {
    const info = game.lastKilledBy;
    spectateBannerSub.textContent = (Number.isInteger(info?.killerIndex) && info.killerIndex === idx) ? "your killer" : "";
  }
  spectateBanner.classList.remove("hidden");
}
// Render the dead player's view as the spectated player's own first-person
// camera: their eye position and aim, their weapon model, and the full set of
// viewmodel animations (ADS, reload, inspect, melee, parry) driven by their
// networked state.
function updateSpectatorView(dt) {
  const idx = resolveSpectateTarget();
  if (idx < 0) {
    world.weapon.visible = false;
    world.meleeWeapon.visible = false;
    world.radarDevice.visible = false;
    setSpectatorBanner(-1);
    return;
  }
  const t = fps.players[idx];
  const camH = t.currentCamHeight || 1.58;
  camera.position.set(t.pos.x, t.pos.y + camH, t.pos.z);
  camera.lookAt(camera.position.clone().add(directionFromAngles(t.yaw, t.pitch)));
  const viewState = remoteWeaponView(t);
  const cfg = weaponConfig(viewState.primaryWeapon);
  const baseFov = game.fov || FPS_DEFAULT_FOV;
  const wantFov = viewState.aiming && viewState.activeWeapon === "gun" ? (cfg.aimFov || FPS_AIM_FOV) : baseFov;
  camera.fov = moveTowards(camera.fov, wantFov, dt * (cfg.aimSpeed || 180));
  camera.updateProjectionMatrix();
  ensureWeaponModelFor(viewState.primaryWeapon);
  updateWeaponModel(dt, t, viewState);
  setSpectatorBanner(idx);
}
function updateScopeState(cfg = weaponConfig(game.primaryWeapon), baseFov = game.fov || FPS_DEFAULT_FOV) {
  // scopeAmount tracks how far the FOV has converged on the scoped FOV; the
  // overlay and the black-and-white grade fade in past the 0.55 threshold.
  const scoping = game.phase === "fps" && input.aiming && game.activeWeapon === "gun" && Boolean(cfg.scope);
  if (scoping) {
    const aimFov = cfg.aimFov || FPS_AIM_FOV;
    game.scopeAmount = Math.max(0, Math.min(1, (baseFov - camera.fov) / Math.max(1, baseFov - aimFov)));
  } else {
    game.scopeAmount = 0;
  }
  const overlayOn = game.scopeAmount > 0.55;
  scopeOverlay?.classList.toggle("hidden", !overlayOn);
  if (crosshairEl) crosshairEl.style.opacity = overlayOn ? "0" : "";
}
// The viewmodel is driven entirely by a "view" snapshot so it can be rendered
// for either the local player (live game/input state) or, while dead, the player
// being spectated (their networked state) — giving spectators the exact same
// first-person weapon, ADS, reload, inspect and parry animations.
function localWeaponView() {
  return {
    radarActive: game.radarTimer > 0,
    activeWeapon: game.activeWeapon,
    primaryWeapon: game.primaryWeapon,
    aiming: input.aiming,
    inspectTimer: game.inspectTimer,
    throwTimer: game.throwTimer,
    weaponSwapTimer: game.weaponSwapTimer,
    reloading: game.reloading,
    reloadTimer: game.reloadTimer,
    meleeSwingTimer: game.meleeSwingTimer,
    parryAnimTimer: game.parryAnimTimer,
    visualRecoil: game.visualRecoil,
    scopeAmount: game.scopeAmount
  };
}
function remoteWeaponView(r) {
  return {
    radarActive: Boolean(r.radarActive),
    activeWeapon: r.weapon === "melee" ? "melee" : "gun",
    primaryWeapon: r.primaryWeapon || "pistol",
    aiming: Boolean(r.aiming),
    inspectTimer: Number(r.inspectTimer) || 0,
    throwTimer: Number(r.throwTimer) || 0,
    weaponSwapTimer: Number(r.weaponSwapTimer) || 0,
    reloading: Boolean(r.reloading),
    reloadTimer: Number(r.reloadTimer) || 0,
    meleeSwingTimer: Number(r.meleeSwingTimer) || 0,
    parryAnimTimer: Number(r.parryAnimTimer) || 0,
    visualRecoil: Number(r.visualRecoil) || 0,
    scopeAmount: Number(r.scopeAmount) || 0
  };
}
function updateWeaponModel(dt, p, view = localWeaponView()) {
  const isRadarActive = view.radarActive;
  
  world.weapon.visible = false;
  world.meleeWeapon.visible = false;
  world.radarDevice.visible = false;
  if (game.finalKillCinematicActive) return;
  
  let weapon;
  let cfg;
  if (isRadarActive) {
    weapon = world.radarDevice;
    weapon.visible = true;
    cfg = {
      scale: 1.0,
      firstPersonOffset: { x: 0.0, y: -0.22, z: -0.28 }
    };
  } else {
    weapon = view.activeWeapon === "gun" ? world.weapon : world.meleeWeapon;
    weapon.visible = true;
    cfg = view.activeWeapon === "gun" ? weaponConfig(view.primaryWeapon) : weaponConfig("melee");
    // Hard-scoped snipers look through a real scope: the rifle leaves the view.
    if (view.activeWeapon === "gun" && cfg.scope && view.scopeAmount > 0.55) weapon.visible = false;
  }

  // Full camera-space basis: the weapon offset is applied along the camera's own
  // right/up/forward axes so it stays glued to the same screen position at any
  // pitch. (The old mix of camera-forward with world-up pushed the weapon into
  // the face when looking up and far away when looking down.)
  const camDir = directionFromAngles(p.yaw, p.pitch);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const speed = p.vel.length(), bob = Math.sin(performance.now() * 0.008) * speed * 0.005, swayX = Math.sin(performance.now() * 0.004) * 0.005;
  
  if (isRadarActive) {
    weapon.scale.setScalar(0.8);
  } else {
    weapon.scale.setScalar(view.activeWeapon === "gun" ? (cfg.scale || 1.0) * 0.82 : 0.78);
  }
  const fpOffset = cfg.firstPersonOffset || { x: 0.22, y: -0.3, z: -0.34 };

  // Calculate inspect progress (0.0 to 1.0)
  let inspectProgress = 0;
  if (!isRadarActive && view.inspectTimer > 0) {
    const inspectTotal = 2.0;
    const elapsed = inspectTotal - view.inspectTimer;
    if (elapsed < 0.5) {
      inspectProgress = Math.sin((elapsed / 0.5) * Math.PI / 2);
    } else if (elapsed > 1.5) {
      inspectProgress = Math.sin(((inspectTotal - elapsed) / 0.5) * Math.PI / 2);
    } else {
      inspectProgress = 1.0;
    }
  }

  // Interpolate weapon offset based on inspect progress to center it and bring it closer
  const targetX = THREE.MathUtils.lerp(fpOffset.x, 0.02, inspectProgress);
  const targetY = THREE.MathUtils.lerp(fpOffset.y, -0.16, inspectProgress);
  const targetZ = THREE.MathUtils.lerp(fpOffset.z, -0.24, inspectProgress);

  let offset = camDir.clone().multiplyScalar(-targetZ).add(right.clone().multiplyScalar(targetX + swayX)).add(up.clone().multiplyScalar(targetY + bob));
  if (!isRadarActive && view.aiming && view.activeWeapon === "gun" && inspectProgress === 0) {
    const longGun = view.primaryWeapon === "sniper" || view.primaryWeapon === "heavySniper" || view.primaryWeapon === "tacticalSniper";
    offset = camDir.clone().multiplyScalar(-fpOffset.z - (longGun ? 0.06 : 0.1)).add(right.clone().multiplyScalar(fpOffset.x * 0.15 + swayX)).add(up.clone().multiplyScalar(fpOffset.y - (longGun ? 0.24 : 0.16) + bob));
  }
  offset.add(camDir.clone().multiplyScalar(-view.visualRecoil * 0.12)).add(up.clone().multiplyScalar(view.visualRecoil * 0.04));

  // Compute animation-related Y offset
  let animY = 0;
  let throwArc = 0;
  if (!isRadarActive && view.throwTimer > 0) {
    const throwDuration = 0.36;
    const throwProgress = 1 - Math.max(0, view.throwTimer) / throwDuration;
    throwArc = Math.sin(Math.min(1, throwProgress) * Math.PI);
    animY = -throwArc * 0.52;
    offset.add(camDir.clone().multiplyScalar(throwArc * 0.18)).add(right.clone().multiplyScalar(-throwArc * 0.12));
  } else if (!isRadarActive && view.weaponSwapTimer > 0) {
    animY = -Math.sin((view.weaponSwapTimer / WEAPON_SWAP_DURATION) * Math.PI) * 0.5;
  } else if (!isRadarActive && view.reloading) {
    const total = cfg.reload || 1.4;
    const t = view.reloadTimer / total;
    const reloadFactor = Math.sin(t * Math.PI);
    
    // Dynamic drop amount to prevent clipping through floor. Only surfaces at
    // or below eye height count as ground — a platform overhead is a ceiling,
    // and treating it as the floor used to teleport the weapon above it.
    let dropAmount = 0.75;
    let groundY = (world.arenaFloorCollision !== false && world.arenaFloors.length > 0) ? 0.0 : -60;
    for (const plat of world.platforms) {
      const b = new THREE.Box3().setFromObject(plat);
      if (b.max.y <= camera.position.y && camera.position.x > b.min.x && camera.position.x < b.max.x && camera.position.z > b.min.z && camera.position.z < b.max.z) {
        groundY = Math.max(groundY, b.max.y);
      }
    }
    for (const ramp of world.ramps) {
      const y = rampSurfaceY(ramp, camera.position, 0);
      if (y !== null && y <= camera.position.y) groundY = Math.max(groundY, y);
    }
    const meshY = meshSurfaceYAtPoint(world.meshColliders, camera.position, 0.12);
    if (meshY !== null && meshY <= camera.position.y) groundY = Math.max(groundY, meshY);
    const minWeaponY = groundY + 0.18;
    const weaponYWithoutAnim = camera.position.y + offset.y;
    const maxAllowableDrop = weaponYWithoutAnim - minWeaponY;
    if (maxAllowableDrop > 0 && dropAmount > maxAllowableDrop) {
      dropAmount = Math.max(0.15, maxAllowableDrop);
    }
    
    animY = -reloadFactor * dropAmount;
  }
  // Golf-club slash: quick wind-up over the right shoulder, then a diagonal
  // strike across the view with a forward lunge, easing back to rest.
  let meleeSwing = 0;
  let parryGuard = 0;
  const swingingBlade = view.activeWeapon === "melee" || (view.activeWeapon === "gun" && cfg.meleeAttack);
  if (!isRadarActive && swingingBlade && view.meleeSwingTimer > 0) {
    const swingDuration = 0.32;
    const progress = Math.max(0, Math.min(1, (swingDuration - view.meleeSwingTimer) / swingDuration));
    meleeSwing = progress;
    const windup = Math.min(1, progress / 0.28);
    const strike = progress <= 0.28 ? 0 : Math.min(1, (progress - 0.28) / 0.42);
    const recover = progress <= 0.7 ? 0 : (progress - 0.7) / 0.3;
    const arc = Math.sin(strike * Math.PI * 0.5);
    offset
      .add(right.clone().multiplyScalar(windup * 0.34 - arc * 0.62))
      .add(up.clone().multiplyScalar(windup * 0.3 - arc * 0.5 + recover * 0.2))
      .add(camDir.clone().multiplyScalar(arc * 0.42 - windup * 0.1));
  } else if (!isRadarActive && swingingBlade && view.parryAnimTimer > 0) {
    const parryDuration = 0.28;
    const progress = 1 - Math.max(0, view.parryAnimTimer) / parryDuration;
    parryGuard = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
    offset
      .add(right.clone().multiplyScalar(-0.28 * parryGuard))
      .add(up.clone().multiplyScalar(0.22 * parryGuard))
      .add(camDir.clone().multiplyScalar(0.22 * parryGuard));
  }

  weapon.position.copy(camera.position).add(offset).add(up.clone().multiplyScalar(animY));

  // Apply ground safety clamp for normal movement. Ignore surfaces above the
  // camera: standing under a platform/ceiling must not clamp the weapon up
  // through it (that made the view model disappear entirely).
  let groundY = (world.arenaFloorCollision !== false && world.arenaFloors.length > 0) ? 0.0 : -60;
  for (const plat of world.platforms) {
    const b = new THREE.Box3().setFromObject(plat);
    if (b.max.y <= camera.position.y && weapon.position.x > b.min.x && weapon.position.x < b.max.x && weapon.position.z > b.min.z && weapon.position.z < b.max.z) {
      groundY = Math.max(groundY, b.max.y);
    }
  }
  for (const ramp of world.ramps) {
    const y = rampSurfaceY(ramp, weapon.position, 0);
    if (y !== null && y <= camera.position.y) groundY = Math.max(groundY, y);
  }
  const meshY = meshSurfaceYAtPoint(world.meshColliders, weapon.position, 0.12);
  if (meshY !== null && meshY <= camera.position.y) groundY = Math.max(groundY, meshY);
  const minWeaponY = groundY + 0.18;
  if (weapon.position.y < minWeaponY) {
    weapon.position.y = minWeaponY;
  }

  // Apply camera orientation and add local rotations for inspection
  weapon.quaternion.copy(camera.quaternion);
  if (isRadarActive) {
    weapon.rotateX(0.5);
  } else if (meleeSwing > 0) {
    const windup = Math.min(1, meleeSwing / 0.28);
    const strike = meleeSwing <= 0.28 ? 0 : Math.min(1, (meleeSwing - 0.28) / 0.42);
    const arc = Math.sin(strike * Math.PI * 0.5);
    const settle = meleeSwing <= 0.7 ? 1 : 1 - (meleeSwing - 0.7) / 0.3;
    weapon.rotateZ((windup * 0.55 - arc * 1.85) * settle);
    weapon.rotateX((-windup * 0.5 + arc * 1.15) * settle);
    weapon.rotateY((windup * 0.25 - arc * 0.45) * settle);
  } else if (parryGuard > 0) {
    weapon.rotateZ(-0.95 * parryGuard);
    weapon.rotateX(0.55 * parryGuard);
    weapon.rotateY(-0.24 * parryGuard);
  } else if (throwArc > 0) {
    weapon.rotateX(-0.55 * throwArc);
    weapon.rotateZ(0.35 * throwArc);
  } else if (inspectProgress > 0) {
    weapon.rotateY(1.3 * inspectProgress);
    weapon.rotateX(0.15 * inspectProgress);
    weapon.rotateZ(-0.25 * inspectProgress);
  }
}

// Time-up resolution: whoever has the most HP among the living wins the round;
// if the top HP is shared, every tied player banks a point. Only the host (or a
// solo session) decides, then broadcasts the result through startVictoryLap.
function resolveRoundTimeout() {
  if (game.phase !== "fps" || game.role === "guest") return;
  const alive = aliveFpsPlayerIndexes();
  if (alive.length <= 1) return; // the elimination watchdog already covers this
  let maxHp = -Infinity;
  for (const i of alive) maxHp = Math.max(maxHp, fps.players[i].health);
  const leaders = alive.filter((i) => fps.players[i].health >= maxHp - 0.5);
  if (leaders.length === 1) {
    startVictoryLap(leaders[0], "deathmatch");
  } else {
    for (const i of leaders) if (i >= 0 && i < game.fpsKillWins.length) game.fpsKillWins[i] = (game.fpsKillWins[i] || 0) + 1;
    // winner = -1 (a draw) but the points are already banked, so startVictoryLap
    // tallies map/match progress from the updated scores without re-awarding.
    startVictoryLap(-1, "deathmatch");
  }
}

Object.assign(globalThis, {
  updateFps,
  updateFpsCamera,
  updateScopeState,
  updateWeaponModel,
  localWeaponView,
  remoteWeaponView,
  ensureWeaponModelFor,
  resolveSpectateTarget,
  setSpectatorBanner,
  updateSpectatorView,
  resolveRoundTimeout
});
