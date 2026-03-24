const ATTEMPTS = 6;
const WORD_LEN = 5;
const STORAGE_KEY = "fiveletters:webapp:v1";
const DAY0 = new Date("2021-06-19T00:00:00Z");
const FALLBACK_WORDS = ["галка", "балка", "пурга", "маска", "книга", "ведро", "камин"];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const dayBadgeEl = document.getElementById("dayBadge");
const resultBlockEl = document.getElementById("resultBlock");
const resultTitleEl = document.getElementById("resultTitle");
const resultSubtitleEl = document.getElementById("resultSubtitle");
const controlsBlockEl = document.getElementById("controlsBlock");
const keyboardEl = document.getElementById("keyboard");
const guessBtn = document.getElementById("guessBtn");
const playNextBtn = document.getElementById("playNextBtn");
const KEY_ROWS = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["enter", "я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "backspace"],
];
const COLOR_PRIORITY = { black: 1, yellow: 2, green: 3 };

let words = [...FALLBACK_WORDS];
let allowedWords = new Set(words);
let answer = "";
let state = null;
let isRevealing = false;
let draftGuess = "";
const REVEAL_STEP_MS = 190;
const FLIP_RESET_MS = 380;

function dayNumber(now = new Date()) {
  return Math.floor((now - DAY0) / 86400000) + 1;
}

function normalize(value) {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function isValidWord(value) {
  return /^[а-я]{5}$/.test(value);
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

function render() {
  boardEl.innerHTML = "";
  const activeRow = state.guesses.length;
  for (let row = 0; row < ATTEMPTS; row += 1) {
    const guess =
      state.guesses[row] ||
      (!state.finished && row === activeRow ? draftGuess : "");
    const marks = state.results[row] || [];
    for (let col = 0; col < WORD_LEN; col += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (marks[col]) tile.classList.add(marks[col]);
      tile.textContent = guess ? guess[col].toUpperCase() : "";
      boardEl.append(tile);
    }
  }

  if (state.finished) {
    guessBtn.disabled = true;
    controlsBlockEl.classList.add("hidden");
    playNextBtn.classList.remove("hidden");
    const left = secondsUntilTomorrow();
    if (state.won) {
      resultBlockEl.classList.remove("lose");
      resultBlockEl.classList.add("win");
      resultTitleEl.textContent = "Вы отгадали слово дня! Хотите продолжить отгадывать слова?";
      resultSubtitleEl.textContent = `Новое слово дня через: ${formatLeft(left)}`;
    } else {
      resultBlockEl.classList.remove("win");
      resultBlockEl.classList.add("lose");
      resultTitleEl.textContent = `Вы не угадали. Слово дня: ${answer.toUpperCase()}`;
      resultSubtitleEl.textContent = `Новое слово дня через: ${formatLeft(left)}`;
    }
    resultBlockEl.classList.remove("hidden");
    statusEl.textContent = "";
  } else {
    guessBtn.disabled = false;
    controlsBlockEl.classList.remove("hidden");
    playNextBtn.classList.add("hidden");
    resultBlockEl.classList.remove("win", "lose");
    resultBlockEl.classList.add("hidden");
    resultTitleEl.textContent = "";
    resultSubtitleEl.textContent = "";
    statusEl.textContent = "Введите слово из 5 букв";
  }
  renderKeyboard();
}

function getTileAt(row, col) {
  return boardEl.children[row * WORD_LEN + col];
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
  for (let col = 0; col < WORD_LEN; col += 1) {
    const tile = getTileAt(rowIndex, col);
    if (!tile) {
      continue;
    }
    tile.classList.add("flip");
    await new Promise((resolve) => setTimeout(resolve, REVEAL_STEP_MS));
    tile.classList.add(marks[col]);
    haptic("light");
    setTimeout(() => tile.classList.remove("flip"), FLIP_RESET_MS);
  }
  isRevealing = false;
  if (!state.finished) {
    guessBtn.disabled = false;
  } else {
    haptic(state.won ? "success" : "error");
  }
}

function secondsUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.floor((tomorrow - now) / 1000);
}

function formatLeft(total) {
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function setupState(forceNext = false) {
  draftGuess = "";
  const saved = load();
  let day = dayNumber();
  if (forceNext) {
    if (saved && typeof saved.day === "number") {
      day = saved.day + 1;
    } else {
      day = dayNumber() + 1;
    }
  }
  dayBadgeEl.textContent = `СЛОВО ДНЯ №${day}`;
  answer = pickWord(words, day);

  if (saved && saved.day === day) {
    state = saved;
  } else {
    state = { day, guesses: [], results: [], finished: false, won: false };
    save();
  }
  render();
}

async function submitGuess() {
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
  state.results.push(marks);
  state.won = guess === answer;
  state.finished = state.won || state.guesses.length >= ATTEMPTS;
  save();
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
  if (value.length >= WORD_LEN) return;
  draftGuess = value + token;
  render();
}

function renderKeyboard() {
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
  const candidates = ["./words.json", "../words.json", "/words.json"];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
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

guessBtn.addEventListener("click", () => {
  void submitGuess();
});
document.addEventListener("keydown", (e) => {
  if (state?.finished || isRevealing) {
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    void submitGuess();
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    onKeyboardToken("backspace");
    return;
  }
  const key = normalize(e.key);
  if (key.length === 1 && /^[а-я]$/.test(key)) {
    e.preventDefault();
    onKeyboardToken(key);
  }
});
playNextBtn.addEventListener("click", () => {
  draftGuess = "";
  setupState(true);
});

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

loadWords().then(() => setupState());
setInterval(() => {
  if (state?.finished) render();
}, 1000);
