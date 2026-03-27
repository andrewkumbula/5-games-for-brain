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
  $("backToMenu")?.addEventListener("click", showHub);
  $("backFromAssociations")?.addEventListener("click", showHub);

  document.querySelectorAll(".hub-card[data-game]").forEach((el) => {
    el.addEventListener("click", () => {
      const game = el.getAttribute("data-game");
      if (game === "wordle") {
        showWordle();
        return;
      }
      if (game === "associations") {
        showAssociations();
        return;
      }
      if (game === "soon") {
        onSoonClick();
      }
    });
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
