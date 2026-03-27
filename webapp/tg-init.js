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
      w.onEvent("viewportChanged", expandOnce);
    } catch {
      /* ignore */
    }
  }
})();
