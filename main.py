import asyncio
import contextlib
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from aiohttp import web
from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest

from app.api import create_api_app
from app.bot import create_bot
from app.config import API_PORT, DB_PATH
from app.daily_sync import sync_public_daily_word_from_db
from app import db
from app.db import init_db
from app.keyboard import build_open_webapp_keyboard

log = logging.getLogger(__name__)

MSK = ZoneInfo("Europe/Moscow")
REMINDER_HOUR = 8
REMINDER_TEXT = (
    "Доброе утро! Новые задания дня готовы — "
    "5 букв, Ассоциации и Криптограмма ждут."
)


def _seconds_until_next_reminder() -> float:
    now = datetime.now(MSK)
    target = now.replace(hour=REMINDER_HOUR, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def daily_reminder_loop(bot: Bot) -> None:
    while True:
        delay = _seconds_until_next_reminder()
        log.info("Next daily reminder in %.0f s", delay)
        await asyncio.sleep(delay)

        try:
            today = datetime.now(MSK).date()
            with db.get_conn(DB_PATH) as conn:
                chat_ids = db.get_subscribed_telegram_ids(conn, exclude_finished_date=today)
            log.info("Sending daily reminder to %d users (date=%s)", len(chat_ids), today)

            markup = build_open_webapp_keyboard()
            sent, failed = 0, 0
            for chat_id in chat_ids:
                try:
                    await bot.send_message(chat_id, REMINDER_TEXT, reply_markup=markup)
                    sent += 1
                except TelegramForbiddenError:
                    with contextlib.suppress(Exception):
                        with db.get_conn(DB_PATH) as conn:
                            db.set_notify(conn, chat_id, False)
                    failed += 1
                except TelegramBadRequest:
                    failed += 1
                except Exception:
                    log.exception("Reminder send error for chat_id=%s", chat_id)
                    failed += 1
                await asyncio.sleep(0.05)
            log.info("Daily reminder done: sent=%d failed=%d", sent, failed)
        except Exception:
            log.exception("daily_reminder_loop iteration failed")

        await asyncio.sleep(60)


async def hourly_daily_refresh() -> None:
    """Обновляет daily.json после смены игрового дня без перезапуска бота."""
    while True:
        await asyncio.sleep(3600)
        with contextlib.suppress(Exception):
            sync_public_daily_word_from_db()


async def start_api_server() -> web.AppRunner:
    app = create_api_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", API_PORT)
    await site.start()
    log.info("API server started on port %d", API_PORT)
    return runner


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    init_db(DB_PATH)
    try:
        sync_public_daily_word_from_db()
    except Exception:
        log.exception("sync_public_daily_word_from_db при старте — бот продолжит без daily.json")
    api_runner = await start_api_server()
    asyncio.create_task(hourly_daily_refresh())
    bot, dispatcher = create_bot()
    asyncio.create_task(daily_reminder_loop(bot))
    try:
        await dispatcher.start_polling(bot)
    finally:
        await api_runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
