import "./globals.js";

async function populateMapSelects() {
  if (golfMapSelect.options.length > 1) return;
  try {
    const res = await fetch("maps/manifest.json");
    const manifest = await res.json();
    manifest.golfMaps?.forEach((path, i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = path.split("/").pop().replace(".json", "");
      golfMapSelect.appendChild(opt);
    });
    manifest.fpsMaps?.forEach((path, i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = path.split("/").pop().replace(".json", "");
      fpsMapSelect.appendChild(opt);
    });
    if (game.fpsCustomMap) {
      addCustomMapOptionSelect();
    }
  } catch (e) {
    console.error("Failed to load map manifest", e);
  }
}

function addCustomMapOptionSelect() {
  if (!fpsMapSelect || !game.fpsCustomMap) return;
  let exists = false;
  for (let i = 0; i < fpsMapSelect.options.length; i++) {
    if (fpsMapSelect.options[i].value === "custom") {
      exists = true;
      fpsMapSelect.options[i].textContent = "Custom: " + (game.fpsCustomMap.name || "Uploaded Map");
      break;
    }
  }
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = "custom";
    opt.textContent = "Custom: " + (game.fpsCustomMap.name || "Uploaded Map");
    fpsMapSelect.appendChild(opt);
  }
  fpsMapSelect.value = "custom";
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function keyLabel(code) {
  if (code === "Space") return "Space";
  if (code === "ShiftLeft") return "Shift";
  if (code === "ControlLeft") return "Ctrl";
  if (code?.startsWith("Key")) return code.slice(3);
  if (code?.startsWith("Digit")) return code.slice(5);
  return code || "Key";
}
function fpsMapDisplayName(index) {
  const theme = fpsArenaThemes[index];
  return theme?.name || theme?.title || theme?.id?.replace(/-/g, " ") || `Map ${index + 1}`;
}
function selectableWeaponIds() {
  return [...(weaponIds.length ? weaponIds : defaultWeaponList()), "melee"].filter((id, index, arr) => id && weaponCatalog[id] && arr.indexOf(id) === index);
}
function rawConfigForMapValue(mapValue) {
  if (mapValue === "custom") return game.fpsCustomMap?.config || game.fpsCustomMap?.loadout || {};
  const index = Number(mapValue);
  const theme = fpsArenaThemes[Number.isInteger(index) ? index : 0] || fpsArenaThemes[0];
  return theme?.config || theme?.loadout || {};
}
function normalizePracticeConfig(config = {}) {
  const base = defaultLoadout();
  const validWeapons = selectableWeaponIds();
  let weapons = Array.isArray(config.weapons) && config.weapons.length ? config.weapons : base.weapons;
  weapons = weapons.filter((id, index, arr) => validWeapons.includes(id) && arr.indexOf(id) === index);
  if (!weapons.length) weapons = validWeapons.includes("pistol") ? ["pistol"] : [validWeapons[0]].filter(Boolean);
  let abilities = Array.isArray(config.abilities) ? config.abilities : base.abilities;
  abilities = abilities.filter((id, index, arr) => ABILITY_CHOICES.some((ability) => ability.id === id) && arr.indexOf(id) === index);
  const abilityKeys = { ...defaultAbilityKeys(), ...(config.abilityKeys || {}) };
  return {
    id: config.id || "practice-custom",
    hp: Math.round(clampNumber(config.hp, 1, 9999, base.hp)),
    speed: Number(clampNumber(config.speed, 0.25, 3, base.speed).toFixed(2)),
    gravity: Number(clampNumber(config.gravity, -120, 30, FPS_DEFAULT_GRAVITY).toFixed(2)),
    weapons,
    abilities,
    abilityKeys,
    cooldowns: { ...(config.cooldowns || {}) }
  };
}
function defaultPracticeMapEntry(index = 0) {
  const mapValue = index === 0 && game.fpsCustomMap && fpsMapSelect?.value === "custom" ? "custom" : (fpsArenaThemes.length ? String(index % fpsArenaThemes.length) : "0");
  return { mapValue, mapIndex: mapValue === "custom" ? 0 : Number(mapValue) || 0, customMapActive: mapValue === "custom", customMap: mapValue === "custom" ? game.fpsCustomMap : null, config: normalizePracticeConfig(rawConfigForMapValue(mapValue)) };
}
function ensurePracticeMapConfigCount(count = Number(practiceMapCountInput?.value || 1)) {
  const target = Math.max(1, Math.min(9, Math.floor(Number(count) || 1)));
  while (practiceMapConfigs.length < target) practiceMapConfigs.push(defaultPracticeMapEntry(practiceMapConfigs.length));
  if (practiceMapConfigs.length > target) practiceMapConfigs.length = target;
  return target;
}
function populatePracticeSelect(select, value) {
  if (!select) return;
  select.replaceChildren();
  fpsArenaThemes.forEach((_, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = fpsMapDisplayName(index);
    select.appendChild(opt);
  });
  if (game.fpsCustomMap) {
    const opt = document.createElement("option");
    opt.value = "custom";
    opt.textContent = "Custom: " + (game.fpsCustomMap.name || "Uploaded Map");
    select.appendChild(opt);
  }
  if ([...select.options].some((opt) => opt.value === value)) select.value = value;
}
function practiceSummary(entry) {
  const cfg = normalizePracticeConfig(entry.config || {});
  const weaponLabels = cfg.weapons.map((id) => weaponLabelText(id));
  const abilityLabels = cfg.abilities.map((id) => ABILITY_CHOICES.find((ability) => ability.id === id)?.label || id);
  const weapons = weaponLabels.length > 3 ? `${weaponLabels.slice(0, 3).join(", ")} +${weaponLabels.length - 3}` : (weaponLabels.join(", ") || "No weapons");
  const abilities = abilityLabels.length ? abilityLabels.join(", ") : "No abilities";
  return `${weapons} · ${abilities} · ${cfg.speed.toFixed(2)}x speed · gravity ${cfg.gravity}`;
}
function syncPracticeMapPlanner() {
  if (!practiceMapList || !practiceMapCountInput || !practiceRoundsInput) return;
  const count = ensurePracticeMapConfigCount(practiceMapCountInput.value);
  practiceMapCountInput.value = String(count);
  practiceRoundsInput.value = String(Math.max(1, Math.min(21, Math.floor(Number(practiceRoundsInput.value) || FPS_DEFAULT_ROUNDS_PER_MAP))));
  practiceMapList.replaceChildren();
  for (let i = 0; i < count; i++) {
    const entry = practiceMapConfigs[i];
    entry.config = normalizePracticeConfig(entry.config || rawConfigForMapValue(entry.mapValue));
    const row = document.createElement("div");
    row.className = "practice-map-row";

    const main = document.createElement("div");
    main.className = "practice-map-main";
    const badge = document.createElement("div");
    badge.className = "practice-map-index";
    badge.textContent = String(i + 1);
    const select = document.createElement("select");
    populatePracticeSelect(select, entry.mapValue);
    select.addEventListener("change", () => {
      entry.mapValue = select.value;
      entry.mapIndex = select.value === "custom" ? 0 : Number(select.value) || 0;
      entry.customMapActive = select.value === "custom";
      entry.config = normalizePracticeConfig(rawConfigForMapValue(select.value));
      if (i === 0 && fpsMapSelect) fpsMapSelect.value = select.value;
      syncPracticeMapPlanner();
    });
    const configBtn = document.createElement("button");
    configBtn.type = "button";
    configBtn.className = "practice-config-btn";
    configBtn.textContent = "Config";
    configBtn.addEventListener("click", () => row.classList.toggle("open"));
    main.append(badge, select, configBtn);

    const summary = document.createElement("div");
    summary.className = "practice-map-summary";
    summary.textContent = practiceSummary(entry);

    const detail = document.createElement("div");
    detail.className = "practice-detail";
    const refreshSummary = () => { entry.config = normalizePracticeConfig(entry.config); summary.textContent = practiceSummary(entry); };

    const statGrid = document.createElement("div");
    statGrid.className = "practice-stat-grid";
    for (const stat of [
      { key: "hp", label: "Health", min: 1, max: 9999, step: 1 },
      { key: "speed", label: "Move speed", min: 0.25, max: 3, step: 0.05 },
      { key: "gravity", label: "Gravity", min: -120, max: 30, step: 1 }
    ]) {
      const label = document.createElement("label");
      label.textContent = stat.label;
      const inputEl = document.createElement("input");
      inputEl.type = "number";
      inputEl.min = String(stat.min);
      inputEl.max = String(stat.max);
      inputEl.step = String(stat.step);
      inputEl.value = String(entry.config[stat.key]);
      inputEl.addEventListener("input", () => { entry.config[stat.key] = clampNumber(inputEl.value, stat.min, stat.max, entry.config[stat.key]); refreshSummary(); });
      label.appendChild(inputEl);
      statGrid.appendChild(label);
    }
    detail.appendChild(statGrid);

    const weaponsTitle = document.createElement("div");
    weaponsTitle.className = "practice-map-summary";
    weaponsTitle.textContent = "Weapons";
    const weaponGrid = document.createElement("div");
    weaponGrid.className = "practice-check-grid";
    for (const id of selectableWeaponIds()) {
      const label = document.createElement("label");
      label.className = "practice-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = entry.config.weapons.includes(id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) entry.config.weapons.push(id);
        else entry.config.weapons = entry.config.weapons.filter((weapon) => weapon !== id);
        if (!entry.config.weapons.length) { checkbox.checked = true; entry.config.weapons.push(id); }
        refreshSummary();
      });
      label.append(checkbox, document.createTextNode(weaponLabelText(id)));
      weaponGrid.appendChild(label);
    }
    detail.append(weaponsTitle, weaponGrid);

    const abilitiesTitle = document.createElement("div");
    abilitiesTitle.className = "practice-map-summary";
    abilitiesTitle.textContent = "Abilities and keys";
    const abilityGrid = document.createElement("div");
    abilityGrid.className = "practice-check-grid practice-ability-grid";
    for (const ability of ABILITY_CHOICES) {
      const abilityRow = document.createElement("div");
      abilityRow.className = "practice-ability-row";
      const label = document.createElement("label");
      label.className = "practice-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = entry.config.abilities.includes(ability.id);
      const keySelect = document.createElement("select");
      for (const key of ABILITY_KEY_OPTIONS) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = keyLabel(key);
        keySelect.appendChild(opt);
      }
      keySelect.value = entry.config.abilityKeys[ability.id] || ability.defaultKey;
      keySelect.disabled = !checkbox.checked;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) entry.config.abilities.push(ability.id);
        else entry.config.abilities = entry.config.abilities.filter((id) => id !== ability.id);
        keySelect.disabled = !checkbox.checked;
        refreshSummary();
      });
      keySelect.addEventListener("change", () => { entry.config.abilityKeys[ability.id] = keySelect.value; refreshSummary(); });
      label.append(checkbox, document.createTextNode(ability.label));
      abilityRow.append(label, keySelect);
      abilityGrid.appendChild(abilityRow);
    }
    detail.append(abilitiesTitle, abilityGrid);

    row.append(main, summary, detail);
    practiceMapList.appendChild(row);
  }
}
function sanitizeFpsMatchConfig(config) {
  if (!config) return null;
  const mapCount = Math.max(1, Math.min(9, Math.floor(Number(config.mapCount || config.maps?.length || 1) || 1)));
  const roundsPerMap = Math.max(1, Math.min(99, Math.floor(Number(config.roundsPerMap || FPS_DEFAULT_ROUNDS_PER_MAP) || FPS_DEFAULT_ROUNDS_PER_MAP)));
  const maps = Array.from({ length: mapCount }, (_, index) => {
    const source = config.maps?.[index] || defaultPracticeMapEntry(index);
    const isCustom = source.mapValue === "custom" || source.customMapActive;
    const mapIndex = isCustom ? 0 : Math.max(0, Math.min(fpsArenaThemes.length - 1, Math.floor(Number(source.mapIndex ?? source.mapValue ?? index) || 0)));
    return {
      mapValue: isCustom ? "custom" : String(mapIndex),
      mapIndex,
      customMapActive: isCustom,
      customMap: isCustom ? (source.customMap || game.fpsCustomMap || null) : null,
      config: normalizePracticeConfig(source.config || rawConfigForMapValue(isCustom ? "custom" : String(mapIndex)))
    };
  });
  return { mode: "practice", mapCount, roundsPerMap, currentMapSlot: Math.max(0, Math.min(mapCount - 1, Math.floor(Number(config.currentMapSlot || 0) || 0))), maps };
}
function buildFpsMatchConfigFromUi() {
  const mapCount = ensurePracticeMapConfigCount(practiceMapCountInput?.value || 1);
  const roundsPerMap = Math.max(1, Math.min(99, Math.floor(Number(practiceRoundsInput?.value || FPS_DEFAULT_ROUNDS_PER_MAP) || FPS_DEFAULT_ROUNDS_PER_MAP)));
  return sanitizeFpsMatchConfig({ mapCount, roundsPerMap, currentMapSlot: 0, maps: practiceMapConfigs });
}
function selectCustomMapForPractice(slot = 0) {
  if (!game.fpsCustomMap) return;
  ensurePracticeMapConfigCount(practiceMapCountInput?.value || 1);
  const index = Math.max(0, Math.min(practiceMapConfigs.length - 1, Math.floor(Number(slot) || 0)));
  practiceMapConfigs[index] = {
    mapValue: "custom",
    mapIndex: 0,
    customMapActive: true,
    customMap: game.fpsCustomMap,
    config: normalizePracticeConfig(rawConfigForMapValue("custom"))
  };
  syncPracticeMapPlanner();
}
function applyFpsMatchMapSlot(slot = game.fpsMatchConfig?.currentMapSlot || 0) {
  const config = game.fpsMatchConfig;
  if (!config?.maps?.length) return;
  const nextSlot = Math.max(0, Math.min(config.maps.length - 1, Math.floor(Number(slot) || 0)));
  config.currentMapSlot = nextSlot;
  const entry = config.maps[nextSlot];
  if (entry.customMapActive || entry.mapValue === "custom") {
    if (entry.customMap) game.fpsCustomMap = entry.customMap;
    game.fpsCustomMapActive = Boolean(game.fpsCustomMap);
    game.fpsMapIndex = Number.isFinite(entry.mapIndex) ? entry.mapIndex : 0;
  } else {
    game.fpsCustomMapActive = false;
    game.fpsMapIndex = Math.max(0, Math.min(fpsArenaThemes.length - 1, Math.floor(Number(entry.mapIndex ?? entry.mapValue ?? 0) || 0)));
  }
}

Object.assign(globalThis, {
  populateMapSelects,
  addCustomMapOptionSelect,
  clampNumber,
  keyLabel,
  fpsMapDisplayName,
  selectableWeaponIds,
  rawConfigForMapValue,
  normalizePracticeConfig,
  defaultPracticeMapEntry,
  ensurePracticeMapConfigCount,
  populatePracticeSelect,
  practiceSummary,
  syncPracticeMapPlanner,
  sanitizeFpsMatchConfig,
  buildFpsMatchConfigFromUi,
  selectCustomMapForPractice,
  applyFpsMatchMapSlot
});
