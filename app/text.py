import re


RUSSIAN_WORD_RE = re.compile(r"^[а-я]{5}$")


def normalize_word(text: str) -> str:
    return text.strip().lower().replace("ё", "е")


def is_valid_word(text: str) -> bool:
    return bool(RUSSIAN_WORD_RE.match(text))
