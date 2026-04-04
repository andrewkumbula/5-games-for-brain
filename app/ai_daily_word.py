"""Однократная проверка кандидата в слово дня через OpenAI (при записи в БД)."""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request

log = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """Ты — строгий фильтр для одного слова в русской игре «5 букв» (Wordle): игроки вводят существительное в именительном падеже, ровно 5 букв (ё = е).

Оцени три независимых условия. Если хотя бы одно не выполняется — {"ok": false}.

1) Реальность и норма
   Слово должно быть общеупотребительным в современном русском (литературная норма или широкая разговорная норма по всей стране). Отклоняй редкие архаизмы, профессиональный сленг без бытового хода, искусственные/ошибочные формы, обрубки и «псевдослова».

2) Неприменимость «узких» оправданий
   Не принимай слова, чьё единственное оправдание — диалект, этноним региона, говор, «у народа на юге», редкая деревенская лексика, жаргон одной профессии, узкоспециальные термины без общеизвестного значения. Если для оправдания нужна фраза вроде «в диалекте обозначает…» — это уже {"ok": false}.

3) Отгадываемость
   Средний носитель языка без справочников должен иметь шанс вспомнить слово в контексте бытовой загадки. Отклоняй слова, которые знают только по энциклопедиям, вузовским курсам или узким хобби.

Форма слова
   Только именительный падеж существительного. Если нормальная лемма — единственное число, а данная форма — множественное (и наоборот, если мн.ч. выглядит как принудительный выбор ради длины), — {"ok": false}. Собственные имена, топонимы, этнонимы, бренды, названия организаций, праздников как имён, клички — {"ok": false}.

Ответь ТОЛЬКО JSON без пояснений и без текста вокруг: {"ok": true} или {"ok": false}."""


def _parse_ok_json(text: str) -> bool | None:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        data = json.loads(m.group())
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if "ok" not in data:
        return None
    return bool(data["ok"])


def openai_validate_daily_word(
    word: str,
    *,
    api_key: str,
    model: str,
    timeout: int = 45,
) -> bool:
    """True — слово подходит; False — модель отклонила. Сеть/парсинг — исключение."""
    user_msg = (
        f'Кандидат в слово дня (нижний регистр): "{word}". '
        "Подходит ли для широкой аудитории по критериям из системного сообщения?"
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0,
        "max_tokens": 80,
    }
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    content = payload["choices"][0]["message"]["content"]
    parsed = _parse_ok_json(content)
    if parsed is None:
        log.warning("AI daily check: неразборчивый ответ для %r: %s", word, content[:200])
        raise ValueError("unparseable AI response")
    return parsed


def validate_daily_word_with_openai_or_skip(word: str, *, model: str, timeout: int) -> bool:
    """Если ключа нет — True (пропуск). При ошибке API — True (не блокируем игру)."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return True
    try:
        return openai_validate_daily_word(word, api_key=key, model=model, timeout=timeout)
    except urllib.error.HTTPError as e:
        log.warning("AI daily check HTTP %s для %r", e.code, word)
        return True
    except urllib.error.URLError as e:
        log.warning("AI daily check сеть для %r: %s", word, e)
        return True
    except Exception:
        log.exception("AI daily check ошибка для %r — принимаем слово", word)
        return True
