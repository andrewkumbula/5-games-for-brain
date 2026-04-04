"""Морфологическая проверка кандидата в «слово дня» (pymorphy3, без сети).

Отсекает обрубки вроде «горшк»: нет нормального разбора как И.п. существительного.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

PROPER_GRAMMEMES = frozenset({"Name", "Surn", "Patr", "Geox", "Orgn", "Trad"})

_morph = None
_valid_subset_cache_key: frozenset[str] | None = None
_valid_subset_cache: frozenset[str] | None = None


def _analyzer():
    global _morph
    if _morph is None:
        import pymorphy3

        _morph = pymorphy3.MorphAnalyzer()
    return _morph


def is_valid_daily_answer_word(
    word: str,
    *,
    min_score: float | None = None,
    exclude_proper: bool = True,
    require_singular: bool = False,
) -> bool:
    if min_score is None:
        from app.config import DAILY_MORPH_MIN_SCORE

        min_score = DAILY_MORPH_MIN_SCORE
    morph = _analyzer()
    parses = morph.parse(word)
    noun_nomn = [p for p in parses if p.tag.POS == "NOUN" and p.tag.case == "nomn"]
    if not noun_nomn:
        return False
    best = max(noun_nomn, key=lambda p: p.score)
    if best.score < min_score:
        return False
    if exclude_proper and PROPER_GRAMMEMES.intersection(set(best.tag.grammemes)):
        return False
    if require_singular and "sing" not in best.tag.grammemes:
        return False
    return True


def valid_answers_subset(answers: list[str]) -> frozenset[str]:
    """Кэш по множеству слов (список из БД каждый раз новый объект)."""
    from app.config import DAILY_MORPH_MIN_SCORE

    global _valid_subset_cache_key, _valid_subset_cache
    key = frozenset(answers)
    if key == _valid_subset_cache_key and _valid_subset_cache is not None:
        return _valid_subset_cache
    out: set[str] = set()
    for w in answers:
        if is_valid_daily_answer_word(w, min_score=DAILY_MORPH_MIN_SCORE):
            out.add(w)
    _valid_subset_cache_key = key
    _valid_subset_cache = frozenset(out)
    log.info("Daily word morph filter: %d / %d answers pass", len(out), len(answers))
    return _valid_subset_cache
