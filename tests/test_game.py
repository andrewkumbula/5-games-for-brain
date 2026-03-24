from app.game import evaluate_guess, encode_result, render_colored_guess
from app.text import normalize_word, is_valid_word
from app.words import check_dictionary


def test_all_correct():
    assert evaluate_guess("арбуз", "арбуз") == ["correct"] * 5


def test_repeated_letters():
    result = evaluate_guess("капля", "аллея")
    assert result == ["present", "present", "absent", "absent", "correct"]
    encoded = encode_result(result)
    assert encoded == "YYBBG"
    rendered = render_colored_guess("аллея", encoded)
    assert rendered == "🟨А🟨Л⬛Л⬛Е🟩Я"


def test_normalize_and_validate():
    assert normalize_word("  ЁЛКА ") == "елка"
    assert is_valid_word("ведро")
    assert is_valid_word("камин")
    assert is_valid_word("щетка")
    assert not is_valid_word("abcde")
    assert not is_valid_word("12!@#")
    assert not is_valid_word("дом")


def test_dictionary_modes():
    allowed = {"ведро", "камин"}
    accepted, in_dict = check_dictionary("ведро", allowed, strict=False)
    assert accepted is True and in_dict is True
    accepted, in_dict = check_dictionary("щетка", allowed, strict=False)
    assert accepted is False and in_dict is False
    accepted, in_dict = check_dictionary("щетка", allowed, strict=True)
    assert accepted is False and in_dict is False
