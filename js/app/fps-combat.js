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
    
    const outOfArena = !isPointInsideArena(g.mesh.position, world.arenaFloors, 0.1);
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
  world.grenades.push({ mesh: group, vel, timer: options.timer ?? 2.5, owner, localAuthority: local, kind: options.kind || "grenade", weapon: options.weapon || null, weaponName: options.weaponName || null, gravity: options.gravity ?? GRENADE_GRAVITY, damageMultiplier: options.damageMultiplier || 1, radiusMultiplier: options.radiusMultiplier || 1, smokeRadius: options.radius || options.smokeRadius || SMOKE_GRENADE_RADIUS, smokeDuration: options.duration || options.smokeDuration || SMOKE_GRENADE_DURATION, id: options.id || null, isSupercharged: Boolean(options.supercharged), bounces: 0, maxBounces: options.maxBounces || 6, bounciness: isBouncerKind ? 0.98 : undefined, tangentKeep: isBouncerKind ? 0.99 : undefined });
}
function startThrowAnimation(kind = "grenade") {
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
  if (game.phase !== "fps" || game.countdown > 0 || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.grenadeCooldown > 0 || !abilityAllowed("grenade")) return;
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
  if (game.phase !== "fps" || game.countdown > 0 || game.radarTimer > 0 || game.throwBlockTimer > 0 || game.smokeCooldown > 0 || !abilityAllowed("smoke")) return;
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
function activateJumpAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("jump") || game.jumpCooldown > 0) return; const p = fps.players[game.localIndex]; p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); updateHud(); }
function activateHealAbility() { if (game.phase !== "fps" || game.countdown > 0 || !abilityAllowed("heal") || game.healCooldown > 0) return; const p = fps.players[game.localIndex]; if (p.health >= game.maxHealth) return; p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); }
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
        damages.push({ target: i, damage: dmg, headshot: false, distance: killDistance, weaponName });
        const wasAlive = target.health > 0;
        target.health = Math.max(0, target.health - dmg);
        if (g.owner === game.localIndex) showDamageDealt(dmg, target.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), false);
        if (i === game.localIndex) showDamageTaken(dmg);
        if (wasAlive && target.health === 0 && i !== game.localIndex && g.owner === game.localIndex) {
          showEliminationNotice(i, { weaponName, distance: killDistance, headshot: false });
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

function fireHitscan() {
  if (game.radarTimer > 0 || game.throwBlockTimer > 0) return;
  if (game.phase !== "fps" || game.countdown > 0 || game.reloading || game.ammo[game.primaryWeapon] <= 0) { if (game.ammo[game.primaryWeapon] <= 0) startReload(); return; }
  const cfg = weaponConfig();
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  if (cfg.projectile) { fireProjectileWeapon(cfg); return; }
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : (game.primaryWeapon === "minigun" ? 0.18 : game.primaryWeapon === "shotgun" ? 0.7 : 0.42); game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(game.primaryWeapon === "heavySniper" ? "sniper" : game.primaryWeapon); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload(); updateHud();
  const shooter = fps.players[game.localIndex], origin = new THREE.Vector3(shooter.pos.x, shooter.pos.y + (shooter.currentCamHeight || 0.72), shooter.pos.z);
  const pelletCount = cfg.pellets || 1, pellets = [], hitDamages = new Map(), hitHeadshots = new Map(), hitDistances = new Map(); let totalDamage = 0, anyHit = false, anyHeadshot = false, bestLength = cfg.range || 80, firstDirection = null, hitTarget = null, hitWorldPos = null;
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
    let pelletHit = false, pelletDmg = 0, pelletHS = false, len = cfg.range || 80;
    if (playerHitResult) { const pDist = playerHitResult.distance, throughWall = wallHit && wallHit.distance < pDist; pelletHit = !throughWall || true; pelletHS = playerHitResult.headshot; pelletDmg = Math.floor(cfg.damage * (pelletHS ? cfg.crit : 1) * (throughWall ? 0.5 : 1)); len = pDist; hitTarget ??= playerHitResult.index; hitWorldPos ??= playerHitResult.player.pos.clone(); } else if (wallHit) len = wallHit.distance;
    drawLaser(origin, direction, len, pelletHit, false, game.primaryWeapon);
    pellets.push({ dx: direction.x, dy: direction.y, dz: direction.z, length: len, hit: pelletHit });
    if (pelletHit) { anyHit = true; anyHeadshot ||= pelletHS; totalDamage += pelletDmg; bestLength = Math.min(bestLength, len); hitDamages.set(playerHitResult.index, (hitDamages.get(playerHitResult.index) || 0) + pelletDmg); hitHeadshots.set(playerHitResult.index, Boolean(hitHeadshots.get(playerHitResult.index) || pelletHS)); hitDistances.set(playerHitResult.index, Math.min(hitDistances.get(playerHitResult.index) ?? Infinity, len)); }
  }
  const damages = [...hitDamages.entries()].map(([target, damage]) => ({ target, damage, headshot: Boolean(hitHeadshots.get(target)), distance: hitDistances.get(target) }));
  for (const entry of damages) {
    const target = fps.players[entry.target];
    const wasAlive = target.health > 0;
    target.health = Math.max(0, target.health - entry.damage);
    const popPos = entry.headshot ? playerHeadHitCenter(target).add(new THREE.Vector3(0, 0.18, 0)) : playerBodyHitCenter(target).add(new THREE.Vector3(0, 0.65, 0));
    showDamageDealt(entry.damage, popPos, entry.headshot);
    if (wasAlive && target.health === 0 && entry.target !== game.localIndex) {
      showEliminationNotice(entry.target, {
        weapon: game.primaryWeapon,
        distance: entry.distance ?? origin.distanceTo(target.pos.clone().add(new THREE.Vector3(0, 0.9, 0))),
        headshot: entry.headshot
      });
    }
  }
  if (anyHit) { showHitMarker(anyHeadshot); updateHud(); }
  send({ type: "fpsShot", player: game.localIndex, ox: origin.x, oy: origin.y, oz: origin.z, dx: firstDirection.x, dy: firstDirection.y, dz: firstDirection.z, hit: anyHit, length: bestLength, damage: damages[0]?.damage || totalDamage, target: anyHit ? hitTarget : null, damages, headshot: anyHeadshot, weapon: game.primaryWeapon, pellets: pelletCount > 1 ? pellets : null });
  if (anyHit && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
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
  const now = performance.now(); if (now - game.lastShotAt < cfg.fireDelay) return;
  game.lastShotAt = now; const recoilVal = cfg.recoil !== undefined ? cfg.recoil : 0.85; game.visualRecoil = Math.min(1.8, game.visualRecoil + recoilVal); playSound(cfg.projectile === "rocket" ? "rocket" : (cfg.projectile === "bouncer" ? "bouncerShot" : "grenade")); game.ammo[game.primaryWeapon]--; if (game.ammo[game.primaryWeapon] <= 0) startReload();
  const shooter = fps.players[game.localIndex];
  const dir = directionFromAngles(input.yaw, input.pitch).normalize();
  const origin = firstPersonProjectileOrigin(dir);
  if (cfg.projectile === "bouncer") {
    const vel = dir.clone().multiplyScalar(44);
    const options = { kind: "bouncer", weapon: game.primaryWeapon, timer: 6, gravity: 0, damageMultiplier: 0.62, radiusMultiplier: 0.52 };
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
function fireMelee() {
  if (game.radarTimer > 0 || game.throwBlockTimer > 0) return;
  const now = performance.now(); if (now - game.lastShotAt < 320) return; game.lastShotAt = now; game.meleeSwingTimer = 0.32; playSound("melee");
  const s = fps.players[game.localIndex], origin = new THREE.Vector3(s.pos.x, s.pos.y + (s.currentCamHeight || 0.72), s.pos.z), dir = directionFromAngles(input.yaw, input.pitch).normalize();
  drawMeleeSwipe(origin, dir);
  let hit = false, hs = false, targetIndex = null, targetDist = Infinity;
  for (const { player: opp, index } of opposingFpsPlayers()) {
    const hC = playerHeadHitCenter(opp), bC = playerBodyHitCenter(opp), dH = origin.distanceTo(hC), dB = origin.distanceTo(bC);
    if (dH < targetDist && dH < 2.6 && dir.dot(hC.clone().sub(origin).normalize()) > 0.72) { hit = true; hs = true; targetIndex = index; targetDist = dH; }
    else if (dB < targetDist && dB < 2.6 && dir.dot(bC.clone().sub(origin).normalize()) > 0.7) { hit = true; hs = false; targetIndex = index; targetDist = dB; }
  }
  const dmg = hit ? (hs ? 100 : 50) : 0; if (hit) { const opp = fps.players[targetIndex]; const wasAlive = opp.health > 0; opp.health = Math.max(0, opp.health - dmg); showDamageDealt(dmg, hs ? playerHeadHitCenter(opp) : playerBodyHitCenter(opp), hs); showHitMarker(hs); if (wasAlive && opp.health === 0 && targetIndex !== game.localIndex) { showEliminationNotice(targetIndex, { weapon: "melee", distance: targetDist, headshot: hs }); } }
  send({ type: "fpsShot", player: game.localIndex, ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, hit, damage: dmg, target: hit ? targetIndex : null, isMelee: true, headshot: hs, distance: hit ? targetDist : null }); if (hit && aliveFpsPlayerIndexes().length === 1) startVictoryLap(aliveFpsPlayerIndexes()[0], "deathmatch");
}
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

function updatePlayerMeshes(dt = 1 / 60) {
  const isRadarActive = game.radarTimer > 0;
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
      }
    }

    mesh.visible = player.health > 0 && (game.phase === "fps" ? i !== game.localIndex : (game.phase === "fpsVictoryLap" ? (i === game.result.winner && i !== game.localIndex) : false));

    // Wallhack uses per-mesh cloned materials so shared player materials are never left hidden/mutated.
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.userData.baseMaterial) {
        child.userData.baseMaterial = child.material;
        child.userData.baseRenderOrder = child.renderOrder || 0;
      }
      if (isRadarActive && mesh.visible) {
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
      } else {
        child.material = child.userData.baseMaterial;
        child.renderOrder = child.userData.baseRenderOrder || 0;
      }
    });
  }
}

Object.assign(globalThis, {
  updateGrenades,
  spawnGrenade,
  throwGrenade,
  throwSmokeGrenade,
  activateJumpAbility,
  activateHealAbility,
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
  grenadeRayHit,
  fireHitscan,
  isPointInsideProjectileBlocker,
  firstPersonProjectileOrigin,
  fireProjectileWeapon,
  playerSlideHitboxDrop,
  playerHeadHitCenter,
  playerBodyHitCenter,
  fireMelee,
  rayHitsSphere,
  rayHitsPlayer,
  drawLaser,
  drawMeleeSwipe,
  updateLasers,
  showHitMarker,
  showDamageDealt,
  updateDamagePops,
  thirdPersonWeaponScale,
  syncThirdPersonWeaponMesh,
  updatePlayerMeshes
});
