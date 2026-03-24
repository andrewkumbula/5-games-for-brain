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
            """
        )
        try:
            conn.execute("ALTER TABLE games ADD COLUMN history_message_id INTEGER")
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
