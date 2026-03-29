/**
 * Меню выбора ежедневных игр.
 * При каждом открытии мини-приложения показываем меню (hash/localStorage не восстанавливаем —
 * в TG WebView #wordle и last route часто «залипают» и пропускали меню).
 */
const HUB_ROUTE_KEY = "fiveletters:hub:route";

function $(id) {
  return document.getElementById(id);
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

const RU_LETTERS = "абвгдежзийклмнопрстуфхцчшщъыьэюя".split("");

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

/**
 * @param {{ id: string, text: string }} phraseEntry
 * @param {string} gameDate
 */
function buildPuzzle(phraseEntry, gameDate) {
  const text = phraseEntry.text;
  const seed = seedForPhrase(gameDate, phraseEntry.id);
  const { letters, cells } = buildLetterLayout(text);
  const { letterToCode, codeToLetter } = assignCodes(letters, seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const wantHints = 2 + Math.floor(rng() * 4);
  const maxHints = Math.max(0, letters.length - 1);
  const hintCount = Math.min(wantHints, maxHints);
  const order = shuffleWithSeed(
    letters.map((_, i) => i),
    seed ^ 0xdeadbeef,
  );
  const hints = new Set(order.slice(0, hintCount));

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
    cryptoState = {
      gameDate: playDate,
      phraseId: puzzle.phraseId,
      guessesByCode: { ...saved.guessesByCode, ...initGuessesFromHints(puzzle) },
      mistakes: saved.mistakes || 0,
      status: saved.status || "in_progress",
      focusEditableIdx: saved.focusEditableIdx || 0,
    };
  } else {
    cryptoState = {
      gameDate: playDate,
      phraseId: puzzle.phraseId,
      guessesByCode: initGuessesFromHints(puzzle),
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

function setGuessForFocus(letter) {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const li = currentFocusLi();
  if (li < 0) return;
  const ch = cryptoPuzzle.letters[li];
  const code = cryptoPuzzle.letterToCode[ch];
  cryptoState.guessesByCode[String(code)] = letter;
  saveProgress(cryptoState);
  maybeAutoWin();
  renderCrypto();
}

function maybeAutoWin() {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  if (isWinning(cryptoPuzzle, cryptoState.guessesByCode)) {
    cryptoState.status = "won";
    saveProgress(cryptoState);
    haptic("success");
  }
}

function onCheck() {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;

  let wrong = 0;
  for (const code of codesNeedingInput(cryptoPuzzle)) {
    const g = cryptoState.guessesByCode[String(code)];
    if (g == null || g === "") continue;
    if (g !== cryptoPuzzle.codeToLetter[code]) wrong += 1;
  }

  if (wrong === 0) {
    if (isWinning(cryptoPuzzle, cryptoState.guessesByCode)) {
      cryptoState.status = "won";
      haptic("success");
    } else {
      if (cryptoStatusEl) cryptoStatusEl.textContent = "Заполните все буквы.";
      haptic("light");
    }
    saveProgress(cryptoState);
    renderCrypto();
    return;
  }

  cryptoState.mistakes += wrong;
  if (cryptoState.mistakes >= MAX_MISTAKES) {
    cryptoState.status = "lost";
    haptic("error");
  } else {
    haptic("error");
    if (cryptoStatusEl) cryptoStatusEl.textContent = `Неверно. Ошибок за проверку: ${wrong}.`;
  }
  saveProgress(cryptoState);
  renderCrypto();
}

function onErase() {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const li = currentFocusLi();
  if (li < 0) return;
  if (cryptoPuzzle.hints.has(li)) return;
  const code = cryptoPuzzle.letterToCode[cryptoPuzzle.letters[li]];
  const hinted = hintLetterForCode(cryptoPuzzle, code);
  if (hinted) {
    cryptoState.guessesByCode[String(code)] = hinted;
  } else {
    delete cryptoState.guessesByCode[String(code)];
  }
  saveProgress(cryptoState);
  renderCrypto();
}

function moveFocus(delta) {
  if (!cryptoPuzzle || !cryptoState || cryptoState.status !== "in_progress") return;
  const ed = editableLetterIndices(cryptoPuzzle);
  if (!ed.length) return;
  let idx = ed.indexOf(currentFocusLi());
  if (idx < 0) idx = 0;
  idx = (idx + delta + ed.length) % ed.length;
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

  for (const c of cryptoPuzzle.cells) {
    if (c.kind === "space") {
      flushWord();
      continue;
    }
    const li = c.li;
    const ch = cryptoPuzzle.letters[li];
    const code = cryptoPuzzle.letterToCode[ch];
    const isHint = cryptoPuzzle.hints.has(li);
    const guess = cryptoState.guessesByCode[String(code)] || "";
    const display = isHint ? ch : guess || "";
    const editable = !isHint && cryptoState.status === "in_progress";
    const isFocus = editable && li === focusLi;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "crypto-cell" + (isFocus ? " crypto-cell--focus" : "") + (isHint ? " crypto-cell--hint" : "");
    cell.disabled = cryptoState.status !== "in_progress" || !editable;
    cell.dataset.li = String(li);

    const charSpan = document.createElement("span");
    charSpan.className = "crypto-cell-char";
    charSpan.textContent = display ? display.toUpperCase() : " ";
    const numSpan = document.createElement("span");
    numSpan.className = "crypto-cell-num";
    numSpan.textContent = String(code);

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
    RU_LETTERS.forEach((L) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "crypto-key";
      b.textContent = L;
      b.addEventListener("click", () => setGuessForFocus(L));
      cryptoKeyboardEl.appendChild(b);
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
