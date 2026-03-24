# Telegram Wordle (5 букв)

## Запуск
1) Установи зависимости:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2) Укажи токен:
```bash
export BOT_TOKEN="ваш_токен"
```

3) Запусти:
```bash
python main.py
```

## Команды
- `/start` — начать игру
- `/help` — правила и подсказка по командам
- `/stats` — статистика
- `/giveup` — сдаться и показать слово дня
- `/restart` — начать заново текущий день

## Пример ответа
```
ЛАМПА
🟩⬛🟨⬛⬛
```

## Тесты
```bash
pip install -r requirements-dev.txt
pytest
```

## Настройки
- `BOT_TOKEN` — токен Telegram бота
- `WEBAPP_URL` — публичный URL мини-приложения (`webapp/index.html`)
- `DB_PATH` — путь к SQLite (по умолчанию `data.db`)
- `WORDS_PATH` — путь к словарю (по умолчанию `words.json`)
- `STRICT_DICTIONARY` — 0/1 (по умолчанию 0)
- `MAX_ATTEMPTS` — количество попыток (по умолчанию 6; 0 = без ограничений)
- `USE_KEYBOARD` — 0/1 (по умолчанию 1)

## Требования
- Python >= 3.10

## Режимы словаря
- По умолчанию (мягкий): корректное по форме слово принимается, даже если его нет в словаре.
- Строгий: слово принимается только если есть в `allowed`.

## Формат словаря
`words.json`:
```json
{
  "answers": ["слово", "..."],
  "allowed": ["слово", "..."]
}
```

## CLI для словаря
Сборка словаря:
```bash
python -m tools.dict build --out json
```

Сборка только существительных в именительном падеже:
```bash
python -m tools.dict build --out json --nouns-only --gram-case nomn
```

Источник по умолчанию:
`https://raw.githubusercontent.com/mediahope/Wordle-Russian-Dictionary/main/Russian.txt`

Проверка словаря:
```bash
python -m tools.dict validate
```

Аудит качества слов (автотест по критериям морфологии):
```bash
python -m tools.dict quality --source json --words-path words.json
```

С учетом ручных исключений (whitelist):
```bash
python -m tools.dict quality --source json --words-path words.json --keep-path docs/manual_keep_words.txt
```

Применить очистку автоматически:
```bash
python -m tools.dict quality --source json --words-path words.json --apply
```

Разница `allowed`/`answers`:
- `allowed` — все допустимые вводы
- `answers` — слова для загадок (подмножество `allowed`)

Нормализация `ё`:
- по умолчанию `ё` → `е` (`--yo to_e`)
- можно оставить `ё` как есть (`--yo keep`)

## Управление кнопками
Кнопки доступны внизу чата (если `USE_KEYBOARD=1`):
- `🎮 Новая игра` — новая игра с новым словом
- `ℹ️ Инструкция` — правила и команды
- `🏳️ Сдаться` — завершить игру и показать слово

## Mini App режим (как на скриншоте)
1. Размести папку `webapp/` на любом HTTPS-хостинге (GitHub Pages, Vercel, Netlify).
2. Укажи переменную окружения:
```bash
export WEBAPP_URL="https://<ваш-домен>/webapp/index.html"
```
3. Перезапусти бота и открой `/start` — бот покажет кнопку `Открыть игру`.

В Mini App используется интерфейс с плитками 6x5, таймером до нового слова и кнопкой `ИГРАТЬ ДАЛЬШЕ`.

## Деплой на свой сервер

Если не хотите использовать внешний хостинг для фронта, используйте self-host:

- `docs/SELF_HOST_DEPLOY.md` — пошагово
- `deploy/systemd/fiveletters-bot.service` — отдельный сервис бота
- `deploy/nginx/fiveletters.conf` — отдельный nginx block под новый поддомен
- `deploy/scripts/deploy.sh` — обновления через git + restart
