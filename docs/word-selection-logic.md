# Word cleaning / blocklist selection logic

Goal: keep `words.json` small and "non-Wordle-noise" by removing words listed in `docs/blocked_words.txt`, where candidates are found using `docs/lex_scores.tsv` (a heuristic based on pymorphy parsing).

After any manual edits to `docs/blocked_words.txt`, always run:

```sh
python3 -m tools.dict.cli strip-blocklist --words-path words.json --blocklist-path docs/blocked_words.txt
python3 -m tools.dict.cli validate --source json --words-path words.json
```

### Pipeline (strip → pymorphy → опционально ИИ)

Один проход: `strip-blocklist` по `docs/blocked_words.txt`, затем `quality` (pymorphy), при желании — пакетный запрос к OpenAI с дописыванием кандидатов в `docs/ai_suggested_blocklist.txt` (проверьте вручную и перенесите строки в `blocked_words.txt`).

```sh
python3 -m tools.dict pipeline                    # отчёт, без записи
python3 -m tools.dict pipeline --apply            # перезаписать words.json
export OPENAI_API_KEY=...
python3 -m tools.dict pipeline --apply --ai-review --ai-max-batches 3   # тест ИИ
```

## 1) Inputs / files

- `words.json`
  - Current dictionary used by the game.
  - Contains `allowed` and `answers`.
- `docs/blocked_words.txt`
  - One word per line (lowercase).
  - Sections are marked with comment headers like `# <batch label N (YYYY-MM): ...`.
  - Words here are removed from `words.json` via `strip-blocklist`.
- `docs/manual_keep_words.txt`
  - Whitelist: words that should NOT be blocked.
- `docs/lex_scores.tsv`
  - Generated from `words.json` using pymorphy:
    - `noun_nomn_score` = best score for NOUN nominative singular (or empty).
    - `best_parse` = best parse tag by pymorphy.
  - Format: `word \t noun_nomn_score \t best_parse \t noun_nomn_parse`

## 2) Important behavior: `strip-blocklist` is one-way

`python3 -m tools.dict.cli strip-blocklist` only removes words from `words.json`.
If you later delete words from `docs/blocked_words.txt`, `strip-blocklist` will NOT restore them.

To "undo" mistakes reliably, rebuild `words.json` from sources:

```sh
python3 -m tools.dict.cli build --out json --words-path words.json --yo keep --nouns-only --gram-case nomn
python3 -m tools.dict.cli validate --source json --words-path words.json
python3 -m tools.dict.cli strip-blocklist --words-path words.json --blocklist-path docs/blocked_words.txt
python3 -m tools.dict.cli validate --source json --words-path words.json
```

## 3) Candidate generation (from `lex_scores.tsv`)

Start with `docs/lex_scores.tsv` and keep only words that are currently in:
- `words.json.allowed`
- and not present in `docs/blocked_words.txt`
- and not present in `docs/manual_keep_words.txt`

Then rank by `noun_nomn_score` (lower is "more suspicious" for our heuristics).

## 4) Filtering heuristics (recommended stable defaults)

During this session we used multiple "aggressive" thresholds. To avoid blocking valid words, prefer the following conservative filters:

### 4.1 Tag-based artifact filtering (recommended)

Block candidate words mainly when `best_parse` indicates they are very likely not a clean "Wordle noun":

- Allow `best_parse` to start with one of:
  - `VERB`
  - `GRND`
  - `ADJF`
  - `ADJS`
  - `INFN`

Exclude if:
- `best_parse` contains slang indicators like `Slng`
- `best_parse` is clearly not one of the grammatical classes above (for example `CONJ`, `PRED`, etc.)

Rationale: many past "bad" removals happened when the filter was too noun-like or too broad.

### 4.2 Low-score gating

Apply a low-score limit only together with tag filtering:

- Default gating: `noun_nomn_score <= 0.26`

If `noun_nomn_score` is missing (empty), treat it as "unknown"; for safety, do not auto-block.

### 4.3 Hard-sign / truncation (manual review zone)

Some artifacts have `ь` or `ъ` in the 5-letter word form.

Recommended:
- if the word contains `ь` or `ъ`, only consider it when `noun_nomn_score <= 0.22..0.26`
- still manually review before adding to the blocklist

## 5) How to create a reproducible candidate list (example pseudo-code)

The following pseudo-code mirrors the workflow used during the manual clean-up:

```python
allowed = words.json.allowed
blocked = docs/blocked_words.txt
keep = docs/manual_keep_words.txt

rows = parse docs/lex_scores.tsv  # each row: word, noun_nomn_score, best_parse

candidates = []
for row in rows:
  w, sc, best = row.word, row.noun_nomn_score, row.best_parse

  if w not in allowed: continue
  if w in blocked: continue
  if w in keep: continue
  if sc is None: continue
  if sc > 0.26: continue

  if not best.startswith(("VERB","GRND","ADJF","ADJS","INFN")):
    continue
  if "Slng" in best:
    continue

  candidates.append(w)

print first N candidates for review
```

## 6) Adding a new "batch" to `docs/blocked_words.txt`

1. Add a section header:
   - `# <batch label N (YYYY-MM): short description of the rule / region>`
2. Add one lowercase word per line.
3. Keep the section content stable (do not mix unrelated rules unless you explicitly want it).

## 7) Session notes (what was error-prone)

In the aggressive part of the session we occasionally blocked words that are actually valid (example: `винил`, `замер`, `задел`, `пасть`, `запал`, `молот`).

This happened when the filter was expanded beyond the conservative tag-based artifact rules.

Takeaway:
- When in doubt, rely on `best_parse` grammatical class filtering + conservative low-score gating.
- Use `manual_keep_words.txt` as the first safety net.

