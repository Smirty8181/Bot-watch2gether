import fs from "fs";
import https from "https";
import path from "path";
import { telegramAgent } from "./telegramAgent.js";

export function ensureAvatarDir(root) {
  const dir = path.join(root, "data", "avatars");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function avatarPath(dir, userId) {
  return path.join(dir, `${String(userId).replace(/\D/g, "")}.jpg`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: telegramAgent }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(String(res.statusCode)));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

export async function fetchTelegramAvatar(bot, token, userId, dir) {
  const id = String(userId).replace(/\D/g, "");
  if (!id) return "";
  const dest = avatarPath(dir, id);
  try {
    if (fs.existsSync(dest) && Date.now() - fs.statSync(dest).mtimeMs < 12 * 60 * 60 * 1000) {
      return `/api/avatar/${id}`;
    }
  } catch {
    /* rewrite */
  }
  const photos = await bot.api.getUserProfilePhotos(Number(id), { limit: 1 });
  const sizes = photos.photos?.[0];
  if (!sizes?.length) return "";
  const best = sizes[sizes.length - 1];
  const file = await bot.api.getFile(best.file_id);
  if (!file.file_path) return "";
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const tmp = `${dest}.part`;
  await download(url, tmp);
  fs.renameSync(tmp, dest);
  return `/api/avatar/${id}`;
}
