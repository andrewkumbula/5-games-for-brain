from types import SimpleNamespace

from tools.dict.cli import command_build
from tools.dict.core import (
    build_dictionary,
    build_answers,
    filter_words,
    validate_dictionary,
)


def test_normalize_and_filter():
    lines = ["  ЁЛКА ", "камин", "ведро", "abc", "шесть", "дом"]
    allowed = filter_words(lines, yo_mode="to_e")
    assert "елка" in allowed
    assert "камин" in allowed
    assert "ведро" in allowed
    assert "abc" not in allowed
    assert "шесть" not in allowed
    assert "дом" not in allowed


def test_dedup_and_sort():
    lines = ["ведро", "ведро", "камин"]
    allowed = filter_words(lines, yo_mode="to_e")
    assert allowed == ["камин", "ведро"]


def test_answers_subset_and_seed():
    allowed = ["арбуз", "берег", "вишня", "груша", "домик"]
    answers = build_answers(allowed, answers_size=2, seed=42)
    assert len(answers) == 2
    assert set(answers).issubset(set(allowed))
    assert answers == build_answers(allowed, answers_size=2, seed=42)


def test_build_and_validate():
    data = build_dictionary([["ведро", "камин", "щетка"]], "to_e", None, None)
    errors = validate_dictionary(data, min_allowed=1)
    assert errors == []


def test_dry_run(tmp_path):
    source = tmp_path / "source.txt"
    source.write_text("ведро\nкамин\n", encoding="utf-8")
    words_path = tmp_path / "words.json"
    args = SimpleNamespace(
        source_url=str(source),
        extra_source_url=None,
        yo="to_e",
        answers_size=None,
        seed=None,
        min_allowed=1,
        dry_run=True,
        out="json",
        words_path=str(words_path),
        db_path=str(tmp_path / "data.db"),
        db_mode="replace",
    )
    assert command_build(args) == 0
    assert not words_path.exists()
