from __future__ import annotations

import re
from dataclasses import dataclass
from random import Random
from typing import Any


RUSSIAN_WORD_RE = re.compile(r"^[а-я]{5}$")


@dataclass(frozen=True)
class DictionaryData:
    allowed: list[str]
    answers: list[str]


def normalize_word(text: str, yo_mode: str) -> str:
    word = text.strip().lower()
    if yo_mode == "to_e":
        word = word.replace("ё", "е")
    return word


def filter_words(lines: list[str], yo_mode: str) -> list[str]:
    normalized = [normalize_word(line, yo_mode) for line in lines]
    filtered = [w for w in normalized if RUSSIAN_WORD_RE.match(w)]
    return sorted(set(filtered))


def _match_grammemes(parse: Any, nouns_only: bool, required_case: str | None) -> bool:
    tag = getattr(parse, "tag", None)
    if tag is None:
        return False
    pos = getattr(tag, "POS", None)
    case = getattr(tag, "case", None)
    if nouns_only and pos != "NOUN":
        return False
    if required_case and case != required_case:
        return False
    return True


def apply_morph_filter(
    words: list[str],
    nouns_only: bool,
    required_case: str | None,
) -> list[str]:
    if not nouns_only and not required_case:
        return words
    try:
        import pymorphy3
    except ImportError as exc:
        raise RuntimeError(
            "Morphological filter requires pymorphy3. Install requirements again."
        ) from exc
    morph = pymorphy3.MorphAnalyzer()
    filtered: list[str] = []
    for word in words:
        parses = morph.parse(word)
        if any(_match_grammemes(p, nouns_only, required_case) for p in parses):
            filtered.append(word)
    return filtered


def build_answers(allowed: list[str], answers_size: int | None, seed: int | None) -> list[str]:
    if answers_size is None:
        return list(allowed)
    if answers_size <= 0:
        return []
    if answers_size > len(allowed):
        raise ValueError("answers_size exceeds allowed size")
    rng = Random(seed)
    return sorted(rng.sample(allowed, answers_size))


def build_dictionary(
    sources: list[list[str]],
    yo_mode: str,
    answers_size: int | None,
    seed: int | None,
    nouns_only: bool = False,
    required_case: str | None = None,
) -> DictionaryData:
    merged: list[str] = []
    for lines in sources:
        merged.extend(lines)
    allowed = filter_words(merged, yo_mode)
    allowed = apply_morph_filter(
        allowed,
        nouns_only=nouns_only,
        required_case=required_case,
    )
    answers = build_answers(allowed, answers_size, seed)
    return DictionaryData(allowed=allowed, answers=answers)


def validate_dictionary(data: DictionaryData, min_allowed: int) -> list[str]:
    errors: list[str] = []
    if len(data.allowed) < min_allowed:
        errors.append("allowed size below minimum")
    if not set(data.answers).issubset(set(data.allowed)):
        errors.append("answers is not a subset of allowed")
    if any(not RUSSIAN_WORD_RE.match(w) for w in data.allowed):
        errors.append("allowed contains invalid words")
    if any(not RUSSIAN_WORD_RE.match(w) for w in data.answers):
        errors.append("answers contains invalid words")
    return errors
