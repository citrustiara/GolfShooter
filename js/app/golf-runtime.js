import "./globals.js";

function updateGolf(dt) {
  ensureGolfBalls(game.playerCount);
  const localBall = useGolfBall(activeGolfPlayerIndex());
  input.pointerLocked = false;
  applyGolfAtmosphere(holes[game.holeIndex]);
  // Handle hole transition delay
  if (game.holeTransitionTimer > 0) {
    game.holeTransitionTimer -= dt;
    // Animate ball sinking into the cup
    for (const ball of world.golfBalls) {
      if (game.holeScores[world.golfBalls.indexOf(ball)]?.[game.holeIndex] !== null && ball.mesh.position.y > 0.08) {
        ball.mesh.position.y -= dt * 0.35;
      }
    }
    if (game.holeTransitionTimer <= 0) {
      game.holeTransitionTimer = 0;
      if (game.role !== "guest") {
        advanceAfterScore();
      }
    }
    updateGolfCamera(dt);
    return;
  }
  const anyMoving = world.golfBalls.some((ball, index) => game.holeScores[index]?.[game.holeIndex] === null && ball.moving);
  if (anyMoving) {
    for (let i = 0; i < world.golfBalls.length; i++) {
      if (game.holeScores[i]?.[game.holeIndex] !== null || !world.golfBalls[i].moving) continue;
      useGolfBall(i);
      resolveGolfBall(dt);
    }
    useGolfBall(activeGolfPlayerIndex());
  }
  if (canControlGolf()) {
    power.classList.remove("hidden");
    if (input.keys.has("ArrowLeft") || input.keys.has("ArrowRight")) {
      if (input.keys.has("ArrowLeft")) game.aimAngle -= GOLF_AIM_SENSITIVITY * 150 * dt;
      if (input.keys.has("ArrowRight")) game.aimAngle += GOLF_AIM_SENSITIVITY * 150 * dt;
      game.golfShotDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle));
    }
    if (input.keys.has("Space")) {
      game.aimPower += dt * 0.8 * input.golfChargeDir;
      if (game.aimPower >= 1) { game.aimPower = 1; input.golfChargeDir = -1; }
      if (game.aimPower <= 0) { game.aimPower = 0; input.golfChargeDir = 1; }
      powerFill.style.width = `${game.aimPower * 100}%`;
    }
  }
  if (localBall) useGolfBall(activeGolfPlayerIndex());
  updateGolfCamera(dt);
  updateShotArrow();
}
function canControlGolf() {
  const index = activeGolfPlayerIndex();
  const ball = golfBallForPlayer(index);
  return Boolean(ball) && !ball.moving && game.holeScores[index]?.[game.holeIndex] === null && (game.role === "solo" || index === game.localIndex);
}
function updateGolfCamera(dt) {
  const hole = holes[game.holeIndex];
  if (!hole) return;
  const desiredDir = game.golfShotDir.clone().multiplyScalar(-1);
  if (desiredDir.lengthSq() < 0.01) desiredDir.set(Math.cos(game.aimAngle), 0, Math.sin(game.aimAngle));
  const targetCamPos = world.ball.position.clone().add(desiredDir.multiplyScalar(13)).add(new THREE.Vector3(0, game.ballMoving ? 7.2 : 6.2, 0));
  camera.position.lerp(targetCamPos, Math.min(1, dt * (game.ballMoving ? 6.5 : 4.0)));
  camera.lookAt(world.ball.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
}
function updateShotArrow() {
  const showAim = game.dragging && canControlGolf() && game.aimPower > 0.01;
  shotArrow.classList.add("hidden");
  if (!world.golfAimArrow) return;
  world.golfAimArrow.visible = showAim;
  if (!showAim) return;
  const arrow = world.golfAimArrow;
  const shaft = arrow.userData.shaft, head = arrow.userData.head, material = arrow.userData.material;
  const length = 1.3 + game.aimPower * 5.8;
  const color = new THREE.Color(0x7ee2a8).lerp(new THREE.Color(0xffd166), Math.min(1, game.aimPower * 1.4)).lerp(new THREE.Color(0xff4a5f), Math.max(0, game.aimPower - 0.65) / 0.35);
  material.color.copy(color);
  arrow.position.copy(world.ball.position).add(new THREE.Vector3(0, 0.14, 0));
  arrow.rotation.set(0, -Math.atan2(game.golfShotDir.z, game.golfShotDir.x), 0);
  shaft.scale.set(1, length, 1);
  shaft.position.x = length * 0.5;
  head.position.x = length + 0.18;
}
function simulateShot(direction, power, local = false) { const playerIndex = activeGolfPlayerIndex(); const ball = useGolfBall(playerIndex); if (!ball || ball.moving || power <= 0.04 || game.holeScores[playerIndex]?.[game.holeIndex] !== null) return; const dir = direction.clone().setY(0); if (dir.lengthSq() <= 0.0001) return; dir.normalize(); ball.lastShot.copy(ball.mesh.position); ball.lastShot.y = golfBallSurfaceY(); ball.falling = false; ball.moving = true; game.ballMoving = true; ball.mesh.position.y = golfBallSurfaceY(); game.strokesThisHole[playerIndex]++; playSound("golfHit"); ball.vel.copy(dir.multiplyScalar(power * GOLF_MAX_SHOT_SPEED)); if (world.golfAimArrow) world.golfAimArrow.visible = false; shotArrow.classList.add("hidden"); if (local && game.role !== "solo") send({ type: "golfShot", state: serializeGolfState() }); updateHud(); }
function isBallOnGolfSurface(hole) {
  if (golfRampAt(world.ball.position)) return true;
  return (hole?.surfaces || []).some((surface) => {
    if (surface.type === "circle") return flatDistance(world.ball.position, surface) <= surface.r + 0.4;
    const rot = -(surface.rot || 0);
    const local = world.ball.position.clone().sub(new THREE.Vector3(surface.x, 0, surface.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return Math.abs(local.x) <= surface.sx / 2 + 0.4 && Math.abs(local.z) <= surface.sz / 2 + 0.4;
  });
}
function resetGolfAfterFall(hole) {
  const ball = golfBallForPlayer(game.currentPlayer);
  if (!ball) return;
  ball.moving = false;
  ball.falling = false;
  game.ballMoving = false;
  game.golfFalling = false;
  game.strokesThisHole[game.currentPlayer]++;
  ball.mesh.position.copy(ball.lastShot.lengthSq() > 0 ? ball.lastShot : hole.start);
  ball.mesh.position.y = golfBallSurfaceY();
  ball.vel.set(0, 0, 0);
  game.aimPower = 0;
  powerFill.style.width = "0%";
  if (world.golfAimArrow) world.golfAimArrow.visible = false;
  updateHud();
  if (game.role !== "solo") send({ type: "golfResolved", state: serializeGolfState() });
}
function resolveGolfBall(dt) {
  const hole = holes[game.holeIndex];
  const ball = golfBallForPlayer(game.currentPlayer);
  if (world.ball.position.y < (hole?.deathZoneY ?? -5)) { resetGolfAfterFall(hole); return; }
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  const wasOnIce = isBallOnIce();
  world.ballVel.y = 0; // Constrain to X-Z plane
  world.ball.position.addScaledVector(world.ballVel, dt);
  world.ball.position.y = golfBallSurfaceY();
  if (!isBallOnGolfSurface(hole)) { resetGolfAfterFall(hole); return; }
  const ramp = golfRampAt(world.ball.position);
  if (ramp) {
    const downhill = rampUphillDirection(ramp.ramp).multiplyScalar(-1);
    const slope = ramp.ramp.height / Math.max(0.001, ramp.ramp.length);
    world.ballVel.addScaledVector(downhill, 18 * slope * dt);
    world.ball.position.y = ramp.y + 0.34;
  }
  world.ballVel.multiplyScalar(Math.pow(wasOnIce ? GOLF_ICE_FRICTION : GOLF_GROUND_FRICTION, dt * 60));
  if (!isBallOnGolfSurface(hole)) {
    resetGolfAfterFall(hole);
    return;
  } else if (game.golfFalling) {
    game.golfFalling = false;
    world.ball.position.y = golfBallSurfaceY();
  }
  for (const mound of world.mounds) {
    const d = flatDistance(world.ball.position, mound);
    if (d < mound.radius + 0.34) {
      const push = world.ball.position.clone().sub(new THREE.Vector3(mound.x, 0, mound.z)).setY(0).normalize();
      const overlap = (mound.radius + 0.34) - d;
      world.ball.position.addScaledVector(push, overlap);
      if (world.ballVel.dot(push) < 0) {
        world.ballVel.reflect(push).multiplyScalar(0.8);
        world.ballVel.y = 0; // Constrain to X-Z plane
      }
    }
  }
  for (const b of world.bumpers) resolveGolfBumperCollision(b);
  const distToCup = flatDistance(world.ball.position, world.cup.position);
  const ballSpeed = world.ballVel.length();
  // Wide gentle pull zone — attracts the ball toward the cup
  if (distToCup < 0.9 && ballSpeed < 8.0) {
    const pullNormal = world.cup.position.clone().sub(world.ball.position).setY(0).normalize();
    // Stronger pull the closer the ball is
    const pullStrength = (1.0 - distToCup / 0.9) * 2.0;
    world.ballVel.addScaledVector(pullNormal, pullStrength * dt * 60);
  }
  // Inner cup zone — strong pull + damping to capture the ball
  if (distToCup < CUP_PULL_RADIUS) {
    const pullNormal = world.cup.position.clone().sub(world.ball.position).setY(0).normalize();
    world.ballVel.addScaledVector(pullNormal, CUP_PULL_FORCE * dt * 60);
    world.ballVel.multiplyScalar(Math.pow(0.82, dt * 60));
  }
  // Sink into hole — requires ball to be slow enough (max entry speed)
  if ((distToCup < CUP_SINK_RADIUS && ballSpeed < CUP_SINK_SPEED_MAX) || distToCup < 0.12) {
    scoreHole();
    return;
  }
  if (ballSpeed < 0.08) { world.ballVel.set(0, 0, 0); game.ballMoving = false; if (ball) ball.moving = false; world.ball.position.y = golfBallSurfaceY(); }
}
function isBallOnIce() {
  return world.icePatches.some((ice) => {
    if (ice.type === "circle") return flatDistance(world.ball.position, ice) <= ice.r + 0.34;
    const rot = -(ice.rot || 0);
    const local = world.ball.position.clone().sub(new THREE.Vector3(ice.x, 0, ice.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return Math.abs(local.x) <= ice.sx / 2 + 0.34 && Math.abs(local.z) <= ice.sz / 2 + 0.34;
  });
}
function resolveGolfBumperCollision(b) {
  const radius = 0.34;
  const rot = -(b.rot || 0);
  const local = world.ball.position.clone().sub(new THREE.Vector3(b.x, 0, b.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  const clampedX = Math.max(-b.sx / 2, Math.min(b.sx / 2, local.x));
  const clampedZ = Math.max(-b.sz / 2, Math.min(b.sz / 2, local.z));
  const dx = local.x - clampedX;
  const dz = local.z - clampedZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > radius * radius) return;
  let normalLocal;
  if (distSq > 0.0001) {
    normalLocal = new THREE.Vector3(dx, 0, dz).normalize();
  } else {
    const pushX = b.sx / 2 - Math.abs(local.x);
    const pushZ = b.sz / 2 - Math.abs(local.z);
    normalLocal = pushX < pushZ ? new THREE.Vector3(Math.sign(local.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(local.z) || 1);
  }
  const normal = normalLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rot || 0).normalize();
  const overlap = radius - Math.sqrt(Math.max(0.0001, distSq));
  world.ball.position.addScaledVector(normal, overlap + 0.015);
  world.ball.position.y = 0.53;
  if (world.ballVel.dot(normal) < 0) {
    world.ballVel.reflect(normal).multiplyScalar(0.82);
    world.ballVel.y = 0; // Constrain to X-Z plane
  }
}
function scoreHole() {
  const playerIndex = game.currentPlayer;
  const ball = golfBallForPlayer(playerIndex);
  if (!ball) return;
  game.ballMoving = false;
  ball.moving = false;
  ball.vel.set(0, 0, 0);
  playSound("golfScore");
  // Snap ball to cup center
  ball.mesh.position.x = world.cup.position.x;
  ball.mesh.position.z = world.cup.position.z;
  ball.mesh.position.y = 0.38; // Start sinking animation from surface level
  game.holeScores[playerIndex][game.holeIndex] = game.strokesThisHole[playerIndex];
  // Start a 2-second delay before advancing
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) game.holeTransitionTimer = 2.0;
  else if (game.role === "solo") {
    const nextPlayer = game.holeScores.findIndex((scores) => scores[game.holeIndex] === null);
    if (nextPlayer !== -1) useGolfBall(nextPlayer);
  }
  updateHud();

  if (game.role !== "solo") {
    send({
      type: "golfHoleScored",
      currentPlayer: playerIndex,
      strokes: game.strokesThisHole[playerIndex],
      state: serializeGolfState()
    });
  }
}
function applyGolfHoleScored(message) {
  if (message.state) applyGolfState(message.state);
  game.holeScores[message.currentPlayer][game.holeIndex] = message.strokes;
  playSound("golfScore");
  const ball = golfBallForPlayer(message.currentPlayer);
  if (ball) {
    ball.mesh.position.x = world.cup.position.x;
    ball.mesh.position.z = world.cup.position.z;
    ball.mesh.position.y = 0.38; // Start sinking
    ball.moving = false;
    ball.vel.set(0, 0, 0);
  }
  game.ballMoving = world.golfBalls.some((b) => b.moving);
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) game.holeTransitionTimer = 2.0;
  updateHud();
}
function advanceAfterScore() {
  if (game.holeScores.every((scores) => scores[game.holeIndex] !== null)) nextHole();
}
function nextHole() {
  game.holeIndex++;
  if (game.holeIndex >= holes.length) {
    let winner = 0;
    if (game.role !== "solo") {
      const totals = totalStrokes();
      const best = Math.min(...totals);
      const winners = totals.map((score, index) => score === best ? index : -1).filter((index) => index !== -1);
      winner = winners.length === 1 ? winners[0] : -1;
    }
    if (winner === -1 && game.role !== "solo") {
      if (game.role === "host") {
        resetFpsDuelState(true);
        send({ type: "phaseFps", fpsState: serializeFpsDuelState() });
        enterFps(false, { preserveFpsMatch: true, randomTournament: true, randomWeapon: game.randomWeapon, randomLoadout: game.randomLoadout });
      }
    } else {
      finishMatch(winner, "golf");
    }
  } else {
    game.currentPlayer = activeGolfPlayerIndex();
    game.strokesThisHole = Array(game.playerCount).fill(0);
    resetGolfHole();
    if (game.role !== "solo") send({ type: "golfResolved", state: serializeGolfState() });
  }
}
function totalStrokes() { return game.holeScores.map(ps => ps.reduce((a, b) => (a || 0) + (b || 0), 0)); }
function serializeGolfState() {
  return {
    playerCount: game.playerCount,
    currentPlayer: game.currentPlayer,
    holeIndex: game.holeIndex,
    holeScores: game.holeScores,
    strokesThisHole: game.strokesThisHole,
    balls: world.golfBalls.map((ball) => ({ x: ball.mesh.position.x, y: ball.mesh.position.y, z: ball.mesh.position.z, vx: ball.vel.x, vz: ball.vel.z, moving: ball.moving, falling: ball.falling, lastX: ball.lastShot.x, lastZ: ball.lastShot.z })),
    ballPos: { x: world.ball.position.x, z: world.ball.position.z },
    ballVel: { x: world.ballVel.x, z: world.ballVel.z },
    token: game.golfResolveToken
  };
}
function applyGolfState(s) {
  if (!s) return;
  const holeChanged = s.holeIndex !== game.holeIndex;
  game.playerCount = Math.max(2, s.playerCount || s.holeScores?.length || game.playerCount);
  ensureGolfBalls(game.playerCount);
  game.currentPlayer = s.currentPlayer ?? activeGolfPlayerIndex();
  game.holeIndex = s.holeIndex;
  game.holeScores = s.holeScores || game.holeScores;
  game.strokesThisHole = s.strokesThisHole || game.strokesThisHole;
  if (holeChanged) resetGolfHole();
  const ballStates = Array.isArray(s.balls) ? s.balls : [{ ...s.ballPos, vx: s.ballVel?.x || 0, vz: s.ballVel?.z || 0, moving: Boolean(s.ballVel?.x || s.ballVel?.z) }];
  ballStates.forEach((state, index) => {
    const ball = world.golfBalls[index];
    if (!ball || !state) return;
    ball.mesh.position.set(state.x ?? 0, state.y ?? 0.53, state.z ?? 0);
    ball.vel.set(state.vx || 0, 0, state.vz || 0);
    ball.moving = Boolean(state.moving || ball.vel.lengthSq() > 0);
    ball.falling = Boolean(state.falling);
    ball.lastShot.set(state.lastX ?? ball.mesh.position.x, 0.53, state.lastZ ?? ball.mesh.position.z);
  });
  useGolfBall(activeGolfPlayerIndex());
  game.ballMoving = world.golfBalls.some((ball) => ball.moving);
  updateHud();
}

Object.assign(globalThis, {
  updateGolf,
  canControlGolf,
  updateGolfCamera,
  updateShotArrow,
  simulateShot,
  isBallOnGolfSurface,
  resetGolfAfterFall,
  resolveGolfBall,
  isBallOnIce,
  resolveGolfBumperCollision,
  scoreHole,
  applyGolfHoleScored,
  advanceAfterScore,
  nextHole,
  totalStrokes,
  serializeGolfState,
  applyGolfState
});
