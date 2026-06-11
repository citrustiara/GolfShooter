import "./globals.js";

function updateFpsMovement(dt) {
  const p = fps.players[game.localIndex], theme = fpsArenaThemes[game.fpsMapIndex] || fpsArenaThemes[0], forward = new THREE.Vector3(Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize(), move = new THREE.Vector3();
  const previousPosition = p.pos.clone();
  const previousY = previousPosition.y;
  if (input.keys.has("KeyW")) move.add(forward); if (input.keys.has("KeyS")) move.sub(forward); if (input.keys.has("KeyA")) move.sub(right); if (input.keys.has("KeyD")) move.add(right); if (move.lengthSq() > 0) move.normalize();
  const wasGrounded = p.grounded;
  const wasGroundSurface = p.groundSurface || null;

  // Process jump immediately so p.grounded updates before speed clamping/friction (enables bunny hopping)
  if (input.keys.has("Space") && p.grounded) { p.vel.y = 10.4; p.grounded = false; playSound("jump"); }
  if (input.keys.has(getAbilityKey("jump")) && abilityAllowed("jump") && game.jumpCooldown <= 0) { p.vel.y = Math.max(p.vel.y, jumpAbilityStrength()); p.grounded = false; game.jumpCooldown = abilityCooldown("jump", 3.0); playSound("jump"); }

  // Process slide immediately
  const slideKey = input.keys.has("ShiftLeft") || input.keys.has("ControlLeft"), slidePressed = slideKey && !input.slideKeyWasDown, wantsSlide = slidePressed && p.grounded && move.lengthSq() > 0 && game.slideCooldown <= 0;
  const activeWeaponId = game.activeWeapon === "melee" ? "melee" : game.primaryWeapon;
  const cfg = weaponConfig(activeWeaponId);
  const weaponMoveScale = (cfg.moveScale || 1) * activeLoadout().speed * (activeWeaponId === "minigun" && input.shootHeld ? cfg.movePenalty : 1);
  if (wantsSlide) { game.slideTimer = 0.58; game.slideCooldown = 0.65; p.vel.addScaledVector(move, 7.5 * weaponMoveScale); playSound("slide"); }
  p.sliding = game.slideTimer > 0 && p.grounded;
  input.slideKeyWasDown = slideKey;
  
  // Snappy movement: accel 220, friction 0.80 when moving, 0.65 when stopping.
  // Dash and grapple temporarily lift the speed cap and run near-zero friction
  // so their burst velocity is not eaten by the walk clamp on the next frame.
  const dashing = (game.dashTimer || 0) > 0;
  const grappling = Boolean(game.grapple?.active);
  const accel = p.sliding ? 31 : (p.grounded ? 210 : 24);
  const maxSpeed = (dashing || grappling) ? Math.max(DASH_SPEED, GRAPPLE_SPEED) : (p.sliding ? FPS_SLIDE_MAX_SPEED : FPS_WALK_MAX_SPEED) * weaponMoveScale;
  p.vel.addScaledVector(move, accel * weaponMoveScale * dt);
  const baseFriction = (dashing || grappling) ? 0.999 : (p.sliding ? 0.976 : (p.grounded ? (move.lengthSq() > 0 ? 0.80 : 0.65) : 0.985));
  const friction = Math.pow(baseFriction, dt * 60);
  p.vel.x *= friction;
  p.vel.z *= friction;
  const horiz = Math.hypot(p.vel.x, p.vel.z);
  
  // Speed retaining rule: Only clamp to maxSpeed if we are currently dashing/grappling, 
  // or if we are walking on the ground (grounded and NOT sliding). 
  // If sliding or in the air, we let the speed carry over and decay via friction.
  const shouldClamp = (dashing || grappling) || (p.grounded && !p.sliding);
  if (shouldClamp && horiz > maxSpeed) {
    const s = maxSpeed / horiz;
    p.vel.x *= s;
    p.vel.z *= s;
  }
  
  if (input.keys.has(getAbilityKey("heal")) && abilityAllowed("heal") && game.healCooldown <= 0 && p.health < game.maxHealth) { p.health = Math.min(game.maxHealth, p.health + Math.max(40, game.maxHealth * 0.28)); game.healCooldown = abilityCooldown("heal", 10.0); updateHud(); } if (input.keys.has(getAbilityKey("jetpack")) && abilityAllowed("jetpack") && p.pos.y < (game.jetpackHeightLimit || 40.0)) { p.vel.y = Math.min(p.vel.y + 60 * dt, 12); p.grounded = false; }

  // Katana wall jump: a fresh Space press while airborne next to a wall kicks
  // the player up and away from it. Edge-detected so holding Space cannot chain
  // jumps off the same wall in consecutive frames.
  const jumpHeld = input.keys.has("Space");
  if (jumpHeld && !input.jumpKeyWasDown && !p.grounded && !wasGrounded && game.activeWeapon === "gun" && weaponConfig(game.primaryWeapon).wallJump) {
    const wallNormal = findWallContactNormal(p);
    if (wallNormal) {
      p.vel.y = 10.2;
      p.vel.x = p.vel.x * 0.3 + wallNormal.x * 8.5;
      p.vel.z = p.vel.z * 0.3 + wallNormal.z * 8.5;
      playSound("jump");
    }
  }
  input.jumpKeyWasDown = jumpHeld;

  if (grappling) {
    // Grapple pull: steer velocity toward the anchor; gravity is skipped so the
    // rope wins. The hook only lets go when the player releases the grapple key
    // (handled on keyup) or dies — so holding the button keeps you attached, and
    // once you reach the anchor you simply hang there until you let go.
    const g = game.grapple;
    const anchorOffset = new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z);
    const toAnchor = g.point.clone().sub(anchorOffset);
    const anchorDist = toAnchor.length();
    if (p.health <= 0) {
      releaseGrapple();
    } else if (anchorDist < 2.4) {
      // Reached the anchor: bleed off momentum and hang while the key is held.
      p.vel.multiplyScalar(Math.pow(0.7, dt * 60));
      p.grounded = false;
    } else {
      p.vel.lerp(toAnchor.normalize().multiplyScalar(GRAPPLE_SPEED), Math.min(1, dt * 9));
      p.grounded = false;
    }
  } else {
    p.vel.y += fps.gravity * dt;
  }
  p.pos.addScaledVector(p.vel, dt);
  
  // Ceiling collision check: stop player from phasing through ceilings when jumping upwards
  if (p.vel.y > 0) {
    const previousHead = previousY + FPS_PLAYER_HEIGHT_WORLD;
    const currentHead = p.pos.y + FPS_PLAYER_HEIGHT_WORLD;
    const CEILING_TOLERANCE = 0.20;
    const ceilingBlockers = [...world.platforms, ...world.obstacles];
    for (const block of ceilingBlockers) {
      if (block.userData?.isRamp) continue;
      const b = new THREE.Box3().setFromObject(block);
      const insideX = p.pos.x > b.min.x - FPS_PLAYER_RADIUS_WORLD && p.pos.x < b.max.x + FPS_PLAYER_RADIUS_WORLD;
      const insideZ = p.pos.z > b.min.z - FPS_PLAYER_RADIUS_WORLD && p.pos.z < b.max.z + FPS_PLAYER_RADIUS_WORLD;
      if (insideX && insideZ) {
        if (previousHead <= b.min.y + CEILING_TOLERANCE && currentHead >= b.min.y) {
          p.pos.y = b.min.y - FPS_PLAYER_HEIGHT_WORLD - 0.01;
          p.vel.y = 0;
          break;
        }
      }
    }
    resolvePlayerCeilingVsTriangleMeshColliders(world.meshColliders, p, previousY, FPS_PLAYER_HEIGHT_WORLD, FPS_PLAYER_RADIUS_WORLD);
  }
  
  let onPlat = false;
  let platSurface = null;
  
  for (const ramp of world.ramps) resolvePlayerVsRampSolid(p, previousPosition, ramp, FPS_PLAYER_RADIUS_WORLD);

  const rampSurface = fpsRampSurface(p, previousPosition, p.vel.y, wasGrounded, wasGroundSurface);
  if (rampSurface) {
    p.pos.y = rampSurface.y;
    p.vel.y = 0;
    onPlat = true;
    platSurface = rampSurface.surface;
  } else {
    const meshSurface = meshGroundSurface(world.meshColliders, p.pos, previousPosition, p.vel.y, wasGrounded, wasGroundSurface, FPS_PLAYER_RADIUS_WORLD);
    if (meshSurface) {
      p.pos.y = meshSurface.y;
      p.vel.y = 0;
      onPlat = true;
      platSurface = meshSurface.surface;
    } else {
      const flatSurface = fpsFlatSurfaceY(p.pos, previousY, p.vel.y, wasGrounded, wasGroundSurface);
      if (flatSurface) {
        p.pos.y = flatSurface.y;
        p.vel.y = 0;
        onPlat = true;
        platSurface = flatSurface.surface;
      }
    }
  }
  if (onPlat) {
    p.groundSurface = platSurface;
  }

  // Check floors
  let onFloor = false;
  let bestFloorY = -Infinity;
  if (world.arenaFloorCollision !== false) {
    for (const floor of world.arenaFloors) {
      if (floor.type === "circle") {
        if (Math.hypot(p.pos.x - floor.x, p.pos.z - floor.z) <= floor.r + FPS_PLAYER_RADIUS_WORLD) {
          const y = Number(floor.y || 0);
          if (y > bestFloorY) { bestFloorY = y; onFloor = true; }
        }
      } else {
        const halfX = (floor.sx || 1) / 2 + FPS_PLAYER_RADIUS_WORLD;
        const halfZ = (floor.sz || 1) / 2 + FPS_PLAYER_RADIUS_WORLD;
        if (Math.abs(p.pos.x - floor.x) <= halfX && Math.abs(p.pos.z - floor.z) <= halfZ) {
          const y = Number(floor.y || 0);
          if (y > bestFloorY) { bestFloorY = y; onFloor = true; }
        }
      }
    }
  }

  if (!onPlat && onFloor && p.pos.y <= bestFloorY) {
    p.pos.y = bestFloorY;
    p.vel.y = 0;
    p.grounded = true;
    p.groundSurface = "floor";
  } else {
    p.grounded = onPlat;
    if (!p.grounded) {
      p.groundSurface = null;
    }
  }
  
  if (!wasGrounded && p.grounded) {
    playSound("land");
    const landSlideKey = input.keys.has("ShiftLeft") || input.keys.has("ControlLeft");
    const spaceHeld = input.keys.has("Space");
    if (landSlideKey && !spaceHeld && move.lengthSq() > 0 && game.slideCooldown <= 0) {
      game.slideTimer = 0.58;
      game.slideCooldown = 0.65;
      p.sliding = true;
      p.vel.addScaledVector(move, 7.5 * weaponMoveScale);
      playSound("slide");
    }
  }
  if (p.pos.y < -8) {
    p.health = 0;
    updateHud();
    const alive = aliveFpsPlayerIndexes();
    if (alive.length === 1) startVictoryLap(alive[0], "deathmatch");
    else if (alive.length === 0) startVictoryLap(-1, "deathmatch");
    const spawn = getArenaSpawnPoints(theme)[game.localIndex] || { x: 0, z: 0 };
    p.pos.set(spawn.x, getSpawnY(spawn, theme), spawn.z);
    p.vel.set(0, 0, 0);
  }
  clampArenaPosition(p.pos, FPS_PLAYER_RADIUS_WORLD);
  resolvePlayerVsTriangleMeshColliders(world.meshColliders, p, previousPosition, FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD);
  for (const obs of world.obstacles) {
    if (obs.userData?.isRamp) continue;
    if (shouldSkipCompositeSurfaceCollision(p, obs)) continue;
    resolvePlayerVsMeshObb(p.pos, obs, FPS_PLAYER_RADIUS_WORLD);
  }
  resolvePlayerVsTriangleMeshColliders(world.meshColliders, p, previousPosition, FPS_PLAYER_RADIUS_WORLD, FPS_PLAYER_HEIGHT_WORLD);
  clampArenaPosition(p.pos, FPS_PLAYER_RADIUS_WORLD);
  updateFootstepAudio(p, dt, move);
}

function updateFootstepAudio(player, dt, move) {
  player.stepTimer = Math.max(0, (player.stepTimer || 0) - dt);
  if (game.phase !== "fps" || game.countdown > 0 || player.health <= 0 || !player.grounded || player.sliding || move.lengthSq() <= 0.01) return;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 1.9 || player.stepTimer > 0) return;
  const loadoutSpeed = Math.max(0.45, activeLoadout().speed || 1);
  const speedRatio = Math.max(0, Math.min(1, speed / (FPS_WALK_MAX_SPEED * loadoutSpeed)));
  const volume = 0.14 + speedRatio * 0.07;
  player.stepSide = player.stepSide ? 0 : 1;
  playSound("footstep", { volume });
  if (game.connected) {
    send({ type: "fpsFootstep", player: game.localIndex, x: player.pos.x, y: player.pos.y, z: player.pos.z, volume });
  }
  player.stepTimer = Math.max(0.24, 0.49 - speedRatio * 0.18);
}

function shouldSkipCompositeSurfaceCollision(player, obstacle) {
  const support = player.groundSurface;
  if (!player.grounded || !support || support === "floor" || support === obstacle || obstacle.userData?.isRamp) return false;
  if (!support.isObject3D) return false;
  const supportBox = new THREE.Box3().setFromObject(support);
  const obstacleBox = new THREE.Box3().setFromObject(obstacle);
  const standingOnSupport = Math.abs(player.pos.y - supportBox.max.y) <= 0.12;
  const obstacleCrossesFeet = obstacleBox.min.y <= player.pos.y + 0.08 && obstacleBox.max.y > player.pos.y + 0.08;
  // Only flush trim the player could step over may be skipped; anything taller
  // (rails, parapets sitting on the same deck) must stay solid from the inside too.
  const obstacleTopWalkable = obstacleBox.max.y <= player.pos.y + 0.58;
  const overlapsX = supportBox.min.x < obstacleBox.max.x - 0.02 && supportBox.max.x > obstacleBox.min.x + 0.02;
  const overlapsZ = supportBox.min.z < obstacleBox.max.z - 0.02 && supportBox.max.z > obstacleBox.min.z + 0.02;
  return standingOnSupport && obstacleCrossesFeet && obstacleTopWalkable && overlapsX && overlapsZ;
}

function findWallContactNormal(player) {
  // Horizontal probe against obstacle AABBs at torso height. Returns the
  // outward wall normal when the player hugs a side face, null when the
  // nearest contact is a top surface or nothing is in reach.
  const probe = 0.32;
  const feet = player.pos.y;
  const box = new THREE.Box3();
  let best = null;
  let bestDist = Infinity;
  for (const obs of world.obstacles) {
    if (obs.userData?.isRamp) continue;
    box.setFromObject(obs);
    if (box.max.y < feet + 0.7 || box.min.y > feet + 1.6) continue;
    const closestX = Math.max(box.min.x, Math.min(box.max.x, player.pos.x));
    const closestZ = Math.max(box.min.z, Math.min(box.max.z, player.pos.z));
    const dx = player.pos.x - closestX;
    const dz = player.pos.z - closestZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.0001 || dist > FPS_PLAYER_RADIUS_WORLD + probe) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = new THREE.Vector3(dx / dist, 0, dz / dist);
    }
  }
  return best;
}

function fpsFlatSurfaceY(position, previousY, velocityY, wasGrounded, wasGroundSurface) {
  if (velocityY > 0) return null;
  const surfaces = new Set([...world.platforms, ...world.obstacles.filter((obs) => !obs.userData?.isRamp)]);
  let best = null;
  for (const surface of surfaces) {
    const b = new THREE.Box3().setFromObject(surface);
    const insideX = position.x > b.min.x - FPS_PLAYER_RADIUS_WORLD && position.x < b.max.x + FPS_PLAYER_RADIUS_WORLD;
    const insideZ = position.z > b.min.z - FPS_PLAYER_RADIUS_WORLD && position.z < b.max.z + FPS_PLAYER_RADIUS_WORLD;
    const stepHeight = b.max.y - previousY;
    const canSnap = (wasGrounded && wasGroundSurface === surface) ||
                    (previousY >= b.max.y - 0.12 && position.y <= b.max.y + 0.04) ||
                    (wasGrounded && stepHeight >= -0.04 && stepHeight <= 0.58 && position.y <= b.max.y + 0.08);
    if (insideX && insideZ && canSnap && (!best || b.max.y > best.y)) {
      best = { y: b.max.y, surface };
    }
  }
  return best;
}

function fpsRampSurface(p, previousPosition, velocityY, wasGrounded, wasGroundSurface) {
  let best = null;
  for (const ramp of world.ramps) {
    const info = rampSurfaceInfo(ramp, p.pos, FPS_RAMP_PROBE_MARGIN);
    if (!info) continue;

    const alreadyOnRamp = wasGrounded && wasGroundSurface === ramp;
    if (velocityY > 0) continue;

    const previousInfo = rampSurfaceInfo(ramp, previousPosition, FPS_RAMP_PROBE_MARGIN);
    const previousSurfaceY = previousInfo?.y ?? info.y;
    const maxStepUp = alreadyOnRamp ? FPS_RAMP_STEP_UP : Math.min(FPS_RAMP_STEP_UP, Math.max(0.18, Math.abs(velocityY) * 0.04 + 0.18));
    const nearSurfaceNow = p.pos.y >= info.y - FPS_RAMP_STEP_DOWN && p.pos.y <= info.y + FPS_RAMP_LAND_EPSILON;
    const crossedSurface = previousPosition.y >= previousSurfaceY - 0.05 && nearSurfaceNow;
    const canStepUp = wasGrounded && previousPosition.y >= info.y - maxStepUp && nearSurfaceNow;
    const canContinueOnRamp = alreadyOnRamp && p.pos.y <= info.y + FPS_RAMP_STEP_DOWN;
    const canLandOrStepOn = velocityY <= 0 && (crossedSurface || canStepUp);

    if ((canContinueOnRamp || canLandOrStepOn) && (!best || info.y > best.y)) {
      best = { y: info.y, surface: ramp, normal: info.normal };
    }
  }
  return best;
}

function resolvePlayerVsRampSolid(player, previousPosition, ramp, radius) {
  const position = player.pos;
  const local = rampLocalPoint(ramp, position);
  const halfWidth = ramp.width / 2;
  const halfLength = ramp.length / 2;
  if (
    local.x < -halfWidth - radius ||
    local.x > halfWidth + radius ||
    local.z < -halfLength - radius ||
    local.z > halfLength + radius
  ) {
    return;
  }

  const clampedX = Math.max(-halfWidth, Math.min(halfWidth, local.x));
  const clampedZ = Math.max(-halfLength, Math.min(halfLength, local.z));
  const surfaceT = (clampedZ + halfLength) / ramp.length;
  const solidTopY = ramp.y + surfaceT * ramp.height;
  const topInfo = rampSurfaceInfo(ramp, position, FPS_RAMP_PROBE_MARGIN);
  const previousTopInfo = rampSurfaceInfo(ramp, previousPosition, FPS_RAMP_PROBE_MARGIN);
  const wasOnRampTop = previousTopInfo &&
    previousPosition.y >= previousTopInfo.y - 0.08 &&
    previousPosition.y <= previousTopInfo.y + FPS_RAMP_LAND_EPSILON;
  if (wasOnRampTop && topInfo && player.vel.y > 0) {
    position.y = Math.max(position.y, topInfo.y + 0.04);
    return;
  }

  const canUseTopSurface = topInfo &&
    player.vel.y <= 0 &&
    previousPosition.y >= topInfo.y - FPS_RAMP_STEP_UP &&
    position.y >= topInfo.y - FPS_RAMP_STEP_DOWN &&
    position.y <= topInfo.y + FPS_RAMP_LAND_EPSILON;
  if (canUseTopSurface) return;

  if (position.y >= solidTopY - FPS_RAMP_SOLID_TOP_CLEARANCE) return;
  if (position.y + FPS_PLAYER_HEIGHT_WORLD <= ramp.y + 0.05) return;

  const fromLowEnd = local.z < -halfLength && previousPosition.y >= ramp.y - FPS_RAMP_SOLID_TOP_CLEARANCE;
  if (fromLowEnd) return;

  let targetLocal = null;
  let normalLocal = null;
  const dx = local.x - clampedX;
  const dz = local.z - clampedZ;
  const distSq = dx * dx + dz * dz;

  if (distSq > 0.0001) {
    if (distSq >= radius * radius) return;
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    targetLocal = {
      x: local.x + (dx / dist) * push,
      z: local.z + (dz / dist) * push
    };
    normalLocal = new THREE.Vector3(dx / dist, 0, dz / dist);
  } else {
    const previousLocal = rampLocalPoint(ramp, previousPosition);
    if (previousLocal.x < -halfWidth) {
      targetLocal = { x: -halfWidth - radius, z: local.z };
      normalLocal = new THREE.Vector3(-1, 0, 0);
    } else if (previousLocal.x > halfWidth) {
      targetLocal = { x: halfWidth + radius, z: local.z };
      normalLocal = new THREE.Vector3(1, 0, 0);
    } else if (previousLocal.z > halfLength) {
      targetLocal = { x: local.x, z: halfLength + radius };
      normalLocal = new THREE.Vector3(0, 0, 1);
    } else if (previousLocal.z < -halfLength && previousPosition.y < ramp.y - FPS_RAMP_SOLID_TOP_CLEARANCE) {
      targetLocal = { x: local.x, z: -halfLength - radius };
      normalLocal = new THREE.Vector3(0, 0, -1);
    } else {
      return;
    }
  }

  const worldPoint = rampWorldPoint(ramp, targetLocal);
  position.x = worldPoint.x;
  position.z = worldPoint.z;

  const normalWorld = normalLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ramp.rot).normalize();
  const inwardVelocity = player.vel.dot(normalWorld);
  if (inwardVelocity < 0) player.vel.addScaledVector(normalWorld, -inwardVelocity);
}

function resolvePlayerVsMeshObb(position, mesh, radius) {
  if (!mesh.geometry) return;
  const MICRO_STEP_HEIGHT = 0.58;
  const TOP_CLEARANCE = 0.006;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();

  mesh.updateMatrixWorld(true);
  const positionWorld = new THREE.Vector3();
  const quaternionWorld = new THREE.Quaternion();
  const scaleWorld = new THREE.Vector3();
  mesh.matrixWorld.decompose(positionWorld, quaternionWorld, scaleWorld);

  const size = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(size);
  size.multiply(scaleWorld);
  const halfSize = size.clone().multiplyScalar(0.5);

  const localCenter = new THREE.Vector3();
  mesh.geometry.boundingBox.getCenter(localCenter);
  localCenter.multiply(scaleWorld);

  const center = localCenter.clone().applyQuaternion(quaternionWorld).add(positionWorld);
  const quaternion = quaternionWorld.clone();
  const inverseQuaternion = quaternion.clone().invert();

  const corners = [];
  for (const x of [-halfSize.x, halfSize.x]) {
    for (const y of [-halfSize.y, halfSize.y]) {
      for (const z of [-halfSize.z, halfSize.z]) {
        corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(center));
      }
    }
  }
  const bottom = Math.min(...corners.map(c => c.y));
  const top = Math.max(...corners.map(c => c.y));

  if (position.y >= top - TOP_CLEARANCE || position.y + FPS_PLAYER_HEIGHT_WORLD < bottom) return;

  const local = new THREE.Vector3(position.x, Math.max(bottom, Math.min(top, position.y)), position.z)
    .sub(center)
    .applyQuaternion(inverseQuaternion);

  const localYAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const sinPhi = Math.sqrt(Math.max(0, 1 - localYAxis.y * localYAxis.y));
  const maxProj = FPS_PLAYER_HEIGHT_WORLD * Math.abs(localYAxis.y) + radius * sinPhi;
  if (Math.abs(local.y) > halfSize.y + maxProj) return;

  const closestX = Math.max(-halfSize.x, Math.min(halfSize.x, local.x));
  const closestZ = Math.max(-halfSize.z, Math.min(halfSize.z, local.z));
  let dx = local.x - closestX;
  let dz = local.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return;

  const stepHeight = top - position.y;
  if (stepHeight > TOP_CLEARANCE && stepHeight <= MICRO_STEP_HEIGHT) {
    position.y = top;
    return;
  }

  if (distSq < 0.0001) {
    const pushX = halfSize.x - Math.abs(local.x);
    const pushZ = halfSize.z - Math.abs(local.z);
    if (pushX < pushZ) {
      dx = Math.sign(local.x || 1);
      dz = 0;
      local.x += dx * (pushX + radius);
    } else {
      dx = 0;
      dz = Math.sign(local.z || 1);
      local.z += dz * (pushZ + radius);
    }
  } else {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    local.x += (dx / dist) * push;
    local.z += (dz / dist) * push;
  }

  const worldPos = local.applyQuaternion(quaternion).add(center);
  position.x = worldPos.x;
  position.z = worldPos.z;
}
function collideGrenadeWithObstacle(g, obs, radius) {
  if (!obs.geometry) return false;
  if (!obs.geometry.boundingBox) obs.geometry.computeBoundingBox();
  
  const box3 = new THREE.Box3().setFromObject(obs);
  const closestPoint = new THREE.Vector3();
  box3.clampPoint(g.mesh.position, closestPoint);
  
  const diff = g.mesh.position.clone().sub(closestPoint);
  const dist = diff.length();
  
  if (dist < radius) {
    let normal;
    let depth;
    if (dist > 0.0001) {
      normal = diff.clone().normalize();
      depth = radius - dist;
    } else {
      const min = box3.min;
      const max = box3.max;
      const pos = g.mesh.position;
      
      const dl = pos.x - min.x;
      const dr = max.x - pos.x;
      const db = pos.y - min.y;
      const dt = max.y - pos.y;
      const df = pos.z - min.z;
      const dk = max.z - pos.z;
      
      const minDist = Math.min(dl, dr, db, dt, df, dk);
      normal = new THREE.Vector3();
      if (minDist === dl) { normal.set(-1, 0, 0); depth = radius + dl; }
      else if (minDist === dr) { normal.set(1, 0, 0); depth = radius + dr; }
      else if (minDist === db) { normal.set(0, -1, 0); depth = radius + db; }
      else if (minDist === dt) { normal.set(0, 1, 0); depth = radius + dt; }
      else if (minDist === df) { normal.set(0, 0, -1); depth = radius + df; }
      else { normal.set(0, 0, 1); depth = radius + dk; }
    }
    
    g.mesh.position.addScaledVector(normal, depth);
    
    const dot = g.vel.dot(normal);
    if (dot < 0) {
      const normalVel = normal.clone().multiplyScalar(dot);
      const tangentVel = g.vel.clone().sub(normalVel);
      g.vel.copy(tangentVel.multiplyScalar(g.tangentKeep ?? 0.8).add(normalVel.multiplyScalar(-(g.bounciness ?? 0.4))));
    }
    return true;
  }
  return false;
}

Object.assign(globalThis, {
  updateFpsMovement,
  updateFootstepAudio,
  findWallContactNormal,
  shouldSkipCompositeSurfaceCollision,
  fpsFlatSurfaceY,
  fpsRampSurface,
  resolvePlayerVsRampSolid,
  resolvePlayerVsMeshObb,
  collideGrenadeWithObstacle
});
