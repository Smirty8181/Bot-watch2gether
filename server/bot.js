import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { telegramAgent } from "./telegramAgent.js";

let webappUrl = "";

export function getWebappUrl() {
  return webappUrl;
}

function openKeyboard(url) {
  return new Keyboard().webApp("🎬 Открыть кинотеатр", url).resized().persistent();
}

function openInline(url, label = "Открыть мини-приложение") {
  return new InlineKeyboard().webApp(label, url);
}

export function createBot(token) {
  const bot = new Bot(token, {
    client: {
      timeoutSeconds: 60,
      baseFetchConfig: {
        compress: true,
        agent: telegramAgent,
      },
    },
  });

  bot.command("start", async (ctx) => {
    const payload = (ctx.match || "").trim().toUpperCase();
    const base = webappUrl || "https://t.me/sovmestniprosmotrbot";
    const url = payload ? `${webappUrl}?room=${encodeURIComponent(payload)}` : webappUrl;

    if (!webappUrl) {
      await ctx.reply(
        "Мини-приложение ещё запускается. Подожди несколько секунд и нажми /start ещё раз."
      );
      return;
    }

    if (payload) {
      await ctx.reply(
        `Тебя пригласили в комнату <b>${payload}</b>.\nЗаходи — фильм уже, скорее всего, начался.`,
        {
          parse_mode: "HTML",
          reply_markup: openInline(url, `Войти в ${payload}`),
        }
      );
      return;
    }

    await ctx.reply(
      [
        "<b>Совместный просмотр</b>",
        "",
        "Создай комнату, позови друзей и смотрите одно видео.",
        "Поиск YouTube — внутри приложения, без копирования ссылок.",
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: openKeyboard(base),
      }
    );

    await ctx.reply("Или нажми кнопку ниже 👇", {
      reply_markup: openInline(base, "Создать комнату"),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "<b>Как это работает</b>",
        "",
        "1. Открой кинотеатр и создай комнату",
        "2. Нажми + и найди видео по названию",
        "3. Пригласи друзей кодом комнаты",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  bot.on("inline_query", async (ctx) => {
    const code = (ctx.inlineQuery.query || "").trim().toUpperCase();
    if (webappUrl && /^[A-Z0-9]{6}$/.test(code)) {
      const link = `https://t.me/sovmestniprosmotrbot?start=${code}`;
      await ctx.answerInlineQuery(
        [
          {
            type: "article",
            id: code,
            title: `Комната ${code}`,
            description: "Приглашение смотреть вместе",
            input_message_content: {
              message_text: `🎬 Смотрим вместе!\nКомната: <b>${code}</b>\n${link}`,
              parse_mode: "HTML",
            },
            reply_markup: new InlineKeyboard().url("Открыть бота", link),
          },
        ],
        { cache_time: 0, is_personal: true }
      );
      return;
    }

    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: "hint",
          title: "Введи код комнаты",
          description: "6 символов, например K7MP2Q",
          input_message_content: {
            message_text: "Открой @sovmestniprosmotrbot и создай комнату, чтобы пригласить друзей.",
          },
        },
      ],
      { cache_time: 0, is_personal: true }
    );
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error ?? err);
  });

  return bot;
}

async function safeApi(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`${label}:`, err.message || err);
  }
}

export async function configureWebApp(bot, url) {
  webappUrl = url.replace(/\/$/, "");
  await safeApi("setChatMenuButton", () =>
    bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Смотреть",
        web_app: { url: webappUrl },
      },
    })
  );
  await safeApi("setMyCommands", () =>
    bot.api.setMyCommands([
      { command: "start", description: "Открыть совместный просмотр" },
      { command: "help", description: "Как пользоваться" },
    ])
  );
  console.log("Mini App URL:", webappUrl);
}
