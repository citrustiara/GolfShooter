import "./globals.js";

function showDamageTaken(amount) {
  damageVignette.classList.remove("active");
  void damageVignette.offsetWidth;
  damageVignette.classList.add("active");
  playSound("hurt");
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

function setKillNoticeCard({ badge, main, weaponName, distance, headshot = false, death = false, victimIndex = null, detailed = false, resultLabel = null }) {
  if (resultOverlayVisible()) { hideKillNotice(); return; }
  game.killNoticeTimer = 5.1;
  killNotice.dataset.victim = victimIndex === null || victimIndex === undefined ? "" : String(victimIndex);
  killNotice.dataset.detailed = detailed ? "1" : "0";
  killNotice.className = `kill-notice${headshot ? " headshot" : ""}${death ? " death" : ""}`;
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

function showKilledBy(weaponName, details = {}) {
  setKillNoticeCard({
    badge: details.headshot ? "HEADSHOT DEATH" : "YOU WERE ELIMINATED",
    main: `KILLED BY ${weaponName}`,
    weaponName,
    distance: details.distance,
    headshot: Boolean(details.headshot),
    death: true,
    detailed: killNoticeHasDetail(details)
  });
}

function showEliminationNotice(victimIndex, details = {}) {
  if (resultOverlayVisible()) { hideKillNotice(); return; }
  const hasDetail = killNoticeHasDetail(details);
  if (!hasDetail && killNotice.dataset.victim === String(victimIndex) && killNotice.dataset.detailed === "1" && game.killNoticeTimer > 0) return;
  const alreadyShowingVictim = killNotice.dataset.victim === String(victimIndex) && game.killNoticeTimer > 0;
  if (!alreadyShowingVictim) playSound("kill");
  const weaponName = hasDetail ? (details.weaponName || (details.weapon ? weaponLabelText(details.weapon) : weaponLabelText(game.primaryWeapon))) : "Unknown";
  setKillNoticeCard({
    badge: "ELIMINATION",
    main: `${details.enemyName || `P${victimIndex + 1}`} DOWN`,
    weaponName,
    distance: details.distance,
    headshot: false,
    victimIndex,
    detailed: hasDetail,
    resultLabel: "ELIMINATED"
  });
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
  formatKillDistance,
  killNoticeHasDetail,
  replayKillNoticeAnimation,
  setKillNoticeCard,
  showKilledBy,
  showEliminationNotice,
  weaponLabel,
  applyLoadedContent,
  syncWeaponCardText,
  golfRampAt,
  golfBallSurfaceY
});
