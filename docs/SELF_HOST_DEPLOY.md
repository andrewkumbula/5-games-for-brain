# Self-host deploy (one server)

This setup keeps both bot and Mini App on your own server and updates via git.

## 1) Choose non-conflicting host

Because you already have a site and another bot, use a separate subdomain:

- example: `wordle.kumbuland.ru`

Do not reuse existing `server_name` in nginx.

## 2) Copy project to server

```bash
sudo mkdir -p /opt/fiveletters
sudo chown -R $USER:$USER /opt/fiveletters
git clone <your-repo-url> /opt/fiveletters
cd /opt/fiveletters
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 3) Configure `.env`

`/opt/fiveletters/.env`:

```env
BOT_TOKEN=...
WEBAPP_URL=https://wordle.kumbuland.ru/webapp/index.html
DB_PATH=data.db
WORDS_PATH=words.json
STRICT_DICTIONARY=1
MAX_ATTEMPTS=6
USE_KEYBOARD=1
```

## 4) Install systemd service (new one, no conflict)

```bash
sudo cp deploy/systemd/fiveletters-bot.service /etc/systemd/system/fiveletters-bot.service
sudo systemctl daemon-reload
sudo systemctl enable fiveletters-bot
sudo systemctl start fiveletters-bot
sudo systemctl status fiveletters-bot --no-pager
```

If your server user is not `www-data`, edit `User=` and `Group=` in service file before copy.

## 5) Install nginx site (separate server block)

```bash
sudo cp deploy/nginx/fiveletters.conf /etc/nginx/sites-available/fiveletters.conf
sudo ln -s /etc/nginx/sites-available/fiveletters.conf /etc/nginx/sites-enabled/fiveletters.conf
sudo nginx -t
sudo systemctl reload nginx
```

Edit these values in config before reload:

- `server_name wordle.kumbuland.ru;`
- `root /opt/fiveletters;`

## 6) HTTPS certificate

```bash
sudo certbot --nginx -d wordle.kumbuland.ru
```

## 7) Updates through git

On each update:

```bash
cd /opt/fiveletters
bash deploy/scripts/deploy.sh
```

This does:

- `git pull --ff-only`
- install dependencies
- restart `fiveletters-bot`

## 8) Quick checks

- `curl -I https://wordle.kumbuland.ru/webapp/index.html`
- `curl -I https://wordle.kumbuland.ru/words.json`
- open bot `/start` and check button `Открыть игру`
