/**
 * JSON с данными игр должен парситься и иметь ожидаемую форму.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const webapp = join(root, "webapp");

test("associations.json: есть пазлы", () => {
  const raw = readFileSync(join(webapp, "associations.json"), "utf8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.puzzles) && data.puzzles.length > 0, "puzzles не пустой");
  const p = data.puzzles[0];
  assert.ok(Array.isArray(p.groups) && p.groups.length === 6, "6 групп");
  assert.ok(
    p.groups.every((g) => Array.isArray(g.items) && g.items.length === 4),
    "по 4 слова в группе",
  );
});

test("cryptograms.json: есть фразы", () => {
  const raw = readFileSync(join(webapp, "cryptograms.json"), "utf8");
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.phrases) && data.phrases.length > 0, "phrases не пустой");
  const ph = data.phrases[0];
  assert.ok(typeof ph.id === "string" && ph.id.length > 0, "phrase.id");
  assert.ok(typeof ph.text === "string" && ph.text.trim().length > 0, "phrase.text");
});
