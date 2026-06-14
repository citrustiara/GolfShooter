import "./globals.js";

const battleLogRecent = new Map();

function showDamageTaken(amount) {
  // Re-arm the edge hue; it eases out on its own timer (driven in updateFps) so a
  // hit leaves a lingering red border rather than a quick cheap flash.
  game.damageEffectTimer = DAMAGE_EFFECT_DURATION;
  playSound("hurt");
  // Drop into (or refresh) the low-health screen state when the hit leaves the
  // local player hurting. It re-arms on each hit but always fades on its own.
  const me = fps.players[game.localIndex];
  if (me && me.health > 0 && me.health <= game.maxHealth * LOW_HP_THRESHOLD) {
    game.lowHpEffectTimer = LOW_HP_EFFECT_DURATION;
  }
}
// Green screen-edge flash when the local player heals; a solid top-up also pulls
// them back out of the low-health daze.
function showHealed() {
  game.healEffectTimer = HEAL_EFFECT_DURATION;
  const me = fps.players[game.localIndex];
  if (me && me.health > game.maxHealth * LOW_HP_THRESHOLD) {
    game.lowHpEffectTimer = 0;
    game.lowHpHeartbeatTimer = 0;
  }
  playSound("heal", { volume: 0.7 });
}

function formatKillDistance(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value) || value < 0) return "-- m";
  if (value < 1) return "<1 m";
  if (value < 10) return `${value.toFixed(1)} m`;
  return `${Math.round(value)} m`;
}

function killNoticeHasDetail(details = {}) {
  return details.weaponName || details.weapon || Number.isFinite(Number(details.distance)) || details.headshot !== undefined;
}

function replayKillNoticeAnimation() {
  killNotice.style.animation = "none";
  void killNotice.offsetWidth;
  killNotice.style.animation = "";
}

function normalizePlayerIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function playerKillFeedName(index, fallback = "WORLD") {
  const n = normalizePlayerIndex(index);
  return n === null ? fallback : `P${n + 1}`;
}

function killWeaponName(details = {}) {
  if (details.weaponName) return details.weaponName;
  if (details.weapon) return weaponLabelText(details.weapon);
  return "Unknown";
}

function isRoundFinalKill(details = {}) {
  if (details.finalKill !== undefined) return Boolean(details.finalKill);
  if (game.phase !== "fps") return false;
  return aliveFpsPlayerIndexes().length <= 1;
}

function setKillNoticeCard({ badge, main, weaponName, distance, headshot = false, death = false, victimIndex = null, detailed = false, resultLabel = null, compact = false }) {
  if (resultOverlayVisible()) { hideKillNotice(); return; }
  game.killNoticeTimer = compact ? 2.8 : 5.1;
  killNotice.dataset.victim = victimIndex === null || victimIndex === undefined ? "" : String(victimIndex);
  killNotice.dataset.detailed = detailed ? "1" : "0";
  killNotice.className = `kill-notice${headshot ? " headshot" : ""}${death ? " death" : ""}${compact ? " compact" : ""}`;
  killNotice.replaceChildren();

  const badgeEl = document.createElement("div");
  badgeEl.className = "kill-badge";
  badgeEl.textContent = badge;

  const mainEl = document.createElement("div");
  mainEl.className = "kill-main";
  mainEl.textContent = main;

  const metaEl = document.createElement("div");
  metaEl.className = "kill-meta";
  const addMeta = (text, hot = false) => {
    const item = document.createElement("span");
    if (hot) item.className = "kill-hot";
    item.textContent = text;
    metaEl.appendChild(item);
  };
  addMeta(weaponName || "Unknown");
  addMeta(formatKillDistance(distance));
  addMeta(resultLabel || (headshot ? "HEADSHOT" : (death ? "DEATH" : "BODY SHOT")), headshot || death);

  killNotice.append(badgeEl, mainEl, metaEl);
  killNotice.classList.remove("hidden");
  replayKillNoticeAnimation();
}

function showBattleLogElimination(victimIndex, details = {}) {
  if (!battleLog || resultOverlayVisible()) return;
  const victim = normalizePlayerIndex(victimIndex);
  if (victim === null) return;
  const killer = normalizePlayerIndex(details.killerIndex ?? details.killer ?? details.player);
  const weaponName = killWeaponName(details);
  const headshot = Boolean(details.headshot);
  const now = performance.now();
  const key = `${killer ?? "world"}|${victim}|${weaponName}|${headshot ? 1 : 0}`;
  const previous = battleLogRecent.get(key) || 0;
  if (now - previous < 1400) return;
  battleLogRecent.set(key, now);

  const entry = document.createElement("div");
  entry.className = `battle-log-entry${headshot ? " headshot" : ""}${killer === game.localIndex ? " local-kill" : ""}${victim === game.localIndex ? " local-death" : ""}`;

  const badge = document.createElement("div");
  badge.className = "battle-log-badge";
  badge.textContent = headshot ? "HEADSHOT" : "ELIMINATION";

  const main = document.createElement("div");
  main.className = "battle-log-main";
  const killerName = details.killerName || playerKillFeedName(killer, "WORLD");
  const victimName = details.enemyName || details.victimName || playerKillFeedName(victim);
  main.textContent = killer === null ? `${victimName} DOWN` : `${killerName} → ${victimName}`;

  const meta = document.createElement("div");
  meta.className = "battle-log-meta";
  for (const [text, hot] of [[weaponName, false], [formatKillDistance(details.distance), false], [headshot ? "HEADSHOT" : (details.resultLabel || "ELIMINATED"), headshot]]) {
    const span = document.createElement("span");
    if (hot) span.className = "kill-hot";
    span.textContent = text;
    meta.appendChild(span);
  }

  entry.append(badge, main, meta);
  battleLog.prepend(entry);
  battleLog.classList.remove("hidden");
  while (battleLog.children.length > 7) battleLog.lastElementChild?.remove();
  window.setTimeout(() => {
    entry.classList.add("expired");
    window.setTimeout(() => {
      entry.remove();
      if (!battleLog.children.length) battleLog.classList.add("hidden");
    }, 260);
  }, 6200);
}

function clearBattleLog() {
  battleLog?.replaceChildren();
  battleLog?.classList.add("hidden");
  battleLogRecent.clear();
}

function broadcastKillEvent(victimIndex, details = {}, weaponName = killWeaponName(details), finalKill = isRoundFinalKill(details)) {
  if (details.broadcast === false || game.phase !== "fps" || !game.connected) return;
  const victim = normalizePlayerIndex(victimIndex);
  const killer = normalizePlayerIndex(details.killerIndex ?? game.localIndex);
  if (victim === null || killer !== game.localIndex) return;
  send({
    type: "fpsKillEvent",
    killer,
    victim,
    weapon: details.weapon || null,
    weaponName,
    distance: details.distance,
    headshot: Boolean(details.headshot),
    finalKill
  });
}

function showKilledBy(weaponName, details = {}) {
  input.shootHeld = false;
  input.aiming = false;
  releaseGrapple?.();
  // Remember who landed the kill (so death spectating can follow them) and the
  // details of the blow (so the defeat screen can report what finished us off).
  const killerIndex = normalizePlayerIndex(details.killerIndex ?? details.killer ?? details.player);
  game.lastKilledBy = { weaponName, headshot: Boolean(details.headshot), distance: details.distance, killerIndex };
  if (game.phase === "fps" && killerIndex !== null && killerIndex !== game.localIndex && fps.players[killerIndex]) {
    game.spectateTarget = killerIndex;
  }
  setKillNoticeCard({
    badge: details.headshot ? "HEADSHOT DEATH" : "YOU WERE ELIMINATED",
    main: `KILLED BY ${weaponName}`,
    weaponName,
    distance: details.distance,
    headshot: Boolean(details.headshot),
    death: true,
    detailed: killNoticeHasDetail(details)
  });
  if (details.killerIndex !== undefined || details.killer !== undefined || details.player !== undefined) {
    showBattleLogElimination(game.localIndex, { ...details, weaponName });
  }
}

function showEliminationNotice(victimIndex, details = {}) {
  if (resultOverlayVisible()) { hideKillNotice(); return; }
  const hasDetail = killNoticeHasDetail(details);
  if (!hasDetail && killNotice.dataset.victim === String(victimIndex) && killNotice.dataset.detailed === "1" && game.killNoticeTimer > 0) return;
  const alreadyShowingVictim = killNotice.dataset.victim === String(victimIndex) && game.killNoticeTimer > 0;
  if (!alreadyShowingVictim) playSound("kill");
  const weaponName = hasDetail ? (details.weaponName || (details.weapon ? weaponLabelText(details.weapon) : weaponLabelText(game.primaryWeapon))) : "Unknown";
  const finalKill = isRoundFinalKill(details);
  setKillNoticeCard({
    badge: details.headshot ? "HEADSHOT" : "ELIMINATION",
    main: `${details.enemyName || `P${victimIndex + 1}`} DOWN`,
    weaponName,
    distance: details.distance,
    headshot: Boolean(details.headshot),
    victimIndex,
    detailed: hasDetail,
    resultLabel: details.headshot ? "HEADSHOT" : "ELIMINATED",
    compact: !finalKill
  });
  const logDetails = { ...details, killerIndex: details.killerIndex ?? game.localIndex, weaponName };
  showBattleLogElimination(victimIndex, logDetails);
  broadcastKillEvent(victimIndex, details, weaponName, finalKill);
}

function weaponLabel(wp) {
  if (wp === "grapple") return "Grapple Hook";
  if (weaponCatalog[wp]) return weaponCatalog[wp].label;
  return "Club";
}

function applyLoadedContent(content) {
  if (Array.isArray(content.standardWeaponIds) && content.standardWeaponIds.length) {
    standardWeaponIds = content.standardWeaponIds;
  }
  if (Array.isArray(content.loadouts) && content.loadouts.length) {
    randomLoadoutPresets = content.loadouts;
  }
  weaponIds = Object.keys(weaponCatalog);
  game.ammo = freshAmmoState();
  syncWeaponCardText();
  syncPracticeMapPlanner();
}

function syncWeaponCardText() {
  weaponCards.forEach((card) => {
    const id = card.getAttribute("data-weapon");
    const cfg = weaponCatalog[id];
    if (!cfg) return;
    const title = card.querySelector("h3");
    const stats = card.querySelectorAll(".weapon-stat");
    if (title) title.textContent = cfg.label.toUpperCase();
    if (stats[0]) stats[0].textContent = `Damage: ${cfg.damage} (${Math.round(cfg.damage * (cfg.crit || 1))} Crit)`;
    if (stats[1]) stats[1].textContent = `Ammo: ${cfg.ammo} Rounds`;
    if (stats[2]) stats[2].textContent = `Type: ${cfg.projectile ? "Projectile" : (cfg.fireDelay <= 90 ? "Full-Auto" : "Semi-Auto")}`;
  });
}

function golfRampAt(pos, margin = 0.34) {
  let best = null;
  for (const ramp of world.ramps) {
    const y = rampSurfaceY(ramp, pos, margin);
    if (y === null) continue;
    if (!best || y > best.y) best = { ramp, y };
  }
  return best;
}

function golfBallSurfaceY() {
  const ramp = golfRampAt(world.ball.position);
  return ramp ? ramp.y + 0.34 : 0.53;
}

Object.assign(globalThis, {
  showDamageTaken,
  showHealed,
  formatKillDistance,
  killNoticeHasDetail,
  replayKillNoticeAnimation,
  setKillNoticeCard,
  showBattleLogElimination,
  clearBattleLog,
  broadcastKillEvent,
  showKilledBy,
  showEliminationNotice,
  weaponLabel,
  applyLoadedContent,
  syncWeaponCardText,
  golfRampAt,
  golfBallSurfaceY
});
