#!/usr/bin/env python3
"""Собирает cryptograms.json из cryptogram/fraze.md (нормализация по ТЗ)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAZE = ROOT / "cryptogram" / "fraze.md"
OUT_CRYPTO = ROOT / "cryptogram" / "cryptograms.json"
OUT_WEB = ROOT / "webapp" / "cryptograms.json"

SECTIONS = {
    "Поговорки и пословицы": "proverbs",
    "Фразы из фильмов": "movies",
    "Цитаты из книг": "books",
    "Разговорные и универсальные": "chat",
    "Дополнительные фразы": "extra",
}


def normalize_phrase(raw: str) -> str:
    s = raw.strip().lower().replace("ё", "е")
    s = re.sub(r"[^\u0430-\u044f\u0410-\u042f\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main() -> None:
    text = FRAZE.read_text(encoding="utf-8")
    lines = text.splitlines()
    cat_slug: str | None = None
    phrases: list[dict] = []
    counters: dict[str, int] = {}

    for line in lines:
        line_st = line.strip()
        if line_st in SECTIONS:
            cat_slug = SECTIONS[line_st]
            continue
        if cat_slug is None:
            continue
        if not line_st or line_st.startswith("•") or line_st.startswith("⸻"):
            continue
        if line_st.startswith("Требования") or line_st.startswith("Фразы должны"):
            continue
        if line_st.startswith("Актуальные") or line_st.startswith("Примечание") or line_st.startswith("Данный"):
            continue
        if line_st.startswith("Удалены"):
            continue
        if line_st in SECTIONS.values() or line_st in SECTIONS:
            continue

        norm = normalize_phrase(line_st)
        if not norm:
            continue
        if "требования к фразам" in norm or norm.startswith("фразы для игры"):
            continue
        words = norm.split()
        if len(words) < 3:
            continue
        if len(norm) > 60:
            raise SystemExit(f"Фраза длиннее 60 символов ({len(norm)}): {norm!r}")

        counters[cat_slug] = counters.get(cat_slug, 0) + 1
        pid = f"{cat_slug}_{counters[cat_slug]:02d}"
        phrases.append({"id": pid, "category": cat_slug, "text": norm})

    data = {"phrases": phrases}
    OUT_CRYPTO.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_WEB.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(phrases)} фраз → {OUT_CRYPTO} и {OUT_WEB}")


if __name__ == "__main__":
    main()
