import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import {
  addChat,
  addQueue,
  createRoom,
  detachSocket,
  joinRoom,
  leaveSocket,
  patchVideoMeta,
  peekRoom,
  patchMemberPhoto,
  playNext,
  playQueue,
  reapOffline,
  removeQueue,
  requestPlay,
  setControl,
  setPassword,
  setPlayback,
  setVideo,
  toggleReact,
  transferHost,
  armCountdown,
} from "./rooms.js";
import { searchYoutube } from "./ytsearch.js";
import { searchPlatform } from "./search.js";
import { configureWebApp, createBot } from "./bot.js";
import { startCloudflareTunnel } from "./tunnel.js";
import { checkEmbed, enrichVideo, parseVideoUrl } from "./video.js";
import { ensureMediaDir, startMediaCleanup, uploadErrorHandler, uploadMiddleware } from "./upload.js";
import { ensureAvatarDir, fetchTelegramAvatar, avatarPath } from "./avatars.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = process.env.BOT_TOKEN;
const dist = path.join(__dirname, "..", "web", "dist");
const mediaDir = ensureMediaDir(path.join(__dirname, ".."));
const avatarDir = ensureAvatarDir(path.join(__dirname, ".."));

if (!TOKEN) {
  console.error("Нет BOT_TOKEN в .env");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/check-embed", async (req, res) => {
  const video = parseVideoUrl(String(req.query.url || ""));
  if (!video) {
    res.json({ ok: false, error: "Не получилось распознать ссылку." });
    return;
  }
  const checked = await checkEmbed(video);
  res.json(checked);
});

app.get("/api/yt-search", async (req, res) => {
  try {
    const items = await searchYoutube(req.query.q);
    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const items = await searchPlatform(req.query.p || req.query.platform, req.query.q);
    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

app.get("/api/avatar/:id", (req, res) => {
  const id = String(req.params.id || "").replace(/\D/g, "");
  const file = avatarPath(avatarDir, id);
  if (!id || !fs.existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.type("jpg").sendFile(file);
});

app.use("/media", express.static(mediaDir));
app.post("/api/upload", ...uploadMiddleware(mediaDir));
app.use(uploadErrorHandler);

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io") || req.path.startsWith("/media")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

const chatCooldown = new Map();
let bot = null;

function emitRoom(code, event, payload) {
  io.to(code).emit(event, payload);
}

function notifyRoom(room, exceptId, text) {
  if (!bot || !room?.members) return;
  for (const m of room.members) {
    if (m.id === exceptId || !/^\d+$/.test(m.id)) continue;
    bot.api.sendMessage(m.id, text, { disable_notification: false }).catch(() => {});
  }
}

async function hydrateAvatar(code, user) {
  if (!bot || !user?.id || !/^\d+$/.test(user.id)) return;
  try {
    const photo = await fetchTelegramAvatar(bot, TOKEN, user.id, avatarDir);
    if (!photo) return;
    const next = patchMemberPhoto(code, user.id, photo);
    if (next) emitRoom(code, "room", next);
  } catch {
    /* no telegram photo */
  }
}

io.on("connection", (socket) => {
  socket.data.userId = null;
  socket.data.roomCode = null;

  socket.on("join", (payload = {}, ack) => {
    const user = sanitizeUser(payload.user);
    if (!user) {
      ack?.({ error: "Не удалось определить пользователя." });
      return;
    }
    socket.data.userId = user.id;

    const previous = socket.data.roomCode;
    if (previous) {
      socket.leave(previous);
      const left = leaveSocket(socket.id);
      for (const u of left) emitRoom(u.code, "room", u.room);
    }

    let result;
    if (payload.create) {
      result = { room: createRoom(user, socket.id) };
    } else {
      result = joinRoom(payload.code, user, socket.id, { password: payload.password });
    }

    if (result.error) {
      ack?.(result);
      return;
    }

    const room = result.room;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    emitRoom(room.code, "room", room);
    if (result.joinedMsg) emitRoom(room.code, "chat", result.joinedMsg);
    ack?.({ room });
    if (result.joinedMsg) {
      notifyRoom(room, socket.data.userId, `👋 ${user.name} зашёл в комнату ${room.code}`);
    }
    hydrateAvatar(room.code, user);
    for (const m of room.members || []) {
      if (m.id !== user.id && !m.photo) hydrateAvatar(room.code, m);
    }
  });

  socket.on("peek", (payload = {}, ack) => {
    ack?.({ room: peekRoom(payload.code) });
  });

  socket.on("setVideo", async (payload = {}, ack) => {
    const code = socket.data.roomCode;
    const result = setVideo(code, socket.data.userId, payload.url);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(code, "room", result.room);
    if (result.msg) emitRoom(code, "chat", result.msg);
    ack?.({ ok: true, room: result.room });
    notifyRoom(result.room, socket.data.userId, `🎬 В комнате ${code}: ${result.room.video?.title || "новое видео"}`);
    const enriched = await enrichVideo(result.room.video);
    const next = patchVideoMeta(code, enriched);
    if (next) emitRoom(code, "room", next);
  });

  socket.on("queueAdd", async (payload = {}, ack) => {
    const code = socket.data.roomCode;
    const result = addQueue(code, socket.data.userId, payload.url);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(code, "room", result.room);
    if (result.msg) emitRoom(code, "chat", result.msg);
    ack?.({ ok: true });
    const last = result.room.queue.at(-1);
    if (last) {
      const enriched = await enrichVideo(last.video);
      const next = patchVideoMeta(code, enriched);
      if (next) emitRoom(code, "room", next);
    }
  });

  socket.on("queueAddMany", async (payload = {}, ack) => {
    const code = socket.data.roomCode;
    const urls = Array.isArray(payload.urls) ? payload.urls : [];
    let last = null;
    for (const url of urls.slice(0, 20)) {
      last = addQueue(code, socket.data.userId, url);
      if (last?.error) {
        ack?.(last);
        return;
      }
    }
    if (!last?.room) {
      ack?.({ error: "Нет ссылок." });
      return;
    }
    emitRoom(code, "room", last.room);
    if (last.msg) emitRoom(code, "chat", last.msg);
    ack?.({ ok: true, added: urls.length });
  });

  socket.on("queuePlay", (payload = {}, ack) => {
    const code = socket.data.roomCode;
    const result = playQueue(code, socket.data.userId, payload.id);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(code, "room", result.room);
    if (result.msg) emitRoom(code, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("queueRemove", (payload = {}, ack) => {
    const result = removeQueue(socket.data.roomCode, socket.data.userId, payload.id);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "room", result.room);
    ack?.({ ok: true });
  });

  socket.on("playNext", (payload = {}, ack) => {
    const result = playNext(socket.data.roomCode, socket.data.userId);
    if (result.error) {
      ack?.(result);
      return;
    }
    if (result.done) {
      ack?.({ ok: true });
      return;
    }
    emitRoom(socket.data.roomCode, "room", result.room);
    if (result.msg) emitRoom(socket.data.roomCode, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("host", (payload = {}, ack) => {
    const result = transferHost(socket.data.roomCode, socket.data.userId, payload.targetId);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "room", result.room);
    if (result.msg) emitRoom(socket.data.roomCode, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("playback", (payload = {}, ack) => {
    const code = socket.data.roomCode;
    if (payload.playing) {
      const result = requestPlay(code, socket.data.userId, payload);
      if (result?.error) {
        ack?.(result);
        if (result.room) emitRoom(code, "room", result.room);
        return;
      }
      if (!result?.room) {
        ack?.({ error: "Не удалось запустить воспроизведение." });
        return;
      }
      if (result.countdown) {
        emitRoom(code, "room", result.room);
        armCountdown(code, (fired) => {
          if (!fired?.room) return;
          emitRoom(code, "room", fired.room);
          io.to(code).emit("playback", fired.room.playback);
        });
        ack?.({ ok: true });
        return;
      }
      io.to(code).emit("playback", result.room.playback);
      ack?.({ ok: true });
      return;
    }
    const result = setPlayback(code, socket.data.userId, payload);
    if (result?.error) {
      ack?.(result);
      if (result.room) emitRoom(code, "room", result.room);
      return;
    }
    if (result?.room) {
      io.to(code).emit("playback", result.room.playback);
      emitRoom(code, "room", result.room);
    }
    ack?.({ ok: true });
  });

  socket.on("chat", (payload = {}, ack) => {
    const key = `${socket.data.userId}`;
    const last = chatCooldown.get(key) || 0;
    if (Date.now() - last < 250) {
      ack?.({ error: "Слишком быстро." });
      return;
    }
    chatCooldown.set(key, Date.now());
    const result = addChat(socket.data.roomCode, socket.data.userId, payload.text, payload.reply);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("msgReact", (payload = {}, ack) => {
    const result = toggleReact(socket.data.roomCode, socket.data.userId, payload.msgId, payload.emoji);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "msgReact", result.msg);
    emitRoom(socket.data.roomCode, "float", { id: result.msg.id + payload.emoji + Date.now(), text: payload.emoji });
    ack?.({ ok: true });
  });

  socket.on("float", (payload = {}) => {
    const emoji = String(payload.text || "");
    if (!["🔥", "❤️", "😂", "👏", "👀", "💀", "😮", "🎉"].includes(emoji)) return;
    emitRoom(socket.data.roomCode, "float", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: emoji,
    });
  });

  socket.on("password", (payload = {}, ack) => {
    const result = setPassword(socket.data.roomCode, socket.data.userId, payload.password);
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "room", result.room);
    if (result.msg) emitRoom(socket.data.roomCode, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("control", (payload = {}, ack) => {
    const result = setControl(
      socket.data.roomCode,
      socket.data.userId,
      payload.anyoneCanControl
    );
    if (result.error) {
      ack?.(result);
      return;
    }
    emitRoom(socket.data.roomCode, "room", result.room);
    if (result.msg) emitRoom(socket.data.roomCode, "chat", result.msg);
    ack?.({ ok: true });
  });

  socket.on("leave", () => {
    const code = socket.data.roomCode;
    if (code) socket.leave(code);
    socket.data.roomCode = null;
    const updates = leaveSocket(socket.id);
    for (const u of updates) {
      emitRoom(u.code, "room", u.room);
      if (u.leftMsg) emitRoom(u.code, "chat", u.leftMsg);
    }
  });

  socket.on("disconnect", () => {
    const updates = detachSocket(socket.id);
    for (const u of updates) emitRoom(u.code, "room", u.room);
  });
});

function sanitizeUser(user) {
  if (!user || user.id == null) return null;
  const name = String(user.name || "Гость").trim().slice(0, 40) || "Гость";
  return {
    id: String(user.id).slice(0, 40),
    name,
    username: String(user.username || "").slice(0, 40),
    photo: String(user.photo || "").slice(0, 500),
  };
}

const botInstance = createBot(TOKEN);
bot = botInstance;

setInterval(() => {
  for (const u of reapOffline()) {
    emitRoom(u.code, "room", u.room);
    if (u.leftMsg) emitRoom(u.code, "chat", u.leftMsg);
  }
}, 4000);

startMediaCleanup(mediaDir);

httpServer.listen(PORT, HOST, async () => {
  console.log(`Server http://127.0.0.1:${PORT}`);
  try {
    let publicUrl = (process.env.WEBAPP_URL || "").trim();
    if (!publicUrl) {
      console.log("WEBAPP_URL не задан — поднимаю Cloudflare-туннель...");
      console.log("Для постоянного URL укажи WEBAPP_URL=https://твой-домен в .env (VPS + HTTPS).");
      const tunnel = await startCloudflareTunnel(PORT);
      publicUrl = tunnel.url;
      tunnel.child.on("exit", () => {
        console.error("Туннель закрылся. Перезапусти сервер, чтобы получить новый URL.");
      });
    }
    await configureWebApp(botInstance, publicUrl);
    botInstance.start({
      onStart: (info) => console.log(`Bot @${info.username} online`),
    });
  } catch (err) {
    console.error(err);
    console.error("Бот запущен без Mini App URL. Укажи WEBAPP_URL в .env и перезапусти.");
    botInstance.start({
      onStart: (info) => console.log(`Bot @${info.username} online (без webapp url)`),
    });
  }
});
