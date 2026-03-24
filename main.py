import asyncio
import contextlib
import logging

from app.bot import create_bot
from app.config import DB_PATH
from app.daily_sync import sync_public_daily_word_from_db
from app.db import init_db

log = logging.getLogger(__name__)


async def hourly_daily_refresh() -> None:
    """Обновляет daily.json после смены игрового дня без перезапуска бота."""
    while True:
        await asyncio.sleep(3600)
        with contextlib.suppress(Exception):
            sync_public_daily_word_from_db()


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    init_db(DB_PATH)
    try:
        sync_public_daily_word_from_db()
    except Exception:
        log.exception("sync_public_daily_word_from_db при старте — бот продолжит без daily.json")
    asyncio.create_task(hourly_daily_refresh())
    bot, dispatcher = create_bot()
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
