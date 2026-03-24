from app.keyboard import map_button_text, NEW_GAME_TEXT, HELP_TEXT, GIVEUP_TEXT


def test_map_button_text():
    assert map_button_text(NEW_GAME_TEXT) == "new_game"
    assert map_button_text(HELP_TEXT) == "help"
    assert map_button_text(GIVEUP_TEXT) == "giveup"
    assert map_button_text("не кнопка") is None
