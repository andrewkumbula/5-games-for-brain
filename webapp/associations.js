/**
 * Ассоциации: 6 групп по 4 слова, сетка 6×4. Данные: associations.json.
 *
 * Тестирование в браузере:
 *   ?date=2026-03-27        — какой день считать «сегодня» (подбор пазла по дате)
 *   ?assoc_reset=1          — сбросить сохранённый прогресс для выбранной даты и открыть пазл снова
 *   ?test=1                 — показать кнопку «Начать заново» (без смены даты)
 */
const ASSOC_LEGACY_KEY = "fiveletters:associations:v1";

const GROUP_COUNT = 6;
const WORDS_PER_GROUP = 4;
const SELECT_LIMIT = 4;
const MAX_MISTAKES = 5;

function storageKey(playDate) {
  return `fiveletters:associations:v3:${playDate}`;
}

const assocGridEl = document.getElementById("assocGrid");
const assocStatusEl = document.getElementById("assocStatus");
const assocMistakesEl = document.getElementById("assocMistakes");
const assocFoundEl = document.getElementById("assocFound");
const assocCheckBtn = document.getElementById("assocCheckBtn");
const assocResetBtn = document.getElementById("assocResetBtn");
const assocDebugLine = document.getElementById("assocDebugLine");
const assocTestControls = document.getElementById("assocTestControls");
const assocRestartBtn = document.getElementById("assocRestartBtn");

/** @type {{ groups: { name: string, items: string[] }[] } | null} */
let assocPuzzle = null;
/** @type {{
 *   gameDate: string,
 *   order: string[],
 *   found: { name: string, items: string[] }[],
 *   selected: string[],
 *   mistakes: number,
 *   status: "in_progress" | "won" | "lost"
} | null} */
let assocState = null;

function normalizeWord(value) {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Дата «игрового дня»: из ?date= или календарная сегодня. */
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
  return todayIso();
}

function formatRuDate(iso) {
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function applyAssocResetFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const want = params.get("assoc_reset") === "1" || params.get("reset_assoc") === "1";
    if (!want) return;
    const playDate = resolvePlayDate();
    localStorage.removeItem(storageKey(playDate));
    localStorage.removeItem(ASSOC_LEGACY_KEY);
    params.delete("assoc_reset");
    params.delete("reset_assoc");
    const qs = params.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

function showAssocTestUi() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.has("date") || p.get("test") === "1";
  } catch {
    return false;
  }
}

function updateAssocDebugUi(playDate) {
  if (assocDebugLine) {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("date")) {
        assocDebugLine.classList.remove("hidden");
        assocDebugLine.textContent = `Тест: пазл на дату ${formatRuDate(playDate)}. Полный сброс: добавьте к адресу &assoc_reset=1 и обновите страницу.`;
      } else {
        assocDebugLine.classList.add("hidden");
        assocDebugLine.textContent = "";
      }
    } catch {
      /* ignore */
    }
  }
  if (assocTestControls) {
    if (showAssocTestUi()) assocTestControls.classList.remove("hidden");
    else assocTestControls.classList.add("hidden");
  }
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

function seedFromDate(iso) {
  let h = 0;
  for (let i = 0; i < iso.length; i += 1) {
    h = (Math.imul(31, h) + iso.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function wordsFromPuzzle(puzzle) {
  const out = [];
  for (const g of puzzle.groups) {
    for (const w of g.items) {
      out.push(normalizeWord(w));
    }
  }
  return out;
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].map(normalizeWord).sort();
  const sb = [...b].map(normalizeWord).sort();
  return sa.every((v, i) => v === sb[i]);
}

function findMatchingGroupIndex(selected, puzzle, foundList) {
  const foundKeys = new Set(
    foundList.map((f) => f.items.map(normalizeWord).sort().join("|")),
  );
  for (let i = 0; i < puzzle.groups.length; i += 1) {
    const g = puzzle.groups[i];
    const key = g.items.map(normalizeWord).sort().join("|");
    if (foundKeys.has(key)) continue;
    if (setsEqual(selected, g.items)) return i;
  }
  return -1;
}

function loadAssocProgressFor(playDate) {
  try {
    const raw = localStorage.getItem(storageKey(playDate));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(ASSOC_LEGACY_KEY) || "");
    if (legacy && legacy.gameDate === playDate && Array.isArray(legacy.order)) {
      localStorage.setItem(storageKey(playDate), JSON.stringify(legacy));
      localStorage.removeItem(ASSOC_LEGACY_KEY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveAssocProgress() {
  if (!assocState) return;
  localStorage.setItem(storageKey(assocState.gameDate), JSON.stringify(assocState));
}

function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: "no-store" }).finally(() => {
    clearTimeout(t);
  });
}

async function loadAssocTemplate(isoDate) {
  const candidates = ["./associations.json", "../webapp/associations.json", "/webapp/associations.json"];
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data.puzzles) ? data.puzzles : [];
      const valid = list.map(normalizePuzzle).filter(isValidAssocPuzzle);
      if (!valid.length) continue;
      const exactRaw = list.find((p) => p.date === isoDate);
      if (exactRaw) {
        const p = normalizePuzzle(exactRaw);
        if (isValidAssocPuzzle(p)) return p;
      }
      const idx = seedFromDate(isoDate) % valid.length;
      return valid[idx];
    } catch {
      /* next */
    }
  }
  return null;
}

function normalizePuzzle(raw) {
  const groups = raw.groups.map((g) => ({
    name: String(g.name),
    items: g.items.map((w) => normalizeWord(w)),
  }));
  return { groups };
}

function haptic(kind) {
  const tg = window.Telegram?.WebApp;
  if (!tg?.HapticFeedback) return;
  if (kind === "error") tg.HapticFeedback.notificationOccurred("error");
  else if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
  else tg.HapticFeedback.impactOccurred("light");
}

function renderAssoc() {
  if (!assocState || !assocPuzzle || !assocGridEl) return;

  if (assocMistakesEl) {
    assocMistakesEl.textContent = `Ошибки: ${assocState.mistakes}/${MAX_MISTAKES} · ${formatRuDate(assocState.gameDate)}`;
  }

  const locked = assocState.status !== "in_progress";
  if (assocCheckBtn) assocCheckBtn.disabled = locked || assocState.selected.length !== SELECT_LIMIT;
  if (assocResetBtn) assocResetBtn.disabled = locked;

  if (assocStatusEl) {
    if (assocState.status === "won") {
      assocStatusEl.textContent = "Все группы найдены!";
    } else if (assocState.status === "lost") {
      assocStatusEl.textContent = "Попробуйте завтра — лимит ошибок исчерпан.";
    } else {
      assocStatusEl.textContent = "Выберите 4 связанных слова и нажмите «Проверить»";
    }
  }

  const colors = [
    "#1e6b3a",
    "#2a4f8f",
    "#8f7a2a",
    "#5a3d7a",
    "#8f4a3a",
    "#3a6b8f",
  ];
  if (assocFoundEl) {
    assocFoundEl.innerHTML = "";
    assocState.found.forEach((g, i) => {
      const row = document.createElement("div");
      row.className = "assoc-found-row";
      row.style.borderLeftColor = colors[i % colors.length];
      const title = document.createElement("div");
      title.className = "assoc-found-name";
      title.textContent = g.name;
      const words = document.createElement("div");
      words.className = "assoc-found-words";
      words.textContent = g.items.map((w) => w.toUpperCase()).join(" · ");
      row.append(title, words);
      assocFoundEl.append(row);
    });
  }

  assocGridEl.innerHTML = "";
  assocGridEl.className = "assoc-grid";

  assocState.order.forEach((w) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "assoc-tile";
    const n = normalizeWord(w);
    if (assocState.selected.includes(n)) btn.classList.add("assoc-tile--selected");
    btn.textContent = w.toUpperCase();
    btn.disabled = locked;
    btn.addEventListener("click", () => {
      if (locked) return;
      const idx = assocState.selected.indexOf(n);
      if (idx >= 0) {
        assocState.selected.splice(idx, 1);
      } else if (assocState.selected.length < SELECT_LIMIT) {
        assocState.selected.push(n);
      } else {
        haptic("error");
        if (assocStatusEl) {
          assocStatusEl.textContent =
            "Можно выбрать не больше 4 слов. Снимите лишнее или сбросьте.";
        }
        renderAssoc();
        return;
      }
      haptic("light");
      saveAssocProgress();
      renderAssoc();
    });
    assocGridEl.append(btn);
  });
}

function setupAssocState(playDate) {
  if (!assocPuzzle) return;
  const saved = loadAssocProgressFor(playDate);
  const expectedWords = GROUP_COUNT * WORDS_PER_GROUP;
  if (
    saved &&
    saved.gameDate === playDate &&
    Array.isArray(saved.order) &&
    saved.order.length === expectedWords
  ) {
    assocState = saved;
    return;
  }
  const all = wordsFromPuzzle(assocPuzzle);
  const order = shuffleWithSeed(all, seedFromDate(playDate));
  assocState = {
    gameDate: playDate,
    order,
    found: [],
    selected: [],
    mistakes: 0,
    status: "in_progress",
  };
  saveAssocProgress();
}

function restartCurrentPuzzleFromUi() {
  if (!assocPuzzle) return;
  const playDate = assocState?.gameDate || resolvePlayDate();
  localStorage.removeItem(storageKey(playDate));
  assocState = null;
  setupAssocState(playDate);
  renderAssoc();
  if (assocMistakesEl && assocState) {
    assocMistakesEl.textContent = `Ошибки: ${assocState.mistakes}/${MAX_MISTAKES} · ${formatRuDate(assocState.gameDate)}`;
  }
}

async function onAssocCheck() {
  if (!assocState || !assocPuzzle || assocState.status !== "in_progress") return;
  if (assocState.selected.length !== SELECT_LIMIT) {
    if (assocStatusEl) assocStatusEl.textContent = "Нужно ровно 4 слова.";
    haptic("error");
    return;
  }

  const idx = findMatchingGroupIndex(assocState.selected, assocPuzzle, assocState.found);
  if (idx < 0) {
    assocState.mistakes += 1;
    assocState.selected = [];
    if (assocState.mistakes >= MAX_MISTAKES) {
      assocState.status = "lost";
      haptic("error");
    } else {
      haptic("error");
      if (assocStatusEl) assocStatusEl.textContent = "Не угадали. Попробуйте ещё раз.";
    }
    saveAssocProgress();
    renderAssoc();
    return;
  }

  const g = assocPuzzle.groups[idx];
  assocState.found.push({ name: g.name, items: [...g.items] });
  const foundSet = new Set(g.items.map(normalizeWord));
  assocState.order = assocState.order.filter((w) => !foundSet.has(normalizeWord(w)));
  assocState.selected = [];
  haptic("success");

  if (assocState.found.length >= GROUP_COUNT) {
    assocState.status = "won";
  }
  saveAssocProgress();
  renderAssoc();
}

function onAssocReset() {
  if (!assocState || assocState.status !== "in_progress") return;
  assocState.selected = [];
  saveAssocProgress();
  renderAssoc();
}

function wireAssocHandlers() {
  assocCheckBtn?.addEventListener("click", onAssocCheck);
  assocResetBtn?.addEventListener("click", onAssocReset);
  assocRestartBtn?.addEventListener("click", () => {
    restartCurrentPuzzleFromUi();
  });
}

function isValidAssocPuzzle(p) {
  if (!p?.groups || p.groups.length !== GROUP_COUNT) return false;
  return p.groups.every(
    (g) => Array.isArray(g.items) && g.items.length === WORDS_PER_GROUP && g.name,
  );
}

async function bootAssociations() {
  if (!assocGridEl) return;

  applyAssocResetFromQuery();
  const playDate = resolvePlayDate();

  assocPuzzle = await loadAssocTemplate(playDate);
  if (!assocPuzzle || !isValidAssocPuzzle(assocPuzzle)) {
    if (assocStatusEl) {
      assocStatusEl.textContent =
        "Нет головоломки. Добавьте associations.json (6 групп по 4 слова).";
    }
    if (assocMistakesEl) assocMistakesEl.textContent = "";
    updateAssocDebugUi(playDate);
    return;
  }

  setupAssocState(playDate);
  updateAssocDebugUi(playDate);

  if (assocMistakesEl && assocState) {
    assocMistakesEl.textContent = `Ошибки: ${assocState.mistakes}/${MAX_MISTAKES} · ${formatRuDate(assocState.gameDate)}`;
  }
  renderAssoc();
}

window.startAssociations = bootAssociations;

if (assocCheckBtn && !window.__assocHandlersWired) {
  window.__assocHandlersWired = true;
  wireAssocHandlers();
}
