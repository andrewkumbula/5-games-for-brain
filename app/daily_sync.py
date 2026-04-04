from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from random import Random
from zoneinfo import ZoneInfo

from app import db
from app.ai_daily_word import validate_daily_word_with_openai_or_skip
from app.config import (
    BLOCKED_WORDS_PATH,
    DB_PATH,
    DAILY_AI_MAX_CANDIDATES,
    DAILY_AI_MODEL,
    DAILY_AI_TIMEOUT,
    DAILY_JSON_PATH,
    DAILY_NO_REPEAT_DAYS,
    SKIP_DAILY_AI_CHECK,
    SKIP_DAILY_MORPH_FILTER,
    WORDS_PATH,
)
from app.word_quality import is_valid_daily_answer_word, valid_answers_subset
from app.words import ensure_answers, load_word_lists

log = logging.getLogger(__name__)


def load_blocked_words(path: Path | None = None) -> set[str]:
    p = path or BLOCKED_WORDS_PATH
    if not p.exists():
        return set()
    blocked = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        w = line.strip().split("#")[0].strip().lower()
        if w:
            blocked.add(w)
    return blocked

try:
    GAME_TZ = ZoneInfo("Europe/Moscow")
except Exception:  # noqa: BLE001
    GAME_TZ = dt_timezone.utc


def today_game_date() -> date:
    return datetime.now(GAME_TZ).date()


def day_number(game_date: date) -> int:
    base_date = date(2021, 6, 19)
    return (game_date - base_date).days + 1


def next_word_at_iso(game_date: date) -> str:
    next_day = game_date + timedelta(days=1)
    dt = datetime.combine(next_day, datetime.min.time(), tzinfo=GAME_TZ)
    return dt.isoformat()


def _daily_word_pool(answers: list[str], game_date: date, exclude: set[str]) -> list[str]:
    """Кандидаты в слово дня после морфо-фильтра и exclude (дата нужна только для совместимости сигнатуры)."""
    del game_date  # пул зависит только от answers/exclude/morph
    base = sorted(set(answers))
    valid: frozenset[str] | None = None
    if not SKIP_DAILY_MORPH_FILTER:
        valid = valid_answers_subset(answers)

    def allowed(w: str) -> bool:
        if w in exclude:
            return False
        if valid is not None and w not in valid:
            return False
        return True

    pool = [w for w in base if allowed(w)]
    if not pool:
        log.warning(
            "_daily_word_pool: пустой пул после фильтров (morph=%s, exclude=%d) — без морфологии",
            valid is not None,
            len(exclude),
        )
        pool = [w for w in base if w not in exclude]
    if not pool:
        pool = list(base)
    return pool


def pick_daily_word(answers: list[str], game_date: date, exclude: set[str]) -> str:
    """Детерминированный выбор одного слова (без ИИ). Для тестов и fallback."""
    pool = _daily_word_pool(answers, game_date, exclude)
    seed = int(game_date.strftime("%Y%m%d"))
    rng = Random(seed)
    return rng.choice(pool)


def select_daily_word_for_new_day(answers: list[str], game_date: date, exclude: set[str]) -> str:
    """Фиксация нового слова дня: shuffle по дате, затем по очереди проверка ИИ (если включена)."""
    pool = _daily_word_pool(answers, game_date, exclude)
    seed = int(game_date.strftime("%Y%m%d"))
    rng = Random(seed)
    order = pool[:]
    rng.shuffle(order)

    use_ai = not SKIP_DAILY_AI_CHECK and bool(os.environ.get("OPENAI_API_KEY", "").strip())

    if not use_ai:
        return pick_daily_word(answers, game_date, exclude)

    for i, w in enumerate(order):
        if i >= DAILY_AI_MAX_CANDIDATES:
            log.warning(
                "ИИ: достигнут лимит кандидатов (%s), выбираем без проверки: %s",
                DAILY_AI_MAX_CANDIDATES,
                w,
            )
            return w
        if validate_daily_word_with_openai_or_skip(w, model=DAILY_AI_MODEL, timeout=DAILY_AI_TIMEOUT):
            if i > 0:
                log.info("ИИ: выбрано слово дня с попытки %d: %s", i + 1, w)
            return w
        log.info("ИИ отклонил кандидата: %s", w)

    return order[0]


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


def seed_words_from_json(conn, words_path: Path) -> None:
    """Import words.json into the words table if it's empty."""
    count = conn.execute("SELECT COUNT(*) AS c FROM words").fetchone()["c"]
    if count > 0:
        return
    word_lists = ensure_answers(load_word_lists(words_path))
    answers = set(word_lists["answers"])
    allowed = set(word_lists["allowed"])
    n_answers = db.import_words(conn, sorted(answers), pool="answers")
    only_allowed = sorted(allowed - answers)
    n_allowed = db.import_words(conn, only_allowed, pool="allowed")
    log.info("Seeded words table: %d answers + %d allowed", n_answers, n_allowed)


def ensure_today_word(conn, answers: list[str], game_date: date) -> str:
    existing = db.get_daily_word(conn, game_date)
    if existing:
        return existing
    limit = max(0, min(DAILY_NO_REPEAT_DAYS, max(0, len(answers) - 1)))
    recent_rows = db.get_recent_daily_words(conn, game_date, limit)
    exclude = set(recent_rows)
    word = select_daily_word_for_new_day(answers, game_date, exclude)
    db.set_daily_word(conn, game_date, word)
    publish_daily_json(word, game_date)
    return word


def ensure_today_word_from_db(conn, game_date: date) -> str:
    """Like ensure_today_word but reads the word pool from the DB words table."""
    existing = db.get_daily_word(conn, game_date)
    if existing:
        return existing
    answers = db.get_active_words(conn, "answers")
    if not answers:
        raise RuntimeError("No active words in DB")
    limit = max(0, min(DAILY_NO_REPEAT_DAYS, max(0, len(answers) - 1)))
    recent_rows = db.get_recent_daily_words(conn, game_date, limit)
    exclude = set(recent_rows)
    word = select_daily_word_for_new_day(answers, game_date, exclude)
    db.set_daily_word(conn, game_date, word)
    publish_daily_json(word, game_date)
    return word


def build_daily_payload(game_date: date, word: str) -> dict:
    return {
        "game_date": game_date.isoformat(),
        "day_number": day_number(game_date),
        "word": word,
        "timezone": "Europe/Moscow",
        "next_word_at": next_word_at_iso(game_date),
    }


def apply_blocklist(conn, blocked: set[str]) -> None:
    if not blocked:
        return
    n = db.deactivate_words(conn, sorted(blocked))
    if n:
        log.info("Deactivated %d blocked words in DB", n)


def fix_today_if_blocked(conn, today: date, blocked: set[str], answers: list[str]) -> str:
    """Если слово дня в blocklist или не проходит pymorphy — заменить."""
    current = db.get_daily_word(conn, today)
    morph_ok = SKIP_DAILY_MORPH_FILTER or not current or is_valid_daily_answer_word(current)
    if current and current not in blocked and morph_ok:
        return current
    if current:
        log.warning("Today's word '%s' is blocked or failed morph check — replacing", current)
    limit = max(0, min(DAILY_NO_REPEAT_DAYS, max(0, len(answers) - 1)))
    recent = db.get_recent_daily_words(conn, today, limit)
    exclude = set(recent) | blocked
    word = select_daily_word_for_new_day(answers, today, exclude)
    db.replace_daily_word(conn, today, word)
    publish_daily_json(word, today)
    log.info("New daily word for %s: %s", today, word)
    return word


def sync_public_daily_word_from_db() -> None:
    today = today_game_date()
    blocked = load_blocked_words()
    with db.get_conn(DB_PATH) as conn:
        seed_words_from_json(conn, WORDS_PATH)
        apply_blocklist(conn, blocked)
        answers = db.get_active_words(conn, "answers")
        if not answers:
            word_lists = ensure_answers(load_word_lists(WORDS_PATH))
            answers = word_lists["answers"]
        if not answers:
            return
        word = fix_today_if_blocked(conn, today, blocked, answers)
        if not word:
            word = ensure_today_word(conn, answers, today)
        publish_daily_json(word, today)
