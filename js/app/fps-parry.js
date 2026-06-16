import "./globals.js";

function parryWeaponForPlayer(index) {
  const player = fps.players[index];
  if (!player || player.health <= 0) return null;
  const active = index === game.localIndex ? game.activeWeapon : (player.weapon || "gun");
  const primary = index === game.localIndex ? game.primaryWeapon : (player.primaryWeapon || "pistol");
  const weaponId = active === "melee" ? "melee" : primary;
  return isParryWeaponId(weaponId) ? weaponId : null;
}
function startParryCooldownForPlayer(index, weaponId = parryWeaponForPlayer(index), cooldown = parryReloadForWeapon(weaponId || "melee")) {
  const player = fps.players[index];
  if (!player || !weaponId) return;
  const total = Math.max(0.1, Number(cooldown) || parryReloadForWeapon(weaponId));
  player.parryCooldown = total;
  player.parryReloadTotal = total;
  player.parryEffectTimer = 0.28;
  player.parryWeapon = weaponId;
  if (index === game.localIndex) {
    game.parryCooldown = total;
    game.parryReloadTotal = total;
    game.parryAnimTimer = 0.28;
  }
}
function localParryGuardWeapon() {
  const weaponId = activeFpsWeaponId();
  return isParryWeaponId(weaponId) ? weaponId : null;
}
function canStartParryGuard() {
  return Boolean(
    localFpsPlayerCanFight()
    && game.countdown <= 0
    && !game.finalKillCinematicActive
    && localParryGuardWeapon()
    && !game.parryGuardActive
    && game.parryGuardCooldown <= 0
    && game.radarTimer <= 0
    && game.throwBlockTimer <= 0
    && game.weaponSwapTimer <= 0
    && game.meleeSwingTimer <= 0
  );
}
function syncLocalParryGuardState() {
  const player = fps.players[game.localIndex];
  if (!player) return;
  player.parryGuardActive = Boolean(game.parryGuardActive);
  player.parryGuardTimer = game.parryGuardTimer;
  player.parryGuardCooldown = game.parryGuardCooldown;
  player.parryWeapon = localParryGuardWeapon() || activeFpsWeaponId();
}
function startParryGuard() {
  if (!canStartParryGuard()) return false;
  game.parryGuardActive = true;
  game.parryGuardTimer = PARRY_GUARD_DURATION;
  game.inspectTimer = 0;
  input.aiming = false;
  input.shootHeld = false;
  syncLocalParryGuardState();
  updateHud();
  return true;
}
function endParryGuard(startCooldown = true) {
  if (!game.parryGuardActive && game.parryGuardTimer <= 0) return false;
  game.parryGuardActive = false;
  game.parryGuardTimer = 0;
  if (startCooldown) game.parryGuardCooldown = PARRY_GUARD_COOLDOWN;
  syncLocalParryGuardState();
  updateHud();
  return true;
}
function cancelParryGuard() {
  game.parryGuardActive = false;
  game.parryGuardTimer = 0;
  syncLocalParryGuardState();
}
function updateParryGuardTimers(dt) {
  if (game.parryGuardCooldown > 0) game.parryGuardCooldown = Math.max(0, game.parryGuardCooldown - dt);
  if (game.parryGuardActive) {
    const invalid = !localFpsPlayerCanFight() || game.phase !== "fps" || game.countdown > 0 || game.finalKillCinematicActive || !localParryGuardWeapon() || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.weaponSwapTimer > 0;
    if (invalid) {
      cancelParryGuard();
    } else {
      game.parryGuardTimer = Math.max(0, game.parryGuardTimer - dt);
      if (game.parryGuardTimer <= 0) endParryGuard(true);
    }
  }
  syncLocalParryGuardState();
}
function parryAimHasLineOfSight(origin, point) {
  const toPoint = point.clone().sub(origin);
  const dist = toPoint.length();
  if (dist < 0.45) return true;
  const dir = toPoint.multiplyScalar(1 / dist);
  const ray = new THREE.Raycaster(origin, dir, 0.1, Math.max(0.1, dist - 0.55));
  if (ray.intersectObjects(world.obstacles, true).length) return false;
  return !raycastTriangleMeshColliders(world.meshColliders, origin, dir, Math.max(0.1, dist - 0.55));
}
function canPlayerParryShot(parrierIndex, attackerIndex) {
  const weaponId = parryWeaponForPlayer(parrierIndex);
  const parrier = fps.players[parrierIndex], attacker = fps.players[attackerIndex];
  if (!weaponId || !parrier || !attacker || attacker.health <= 0) return false;
  const active = parrierIndex === game.localIndex ? game.activeWeapon : (parrier.weapon || "gun");
  const guardActive = parrierIndex === game.localIndex ? Boolean(game.parryGuardActive && game.parryGuardTimer > 0) : Boolean(parrier.parryGuardActive && (parrier.parryGuardTimer ?? 1) > 0);
  if (!guardActive || (active !== "melee" && !(active === "gun" && weaponConfig(weaponId).meleeAttack))) return false;
  const cooldown = parrierIndex === game.localIndex ? game.parryCooldown : (parrier.parryCooldown || 0);
  if (cooldown > 0.02) return false;
  const origin = fpsPlayerViewOrigin(parrier);
  const aim = fpsPlayerAimDirection(parrier, parrierIndex !== game.localIndex);
  const minDot = Math.cos(THREE.MathUtils.degToRad(weaponConfig(weaponId).parryAngle ?? 20));
  for (const point of [playerBodyHitCenter(attacker), playerHeadHitCenter(attacker)]) {
    const toTarget = point.clone().sub(origin);
    if (toTarget.lengthSq() < 0.01) continue;
    const dir = toTarget.normalize();
    if (aim.dot(dir) >= minDot && parryAimHasLineOfSight(origin, point)) return true;
  }
  return false;
}
function parriedWeaponName(weaponId) {
  return `Parried ${weaponLabelText(weaponId)}`;
}
function buildDeflectedShot(parrierIndex, impact, cfg, weaponId) {
  const parrier = fps.players[parrierIndex];
  const direction = fpsPlayerAimDirection(parrier, parrierIndex !== game.localIndex);
  const maxRayDistance = cfg.range || 150;
  const ray = new THREE.Raycaster(impact, direction, 0.08, maxRayDistance);
  const intersects = ray.intersectObjects(world.obstacles, true);
  const meshWallHit = raycastTriangleMeshColliders(world.meshColliders, impact, direction, maxRayDistance);
  let wallHit = intersects.length > 0 ? intersects[0] : null;
  if (meshWallHit && (!wallHit || meshWallHit.distance < wallHit.distance)) wallHit = meshWallHit;
  let playerHitResult = null;
  for (let i = 0; i < fps.players.length; i++) {
    const candidate = fps.players[i];
    if (i === parrierIndex || !candidate || candidate.health <= 0) continue;
    const hit = rayHitsPlayer(impact, direction, candidate);
    if (hit && hit.distance > 0.2 && (!playerHitResult || hit.distance < playerHitResult.distance)) {
      playerHitResult = { ...hit, index: i, player: candidate };
    }
  }
  let len = wallHit ? wallHit.distance : maxRayDistance;
  let damageEntry = null;
  if (playerHitResult) {
    const wallsBefore = countObstaclesBeforeDistance(intersects, meshWallHit, playerHitResult.distance);
    if (wallsBefore < 2) {
      len = playerHitResult.distance;
      const damage = Math.floor((cfg.damage || 1) * (playerHitResult.headshot ? (cfg.crit || 1) : 1) * (wallsBefore === 1 ? 0.5 : 1));
      damageEntry = {
        target: playerHitResult.index,
        damage,
        headshot: playerHitResult.headshot,
        distance: len,
        parried: true,
        parrier: parrierIndex,
        weaponName: parriedWeaponName(weaponId)
      };
    }
  }
  return { origin: impact.clone(), direction, length: len, hit: Boolean(damageEntry), damageEntry };
}
function applyLocalDeflectedDamage(entry, parryEvent) {
  if (!entry || entry.target !== game.localIndex || entry.damage <= 0) return;
  const me = fps.players[game.localIndex];
  const wasAlive = me.health > 0;
  me.health = Math.max(0, me.health - entry.damage);
  markLocalPlayerOnHit?.();
  showDamageTaken(entry.damage);
  if (wasAlive && me.health <= 0) {
    showKilledBy(entry.weaponName || "Parried Shot", { headshot: entry.headshot, distance: entry.distance, killerIndex: parryEvent?.parrier });
    if (aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
  }
  updateHud();
}
function triggerParryForHit({ parrierIndex, attackerIndex, shotOrigin, incomingDirection, hitDistance, cfg, weaponId }) {
  const parryWeapon = parryWeaponForPlayer(parrierIndex);
  const cooldown = parryReloadForWeapon(parryWeapon);
  startParryCooldownForPlayer(parrierIndex, parryWeapon, cooldown);
  const impact = shotOrigin.clone().addScaledVector(incomingDirection, hitDistance);
  const deflect = buildDeflectedShot(parrierIndex, impact, cfg, weaponId);
  drawParryEffect(impact, incomingDirection, deflect.direction, parryWeapon, parrierIndex === game.localIndex);
  // The shooter whose shot was just reflected should see the impact frame too,
  // so both players are certain the parry landed. The parrier's own frame fires
  // from drawParryEffect; this covers the attacker side.
  if (attackerIndex === game.localIndex) flashParryImpactFrame();
  drawLaser(deflect.origin, deflect.direction, deflect.length, deflect.hit, true, "parry");
  playSound("parry", { position: impact, volume: parrierIndex === game.localIndex ? 1 : 0.88, minDistance: 1.5, maxDistance: 65 });
  const event = {
    parrier: parrierIndex,
    attacker: attackerIndex,
    weapon: parryWeapon,
    cooldown,
    x: impact.x,
    y: impact.y,
    z: impact.z,
    inDx: incomingDirection.x,
    inDy: incomingDirection.y,
    inDz: incomingDirection.z,
    outDx: deflect.direction.x,
    outDy: deflect.direction.y,
    outDz: deflect.direction.z,
    outLength: deflect.length,
    outHit: deflect.hit,
    target: deflect.damageEntry?.target ?? null,
    damage: deflect.damageEntry?.damage || 0,
    headshot: Boolean(deflect.damageEntry?.headshot),
    distance: deflect.damageEntry?.distance ?? deflect.length
  };
  return { event, damageEntry: deflect.damageEntry };
}

Object.assign(globalThis, {
  parryWeaponForPlayer,
  startParryCooldownForPlayer,
  localParryGuardWeapon,
  canStartParryGuard,
  syncLocalParryGuardState,
  startParryGuard,
  endParryGuard,
  cancelParryGuard,
  updateParryGuardTimers,
  parryAimHasLineOfSight,
  canPlayerParryShot,
  parriedWeaponName,
  buildDeflectedShot,
  applyLocalDeflectedDamage,
  triggerParryForHit
});
