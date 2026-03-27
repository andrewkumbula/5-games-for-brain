/**
 * Ранний запуск Telegram WebApp: разворот на максимальную высоту (иначе «шторка» на пол-экрана).
 * Вызывается до app.js / hub.js; без зависимостей от игр.
 */
(function tgBootstrap() {
  function api() {
    return window.Telegram && window.Telegram.WebApp;
  }

  function expandOnce() {
    const w = api();
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

  expandOnce();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", expandOnce);
  } else {
    expandOnce();
  }

  [50, 200, 600, 1500].forEach((ms) => {
    setTimeout(expandOnce, ms);
  });

  const w = api();
  if (w && typeof w.onEvent === "function") {
    try {
      w.onEvent("viewportChanged", () => {
        expandOnce();
        syncHubTopInset();
      });
    } catch {
      /* ignore */
    }
  }

  /** Отступ меню под шапку TG: contentSafeAreaInset / safeAreaInset из API + запас */
  function syncHubTopInset() {
    const tg = api();
    if (!tg) return;
    try {
      tg.ready();
      const ci = tg.contentSafeAreaInset;
      const si = tg.safeAreaInset;
      const fallback = 64;
      let px = fallback;
      if (ci && typeof ci.top === "number") {
        px = Math.max(fallback, Math.round(ci.top + 20));
      } else if (si && typeof si.top === "number") {
        px = Math.max(fallback, Math.round(si.top + 36));
      }
      document.documentElement.style.setProperty("--hub-below-tg-header", `${px}px`);
    } catch {
      /* ignore */
    }
  }

  syncHubTopInset();
  setTimeout(syncHubTopInset, 100);
  setTimeout(syncHubTopInset, 500);
})();
