import asyncio
import contextlib

from app.bot import create_bot
from app.config import DB_PATH
from app.daily_sync import sync_public_daily_word_from_db
from app.db import init_db


async def hourly_daily_refresh() -> None:
    """Обновляет daily.json после смены игрового дня без перезапуска бота."""
    while True:
        await asyncio.sleep(3600)
        with contextlib.suppress(Exception):
            sync_public_daily_word_from_db()


async def main() -> None:
    init_db(DB_PATH)
    sync_public_daily_word_from_db()
    asyncio.create_task(hourly_daily_refresh())
    bot, dispatcher = create_bot()
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
