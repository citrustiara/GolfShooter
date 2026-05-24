# Features Plan for Golf Duel

## 1. Varied Golf Maps
- **Colors & Time of Day:** 
    - Implement a `skyColor` and `lightIntensity` property in the `holeCatalog`.
    - Update `setupLighting` and `scene.background` when loading a new hole.
    - Introduce "Night Mode" with glowing bumpers and "Sunset Mode" with long shadows.
- **Falling Penalty:**
    - Define a `deathZoneY` (e.g., -5).
    - In `updateGolf`, if `world.ball.position.y < deathZoneY`:
        - Reset ball to the position of the last shot.
        - Add 1 stroke penalty to `strokesThisHole`.
        - Stop ball movement.

## 2. FPS Map Enhancements
- **Map Editor:** 
    - Create a simple JSON-based map format.
    - Implement a "Build Mode" where players can place boxes/platforms using a 3D cursor.
    - Add a "Save/Load" feature to export/import map JSON.
- **3D Import:**
    - Use `THREE.GLTFLoader` to allow importing `.glb` or `.gltf` files from URLs.
    - Add an input field in the lobby to provide an asset URL.

## 3. Fixed FPS Bounds & Obstacles
- **Issue:** Obstacles outside close map bounds.
- **Fix:** 
    - Increase `bounds` in `fpsArenaThemes`.
    - Ensure all `box()` calls in `setupArena` check against the theme's bounds.
    - Add a "Kill Volume" or "Teleport Volume" outside the main arena to prevent players from lingering in out-of-bounds areas.

## 4. Grenade Interactions
- **Shoot Enemy Grenade:**
    - Add grenades to the `raycaster` targets in `fireHitscan`.
    - If hit and `grenade.owner !== game.localIndex`: `disposeGrenade(grenade)` and remove from `world.grenades`.
- **Shoot Own Grenade:**
    - If hit and `grenade.owner === game.localIndex`:
        - `grenade.isSupercharged = true`.
        - Change mesh color/emissive to a bright neon (e.g., Purple).
        - Multiplier: `grenade.damageMultiplier = 5`.
        - Multiplier: `grenade.radiusMultiplier = 2`.

## 5. Random Tournament Mode
- **Mode Logic:**
    - New phase `randomTournament`.
    - At the start of each round, the host chooses a random weapon ID from a new `weaponCatalog`.
    - Both players receive the same `primaryWeapon`.
- **New Weapons:**
    - `Sniper (Heavy)`: 1 ammo, 999 damage, 5s reload.
    - `Minigun`: 100 ammo, low damage, very high fire rate, movement speed penalty while firing.
    - `Shotgun`: 2 ammo, high spread, multiple rays per shot, short range.
    - `Rocket Launcher`: Projectile-based (like grenade but straight line), explode on impact.
    - `Grenade Launcher`: Faster grenades with shorter fuse.

## 6. Self-Damage
- **Logic:**
    - In `explodeGrenade`, remove the `if (target === game.localIndex)` check and check distance for BOTH players regardless of owner.
    - If `localPlayer.pos.distanceTo(explosionPos) < radius`, apply damage.

## 7. Collidable Plane
- **Issue:** Transparent flying plane has no collision.
- **Fix:**
    - Identify the plane mesh in `setupArena`.
    - Add the mesh to `world.obstacles` or a new `world.collidables` array used by the movement physics.
    - Ensure `raycaster` also targets it for shots.

## 8. Weapon Feedback
- **Traces:**
    - Increase laser thickness and add a glowing "bloom" effect using a slightly larger, transparent cylinder around the core trace.
    - Persist traces for a slightly longer duration (e.g., 0.2s) and add a fade-out animation.
- **Recoil:**
    - Implement a `visualRecoil` offset that displaces the weapon model and camera pitch slightly upwards when firing.
    - Add a recovery speed to bring the weapon and aim back to the original position.

## 9. Expanded Sound Effects
- **Movement:** Add sounds for `jumping`, `landing` (thud), and `sliding` (friction/hiss).
- **Golf:** Add a clear "clink" or "thwack" sound when hitting the ball, and a celebratory sound when the ball scores in the hole.
- **Implementation:** Expand the `playSound` function in `utils.js` to handle these new triggers using synthesized Web Audio or small encoded buffers.
