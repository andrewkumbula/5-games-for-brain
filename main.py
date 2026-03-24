import asyncio

from app.bot import create_bot
from app.config import DB_PATH
from app.db import init_db


async def main() -> None:
    init_db(DB_PATH)
    bot, dispatcher = create_bot()
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
