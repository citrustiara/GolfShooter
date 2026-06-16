import "./globals.js";

function localFpsPlayerCanFight() {
  return game.phase === "fps" && fps.players[game.localIndex]?.health > 0;
}

function activateJumpAbility() { if (!localFpsPlayerCanFight() || game.countdown > 0 || !abilityAllowed("jump") || game.jumpCooldown > 0) return; const p = fps.players[game.localIndex]; p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); updateHud(); }
function activateDashAbility() {
  if (!localFpsPlayerCanFight() || game.countdown > 0 || game.radarTimer > 0 || !abilityAllowed("dash") || game.dashCooldown > 0) return;
  const p = fps.players[game.localIndex];
  const forward = new THREE.Vector3(Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const dir = new THREE.Vector3();
  if (input.keys.has("KeyW")) dir.add(forward);
  if (input.keys.has("KeyS")) dir.sub(forward);
  if (input.keys.has("KeyA")) dir.sub(right);
  if (input.keys.has("KeyD")) dir.add(right);
  if (dir.lengthSq() < 0.01) dir.copy(forward);
  dir.normalize();
  p.vel.x = dir.x * DASH_SPEED;
  p.vel.z = dir.z * DASH_SPEED;
  if (p.vel.y < 0) p.vel.y = 0;
  game.dashTimer = DASH_DURATION;
  game.dashCooldown = abilityCooldown("dash", DASH_COOLDOWN);
  playSound("dash", { volume: 0.9 });
  updateHud();
}
function activateHealAbility() { if (!localFpsPlayerCanFight() || game.countdown > 0 || !abilityAllowed("heal") || game.healCooldown > 0) return; const p = fps.players[game.localIndex]; if (p.health >= game.maxHealth) return; p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); showHealed(); updateHud(); }

function countObstaclesBeforeDistance(intersections, meshWallHit, distance) {
  // Counts distinct obstacles the ray passes through before `distance`.
  // Intersections on child meshes of a decorated obstacle collapse to their
  // root so a single crate never counts as two walls.
  const pierced = new Set();
  for (const entry of intersections) {
    if (entry.distance >= distance) continue;
    let node = entry.object;
    while (node && !world.obstacles.includes(node)) node = node.parent;
    pierced.add(node || entry.object);
  }
  let count = pierced.size;
  if (meshWallHit && meshWallHit.distance < distance) count += 1;
  return count;
}
function fpsPlayerViewOrigin(player) {
  return new THREE.Vector3(player.pos.x, player.pos.y + (player.currentCamHeight || 1.58), player.pos.z);
}
function fpsPlayerAimDirection(player, preferNetworkTarget = false) {
  const yaw = preferNetworkTarget && Number.isFinite(player.targetYaw) ? player.targetYaw : (player.yaw || 0);
  const pitch = preferNetworkTarget && Number.isFinite(player.targetPitch) ? player.targetPitch : (player.pitch || 0);
  return directionFromAngles(yaw, pitch).normalize();
}
const ENEMY_MARK_DURATION = 1.5;
function enemyMarked(player) {
  return Boolean(player && (player.markedTimer || 0) > 0);
}
function markEnemyOnHit(index, duration = ENEMY_MARK_DURATION) {
  if (!Number.isInteger(index) || index === game.localIndex) return;
  const target = fps.players[index];
  if (!target || target.health <= 0) return;
  target.markedTimer = Math.max(target.markedTimer || 0, duration);
}
function markLocalPlayerOnHit(duration = ENEMY_MARK_DURATION) {
  const target = fps.players[game.localIndex];
  if (!target || target.health <= 0) return;
  target.markedTimer = Math.max(target.markedTimer || 0, duration);
}
function enemyAimingAtLocal(player) {
  const local = fps.players[game.localIndex];
  if (!local || local.health <= 0 || !player || player.health <= 0) return false;
  const weaponId = player.weapon === "melee" ? "melee" : (player.primaryWeapon || "pistol");
  if (player.weapon !== "gun" || weaponConfig(weaponId).meleeAttack) return false;
  const intent = Boolean(player.aiming || (player.scopeAmount || 0) > 0.2 || (player.visualRecoil || 0) > 0.08);
  if (!intent) return false;
  const origin = fpsPlayerViewOrigin(player);
  const aim = fpsPlayerAimDirection(player, true);
  const points = [playerHeadHitCenter(local), playerBodyHitCenter(local)];
  for (const point of points) {
    const toLocal = point.clone().sub(origin);
    const dist = toLocal.length();
    if (dist < 0.4) continue;
    const coneDeg = dist > 32 ? 14 : 22;
    if (aim.dot(toLocal.multiplyScalar(1 / dist)) < Math.cos(THREE.MathUtils.degToRad(coneDeg))) continue;
    if (parryAimHasLineOfSight(origin, point)) return true;
  }
  return false;
}
function fireHitscan() {
  if (!localFpsPlayerCanFight() || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.parryGuardActive) return;
  if (game.countdown > 0) return;
  const cfg = weaponConfig();
  if (cfg.meleeAttack) {
    // Blade weapons in the gun slot (katana): no ammo, no reload, fast swings.
    meleeStrike({
      range: cfg.range || 5.0,
      bodyDamage: cfg.damage || 70,
      headDamage: Math.floor((cfg.damage || 70) * (cfg.crit || 1.5)),
      swingDuration: 0.24,
      minDelay: cfg.fireDelay || 260,
      sound: "katana",
      weaponId: game.primaryWeapon
    });
    return;
  }
  if (game.reloading || game.ammo[game.primaryWeapon] <= 0) { if (game.ammo[game.primaryWeapon] <= 0) startReload(); return; }
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  if (cfg.projectile) { fireProjectileWeapon(cfg); return; }
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : (game.primaryWeapon === "minigun" ? 0.18 : game.primaryWeapon === "shotgun" ? 0.7 : 0.42); game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(game.primaryWeapon); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload(); updateHud();
  const shooter = fps.players[game.localIndex], origin = fpsPlayerViewOrigin(shooter);
  const pelletCount = cfg.pellets || 1, pellets = [], hitDamages = new Map(), hitHeadshots = new Map(), hitDistances = new Map(), deflectDamages = [], parriedTargets = new Set();
  let totalDamage = 0, anyHit = false, anyHeadshot = false, bestLength = cfg.range || 80, firstDirection = null, hitTarget = null, parryEvent = null;
  for (let i = 0; i < pelletCount; i++) {
    const spread = input.aiming ? (cfg.aimSpread ?? 0) : (cfg.spread ?? 0);
    const direction = spread > 0 ? directionFromAngles(input.yaw + (Math.random() - 0.5) * spread * 2, input.pitch + (Math.random() - 0.5) * spread).normalize() : directionFromAngles(input.yaw, input.pitch).normalize();
    firstDirection ||= direction;
    const maxRayDistance = cfg.range || 150;
    const ray = new THREE.Raycaster(origin, direction, 0, maxRayDistance), intersects = ray.intersectObjects(world.obstacles);
    const meshWallHit = raycastTriangleMeshColliders(world.meshColliders, origin, direction, maxRayDistance);
    let wallHit = intersects.length > 0 ? intersects[0] : null;
    if (meshWallHit && (!wallHit || meshWallHit.distance < wallHit.distance)) wallHit = meshWallHit;
    const grenadeHit = grenadeRayHit(origin, direction, wallHit ? wallHit.distance : (cfg.range || 150));
    if (grenadeHit) {
      if (grenadeHit.grenade.owner === game.localIndex) superchargeGrenade(grenadeHit.grenade, true);
      else disposeGrenade(grenadeHit.grenade, true);
      drawLaser(origin, direction, grenadeHit.distance, true, false, game.primaryWeapon);
      pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: grenadeHit.distance, hit: true });
      continue;
    }
    let playerHitResult = null;
    for (const candidate of opposingFpsPlayers()) {
      const hit = rayHitsPlayer(origin, direction, candidate.player);
      if (hit && (!playerHitResult || hit.distance < playerHitResult.distance)) playerHitResult = { ...hit, index: candidate.index, player: candidate.player };
    }
    let pelletHit = false, pelletParried = false, pelletDmg = 0, pelletHS = false, len = cfg.range || 80;
    if (playerHitResult) {
      const pDist = playerHitResult.distance;
      // Wallbang rule: a bullet punches through at most ONE obstacle (at half
      // damage). Two or more walls in the way fully stop the shot.
      const wallsBefore = countObstaclesBeforeDistance(intersects, meshWallHit, pDist);
      if (wallsBefore >= 2) {
        if (wallHit) len = wallHit.distance;
      } else {
        len = pDist;
        if (parriedTargets.has(playerHitResult.index)) {
          pelletParried = true;
        } else if (!parryEvent && canPlayerParryShot(playerHitResult.index, game.localIndex)) {
          const parry = triggerParryForHit({ parrierIndex: playerHitResult.index, attackerIndex: game.localIndex, shotOrigin: origin, incomingDirection: direction, hitDistance: pDist, cfg, weaponId: game.primaryWeapon });
          parryEvent = parry.event;
          if (parry.damageEntry) deflectDamages.push(parry.damageEntry);
          parriedTargets.add(playerHitResult.index);
          pelletParried = true;
        } else {
          pelletHit = true;
          pelletHS = playerHitResult.headshot;
          pelletDmg = Math.floor(cfg.damage * (pelletHS ? cfg.crit : 1) * (wallsBefore === 1 ? 0.5 : 1));
          hitTarget ??= playerHitResult.index;
        }
      }
    } else if (wallHit) len = wallHit.distance;
    drawLaser(origin, direction, len, pelletHit || pelletParried, false, game.primaryWeapon);
    pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: len, hit: pelletHit || pelletParried, parried: pelletParried });
    if (pelletParried) bestLength = Math.min(bestLength, len);
    if (pelletHit) { anyHit = true; anyHeadshot ||= pelletHS; totalDamage += pelletDmg; bestLength = Math.min(bestLength, len); hitDamages.set(playerHitResult.index, (hitDamages.get(playerHitResult.index) || 0) + pelletDmg); hitHeadshots.set(playerHitResult.index, Boolean(hitHeadshots.get(playerHitResult.index) || pelletHS)); hitDistances.set(playerHitResult.index, Math.min(hitDistances.get(playerHitResult.index) ?? Infinity, len)); }
  }
  const normalDamages = [...hitDamages.entries()].map(([target, damage]) => ({ target, damage, headshot: Boolean(hitHeadshots.get(target)), distance: hitDistances.get(target) }));
  for (const entry of normalDamages) {
    const target = fps.players[entry.target];
    const wasAlive = target.health > 0;
    markEnemyOnHit(entry.target);
    target.health = Math.max(0, target.health - entry.damage);
    entry.killed = wasAlive && target.health === 0;
    const popPos = entry.headshot ? playerHeadHitCenter(target).add(new THREE.Vector3(0, 0.18, 0)) : playerBodyHitCenter(target).add(new THREE.Vector3(0, 0.65, 0));
    showDamageDealt(entry.damage, popPos, entry.headshot);
    if (entry.killed && entry.target !== game.localIndex) {
      const aliveAfterKill = aliveFpsPlayerIndexes();
      const cinematicKill = aliveAfterKill.length === 1 && aliveAfterKill[0] === game.localIndex && willFpsKillWinMapOrMatch(game.localIndex);
      const killDetails = {
        weapon: game.primaryWeapon,
        distance: entry.distance ?? origin.distanceTo(target.pos.clone().add(new THREE.Vector3(0, 0.9, 0))),
        headshot: entry.headshot,
        finalKill: aliveAfterKill.length <= 1
      };
      if (cinematicKill) broadcastKillEvent(entry.target, { ...killDetails, finalKill: true });
      else showEliminationNotice(entry.target, killDetails);
    }
  }
  for (const entry of deflectDamages) applyLocalDeflectedDamage(entry, parryEvent);
  if (anyHit) { showHitMarker(anyHeadshot); updateHud(); }
  const damages = [...normalDamages, ...deflectDamages];
  const anyVisualHit = anyHit || Boolean(parryEvent);
  send({ type: "fpsShot", player: game.localIndex, ox: origin.x, oy: origin.y, oz: origin.z, dx: firstDirection.x, dy: firstDirection.y, dz: firstDirection.z, hit: anyVisualHit, length: bestLength, damage: damages[0]?.damage || totalDamage, target: damages[0]?.target ?? (anyHit ? hitTarget : null), damages, headshot: anyHeadshot || Boolean(parryEvent?.headshot), weapon: game.primaryWeapon, pellets: pelletCount > 1 ? pellets : null, parry: parryEvent });
  if ((anyHit || deflectDamages.some((entry) => entry.target === game.localIndex)) && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
}

function isPointInsideProjectileBlocker(point, radius = 0.18) {
  const box = new THREE.Box3();
  for (const obstacle of world.obstacles) {
    box.setFromObject(obstacle);
    if (box.distanceToPoint(point) < radius) return true;
  }
  return sphereIntersectsTriangleMeshColliders(world.meshColliders, point, radius);
}
function firstPersonProjectileOrigin(direction) {
  const camPos = camera.position.clone();
  const flatDir = directionFromAngles(input.yaw, 0);
  const right = new THREE.Vector3().crossVectors(flatDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const visualMuzzle = camPos.clone()
    .addScaledVector(direction, 0.55)
    .addScaledVector(right, 0.14)
    .addScaledVector(up, -0.12);

  if (!isPointInsideProjectileBlocker(visualMuzzle)) return visualMuzzle;

  for (const distance of [0.22, 0.36, 0.5, 0.68]) {
    const fallback = camPos.clone().addScaledVector(direction, distance);
    if (!isPointInsideProjectileBlocker(fallback, 0.12)) return fallback;
  }
  return camPos.clone().addScaledVector(direction, 0.16);
}
function fireProjectileWeapon(cfg) {
  if (!localFpsPlayerCanFight() || game.parryGuardActive) return;
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : 0.85; game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(cfg.projectile === "rocket" ? "rocket" : (cfg.projectile === "bouncer" ? "bouncerShot" : "grenade")); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload();
  const shooter = fps.players[game.localIndex];
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const origin = firstPersonProjectileOrigin(dir);
  if (cfg.projectile === "bouncer") {
    const vel = dir.clone().multiplyScalar(44);
    // High-damage orb that ricochets exactly once: first wall reflects it,
    // the second contact (or a direct player hit) detonates it.
    const options = { kind: "bouncer", weapon: game.primaryWeapon, timer: 6, gravity: 0, damageMultiplier: 1.3, radiusMultiplier: 0.52, maxBounces: 2 };
    spawnGrenade(origin, vel, true, game.localIndex, options);
    send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, ...options });
  } else if (cfg.projectile === "rocket") {
    const vel = dir.clone().multiplyScalar(58).add(shooter.vel.clone().multiplyScalar(0.25));
    spawnGrenade(origin, vel, true, game.localIndex, { kind: "rocket", weapon: game.primaryWeapon, timer: 4, gravity: 0, damageMultiplier: 1.14, radiusMultiplier: 0.85 });
    send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, kind: "rocket", weapon: game.primaryWeapon, timer: 4, gravity: 0, damageMultiplier: 1.14, radiusMultiplier: 0.85 });
  } else {
    const vel = dir.clone().multiplyScalar(54).add(shooter.vel);
    spawnGrenade(origin, vel, true, game.localIndex, { kind: "grenadeLauncher", weapon: game.primaryWeapon, timer: 1.65, gravity: GRENADE_GRAVITY * 0.82, damageMultiplier: 0.86, radiusMultiplier: 0.82 });
    send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, kind: "grenadeLauncher", weapon: game.primaryWeapon, timer: 1.65, gravity: GRENADE_GRAVITY * 0.82, damageMultiplier: 0.86, radiusMultiplier: 0.82 });
  }
  updateHud();
}
function playerSlideHitboxDrop(player) {
  return (player.visualSlide ?? (player.sliding ? 1 : 0)) * FPS_SLIDE_VISUAL_DROP;
}
function playerHeadHitCenter(player) {
  return player.pos.clone().add(new THREE.Vector3(0, FPS_HEAD_HIT_HEIGHT - playerSlideHitboxDrop(player), 0));
}
function playerBodyHitCenter(player) {
  return player.pos.clone().add(new THREE.Vector3(0, FPS_BODY_HIT_HEIGHT - playerSlideHitboxDrop(player), 0));
}
function meleeStrike({ range = 2.6, headDamage = 100, bodyDamage = 50, swingDuration = 0.32, minDelay = 320, sound = "melee", weaponId = "melee" } = {}) {
  if (!localFpsPlayerCanFight() || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.parryGuardActive) return;
  const now = performance.now();
  if (now - game.lastShotAt < minDelay) return;
  game.lastShotAt = now;
  game.meleeSwingTimer = swingDuration;
  playSound(sound);
  const s = fps.players[game.localIndex];
  const origin = new THREE.Vector3(s.pos.x, s.pos.y + (s.currentCamHeight || 0.72), s.pos.z);
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  drawMeleeSwipe(origin, dir);

  let hit = false, hs = false, targetIndex = null, targetDist = Infinity;
  for (const { player: opp, index } of opposingFpsPlayers()) {
    const hC = playerHeadHitCenter(opp), bC = playerBodyHitCenter(opp), dH = origin.distanceTo(hC), dB = origin.distanceTo(bC);
    if (dH < targetDist && dH < range && dir.dot(hC.clone().sub(origin).normalize()) > 0.72) { hit = true; hs = true; targetIndex = index; targetDist = dH; }
    else if (dB < targetDist && dB < range && dir.dot(bC.clone().sub(origin).normalize()) > 0.7) { hit = true; hs = false; targetIndex = index; targetDist = dB; }
  }

  let killed = false, parryEvent = null;
  const deflectDamages = [];
  const normalDamages = [];
  const parryCfg = { damage: bodyDamage, crit: Math.max(1, headDamage / Math.max(1, bodyDamage)), range: Math.max(range, 8) };
  const parried = hit && canPlayerParryShot(targetIndex, game.localIndex);
  if (parried) {
    const parry = triggerParryForHit({
      parrierIndex: targetIndex,
      attackerIndex: game.localIndex,
      shotOrigin: origin,
      incomingDirection: dir,
      hitDistance: targetDist,
      cfg: parryCfg,
      weaponId
    });
    parryEvent = parry.event;
    if (parry.damageEntry) deflectDamages.push(parry.damageEntry);
  } else if (hit) {
    const dmg = hs ? headDamage : bodyDamage;
    const opp = fps.players[targetIndex];
    const wasAlive = opp.health > 0;
    markEnemyOnHit(targetIndex);
    opp.health = Math.max(0, opp.health - dmg);
    killed = wasAlive && opp.health === 0;
    const entry = { target: targetIndex, damage: dmg, headshot: hs, distance: targetDist, killed };
    normalDamages.push(entry);
    showDamageDealt(dmg, hs ? playerHeadHitCenter(opp) : playerBodyHitCenter(opp), hs);
    showHitMarker(hs);
    if (killed && targetIndex !== game.localIndex) {
      const aliveAfterKill = aliveFpsPlayerIndexes();
      const cinematicKill = aliveAfterKill.length === 1 && aliveAfterKill[0] === game.localIndex && willFpsKillWinMapOrMatch(game.localIndex);
      const killDetails = { weapon: weaponId, distance: targetDist, headshot: hs, finalKill: aliveAfterKill.length <= 1 };
      if (cinematicKill) broadcastKillEvent(targetIndex, { ...killDetails, finalKill: true });
      else showEliminationNotice(targetIndex, killDetails);
    }
  }

  for (const entry of deflectDamages) applyLocalDeflectedDamage(entry, parryEvent);
  const damages = [...normalDamages, ...deflectDamages];
  const visualHit = hit || Boolean(parryEvent);
  send({
    type: "fpsShot",
    player: game.localIndex,
    ox: origin.x,
    oy: origin.y,
    oz: origin.z,
    dx: dir.x,
    dy: dir.y,
    dz: dir.z,
    hit: visualHit,
    damage: damages[0]?.damage || 0,
    target: damages[0]?.target ?? (hit && !parried ? targetIndex : null),
    damages,
    isMelee: true,
    weapon: weaponId,
    headshot: hs || Boolean(parryEvent?.headshot),
    distance: hit ? targetDist : null,
    killed,
    parry: parryEvent
  });
  if ((hit || deflectDamages.some((entry) => entry.target === game.localIndex)) && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
}
function fireMelee() { meleeStrike(); }
function rayHitsSphere(origin, direction, sphereCenter, radius) { const toCenter = sphereCenter.clone().sub(origin), projected = toCenter.dot(direction); if (projected < 0) return null; const closest = origin.clone().addScaledVector(direction, projected); return closest.distanceTo(sphereCenter) < radius ? projected : null; }
function rayHitsPlayer(origin, direction, player) { const hC = playerHeadHitCenter(player), hD = rayHitsSphere(origin, direction, hC, FPS_HEAD_HIT_RADIUS), bC = playerBodyHitCenter(player), bD = rayHitsSphere(origin, direction, bC, FPS_BODY_HIT_RADIUS); if (hD !== null && (bD === null || hD < bD)) return { distance: hD, headshot: true }; if (bD !== null) return { distance: bD, headshot: false }; return null; }
const TRACER_STYLES = {
  default: { core: 0xfff6d8, glow: 0xffb347, width: 1.0 },
  pistol: { core: 0xfff6d8, glow: 0xffc266, width: 0.9 },
  desertEagle: { core: 0xfff1c0, glow: 0xff8a00, width: 1.25 },
  rifle: { core: 0xe8fbff, glow: 0x4df3ff, width: 0.85 },
  ak47: { core: 0xfff0d0, glow: 0xff9540, width: 1.0 },
  minigun: { core: 0xfff4da, glow: 0xffd166, width: 0.7 },
  sniper: { core: 0xfffbe8, glow: 0xffe45c, width: 1.7 },
  heavySniper: { core: 0xffffff, glow: 0xff5c5c, width: 2.1 },
  tacticalSniper: { core: 0xeafcff, glow: 0x7ce7ff, width: 1.45 },
  shotgun: { core: 0xffe9cc, glow: 0xff8a4d, width: 0.65 },
  drumShotgun: { core: 0xffe9cc, glow: 0xff8a4d, width: 0.65 },
  laser: { core: 0xffffff, glow: 0xff3ea5, width: 1.1 },
  bouncer: { core: 0xeaffe9, glow: 0x6bf178, width: 1.2 },
  grapple: { core: 0xffffff, glow: 0xff7ee8, width: 1.05 },
  parry: { core: 0xffffff, glow: 0x7ee2ff, width: 1.65 },
  spermShooter: { core: 0xffffff, glow: 0xfff9e6, width: 0.9 },
  heavySpermShooter: { core: 0xffffff, glow: 0xfff3c4, width: 1.15 },
  heaviestSpermShooter: { core: 0xffffff, glow: 0xffeda0, width: 1.45 }
};

function drawLaser(origin, direction, length, hit, isRemote = false, weaponType = "pistol") {
  const start = new THREE.Vector3();
  if (!isRemote && world.weaponTip) {
    world.weaponTip.getWorldPosition(start);
    if (isPointInsideProjectileBlocker(start, 0.12)) {
      start.copy(firstPersonProjectileOrigin(direction));
    }
  } else {
    start.copy(origin);
  }
  const style = TRACER_STYLES[weaponType] || TRACER_STYLES.default;
  const end = origin.clone().addScaledVector(direction.clone().normalize(), length);
  const dist = Math.max(0.1, start.distanceTo(end));
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const aim = end.clone().sub(start).normalize();
  const ttl = FPS_LASER_TTL;
  const group = new THREE.Group();

  // Tapered hot core: thick at the muzzle, narrowing toward the impact point.
  const coreR = 0.026 * style.width;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(coreR * 0.45, coreR, dist, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: style.core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  core.position.copy(mid);
  core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(coreR * 1.4, coreR * 3.4, dist, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.copy(mid);
  glow.quaternion.copy(core.quaternion);

  // Muzzle flash puff at the start of the trace.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.085 * style.width, 8, 6),
    new THREE.MeshBasicMaterial({ color: style.core, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flash.position.copy(start).addScaledVector(aim, 0.06);
  flash.scale.set(1, 1, 1.8);
  flash.quaternion.copy(core.quaternion);

  group.add(glow, core, flash);

  // Impact spark where the shot connected with something.
  if (hit) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * style.width, 8, 6),
      new THREE.MeshBasicMaterial({ color: hit ? 0xff5c5c : style.glow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    spark.position.copy(end);
    group.add(spark);
    const ringGeo = new THREE.TorusGeometry(0.2 * style.width, 0.03, 6, 14);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(end);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
    group.add(ring);
  }

  world.arenaRoot.add(group);
  world.lasers.push({ beam: group, ttl, maxTtl: ttl, isTracer: true });
}
function drawMeleeSwipe(origin, direction) {
  // Diagonal crescent that mirrors the new club swing: thick golden core in the
  // middle of the arc, thinning to embers at both tips, slanted top-right to
  // bottom-left across the view.
  const swipeGroup = new THREE.Group();
  const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  const radius = 1.9, segments = 10, points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = -Math.PI * 0.42 + t * Math.PI * 0.84;
    points.push(origin.clone()
      .add(right.clone().multiplyScalar(Math.sin(theta) * radius))
      .add(direction.clone().multiplyScalar(Math.cos(theta) * radius))
      .add(up.clone().multiplyScalar(0.55 - t * 1.1)));
  }
  for (let i = 0; i < points.length - 1; i++) {
    const t = (i + 0.5) / segments;
    const thickness = 0.025 + Math.sin(t * Math.PI) * 0.085;
    const p1 = points[i], p2 = points[i + 1], mid = p1.clone().add(p2).multiplyScalar(0.5);
    const geom = new THREE.CylinderGeometry(thickness, thickness, p1.distanceTo(p2) * 1.08, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: t > 0.25 && t < 0.75 ? 0xfff3c4 : 0xffb347,
      transparent: true,
      opacity: 0.5 + Math.sin(t * Math.PI) * 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
    swipeGroup.add(mesh);
  }
  world.arenaRoot.add(swipeGroup);
  world.lasers.push({ beam: swipeGroup, ttl: 0.18, maxTtl: 0.18, isSwipe: true });
}
function flashParryImpactFrame() {
  let frame = document.getElementById("parryImpactFrame");
  if (!frame) {
    frame = document.createElement("div");
    frame.id = "parryImpactFrame";
    frame.className = "parry-impact-frame";
    overlay?.appendChild(frame);
  }
  frame.classList.remove("active");
  void frame.offsetWidth;
  frame.classList.add("active");
  window.setTimeout(() => frame.classList.remove("active"), 180);
}
function drawParryEffect(position, incomingDirection, outgoingDirection, weaponId = "melee", localImpact = false) {
  const pos = position.clone();
  const incoming = incomingDirection.clone().normalize();
  const outgoing = outgoingDirection.clone().normalize();
  const group = new THREE.Group();
  const color = weaponId === "katana" ? 0x9ff7ff : (weaponId === "grapple" ? 0xff7ee8 : 0xfff4a8);
  const normal = incoming.clone().negate().add(outgoing).normalize();
  const planeNormal = normal.lengthSq() > 0.001 ? normal : outgoing;
  const right = new THREE.Vector3().crossVectors(planeNormal, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, planeNormal).normalize();
  const hotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const accentMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.84, blending: THREE.AdditiveBlending, depthWrite: false });
  const hot = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 12),
    hotMat.clone()
  );
  hot.position.copy(pos);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 22, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })
  );
  halo.position.copy(pos);
  halo.userData.parryGrow = 1.4;
  group.add(halo, hot);

  for (const [radius, tube, opacity, spin] of [[0.48, 0.028, 0.95, 0], [0.76, 0.018, 0.62, Math.PI / 2]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 8, 42),
      accentMat.clone()
    );
    ring.material.opacity = opacity;
    ring.position.copy(pos);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), planeNormal);
    ring.rotateZ(spin);
    ring.userData.parryGrow = radius > 0.5 ? 0.85 : 0.55;
    group.add(ring);
  }

  for (const [axis, len, width, opacity] of [[right, 1.7, 0.035, 0.96], [up, 1.15, 0.025, 0.64], [outgoing, 0.92, 0.04, 0.78]]) {
    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(width, width * 0.45, len, 7),
      (axis === outgoing ? hotMat : accentMat).clone()
    );
    streak.material.opacity = opacity;
    streak.position.copy(pos).addScaledVector(axis, len * 0.08);
    streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    streak.userData.parryGrow = 0.25;
    group.add(streak);
  }

  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const dir = right.clone().multiplyScalar(Math.cos(angle)).add(up.clone().multiplyScalar(Math.sin(angle))).add(outgoing.clone().multiplyScalar(0.44 + Math.random() * 0.52)).normalize();
    const len = 0.32 + Math.random() * 0.68;
    const spark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.032, len, 5),
      new THREE.MeshBasicMaterial({ color: i % 3 ? color : 0xffffff, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    spark.position.copy(pos).addScaledVector(dir, len * 0.5);
    spark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spark.userData.parryGrow = 0.4 + Math.random() * 0.8;
    group.add(spark);
  }
  world.arenaRoot.add(group);
  world.lasers.push({ beam: group, ttl: 0.28, maxTtl: 0.28, isParry: true });
  if (localImpact) flashParryImpactFrame();
}
function updateLasers(dt) {
  for (let i = world.lasers.length - 1; i >= 0; i--) {
    const l = world.lasers[i];
    l.ttl -= dt;
    const life = Math.max(0, l.ttl / l.maxTtl);
    const fade = life * life;
    if (l.beam.isGroup) {
      l.beam.children.forEach(c => {
        if (!c.material) return;
        c.material.opacity = (c.userData.baseOpacity ??= c.material.opacity) * fade;
        // Tracers thin out as they fade so they read as a streak, not a beam.
        if (l.isTracer && c.geometry?.type === "CylinderGeometry") {
          c.scale.x = c.scale.z = 0.35 + life * 0.65;
        } else if (l.isTracer && c.geometry?.type !== "CylinderGeometry") {
          const grow = 1 + (1 - life) * 1.6;
          c.scale.setScalar(grow);
        } else if (l.isParry && c.userData.parryGrow) {
          c.scale.setScalar(1 + (1 - life) * c.userData.parryGrow);
        }
      });
    } else {
      l.beam.material.opacity = fade;
    }
    if (l.ttl <= 0) {
      world.arenaRoot.remove(l.beam);
      l.beam.traverse?.((child) => { if (child.isMesh) { child.geometry?.dispose?.(); child.material?.dispose?.(); } });
      world.lasers.splice(i, 1);
    }
  }
}
function showHitMarker(hs = false) { hitMarker.classList.toggle("headshot", hs); hitMarker.classList.remove("active"); void hitMarker.offsetWidth; hitMarker.classList.add("active"); clearTimeout(hitMarkerTimeout); hitMarkerTimeout = window.setTimeout(() => hitMarker.classList.remove("active", "headshot"), hs ? 190 : 145); }
function showDamageDealt(amt, worldPos, hs = false) { const pop = document.createElement("div"); pop.className = "damage-pop" + (hs ? " headshot" : ""); pop.textContent = `${Math.max(0, Math.round(Number(amt) || 0))}`; damageLayer.appendChild(pop); const now = performance.now(); if (now - lastDamageSoundAt > 45) { playSound("damage"); lastDamageSoundAt = now; } activeDamagePops.push({ element: pop, pos: worldPos.clone(), timer: 0.84, maxTimer: 0.84, headshot: hs }); }
function updateDamagePops(dt) { for (let i = activeDamagePops.length - 1; i >= 0; i--) { const p = activeDamagePops[i]; p.timer -= dt; if (p.timer <= 0) { p.element.remove(); activeDamagePops.splice(i, 1); } else { const off = p.pos.clone().add(new THREE.Vector3(0, (1.0 - p.timer / p.maxTimer) * 0.8, 0)), screen = toScreen(off); p.element.style.left = `${screen.x}px`; p.element.style.top = `${screen.y}px`; p.element.style.opacity = `${p.timer / p.maxTimer}`; p.element.style.transform = `translate(-50%, -50%) rotate(${p.headshot ? 4 : -4}deg) scale(${(p.headshot ? 1.2 : 1.0) + (1.0 - p.timer / p.maxTimer) * 0.35})`; } } }
function thirdPersonWeaponScale(weaponId) {
  const cfg = weaponConfig(weaponId);
  if (weaponId === "melee") return 0.58;
  return 0.78 * (cfg.scale || 1);
}

function syncThirdPersonWeaponMesh(group, weaponId) {
  if (!group || !weaponId) return;
  if (group.userData.weaponId !== weaponId) {
    const wasVisible = group.visible;
    rebuildWeaponMesh(weaponId, group);
    group.userData.weaponId = weaponId;
    group.visible = wasVisible;
  }

  if (weaponId === "melee") {
    group.position.set(0.05, 0.08, -0.16);
    group.rotation.set(0.35, -0.25, -0.5);
  } else {
    group.position.set(0.32, -0.08, -0.3);
    group.rotation.set(0.05, -0.1, 0.08);
  }
  group.scale.setScalar(thirdPersonWeaponScale(weaponId));
}

function enemyInCameraFrustum(player) {
  // FOV gate: the enemy must intersect the camera frustum.
  camera.updateMatrixWorld();
  const center = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
  return frustum.intersectsSphere(new THREE.Sphere(center, 1.1));
}

function enemyVisibleToCamera(player) {
  const center = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
  if (!enemyInCameraFrustum(player)) return false;
  // Line-of-sight gate: body or head must be reachable without crossing walls.
  for (const target of [center, playerHeadHitCenter(player)]) {
    const dir = target.clone().sub(camera.position);
    const dist = dir.length();
    if (dist < 0.5) return true;
    dir.normalize();
    const ray = new THREE.Raycaster(camera.position, dir, 0.1, dist - 0.6);
    if (ray.intersectObjects(world.obstacles, true).length) continue;
    if (raycastTriangleMeshColliders(world.meshColliders, camera.position, dir, dist - 0.6)) continue;
    return true;
  }
  return false;
}

function scopeHighlightActive() {
  return game.phase === "fps" && (game.scopeAmount || 0) > 0.55;
}

function enemyGlareScreenPoint(player) {
  const point = playerHeadHitCenter(player).lerp(playerBodyHitCenter(player), 0.18);
  const viewDir = directionFromAngles(input.yaw, input.pitch);
  if (point.clone().sub(camera.position).dot(viewDir) < 0.2) return null;
  return toScreen(point);
}

function updateScopeEnemyBoxes() {
  if (!enemyBoxLayer) return;
  let selfWarning = enemyBoxLayer.querySelector(".self-marked-warning");
  if (game.phase === "fps" && enemyMarked(fps.players[game.localIndex])) {
    if (!selfWarning) {
      selfWarning = document.createElement("div");
      selfWarning.className = "self-marked-warning";
      selfWarning.textContent = "YOU ARE MARKED";
      enemyBoxLayer.appendChild(selfWarning);
    }
  } else {
    selfWarning?.remove();
  }
  const scoped = scopeHighlightActive();
  // The radar pings enemies through walls, so it draws the same red boxes but
  // skips the line-of-sight gate the scope requires.
  const radar = game.phase === "fps" && game.radarTimer > 0;
  const usedBoxes = new Set();
  const usedGlares = new Set();
  for (const { player, index } of opposingFpsPlayers()) {
    const mesh = world.playerMeshes[index];
    if (!mesh?.visible) continue;
    const marked = enemyMarked(player);
    const shouldBox = scoped || radar || marked;
    if (shouldBox) {
      const visibleForBox = (radar || marked) ? enemyInCameraFrustum(player) : enemyVisibleToCamera(player);
      if (!visibleForBox) continue;
      const rect = enemyScreenRect(player);
      if (!rect) continue;
      usedBoxes.add(String(index));
      let el = enemyBoxLayer.querySelector(`[data-enemy="${index}"]`);
      if (!el) {
        el = document.createElement("div");
        el.className = "enemy-scope-box";
        el.dataset.enemy = String(index);
        enemyBoxLayer.appendChild(el);
      }
      el.classList.toggle("marked", marked);
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      let label = el.querySelector(".enemy-mark-label");
      if (marked) {
        if (!label) {
          label = document.createElement("span");
          label.className = "enemy-mark-label";
          el.appendChild(label);
        }
        label.textContent = playerDisplayName?.(index, `P${index + 1}`) || `P${index + 1}`;
      } else {
        label?.remove();
      }
    }

    if (game.phase === "fps" && enemyAimingAtLocal(player) && enemyVisibleToCamera(player)) {
      const screen = enemyGlareScreenPoint(player);
      if (!screen) continue;
      usedGlares.add(String(index));
      let glare = enemyBoxLayer.querySelector(`[data-aim-glare="${index}"]`);
      if (!glare) {
        glare = document.createElement("div");
        glare.className = "enemy-aim-glare";
        glare.dataset.aimGlare = String(index);
        enemyBoxLayer.appendChild(glare);
      }
      const distance = camera.position.distanceTo(playerHeadHitCenter(player));
      const scale = Math.max(0.78, Math.min(1.32, 26 / Math.max(12, distance)));
      glare.style.left = `${screen.x}px`;
      glare.style.top = `${screen.y}px`;
      glare.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }
  for (const el of [...enemyBoxLayer.children]) {
    if (el.classList.contains("enemy-scope-box") && !usedBoxes.has(el.dataset.enemy)) el.remove();
    if (el.classList.contains("enemy-aim-glare") && !usedGlares.has(el.dataset.aimGlare)) el.remove();
  }
}

function ensureParryGuardAura(mesh) {
  let aura = mesh.getObjectByName("parryGuardAura");
  if (aura) return aura;
  aura = new THREE.Group();
  aura.name = "parryGuardAura";
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const waist = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 8, 36), mat.clone());
  waist.userData.isParryGuardAura = true;
  waist.position.y = 0.86;
  waist.rotation.x = Math.PI / 2;
  const shoulders = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.03, 8, 36), mat.clone());
  shoulders.userData.isParryGuardAura = true;
  shoulders.position.y = 1.38;
  shoulders.rotation.x = Math.PI / 2;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.92, 18, 12), mat.clone());
  halo.userData.isParryGuardAura = true;
  halo.position.y = 0.95;
  halo.material.opacity = 0.12;
  halo.material.side = THREE.BackSide;
  aura.add(waist, shoulders, halo);
  aura.visible = false;
  mesh.add(aura);
  return aura;
}

function updatePlayerMeshes(dt = 1 / 60) {
  const isRadarActive = game.radarTimer > 0;
  const scopeActive = scopeHighlightActive();
  // While spectating a player in first person, hide their body so we aren't
  // looking out from inside their own mesh.
  const spectatedIdx = (game.phase === "fps" && (fps.players[game.localIndex]?.health ?? 1) <= 0) ? game.spectateTarget : -1;
  for (let i = 0; i < world.playerMeshes.length; i++) {
    const mesh = world.playerMeshes[i], player = fps.players[i];
    player.visualSlide = moveTowards(player.visualSlide || 0, player.sliding ? 1 : 0, dt * 8.0);
    mesh.position.copy(player.pos);
    mesh.position.y -= player.visualSlide * FPS_SLIDE_VISUAL_DROP;
    mesh.rotation.y = -player.yaw;

    const head = mesh.getObjectByName("headGroup");
    if (head) {
      head.rotation.x = player.pitch;
      const g = head.getObjectByName("gun"), m = mesh.getObjectByName("melee");
      if (g && m) {
        syncThirdPersonWeaponMesh(g, player.primaryWeapon || "pistol");
        syncThirdPersonWeaponMesh(m, "melee");
        g.visible = player.weapon === "gun";
        m.visible = player.weapon === "melee";
        const parryPulse = player.parryEffectTimer > 0 ? Math.sin((player.parryEffectTimer / 0.28) * Math.PI) : 0;
        if (parryPulse > 0) {
          const guard = player.weapon === "melee" ? m : g;
          guard.rotation.z += -0.9 * parryPulse;
          guard.rotation.x += 0.45 * parryPulse;
          guard.position.y += 0.08 * parryPulse;
        }
      }
    }

    mesh.visible = player.health > 0 && (game.phase === "fps" ? (i !== game.localIndex && i !== spectatedIdx) : (game.phase === "fpsVictoryLap" ? (i === game.result.winner && i !== game.localIndex) : false));

    const guardAura = ensureParryGuardAura(mesh);
    guardAura.visible = mesh.visible && Boolean(player.parryGuardActive);
    if (guardAura.visible) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.012) * 0.5;
      guardAura.scale.setScalar(1 + pulse * 0.08);
      guardAura.children.forEach((child, index) => {
        if (child.material) child.material.opacity = (index === 2 ? 0.09 : 0.28) + pulse * (index === 2 ? 0.07 : 0.16);
      });
    }

    // Procedural body animation (walk / idle / slide / air / reload). Cheap, and
    // skipped while the mesh is hidden (e.g. the local player in first person).
    if (mesh.visible) {
      const reloadingThis = i === game.localIndex ? game.reloading : Boolean(player.reloading);
      updatePlayerAnimation(mesh, player, dt, { reloading: reloadingThis, now: performance.now() * 0.001 });
    }

    // One on-screen visibility test per enemy per frame, shared by the sniper
    // scope highlight and the soft team-coloured outline below.
    const visibleToCam = mesh.visible && i !== game.localIndex && enemyVisibleToCamera(player);
    // Scope highlight: while hard-scoped, enemies in view with line of sight burn
    // bright red (depth-tested — never through walls).
    const scopeHighlight = scopeActive && visibleToCam;
    const parryGuardGlow = mesh.visible && Boolean(player.parryGuardActive);
    const markedGlow = mesh.visible && i !== game.localIndex && enemyMarked(player);

    // Wallhack uses per-mesh cloned materials so shared player materials are never left hidden/mutated.
    mesh.traverse((child) => {
      if (!child.isMesh || child.userData.isPlayerOutline || child.userData.isParryGuardAura) return;
      if (!child.userData.baseMaterial) {
        child.userData.baseMaterial = child.material;
        child.userData.baseRenderOrder = child.renderOrder || 0;
      }
      if ((isRadarActive || markedGlow) && mesh.visible) {
        if (!child.userData.wallhackMaterial) {
          child.userData.wallhackMaterial = new THREE.MeshBasicMaterial({
            color: 0xff1f1f,
            transparent: true,
            opacity: 0.82,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
          });
        }
        child.material = child.userData.wallhackMaterial;
        child.renderOrder = 9999;
      } else if (scopeHighlight) {
        child.userData.scopeMaterial ??= new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
        child.material = child.userData.scopeMaterial;
        child.renderOrder = child.userData.baseRenderOrder || 0;
      } else if (parryGuardGlow) {
        if (!child.userData.parryGuardMaterial) {
          child.userData.parryGuardMaterial = child.userData.baseMaterial.clone();
          if (child.userData.parryGuardMaterial.color) child.userData.parryGuardMaterial.color = child.userData.parryGuardMaterial.color.clone().lerp(new THREE.Color(0xffd166), 0.5);
          if (child.userData.parryGuardMaterial.emissive) {
            child.userData.parryGuardMaterial.emissive = new THREE.Color(0xffd166);
            child.userData.parryGuardMaterial.emissiveIntensity = 0.75;
          }
        }
        child.material = child.userData.parryGuardMaterial;
        child.renderOrder = child.userData.baseRenderOrder || 0;
      } else {
        child.material = child.userData.baseMaterial;
        child.renderOrder = child.userData.baseRenderOrder || 0;
      }
    });

    // Soft "sticker" outline in the enemy's own team colour whenever they are on
    // screen — a quieter, box-free cousin of the scope highlight that keeps
    // players readable. Suppressed while radar/scope already recolour them.
    setPlayerOutlineVisible(
      mesh,
      game.phase === "fps" && mesh.visible && (markedGlow || (visibleToCam && !isRadarActive && !scopeHighlight)),
      markedGlow ? 0xff1f1f : null
    );
  }
}

Object.assign(globalThis, {
  localFpsPlayerCanFight,
  activateJumpAbility,
  activateHealAbility,
  activateDashAbility,
  enemyInCameraFrustum,
  enemyVisibleToCamera,
  scopeHighlightActive,
  enemyMarked,
  updateScopeEnemyBoxes,
  enemyGlareScreenPoint,
  fpsPlayerViewOrigin,
  fpsPlayerAimDirection,
  countObstaclesBeforeDistance,
  markEnemyOnHit,
  markLocalPlayerOnHit,
  flashParryImpactFrame,
  fireHitscan,
  isPointInsideProjectileBlocker,
  firstPersonProjectileOrigin,
  fireProjectileWeapon,
  playerSlideHitboxDrop,
  playerHeadHitCenter,
  playerBodyHitCenter,
  meleeStrike,
  fireMelee,
  rayHitsSphere,
  rayHitsPlayer,
  drawLaser,
  drawMeleeSwipe,
  drawParryEffect,
  updateLasers,
  showHitMarker,
  showDamageDealt,
  updateDamagePops,
  thirdPersonWeaponScale,
  syncThirdPersonWeaponMesh,
  updatePlayerMeshes
});
