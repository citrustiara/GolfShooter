# FPS JSON Map Detail Guide

Use this when turning a simple obstacle arena into a tactical FPS map.

## Main goals

- Make the level feel like a real place, not a square floor with random blockers.
- Use buildings, storefronts, walls, alleys, plazas, roads, cars, signs, trees, and lighting details.
- Block direct spawn-to-mid sightlines. The middle park/plaza should require movement to see.
- Keep every route walkable. Detail is good, but stuck spots and fake paths are bad.

## Geometry rules

- Use `boxes` for real collision: buildings, walls, cars, major cover.
- Use `decor` for visual detail: windows, road paint, signs, lamps, awnings, vents, small props.
- Avoid `decor.collidable` unless the prop is intentionally cover.
- It is okay to delete old obstacles if they hurt the map. Do not preserve old walls/hangars just because they already exist.
- If a building/hangar should be enterable, build it from separate wall pieces and leave clear door gaps. Do not use one solid core box.

## Layout rules

- Add a town perimeter or reduce `floors`/`bounds` so players cannot walk outside the city into empty space.
- Main streets should usually be 8-12 units wide.
- Small alleys should usually be 4-6 units wide.
- Doorways/gaps should be at least 4 units wide.
- Avoid accidental gaps under 3 units; they look passable but often feel blocked.
- Keep spawn points clear and give them at least two exits.
- Use staggered buildings/chicanes to break long sightlines instead of placing one thin wall in the open.

## Detail ideas

- Ground texture: thin `decor` strips for asphalt, sidewalks, curbs, crosswalks, lane markings, plaza paving, grass patches.
- Building detail: roofs, parapets, trim, windows, shop signs, awnings, HVAC units, vents, pipes.
- Street detail: parked cars, planters, benches, bollards, lamps, trees.
- Use more color than plain gray: brick, tan concrete, dark roofs, blue/warm windows, red/blue/yellow cars/signs.
- Keep small clutter mostly non-collidable so lanes stay smooth.

## Quick checklist before finishing

- [ ] Can every spawn reach every main route?
- [ ] Is mid hidden from every spawn?
- [ ] Are there no empty outer areas outside the town?
- [ ] Are alleys and doors wide enough?
- [ ] Are visual details mostly non-collidable?
- [ ] Are old blockers removed if they make the map worse?
- [ ] Is the sky/fog bright enough for readability?
- [ ] Does the map look like a place with streets/buildings, not a box arena?
