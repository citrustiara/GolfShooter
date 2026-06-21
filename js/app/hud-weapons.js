import "./globals.js";

function updateHud() {
  const totals = totalStrokes(), isFps = game.phase === "fps" || game.phase === "fpsVictoryLap";
  const rules = isFps ? activeFpsRules() : null;
  holeLabel.textContent = isFps ? "Map" : "Hole";
  turnLabel.textContent = isFps ? "Rounds" : "Turn";
  strokeLabel.textContent = isFps ? "Maps" : "Strokes";
  holeText.textContent = isFps ? `${rules.currentMapSlot + 1}/${rules.mapCount}` : `${game.holeIndex + 1}`; turnText.textContent = isFps ? `${formatScores(game.fpsKillWins)} / ${rules.roundsPerMap}` : (game.role === "solo" ? "Solo" : playerDisplayName(game.localIndex, `P${game.localIndex + 1}`)); strokeText.textContent = isFps ? formatScores(game.fpsMapWins) : (game.role === "solo" ? `${totals[0]}` : formatScores(totals));
  healthChip.classList.toggle("hidden", !isFps);
  if (isFps) {
    const localPlayer = fps.players[game.localIndex] || {};
    const maxHealth = Math.max(1, Number(localPlayer.maxHealth || game.maxHealth || 100));
    const health = Math.max(0, Math.min(maxHealth, Number(localPlayer.health) || 0));
    const healthPct = Math.max(0, Math.min(1, health / maxHealth));
    const healthHue = Math.round(healthPct * 118);
    healthText.textContent = `${Math.ceil(health)}`;
    healthChip.style.setProperty("--health-pct", `${healthPct * 100}%`);
    healthChip.style.setProperty("--health-color", `hsl(${healthHue}, 90%, 52%)`);
    healthChip.setAttribute("aria-valuemax", `${Math.ceil(maxHealth)}`);
    healthChip.setAttribute("aria-valuenow", `${Math.ceil(health)}`);
    healthChip.classList.toggle("ads", Boolean(input.aiming && game.activeWeapon === "gun" && !game.parryGuardActive));
  } else {
    healthChip.classList.remove("ads");
  }
  abilityContainer.classList.toggle("hidden", !isFps);
  if (isFps) {
    for (const [name, id] of [["jump", "#jumpAbility"], ["heal", "#healAbility"], ["radar", "#radarAbility"], ["grenade", "#grenadeAbility"], ["smoke", "#smokeAbility"], ["jetpack", "#jetpackAbility"], ["dash", "#dashAbility"], ["grapple", "#grappleAbility"]]) {
      const el = document.querySelector(id);
      if (el) {
        el.classList.toggle("disabled", !abilityAllowed(name));
        el.classList.toggle("hidden", !abilityAllowed(name));
        const hint = el.querySelector(".key-hint");
        if (hint) {
          const rawKey = getAbilityKey(name);
          hint.textContent = keyLabel(rawKey);
        }
      }
    }
    jumpOverlay.style.height = `${Math.max(0, game.jumpCooldown / abilityCooldown("jump", 3.0)) * 100}%`; jumpCDText.textContent = abilityAllowed("jump") && game.jumpCooldown > 0 ? Math.ceil(game.jumpCooldown) : "";
    healOverlay.style.height = `${Math.max(0, game.healCooldown / abilityCooldown("heal", 10.0)) * 100}%`; healCDText.textContent = abilityAllowed("heal") && game.healCooldown > 0 ? Math.ceil(game.healCooldown) : "";
    radarOverlay.style.height = `${Math.max(0, game.radarCooldown / abilityCooldown("radar", RADAR_COOLDOWN)) * 100}%`; radarCDText.textContent = abilityAllowed("radar") && game.radarCooldown > 0 ? Math.ceil(game.radarCooldown) : "";
    grenadeOverlay.style.height = `${Math.max(0, game.grenadeCooldown / abilityCooldown("grenade", GRENADE_COOLDOWN)) * 100}%`; grenadeCDText.textContent = abilityAllowed("grenade") && game.grenadeCooldown > 0 ? Math.ceil(game.grenadeCooldown) : "";
    if (smokeOverlay) smokeOverlay.style.height = `${Math.max(0, game.smokeCooldown / abilityCooldown("smoke", SMOKE_GRENADE_COOLDOWN)) * 100}%`; if (smokeCDText) smokeCDText.textContent = abilityAllowed("smoke") && game.smokeCooldown > 0 ? Math.ceil(game.smokeCooldown) : "";
    if (dashOverlay) dashOverlay.style.height = `${Math.max(0, game.dashCooldown / abilityCooldown("dash", DASH_COOLDOWN)) * 100}%`; if (dashCDText) dashCDText.textContent = abilityAllowed("dash") && game.dashCooldown > 0 ? Math.ceil(game.dashCooldown) : "";
    const grappleCap = grappleMaxCharges(), grappleRe = grappleRechargeTime();
    if (grappleOverlay) grappleOverlay.style.height = `${game.grappleCharges < grappleCap ? Math.max(0, Math.min(1, game.grappleChargeTimer / grappleRe)) * 100 : 0}%`;
    if (grappleCDText) grappleCDText.textContent = abilityAllowed("grapple") && game.grappleCharges < grappleCap && game.grappleChargeTimer > 0 ? Math.ceil(game.grappleChargeTimer) : "";
    if (grappleChargesEl) { grappleChargesEl.textContent = String(game.grappleCharges); grappleChargesEl.classList.toggle("empty", game.grappleCharges <= 0); grappleChargesEl.classList.toggle("full", game.grappleCharges >= grappleCap); }
    if (jetpackOverlay) jetpackOverlay.style.height = "0%";
    if (jetpackCDText) jetpackCDText.textContent = "";
  }
  weaponChip.classList.toggle("hidden", !isFps); weaponText.textContent = (game.activeWeapon === "gun" ? weaponLabelText(game.primaryWeapon) : "Club");
  const bladeEquipped = game.activeWeapon === "gun" && Boolean(weaponConfig(game.primaryWeapon).meleeAttack);
  ammoChip.classList.toggle("hidden", !isFps || game.activeWeapon !== "gun" || bladeEquipped); if (game.activeWeapon === "gun" && !bladeEquipped) ammoText.textContent = game.reloading ? "RELOAD" : `${game.ammo[game.primaryWeapon]} / ${weaponMaxAmmo(game.primaryWeapon)}`; if (game.phase === "golf") power.classList.remove("hidden");
  const progress = document.getElementById("reloadProgress");
  if (progress && !game.reloading && game.radarTimer <= 0 && game.parryCooldown <= 0 && !game.parryGuardActive && game.parryGuardCooldown <= 0) progress.classList.add("hidden");
  updateScoreboard();
}

// ---- Top-middle FPS scoreboard ----
let scoreboardBuiltCount = 0;
function playerHudColor(index) {
  const c = PLAYER_HUD_COLORS;
  return c[((index % c.length) + c.length) % c.length];
}
function formatRoundClock(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function syncScoreboardNameWidth(n) {
  if (!fpsScoreboard) return;
  let longest = 2;
  for (let i = 0; i < n; i++) {
    const name = playerDisplayName(i, `P${i + 1}`);
    longest = Math.max(longest, Array.from(name).length);
  }
  fpsScoreboard.style.setProperty("--score-name-target", `${Math.min(24, longest + 1)}ch`);
}
// Rebuild the player boxes (per-map round score by each name) and the overall
// map-win numbers when the player count changes. Boxes split left/right of the
// central timer so a 1v1 reads as two balanced panels flanking the clock.
function buildScoreboard(n) {
  if (!fpsScoreLeft || !fpsScoreRight || !fpsScoreMaps) return;
  fpsScoreLeft.replaceChildren();
  fpsScoreRight.replaceChildren();
  // 1v1 keeps the split with one score flanking each side of the
  // timer. With 3+ players a left/right split reads as lopsided (e.g. 2 vs 1),
  // so we stack: timer/maps on top, every player in one centered row below.
  const stacked = n > 2;
  fpsScoreboard?.classList.toggle("multi", stacked);
  const mid = stacked ? n : Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const right = i >= mid;
    const box = document.createElement("div");
    box.className = `fps-player-box${right ? " right" : ""}`;
    box.dataset.index = String(i);
    box.style.setProperty("--team", playerHudColor(i));
    const tag = document.createElement("span");
    tag.className = "fps-player-tag";
    tag.textContent = playerDisplayName(i, `P${i + 1}`);
    const rounds = document.createElement("span");
    rounds.className = "fps-player-rounds";
    rounds.textContent = "0";
    if (right) box.append(rounds, tag); else box.append(tag, rounds);
    (right ? fpsScoreRight : fpsScoreLeft).appendChild(box);
  }
  fpsScoreMaps.replaceChildren();
  const label = document.createElement("span");
  label.className = "fps-score-maps-label";
  label.textContent = "MAPS";
  fpsScoreMaps.appendChild(label);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "fps-score-maps-sep";
      sep.textContent = "·";
      fpsScoreMaps.appendChild(sep);
    }
    const num = document.createElement("span");
    num.className = "fps-score-maps-num";
    num.dataset.index = String(i);
    num.style.color = playerHudColor(i);
    num.textContent = "0";
    fpsScoreMaps.appendChild(num);
  }
  scoreboardBuiltCount = n;
}
function updateScoreboard() {
  if (!fpsScoreboard) return;
  const isFps = game.phase === "fps" || game.phase === "fpsVictoryLap";
  fpsScoreboard.classList.toggle("hidden", !isFps);
  fpsScoreboard.setAttribute("aria-hidden", isFps ? "false" : "true");
  if (!isFps) return;
  const n = Math.max(2, game.playerCount || 2);
  if (scoreboardBuiltCount !== n) buildScoreboard(n);
  syncScoreboardNameWidth(n);
  const killWins = game.fpsKillWins || [];
  const mapWins = game.fpsMapWins || [];
  const bestRounds = killWins.length ? Math.max(...killWins) : 0;
  fpsScoreboard.querySelectorAll(".fps-player-box").forEach((box) => {
    const i = Number(box.dataset.index);
    const tag = box.querySelector(".fps-player-tag");
    if (tag) {
      tag.textContent = playerDisplayName(i, `P${i + 1}`);
      tag.title = tag.textContent;
    }
    const r = box.querySelector(".fps-player-rounds");
    if (r) r.textContent = String(killWins[i] ?? 0);
    box.classList.toggle("leading", bestRounds > 0 && (killWins[i] ?? 0) === bestRounds);
    box.classList.toggle("dead", isFps && (fps.players[i]?.health ?? 1) <= 0);
  });
  fpsScoreMaps?.querySelectorAll(".fps-score-maps-num").forEach((num) => {
    num.textContent = String(mapWins[Number(num.dataset.index)] ?? 0);
  });
  if (fpsScoreTimer) {
    fpsScoreTimer.textContent = formatRoundClock(game.roundTimeLeft);
    fpsScoreTimer.classList.toggle("low", game.phase === "fps" && (game.roundTimeLeft ?? ROUND_TIME_LIMIT) <= 30);
  }
}
function switchWeapon(wt) { if (game.radarTimer > 0) return; if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0 || game.randomTournament) return; requestWeaponSwap(wt, game.primaryWeapon); }
function selectPrimaryWeapon(wp, animate = false) { if (game.radarTimer > 0) return; if (game.randomTournament || !activeWeaponIds().includes(wp)) return; if (animate && game.countdown <= 0) requestWeaponSwap("gun", wp); else applyWeaponState("gun", wp); }
function cycleWeaponCard(dir) { if (game.radarTimer > 0) return; if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; if (game.randomTournament) return; const ws = activeWeaponIds(); if (!ws.length) return; const nI = (Math.max(0, ws.indexOf(game.primaryWeapon)) + dir + ws.length) % ws.length; pickWeaponCard(ws[nI], game.countdown <= 0); }
function pickWeaponCard(wp, animate = false) { if (game.radarTimer > 0) return; if (game.phase !== "fps" && game.phase !== "fpsVictoryLap") return; weaponCards.forEach(c => c.classList.toggle("active", c.getAttribute("data-weapon") === wp)); selectPrimaryWeapon(wp, animate); }
function normalWeaponChoices() { const guns = activeWeaponIds().map((primary) => ({ active: "gun", primary })); return meleeAllowed() ? [...guns, { active: "melee", primary: guns[0]?.primary || "pistol" }] : guns; }
function applyRandomTournamentCombination(excludeMapIndex = -1) {
  if (!game.randomTournamentPlayedMaps) {
    game.randomTournamentPlayedMaps = [];
  }
  let choices = tournamentCombinations.filter(c => {
    const mapId = c.map.split("/").pop().replace(".json", "");
    const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
    if (excludeMapIndex !== -1 && mapIndex === excludeMapIndex) return false;
    return !game.randomTournamentPlayedMaps.includes(c.map);
  });
  if (choices.length === 0) {
    game.randomTournamentPlayedMaps = [];
    choices = tournamentCombinations.filter(c => {
      const mapId = c.map.split("/").pop().replace(".json", "");
      const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
      return excludeMapIndex === -1 || mapIndex !== excludeMapIndex;
    });
    if (choices.length === 0) choices = tournamentCombinations;
  }
  const combo = choices[Math.floor(Math.random() * choices.length)];
  if (!combo) return;
  if (!game.randomTournamentPlayedMaps.includes(combo.map)) {
    game.randomTournamentPlayedMaps.push(combo.map);
  }
  const mapId = combo.map.split("/").pop().replace(".json", "");
  const mapIndex = fpsArenaThemes.findIndex(t => t.id === mapId);
  game.fpsMapIndex = mapIndex !== -1 ? mapIndex : 0;
  
  game.randomLoadout = {
    id: combo.id,
    hp: combo.hp ?? 100,
    speed: combo.speed ?? 1.0,
    abilities: combo.abilities || ["jump", "heal", "grenade", "smoke", "radar"],
    weapons: combo.weapons || ["pistol"],
    abilityKeys: combo.abilityKeys || {},
    cooldowns: combo.cooldowns || {}
  };
  game.randomWeapon = game.randomLoadout.weapons[0] || "pistol";
  game.maxHealth = game.randomLoadout.hp;
}
function cycleActiveWeapon(dir) {
  if (game.radarTimer > 0) return;
  if (game.randomTournament) {
    if (game.randomLoadout && game.randomLoadout.weapons && game.randomLoadout.weapons.length > 1) {
      const weapons = game.randomLoadout.weapons;
      const currentWeaponId = game.activeWeapon === "melee" ? "melee" : game.primaryWeapon;
      const currentIdx = weapons.indexOf(currentWeaponId);
      if (currentIdx !== -1) {
        const nextIdx = (currentIdx + dir + weapons.length) % weapons.length;
        const nextWeapon = weapons[nextIdx];
        if (nextWeapon === "melee") {
          requestWeaponSwap("melee", game.primaryWeapon);
        } else {
          requestWeaponSwap("gun", nextWeapon);
        }
      }
    }
    return;
  }
  const choices = normalWeaponChoices();
  if (!choices.length) return;
  const cI = game.activeWeapon === "melee" ? choices.length - 1 : Math.max(0, choices.findIndex(i => i.active === "gun" && i.primary === game.primaryWeapon));
  const n = choices[(cI + dir + choices.length) % choices.length];
  if (n.active === "melee") switchWeapon("melee");
  else pickWeaponCard(n.primary, true);
}
function requestWeaponSwap(aw, pw = game.primaryWeapon) {
  if ((game.phase !== "fps" && game.phase !== "fpsVictoryLap") || game.countdown > 0) return;
  if (game.randomTournament) {
    if (!game.randomLoadout || !game.randomLoadout.weapons) return;
    const targetWeapon = aw === "melee" ? "melee" : pw;
    if (!game.randomLoadout.weapons.includes(targetWeapon)) return;
  } else {
    if (aw === "melee") {
      if (!meleeAllowed()) return;
    } else if (!activeWeaponIds().includes(pw)) return;
  }
  if (game.parryGuardActive) endParryGuard(true);
  game.pendingActiveWeapon = aw;
  game.pendingPrimaryWeapon = pw;
  game.weaponSwapTimer = WEAPON_SWAP_DURATION;
  game.weaponSwapCommitted = false;
  playSound("weaponSwap", { volume: 0.8 });
  game.inspectTimer = 0;
  input.aiming = false;
  updateHud();
}
function updateWeaponSwap(dt) { if (game.weaponSwapTimer <= 0) return; game.weaponSwapTimer = Math.max(0, game.weaponSwapTimer - dt); if (!game.weaponSwapCommitted && game.weaponSwapTimer <= WEAPON_SWAP_DURATION * 0.5) { applyWeaponState(game.pendingActiveWeapon, game.pendingPrimaryWeapon); game.weaponSwapCommitted = true; } }
function cancelReload() {
  if (!game.reloading) return;
  game.reloading = false;
  game.reloadTimer = 0;
  game.reloadWeapon = null;
  document.getElementById("reloadProgress")?.classList.add("hidden");
  const bar = document.getElementById("reloadBar");
  if (bar) bar.style.transform = "scaleX(0)";
}

function applyWeaponState(aw, pw = game.primaryWeapon) {
  if (game.randomTournament) {
    if (game.randomLoadout && game.randomLoadout.weapons) {
      const allowed = game.randomLoadout.weapons;
      if (aw === "melee") {
        if (!allowed.includes("melee")) {
          aw = "gun";
          pw = allowed.find(w => w !== "melee") || "pistol";
        }
      } else {
        if (!allowed.includes(pw)) {
          pw = allowed.find(w => w !== "melee") || "pistol";
        }
      }
    } else {
      if (isRandomMeleeWeapon()) { aw = "melee"; pw = "pistol"; }
      else { aw = "gun"; pw = game.randomWeapon; }
    }
  } else {
    const allowedGuns = activeWeaponIds();
    if (aw === "melee") {
      if (!meleeAllowed()) {
        aw = "gun";
        pw = allowedGuns[0] || "pistol";
      }
    } else if (!allowedGuns.includes(pw)) {
      pw = allowedGuns[0] || "pistol";
    }
  }
  const changed = game.primaryWeapon !== pw || game.activeWeapon !== aw;
  game.activeWeapon = aw;
  game.primaryWeapon = pw;
  fps.players[game.localIndex].weapon = aw;
  fps.players[game.localIndex].primaryWeapon = pw;
  weaponCards.forEach(c => c.classList.toggle("active", aw === "gun" && c.getAttribute("data-weapon") === pw));
  if (changed) cancelReload();
  if (aw === "melee") cancelReload();
  if (changed) {
    syncPrimaryWeaponModel();
    send({ type: "fpsWeaponChoice", player: game.localIndex, weapon: pw });
  }
  updateHud();
}
function syncPrimaryWeaponModel() {
  rebuildWeaponMesh(game.primaryWeapon, world.weapon);
  rebuildWeaponMesh("melee", world.meleeWeapon);
  world.weaponModelId = game.primaryWeapon;
}
function setWeaponPalette() {}
function startReload() { if (game.phase !== "fps" || game.reloading || game.activeWeapon !== "gun" || game.radarTimer > 0) return; const cfg = weaponConfig(); if (cfg.meleeAttack) return; if (game.ammo[game.primaryWeapon] === cfg.ammo) return; game.reloading = true; game.reloadTimer = cfg.reload; game.reloadWeapon = game.primaryWeapon; playSound("reloadStart", { volume: 0.8 }); const progress = document.getElementById("reloadProgress"), bar = document.getElementById("reloadBar"); if (progress && bar) { progress.classList.remove("hidden"); bar.style.width = "100%"; bar.style.transform = "scaleX(0)"; bar.style.background = "#21d0ff"; } updateHud(); }

Object.assign(globalThis, {
  updateHud,
  updateScoreboard,
  buildScoreboard,
  playerHudColor,
  formatRoundClock,
  switchWeapon,
  selectPrimaryWeapon,
  cycleWeaponCard,
  pickWeaponCard,
  normalWeaponChoices,
  applyRandomTournamentCombination,
  cycleActiveWeapon,
  requestWeaponSwap,
  updateWeaponSwap,
  cancelReload,
  applyWeaponState,
  syncPrimaryWeaponModel,
  setWeaponPalette,
  startReload
});
