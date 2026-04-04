import tempfile
from pathlib import Path

from app import db
from app.db import init_db, record_dict_unknown_guess


def test_record_unknown_inserts_and_upserts_hit_count():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "t.db"
        init_db(path)
        with db.get_conn(path) as conn:
            record_dict_unknown_guess(
                conn,
                "абвгд",
                source="webapp",
                telegram_id=42,
                game_date="2026-04-04",
            )
            record_dict_unknown_guess(
                conn,
                "абвгд",
                source="telegram",
                telegram_id=99,
                game_date="2026-04-05",
            )
            row = conn.execute(
                "SELECT word, hit_count, source, telegram_id FROM dict_unknown_guess WHERE word = ?",
                ("абвгд",),
            ).fetchone()
            assert row["word"] == "абвгд"
            assert row["hit_count"] == 2
            assert row["source"] == "webapp"
            assert row["telegram_id"] == 42


def test_record_unknown_skips_when_word_active_in_dictionary():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "t.db"
        init_db(path)
        with db.get_conn(path) as conn:
            conn.execute(
                "INSERT INTO words (word, pool, active) VALUES (?, 'allowed', 1)",
                ("ведро",),
            )
            record_dict_unknown_guess(conn, "ведро", source="webapp")
            n = conn.execute("SELECT COUNT(*) AS c FROM dict_unknown_guess").fetchone()["c"]
            assert n == 0


def test_record_unknown_invalid_word_noop():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "t.db"
        init_db(path)
        with db.get_conn(path) as conn:
            record_dict_unknown_guess(conn, "ab", source="webapp")
            n = conn.execute("SELECT COUNT(*) AS c FROM dict_unknown_guess").fetchone()["c"]
            assert n == 0
