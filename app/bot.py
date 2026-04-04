import time
from datetime import date
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message
from aiogram.exceptions import TelegramBadRequest

from app import db
from app.config import BOT_TOKEN, DB_PATH, WORDS_PATH, STRICT_DICTIONARY, MAX_ATTEMPTS, WEBAPP_URL
from app.daily_sync import day_number, ensure_today_word, today_game_date
from app.game import evaluate_guess, encode_result, render_colored_guess
from app.keyboard import (
    build_keyboard,
    build_finished_keyboard,
    build_open_webapp_keyboard,
    map_button_text,
)
from app.text import normalize_word, is_valid_word
from app.words import load_word_lists, check_dictionary, ensure_answers


def _load_words_from_db_or_json():
    """Load word lists: prefer DB, fallback to words.json."""
    with db.get_conn(DB_PATH) as conn:
        pools = db.get_all_words_by_pool(conn)
    if pools["answers"]:
        return pools
    return ensure_answers(load_word_lists(WORDS_PATH))


def _is_start_command_text(text: str | None) -> bool:
    """Текст вида /start или /start@bot — если Command() не сработал, обработаем здесь."""
    if not text:
        return False
    part = text.strip().split(maxsplit=1)[0]
    if not part.startswith("/"):
        return False
    cmd = part[1:].split("@", 1)[0].casefold()
    return cmd == "start"


def instruction_text() -> str:
    attempts_line = (
        f"Попыток: {MAX_ATTEMPTS}."
        if MAX_ATTEMPTS > 0
        else "Попытки не ограничены."
    )
    return (
        "Правила:\n"
        "- Вводи слово из 5 русских букв.\n"
        f"- {attempts_line}\n"
        "- 🟩 буква на месте, 🟨 есть в слове, ⬛ нет в слове.\n"
        "Команды: /start, /help, /stats, /giveup, /restart"
    )


def build_router() -> Router:
    router = Router()
    word_lists = _load_words_from_db_or_json()
    answers = word_lists["answers"]
    allowed = set(word_lists["allowed"])
    words_missing = not answers
    last_message_at: dict[int, float] = {}
    min_interval = 0.5

    def build_history_text(
        game_date: date,
        attempts: list[tuple[str, str]],
        attempts_used: int,
        won: bool,
        finished: bool,
        answer: str | None,
    ) -> str:
        header = f"🎯 Слово дня #{day_number(game_date)}"
        if finished and won:
            header = "🎉 Победа!"
        elif finished and not won:
            header = "💥 Поражение"

        lines = [header, ""]
        grid_size = 6
        for index in range(grid_size):
            if index < len(attempts):
                word, encoded = attempts[index]
                lines.append(render_colored_guess(word, encoded))
            elif not finished and index == attempts_used:
                lines.append("➡️ ⬜⬜⬜⬜⬜")
            else:
                lines.append("⬜⬜⬜⬜⬜")

        if finished and not won and answer:
            lines.append("")
            lines.append(f"Слово дня: {answer.upper()}")
        elif finished and won:
            lines.append("")
            lines.append("Слово дня отгадано. Новое слово — с полуночи по Москве.")
            lines.append(f"Попыток использовано: {attempts_used} / 6")
        else:
            lines.append("")
            lines.append(f"Попытка: {attempts_used} / 6")
        return "\n".join(lines)

    async def upsert_history_message(
        message: Message,
        game_id: int,
        game,
        answer: str | None,
    ) -> None:
        with db.get_conn(DB_PATH) as conn:
            attempts_rows = db.get_attempts(conn, game_id)
        attempts = [(row["word"], row["result"]) for row in attempts_rows]
        game_date = date.fromisoformat(str(game["game_date"]))
        text = build_history_text(
            game_date=game_date,
            attempts=attempts,
            attempts_used=game["attempts_used"],
            won=bool(game["won"]),
            finished=bool(game["finished"]),
            answer=answer,
        )
        markup = build_finished_keyboard() if game["finished"] else build_keyboard()
        if game["history_message_id"]:
            try:
                await message.bot.edit_message_text(
                    text=text,
                    chat_id=message.chat.id,
                    message_id=game["history_message_id"],
                    reply_markup=markup,
                )
                return
            except TelegramBadRequest:
                pass
        sent = await message.answer(text, reply_markup=markup)
        with db.get_conn(DB_PATH) as conn:
            db.set_history_message_id(conn, game_id, sent.message_id)

    async def handle_start(message: Message) -> None:
        if WEBAPP_URL:
            try:
                await message.answer(
                    "Открой мини-приложение и играй в «5 букв».",
                    reply_markup=build_open_webapp_keyboard(),
                )
            except TelegramBadRequest:
                await message.answer(
                    "Открой мини-приложение по ссылке (если кнопка не появилась):\n"
                    + WEBAPP_URL,
                )
            return
        if not BOT_TOKEN:
            await message.answer("Токен не задан. Укажи BOT_TOKEN в окружении.")
            return
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return

        with db.get_conn(DB_PATH) as conn:
            user_id = db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            today = today_game_date()
            game = db.get_game(conn, user_id, today)
            if game:
                await upsert_history_message(message, int(game["id"]), game, None)
                return
            db.create_game(conn, user_id, today)
            game = db.get_game(conn, user_id, today)
        await upsert_history_message(message, int(game["id"]), game, None)

    @router.message(Command("start"))
    async def start(message: Message) -> None:
        await handle_start(message)

    @router.message(Command("help"))
    async def help_command(message: Message) -> None:
        if WEBAPP_URL:
            await message.answer(
                instruction_text(),
                reply_markup=build_open_webapp_keyboard(),
            )
            return
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return
        await message.answer(instruction_text(), reply_markup=build_keyboard())

    @router.message(Command("restart"))
    async def restart(message: Message) -> None:
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return
        with db.get_conn(DB_PATH) as conn:
            user_id = db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            today = today_game_date()
            db.delete_game(conn, user_id, today)
            db.create_game(conn, user_id, today)
            game = db.get_game(conn, user_id, today)
        await upsert_history_message(message, int(game["id"]), game, None)

    @router.message(Command("giveup"))
    async def giveup(message: Message) -> None:
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return
        today = today_game_date()
        with db.get_conn(DB_PATH) as conn:
            user_id = db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            game = db.get_game(conn, user_id, today)
            if not game:
                await message.answer(
                    "Сейчас нет активной игры. Нажми «Новая игра».",
                    reply_markup=build_keyboard(),
                )
                return
            game_id = int(game["id"])

            daily = ensure_today_word(conn, answers, today)

            db.finish_game(conn, game_id, False)
            game = db.get_game(conn, user_id, today)
        await upsert_history_message(message, game_id, game, daily)

    @router.message(Command("stats"))
    async def stats(message: Message) -> None:
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return
        with db.get_conn(DB_PATH) as conn:
            user_id = db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            stats_data = db.get_stats(conn, user_id)
        await message.answer(
            f"Сыграно: {stats_data['total']}\nПобед: {stats_data['wins']}",
            reply_markup=build_keyboard(),
        )

    @router.message(Command("notify"))
    async def notify_toggle(message: Message) -> None:
        args = (message.text or "").split(maxsplit=1)
        arg = args[1].strip().lower() if len(args) > 1 else ""
        disable_words = {"off", "0", "стоп", "выкл", "stop", "нет"}
        enabled = arg not in disable_words
        with db.get_conn(DB_PATH) as conn:
            db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            db.set_notify(conn, message.from_user.id, enabled)
        if enabled:
            await message.answer(
                "Напоминания включены. Каждый день в 8:00 по Москве придёт уведомление о новом задании.\n"
                "Отключить: /notify off",
            )
        else:
            await message.answer(
                "Напоминания отключены.\nВключить снова: /notify on",
            )

    @router.callback_query(F.data.in_({"new_game", "help", "giveup"}))
    async def inline_button_handler(callback: CallbackQuery) -> None:
        action = callback.data
        if not callback.message:
            await callback.answer()
            return
        if action in ("new_game", "restart"):
            await restart(callback.message)
        elif action == "help":
            await help_command(callback.message)
        elif action == "giveup":
            await giveup(callback.message)
        await callback.answer()

    @router.message(F.text)
    async def guess(message: Message) -> None:
        if not message.text:
            return
        if _is_start_command_text(message.text):
            await handle_start(message)
            return
        if words_missing:
            await message.answer(
                "Словарь пуст. Запусти CLI для сборки словаря.",
                reply_markup=build_keyboard(),
            )
            return
        action = map_button_text(message.text.strip())
        if action in ("new_game", "help", "giveup"):
            return
        now = time.time()
        user_id = message.from_user.id
        last_at = last_message_at.get(user_id, 0.0)
        if now - last_at < min_interval:
            return
        last_message_at[user_id] = now

        guess_word = normalize_word(message.text)
        if not is_valid_word(guess_word):
            await message.answer(
                "Нужно слово из 5 русских букв.",
                reply_markup=build_keyboard(),
            )
            return

        accepted, in_dict = check_dictionary(
            guess_word,
            allowed,
            strict=STRICT_DICTIONARY,
        )
        if not accepted:
            await message.answer(
                "Слова нет в словаре.",
                reply_markup=build_keyboard(),
            )
            return

        today = today_game_date()
        with db.get_conn(DB_PATH) as conn:
            user_id = db.get_or_create_user(
                conn,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
            )
            game = db.get_game(conn, user_id, today)
            if not game:
                game_id = db.create_game(conn, user_id, today)
                game = db.get_game(conn, user_id, today)
            game_id = int(game["id"])

            if game["finished"]:
                await message.answer(
                    "Слово дня на сегодня уже сыграно. Новое слово — с полуночи по Москве.",
                    reply_markup=build_keyboard(),
                )
                return
            if MAX_ATTEMPTS > 0 and game["attempts_used"] >= MAX_ATTEMPTS:
                await message.answer(
                    "Попытки на сегодня закончились. Новое слово — с полуночи по Москве.",
                    reply_markup=build_keyboard(),
                )
                return

            daily = ensure_today_word(conn, answers, today)

            result = evaluate_guess(daily, guess_word)
            encoded = encode_result(result)
            db.add_attempt(conn, game_id, guess_word, encoded)

            won = guess_word == daily
            attempts_used = game["attempts_used"] + 1
            if won or (MAX_ATTEMPTS > 0 and attempts_used >= MAX_ATTEMPTS):
                db.finish_game(conn, game_id, won)
            game = db.get_game(conn, user_id, today)

        await upsert_history_message(message, game_id, game, daily if game["finished"] else None)
        return

    return router


def create_bot() -> tuple[Bot, Dispatcher]:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is required")

    bot = Bot(token=BOT_TOKEN)
    dispatcher = Dispatcher()
    dispatcher.include_router(build_router())
    return bot, dispatcher
