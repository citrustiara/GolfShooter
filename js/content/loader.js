import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { weaponCatalog, randomTournamentWeapons, tournamentCombinations } from "../core/constants.js";
import { fpsArenaThemes } from "../fps/themes.js";
import { holeCatalog } from "../golf/catalog.js";

const MAP_MANIFEST_URL = "maps/manifest.json";
const WEAPON_CONFIG_URL = "assets/weapons/weapons.json";
const LOADOUT_CONFIG_URL = "assets/weapons/loadouts.json";

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function replaceArray(target, values) {
  target.splice(0, target.length, ...values);
}

function replaceObject(target, values) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, values);
}

function asVector3(value, fallback = { x: 0, y: 0, z: 0 }) {
  const v = value || fallback;
  return new THREE.Vector3(Number(v.x || 0), Number(v.y || 0), Number(v.z || 0));
}

function normalizeGolfHole(hole) {
  return {
    ...hole,
    start: asVector3(hole.start),
    cup: asVector3(hole.cup)
  };
}

function normalizeFpsMap(map) {
  return map.theme ? { ...map.theme, ...map } : map;
}

async function loadMapList(manifest) {
  const fpsMaps = await Promise.all((manifest.fpsMaps || []).map((path) => loadJson(`maps/${path}`)));
  const golfMaps = await Promise.all((manifest.golfMaps || []).map((path) => loadJson(`maps/${path}`)));
  replaceArray(fpsArenaThemes, fpsMaps.map(normalizeFpsMap));
  replaceArray(holeCatalog, golfMaps.map(normalizeGolfHole));
}

async function loadWeaponContent() {
  const weaponConfig = await loadJson(WEAPON_CONFIG_URL);
  const loadoutConfig = await loadJson(LOADOUT_CONFIG_URL);
  
  const weapons = weaponConfig.weapons || {};
  const weaponIds = Object.keys(weapons);
  await Promise.all(weaponIds.map(async (id) => {
    try {
      const modelData = await loadJson(`assets/weapons/models/${id}.json`);
      if (modelData) {
        if (modelData.parts) weapons[id].parts = modelData.parts;
        if (modelData.muzzle) weapons[id].muzzle = modelData.muzzle;
      }
    } catch (err) {
      console.warn(`Could not load model for weapon ${id}:`, err);
    }
  }));

  replaceObject(weaponCatalog, weapons);
  replaceArray(randomTournamentWeapons, weaponConfig.randomTournamentWeapons || []);
  return {
    standardWeaponIds: weaponConfig.standardWeapons || [],
    loadouts: loadoutConfig.loadouts || []
  };
}

export async function loadGameContent() {
  const result = { standardWeaponIds: [], loadouts: [] };
  try {
    await loadMapList(await loadJson(MAP_MANIFEST_URL));
  } catch (error) {
    console.warn("Could not load map manifest.", error);
  }
  try {
    Object.assign(result, await loadWeaponContent());
  } catch (error) {
    console.warn("Could not load weapon content.", error);
  }
  try {
    const comboManifest = await loadJson("assets/tournaments/manifest.json");
    const combos = await Promise.all((comboManifest.combinations || []).map(path => loadJson(path)));
    replaceArray(tournamentCombinations, combos);
  } catch (error) {
    console.warn("Could not load tournament combinations manifest, using default presets.", error);
    const defaultCombinations = [
      { id: "neon_depot_close_quarters", map: "fps/neon-depot.json", weapons: ["shotgun", "melee"], hp: 150, abilities: ["jump", "heal"] },
      { id: "sunlit_rooftops_snipers", map: "fps/sunlit-rooftops.json", weapons: ["sniper", "heavySniper"], hp: 100, abilities: ["jump", "radar"] },
      { id: "ember_foundry_laser_tag", map: "fps/ember-foundry.json", weapons: ["laser"], hp: 80, abilities: ["heal", "radar"] },
      { id: "needle_corridor_explosive", map: "fps/needle-corridor.json", weapons: ["rocket", "grenadeLauncher"], hp: 200, abilities: ["grenade"] },
      { id: "skyhook_spires_vertical", map: "fps/skyhook-spires.json", weapons: ["rifle", "pistol"], hp: 120, abilities: ["jump", "grenade", "radar"] }
    ];
    replaceArray(tournamentCombinations, defaultCombinations);
  }
  return result;
}
