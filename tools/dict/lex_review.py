from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from tools.dict.core import DictionaryData
from tools.dict.storage import read_json, write_json


@dataclass(frozen=True)
class LexScoreRow:
    word: str
    noun_nomn_score: float | None
    best_parse_tag: str
    best_nn_nomn_tag: str | None


def load_blocklist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        line.strip().lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    }


def strip_blocklist(
    data: DictionaryData,
    blocklist: set[str],
) -> DictionaryData:
    allowed = sorted({w for w in data.allowed if w not in blocklist})
    allowed_set = set(allowed)
    answers = sorted({w for w in data.answers if w in allowed_set})
    return DictionaryData(allowed=allowed, answers=answers)


def apply_blocklist_file(
    words_path: Path,
    blocklist_path: Path,
    *,
    dry_run: bool,
) -> tuple[int, int, int]:
    block = load_blocklist(blocklist_path)
    if not block:
        raise ValueError(f"Пустой blocklist (нет слов для исключения): {blocklist_path}")
    data = read_json(words_path)
    before_a, before_q = len(data.allowed), len(data.answers)
    new_data = strip_blocklist(data, block)
    removed_a = before_a - len(new_data.allowed)
    removed_q = before_q - len(new_data.answers)
    if not dry_run:
        write_json(words_path, new_data)
    return removed_a, removed_q, len(block)


def export_alphabetical(words: list[str], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    prev = ""
    lines: list[str] = []
    for w in sorted(set(words)):
        fl = w[:1].upper() if w else ""
        if fl and fl != prev:
            lines.append("")
            lines.append(f"### {fl}")
            prev = fl
        lines.append(w)
    path.write_text("\n".join(lines).lstrip() + "\n", encoding="utf-8")


def collect_lex_scores(words: list[str]) -> list[LexScoreRow]:
    import pymorphy3

    morph = pymorphy3.MorphAnalyzer()
    rows: list[LexScoreRow] = []
    for word in sorted(set(words)):
        parses = morph.parse(word)
        best = max(parses, key=lambda p: p.score)
        nn = [p for p in parses if p.tag.POS == "NOUN" and p.tag.case == "nomn"]
        if nn:
            best_nn = max(nn, key=lambda p: p.score)
            nn_score: float | None = float(best_nn.score)
            nn_tag = str(best_nn.tag)
        else:
            nn_score = None
            nn_tag = None
        rows.append(
            LexScoreRow(
                word=word,
                noun_nomn_score=nn_score,
                best_parse_tag=str(best.tag),
                best_nn_nomn_tag=nn_tag,
            )
        )
    rows.sort(
        key=lambda r: (
            r.noun_nomn_score is None,
            r.noun_nomn_score if r.noun_nomn_score is not None else 0.0,
            r.word,
        ),
    )
    return rows


def write_lex_scores_tsv(rows: list[LexScoreRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = ["word\tnoun_nomn_score\tbest_parse\tnoun_nomn_parse"]
    for r in rows:
        sc = "" if r.noun_nomn_score is None else f"{r.noun_nomn_score:.6f}"
        out.append(f"{r.word}\t{sc}\t{r.best_parse_tag}\t{r.best_nn_nomn_tag or ''}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
