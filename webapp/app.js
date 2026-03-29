const ATTEMPTS = 6;
const WORD_LEN = 5;
const STORAGE_KEY = "fiveletters:webapp:v2";
const DAY0 = new Date("2021-06-19T00:00:00Z");
const FALLBACK_WORDS = ["галка", "балка", "пурга", "маска", "книга", "ведро", "камин"];

function isWordleViewActive() {
  const el = document.getElementById("viewWordle");
  return !!(el && !el.classList.contains("hidden"));
}

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const dayBadgeEl = document.getElementById("dayBadge");
const resultBlockEl = document.getElementById("resultBlock");
const resultTitleEl = document.getElementById("resultTitle");
const resultSubtitleEl = document.getElementById("resultSubtitle");
const controlsBlockEl = document.getElementById("controlsBlock");
const keyboardEl = document.getElementById("keyboard");
const hiddenInputEl = document.getElementById("hiddenInput");
const guessBtn = document.getElementById("guessBtn");
const KEY_ROWS = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["enter", "я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "backspace"],
];
const COLOR_PRIORITY = { black: 1, yellow: 2, green: 3 };
const REVEAL_PROFILES = {
  normal: {
    revealTileMs: 280,
    tileTransformMs: 280,
    tileColorMs: 220,
    tileFlipMs: 280,
  },
  slow: {
    revealTileMs: 420,
    tileTransformMs: 360,
    tileColorMs: 300,
    tileFlipMs: 420,
  },
};
// Change only this value: "normal" or "slow".
const REVEAL_PROFILE = "normal";

let words = [...FALLBACK_WORDS];
let allowedWords = new Set(words);
let answer = "";
/** @type {{ game_date?: string, day_number?: number, word?: string, next_word_at?: string } | null} */
let dailyMeta = null;
let state = null;
let isRevealing = false;
let draftGuess = "";
const activeRevealProfile = REVEAL_PROFILES[REVEAL_PROFILE] || REVEAL_PROFILES.normal;
const REVEAL_TILE_MS = activeRevealProfile.revealTileMs;
const REVEAL_HALF_MS = Math.floor(REVEAL_TILE_MS / 2);

function applyRevealProfile() {
  const root = document.documentElement;
  root.style.setProperty("--tile-transform-ms", `${activeRevealProfile.tileTransformMs}ms`);
  root.style.setProperty("--tile-color-ms", `${activeRevealProfile.tileColorMs}ms`);
  root.style.setProperty("--tile-flip-ms", `${activeRevealProfile.tileFlipMs}ms`);
}

function dayNumber(now = new Date()) {
  return Math.floor((now - DAY0) / 86400000) + 1;
}

function normalize(value) {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function isValidWord(value) {
  return /^[а-я]{5}$/.test(value);
}

function syncHiddenInput() {
  if (hiddenInputEl) {
    hiddenInputEl.value = draftGuess;
  }
}

function pickWord(list, day) {
  const idx = Math.abs(day * 2654435761) % list.length;
  return list[idx];
}

function evaluate(secret, guess) {
  const result = Array(WORD_LEN).fill("black");
  const left = {};
  for (let i = 0; i < WORD_LEN; i += 1) {
    if (guess[i] === secret[i]) {
      result[i] = "green";
    } else {
      left[secret[i]] = (left[secret[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LEN; i += 1) {
    if (result[i] !== "black") continue;
    const ch = guess[i];
    if (left[ch] > 0) {
      result[i] = "yellow";
      left[ch] -= 1;
    }
  }
  return result;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** В TG WebView fetch иногда «висит» без ответа — иначе boot() не доходит до render(). */
function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: "no-store" }).finally(() => {
    clearTimeout(t);
  });
}

function render() {
  if (!state || !boardEl) {
    return;
  }
  boardEl.innerHTML = "";
  const activeRow = state.guesses.length;
  for (let row = 0; row < ATTEMPTS; row += 1) {
    const rowEl = document.createElement("div");
    rowEl.className = "board-row";
    const guess =
      state.guesses[row] ||
      (!state.finished && row === activeRow ? draftGuess : "");
    const marks = state.results[row] || [];
    for (let col = 0; col < WORD_LEN; col += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (marks[col]) tile.classList.add(marks[col]);
      const inner = document.createElement("span");
      inner.className = "tile-inner";
      const ch = guess[col];
      if (ch) {
        inner.textContent = ch.toUpperCase();
        if (!marks[col]) {
          tile.classList.add("tile--typing");
        }
      } else {
        inner.textContent = "";
      }
      tile.append(inner);
      rowEl.append(tile);
    }
    boardEl.append(rowEl);
  }

  if (state.finished) {
    guessBtn.disabled = true;
    controlsBlockEl.classList.add("hidden");
    const left = secondsUntilNextWord();
    if (state.won) {
      resultBlockEl.classList.remove("lose");
      resultBlockEl.classList.add("win");
      resultTitleEl.textContent = "Слово дня отгадано! До нового слова:";
      resultSubtitleEl.textContent = formatCountdown(left);
    } else {
      resultBlockEl.classList.remove("win");
      resultBlockEl.classList.add("lose");
      resultTitleEl.textContent = `Слово дня не отгадано. Ответ: ${answer.toUpperCase()}`;
      resultSubtitleEl.textContent = `Новое слово через: ${formatCountdown(left)}`;
    }
    resultBlockEl.classList.remove("hidden");
    statusEl.textContent = "";
  } else {
    guessBtn.disabled = false;
    controlsBlockEl.classList.remove("hidden");
    resultBlockEl.classList.remove("win", "lose");
    resultBlockEl.classList.add("hidden");
    resultTitleEl.textContent = "";
    resultSubtitleEl.textContent = "";
    statusEl.textContent = "Введите слово из 5 букв";
  }
  syncHiddenInput();
  renderKeyboard();
}

function getTileAt(row, col) {
  const rowEl = boardEl.children[row];
  if (!rowEl) {
    return null;
  }
  return rowEl.children[col] || null;
}

function haptic(kind) {
  const tg = window.Telegram?.WebApp;
  if (!tg?.HapticFeedback) return;
  if (kind === "success") {
    tg.HapticFeedback.notificationOccurred("success");
    return;
  }
  if (kind === "error") {
    tg.HapticFeedback.notificationOccurred("error");
    return;
  }
  tg.HapticFeedback.impactOccurred("light");
}

async function revealRow(rowIndex, marks) {
  isRevealing = true;
  guessBtn.disabled = true;
  // Keep result row neutral before reveal; colors appear per tile.
  state.results[rowIndex] = Array(WORD_LEN).fill("");
  render();
  for (let col = 0; col < WORD_LEN; col += 1) {
    let tile = getTileAt(rowIndex, col);
    if (!tile) {
      continue;
    }
    tile.classList.add("flip");
    await new Promise((resolve) => setTimeout(resolve, REVEAL_HALF_MS));
    const mark = marks[col];
    state.results[rowIndex][col] = mark;
    tile.classList.remove("tile--typing");
    tile.classList.add(mark);
    renderKeyboard();
    haptic("light");
    await new Promise((resolve) => setTimeout(resolve, REVEAL_HALF_MS));
    tile = getTileAt(rowIndex, col);
    if (tile) {
      tile.classList.remove("flip");
    }
  }
  isRevealing = false;
  if (!state.finished) {
    guessBtn.disabled = false;
  } else {
    haptic(state.won ? "success" : "error");
  }
  save();
}

function secondsUntilNextWord() {
  if (dailyMeta && dailyMeta.next_word_at) {
    const end = new Date(dailyMeta.next_word_at).getTime();
    return Math.max(0, Math.floor((end - Date.now()) / 1000));
  }
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((tomorrow - now) / 1000));
}

function formatCountdown(total) {
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function loadDailyMeta() {
  const candidates = ["./daily.json", "../daily.json", "/daily.json", "/webapp/daily.json"];
  for (const url of candidates) {
    try {
      const response = await fetchWithTimeout(url, 6000);
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      if (data && typeof data.word === "string" && typeof data.game_date === "string") {
        return data;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function setupState() {
  draftGuess = "";
  const gameDate = dailyMeta?.game_date || new Date().toISOString().slice(0, 10);
  const dayNum =
    typeof dailyMeta?.day_number === "number" ? dailyMeta.day_number : dayNumber();
  dayBadgeEl.textContent = `СЛОВО ДНЯ №${dayNum}`;

  if (dailyMeta?.word) {
    answer = normalize(dailyMeta.word);
  } else if (!answer) {
    answer = pickWord(words, dayNum);
  }

  const saved = load();
  if (saved && saved.gameDate === gameDate) {
    state = saved;
  } else {
    state = {
      gameDate,
      dayNumber: dayNum,
      guesses: [],
      results: [],
      finished: false,
      won: false,
    };
    save();
  }
  render();
}

async function submitGuess() {
  if (!isWordleViewActive() || !state) return;
  if (state.finished || isRevealing) return;
  const guess = normalize(draftGuess);
  if (!isValidWord(guess)) {
    statusEl.textContent = "Введите слово из 5 русских букв";
    haptic("error");
    return;
  }
  if (!allowedWords.has(guess)) {
    statusEl.textContent = "Слова нет в словаре";
    haptic("error");
    return;
  }
  const marks = evaluate(answer, guess);
  const rowIndex = state.guesses.length;
  draftGuess = "";
  state.guesses.push(guess);
  state.results.push(Array(WORD_LEN).fill(""));
  state.won = guess === answer;
  state.finished = state.won || state.guesses.length >= ATTEMPTS;
  render();
  await revealRow(rowIndex, marks);
  render();
}

function buildKeyboardState() {
  const letters = {};
  for (let row = 0; row < state.guesses.length; row += 1) {
    const guess = state.guesses[row];
    const marks = state.results[row] || [];
    for (let col = 0; col < WORD_LEN; col += 1) {
      const letter = guess[col];
      const nextColor = marks[col];
      if (!nextColor) {
        continue;
      }
      const currentColor = letters[letter];
      if (!currentColor || COLOR_PRIORITY[nextColor] > COLOR_PRIORITY[currentColor]) {
        letters[letter] = nextColor;
      }
    }
  }
  return letters;
}

function keyLabel(token) {
  if (token === "enter") return "ENTER";
  if (token === "backspace") return "⌫";
  return token.toUpperCase();
}

function onKeyboardToken(token) {
  if (!isWordleViewActive() || !state) return;
  if (state.finished || isRevealing) return;
  if (token === "enter") {
    void submitGuess();
    return;
  }
  if (token === "backspace") {
    draftGuess = draftGuess.slice(0, -1);
    render();
    return;
  }
  const value = normalize(draftGuess);
  if (value.length >= WORD_LEN) {
    statusEl.textContent = "Слово уже из 5 букв. Нажмите ПРОВЕРИТЬ или удалите букву";
    haptic("error");
    return;
  }
  draftGuess = value + token;
  statusEl.textContent = "Введите слово из 5 букв";
  render();
}

/** На touch (Telegram Mini App и т.п.) не фокусируем input — иначе всплывает системная клавиатура. Физическая клавиатура всё равно ловится через document.keydown. */
function wantsHiddenInputFocus() {
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return true;
  }
}

function tryFocusHiddenInput() {
  if (!isWordleViewActive() || !hiddenInputEl || state?.finished || isRevealing) {
    return;
  }
  if (!wantsHiddenInputFocus()) {
    return;
  }
  hiddenInputEl.focus({ preventScroll: true });
}

function renderKeyboard() {
  if (!state || !keyboardEl) {
    return;
  }
  keyboardEl.innerHTML = "";
  const states = buildKeyboardState();
  const disabled = state.finished || isRevealing;
  KEY_ROWS.forEach((rowTokens, rowIndex) => {
    const row = document.createElement("div");
    row.className = "kb-row";
    if (rowIndex === 0) row.classList.add("top");
    if (rowIndex === 1) row.classList.add("mid");
    if (rowIndex === 2) row.classList.add("bot");
    rowTokens.forEach((token) => {
      const btn = document.createElement("button");
      btn.className = "kb-key";
      btn.type = "button";
      btn.textContent = keyLabel(token);
      if (token === "enter" || token === "backspace") {
        btn.classList.add("action");
      } else if (states[token]) {
        btn.classList.add(states[token]);
      }
      btn.disabled = disabled;
      btn.addEventListener("click", () => onKeyboardToken(token));
      row.append(btn);
    });
    keyboardEl.append(row);
  });
}

async function loadWords() {
  const candidates = [
    "./words.json",
    "../words.json",
    "/words.json",
    "/webapp/words.json",
  ];
  for (const url of candidates) {
    try {
      const response = await fetchWithTimeout(url, 8000);
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const answersRaw = Array.isArray(payload) ? payload : payload.answers || [];
      const allowedRaw = Array.isArray(payload) ? payload : payload.allowed || answersRaw;
      const normalizedAnswers = answersRaw.map(normalize).filter(isValidWord);
      const normalizedAllowed = allowedRaw.map(normalize).filter(isValidWord);
      if (normalizedAnswers.length) {
        words = normalizedAnswers;
      }
      if (normalizedAllowed.length) {
        allowedWords = new Set(normalizedAllowed);
      } else {
        allowedWords = new Set(words);
      }
      return;
    } catch {
      // try next candidate URL
    }
  }
  // fallback list remains active
  allowedWords = new Set(words);
}

guessBtn?.addEventListener("click", () => {
  void submitGuess();
});
document.addEventListener("keydown", (e) => {
  if (!isWordleViewActive()) {
    return;
  }
  if (state?.finished || isRevealing) {
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    void submitGuess();
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    onKeyboardToken("backspace");
    return;
  }
  const key = normalize(e.key);
  if (key.length === 1 && /^[а-я]$/.test(key)) {
    e.preventDefault();
    onKeyboardToken(key);
    return;
  }
  if (key.length === 1 && /^[a-z]$/.test(key)) {
    e.preventDefault();
    statusEl.textContent = "Только русские буквы";
    haptic("error");
  }
});
document.addEventListener("click", () => {
  if (isWordleViewActive()) {
    tryFocusHiddenInput();
  }
});
if (hiddenInputEl) {
  hiddenInputEl.addEventListener("beforeinput", (e) => {
    if (!isWordleViewActive()) {
      e.preventDefault();
      return;
    }
    if (state?.finished || isRevealing) {
      e.preventDefault();
      return;
    }
    if (e.inputType === "deleteContentBackward") {
      e.preventDefault();
      onKeyboardToken("backspace");
      return;
    }
    if (e.inputType === "insertText") {
      const text = normalize(e.data || "");
      if (!text) {
        e.preventDefault();
        return;
      }
      if (/^[а-я]$/.test(text)) {
        e.preventDefault();
        onKeyboardToken(text);
        return;
      }
      if (/^[a-z]$/.test(text)) {
        e.preventDefault();
        statusEl.textContent = "Только русские буквы";
        haptic("error");
        return;
      }
      e.preventDefault();
    }
  });
}
async function boot() {
  applyRevealProfile();
  try {
    await loadWords();
  } catch {
    allowedWords = new Set(words);
  }
  try {
    dailyMeta = await loadDailyMeta();
  } catch {
    dailyMeta = null;
  }
  if (dailyMeta?.word) {
    answer = normalize(dailyMeta.word);
  } else {
    answer = pickWord(words, dayNumber());
    if (statusEl) {
      statusEl.textContent = "Нет daily.json — локальное слово. Запустите бота на сервере.";
    }
  }
  setupState();
  setTimeout(() => tryFocusHiddenInput(), 0);
}

window.startWordle = boot;

setInterval(() => {
  if (state?.finished && isWordleViewActive()) render();
}, 1000);
