import "./globals.js";

// Top-down map preview for the custom lobby. JSON maps are drawn from their
// box/platform/ramp data; GLB maps use PNGs baked by scratch/gen-map-previews.cjs
// (both sides derive the image extent with the same previewHalfExtent formula).
const PREVIEW_SIZE = 900;
const previewImageCache = new Map();
let previewMapValue = null;

function previewHalfExtent(theme) {
  return Math.ceil(Math.max(theme?.bounds?.x || 42, theme?.bounds?.z || 42) * 1.15);
}

function resolvePreviewTheme(mapValue) {
  if (mapValue === "custom") return game.fpsCustomMap;
  const index = Math.max(0, Math.min(fpsArenaThemes.length - 1, Number(mapValue) || 0));
  return fpsArenaThemes[index];
}

function previewImage(id) {
  if (previewImageCache.has(id)) return previewImageCache.get(id);
  const entry = { img: new Image(), ready: false, failed: false };
  entry.img.onload = () => { entry.ready = true; if (previewMapValue != null) renderMapPreview(previewMapValue); };
  entry.img.onerror = () => { entry.failed = true; };
  entry.img.src = `assets/map-previews/${id}.png`;
  previewImageCache.set(id, entry);
  return entry;
}

function shadeForHeight(t) {
  const s = Math.round(52 + Math.max(0, Math.min(1, t)) * 168);
  return `rgb(${s},${s},${Math.round(s * 1.02)})`;
}

function drawRotatedRect(ctx, u, x, z, sx, sz, rot, fill, stroke) {
  ctx.save();
  ctx.translate(u(x), u(z));
  if (rot) ctx.rotate(rot);
  const w = sx * u.scale;
  const h = sz * u.scale;
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}

function drawJsonMapLayout(ctx, theme, u) {
  const floors = Array.isArray(theme.floors) && theme.floors.length
    ? theme.floors
    : [{ x: 0, z: 0, sx: (theme.bounds?.x || 42) * 2, sz: (theme.bounds?.z || 42) * 2 }];
  for (const floor of floors) {
    if (floor.type === "circle") {
      ctx.fillStyle = "#1c1c21";
      ctx.beginPath();
      ctx.arc(u(floor.x), u(floor.z), floor.r * u.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a3a42";
      ctx.stroke();
    } else {
      drawRotatedRect(ctx, u, floor.x || 0, floor.z || 0, floor.sx || 1, floor.sz || 1, 0, "#1c1c21", "#3a3a42");
    }
  }
  const blocks = [...(theme.boxes || []), ...(theme.platforms || [])];
  let maxTop = 1;
  for (const b of blocks) maxTop = Math.max(maxTop, Number(b.y || 0) + Number(b.sy || 0));
  const sorted = blocks.slice().sort((a, b) => (Number(a.y || 0) + Number(a.sy || 0)) - (Number(b.y || 0) + Number(b.sy || 0)));
  for (const b of sorted) {
    const top = Number(b.y || 0) + Number(b.sy || 0);
    drawRotatedRect(ctx, u, b.x || 0, b.z || 0, b.sx || 1, b.sz || 1, Number(b.rot ?? b.rotY ?? 0), shadeForHeight(top / maxTop), "rgba(10,10,12,0.8)");
  }
  for (const r of theme.ramps || []) {
    const sx = Number(r.sx ?? r.width ?? 2);
    const sz = Number(r.sz ?? r.length ?? 4);
    drawRotatedRect(ctx, u, r.x || 0, r.z || 0, sx, sz, Number(r.rot ?? r.rotY ?? 0), "rgba(154,154,163,0.45)", "rgba(240,239,233,0.5)");
  }
}

function drawSpawnMarkers(ctx, theme, u) {
  const spawns = Array.isArray(theme.spawnPoints) ? theme.spawnPoints : [];
  spawns.forEach((s, i) => {
    const x = u(s.x || 0);
    const z = u(s.z || 0);
    ctx.fillStyle = "#e10600";
    ctx.strokeStyle = "#f0efe9";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, z, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f0efe9";
    ctx.font = "700 15px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x, z + 1);
  });
}

function drawPreviewPlaceholder(ctx, label) {
  ctx.fillStyle = "#55555e";
  ctx.font = "700 34px 'Archivo Black', 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, PREVIEW_SIZE / 2, PREVIEW_SIZE / 2);
}

function renderMapPreview(mapValue) {
  const canvas = document.getElementById("mapPreviewCanvas");
  const nameEl = document.getElementById("mapPreviewName");
  if (!canvas) return;
  previewMapValue = mapValue;
  const ctx = canvas.getContext("2d");
  const theme = resolvePreviewTheme(mapValue);
  ctx.fillStyle = "#101013";
  ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  if (nameEl) {
    nameEl.textContent = mapValue === "custom"
      ? (game.fpsCustomMap?.name || "Custom Map")
      : (theme?.name || theme?.id || "Map");
  }
  if (!theme) {
    drawPreviewPlaceholder(ctx, "NO MAP DATA");
    return;
  }
  const R = previewHalfExtent(theme);
  const u = (v) => ((v + R) / (2 * R)) * PREVIEW_SIZE;
  u.scale = PREVIEW_SIZE / (2 * R);

  const hasJsonGeometry = (theme.boxes?.length || theme.platforms?.length || theme.ramps?.length);
  if (theme.glb && !hasJsonGeometry && theme.id && mapValue !== "custom") {
    const entry = previewImage(theme.id);
    if (entry.ready) ctx.drawImage(entry.img, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    else if (entry.failed) drawPreviewPlaceholder(ctx, "NO PREVIEW BAKED");
    else drawPreviewPlaceholder(ctx, "LOADING…");
  } else if (hasJsonGeometry) {
    drawJsonMapLayout(ctx, theme, u);
  } else {
    drawPreviewPlaceholder(ctx, theme.glb ? "CUSTOM 3D MAP" : "OPEN ARENA");
  }
  drawSpawnMarkers(ctx, theme, u);
}

Object.assign(globalThis, { renderMapPreview });
