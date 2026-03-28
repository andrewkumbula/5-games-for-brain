/**
 * Минимальная проверка разметки хаба и игр.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const htmlPath = join(root, "webapp", "index.html");

test("index.html: обязательные id и карточки игр", () => {
  const html = readFileSync(htmlPath, "utf8");
  for (const id of ["viewHub", "viewWordle", "viewAssociations", "viewCryptogram"]) {
    assert.ok(html.includes(`id="${id}"`), `должен быть #${id}`);
  }
  assert.ok(html.includes('data-game="wordle"'), "карточка wordle");
  assert.ok(html.includes('data-game="associations"'), "карточка associations");
  assert.ok(html.includes('data-game="cryptogram"'), "карточка cryptogram");
});

test("index.html: hub.js подключается последним", () => {
  const html = readFileSync(htmlPath, "utf8");
  const iHub = html.lastIndexOf("hub.js");
  const iApp = html.lastIndexOf("app.js");
  const iAssoc = html.lastIndexOf("associations.js");
  assert.ok(iHub > iApp && iHub > iAssoc, "hub.js должен идти после app и associations");
});
