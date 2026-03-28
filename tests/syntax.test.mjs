/**
 * Проверка, что все клиентские скрипты парсятся без синтаксических ошибок.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const webapp = join(root, "webapp");

const jsFiles = readdirSync(webapp).filter((f) => f.endsWith(".js"));

for (const f of jsFiles) {
  test(`syntax: webapp/${f}`, () => {
    const r = spawnSync(process.execPath, ["--check", join(webapp, f)], {
      encoding: "utf8",
    });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout || "node --check failed");
  });
}
