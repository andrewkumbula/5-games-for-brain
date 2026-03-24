from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.config import USE_KEYBOARD, WEBAPP_URL


NEW_GAME_TEXT = "🎮 Новая игра"
HELP_TEXT = "ℹ️ Инструкция"
GIVEUP_TEXT = "🏳️ Сдаться"
PLAY_NEXT_TEXT = "▶️ Играть дальше"
OPEN_APP_TEXT = "▶️ Открыть игру"


def build_keyboard() -> InlineKeyboardMarkup | None:
    if not USE_KEYBOARD:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=NEW_GAME_TEXT, callback_data="new_game")],
            [
                InlineKeyboardButton(text=HELP_TEXT, callback_data="help"),
                InlineKeyboardButton(text=GIVEUP_TEXT, callback_data="giveup"),
            ],
        ],
    )


def build_finished_keyboard() -> InlineKeyboardMarkup | None:
    if not USE_KEYBOARD:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=PLAY_NEXT_TEXT, callback_data="new_game")],
            [InlineKeyboardButton(text=HELP_TEXT, callback_data="help")],
        ],
    )


def map_button_text(text: str) -> str | None:
    mapping = {
        NEW_GAME_TEXT: "new_game",
        HELP_TEXT: "help",
        GIVEUP_TEXT: "giveup",
        PLAY_NEXT_TEXT: "new_game",
    }
    return mapping.get(text)


def build_open_webapp_keyboard() -> InlineKeyboardMarkup | None:
    if not USE_KEYBOARD or not WEBAPP_URL:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=OPEN_APP_TEXT,
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )
