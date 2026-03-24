from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from tools.dict.core import DictionaryData


def write_json(path: Path, data: DictionaryData) -> None:
    payload = {"answers": data.answers, "allowed": data.allowed}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> DictionaryData:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return DictionaryData(
        allowed=payload.get("allowed", []),
        answers=payload.get("answers", []),
    )


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS words_allowed (
            word TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS words_answers (
            word TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """
    )


def write_db(
    path: Path,
    data: DictionaryData,
    mode: str,
    sources: list[str],
) -> None:
    with sqlite3.connect(path) as conn:
        init_db(conn)
        if mode == "replace":
            conn.execute("DELETE FROM words_allowed")
            conn.execute("DELETE FROM words_answers")
        conn.executemany(
            "INSERT OR IGNORE INTO words_allowed (word) VALUES (?)",
            [(w,) for w in data.allowed],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO words_answers (word) VALUES (?)",
            [(w,) for w in data.answers],
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            ("updated_at", datetime.now(timezone.utc).isoformat()),
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            ("sources", ",".join(sources)),
        )


def read_db(path: Path) -> DictionaryData:
    with sqlite3.connect(path) as conn:
        init_db(conn)
        allowed = [row[0] for row in conn.execute("SELECT word FROM words_allowed")]
        answers = [row[0] for row in conn.execute("SELECT word FROM words_answers")]
    return DictionaryData(allowed=sorted(allowed), answers=sorted(answers))
