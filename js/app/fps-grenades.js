import "./globals.js";

function updateGrenades(dt) {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const g = world.grenades[i];
    if (g.kind === "rocket") {
      g.mesh.position.addScaledVector(g.vel, dt);
    } else {
      g.vel.y += (g.gravity ?? GRENADE_GRAVITY) * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
    }
    
    // Rockets should not rotate around X/Y to preserve forward direction
    if (g.kind !== "rocket") {
      g.mesh.rotation.x += 5 * dt;
      g.mesh.rotation.y += 3 * dt;
    }
    
    g.timer -= dt;
    
    const detonatesOnContact = g.kind === "rocket" || g.kind === "grenadeLauncher";
    const isBouncer = g.kind === "bouncer";
    let hitObstacle = false;
    if (detonatesOnContact) {
      hitObstacle = projectileHitObstacle(g);
    } else {
      const speedBefore = isBouncer ? g.vel.length() : 0;
      for (const obs of world.obstacles) {
        if (collideGrenadeWithObstacle(g, obs, isBouncer ? 0.3 : 0.22)) hitObstacle = true;
      }
      if (collideSphereWithTriangleMeshColliders(world.meshColliders, g.mesh.position, g.vel, isBouncer ? 0.3 : 0.22, isBouncer ? 0.98 : 0.4, isBouncer ? 0.99 : 0.8)) hitObstacle = true;
      if (isBouncer && hitObstacle) {
        // Wall reflection keeps the orb at full speed so it ping-pongs around
        // the arena instead of dying against the first wall.
        if (g.vel.lengthSq() > 0.001) g.vel.setLength(speedBefore);
        g.bounces = (g.bounces || 0) + 1;
        playSound("ricochet", { position: g.mesh.position, volume: 0.8 });
      }
    }
    
    let outOfArena = !isPointInsideArena(g.mesh.position, world.arenaFloors, 0.1);
    if (outOfArena && isBouncer) {
      // The map edge acts as a wall for bouncer orbs: reflect back inside so
      // open arena borders count as a ricochet surface instead of a detonation.
      const speedBefore = g.vel.length();
      const inside = clampArenaPosition(g.mesh.position.clone(), 0.45, world.arenaFloors);
      let nx = inside.x - g.mesh.position.x;
      let nz = inside.z - g.mesh.position.z;
      const len = Math.hypot(nx, nz);
      if (len > 0.0001) {
        nx /= len; nz /= len;
        const dot = g.vel.x * nx + g.vel.z * nz;
        if (dot < 0) { g.vel.x -= 2 * dot * nx; g.vel.z -= 2 * dot * nz; }
      } else {
        g.vel.x *= -1;
        g.vel.z *= -1;
      }
      if (g.vel.lengthSq() > 0.001) g.vel.setLength(speedBefore);
      g.mesh.position.x = inside.x;
      g.mesh.position.z = inside.z;
      g.bounces = (g.bounces || 0) + 1;
      playSound("ricochet", { position: g.mesh.position, volume: 0.8 });
      outOfArena = false;
    }
    const hitPlayer = projectileHitPlayer(g);
    
    let hitGround = false;
    let bestFloorY = -Infinity;
    if (world.arenaFloorCollision !== false) {
      for (const floor of world.arenaFloors) {
        if (floor.type === "circle") {
          if (Math.hypot(g.mesh.position.x - floor.x, g.mesh.position.z - floor.z) <= floor.r) {
            const y = Number(floor.y || 0);
            if (y > bestFloorY) bestFloorY = y;
          }
        } else {
          const halfX = (floor.sx || 1) / 2;
          const halfZ = (floor.sz || 1) / 2;
          if (Math.abs(g.mesh.position.x - floor.x) <= halfX && Math.abs(g.mesh.position.z - floor.z) <= halfZ) {
            const y = Number(floor.y || 0);
            if (y > bestFloorY) bestFloorY = y;
          }
        }
      }
    }
    if (bestFloorY !== -Infinity && g.mesh.position.y < bestFloorY + 0.22) {
      hitGround = true;
    }
    
    if (hitGround && g.kind !== "rocket" && g.kind !== "grenadeLauncher") {
      g.mesh.position.y = bestFloorY + (isBouncer ? 0.3 : 0.22);
      if (isBouncer) {
        g.vel.y = Math.abs(g.vel.y);
        g.bounces = (g.bounces || 0) + 1;
        playSound("ricochet", { position: g.mesh.position, volume: 0.8 });
      } else {
        g.vel.y *= -0.4;
        g.vel.x *= 0.8;
        g.vel.z *= 0.8;
      }
    }

    const bouncerSpent = isBouncer && (g.bounces || 0) >= (g.maxBounces || 6);
    const superchargedImpact = g.isSupercharged && g.kind === "grenade" && (hitObstacle || hitGround || hitPlayer);
    if (outOfArena || (hitObstacle && detonatesOnContact) || hitPlayer || (hitGround && detonatesOnContact) || superchargedImpact || bouncerSpent || g.timer <= 0 || g.mesh.position.y < -8) {
      if (g.kind === "smoke") {
        if (g.mesh.position.y >= -8) {
          if (g.localAuthority) deploySmokeGrenade(g);
          else if (!g.id) createSmokeCloud(g.mesh.position.clone(), smokeCloudRadius(g), g.smokeDuration || SMOKE_GRENADE_DURATION, null);
        }
      } else if (g.localAuthority) explodeGrenade(g);
      else createExplosion(g.mesh.position.clone(), grenadeRadius(g) * 0.45);
      world.arenaRoot.remove(g.mesh);
      world.grenades.splice(i, 1);
    }
  }
}
function spawnGrenade(pos, vel, local = true, owner = 0, options = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: owner === game.localIndex ? 0x243c34 : 0x4a2528, roughness: 0.38, metalness: 0.28, emissive: options.supercharged ? 0xa74dff : 0x000000, emissiveIntensity: options.supercharged ? 0.9 : 0 });
  const glowMat = new THREE.MeshBasicMaterial({ color: owner === game.localIndex ? 0x7ee2a8 : 0xff6f61 });
  if (options.kind === "rocket") {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 14), bodyMat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.28, 14), glowMat);
    nose.position.y = -0.14; // Align visual nose tip at local y = 0
    shell.position.y = -0.68; // Align cylinder top at base of nose cone
    group.add(shell, nose);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.clone().normalize());
  } else if (options.kind === "bouncer") {
    // Glowing energy orb with gyro rings — reads clearly while ping-ponging.
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x1c3a24, roughness: 0.3, metalness: 0.4, emissive: 0x6bf178, emissiveIntensity: 1.2 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), orbMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xb9ffc2 });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 6, 22), ringMat);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 6, 22), ringMat);
    ringB.rotation.x = Math.PI / 2;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6bf178, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(orb, ringA, ringB, halo);
  } else if (options.kind === "smoke") {
    const smokeBodyMat = new THREE.MeshStandardMaterial({ color: 0xb5bcc0, roughness: 0.64, metalness: 0.28 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x5f666a, roughness: 0.58, metalness: 0.38 });
    const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.54, 14), smokeBodyMat);
    const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.045, 14), capMat);
    const capB = capA.clone();
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 6, 18), new THREE.MeshBasicMaterial({ color: 0xe8eef2 }));
    canister.rotation.z = Math.PI / 2;
    capA.rotation.z = Math.PI / 2;
    capB.rotation.z = Math.PI / 2;
    stripe.rotation.y = Math.PI / 2;
    capA.position.x = -0.29;
    capB.position.x = 0.29;
    group.add(canister, capA, capB, stripe);
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), bodyMat);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 24), glowMat);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.45 }));
    band.rotation.x = Math.PI / 2;
    pin.position.set(0.12, 0.18, 0);
    pin.rotation.y = Math.PI / 2;
    group.add(body, band, pin);
  }
  group.position.copy(pos);
  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  world.arenaRoot.add(group);
  const isBouncerKind = options.kind === "bouncer";
  world.grenades.push({ mesh: group, vel, timer: options.timer ?? 2.5, owner, localAuthority: local, kind: options.kind || "grenade", weapon: options.weapon || null, weaponName: options.weaponName || null, gravity: options.gravity ?? GRENADE_GRAVITY, damageMultiplier: options.damageMultiplier || 1, radiusMultiplier: options.radiusMultiplier || 1, smokeRadius: options.radius || options.smokeRadius || SMOKE_GRENADE_RADIUS, smokeDuration: options.duration || options.smokeDuration || SMOKE_GRENADE_DURATION, id: options.id || null, isSupercharged: Boolean(options.supercharged), bounces: 0, maxBounces: options.maxBounces || (isBouncerKind ? 2 : 6), bounciness: isBouncerKind ? 0.98 : undefined, tangentKeep: isBouncerKind ? 0.99 : undefined });
}
function startThrowAnimation(kind = "grenade") {
  if (game.parryGuardActive) endParryGuard(true);
  game.throwTimer = 0.36;
  game.throwBlockTimer = Math.max(game.throwBlockTimer || 0, 0.36);
  game.throwKind = kind;
  game.inspectTimer = 0;
  input.aiming = false;
}
function firstPersonThrowOrigin(direction) {
  const camPos = camera.position.clone();
  const flatDir = directionFromAngles(input.yaw, 0);
  const right = new THREE.Vector3().crossVectors(flatDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const handOrigin = camPos.clone()
    .addScaledVector(direction, 0.58)
    .addScaledVector(right, 0.24)
    .addScaledVector(up, -0.16);
  if (!isPointInsideProjectileBlocker(handOrigin, 0.16)) return handOrigin;
  for (const distance of [0.28, 0.42, 0.58, 0.74]) {
    const fallback = camPos.clone().addScaledVector(direction, distance).addScaledVector(up, -0.04);
    if (!isPointInsideProjectileBlocker(fallback, 0.12)) return fallback;
  }
  return camPos.clone().addScaledVector(direction, 0.18);
}
function throwGrenade() {
  if (!localFpsPlayerCanFight() || game.countdown > 0 || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.grenadeCooldown > 0 || !abilityAllowed("grenade")) return;
  game.grenadeCooldown = abilityCooldown("grenade", GRENADE_COOLDOWN);
  const p = fps.players[game.localIndex];
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const origin = firstPersonThrowOrigin(dir);
  const vel = dir.clone().multiplyScalar(GRENADE_SPEED).add(p.vel.clone().multiplyScalar(0.75));
  startThrowAnimation("grenade");
  spawnGrenade(origin, vel, true, game.localIndex, { weaponName: "Grenade" });
  playSound("grenade");
  send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, weaponName: "Grenade" });
  updateHud();
}
function throwSmokeGrenade() {
  if (!localFpsPlayerCanFight() || game.countdown > 0 || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.smokeCooldown > 0 || !abilityAllowed("smoke")) return;
  game.smokeCooldown = abilityCooldown("smoke", SMOKE_GRENADE_COOLDOWN);
  const p = fps.players[game.localIndex];
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const origin = firstPersonThrowOrigin(dir);
  const id = `${game.localIndex}-${Math.floor(performance.now())}-${Math.random().toString(36).slice(2, 8)}`;
  const vel = dir.clone().multiplyScalar(SMOKE_GRENADE_SPEED).add(p.vel.clone().multiplyScalar(0.75));
  const options = { kind: "smoke", weaponName: "Smoke Grenade", timer: 1.8, gravity: GRENADE_GRAVITY * 0.82, radius: SMOKE_GRENADE_RADIUS, duration: SMOKE_GRENADE_DURATION, id };
  startThrowAnimation("smoke");
  spawnGrenade(origin, vel, true, game.localIndex, options);
  playSound("smoke");
  send({ type: "fpsGrenadeThrow", x: origin.x, y: origin.y, z: origin.z, vx: vel.x, vy: vel.y, vz: vel.z, owner: game.localIndex, ...options });
  updateHud();
}

function grenadeRadius(g) { return GRENADE_SPLASH_RADIUS * (g.radiusMultiplier || 1); }
function grenadeDamage(g) { return GRENADE_MAX_DAMAGE * (g.damageMultiplier || 1); }
function explosiveWeaponLabel(g) { if (g.weaponName) return g.weaponName; if (g.weapon && weaponCatalog[g.weapon]) return weaponLabelText(g.weapon); if (g.kind === "rocket") return "Rocket Launcher"; if (g.kind === "grenadeLauncher") return "Grenade Launcher"; return "Grenade"; }
function projectileHitObstacle(g) { if (g.kind !== "rocket" && g.kind !== "grenadeLauncher") return false; const radius = g.kind === "grenadeLauncher" ? 0.32 : 0.26; const b = new THREE.Box3(); for (const obs of world.obstacles) { b.setFromObject(obs); if (b.distanceToPoint(g.mesh.position) < radius) return true; } return sphereIntersectsTriangleMeshColliders(world.meshColliders, g.mesh.position, radius); }
function projectileHitPlayer(g) {
  const superchargedGrenade = g.kind === "grenade" && g.isSupercharged;
  if (g.kind !== "rocket" && g.kind !== "grenadeLauncher" && g.kind !== "bouncer" && !superchargedGrenade) return false;
  const radius = superchargedGrenade ? 0.62 : (g.kind === "bouncer" ? 0.8 : (g.kind === "grenadeLauncher" ? 0.86 : 0.95));
  return fps.players.some((p, index) => index !== g.owner && p.health > 0 && p.pos.clone().add(new THREE.Vector3(0, 0.72, 0)).distanceTo(g.mesh.position) < radius);
}
function explodeGrenade(g) {
  const pos = g.mesh.position.clone();
  world.arenaRoot.remove(g.mesh);
  createExplosion(pos, grenadeRadius(g) * 0.5);
  playSound("explosion");
  const damages = [];
  const weaponName = explosiveWeaponLabel(g);
  const ownerPos = fps.players[g.owner]?.pos;
  for (let i = 0; i < fps.players.length; i++) {
    const target = fps.players[i];
    const dist = pos.distanceTo(target.pos.clone().add(new THREE.Vector3(0, 0.72, 0)));
    const radius = grenadeRadius(g);
    if (dist < radius && target.health > 0) {
      const dmg = Math.floor((1.0 - dist / radius) * grenadeDamage(g));
      if (dmg > 0) {
        const killDistance = ownerPos ? ownerPos.distanceTo(target.pos) : dist;
        const damageEntry = { target: i, damage: dmg, headshot: false, distance: killDistance, weaponName, killed: false };
        damages.push(damageEntry);
        const wasAlive = target.health > 0;
        target.health = Math.max(0, target.health - dmg);
        damageEntry.killed = wasAlive && target.health === 0;
        if (g.owner === game.localIndex) showDamageDealt(dmg, target.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), false);
        if (i === game.localIndex) showDamageTaken(dmg);
        if (damageEntry.killed && i !== game.localIndex && g.owner === game.localIndex) {
          const aliveAfterKill = aliveFpsPlayerIndexes();
          const cinematicKill = aliveAfterKill.length === 1 && aliveAfterKill[0] === g.owner && willFpsKillWinMapOrMatch(g.owner);
          if (cinematicKill) broadcastKillEvent(i, { weaponName, distance: killDistance, headshot: false, finalKill: true });
          else showEliminationNotice(i, { weaponName, distance: killDistance, headshot: false, finalKill: aliveAfterKill.length <= 1 });
        }
      }
    }
  }
  send({ type: "fpsGrenadeExplode", x: pos.x, y: pos.y, z: pos.z, damage: damages[0]?.damage || 0, target: damages[0]?.target ?? null, damages, owner: g.owner, radius: grenadeRadius(g), weapon: g.weapon || null, weaponName });
  const alive = aliveFpsPlayerIndexes();
  if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
}
function smokeCloudRadius(g) { return (g.smokeRadius || SMOKE_GRENADE_RADIUS) * (g.radiusMultiplier || 1); }
function deploySmokeGrenade(g) {
  const pos = g.mesh.position.clone();
  const radius = smokeCloudRadius(g);
  const duration = g.smokeDuration || SMOKE_GRENADE_DURATION;
  createSmokeCloud(pos, radius, duration, g.id || null);
  playSound("smoke");
  send({ type: "fpsSmokeDeploy", x: pos.x, y: pos.y, z: pos.z, radius, duration, owner: g.owner, id: g.id || null });
}
function createSmokeCloud(pos, radius = SMOKE_GRENADE_RADIUS, duration = SMOKE_GRENADE_DURATION, id = null) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
  radius = Math.max(2, Math.min(34, Number(radius) || SMOKE_GRENADE_RADIUS));
  duration = Math.max(1, Math.min(15, Number(duration) || SMOKE_GRENADE_DURATION));
  if (id && world.smokeClouds.some((cloud) => cloud.id === id)) return;
  const group = new THREE.Group();
  group.position.copy(pos);
  const puffCount = Math.max(34, Math.min(58, Math.round(radius * 3.1)));
  const puffs = [];
  for (let i = 0; i < puffCount; i++) {
    const angle = (i / puffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.65;
    const dist = Math.sqrt(Math.random()) * radius * 0.68;
    const y = Math.random() * radius * 0.42;
    const size = radius * (0.14 + Math.random() * 0.14);
    const shade = 0.46 + Math.random() * 0.32;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(shade, shade, shade),
      transparent: true,
      opacity: 0.28 + Math.random() * 0.16,
      depthWrite: false,
      fog: false
    });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
    puff.position.set(Math.cos(angle) * dist, y + size * 0.24, Math.sin(angle) * dist);
    puff.scale.set(size * (1.25 + Math.random() * 0.5), size * (0.72 + Math.random() * 0.55), size * (1.25 + Math.random() * 0.5));
    puff.renderOrder = 6;
    group.add(puff);
    puffs.push({ mesh: puff, baseOpacity: mat.opacity, baseScale: puff.scale.clone(), drift: new THREE.Vector3((Math.random() - 0.5) * 0.16, 0.04 + Math.random() * 0.05, (Math.random() - 0.5) * 0.16) });
  }
  world.arenaRoot.add(group);
  world.smokeClouds.push({ id, group, puffs, timer: duration, max: duration, radius });
}
function updateSmokeClouds(dt) {
  for (let i = world.smokeClouds.length - 1; i >= 0; i--) {
    const cloud = world.smokeClouds[i];
    cloud.timer -= dt;
    const age = 1 - Math.max(0, cloud.timer) / cloud.max;
    const fadeIn = Math.min(1, age * 7.0);
    const fadeOut = cloud.timer < 2.0 ? Math.max(0, cloud.timer / 2.0) : 1;
    const opacityScale = fadeIn * fadeOut;
    for (const puff of cloud.puffs) {
      puff.mesh.position.addScaledVector(puff.drift, dt);
      const growth = 1 + age * 0.32;
      puff.mesh.scale.copy(puff.baseScale).multiplyScalar(growth);
      puff.mesh.material.opacity = puff.baseOpacity * opacityScale;
    }
    if (cloud.timer <= 0) {
      world.arenaRoot.remove(cloud.group);
      cloud.group.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      world.smokeClouds.splice(i, 1);
    }
  }
}
function createExplosion(pos, radius = GRENADE_SPLASH_RADIUS * 0.5) { const geo = new THREE.SphereGeometry(radius, 32, 24), mat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.8 }); const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); world.arenaRoot.add(mesh); world.explosions.push({ mesh, timer: 0.4, max: 0.4 }); }
function updateExplosions(dt) { for (let i = world.explosions.length - 1; i >= 0; i--) { const ex = world.explosions[i]; ex.timer -= dt; const s = 1.0 + (1.0 - ex.timer / ex.max) * 2.0; ex.mesh.scale.set(s, s, s); ex.mesh.material.opacity = ex.timer / ex.max; if (ex.timer <= 0) { world.arenaRoot.remove(ex.mesh); world.explosions.splice(i, 1); } } }
function removeRemoteGrenadesNear(pos) { for (let i = world.grenades.length - 1; i >= 0; i--) { if (world.grenades[i].mesh.position.distanceTo(pos) < 1.0) { world.arenaRoot.remove(world.grenades[i].mesh); world.grenades.splice(i, 1); } } }
function disposeGrenade(g, announce = false) { const pos = g.mesh.position.clone(); world.arenaRoot.remove(g.mesh); const index = world.grenades.indexOf(g); if (index >= 0) world.grenades.splice(index, 1); createExplosion(pos, 1.4); if (announce) send({ type: "fpsGrenadeShot", x: pos.x, y: pos.y, z: pos.z }); }
function superchargeGrenade(g, announce = false) { if (!g || g.kind === "smoke") return; g.isSupercharged = true; g.damageMultiplier = 2; g.radiusMultiplier = 2; g.mesh.traverse((child) => { if (child.material?.color) child.material.color.setHex(0xb84dff); if (child.material?.emissive) { child.material.emissive.setHex(0xb84dff); child.material.emissiveIntensity = 1.1; } }); if (announce) { const pos = g.mesh.position; send({ type: "fpsGrenadeSupercharge", x: pos.x, y: pos.y, z: pos.z }); } }
function grenadeRayHit(origin, direction, maxDistance) {
  let best = null;
  for (const grenade of world.grenades) {
    if (grenade.kind === "smoke") continue;
    const distance = rayHitsSphere(origin, direction, grenade.mesh.position, grenade.kind === "rocket" ? 0.38 : 0.28);
    if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) best = { grenade, distance };
  }
  return best;
}

Object.assign(globalThis, {
  updateGrenades,
  spawnGrenade,
  startThrowAnimation,
  firstPersonThrowOrigin,
  throwGrenade,
  throwSmokeGrenade,
  grenadeRadius,
  grenadeDamage,
  explosiveWeaponLabel,
  projectileHitObstacle,
  projectileHitPlayer,
  explodeGrenade,
  smokeCloudRadius,
  deploySmokeGrenade,
  createSmokeCloud,
  updateSmokeClouds,
  createExplosion,
  updateExplosions,
  removeRemoteGrenadesNear,
  disposeGrenade,
  superchargeGrenade,
  grenadeRayHit
});
