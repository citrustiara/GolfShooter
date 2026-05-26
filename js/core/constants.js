export const GOLF_AIM_SENSITIVITY = 0.0045;
export const GOLF_MAX_SHOT_SPEED = 36;
export const GOLF_GROUND_FRICTION = 0.986;
export const GOLF_ICE_FRICTION = 0.9998;
export const CUP_PULL_RADIUS = 0.5;
export const CUP_PULL_FORCE = 1.8;
export const CUP_SINK_RADIUS = 0.34;
export const CUP_SINK_SPEED_MAX = 3.0;
export const CUP_SURFACE_Y = 0.19;
export const FPS_DAMAGE_PER_HIT = 20;
export const FPS_LASER_TTL = 0.2;
export const FPS_BASE_MOUSE_SENSITIVITY = 0.0022;
export const FPS_PLAYER_HIT_RADIUS = 0.88;
export const FPS_AIM_SENSITIVITY_MULTIPLIER = 0.72;
export const FPS_DEFAULT_FOV = 90;
export const FPS_AIM_FOV = 64;
export const FPS_SNIPER_AIM_FOV = 14;
export const FPS_HEAD_HIT_RADIUS = 0.36;
export const FPS_BODY_HIT_RADIUS = 0.74;
export const GRENADE_COOLDOWN = 6.5;
export const GRENADE_SPEED = 43;
export const GRENADE_GRAVITY = -36;
export const GRENADE_SPLASH_RADIUS = 13.5;
export const GRENADE_MAX_DAMAGE = 145;
export const HOLES_PER_TOURNAMENT = 3;
export const FPS_COUNTDOWN_DURATION = 3;
export const WEAPON_SWAP_DURATION = 0.28;
export const FPS_MAPS_PER_DUEL = 3;
export const FPS_KILLS_TO_WIN_MAP = 2;
export const RADAR_DURATION = 2;
export const RADAR_COOLDOWN = 9;

export const weaponCatalog = {
  pistol: { label: "Pistol", ammo: 7, damage: 34, crit: 2, reload: 1.0, fireDelay: 160, range: 150, spread: 0.015, moveScale: 1.08 },
  rifle: { label: "Rifle", ammo: 25, damage: 10, crit: 2, reload: 1.4, fireDelay: 80, range: 150, spread: 0.04, aimSpread: 0.002, moveScale: 1.0 },
  sniper: { label: "Sniper", ammo: 5, damage: 65, crit: 2, reload: 1.8, fireDelay: 1000, range: 180, spread: 0.10, aimFov: FPS_SNIPER_AIM_FOV, moveScale: 0.88 },
  heavySniper: { label: "Heavy Sniper", ammo: 1, damage: 999, crit: 1, reload: 5.0, fireDelay: 1300, range: 220, spread: 0.05, aimFov: FPS_SNIPER_AIM_FOV, moveScale: 0.72 },
  minigun: { label: "Minigun", ammo: 100, damage: 5, crit: 1.5, reload: 3.2, fireDelay: 35, range: 120, spread: 0.065, aimSpread: 0.038, moveScale: 0.68, movePenalty: 0.62 },
  shotgun: { label: "Shotgun", ammo: 2, damage: 18, crit: 1.4, reload: 1.7, fireDelay: 720, range: 46, pellets: 8, spread: 0.16, moveScale: 1.12 },
  rocket: { label: "Rocket Launcher", ammo: 1, damage: 165, crit: 1, reload: 3.0, fireDelay: 900, projectile: "rocket", moveScale: 0.82 },
  grenadeLauncher: { label: "Grenade Launcher", ammo: 3, damage: 125, crit: 1, reload: 2.4, fireDelay: 850, projectile: "grenadeLauncher", moveScale: 0.92 },
  laser: { label: "Laser", ammo: 999, damage: 2, crit: 2, reload: 1.4, fireDelay: 25, range: 150, spread: 0.02, aimSpread: 0.001, moveScale: 1.0 }
};

export const randomTournamentWeapons = ["heavySniper", "minigun", "shotgun", "rocket", "grenadeLauncher", "melee", "laser"];

export const wordsA = ["lucky", "turbo", "velvet", "neon", "tidy", "brave", "moonlit", "crisp", "sunny", "spicy"];
export const wordsB = ["putter", "eagle", "fairway", "bogey", "driver", "caddie", "bunker", "birdie", "tee", "slice"];
