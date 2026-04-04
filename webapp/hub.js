/**
 * Меню выбора ежедневных игр.
 * При каждом открытии мини-приложения показываем меню (hash/localStorage не восстанавливаем —
 * в TG WebView #wordle и last route часто «залипают» и пропускали меню).
 */
const HUB_ROUTE_KEY = "fiveletters:hub:route";

function $(id) {
  return document.getElementById(id);
}

function hubTodayDate() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    const d = parts.find(p => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch { /* fallback */ }
  return new Date().toISOString().slice(0, 10);
}

function gameStatus(game) {
  try {
    const today = hubTodayDate();
    if (game === "wordle") {
      const raw = localStorage.getItem("fiveletters:webapp:v2");
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.gameDate !== today) return null;
      if (s.won) return "won";
      if (s.finished) return "lost";
      return "in_progress";
    }
    if (game === "associations") {
      const raw = localStorage.getItem(`fiveletters:associations:v2:${today}`);
      if (!raw) return null;
      return JSON.parse(raw).status || null;
    }
    if (game === "cryptogram") {
      const raw = localStorage.getItem(`fiveletters:cryptogram:v1:${today}`);
      if (!raw) return null;
      return JSON.parse(raw).status || null;
    }
  } catch { /* ignore */ }
  return null;
}

function statusLabel(status) {
  if (status === "won") return { text: "Пройдено", cls: "hub-card-status--won" };
  if (status === "lost") return { text: "Не угадано", cls: "hub-card-status--lost" };
  if (status === "in_progress") return { text: "В процессе", cls: "hub-card-status--progress" };
  return null;
}

function refreshHubStatuses() {
  document.querySelectorAll(".hub-card[data-game]").forEach(card => {
    const game = (card.getAttribute("data-game") || "").trim();
    if (game === "soon") return;
    let badge = card.querySelector(".hub-card-status");
    const info = statusLabel(gameStatus(game));
    if (!info) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "hub-card-status";
      card.appendChild(badge);
    }
    badge.className = "hub-card-status " + info.cls;
    badge.textContent = info.text;
  });
}

function hideGameViews() {
  $("viewWordle")?.classList.add("hidden");
  $("viewAssociations")?.classList.add("hidden");
  $("viewCryptogram")?.classList.add("hidden");
}

function stripHashFromUrl() {
  try {
    const u = `${location.pathname}${location.search}`;
    history.replaceState(null, "", u || "./");
  } catch {
    /* ignore */
  }
}

function showHub() {
  $("viewHub")?.classList.remove("hidden");
  hideGameViews();
  document.title = "Игры дня";
  stripHashFromUrl();
  localStorage.removeItem(HUB_ROUTE_KEY);
  refreshHubStatuses();
}

function showWordle() {
  $("viewHub")?.classList.add("hidden");
  hideGameViews();
  $("viewWordle")?.classList.remove("hidden");
  document.title = "5 букв";
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#wordle`);
  } catch {
    /* ignore */
  }
  localStorage.setItem(HUB_ROUTE_KEY, "wordle");
  if (typeof window.startWordle === "function") {
    window.startWordle();
  }
}

function showAssociations() {
  $("viewHub")?.classList.add("hidden");
  hideGameViews();
  $("viewAssociations")?.classList.remove("hidden");
  document.title = "Ассоциации";
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#associations`);
  } catch {
    /* ignore */
  }
  localStorage.setItem(HUB_ROUTE_KEY, "associations");
  if (typeof window.startAssociations === "function") {
    window.startAssociations();
  }
}

function showCryptogram() {
  $("viewHub")?.classList.add("hidden");
  hideGameViews();
  $("viewCryptogram")?.classList.remove("hidden");
  document.title = "Криптограмма";
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#cryptogram`);
  } catch {
    /* ignore */
  }
  localStorage.setItem(HUB_ROUTE_KEY, "cryptogram");
  if (typeof window.startCryptogram === "function") {
    void Promise.resolve(window.startCryptogram()).catch((err) => console.error(err));
  }
}

window.showCryptogram = showCryptogram;



function soonMessage() {
  return "Эта игра в разработке.";
}

function onSoonClick() {
  const tg = window.Telegram?.WebApp;
  const msg = soonMessage();
  if (tg?.showAlert) {
    tg.showAlert(msg);
    return;
  }
  window.alert(msg);
}

function initHub() {
  document.querySelectorAll(".js-back-to-hub").forEach((el) => {
    el.addEventListener("click", showHub);
  });
  window.showGamesHub = showHub;

  const hubRoot = $("viewHub");
  hubRoot?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const card = t.closest(".hub-card[data-game]");
    if (!card || !hubRoot.contains(card)) return;
    const game = (card.getAttribute("data-game") || "").trim();
    if (game === "wordle") {
      showWordle();
      return;
    }
    if (game === "associations") {
      showAssociations();
      return;
    }
    if (game === "cryptogram") {
      showCryptogram();
      return;
    }
    if (game === "soon") {
      onSoonClick();
    }
  });

  try {
    const params = new URLSearchParams(location.search);
    if (params.get("menu") === "1") {
      params.delete("menu");
      const qs = params.toString();
      history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
    }
  } catch {
    /* ignore */
  }

  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
  showHub();
}

function expandTelegram() {
  const w = window.Telegram?.WebApp;
  if (!w) return;
  try {
    w.ready();
    w.expand();
  } catch {
    /* ignore */
  }
  try {
    if (typeof w.requestFullscreen === "function") {
      w.requestFullscreen();
    }
  } catch {
    /* ignore */
  }
}

expandTelegram();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHub);
} else {
  initHub();
}

/** Криптограмма (встроена в hub.js — один запрос, без отдельного cryptogram.js). */
(function cryptogramModule() {
/**
 * Криптограмма: фраза дня, буквы заменены числами. Данные: cryptograms.json.
 *
 * ?date=YYYY-MM-DD     — игровой день
 * ?crypto_reset=1      — сброс прогресса на выбранную дату
 * ?test=1              — панель отладки / «заново»
 */
const MAX_MISTAKES = 3;
const STORAGE_PREFIX = "fiveletters:cryptogram:v1";

/** Если fetch к cryptograms.json не удался (офлайн, 404), игра всё равно открывается. */
const FALLBACK_PHRASES = [
  { id: "fallback_01", category: "proverbs", text: "без труда не вытащишь и рыбку из пруда" },
];

const RU_KB_ROWS = [
  "йцукенгшщзх".split(""),
  "фывапролджэ".split(""),
  "ячсмитьбюъ".split(""),
];

function storageKey(playDate) {
  return `${STORAGE_PREFIX}:${playDate}`;
}


function normalizeLetter(ch) {
  const c = ch.toLowerCase();
  return c === "ё" ? "е" : c;
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** Календарный день в Europe/Moscow (игровой день по ТЗ). format() в Safari иногда даёт не ISO — берём parts. */
function moscowDateIso() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* ignore */
  }
  return todayIsoUtc();
}

function resolvePlayDate() {
  try {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const t = Date.parse(`${q}T12:00:00`);
      if (!Number.isNaN(t)) return q;
    }
  } catch {
    /* ignore */
  }
  return moscowDateIso();
}

function formatRuDate(iso) {
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function seedFromDate(iso) {
  let h = 0;
  for (let i = 0; i < iso.length; i += 1) {
    h = (Math.imul(31, h) + iso.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function seedForPhrase(isoDate, phraseId) {
  let h = seedFromDate(isoDate);
  for (let i = 0; i < phraseId.length; i += 1) {
    h = (Math.imul(31, h) + phraseId.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seed) {
  const rng = mulberry32(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildLetterLayout(text) {
  const letters = [];
  const cells = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === " ") {
      cells.push({ kind: "space" });
    } else {
      const li = letters.length;
      letters.push(c);
      cells.push({ kind: "letter", li });
    }
  }
  return { letters, cells };
}

function assignCodes(letters, seed) {
  const ordered = [];
  const seen = new Set();
  for (const ch of letters) {
    if (!seen.has(ch)) {
      seen.add(ch);
      ordered.push(ch);
    }
  }
  const n = ordered.length;
  const nums = Array.from({ length: n }, (_, i) => i + 1);
  const shuffled = shuffleWithSeed(nums, seed);
  /** @type {Record<string, number>} */
  const letterToCode = {};
  /** @type {Record<number, string>} */
  const codeToLetter = {};
  ordered.forEach((ch, i) => {
    const code = shuffled[i];
    letterToCode[ch] = code;
    codeToLetter[code] = ch;
  });
  return { letterToCode, codeToLetter, ordered };
}

function letterFrequencies(letters) {
  /** @type {Record<string, number>} */
  const freq = {};
  for (const ch of letters) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  return freq;
}

/**
 * Открываем все клетки выбранных букв. Хотя бы один тип букв остаётся полностью скрытым (если в фразе ≥2 разных букв).
 * Добираем типы по частоте, пока не наберём достаточно открытых клеток — иначе старт с 1–2 буквами неиграбелен.
 */
function computeHintIndices(letters, seed) {
  const n = letters.length;
  const uniqueList = [...new Set(letters)];
  const nU = uniqueList.length;
  if (nU <= 1) {
    return new Set();
  }
  const freq = letterFrequencies(letters);
  const maxHintTypes = nU - 1;
  const minTypes = Math.min(maxHintTypes, Math.max(2, Math.ceil(nU * 0.32)));
  const minPositions = Math.min(n, Math.max(6, Math.ceil(n * 0.26)));

  const tieBreak = shuffleWithSeed([...uniqueList], seed ^ 0x3c6ef372);
  const rank = new Map(tieBreak.map((ch, i) => [ch, i]));
  const orderedByFreq = [...uniqueList].sort((a, b) => {
    const df = freq[b] - freq[a];
    if (df !== 0) return df;
    return (rank.get(a) || 0) - (rank.get(b) || 0);
  });

  const hintLetters = new Set();
  let covered = 0;

  for (const ch of orderedByFreq) {
    if (hintLetters.size >= maxHintTypes) break;
    hintLetters.add(ch);
    covered += freq[ch];
    if (covered >= minPositions && hintLetters.size >= minTypes) break;
  }

  while (hintLetters.size < minTypes && hintLetters.size < maxHintTypes) {
    const next = orderedByFreq.find((c) => !hintLetters.has(c));
    if (!next) break;
    hintLetters.add(next);
    covered += freq[next];
  }

  let guard = 0;
  while (covered < minPositions && hintLetters.size < maxHintTypes && guard < nU) {
    guard += 1;
    const next = orderedByFreq.find((c) => !hintLetters.has(c));
    if (!next) break;
    hintLetters.add(next);
    covered += freq[next];
  }

  const hints = new Set();
  for (let li = 0; li < letters.length; li += 1) {
    if (hintLetters.has(letters[li])) hints.add(li);
  }
  return hints;
}

/**
 * @param {{ id: string, text: string }} phraseEntry
 * @param {string} gameDate
 */
function buildPuzzle(phraseEntry, gameDate) {
  const text = phraseEntry.text;
  const seed = seedForPhrase(gameDate, phraseEntry.id);
  const { letters, cells } = buildLetterLayout(text);
  const { letterToCode, codeToLetter } = assignCodes(letters, seed);

  const hints = computeHintIndices(letters, seed ^ 0x9e3779b9);

  return {
    phraseId: phraseEntry.id,
    text,
    letters,
    cells,
    letterToCode,
    codeToLetter,
    hints,
  };
}

/** Коды, где есть хотя бы одна неподсказанная клетка — нужен ввод пользователя. */
function codesNeedingInput(puzzle) {
  const codes = new Set();
  for (let li = 0; li < puzzle.letters.length; li += 1) {
    if (puzzle.hints.has(li)) continue;
    const ch = puzzle.letters[li];
    codes.add(puzzle.letterToCode[ch]);
  }
  return codes;
}

/** Если для кода есть подсказка — её буква (нельзя стереть «в ноль»). */
function hintLetterForCode(puzzle, code) {
  for (let li = 0; li < puzzle.letters.length; li += 1) {
    if (!puzzle.hints.has(li)) continue;
    const ch = puzzle.letters[li];
    if (puzzle.letterToCode[ch] === code) return ch;
  }
  return null;
}

function isWinning(puzzle, guessesByCode) {
  for (const code of codesNeedingInput(puzzle)) {
    const g = guessesByCode[String(code)] || "";
    if (g !== puzzle.codeToLetter[code]) return false;
  }
  return true;
}

function applyCryptoResetFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const want = params.get("crypto_reset") === "1" || params.get("reset_crypto") === "1";
    if (!want) return;
    const playDate = resolvePlayDate();
    localStorage.removeItem(storageKey(playDate));
    params.delete("crypto_reset");
    params.delete("reset_crypto");
    const qs = params.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: "no-store" }).finally(() => {
    clearTimeout(t);
  });
}

async function loadPhrasesCatalog() {
  const candidates = ["./cryptograms.json", "../cryptogram/cryptograms.json", "/webapp/cryptograms.json"];
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.phrases) && data.phrases.length) {
        const cleaned = data.phrases.filter(
          (p) => p && typeof p.text === "string" && p.text.replace(/\s+/g, " ").trim().length > 0,
        );
        if (cleaned.length) return cleaned;
      }
    } catch {
      /* next */
    }
  }
  return FALLBACK_PHRASES;
}

function pickPhraseForDate(phrases, isoDate) {
  if (!phrases.length) return null;
  const idx = seedFromDate(isoDate) % phrases.length;
  return phrases[idx];
}

function loadProgress(playDate) {
  try {
    const raw = localStorage.getItem(storageKey(playDate));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function saveProgress(state) {
  if (!state) return;
  localStorage.setItem(storageKey(state.gameDate), JSON.stringify(state));
}

function haptic(kind) {
  const tg = window.Telegram?.WebApp;
  if (!tg?.HapticFeedback) return;
  if (kind === "error") tg.HapticFeedback.notificationOccurred("error");
  else if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
  else tg.HapticFeedback.impactOccurred("light");
}

const cryptoLeadEl = $("cryptoMistakes");
const cryptoStatusEl = $("cryptoStatus");
const cryptoKeyboardEl = $("cryptoKeyboard");
const cryptoCheckBtn = $("cryptoCheckBtn");
const cryptoEraseBtn = $("cryptoEraseBtn");
const cryptoPrevBtn = $("cryptoPrevBtn");
const cryptoNextBtn = $("cryptoNextBtn");
const cryptoDebugLine = $("cryptoDebugLine");
const cryptoTestControls = $("cryptoTestControls");
const cryptoRestartBtn = $("cryptoRestartBtn");
const cryptoHiddenInput = $("cryptoHiddenInput");

/** @type {ReturnType<typeof buildPuzzle> | null} */
let cryptoPuzzle = null;
/** @type {{
 *   gameDate: string,
 *   phraseId: string,
 *   guessesByCode: Record<string, string>,
 *   filledCells: Record<string, boolean>,
 *   mistakes: number,
 *   status: "in_progress" | "won" | "lost",
 *   focusEditableIdx: number
} | null} */
let cryptoState = null;

/** Индексы букв (в letters), куда можно вводить */
function editableLetterIndices(puzzle) {
  const out = [];
  for (let li = 0; li < puzzle.letters.length; li += 1) {
    if (!puzzle.hints.has(li)) out.push(li);
  }
  return out;
}

function initGuessesFromHints(puzzle) {
  const g = {};
  for (let li = 0; li < puzzle.letters.length; li += 1) {
    if (!puzzle.hints.has(li)) continue;
    const ch = puzzle.letters[li];
    const code = puzzle.letterToCode[ch];
    g[String(code)] = ch;
  }
  return g;
}

function setupState(playDate, puzzle, saved) {
  if (saved && saved.phraseId === puzzle.phraseId && saved.gameDate === playDate) {
    let fc = saved.filledCells || {};
    if (!saved.filledCells && saved.guessesByCode) {
      fc = {};
      for (let li = 0; li < puzzle.letters.length; li += 1) {
        if (puzzle.hints.has(li)) continue;
        const ch = puzzle.letters[li];
        const code = puzzle.letterToCode[ch];
        if (saved.guessesByCode[String(code)] === ch) fc[String(li)] = true;
      }
    }
    cryptoState = {
      gameDate: playDate,
      phraseId: puzzle.phraseId,
      guessesByCode: {},
      filledCells: fc,
      mistakes: saved.mistakes || 0,
      status: saved.status === "won" || saved.status === "lost" ? saved.status : "in_progress",
      focusEditableIdx: saved.focusEditableIdx || 0,
    };
  } else {
    cryptoState = {
      gameDate: playDate,
      phraseId: puzzle.phraseId,
      guessesByCode: {},
      filledCells: {},
      mistakes: 0,
      status: "in_progress",
      focusEditableIdx: 0,
    };
  }
  const editable = editableLetterIndices(puzzle);
  if (editable.length && cryptoState.focusEditableIdx >= editable.length) {
    cryptoState.focusEditableIdx = 0;
  }
  saveProgress(cryptoState);
}

function currentFocusLi() {
  if (!cryptoPuzzle || !cryptoState) return -1;
  const ed = editableLetterIndices(cryptoPuzzle);
  if (!ed.length) return -1;
  return ed[Math.min(cryptoState.focusEditableIdx, ed.length - 1)];
}

function advanceFocusToNextUnsolved() {
  if (!cryptoPuzzle || !cryptoState) return;
  const ed = editableLetterIndices(cryptoPuzzle);
  const cur = cryptoState.focusEditableIdx;
  for (let step = 1; step <= ed.length; step += 1) {
    const idx = (cur + step) % ed.length;
    const li = ed[idx];
    if (!cryptoState.filledCells[String(li)]) {
      cryptoState.focusEditableIdx = idx;
      return;
    }
  }
}

function flashCell(li, type) {
  const el = document.querySelector(`.crypto-cell[data-li="${li}"]`);
  if (!el) return;
  const cls = type === "ok" ? "crypto-cell--flash-ok" : "crypto-cell--flash-err";
  el.classList.add(cls);
  if (type === "ok") {
    const charEl = el.querySelector(".crypto-cell-char");
    if (charEl) charEl.textContent = cryptoPuzzle.letters[li].toUpperCase();
  }
  setTimeout(() => {
    el.classList.remove(cls);
    if (type === "err") renderCrypto();
  }, 700);
}

function setGuessForFocus(letter) {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const li = currentFocusLi();
  if (li < 0) return;
  const ch = cryptoPuzzle.letters[li];

  if (letter === ch) {
    cryptoState.filledCells[String(li)] = true;
    haptic("light");
    advanceFocusToNextUnsolved();
    saveProgress(cryptoState);
    renderCrypto();
    flashCell(li, "ok");
    maybeAutoWin();
  } else {
    cryptoState.mistakes += 1;
    haptic("error");
    if (cryptoState.mistakes >= MAX_MISTAKES) {
      cryptoState.status = "lost";
      saveProgress(cryptoState);
      renderCrypto();
    } else {
      saveProgress(cryptoState);
      renderCrypto();
      flashCell(li, "err");
    }
  }
}

function maybeAutoWin() {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const ed = editableLetterIndices(cryptoPuzzle);
  const allFilled = ed.every((li) => cryptoState.filledCells[String(li)]);
  if (allFilled) {
    cryptoState.status = "won";
    saveProgress(cryptoState);
    renderCrypto();
    haptic("success");
  }
}

function onCheck() {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const ed = editableLetterIndices(cryptoPuzzle);
  const filled = ed.filter((li) => cryptoState.filledCells[String(li)]).length;
  if (cryptoStatusEl) {
    cryptoStatusEl.textContent = filled >= ed.length
      ? "Все буквы на месте!"
      : `Разгадано ${filled} из ${ed.length} букв.`;
  }
  haptic("light");
}

function onErase() {
  // no-op: only correct letters are accepted, no need to erase
}

function moveFocus(delta) {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const ed = editableLetterIndices(cryptoPuzzle);
  if (!ed.length) return;
  let idx = ed.indexOf(currentFocusLi());
  if (idx < 0) idx = 0;
  for (let step = 0; step < ed.length; step += 1) {
    idx = (idx + delta + ed.length) % ed.length;
    const li = ed[idx];
    if (!cryptoState.filledCells[String(li)]) break;
  }
  cryptoState.focusEditableIdx = idx;
  saveProgress(cryptoState);
  renderCrypto();
}

function showCryptoTestUi() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.has("date") || p.get("test") === "1";
  } catch {
    return false;
  }
}

function updateCryptoDebugUi(playDate) {
  if (cryptoDebugLine) {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("date")) {
        cryptoDebugLine.classList.remove("hidden");
        cryptoDebugLine.textContent = `Тест: задание на ${formatRuDate(playDate)}. Сброс: &crypto_reset=1`;
      } else {
        cryptoDebugLine.classList.add("hidden");
        cryptoDebugLine.textContent = "";
      }
    } catch {
      /* ignore */
    }
  }
  if (cryptoTestControls) {
    if (showCryptoTestUi()) cryptoTestControls.classList.remove("hidden");
    else cryptoTestControls.classList.add("hidden");
  }
}

function renderCrypto() {
  const fieldEl = document.getElementById("cryptoField");
  if (!cryptoPuzzle || !cryptoState || !fieldEl) return;

  try {
  if (cryptoLeadEl) {
    cryptoLeadEl.textContent = `Ошибки: ${cryptoState.mistakes}/${MAX_MISTAKES} · ${formatRuDate(cryptoState.gameDate)}`;
  }

  if (cryptoState.status === "won") {
    if (cryptoStatusEl) cryptoStatusEl.textContent = "Разгадано!";
  } else if (cryptoState.status === "lost") {
    if (cryptoStatusEl) {
      cryptoStatusEl.textContent = `Лимит ошибок. Ответ: ${cryptoPuzzle.text}`;
    }
  }

  const focusLi = currentFocusLi();
  fieldEl.innerHTML = "";

  /** Рендер по cells — тот же порядок, что в buildLetterLayout (без split по словам, ломается на iOS/WebKit). */
  let wordEl = document.createElement("div");
  wordEl.className = "crypto-word";

  function flushWord() {
    if (wordEl.childNodes.length > 0) {
      fieldEl.appendChild(wordEl);
    }
    wordEl = document.createElement("div");
    wordEl.className = "crypto-word";
  }

  const codeFullyFilled = {};
  for (const ch of new Set(cryptoPuzzle.letters)) {
    const code = cryptoPuzzle.letterToCode[ch];
    if (codeFullyFilled[code] === false) continue;
    codeFullyFilled[code] = true;
    for (let i = 0; i < cryptoPuzzle.letters.length; i += 1) {
      if (cryptoPuzzle.letters[i] !== ch) continue;
      if (!cryptoPuzzle.hints.has(i) && !cryptoState.filledCells[String(i)]) {
        codeFullyFilled[code] = false;
        break;
      }
    }
  }

  for (const c of cryptoPuzzle.cells) {
    if (c.kind === "space") {
      flushWord();
      continue;
    }
    const li = c.li;
    const ch = cryptoPuzzle.letters[li];
    const code = cryptoPuzzle.letterToCode[ch];
    const isHint = cryptoPuzzle.hints.has(li);
    const isFilled = !!cryptoState.filledCells[String(li)];
    const showLetter = isHint || isFilled;
    const editable = !isHint && !isFilled && cryptoState.status === "in_progress";
    const isFocus = editable && li === focusLi;
    const hideNum = codeFullyFilled[code];

    const cell = document.createElement("button");
    cell.type = "button";
    let cls = "crypto-cell";
    if (isFocus) cls += " crypto-cell--focus";
    if (isHint) cls += " crypto-cell--hint";
    if (isFilled) cls += " crypto-cell--solved";
    cell.className = cls;
    cell.disabled = !editable;
    cell.dataset.li = String(li);

    const charSpan = document.createElement("span");
    charSpan.className = "crypto-cell-char";
    charSpan.textContent = showLetter ? ch.toUpperCase() : " ";
    const numSpan = document.createElement("span");
    numSpan.className = "crypto-cell-num";
    numSpan.textContent = hideNum ? "" : String(code);

    cell.appendChild(charSpan);
    cell.appendChild(numSpan);

    if (editable) {
      cell.addEventListener("click", () => {
        const ed = editableLetterIndices(cryptoPuzzle);
        const pos = ed.indexOf(li);
        if (pos >= 0) {
          cryptoState.focusEditableIdx = pos;
          saveProgress(cryptoState);
          renderCrypto();
        }
      });
    }

    wordEl.appendChild(cell);
  }
  flushWord();

  if (cryptoCheckBtn) cryptoCheckBtn.disabled = cryptoState.status !== "in_progress";
  if (cryptoEraseBtn) cryptoEraseBtn.disabled = cryptoState.status !== "in_progress";
  if (cryptoPrevBtn) cryptoPrevBtn.disabled = cryptoState.status !== "in_progress";
  if (cryptoNextBtn) cryptoNextBtn.disabled = cryptoState.status !== "in_progress";

  if (cryptoKeyboardEl && cryptoState.status === "in_progress") {
    cryptoKeyboardEl.innerHTML = "";
    RU_KB_ROWS.forEach((letters) => {
      const row = document.createElement("div");
      row.className = "crypto-kb-row";
      letters.forEach((L) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "crypto-key";
        b.textContent = L;
        b.addEventListener("click", () => setGuessForFocus(L));
        row.appendChild(b);
      });
      cryptoKeyboardEl.appendChild(row);
    });
  } else if (cryptoKeyboardEl) {
    cryptoKeyboardEl.innerHTML = "";
  }
  } catch (e) {
    console.error(e);
    if (cryptoStatusEl) cryptoStatusEl.textContent = "Ошибка отрисовки поля.";
  }
}

function wireCryptoHandlers() {
  cryptoCheckBtn?.addEventListener("click", onCheck);
  cryptoEraseBtn?.addEventListener("click", onErase);
  cryptoPrevBtn?.addEventListener("click", () => moveFocus(-1));
  cryptoNextBtn?.addEventListener("click", () => moveFocus(1));
  cryptoRestartBtn?.addEventListener("click", () => {
    const playDate = resolvePlayDate();
    localStorage.removeItem(storageKey(playDate));
    window.location.reload();
  });

  cryptoHiddenInput?.addEventListener("input", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const v = t.value.slice(-1);
    t.value = "";
    if (!v) return;
    const low = normalizeLetter(v);
    if (!/[а-я]/.test(low)) return;
    setGuessForFocus(low);
  });
}

function restartHandlersOnce() {
  if (window.__cryptoHandlersWired) return;
  window.__cryptoHandlersWired = true;
  wireCryptoHandlers();
}

async function bootCryptogram() {
  if (!document.getElementById("viewCryptogram")) return;

  applyCryptoResetFromQuery();
  restartHandlersOnce();

  const playDate = resolvePlayDate();
  updateCryptoDebugUi(playDate);

  try {
    const phrases = await loadPhrasesCatalog();
    let entry = pickPhraseForDate(phrases, playDate);
    if (!entry) {
      if (cryptoStatusEl) cryptoStatusEl.textContent = "Нет фраз. Проверьте cryptograms.json.";
      if (cryptoLeadEl) cryptoLeadEl.textContent = "";
      return;
    }
    if (!entry.text || !String(entry.text).replace(/\s+/g, " ").trim()) {
      entry = FALLBACK_PHRASES[0];
    }

    cryptoPuzzle = buildPuzzle(entry, playDate);
    const saved = loadProgress(playDate);
    setupState(playDate, cryptoPuzzle, saved);

    renderCrypto();
  } catch (err) {
    const st = $("cryptoStatus");
    if (st) st.textContent = "Не удалось запустить игру. Обновите страницу или проверьте сеть.";
    console.error(err);
  }
}

window.startCryptogram = bootCryptogram;
})();
