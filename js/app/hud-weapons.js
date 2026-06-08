import "./globals.js";

function updateHud() {
  const totals = totalStrokes(), isFps = game.phase === "fps" || game.phase === "fpsVictoryLap";
  const rules = isFps ? activeFpsRules() : null;
  holeLabel.textContent = isFps ? "Map" : "Hole";
  turnLabel.textContent = isFps ? "Rounds" : "Turn";
  strokeLabel.textContent = isFps ? "Maps" : "Strokes";
  holeText.textContent = isFps ? `${rules.currentMapSlot + 1}/${rules.mapCount}` : `${game.holeIndex + 1}`; turnText.textContent = isFps ? `${formatScores(game.fpsKillWins)} / ${rules.roundsPerMap}` : (game.role === "solo" ? "Solo" : `P${game.localIndex + 1}`); strokeText.textContent = isFps ? formatScores(game.fpsMapWins) : (game.role === "solo" ? `${totals[0]}` : formatScores(totals));
  healthChip.classList.toggle("hidden", !isFps); healthText.textContent = `${Math.ceil(fps.players[game.localIndex].health)}`; abilityContainer.classList.toggle("hidden", !isFps);
  if (isFps) {
    for (const [name, id] of [["jump", "#jumpAbility"], ["heal", "#healAbility"], ["radar", "#radarAbility"], ["grenade", "#grenadeAbility"], ["smoke", "#smokeAbility"], ["jetpack", "#jetpackAbility"]]) {
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
    if (jetpackOverlay) jetpackOverlay.style.height = "0%";
    if (jetpackCDText) jetpackCDText.textContent = "";
  }
  weaponChip.classList.toggle("hidden", !isFps); weaponText.textContent = (game.activeWeapon === "gun" ? weaponLabelText(game.primaryWeapon) : "Club");
  ammoChip.classList.toggle("hidden", !isFps || game.activeWeapon !== "gun"); if (game.activeWeapon === "gun") ammoText.textContent = game.reloading ? "RELOAD" : `${game.ammo[game.primaryWeapon]} / ${weaponMaxAmmo(game.primaryWeapon)}`; if (game.phase === "golf") power.classList.remove("hidden");
  const progress = document.getElementById("reloadProgress");
  if (progress && !game.reloading && game.radarTimer <= 0) progress.classList.add("hidden");
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
  game.pendingActiveWeapon = aw;
  game.pendingPrimaryWeapon = pw;
  game.weaponSwapTimer = WEAPON_SWAP_DURATION;
  game.weaponSwapCommitted = false;
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
}
function setWeaponPalette() {}
function startReload() { if (game.phase !== "fps" || game.reloading || game.activeWeapon !== "gun" || game.radarTimer > 0) return; const cfg = weaponConfig(); if (game.ammo[game.primaryWeapon] === cfg.ammo) return; game.reloading = true; game.reloadTimer = cfg.reload; game.reloadWeapon = game.primaryWeapon; const progress = document.getElementById("reloadProgress"), bar = document.getElementById("reloadBar"); if (progress && bar) { progress.classList.remove("hidden"); bar.style.width = "100%"; bar.style.transform = "scaleX(0)"; bar.style.background = "#5ab0ff"; } updateHud(); }

Object.assign(globalThis, {
  updateHud,
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
