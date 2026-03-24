from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from tools.dict.core import DictionaryData


PROPER_GRAMMEMES = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad"}


@dataclass(frozen=True)
class QualityIssue:
    word: str
    reasons: tuple[str, ...]


def _contains_proper_tag(parse) -> bool:
    grammemes = set(parse.tag.grammemes)
    return bool(PROPER_GRAMMEMES.intersection(grammemes))


def audit_dictionary(
    data: DictionaryData,
    *,
    min_score: float,
    exclude_proper: bool,
    require_singular: bool,
    manual_keep: set[str] | None = None,
) -> tuple[list[str], list[QualityIssue], Counter[str]]:
    import pymorphy3

    morph = pymorphy3.MorphAnalyzer()
    clean_words: list[str] = []
    issues: list[QualityIssue] = []
    reason_counts: Counter[str] = Counter()

    for word in data.allowed:
        if manual_keep and word in manual_keep:
            clean_words.append(word)
            continue
        parses = morph.parse(word)
        noun_nomn = [p for p in parses if p.tag.POS == "NOUN" and p.tag.case == "nomn"]
        reasons: list[str] = []
        if not noun_nomn:
            reasons.append("no_noun_nomn")
        else:
            best = max(noun_nomn, key=lambda p: p.score)
            if best.score < min_score:
                reasons.append("low_score")
            if exclude_proper and _contains_proper_tag(best):
                reasons.append("proper_like")
            if require_singular and "sing" not in best.tag.grammemes:
                reasons.append("not_singular")

        if reasons:
            reason_counts.update(reasons)
            issues.append(QualityIssue(word=word, reasons=tuple(reasons)))
        else:
            clean_words.append(word)

    clean_set = set(clean_words)
    clean_answers = [w for w in data.answers if w in clean_set]
    cleaned = DictionaryData(allowed=clean_words, answers=clean_answers)
    return cleaned.allowed, issues, reason_counts
