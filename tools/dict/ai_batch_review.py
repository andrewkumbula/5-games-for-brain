"""Офлайн-пакетная проверка слов через OpenAI (дополнение к blocklist, не в рантайме бота)."""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """Ты помощник для чистки словаря русской игры «5 букв».
На вход — список слов из ровно 5 букв (нижний регистр).
Верни ТОЛЬКО JSON-массив строк: слова, которые НЕ подходят как обычное русское существительное
в именительном падеже для широкой аудитории (обрубки, явный мусор, редкий жаргон, не-слова).
Нормальные слова (в т.ч. редкие, но реальные) не включай. Если сомневаешься — не включай.
Пример ответа: ["абвгд","горшк"]
Если все слова нормальные — верни []."""


def _extract_json_array(text: str) -> list[str]:
    text = text.strip()
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return []
    try:
        data = json.loads(m.group())
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out = []
    for x in data:
        if isinstance(x, str) and len(x.strip()) == 5:
            out.append(x.strip().lower())
    return out


def review_batch(words: list[str], *, api_key: str, model: str, timeout: int = 120) -> list[str]:
    user = "Слова (через запятую):\n" + ", ".join(words)
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        "temperature": 0.1,
        "max_tokens": 500,
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
    return _extract_json_array(content)


def run_ai_review(
    words: list[str],
    *,
    out_path: Path,
    batch_size: int = 28,
    model: str = "gpt-4o-mini",
    sleep_s: float = 0.4,
    max_batches: int | None = None,
) -> tuple[int, int]:
    """Проходит *words* пакетами, дописывает уникальные «плохие» в *out_path* (по строке на слово)."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Задайте OPENAI_API_KEY в окружении")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not out_path.exists():
        out_path.write_text(
            "# Подсказки ИИ — проверьте и перенесите в docs/blocked_words.txt\n",
            encoding="utf-8",
        )
    existing = set()
    existing = {
        line.strip().lower()
        for line in out_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    }

    unique = sorted(set(w.lower() for w in words if len(w) == 5))
    total_bad = 0
    batches = 0
    for i in range(0, len(unique), batch_size):
        if max_batches is not None and batches >= max_batches:
            break
        chunk = unique[i : i + batch_size]
        if not chunk:
            break
        bad = review_batch(chunk, api_key=api_key, model=model)
        new_lines = []
        for w in bad:
            if w not in existing:
                existing.add(w)
                new_lines.append(w)
                total_bad += 1
        if new_lines:
            with out_path.open("a", encoding="utf-8") as f:
                for w in new_lines:
                    f.write(w + "\n")
        batches += 1
        if i + batch_size < len(unique):
            time.sleep(sleep_s)
    return total_bad, batches
