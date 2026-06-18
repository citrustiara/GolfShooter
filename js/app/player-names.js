import "./globals.js";

const PLAYER_NAME_MAX = 24;

function cleanPlayerName(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\u0000-\u001f\u007f<>`{}[\]\\|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PLAYER_NAME_MAX);
}

function fallbackPlayerName(index) {
  return fps.players[index]?.isPracticeBot ? `Bot ${index}` : `P${index + 1}`;
}

function ensurePlayerNames(count = game.playerCount) {
  const targetCount = Math.max(2, Math.floor(Number(count || 2) || 2));
  if (!Array.isArray(game.playerNames)) game.playerNames = [];
  while (game.playerNames.length < targetCount) game.playerNames.push("");
  if (game.playerNames.length > targetCount) game.playerNames.length = targetCount;
  for (let i = 0; i < targetCount; i++) {
    if (!cleanPlayerName(game.playerNames[i])) game.playerNames[i] = fallbackPlayerName(i);
    if (fps.players[i] && !cleanPlayerName(fps.players[i].nickname)) fps.players[i].nickname = game.playerNames[i];
  }
  return game.playerNames;
}

function setPlayerName(index, value) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) return "";
  ensurePlayerNames(Math.max(game.playerCount || 2, n + 1));
  const name = cleanPlayerName(value) || fallbackPlayerName(n);
  game.playerNames[n] = name;
  if (fps.players[n]) fps.players[n].nickname = name;
  updateScoreboard?.();
  return name;
}

function playerDisplayName(index, fallback = "WORLD") {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) return fallback;
  const playerName = cleanPlayerName(fps.players[n]?.nickname || game.playerNames?.[n]);
  return playerName || fallbackPlayerName(n);
}

function applyPlayerNames(names = []) {
  if (!Array.isArray(names)) return ensurePlayerNames();
  ensurePlayerNames(Math.max(game.playerCount || 2, names.length || 2));
  names.forEach((name, index) => setPlayerName(index, name));
  updateHud?.();
  return game.playerNames;
}

function syncLocalPlayerNameFromUi() {
  const fallback = fallbackPlayerName(game.localIndex || 0);
  const raw = cleanPlayerName(nicknameInput?.value) || cleanPlayerName(game.playerNames?.[game.localIndex]) || fallback;
  const name = setPlayerName(game.localIndex || 0, raw);
  if (nicknameInput && nicknameInput.value !== name) nicknameInput.value = name;
  try { localStorage.setItem("golfDuelNickname", name); } catch {}
  return name;
}

function playerNamesPayload() {
  syncLocalPlayerNameFromUi();
  return [...ensurePlayerNames(game.playerCount)];
}

function initializePlayerNamesUi() {
  let saved = "";
  try { saved = cleanPlayerName(localStorage.getItem("golfDuelNickname")); } catch {}
  if (nicknameInput && !cleanPlayerName(nicknameInput.value)) nicknameInput.value = saved || fallbackPlayerName(game.localIndex || 0);
  ensurePlayerNames(game.playerCount);
  syncLocalPlayerNameFromUi();
}

Object.assign(globalThis, {
  cleanPlayerName,
  fallbackPlayerName,
  ensurePlayerNames,
  setPlayerName,
  playerDisplayName,
  applyPlayerNames,
  syncLocalPlayerNameFromUi,
  playerNamesPayload,
  initializePlayerNamesUi
});
