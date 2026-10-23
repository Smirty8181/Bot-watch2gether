# Совместный просмотр

Telegram-бот с мини-приложением: комнаты, приглашения, синхронный плеер и чат.

Бот: [t.me/sovmestniprosmotrbot](https://t.me/sovmestniprosmotrbot)

## Что умеет

- Создать комнату или войти по коду из 6 символов
- Пригласить друзей ссылкой или кодом
- Смотреть YouTube (синхрон play/pause/seek), Rutube, VK, Twitch, Vimeo и прямые mp4
- Живой чат внутри комнаты

## Запуск

Нужны Node.js 18+ и токен бота в `.env`:

```
BOT_TOKEN=...
PORT=3000
WEBAPP_URL=
```

Если `WEBAPP_URL` пустой, сервер сам поднимает HTTPS-туннель Cloudflare — это нужно Telegram Mini Apps.

На части сетей `api.telegram.org` режется провайдером. В `.env` уже стоит `TELEGRAM_API_IP=149.154.167.220` — рабочий адрес Bot API. Если бот не выходит в онлайн, попробуй другой IP из `149.154.167.99` / `149.154.167.50`.

```bash
npm install
npm start
```

В логе появится публичный URL. Бот сам повесит кнопку меню «Смотреть».

Локальная разработка без Telegram:

```bash
npm install
npm run dev
```

Открой http://127.0.0.1:5173 — гостевой пользователь создастся автоматически.

## BotFather

После первого запуска:

1. Открой [@BotFather](https://t.me/BotFather) → `/mybots` → бот → **Bot Settings**
2. **Menu Button** уже ставится кодом, но можно закрепить Mini App: **Configure Mini App** и вставить тот же HTTPS URL
3. Добавь описание, about и аватар

Приглашения работают так: `https://t.me/sovmestniprosmotrbot?start=КОД`

## Важно

Туннель `trycloudflare.com` меняется после каждого перезапуска. Для постоянного адреса укажи свой HTTPS в `WEBAPP_URL` (VPS, Railway, Render, Cloudflare named tunnel).
