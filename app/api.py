"""Lightweight aiohttp API served alongside the aiogram bot.

Endpoints
---------
GET  /api/daily          — today's word + meta (replaces daily.json)
GET  /api/words          — full word dictionary from DB
POST /api/wordle/result  — save webapp game result
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date

from aiohttp import web

from app import db
from app.config import DB_PATH
from app.text import is_valid_word, normalize_word
from app.daily_sync import (
    build_daily_payload,
    ensure_today_word_from_db,
    today_game_date,
)

log = logging.getLogger(__name__)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def _json_response(data: dict | list, status: int = 200) -> web.Response:
    return web.Response(
        text=json.dumps(data, ensure_ascii=False),
        content_type="application/json",
        headers=CORS_HEADERS,
        status=status,
    )


async def handle_options(request: web.Request) -> web.Response:
    return web.Response(status=204, headers=CORS_HEADERS)


async def handle_daily(request: web.Request) -> web.Response:
    try:
        today = today_game_date()
        with db.get_conn(DB_PATH) as conn:
            word = ensure_today_word_from_db(conn, today)
        return _json_response(build_daily_payload(today, word))
    except Exception:
        log.exception("GET /api/daily failed")
        return _json_response({"error": "internal"}, status=500)


async def handle_words(request: web.Request) -> web.Response:
    try:
        with db.get_conn(DB_PATH) as conn:
            pools = db.get_all_words_by_pool(conn)
        return _json_response(pools)
    except Exception:
        log.exception("GET /api/words failed")
        return _json_response({"error": "internal"}, status=500)


async def handle_wordle_result(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return _json_response({"error": "invalid json"}, status=400)

    telegram_id = body.get("telegram_id")
    game_date = body.get("game_date")
    attempts = body.get("attempts")
    won = body.get("won")

    if not all([telegram_id, game_date, isinstance(attempts, int)]):
        return _json_response({"error": "missing fields"}, status=400)

    try:
        with db.get_conn(DB_PATH) as conn:
            db.save_webapp_result(conn, int(telegram_id), str(game_date), attempts, bool(won))
        return _json_response({"ok": True})
    except Exception:
        log.exception("POST /api/wordle/result failed")
        return _json_response({"error": "internal"}, status=500)


async def handle_wordle_unknown_guess(request: web.Request) -> web.Response:
    """Запись слова, которого нет в allowed (мини-приложение). Для последующей проверки / ИИ."""
    try:
        body = await request.json()
    except Exception:
        return _json_response({"error": "invalid json"}, status=400)

    raw = body.get("word")
    if not isinstance(raw, str):
        return _json_response({"error": "missing word"}, status=400)

    word = normalize_word(raw)
    if not is_valid_word(word):
        return _json_response({"error": "invalid word"}, status=400)

    telegram_id = body.get("telegram_id")
    tid = int(telegram_id) if telegram_id is not None and str(telegram_id).isdigit() else None
    game_date = body.get("game_date")
    gdate = None
    if isinstance(game_date, str) and _ISO_DATE.match(game_date.strip()):
        gdate = game_date.strip()

    try:
        with db.get_conn(DB_PATH) as conn:
            db.record_dict_unknown_guess(
                conn,
                word,
                source="webapp",
                telegram_id=tid,
                game_date=gdate,
            )
        return _json_response({"ok": True})
    except Exception:
        log.exception("POST /api/wordle/unknown-guess failed")
        return _json_response({"error": "internal"}, status=500)


def create_api_app() -> web.Application:
    app = web.Application()
    app.router.add_route("OPTIONS", "/api/{tail:.*}", handle_options)
    app.router.add_get("/api/daily", handle_daily)
    app.router.add_get("/api/words", handle_words)
    app.router.add_post("/api/wordle/result", handle_wordle_result)
    app.router.add_post("/api/wordle/unknown-guess", handle_wordle_unknown_guess)
    return app
