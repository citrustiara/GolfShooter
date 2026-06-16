import "./globals.js";

// Finds the closest grapple anchor along a ray: world geometry, mesh colliders,
// the arena floor, or an enemy player. Returns { point, distance, targetPlayer }
// (targetPlayer is the player index when the hook lands on an enemy) or null.
function findGrappleTarget(origin, dir, range = GRAPPLE_RANGE) {
  let point = null, distance = Infinity, targetPlayer = null;
  const hits = new THREE.Raycaster(origin, dir, 0.2, range).intersectObjects(world.obstacles, true);
  if (hits.length) { point = hits[0].point.clone(); distance = hits[0].distance; }
  const meshHit = raycastTriangleMeshColliders(world.meshColliders, origin, dir, range);
  if (meshHit && meshHit.distance < distance) { point = meshHit.point.clone(); distance = meshHit.distance; }
  // Arena floors are not real obstacle meshes, so intersect their planes
  // analytically and accept hits only inside an actual floor footprint.
  const floors = Array.isArray(world.arenaFloors) ? world.arenaFloors : [];
  if (world.arenaFloorCollision !== false && floors.length && dir.y < -1e-4) {
    for (const floor of floors) {
      const floorY = Number(floor.y || 0);
      const t = (floorY - origin.y) / dir.y;
      if (t > 0.2 && t < range && t < distance) {
        const gp = origin.clone().addScaledVector(dir, t);
        if (isPointInsideArena(gp, [floor])) { point = gp.clone(); distance = t; targetPlayer = null; }
      }
    }
  }
  // Enemy players: only grabbable if nothing solid is closer along the ray.
  for (const { player, index } of opposingFpsPlayers()) {
    const hit = rayHitsPlayer(origin, dir, player);
    if (hit && hit.distance > 0.2 && hit.distance < range && hit.distance < distance) {
      point = playerBodyHitCenter(player); distance = hit.distance; targetPlayer = index;
    }
  }
  return point ? { point, distance, targetPlayer } : null;
}
// Two-charge plumbing: how many hooks can be banked and how fast each refills.
function grappleMaxCharges() { return GRAPPLE_MAX_CHARGES; }
function grappleRechargeTime() { return abilityCooldown("grapple", GRAPPLE_COOLDOWN); }
// Aim-assist lock: the in-range enemy closest to the aim line (within a tight
// cone and with clear line of sight) that the hook will snap onto. Returns
// { index, point, distance } or null. A lock guarantees the hook connects, but
// at reduced damage compared with a pixel-perfect direct hit.
function findGrappleLockTarget(origin, dir, range = GRAPPLE_RANGE) {
  const minDot = Math.cos(THREE.MathUtils.degToRad(GRAPPLE_LOCK_CONE_DEG));
  let best = null, bestDot = minDot;
  for (const { player, index } of opposingFpsPlayers()) {
    if (!player || player.health <= 0) continue;
    const point = playerBodyHitCenter(player);
    const toTarget = point.clone().sub(origin);
    const dist = toTarget.length();
    if (dist < 0.4 || dist > range) continue;
    const aimDot = toTarget.multiplyScalar(1 / dist).dot(dir);
    if (aimDot < bestDot) continue;
    if (!parryAimHasLineOfSight(origin, point)) continue;
    best = { index, point: point.clone(), distance: dist };
    bestDot = aimDot;
  }
  return best;
}
function spendGrappleCharge() {
  game.grappleCharges = Math.max(0, game.grappleCharges - 1);
  game.grappleGapTimer = GRAPPLE_QUICK_GAP;
  if (game.grappleChargeTimer <= 0) game.grappleChargeTimer = grappleRechargeTime();
}
function applyGrappleDeflectDamage(entry, parryEvent) {
  if (!entry) return;
  if (typeof applyPracticeBotDamageEntry === "function") applyPracticeBotDamageEntry(entry, parryEvent);
  else applyLocalDeflectedDamage(entry, parryEvent);
}
function tryParryGrappleTarget(targetIndex, origin, point, damage = GRAPPLE_PLAYER_DAMAGE) {
  if (!Number.isInteger(targetIndex) || targetIndex === game.localIndex) return false;
  if (!canPlayerParryShot(targetIndex, game.localIndex)) return false;
  const incoming = point.clone().sub(origin);
  const hitDistance = incoming.length();
  if (hitDistance <= 0.1) return false;
  incoming.multiplyScalar(1 / hitDistance);
  const cfg = { damage: Math.max(1, Number(damage) || GRAPPLE_PLAYER_DAMAGE), crit: 1, range: GRAPPLE_RANGE };
  const parry = triggerParryForHit({
    parrierIndex: targetIndex,
    attackerIndex: game.localIndex,
    shotOrigin: origin,
    incomingDirection: incoming,
    hitDistance,
    cfg,
    weaponId: "grapple"
  });
  if (parry.damageEntry) applyGrappleDeflectDamage(parry.damageEntry, parry.event);
  send({
    type: "fpsShot",
    player: game.localIndex,
    ox: origin.x,
    oy: origin.y,
    oz: origin.z,
    dx: incoming.x,
    dy: incoming.y,
    dz: incoming.z,
    hit: true,
    length: hitDistance,
    damage: parry.damageEntry?.damage || 0,
    target: parry.damageEntry?.target ?? null,
    damages: parry.damageEntry ? [parry.damageEntry] : [],
    weapon: "grapple",
    isGrapple: true,
    parry: parry.event
  });
  return true;
}
function activateGrappleAbility() {
  if (!localFpsPlayerCanFight() || game.countdown > 0 || game.radarTimer > 0 || !abilityAllowed("grapple")) return;
  // Hold-to-stay: already grappling (or the key is auto-repeating) keeps the
  // current hook; release happens on keyup. Don't re-fire while attached.
  if (game.grapple?.active) return;
  // Need a banked charge, and respect the short gap between consecutive throws
  // so both hooks can't be spent on the same frame.
  if (game.grappleCharges <= 0 || game.grappleGapTimer > 0) return;
  const p = fps.players[game.localIndex];
  const origin = new THREE.Vector3(p.pos.x, p.pos.y + (p.currentCamHeight || 1.58), p.pos.z);
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const lock = findGrappleLockTarget(origin, dir);
  const target = lock ? null : findGrappleTarget(origin, dir);
  if (!lock && !target) {
    // Whiffed hook: short retry gap, but no charge is spent.
    game.grappleGapTimer = Math.max(game.grappleGapTimer, 0.5);
    playSound("grapple", { volume: 0.4 });
    updateHud();
    return;
  }
  // Spend a charge and (re)start the background refill toward the next one.
  spendGrappleCharge();
  if (lock) {
    if (tryParryGrappleTarget(lock.index, origin, lock.point, GRAPPLE_LOCK_DAMAGE)) {
      updateHud();
      return;
    }
    game.grapple = { active: true, point: lock.point.clone(), targetPlayer: lock.index, locked: true, holdTimer: GRAPPLE_HOLD_LIMIT };
    grappleHitPlayer(lock.index, GRAPPLE_LOCK_DAMAGE);
  } else {
    if (target.targetPlayer != null && tryParryGrappleTarget(target.targetPlayer, origin, target.point, GRAPPLE_PLAYER_DAMAGE)) {
      updateHud();
      return;
    }
    game.grapple = { active: true, point: target.point.clone(), targetPlayer: target.targetPlayer, locked: false, holdTimer: GRAPPLE_HOLD_LIMIT };
    if (target.targetPlayer != null) grappleHitPlayer(target.targetPlayer, GRAPPLE_PLAYER_DAMAGE);
  }
  playSound("grapple", { volume: 0.9 });
  updateHud();
}
// Latching the hook onto an enemy deals a chunk of damage (and reels you in via
// the grapple pull). Damage is applied locally and mirrored to the peer; a
// locked-on hook deals less than a precise direct hit.
function grappleHitPlayer(index, damage = GRAPPLE_PLAYER_DAMAGE) {
  const target = fps.players[index];
  if (!target || index === game.localIndex) return;
  const wasAlive = target.health > 0;
  if (!wasAlive) return;
  const dmg = Math.max(0, Math.round(Number(damage) || 0));
  markEnemyOnHit(index);
  target.health = Math.max(0, target.health - dmg);
  const popPos = playerBodyHitCenter(target).add(new THREE.Vector3(0, 0.65, 0));
  showDamageDealt(dmg, popPos, false);
  showHitMarker(false);
  const killed = wasAlive && target.health === 0;
  send({ type: "fpsGrappleHit", player: game.localIndex, target: index, damage: dmg, killed });
  if (killed) {
    const aliveAfterKill = aliveFpsPlayerIndexes();
    const cinematicKill = aliveAfterKill.length === 1 && aliveAfterKill[0] === game.localIndex && willFpsKillWinMapOrMatch(game.localIndex);
    if (cinematicKill) broadcastKillEvent(index, { weapon: "grapple", distance: 0, headshot: false, finalKill: true });
    else showEliminationNotice(index, { weapon: "grapple", distance: 0, headshot: false, finalKill: aliveAfterKill.length <= 1 });
    if (aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
  }
  updateHud();
}
// Faint ring around the crosshair when the player is looking at something the
// grapple hook can grab; it turns red when that something is an enemy player.
function updateGrappleReticle() {
  if (!grappleReticle) return;
  const ready = game.phase === "fps" && game.countdown <= 0 && game.radarTimer <= 0
    && fps.players[game.localIndex]?.health > 0
    && abilityAllowed("grapple") && !game.grapple?.active
    && game.grappleCharges > 0 && game.grappleGapTimer <= 0;
  if (!ready) { grappleReticle.classList.remove("active", "enemy"); setGrappleLockBox(null); return; }
  const p = fps.players[game.localIndex];
  const origin = new THREE.Vector3(p.pos.x, p.pos.y + (p.currentCamHeight || 1.58), p.pos.z);
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const lock = findGrappleLockTarget(origin, dir);
  const target = lock ? null : findGrappleTarget(origin, dir);
  grappleReticle.classList.toggle("active", Boolean(lock || target));
  // The red enemy cue now lives on the locked enemy (a box around them), so the
  // crosshair ring stays neutral whenever a lock is held.
  grappleReticle.classList.remove("enemy");
  setGrappleLockBox(lock ? fps.players[lock.index] : null);
}
// Screen-space bounding rect of an enemy's hitbox, or null if off-screen/behind.
function enemyScreenRect(player) {
  const drop = playerSlideHitboxDrop(player);
  const viewDir = directionFromAngles(input.yaw, input.pitch);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, behind = false;
  for (const ox of [-0.62, 0.62]) {
    for (const oy of [0.05, 1.95 - drop]) {
      for (const oz of [-0.62, 0.62]) {
        const corner = new THREE.Vector3(player.pos.x + ox, player.pos.y + oy, player.pos.z + oz);
        if (corner.clone().sub(camera.position).dot(viewDir) < 0.2) { behind = true; break; }
        const screen = toScreen(corner);
        minX = Math.min(minX, screen.x); maxX = Math.max(maxX, screen.x);
        minY = Math.min(minY, screen.y); maxY = Math.max(maxY, screen.y);
      }
      if (behind) break;
    }
    if (behind) break;
  }
  if (behind || !Number.isFinite(minX)) return null;
  return { left: minX, top: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) };
}
// Red lock-on box drawn around the enemy the grapple has acquired.
function setGrappleLockBox(player) {
  if (!grappleLockBox) return;
  const rect = player ? enemyScreenRect(player) : null;
  if (!rect) { grappleLockBox.classList.add("hidden"); return; }
  grappleLockBox.style.left = `${rect.left}px`;
  grappleLockBox.style.top = `${rect.top}px`;
  grappleLockBox.style.width = `${rect.width}px`;
  grappleLockBox.style.height = `${rect.height}px`;
  grappleLockBox.classList.remove("hidden");
}
function releaseGrapple() {
  game.grapple = null;
  if (world.grappleRope) {
    world.arenaRoot.remove(world.grappleRope);
    world.grappleRope = null;
  }
}
function updateGrappleRope() {
  const g = game.grapple;
  if (!g?.active || game.phase !== "fps") {
    if (world.grappleRope) releaseGrapple();
    return;
  }
  if (!world.grappleRope) {
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0x20262e })
    );
    const hookHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    hookHead.name = "hookHead";
    rope.add(hookHead);
    world.grappleRope = rope;
    world.arenaRoot.add(rope);
  }
  const p = fps.players[game.localIndex];
  const start = new THREE.Vector3(p.pos.x, p.pos.y + 1.1, p.pos.z);
  const span = g.point.clone().sub(start);
  const length = Math.max(0.1, span.length());
  world.grappleRope.position.copy(start).addScaledVector(span, 0.5);
  world.grappleRope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
  world.grappleRope.scale.set(1, length, 1);
  const head = world.grappleRope.getObjectByName("hookHead");
  if (head) { head.position.set(0, 0.5, 0); head.scale.set(1, 1 / length, 1); }
}

Object.assign(globalThis, {
  findGrappleTarget,
  grappleMaxCharges,
  grappleRechargeTime,
  findGrappleLockTarget,
  spendGrappleCharge,
  tryParryGrappleTarget,
  activateGrappleAbility,
  grappleHitPlayer,
  updateGrappleReticle,
  enemyScreenRect,
  setGrappleLockBox,
  releaseGrapple,
  updateGrappleRope
});
