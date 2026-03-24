import json
from pathlib import Path

from app.text import normalize_word, is_valid_word


def load_word_lists(path: Path) -> dict[str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        answers = data
        allowed = data
    else:
        answers = data.get("answers", [])
        allowed = data.get("allowed", [])

    def normalize_list(items: list[str]) -> list[str]:
        words = [normalize_word(w) for w in items if isinstance(w, str)]
        return [w for w in words if is_valid_word(w)]

    return {
        "answers": normalize_list(answers),
        "allowed": normalize_list(allowed),
    }


def ensure_answers(word_lists: dict[str, list[str]]) -> dict[str, list[str]]:
    if not word_lists["answers"] and word_lists["allowed"]:
        word_lists["answers"] = word_lists["allowed"]
    return word_lists


def check_dictionary(word: str, allowed: set[str], strict: bool) -> tuple[bool, bool]:
    in_dict = word in allowed
    return in_dict, in_dict
