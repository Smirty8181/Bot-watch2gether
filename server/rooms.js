import { parseVideoUrl } from "./video.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_MEMBERS = 40;
const MAX_MESSAGES = 200;
const EMPTY_TTL_MS = 90_000;
const ROOM_TTL_MS = 8 * 60 * 60 * 1000;

const rooms = new Map();
const lastRoomByUser = new Map();
const countdownTimers = new Map();
const COUNTDOWN_MS = 3000;

function now() {
  return Date.now();
}

function abortCountdown(code) {
  const timer = countdownTimers.get(code);
  if (timer) clearTimeout(timer);
  countdownTimers.delete(code);
  const room = rooms.get(code);
  if (room) room.countdown = null;
}

function makeCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return rooms.has(code) ? makeCode() : code;
}

function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    username: m.username || "",
    photo: m.photo || "",
    color: m.color,
    online: m.sockets.size > 0,
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    anyoneCanControl: room.anyoneCanControl,
    hasPassword: Boolean(room.password),
    members: [...room.members.values()].map(publicMember),
    video: room.video,
    queue: room.queue || [],
    history: room.history || [],
    playback: {
      playing: room.playback.playing,
      time: currentTime(room),
      updatedAt: now(),
      by: room.playback.by || "",
      action: room.playback.action || "",
    },
    countdown: room.countdown
      ? {
          by: room.countdown.by,
          time: room.countdown.time,
          playAt: room.countdown.playAt,
          in: Math.max(0, room.countdown.playAt - now()),
        }
      : null,
    messages: room.messages.slice(-80),
    createdAt: room.createdAt,
    stats: room.stats || emptyStats(room.createdAt),
  };
}

function emptyStats(startedAt) {
  return {
    startedAt: startedAt || now(),
    messages: 0,
    videos: 0,
    reactions: 0,
    queued: 0,
  };
}

function currentTime(room) {
  const { playing, time, updatedAt } = room.playback;
  if (!playing) return time;
  return Math.max(0, time + (now() - updatedAt) / 1000);
}

function colorFor(id) {
  const palette = ["#c45c7a", "#6b7fd7", "#3ea889", "#d4893a", "#8b6bb8", "#3d8ea8", "#c46b5c"];
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function system(room, text) {
  const msg = {
    id: `${now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "system",
    text,
    ts: now(),
  };
  room.messages.push(msg);
  if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
  return msg;
}

function pickHost(room) {
  const online = [...room.members.values()].filter((m) => m.sockets.size > 0);
  room.hostId = online[0]?.id || [...room.members.keys()][0] || null;
}

export function createRoom(user, socketId) {
  const code = makeCode();
  const member = {
    ...user,
    color: colorFor(user.id),
    sockets: new Set([socketId]),
  };
  const room = {
    code,
    hostId: user.id,
    anyoneCanControl: true,
    members: new Map([[user.id, member]]),
    video: null,
    queue: [],
    history: [],
    playback: { playing: false, time: 0, updatedAt: now(), by: "", action: "" },
    countdown: null,
    messages: [],
    createdAt: now(),
    lastActive: now(),
    password: "",
    stats: emptyStats(now()),
  };
  system(room, `${user.name} создал комнату`);
  rooms.set(code, room);
  lastRoomByUser.set(String(user.id), code);
  return publicRoom(room);
}

export function joinRoom(code, user, socketId, opts = {}) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) return { error: "Комната не найдена. Проверь код." };
  if (now() - room.createdAt > ROOM_TTL_MS) {
    rooms.delete(room.code);
    return { error: "Комната уже закрыта." };
  }
  if (room.password && String(opts.password || "") !== room.password) {
    return { error: "Нужен пароль комнаты.", needPassword: true };
  }

  let member = room.members.get(user.id);
  const isNew = !member;
  if (isNew && room.members.size >= MAX_MEMBERS) {
    return { error: "В комнате больше нет мест." };
  }
  if (!member) {
    member = { ...user, color: colorFor(user.id), sockets: new Set() };
    room.members.set(user.id, member);
  } else {
    member.name = user.name || member.name;
    member.photo = user.photo || member.photo;
    member.username = user.username || member.username;
  }
  member.sockets.add(socketId);
  member.offlineSince = 0;
  room.lastActive = now();
  lastRoomByUser.set(String(user.id), room.code);
  if (!room.hostId) pickHost(room);

  let joinedMsg = null;
  if (isNew) joinedMsg = system(room, `${member.name} присоединился`);

  return { room: publicRoom(room), joinedMsg };
}

export function detachSocket(socketId) {
  const updates = [];
  for (const room of rooms.values()) {
    for (const member of room.members.values()) {
      if (!member.sockets.delete(socketId)) continue;
      if (member.sockets.size === 0) member.offlineSince = now();
      room.lastActive = now();
      updates.push({ code: room.code, room: publicRoom(room) });
    }
  }
  return updates;
}

export function reapOffline() {
  const t = now();
  const updates = [];
  for (const room of rooms.values()) {
    for (const member of [...room.members.values()]) {
      if (member.sockets.size > 0) {
        member.offlineSince = 0;
        continue;
      }
      if (member.offlineSince && t - member.offlineSince > 15_000) {
        const leftMsg = system(room, `${member.name} вышел`);
        room.members.delete(member.id);
        if (room.hostId === member.id) pickHost(room);
        updates.push({ code: room.code, room: publicRoom(room), leftMsg });
      }
    }
  }
  return updates;
}

export function leaveSocket(socketId) {
  const updates = [];
  for (const room of rooms.values()) {
    for (const member of room.members.values()) {
      if (!member.sockets.delete(socketId)) continue;
      room.lastActive = now();
      let leftMsg = null;
      if (member.sockets.size === 0) {
        leftMsg = system(room, `${member.name} вышел`);
        room.members.delete(member.id);
        if (room.hostId === member.id) pickHost(room);
      }
      updates.push({
        code: room.code,
        room: publicRoom(room),
        leftMsg,
      });
    }
  }
  return updates;
}

function canControlRoom(room, userId) {
  return room.anyoneCanControl || room.hostId === userId;
}

export function setVideo(code, userId, rawUrl) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  if (!canControlRoom(room, userId)) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  const video = parseVideoUrl(rawUrl);
  if (!video) return { error: "Не получилось распознать ссылку." };
  if (room.video?.id && room.video.id !== video.id) {
    room.history = [room.video, ...(room.history || []).filter((v) => v.id !== room.video.id)].slice(0, 16);
  }
  abortCountdown(code);
  room.video = video;
  room.queue = room.queue || [];
  room.history = room.history || [];
  room.playback = { playing: false, time: 0, updatedAt: now(), by: member.name, action: "load" };
  room.lastActive = now();
  room.stats = room.stats || emptyStats(room.createdAt);
  room.stats.videos += 1;
  const msg = system(room, `${member.name} включил · ${video.title}`);
  return { room: publicRoom(room), msg };
}

export function patchVideoMeta(code, video) {
  const room = rooms.get(code);
  if (!room || !video) return null;
  if (room.video?.id === video.id) room.video = { ...room.video, ...video };
  room.history = room.history.map((item) => (item.id === video.id ? { ...item, ...video } : item));
  room.queue = room.queue.map((item) =>
    item.video.id === video.id ? { ...item, video: { ...item.video, ...video } } : item
  );
  return publicRoom(room);
}

export function addQueue(code, userId, rawUrl) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  const video = parseVideoUrl(rawUrl);
  if (!video) return { error: "Не получилось распознать ссылку." };
  const item = {
    id: `${now()}-${Math.random().toString(36).slice(2, 7)}`,
    video,
    by: member.name,
  };
  room.queue.push(item);
  if (room.queue.length > 40) room.queue.shift();
  room.lastActive = now();
  room.stats = room.stats || emptyStats(room.createdAt);
  room.stats.queued += 1;
  const msg = system(room, `${member.name} в очередь · ${video.title}`);
  return { room: publicRoom(room), msg };
}

export function playQueue(code, userId, itemId) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  if (!canControlRoom(room, userId)) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  const idx = room.queue.findIndex((item) => item.id === itemId);
  if (idx < 0) return { error: "Этого уже нет в очереди." };
  const [item] = room.queue.splice(idx, 1);
  return setVideo(code, userId, item.video.url);
}

export function removeQueue(code, userId, itemId) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  if (!canControlRoom(room, userId)) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  room.queue = room.queue.filter((item) => item.id !== itemId);
  room.lastActive = now();
  return { room: publicRoom(room) };
}

export function playNext(code, userId) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  if (!canControlRoom(room, userId)) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  if (!room.queue.length) return { done: true, room: publicRoom(room) };
  const item = room.queue[0];
  return playQueue(code, userId, item.id);
}

export function transferHost(code, userId, targetId) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  if (room.hostId !== userId) return { error: "Только хост передаёт управление." };
  const target = room.members.get(String(targetId));
  if (!target) return { error: "Этого человека нет в комнате." };
  room.hostId = target.id;
  room.lastActive = now();
  const msg = system(room, `Хост теперь ${target.name}`);
  return { room: publicRoom(room), msg };
}

export function setPlayback(code, userId, payload) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  if (!room.anyoneCanControl && room.hostId !== userId) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  abortCountdown(code);
  const time = Number(payload.time);
  const nextPlaying = Boolean(payload.playing);
  const prev = room.playback;
  let action = "seek";
  if (nextPlaying !== Boolean(prev.playing)) action = nextPlaying ? "play" : "pause";
  else if (Number.isFinite(time) && Math.abs((Number.isFinite(prev.time) ? prev.time : 0) - time) < 1.2) {
    action = nextPlaying ? "play" : "pause";
  }
  room.playback = {
    playing: nextPlaying,
    time: Number.isFinite(time) ? Math.max(0, time) : currentTime(room),
    updatedAt: now(),
    by: member.name,
    action,
  };
  room.lastActive = now();
  return { room: publicRoom(room) };
}

export function requestPlay(code, userId, payload = {}) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  if (!room.anyoneCanControl && room.hostId !== userId) {
    return { error: "Управляет только хост.", room: publicRoom(room) };
  }
  if (room.playback.playing) {
    return setPlayback(code, userId, { playing: true, time: payload.time });
  }
  abortCountdown(code);
  const time = Number.isFinite(Number(payload.time)) ? Math.max(0, Number(payload.time)) : currentTime(room);
  room.countdown = {
    by: member.name,
    userId,
    playAt: now() + COUNTDOWN_MS,
    time,
  };
  room.playback = {
    ...room.playback,
    time,
    playing: false,
    updatedAt: now(),
    by: member.name,
    action: "play",
  };
  room.lastActive = now();
  return { room: publicRoom(room), countdown: room.countdown };
}

export function armCountdown(code, onFire) {
  const prev = countdownTimers.get(code);
  if (prev) clearTimeout(prev);
  const room = rooms.get(code);
  if (!room?.countdown) return;
  const wait = Math.max(0, room.countdown.playAt - now());
  const timer = setTimeout(() => {
    countdownTimers.delete(code);
    const live = rooms.get(code);
    if (!live?.countdown) return;
    const memberId = live.countdown.userId || live.hostId;
    const time = live.countdown.time;
    live.countdown = null;
    const who = live.members.has(memberId) ? memberId : live.hostId;
    if (!who) return;
    const result = setPlayback(code, who, { playing: true, time });
    onFire?.(result);
  }, wait);
  countdownTimers.set(code, timer);
}

export function addChat(code, userId, text, replyTo) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  const clean = String(text || "").trim().slice(0, 500);
  if (!clean) return { error: "Пустое сообщение." };
  const msg = {
    id: `${now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "chat",
    userId: member.id,
    name: member.name,
    color: member.color,
    photo: member.photo,
    text: clean,
    ts: now(),
    reactions: {},
  };
  if (replyTo?.id && replyTo?.text) {
    msg.reply = {
      id: String(replyTo.id).slice(0, 40),
      name: String(replyTo.name || "").slice(0, 40),
      text: String(replyTo.text || "").slice(0, 80),
    };
  }
  room.messages.push(msg);
  if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
  room.lastActive = now();
  room.stats = room.stats || emptyStats(room.createdAt);
  room.stats.messages += 1;
  return { msg };
}

const REACT_EMOJI = new Set(["🔥", "❤️", "😂", "👏", "👀", "💀", "😮", "🎉"]);

export function toggleReact(code, userId, msgId, emoji) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  const member = room.members.get(userId);
  if (!member) return { error: "Сначала зайди в комнату." };
  if (!REACT_EMOJI.has(emoji)) return { error: "Не та реакция." };
  const msg = room.messages.find((m) => m.id === msgId && m.type === "chat");
  if (!msg) return { error: "Сообщение уже исчезло." };
  msg.reactions = msg.reactions || {};
  const list = new Set(msg.reactions[emoji] || []);
  if (list.has(userId)) list.delete(userId);
  else list.add(userId);
  if (list.size) msg.reactions[emoji] = [...list];
  else delete msg.reactions[emoji];
  room.lastActive = now();
  room.stats = room.stats || emptyStats(room.createdAt);
  room.stats.reactions += 1;
  return { msg, name: member.name, emoji };
}

export function setPassword(code, userId, password) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  if (room.hostId !== userId) return { error: "Только хост ставит пароль." };
  room.password = String(password || "").trim().slice(0, 32);
  room.lastActive = now();
  const msg = system(room, room.password ? "Комната закрыта паролем" : "Пароль снят");
  return { room: publicRoom(room), msg };
}

export function peekRoom(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) return null;
  if (now() - room.createdAt > ROOM_TTL_MS) return null;
  const online = [...room.members.values()].filter((m) => m.sockets.size > 0).length;
  if (!online && now() - room.lastActive > EMPTY_TTL_MS) return null;
  return {
    code: room.code,
    online,
    title: room.video?.title || "",
    hasPassword: Boolean(room.password),
  };
}

export function setControl(code, userId, anyoneCanControl) {
  const room = rooms.get(code);
  if (!room) return { error: "Комната не найдена." };
  if (room.hostId !== userId) return { error: "Только хост меняет права." };
  room.anyoneCanControl = Boolean(anyoneCanControl);
  room.lastActive = now();
  const msg = system(room, anyoneCanControl ? "Управлять плеером могут все" : "Управляет только хост");
  return { room: publicRoom(room), msg };
}

export function patchMemberPhoto(code, userId, photo) {
  const room = rooms.get(code);
  if (!room || !photo) return null;
  const member = room.members.get(String(userId));
  if (!member) return null;
  member.photo = String(photo).slice(0, 500);
  const uid = String(userId);
  for (const msg of room.messages) {
    if (msg.type === "chat" && msg.userId === uid) msg.photo = member.photo;
  }
  return publicRoom(room);
}

export function getRoom(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  return room ? publicRoom(room) : null;
}

function userFromTelegram(from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim().slice(0, 40);
  return {
    id: String(from.id),
    name: name || "Гость",
    username: from.username || "",
    photo: "",
  };
}

export function lastRoomForUser(userId) {
  const id = String(userId);
  const hinted = lastRoomByUser.get(id);
  if (hinted && rooms.get(hinted)?.members.has(id)) return rooms.get(hinted);
  for (const room of rooms.values()) {
    if (room.members.has(id)) {
      lastRoomByUser.set(id, room.code);
      return room;
    }
  }
  return null;
}

export function playForTelegramUser(from, url, mode = "now") {
  const user = userFromTelegram(from);
  let room = lastRoomForUser(user.id);
  if (!room) {
    createRoom(user, `bot-${user.id}`);
    room = lastRoomForUser(user.id);
  } else {
    const member = room.members.get(user.id);
    if (member) {
      member.name = user.name || member.name;
      member.username = user.username || member.username;
    }
  }
  if (!room) return { error: "Не получилось открыть комнату." };
  const result = mode === "queue" ? addQueue(room.code, user.id, url) : setVideo(room.code, user.id, url);
  return result;
}

export function sweepRooms() {
  const t = now();
  for (const [code, room] of rooms) {
    const online = [...room.members.values()].some((m) => m.sockets.size > 0);
    if (!online && t - room.lastActive > EMPTY_TTL_MS) rooms.delete(code);
    else if (t - room.createdAt > ROOM_TTL_MS) rooms.delete(code);
  }
}

setInterval(sweepRooms, 30_000);
