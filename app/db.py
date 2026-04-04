import sqlite3
from datetime import date
from pathlib import Path


def get_conn(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path) -> None:
    with get_conn(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                username TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_date TEXT NOT NULL,
                attempts_used INTEGER NOT NULL DEFAULT 0,
                finished INTEGER NOT NULL DEFAULT 0,
                won INTEGER NOT NULL DEFAULT 0,
                history_message_id INTEGER,
                UNIQUE(user_id, game_date),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                word TEXT NOT NULL,
                result TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(game_id) REFERENCES games(id)
            );

            CREATE TABLE IF NOT EXISTS daily_word (
                game_date TEXT PRIMARY KEY,
                word TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT UNIQUE NOT NULL,
                pool TEXT NOT NULL DEFAULT 'answers',
                active INTEGER NOT NULL DEFAULT 1,
                added_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS user_wordle (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER NOT NULL,
                game_date TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                won INTEGER NOT NULL DEFAULT 0,
                finished_at TEXT,
                UNIQUE(telegram_id, game_date)
            );
            """
        )
        for migration in [
            "ALTER TABLE games ADD COLUMN history_message_id INTEGER",
            "ALTER TABLE users ADD COLUMN notify INTEGER NOT NULL DEFAULT 1",
        ]:
            try:
                conn.execute(migration)
            except sqlite3.OperationalError:
                pass


def get_or_create_user(conn: sqlite3.Connection, telegram_id: int, username: str | None) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE telegram_id = ?",
        (telegram_id,),
    ).fetchone()
    if row:
        return int(row["id"])

    cur = conn.execute(
        "INSERT INTO users (telegram_id, username, created_at) VALUES (?, ?, datetime('now'))",
        (telegram_id, username),
    )
    return int(cur.lastrowid)


def get_daily_word(conn: sqlite3.Connection, game_date: date) -> str | None:
    row = conn.execute(
        "SELECT word FROM daily_word WHERE game_date = ?",
        (game_date.isoformat(),),
    ).fetchone()
    return row["word"] if row else None


def set_daily_word(conn: sqlite3.Connection, game_date: date, word: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO daily_word (game_date, word) VALUES (?, ?)",
        (game_date.isoformat(), word),
    )


def get_recent_daily_words(conn: sqlite3.Connection, before_date: date, limit: int) -> list[str]:
    if limit <= 0:
        return []
    rows = conn.execute(
        """
        SELECT word FROM daily_word
        WHERE game_date < ?
        ORDER BY game_date DESC
        LIMIT ?
        """,
        (before_date.isoformat(), limit),
    ).fetchall()
    return [str(r["word"]) for r in rows]


def delete_daily_word(conn: sqlite3.Connection, game_date: date) -> None:
    conn.execute(
        "DELETE FROM daily_word WHERE game_date = ?",
        (game_date.isoformat(),),
    )


def get_game(conn: sqlite3.Connection, user_id: int, game_date: date):
    return conn.execute(
        "SELECT * FROM games WHERE user_id = ? AND game_date = ?",
        (user_id, game_date.isoformat()),
    ).fetchone()


def create_game(conn: sqlite3.Connection, user_id: int, game_date: date) -> int:
    cur = conn.execute(
        "INSERT INTO games (user_id, game_date) VALUES (?, ?)",
        (user_id, game_date.isoformat()),
    )
    return int(cur.lastrowid)


def add_attempt(conn: sqlite3.Connection, game_id: int, word: str, result: str) -> None:
    conn.execute(
        "INSERT INTO attempts (game_id, word, result, created_at) VALUES (?, ?, ?, datetime('now'))",
        (game_id, word, result),
    )
    conn.execute(
        "UPDATE games SET attempts_used = attempts_used + 1 WHERE id = ?",
        (game_id,),
    )


def finish_game(conn: sqlite3.Connection, game_id: int, won: bool) -> None:
    conn.execute(
        "UPDATE games SET finished = 1, won = ? WHERE id = ?",
        (1 if won else 0, game_id),
    )


def set_history_message_id(conn: sqlite3.Connection, game_id: int, message_id: int) -> None:
    conn.execute(
        "UPDATE games SET history_message_id = ? WHERE id = ?",
        (message_id, game_id),
    )


def get_attempts(conn: sqlite3.Connection, game_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT word, result FROM attempts WHERE game_id = ? ORDER BY id ASC",
        (game_id,),
    ).fetchall()


def delete_game(conn: sqlite3.Connection, user_id: int, game_date: date) -> None:
    game = get_game(conn, user_id, game_date)
    if not game:
        return
    game_id = int(game["id"])
    conn.execute("DELETE FROM attempts WHERE game_id = ?", (game_id,))
    conn.execute("DELETE FROM games WHERE id = ?", (game_id,))


def set_notify(conn: sqlite3.Connection, telegram_id: int, enabled: bool) -> None:
    conn.execute(
        "UPDATE users SET notify = ? WHERE telegram_id = ?",
        (1 if enabled else 0, telegram_id),
    )


def get_subscribed_telegram_ids(
    conn: sqlite3.Connection,
    exclude_finished_date: date | None = None,
) -> list[int]:
    """Return telegram_ids with notify=1.

    If *exclude_finished_date* is given, skip users who already have a
    finished game for that date (they already opened the app today).
    """
    if exclude_finished_date is None:
        rows = conn.execute(
            "SELECT telegram_id FROM users WHERE notify = 1",
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT u.telegram_id
            FROM users u
            WHERE u.notify = 1
              AND u.id NOT IN (
                  SELECT g.user_id FROM games g
                  WHERE g.game_date = ? AND g.finished = 1
              )
            """,
            (exclude_finished_date.isoformat(),),
        ).fetchall()
    return [int(r["telegram_id"]) for r in rows]


def import_words(conn: sqlite3.Connection, words: list[str], pool: str = "answers") -> int:
    """Bulk-import words into the words table, skipping duplicates. Returns count of new rows."""
    added = 0
    for w in words:
        try:
            conn.execute(
                "INSERT INTO words (word, pool) VALUES (?, ?)",
                (w, pool),
            )
            added += 1
        except sqlite3.IntegrityError:
            pass
    return added


def get_active_words(conn: sqlite3.Connection, pool: str = "answers") -> list[str]:
    rows = conn.execute(
        "SELECT word FROM words WHERE active = 1 AND pool = ? ORDER BY word",
        (pool,),
    ).fetchall()
    return [r["word"] for r in rows]


def get_all_words_by_pool(conn: sqlite3.Connection) -> dict[str, list[str]]:
    answers = get_active_words(conn, "answers")
    allowed = get_active_words(conn, "allowed")
    return {"answers": answers, "allowed": allowed if allowed else answers}


def save_webapp_result(
    conn: sqlite3.Connection,
    telegram_id: int,
    game_date: str,
    attempts: int,
    won: bool,
) -> None:
    conn.execute(
        """
        INSERT INTO user_wordle (telegram_id, game_date, attempts, won, finished_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(telegram_id, game_date)
        DO UPDATE SET attempts = excluded.attempts,
                      won = excluded.won,
                      finished_at = excluded.finished_at
        """,
        (telegram_id, game_date, attempts, 1 if won else 0),
    )


def get_webapp_result(conn: sqlite3.Connection, telegram_id: int, game_date: str):
    return conn.execute(
        "SELECT * FROM user_wordle WHERE telegram_id = ? AND game_date = ?",
        (telegram_id, game_date),
    ).fetchone()


def deactivate_words(conn: sqlite3.Connection, words: list[str]) -> int:
    """Mark words as inactive. Returns how many were actually deactivated."""
    count = 0
    for w in words:
        cur = conn.execute(
            "UPDATE words SET active = 0 WHERE word = ? AND active = 1",
            (w,),
        )
        count += cur.rowcount
    return count


def replace_daily_word(conn: sqlite3.Connection, game_date: date, new_word: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO daily_word (game_date, word) VALUES (?, ?)",
        (game_date.isoformat(), new_word),
    )


def get_stats(conn: sqlite3.Connection, user_id: int) -> dict:
    total = conn.execute(
        "SELECT COUNT(*) AS cnt FROM games WHERE user_id = ?",
        (user_id,),
    ).fetchone()["cnt"]
    wins = conn.execute(
        "SELECT COUNT(*) AS cnt FROM games WHERE user_id = ? AND won = 1",
        (user_id,),
    ).fetchone()["cnt"]
    return {"total": int(total), "wins": int(wins)}
