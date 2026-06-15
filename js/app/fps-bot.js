import "./globals.js";

const PRACTICE_BOT_INDEX = 1;
const BOT_EYE_HEIGHT = 1.48;

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function practiceBotEnabled() {
  return game.phase === "fps"
    && game.role === "solo"
    && !game.connected
    && game.localIndex === 0
    && game.playerCount === 2
    && Boolean(fps.players[PRACTICE_BOT_INDEX]);
}

function isPracticeBotPlayer(index) {
  return index === PRACTICE_BOT_INDEX && Boolean(fps.players[index]?.isPracticeBot);
}

function clearPracticeBots() {
  for (let i = 0; i < fps.players.length; i++) {
    const player = fps.players[i];
    if (!player) continue;
    player.isPracticeBot = false;
    player.practiceBot = null;
    if (player.nickname === "Practice Bot") player.nickname = "";
    if (game.playerNames?.[i] === "Practice Bot") game.playerNames[i] = `P${i + 1}`;
  }
}

function botWeaponId(bot) {
  return bot.weapon === "melee" ? "melee" : (bot.primaryWeapon || "pistol");
}

function botWeaponChoices() {
  const loadoutIds = loadoutWeaponList(activeLoadout()).filter((id, index, arr) => id && arr.indexOf(id) === index);
  const guns = loadoutIds
    .filter((id) => id !== "melee" && weaponCatalog[id])
    .filter((id) => !weaponConfig(id).projectile);
  const choices = guns.map((primary) => ({ active: "gun", primary }));
  if (loadoutIds.includes("melee")) choices.push({ active: "melee", primary: guns[0] || "pistol" });
  if (!choices.length) choices.push({ active: "gun", primary: guns[0] || "pistol" });
  return choices;
}

function setBotWeapon(bot, state, choice, animate = true) {
  if (!choice) return;
  if (bot.parryGuardActive) {
    bot.parryGuardActive = false;
    bot.parryGuardTimer = 0;
    bot.parryGuardCooldown = Math.max(bot.parryGuardCooldown || 0, PARRY_GUARD_COOLDOWN);
  }
  bot.weapon = choice.active;
  bot.primaryWeapon = choice.primary;
  bot.aiming = false;
  bot.reloading = false;
  bot.reloadTimer = 0;
  bot.weaponSwapTimer = animate ? WEAPON_SWAP_DURATION : 0;
  state.fireTimer = Math.max(state.fireTimer || 0, animate ? 0.45 : 0.1);
}

function switchBotToParryWeapon(bot, state) {
  const choices = botWeaponChoices();
  const current = botWeaponId(bot);
  if (isParryWeaponId(current)) return true;
  const parryChoice = choices.find((choice) => choice.active === "gun" && isParryWeaponId(choice.primary))
    || choices.find((choice) => choice.active === "melee");
  if (!parryChoice) return false;
  setBotWeapon(bot, state, parryChoice, true);
  return true;
}

function chooseBotWeapon(bot, state, targetDistance = 20, force = false) {
  const choices = botWeaponChoices();
  const current = botWeaponId(bot);
  const currentIsMelee = bot.weapon === "melee" || Boolean(weaponConfig(current).meleeAttack);
  const normalGuns = choices.filter((choice) => choice.active === "gun" && !weaponConfig(choice.primary).meleeAttack);
  const wantsGunPeek = (state.forceGunAfterMelee || state.forceGunAfterGuard || (currentIsMelee && targetDistance > 5.8 && Math.random() < 0.34)) && normalGuns.length > 0;
  if (!force && state.switchTimer > 0 && !wantsGunPeek) return;
  const parryActive = bot.parryGuardActive || bot.parryGuardTimer > 0;
  if (parryActive) return;

  let pool = choices;
  if (wantsGunPeek) {
    state.forceGunAfterMelee = false;
    state.forceGunAfterGuard = false;
    pool = normalGuns;
  } else
  if (targetDistance < 5.2) {
    const close = choices.filter((choice) => choice.active === "melee" || weaponConfig(choice.primary).meleeAttack);
    if (close.length && Math.random() < 0.55) pool = close;
  } else {
    const guns = choices.filter((choice) => choice.active === "gun" && !weaponConfig(choice.primary).meleeAttack);
    if (guns.length) pool = guns;
  }

  if (pool.length > 1) {
    const currentKey = bot.weapon === "melee" ? "melee" : bot.primaryWeapon;
    pool = pool.filter((choice) => (choice.active === "melee" ? "melee" : choice.primary) !== currentKey);
  }

  const choice = pool[Math.floor(Math.random() * pool.length)] || choices[0];
  if (force || choice.active !== bot.weapon || choice.primary !== current) {
    setBotWeapon(bot, state, choice, !force);
  }
  state.switchTimer = wantsGunPeek ? randRange(1.3, 2.8) : randRange(4.5, 8.0);
}

function resetPracticeBot() {
  clearPracticeBots();
  if (!practiceBotEnabled()) return;
  const bot = fps.players[PRACTICE_BOT_INDEX];
  bot.isPracticeBot = true;
  setPlayerName?.(PRACTICE_BOT_INDEX, "Practice Bot");
  bot.practiceBot = {
    moveTimer: 0,
    switchTimer: randRange(2.8, 5.2),
    fireTimer: randRange(1.0, 1.8),
    parryThinkTimer: randRange(0.6, 1.4),
    aimErrorTimer: 0,
    aimYawError: 0,
    aimPitchError: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    preferredDistance: randRange(13, 22),
    stuckTimer: 0,
    noSightTimer: 0,
    lastPosition: bot.pos.clone(),
    guardWasActive: false,
    forceGunAfterMelee: false,
    forceGunAfterGuard: false
  };
  bot.botAmmo = freshAmmoState();
  bot.reloading = false;
  bot.reloadTimer = 0;
  bot.weaponSwapTimer = 0;
  bot.meleeSwingTimer = 0;
  bot.inspectTimer = 0;
  bot.throwTimer = 0;
  bot.visualRecoil = 0;
  bot.radarActive = false;
  chooseBotWeapon(bot, bot.practiceBot, 20, true);
}

function botViewOrigin(bot) {
  return new THREE.Vector3(bot.pos.x, bot.pos.y + BOT_EYE_HEIGHT, bot.pos.z);
}

function aimAnglesFromTo(origin, target) {
  const dir = target.clone().sub(origin);
  const len = Math.max(0.0001, dir.length());
  dir.multiplyScalar(1 / len);
  return {
    yaw: Math.atan2(dir.x, -dir.z),
    pitch: Math.asin(Math.max(-0.98, Math.min(0.98, dir.y)))
  };
}

function botLineOfSight(origin, target) {
  const toTarget = target.clone().sub(origin);
  const dist = toTarget.length();
  if (dist < 0.6) return true;
  const dir = toTarget.multiplyScalar(1 / dist);
  const maxDist = Math.max(0.1, dist - 0.58);
  const ray = new THREE.Raycaster(origin, dir, 0.08, maxDist);
  if (ray.intersectObjects(world.obstacles, true).length) return false;
  return !raycastTriangleMeshColliders(world.meshColliders, origin, dir, maxDist);
}

function botCanSeePlayer(bot, target) {
  const origin = botViewOrigin(bot);
  return botLineOfSight(origin, playerBodyHitCenter(target)) || botLineOfSight(origin, playerHeadHitCenter(target));
}

function botPositionBlocked(position) {
  const probe = new THREE.Vector3(position.x, position.y + 0.78, position.z);
  for (const obs of world.obstacles) {
    if (obs.userData?.isRamp) continue;
    const box = new THREE.Box3().setFromObject(obs);
    if (box.distanceToPoint(probe) < FPS_PLAYER_RADIUS_WORLD + 0.18) return true;
  }
  return sphereIntersectsTriangleMeshColliders(world.meshColliders, probe, FPS_PLAYER_RADIUS_WORLD + 0.12);
}

function tryRepositionBotNearTarget(bot, target, state) {
  // Practice maps can be maze-like. If the dummy gets no line of sight for a
  // while, quietly reacquire a nearby legal spot so it remains useful for tests.
  for (let i = 0; i < 18; i++) {
    const angle = target.yaw + randRange(-Math.PI * 0.9, Math.PI * 0.9);
    const distance = randRange(10, 18);
    const candidate = new THREE.Vector3(
      target.pos.x + Math.sin(angle) * distance,
      target.pos.y + 0.05,
      target.pos.z - Math.cos(angle) * distance
    );
    if (!isPointInsideArena(candidate, world.arenaFloors, FPS_PLAYER_RADIUS_WORLD + 0.2)) continue;
    clampArenaPosition(candidate, FPS_PLAYER_RADIUS_WORLD + 0.2);
    if (candidate.distanceTo(target.pos) < 7 || botPositionBlocked(candidate)) continue;
    const origin = new THREE.Vector3(candidate.x, candidate.y + BOT_EYE_HEIGHT, candidate.z);
    if (!botLineOfSight(origin, playerBodyHitCenter(target)) && !botLineOfSight(origin, playerHeadHitCenter(target))) continue;
    bot.pos.copy(candidate);
    bot.vel.set(0, 0, 0);
    bot.grounded = false;
    bot.groundSurface = null;
    state.noSightTimer = 0;
    state.stuckTimer = 0;
    state.moveTimer = 0;
    state.fireTimer = Math.max(state.fireTimer || 0, randRange(0.55, 0.95));
    return true;
  }
  return false;
}

function playerAimingAtBot(bot, target) {
  const origin = fpsPlayerViewOrigin(target);
  const toBot = playerBodyHitCenter(bot).sub(origin);
  const distance = toBot.length();
  if (distance < 0.6) return true;
  const dir = toBot.multiplyScalar(1 / distance);
  const aim = fpsPlayerAimDirection(target);
  return aim.dot(dir) > Math.cos(THREE.MathUtils.degToRad(22)) && botLineOfSight(origin, playerBodyHitCenter(bot));
}

function updateBotAim(bot, target, state, dt) {
  state.aimErrorTimer -= dt;
  if (state.aimErrorTimer <= 0) {
    state.aimErrorTimer = randRange(0.28, 0.62);
    const closeScale = Math.max(0.45, Math.min(1.0, bot.pos.distanceTo(target.pos) / 28));
    state.aimYawError = randRange(-0.075, 0.075) * closeScale;
    state.aimPitchError = randRange(-0.045, 0.055) * closeScale;
  }
  const targetPoint = (Math.random() < 0.22 ? playerHeadHitCenter(target) : playerBodyHitCenter(target))
    .add(new THREE.Vector3(0, randRange(-0.08, 0.18), 0));
  const desired = aimAnglesFromTo(botViewOrigin(bot), targetPoint);
  const turnSpeed = bot.parryGuardActive ? 7.0 : 4.6;
  bot.yaw = lerpAngle(bot.yaw || 0, desired.yaw + state.aimYawError, Math.min(1, dt * turnSpeed));
  bot.pitch = moveTowards(bot.pitch || 0, desired.pitch + state.aimPitchError, dt * turnSpeed * 0.55);
  bot.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, bot.pitch));
  bot.currentCamHeight = moveTowards(bot.currentCamHeight || 1.58, bot.sliding ? 0.8 : 1.58, dt * 2.5);
}

function updateBotAnimationTimers(bot, dt) {
  for (const key of ["weaponSwapTimer", "meleeSwingTimer", "inspectTimer", "throwTimer", "visualRecoil"]) {
    if ((bot[key] || 0) > 0) bot[key] = Math.max(0, bot[key] - dt);
  }
  if (bot.reloading) {
    bot.reloadTimer = Math.max(0, (bot.reloadTimer || 0) - dt);
    if (bot.reloadTimer <= 0) {
      const weapon = bot.reloadWeapon || bot.primaryWeapon || "pistol";
      bot.botAmmo ||= freshAmmoState();
      bot.botAmmo[weapon] = weaponMaxAmmo(weapon);
      bot.reloading = false;
      bot.reloadWeapon = null;
    }
  }
}

function updateBotGuardState(bot, target, state, visible, distance, dt) {
  state.parryThinkTimer -= dt;
  if (state.guardWasActive && !bot.parryGuardActive && (bot.parryGuardCooldown || 0) <= 0) {
    bot.parryGuardCooldown = PARRY_GUARD_COOLDOWN;
  }
  state.guardWasActive = Boolean(bot.parryGuardActive);
  if (bot.parryGuardActive) {
    bot.aiming = false;
    return;
  }
  if (state.parryThinkTimer > 0 || (bot.parryGuardCooldown || 0) > 0 || (bot.weaponSwapTimer || 0) > 0) return;
  state.parryThinkTimer = randRange(0.32, 0.7);

  const threat = visible && playerAimingAtBot(bot, target) && (input.shootHeld || input.aiming || game.activeWeapon === "gun" || game.activeWeapon === "melee");
  const ambient = visible && distance < 26 && Math.random() < 0.055;
  if (!threat && !ambient) return;

  if (!isParryWeaponId(botWeaponId(bot))) {
    if (Math.random() < (threat ? 0.55 : 0.28)) switchBotToParryWeapon(bot, state);
    return;
  }

  const chance = threat ? 0.42 : 0.5;
  if (Math.random() > chance) return;
  bot.parryGuardActive = true;
  bot.parryGuardTimer = randRange(PARRY_GUARD_DURATION * 0.52, PARRY_GUARD_DURATION);
  bot.aiming = false;
  bot.reloading = false;
  bot.reloadTimer = 0;
  state.fireTimer = Math.max(state.fireTimer, bot.parryGuardTimer + 0.2);
  state.guardWasActive = true;
  state.forceGunAfterGuard = true;
}

function updateBotMovement(bot, target, state, visible, dt) {
  const previousPosition = bot.pos.clone();
  const previousY = previousPosition.y;
  const wasGrounded = bot.grounded;
  const wasGroundSurface = bot.groundSurface || null;
  state.moveTimer -= dt;
  if (state.moveTimer <= 0) {
    state.moveTimer = randRange(0.85, 1.9);
    state.strafeDir *= Math.random() < 0.42 ? -1 : 1;
    state.preferredDistance = randRange(12, 23);
  }

  const toTarget = new THREE.Vector3(target.pos.x - bot.pos.x, 0, target.pos.z - bot.pos.z);
  const distance = toTarget.length();
  const toward = distance > 0.001 ? toTarget.multiplyScalar(1 / distance) : new THREE.Vector3(0, 0, -1);
  const side = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(state.strafeDir);
  const move = new THREE.Vector3();
  if (visible) move.addScaledVector(side, 0.72);
  if (!visible || distance > state.preferredDistance + 4) move.addScaledVector(toward, visible ? 0.72 : 1.0);
  if (distance < Math.max(5.5, state.preferredDistance - 7)) move.addScaledVector(toward, -1.1);
  if (bot.parryGuardActive) move.multiplyScalar(0.35);
  if (move.lengthSq() > 0.001) move.normalize();

  const moved = previousPosition.distanceTo(state.lastPosition || previousPosition);
  state.lastPosition = previousPosition;
  if (move.lengthSq() > 0.01 && moved < 0.035 && bot.grounded) state.stuckTimer += dt;
  else state.stuckTimer = Math.max(0, state.stuckTimer - dt * 2);
  state.noSightTimer = visible ? 0 : (state.noSightTimer || 0) + dt;
  if ((state.noSightTimer > 4.6 || state.stuckTimer > 1.35) && tryRepositionBotNearTarget(bot, target, state)) {
    return;
  }
  if (state.stuckTimer > 0.45 && bot.grounded) {
    bot.vel.y = Math.max(bot.vel.y, 9.2);
    bot.grounded = false;
    state.stuckTimer = 0;
    state.strafeDir *= -1;
  }

  const weaponMoveScale = Math.max(0.72, Math.min(1.1, weaponConfig(botWeaponId(bot)).moveScale || 1));
  const accel = bot.grounded ? 55 : 18;
  bot.vel.addScaledVector(move, accel * weaponMoveScale * dt);
  const friction = Math.pow(bot.grounded ? 0.82 : 0.985, dt * 60);
  bot.vel.x *= friction;
  bot.vel.z *= friction;
  const maxSpeed = (bot.parryGuardActive ? 4.2 : 8.3) * weaponMoveScale;
  const horiz = Math.hypot(bot.vel.x, bot.vel.z);
  if (horiz > maxSpeed) {
    const s = maxSpeed / horiz;
    bot.vel.x *= s;
    bot.vel.z *= s;
  }

  bot.sliding = false;
  bot.airTime = bot.grounded ? 0 : (bot.airTime || 0) + dt;
  bot.vel.y += fps.gravity * dt;
  bot.pos.addScaledVector(bot.vel, dt);

  if (bot.vel.y > 0) {
    const previousHead = previousY + FPS_PLAYER_HEIGHT_WORLD;
    const currentHead = bot.pos.y + FPS_PLAYER_HEIGHT_WORLD;
    for (const block of [...world.platforms, ...world.obstacles]) {
      if (block.userData?.isRamp) continue;
      const b = new THREE.Box3().setFromObject(block);
      if (bot.pos.x > b.min.x - FPS_PLAYER_RADIUS_WORLD && bot.pos.x < b.max.x + FPS_PLAYER_RADIUS_WORLD &&
          bot.pos.z > b.min.z - FPS_PLAYER_RADIUS_WORLD && bot.pos.z < b.max.z + FPS_PLAYER_RADIUS_WORLD &&
          previousHead <= b.min.y + 0.2 && currentHead >= b.min.y) {
        bot.pos.y = b.min.y - FPS_PLAYER_HEIGHT_WORLD - 0.01;
        bot.vel.y = 0;
        break;
      }
    }
    resolvePlayerCeilingVsTriangleMeshColliders(world.meshColliders, bot, previousY, FPS_PLAYER_HEIGHT_WORLD, FPS_PLAYER_RADIUS_WORLD);
  }

  for (const ramp of world.ramps) resolvePlayerVsRampSolid(bot, previousPosition, ramp, FPS_PLAYER_RADIUS_WORLD);
  const rampSurface = fpsRampSurface(bot, previousPosition, bot.vel.y, wasGrounded, wasGroundSurface);
  const meshSurface = rampSurface ? null : meshGroundSurface(world.meshColliders, bot.pos, previousPosition, bot.vel.y, wasGrounded, wasGroundSurface, FPS_PLAYER_RADIUS_WORLD);
  const flatSurface = rampSurface || meshSurface ? null : fpsFlatSurfaceY(bot.pos, previousY, bot.vel.y, wasGrounded, wasGroundSurface);
  const surface = rampSurface || meshSurface || flatSurface;
  if (surface) {
    bot.pos.y = surface.y;
    bot.vel.y = 0;
    bot.grounded = true;
    bot.groundSurface = surface.surface;
  } else {
    let bestFloorY = -Infinity;
    if (world.arenaFloorCollision !== false) {
      for (const floor of world.arenaFloors) {
        const inside = floor.type === "circle"
          ? Math.hypot(bot.pos.x - floor.x, bot.pos.z - floor.z) <= floor.r + FPS_PLAYER_RADIUS_WORLD
          : Math.abs(bot.pos.x - floor.x) <= (floor.sx || 1) / 2 + FPS_PLAYER_RADIUS_WORLD &&
            Math.abs(bot.pos.z - floor.z) <= (floor.sz || 1) / 2 + FPS_PLAYER_RADIUS_WORLD;
        if (inside) bestFloorY = Math.max(bestFloorY, Number(floor.y || 0));
      }
    }
    if (bestFloorY !== -Infinity && bot.pos.y <= bestFloorY) {
      bot.pos.y = bestFloorY;
      bot.vel.y = 0;
      bot.grounded = true;
      bot.groundSurface = "floor";
    } else {
      bot.grounded = false;
      bot.groundSurface = null;
    }
  }

  clampArenaPosition(bot.pos, FPS_PLAYER_RADIUS_WORLD);
  resolvePlayerVsTriangleMeshColliders(world.meshColliders, bot, previousPosition, FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD);
  for (const obs of world.obstacles) {
    if (obs.userData?.isRamp || shouldSkipCompositeSurfaceCollision(bot, obs)) continue;
    resolvePlayerVsMeshObb(bot.pos, obs, FPS_PLAYER_RADIUS_WORLD);
  }
  resolvePlayerVsTriangleMeshColliders(world.meshColliders, bot, previousPosition, FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD);
  clampArenaPosition(bot.pos, FPS_PLAYER_RADIUS_WORLD);

  if (bot.pos.y < -8 && bot.health > 0) {
    bot.health = 0;
    const alive = aliveFpsPlayerIndexes();
    if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
    else if (alive.length === 0) startVictoryLap(-1, "deathmatch");
  }
}

function botShotSpread(weaponId, distance) {
  const cfg = weaponConfig(weaponId);
  const base = weaponId === "sniper" || weaponId === "heavySniper" || weaponId === "tacticalSniper" ? 0.018 : 0.042;
  const rangePenalty = Math.max(0, Math.min(0.05, (distance - 16) * 0.0022));
  const weaponSpread = cfg.spread ? cfg.spread * 0.35 : 0;
  return base + rangePenalty + weaponSpread;
}

function botFireDelay(weaponId) {
  const cfg = weaponConfig(weaponId);
  const base = Math.max(0.28, (cfg.fireDelay || 450) / 1000);
  return base * randRange(1.2, cfg.fireDelay <= 130 ? 2.2 : 1.75) + randRange(0.04, 0.18);
}

function botApplyDamageToLocal(botIndex, damage, headshot, distance, weaponId) {
  const target = fps.players[game.localIndex];
  if (!target || target.health <= 0 || damage <= 0) return;
  const wasAlive = target.health > 0;
  target.health = Math.max(0, target.health - damage);
  showDamageTaken(damage);
  if (wasAlive && target.health <= 0) {
    showKilledBy(weaponLabelText(weaponId), { headshot, distance, killerIndex: botIndex });
    const alive = aliveFpsPlayerIndexes();
    if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
  }
  updateHud();
}

function applyPracticeBotDamageEntry(entry, parryEvent = null) {
  if (!entry || entry.damage <= 0) return;
  if (entry.target === game.localIndex) {
    applyLocalDeflectedDamage(entry, parryEvent);
    return;
  }
  const bot = fps.players[entry.target];
  if (!bot?.isPracticeBot || bot.health <= 0) return;
  const wasAlive = bot.health > 0;
  bot.health = Math.max(0, bot.health - entry.damage);
  const popPos = entry.headshot ? playerHeadHitCenter(bot) : playerBodyHitCenter(bot).add(new THREE.Vector3(0, 0.5, 0));
  showDamageDealt(entry.damage, popPos, Boolean(entry.headshot));
  if (wasAlive && bot.health <= 0) {
    showEliminationNotice(entry.target, {
      weaponName: entry.weaponName || "Parried Shot",
      distance: entry.distance,
      headshot: Boolean(entry.headshot),
      killerIndex: game.localIndex,
      finalKill: aliveFpsPlayerIndexes().length <= 1
    });
    const alive = aliveFpsPlayerIndexes();
    if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
  }
  updateHud();
}

function botMeleeStrike(bot, botIndex, target, weaponId, state) {
  const cfg = weaponConfig(weaponId);
  const range = cfg.range || (weaponId === "melee" ? 2.6 : 4.6);
  const origin = botViewOrigin(bot);
  const dir = fpsPlayerAimDirection(bot).normalize();
  const body = playerBodyHitCenter(target);
  const head = playerHeadHitCenter(target);
  const targetDir = body.clone().sub(origin).normalize();
  const distance = Math.min(origin.distanceTo(body), origin.distanceTo(head));
  bot.meleeSwingTimer = weaponId === "melee" ? 0.32 : 0.24;
  drawMeleeSwipe(origin, dir);
  playSound(weaponId === "melee" ? "melee" : "katana", { position: origin, volume: 0.62 });
  state.fireTimer = randRange(0.55, 0.95);
  if (Math.random() < 0.72) {
    state.forceGunAfterMelee = true;
    state.switchTimer = Math.min(state.switchTimer || 0, randRange(0.7, 1.35));
  }
  if (distance > range || dir.dot(targetDir) < 0.72 || Math.random() < 0.18) return;
  const headshot = origin.distanceTo(head) < range && dir.dot(head.clone().sub(origin).normalize()) > 0.78 && Math.random() < 0.24;
  const damage = Math.max(12, Math.floor((headshot ? (cfg.damage || 60) * (cfg.crit || 1.25) : (cfg.damage || 45)) * 0.55));
  botApplyDamageToLocal(botIndex, damage, headshot, distance, weaponId);
}

function botFireGun(bot, botIndex, target, weaponId, state) {
  const cfg = weaponConfig(weaponId);
  if (cfg.projectile) return;
  bot.botAmmo ||= freshAmmoState();
  const ammo = bot.botAmmo[weaponId] ?? weaponMaxAmmo(weaponId);
  if (ammo <= 0) {
    bot.reloading = true;
    bot.reloadWeapon = weaponId;
    bot.reloadTimer = (cfg.reload || 1.2) * randRange(1.0, 1.35);
    state.fireTimer = bot.reloadTimer + randRange(0.25, 0.55);
    return;
  }

  const origin = botViewOrigin(bot);
  const targetCenter = Math.random() < 0.2 ? playerHeadHitCenter(target) : playerBodyHitCenter(target);
  const distance = origin.distanceTo(targetCenter);
  const spread = botShotSpread(weaponId, distance);
  const direction = directionFromAngles(
    bot.yaw + randRange(-spread, spread),
    bot.pitch + randRange(-spread * 0.62, spread * 0.62)
  ).normalize();
  const maxRayDistance = cfg.range || 150;
  const ray = new THREE.Raycaster(origin, direction, 0, maxRayDistance);
  const intersections = ray.intersectObjects(world.obstacles, true);
  const meshWallHit = raycastTriangleMeshColliders(world.meshColliders, origin, direction, maxRayDistance);
  let wallHit = intersections.length > 0 ? intersections[0] : null;
  if (meshWallHit && (!wallHit || meshWallHit.distance < wallHit.distance)) wallHit = meshWallHit;
  const playerHit = rayHitsPlayer(origin, direction, target);
  let len = wallHit ? wallHit.distance : Math.min(maxRayDistance, distance);
  let visualHit = false;
  let parryEvent = null;

  bot.botAmmo[weaponId] = ammo - 1;
  bot.visualRecoil = Math.min(1.4, (bot.visualRecoil || 0) + (cfg.recoil ?? 0.35) * 0.45);
  bot.aiming = true;
  playSound(weaponId, { position: origin, volume: 0.5, minDistance: 2, maxDistance: 58 });
  state.fireTimer = botFireDelay(weaponId);
  if (bot.botAmmo[weaponId] <= 0 && Math.random() < 0.7) {
    bot.reloading = true;
    bot.reloadWeapon = weaponId;
    bot.reloadTimer = (cfg.reload || 1.2) * randRange(1.0, 1.35);
    state.fireTimer = Math.max(state.fireTimer, bot.reloadTimer + 0.25);
  }

  if (playerHit) {
    const wallsBefore = countObstaclesBeforeDistance(intersections, meshWallHit, playerHit.distance);
    if (wallsBefore < 2 && (!wallHit || playerHit.distance < wallHit.distance)) {
      len = playerHit.distance;
      if (canPlayerParryShot(game.localIndex, botIndex)) {
        const parry = triggerParryForHit({
          parrierIndex: game.localIndex,
          attackerIndex: botIndex,
          shotOrigin: origin,
          incomingDirection: direction,
          hitDistance: playerHit.distance,
          cfg,
          weaponId
        });
        parryEvent = parry.event;
        if (parry.damageEntry) applyPracticeBotDamageEntry(parry.damageEntry, parryEvent);
        visualHit = true;
      } else {
        const damage = Math.floor(cfg.damage * (playerHit.headshot ? (cfg.crit || 1) : 1) * (wallsBefore === 1 ? 0.5 : 1) * 0.74);
        botApplyDamageToLocal(botIndex, damage, playerHit.headshot, playerHit.distance, weaponId);
        visualHit = true;
      }
    }
  }

  drawLaser(origin, direction, len, visualHit || Boolean(parryEvent), true, weaponId);
}

function updateBotCombat(bot, botIndex, target, state, visible, distance, dt) {
  state.fireTimer -= dt;
  if (!visible || game.countdown > 0 || bot.parryGuardActive || bot.reloading || (bot.weaponSwapTimer || 0) > 0) {
    bot.aiming = false;
    return;
  }
  const weaponId = botWeaponId(bot);
  bot.aiming = bot.weapon === "gun" && !weaponConfig(weaponId).meleeAttack && distance > 5;
  if (state.fireTimer > 0) return;

  const targetPoint = playerBodyHitCenter(target);
  const toTarget = targetPoint.sub(botViewOrigin(bot));
  const targetDir = toTarget.clone().normalize();
  const aimDot = fpsPlayerAimDirection(bot).dot(targetDir);
  if (aimDot < Math.cos(THREE.MathUtils.degToRad(distance > 24 ? 11 : 16))) {
    state.fireTimer = randRange(0.1, 0.28);
    return;
  }

  if (bot.weapon === "melee" || weaponConfig(weaponId).meleeAttack) {
    if (distance < (weaponConfig(weaponId).range || 4.6) + 0.8) botMeleeStrike(bot, botIndex, target, weaponId, state);
    else state.fireTimer = randRange(0.25, 0.5);
    return;
  }
  botFireGun(bot, botIndex, target, weaponId, state);
}

function updatePracticeBot(dt, now = performance.now()) {
  if (!practiceBotEnabled()) return;
  const bot = fps.players[PRACTICE_BOT_INDEX];
  const target = fps.players[game.localIndex];
  if (!bot?.isPracticeBot || !bot.practiceBot) resetPracticeBot();
  if (!bot?.isPracticeBot || !bot.practiceBot || !target) return;
  const state = bot.practiceBot;
  updateBotAnimationTimers(bot, dt);
  if (bot.health <= 0 || target.health <= 0 || game.finalKillCinematicActive) {
    bot.aiming = false;
    bot.parryGuardActive = false;
    bot.parryGuardTimer = 0;
    return;
  }

  const distance = bot.pos.distanceTo(target.pos);
  const visible = botCanSeePlayer(bot, target);
  chooseBotWeapon(bot, state, distance);
  updateBotAim(bot, target, state, dt);
  updateBotGuardState(bot, target, state, visible, distance, dt);
  updateBotMovement(bot, target, state, visible, dt);
  updateBotCombat(bot, PRACTICE_BOT_INDEX, target, state, visible, distance, dt);
  bot.targetPos = bot.pos.clone();
  bot.targetYaw = bot.yaw;
  bot.targetPitch = bot.pitch;
}

Object.assign(globalThis, {
  practiceBotEnabled,
  isPracticeBotPlayer,
  clearPracticeBots,
  resetPracticeBot,
  updatePracticeBot,
  applyPracticeBotDamageEntry
});
