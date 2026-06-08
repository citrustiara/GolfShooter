import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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

function resolveRelativeUrl(baseUrl, includePath) {
  return new URL(includePath, new URL(baseUrl, window.location.href)).href;
}

async function resolveJsonIncludes(value, baseUrl) {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveJsonIncludes(item, baseUrl)));
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value.$include)) {
    const chunks = await Promise.all(value.$include.map(async (includePath) => {
      const includeUrl = resolveRelativeUrl(baseUrl, includePath);
      const included = await loadJson(includeUrl);
      return resolveJsonIncludes(included, includeUrl);
    }));
    return chunks.flatMap((chunk) => Array.isArray(chunk) ? chunk : [chunk]);
  }
  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await resolveJsonIncludes(item, baseUrl)]));
  return Object.fromEntries(entries);
}

async function loadMapJson(url) {
  return resolveJsonIncludes(await loadJson(url), url);
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

async function loadManifestMaps(paths = [], normalizer = (value) => value) {
  const maps = await Promise.all(paths.map(async (path) => {
    try {
      return normalizer(await loadMapJson(`maps/${path}`));
    } catch (error) {
      console.warn(`Could not load map ${path}.`, error);
      return null;
    }
  }));
  return maps.filter(Boolean);
}

async function loadMapList(manifest) {
  const fpsMaps = await loadManifestMaps(manifest.fpsMaps || [], normalizeFpsMap);
  const golfMaps = await loadManifestMaps(manifest.golfMaps || [], normalizeGolfHole);
  if (fpsMaps.length) replaceArray(fpsArenaThemes, fpsMaps);
  if (golfMaps.length) replaceArray(holeCatalog, golfMaps);
}

async function loadWeaponContent() {
  const weaponConfig = await loadJson(WEAPON_CONFIG_URL);
  const loadoutConfig = await loadJson(LOADOUT_CONFIG_URL);
  
  const weapons = weaponConfig.weapons || {};
  const weaponIds = Object.keys(weapons);
  const gltfLoader = new GLTFLoader();
  
  await Promise.all(weaponIds.map(async (id) => {
    // 1. Try to load JSON model config first for metadata (like muzzle position)
    try {
      const modelData = await loadJson(`assets/weapons/models/${id}.json`);
      if (modelData) {
        if (modelData.parts) weapons[id].parts = modelData.parts;
        if (modelData.muzzle) weapons[id].muzzle = modelData.muzzle;
      }
    } catch (err) {
      // Non-fatal if JSON model doesn't exist
    }

    // 2. Try to load a GLB file only when the weapon explicitly declares one.
    // Most weapons use JSON part models; probing id.glb for all of them creates noisy 404s.
    if (weapons[id].glb) {
      try {
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(weapons[id].glb, resolve, undefined, reject);
        });
        if (gltf && gltf.scene) {
          weapons[id].glbModel = gltf.scene;
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          console.log(`Loaded GLB model for weapon: ${id}`);
        }
      } catch (err) {
        // Fallback: If GLB loading fails and we have no parts from JSON, log warning
        if (!weapons[id].parts) {
          console.warn(`Could not load GLB or JSON model for weapon ${id}:`, err);
        }
      }
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
      { id: "juggernaut", map: "fps/neon-depot.json", weapons: ["minigun", "melee"], hp: 999, abilities: [] },
      { id: "sunlit_rooftops_snipers", map: "fps/sunlit-rooftops.json", weapons: ["sniper", "heavySniper"], hp: 100, abilities: ["jump", "radar"] },
      { id: "needle_corridor_explosive", map: "fps/needle-corridor.json", weapons: ["rocket", "grenadeLauncher"], hp: 200, abilities: ["grenade", "smoke"] },
      { id: "skyhook_spires_vertical", map: "fps/skyhook-spires.json", weapons: ["ak47", "tacticalSniper", "melee"], hp: 120, abilities: ["jump", "grenade", "smoke", "radar"] },
      { id: "skyhook_spires_drum_showdown", map: "fps/skyhook-spires.json", weapons: ["drumShotgun", "pistol", "melee"], hp: 125, abilities: ["jump", "heal"] },
      { id: "phallic_palace_heaviest_sperm", map: "fps/phallic-palace.json", weapons: ["heaviestSpermShooter", "heavySpermShooter", "melee"], hp: 150, abilities: ["jetpack", "grenade", "smoke"] },
      { id: "phallic_palace_snipers", map: "fps/phallic-palace.json", weapons: ["heavySniper", "sniper"], hp: 100, abilities: ["jump", "radar"] },
      { id: "enclosed_arena_tactical_sniper", map: "fps/enclosed-arena.json", weapons: ["tacticalSniper", "melee"], hp: 100, abilities: [] },
      { id: "shaft_arena_tactical_sniper", map: "fps/shaft-arena.json", weapons: ["tacticalSniper", "desertEagle", "melee"], hp: 100, abilities: ["jump", "radar"] },
      { id: "overpass_compound_tactical", map: "fps/overpass-compound.json", weapons: ["ak47", "desertEagle", "melee"], hp: 100, abilities: ["grenade", "smoke"] },
      { id: "overpass_compound_sniper", map: "fps/overpass-compound.json", weapons: ["tacticalSniper", "pistol", "melee"], hp: 100, abilities: ["grenade", "smoke"] }
    ];
    replaceArray(tournamentCombinations, defaultCombinations);
  }
  return result;
}
