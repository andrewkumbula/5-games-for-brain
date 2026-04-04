"""
Находит существительные на -ы (им. п. мн. ч.), для которых в словаре уже есть
соответствующая форма единственного числа (по pymorphy3 + проверка стема …а).

Использование:
  python3 -m tools.dict.plural_y_blocklist --words-path words.json

Печатает слова по одной в строке (для добавления в docs/blocked_words.txt).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def norm(w: str) -> str:
    return w.replace("ё", "е").lower()


def plural_y_to_block(all_words: set[str], morph) -> set[str]:
    to_block: set[str] = set()

    for s in all_words:
        best_sg = None
        for p in morph.parse(s):
            if p.tag.POS == "NOUN" and p.tag.case == "nomn" and p.tag.number == "sing":
                if best_sg is None or p.score > best_sg.score:
                    best_sg = p
        if best_sg is None:
            continue
        pl = best_sg.inflect({"plur", "nomn"})
        if not pl:
            continue
        pw = norm(pl.word)
        if pw in all_words and pw != norm(s) and pw.endswith("ы"):
            to_block.add(pw)

    for w in all_words:
        if not w.endswith("ы") or len(w) != 5:
            continue
        best_pl = None
        for p in morph.parse(w):
            if p.tag.POS == "NOUN" and p.tag.case == "nomn" and p.tag.number == "plur":
                if best_pl is None or p.score > best_pl.score:
                    best_pl = p
        if best_pl is None:
            continue
        sg = best_pl.inflect({"sing", "nomn"})
        if not sg:
            continue
        sw = norm(sg.word)
        if sw in all_words and sw != norm(w):
            to_block.add(norm(w))

    for w in all_words:
        if not w.endswith("ы") or len(w) != 5:
            continue
        stem_a = w[:-1] + "а"
        if stem_a not in all_words:
            continue
        for p in morph.parse(stem_a):
            if p.tag.POS != "NOUN" or p.tag.case != "nomn" or p.tag.number != "sing":
                continue
            pl = p.inflect({"plur", "nomn"})
            if pl and norm(pl.word) == norm(w):
                to_block.add(norm(w))
                break

    # абаза / абазы: pymorphy не связывает леммы; в словаре есть обе формы
    if "абаза" in all_words and "абазы" in all_words:
        to_block.add("абазы")

    return to_block


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--words-path", type=Path, default=Path("words.json"))
    args = parser.parse_args()

    import pymorphy3

    payload = json.loads(args.words_path.read_text(encoding="utf-8"))
    all_words = set(payload.get("allowed", []))
    morph = pymorphy3.MorphAnalyzer()
    blocked = plural_y_to_block(all_words, morph)
    for w in sorted(blocked):
        print(w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
