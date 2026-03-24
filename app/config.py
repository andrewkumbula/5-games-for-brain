import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


load_dotenv(BASE_DIR / ".env")

DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data.db"))
WORDS_PATH = Path(os.getenv("WORDS_PATH", BASE_DIR / "words.json"))
BOT_TOKEN = os.getenv("BOT_TOKEN")
STRICT_DICTIONARY = os.getenv("STRICT_DICTIONARY", "1") == "1"
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "6"))
USE_KEYBOARD = os.getenv("USE_KEYBOARD", "1") == "1"
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
DAILY_JSON_PATH = Path(
    os.getenv("DAILY_JSON_PATH", str(BASE_DIR / "webapp" / "daily.json"))
).resolve()
DAILY_NO_REPEAT_DAYS = int(os.getenv("DAILY_NO_REPEAT_DAYS", "400"))
