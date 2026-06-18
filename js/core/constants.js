export const GOLF_AIM_SENSITIVITY = 0.0045;
export const GOLF_MAX_SHOT_SPEED = 44;
export const GOLF_GROUND_FRICTION = 0.986;
export const GOLF_ICE_FRICTION = 0.994;
export const CUP_PULL_RADIUS = 0.5;
export const CUP_PULL_FORCE = 1.8;
export const CUP_SINK_RADIUS = 0.34;
export const CUP_SINK_SPEED_MAX = 3.0;
export const CUP_SURFACE_Y = 0.19;
export const FPS_DAMAGE_PER_HIT = 20;
export const FPS_LASER_TTL = 0.2;
export const FPS_BASE_MOUSE_SENSITIVITY = 0.00088;
export const FPS_PLAYER_HIT_RADIUS = 1.32;
export const FPS_AIM_SENSITIVITY_MULTIPLIER = 0.72;
export const FPS_DEFAULT_FOV = 85;
export const FPS_AIM_FOV = 64;
export const FPS_SNIPER_AIM_FOV = 14;
export const FPS_HEAD_HIT_RADIUS = 0.66;
export const FPS_BODY_HIT_RADIUS = 1.11;
export const FPS_HEAD_VISUAL_HEIGHT = 1.66;
export const FPS_HEAD_HIT_HEIGHT = 1.70;
export const FPS_BODY_HIT_HEIGHT = 0.65;
export const FPS_SLIDE_VISUAL_DROP = 0.58;
export const GRENADE_COOLDOWN = 6.5;
export const GRENADE_SPEED = 43;
export const GRENADE_GRAVITY = -36;
export const GRENADE_SPLASH_RADIUS = 13.5;
export const GRENADE_MAX_DAMAGE = 145;
export const SMOKE_GRENADE_COOLDOWN = 12;
export const SMOKE_GRENADE_SPEED = 36;
export const SMOKE_GRENADE_RADIUS = 16.5;
export const SMOKE_GRENADE_DURATION = 10;
export const HOLES_PER_TOURNAMENT = 3;
export const FPS_COUNTDOWN_DURATION = 3;
export const WEAPON_SWAP_DURATION = 0.28;
export const FPS_MAPS_PER_DUEL = 3;
export const FPS_KILLS_TO_WIN_MAP = 2;
export const RADAR_DURATION = 2;
export const RADAR_COOLDOWN = 9;

export const weaponCatalog = {};
export const randomTournamentWeapons = [];
export const tournamentCombinations = [];

export const wordsA = ["lucky", "turbo", "velvet", "neon", "tidy", "brave", "moonlit", "crisp", "sunny", "spicy"];
export const wordsB = ["putter", "eagle", "fairway", "bogey", "driver", "caddie", "bunker", "birdie", "tee", "slice"];

// ---- FPS gameplay tuning (movement, abilities, grapple, screen effects) ----
export const FPS_PLAYER_RADIUS_WORLD = 0.42;
export const FPS_PLAYER_HEIGHT_WORLD = 1.78;
export const FPS_RAMP_PROBE_MARGIN = 0.08;
export const FPS_RAMP_LAND_EPSILON = 0.10;
export const FPS_RAMP_STEP_UP = 0.56;
export const FPS_RAMP_STEP_DOWN = 0.72;
export const FPS_RAMP_SOLID_TOP_CLEARANCE = 0.06;
export const FPS_WALK_MAX_SPEED = 13.6;
export const FPS_SLIDE_MAX_SPEED = 21.0;
export const FPS_DEFAULT_GRAVITY = -30;
export const FPS_DEFAULT_ROUNDS_PER_MAP = 3;
export const ABILITY_CHOICES = [
  { id: "jump", label: "Jump Boost", defaultKey: "KeyE" },
  { id: "heal", label: "Heal", defaultKey: "KeyQ" },
  { id: "grenade", label: "Grenade", defaultKey: "KeyG" },
  { id: "smoke", label: "Smoke", defaultKey: "KeyX" },
  { id: "radar", label: "Radar", defaultKey: "KeyC" },
  { id: "jetpack", label: "Jetpack", defaultKey: "Space" },
  { id: "dash", label: "Dash", defaultKey: "KeyV" },
  { id: "grapple", label: "Grapple Hook", defaultKey: "KeyF" }
];
export const DASH_COOLDOWN = 3.5;
export const DASH_DURATION = 0.4;
export const DASH_SPEED = 60;
export const GRAPPLE_COOLDOWN = 3.5;
export const GRAPPLE_RANGE = 95;
export const GRAPPLE_SPEED = 74;
export const GRAPPLE_HOLD_LIMIT = 1.5;
// Damage dealt when the grapple hook latches onto an enemy player.
export const GRAPPLE_PLAYER_DAMAGE = 5;
// Two-charge grapple: each charge recharges at GRAPPLE_COOLDOWN; once you have a
// charge the next one refills in the background, and consecutive throws are gated
// by a short gap so both hooks can be spent quickly but not on the same frame.
export const GRAPPLE_MAX_CHARGES = 2;
export const GRAPPLE_QUICK_GAP = 0.5;
// Aim-assist lock: aiming near an in-range enemy snaps the hook onto them for a
// guaranteed hit at reduced damage.
export const GRAPPLE_LOCK_DAMAGE = 5;
export const GRAPPLE_LOCK_CONE_DEG = 6;
export const PARRY_GUARD_DURATION = 3.0;
export const PARRY_GUARD_COOLDOWN = 3.0;
// Low-health screen state: desaturates the view and pulses a heartbeat, then
// fades out over a few seconds so it never lingers permanently.
export const LOW_HP_THRESHOLD = 0.3;
export const LOW_HP_EFFECT_DURATION = 5.0;
export const LOW_HP_HEARTBEAT_INTERVAL = 0.78;
// Kept just under the post-process shader's hard two-tone gate (0.72) so the
// low-health view reads as a strong desaturated gray rather than crushing to
// near-black silhouettes, which would make enemies hard to see.
export const LOW_HP_MAX_GRAY = 0.7;
// Green heal flash lifetime.
export const HEAL_EFFECT_DURATION = 1.6;
// Red damage hue: an edge-only vignette that holds, then eases out over a couple
// of seconds (driven by a timer) instead of a quick cheap flash.
export const DAMAGE_EFFECT_DURATION = 2.6;
// CS2-style scoreboard team colours (first five match the 3D player materials in
// fps/logic.js) and the per-round time limit before the HP tiebreak resolves it.
export const PLAYER_HUD_COLORS = ["#4aa3ff", "#ff6f61", "#ffd166", "#55b96f", "#e9e4d4", "#b06bff", "#ff5ca8", "#3ad0c0"];
export const ROUND_TIME_LIMIT = 300;
export const ABILITY_KEY_OPTIONS = ["KeyQ", "KeyE", "KeyF", "KeyG", "KeyC", "KeyV", "KeyX", "KeyZ", "Space", "ShiftLeft", "ControlLeft"];
