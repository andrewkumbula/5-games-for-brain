/**
 * Регрессия: меню должно инициализироваться до тяжёлого блока криптограммы,
 * иначе ошибка в crypto обрывает весь hub.js и не открываются игры.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const hubPath = join(root, "webapp", "hub.js");

test("hub.js: expandTelegram и initHub до блока криптограммы", () => {
  const hub = readFileSync(hubPath, "utf8");
  const iExpand = hub.indexOf("expandTelegram()");
  const iCrypto = hub.indexOf("/** Криптограмма (встроена в hub.js");
  assert.ok(iExpand > 0, "должен быть вызов expandTelegram()");
  assert.ok(iCrypto > 0, "должен быть маркер блока криптограммы");
  assert.ok(iExpand < iCrypto, "expandTelegram() должен идти раньше блока криптограммы");

  const iInitBranch = hub.indexOf("} else {\n  initHub();\n}");
  assert.ok(iInitBranch > 0, "должна быть ветка else initHub()");
  assert.ok(iInitBranch < iCrypto, "initHub() должен вызываться до блока криптограммы");
});

test("hub.js: маршруты игр в initHub", () => {
  const hub = readFileSync(hubPath, "utf8");
  assert.ok(hub.includes('game === "wordle"'), "обработчик wordle");
  assert.ok(hub.includes('game === "associations"'), "обработчик associations");
  assert.ok(hub.includes('game === "cryptogram"'), "обработчик cryptogram");
});
