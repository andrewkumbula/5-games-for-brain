from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from random import Random
from zoneinfo import ZoneInfo

from app import db
from app.config import DB_PATH, DAILY_JSON_PATH, DAILY_NO_REPEAT_DAYS, WORDS_PATH
from app.words import ensure_answers, load_word_lists


GAME_TZ = ZoneInfo("Europe/Moscow")


def today_game_date() -> date:
    """Календарная дата «слов дня» по Москве (как в next_word_at)."""
    return datetime.now(GAME_TZ).date()


def day_number(game_date: date) -> int:
    base_date = date(2021, 6, 19)
    return (game_date - base_date).days + 1


def next_word_at_iso(game_date: date) -> str:
    """Момент начала следующего «игрового» дня по московской полуночи."""
    next_day = game_date + timedelta(days=1)
    dt = datetime.combine(next_day, datetime.min.time(), tzinfo=GAME_TZ)
    return dt.isoformat()


def pick_daily_word(answers: list[str], game_date: date, exclude: set[str]) -> str:
    pool = [w for w in answers if w not in exclude]
    if not pool:
        pool = list(answers)
    pool = sorted(set(pool))
    seed = int(game_date.strftime("%Y%m%d"))
    rng = Random(seed)
    return rng.choice(pool)


def write_daily_json(path: Path, *, game_date: date, word: str, day_no: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "game_date": game_date.isoformat(),
        "day_number": day_no,
        "word": word,
        "timezone": "Europe/Moscow",
        "next_word_at": next_word_at_iso(game_date),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def publish_daily_json(word: str, game_date: date, *, json_path: Path | None = None) -> None:
    out = json_path or DAILY_JSON_PATH
    write_daily_json(out, game_date=game_date, word=word, day_no=day_number(game_date))


def ensure_today_word(conn, answers: list[str], game_date: date) -> str:
    """Слово дня в БД; при первом обращении за дату — выбираем без повторов из окна."""
    existing = db.get_daily_word(conn, game_date)
    if existing:
        return existing
    limit = max(0, min(DAILY_NO_REPEAT_DAYS, max(0, len(answers) - 1)))
    recent_rows = db.get_recent_daily_words(conn, game_date, limit)
    exclude = set(recent_rows)
    word = pick_daily_word(answers, game_date, exclude)
    db.set_daily_word(conn, game_date, word)
    publish_daily_json(word, game_date)
    return word


def sync_public_daily_word_from_db() -> None:
    """При старте бота: запись в БД на сегодня и актуальный daily.json (таймер до смены)."""
    word_lists = ensure_answers(load_word_lists(WORDS_PATH))
    answers = word_lists["answers"]
    if not answers:
        return
    today = today_game_date()
    with db.get_conn(DB_PATH) as conn:
        word = ensure_today_word(conn, answers, today)
        publish_daily_json(word, today)
