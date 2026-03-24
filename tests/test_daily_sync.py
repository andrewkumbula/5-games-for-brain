from datetime import date

from app.daily_sync import pick_daily_word


def test_pick_daily_word_excludes_recent():
    answers = ["ааааа", "ббббб", "ввввв", "ггггг", "ддддд"]
    d = date(2026, 6, 1)
    w = pick_daily_word(answers, d, exclude={"ааааа", "ббббб"})
    assert w in {"ввввв", "ггггг", "ддддд"}
    again = pick_daily_word(answers, d, exclude={"ааааа", "ббббб"})
    assert w == again


def test_pick_daily_word_falls_back_when_all_excluded():
    answers = ["ааааа", "ббббб"]
    d = date(2026, 6, 2)
    w = pick_daily_word(answers, d, exclude=set(answers))
    assert w in answers
