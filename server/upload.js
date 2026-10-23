import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";

const MAX_BYTES = 80 * 1024 * 1024;
const ALLOWED = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);

export function ensureMediaDir(rootDir) {
  const dir = path.join(rootDir, "data", "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extFor(name, mime) {
  const fromName = path.extname(name || "").toLowerCase();
  if (ALLOWED.has(fromName)) return fromName;
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("quicktime") || mime.includes("mov")) return ".mov";
  return ".mp4";
}

function safeName(raw) {
  let name = "video.mp4";
  try {
    name = decodeURIComponent(String(raw || "video.mp4"));
  } catch {
    /* keep default */
  }
  name = path.basename(name).replace(/[^\w.\- ()\u0400-\u04FF]/g, "_").slice(0, 80);
  return name || "video.mp4";
}

const FILE_TTL_MS = 6 * 60 * 60 * 1000;

function prune(dir, keep = 20) {
  let files = [];
  try {
    files = fs.readdirSync(dir).map((f) => ({
      f,
      t: fs.statSync(path.join(dir, f)).mtimeMs,
    }));
  } catch {
    return;
  }
  const cutoff = Date.now() - FILE_TTL_MS;
  for (const item of files) {
    if (item.t < cutoff) {
      try {
        fs.unlinkSync(path.join(dir, item.f));
      } catch {
        /* ignore */
      }
    }
  }
  files = files.filter((item) => item.t >= cutoff).sort((a, b) => b.t - a.t);
  for (const extra of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, extra.f));
    } catch {
      /* ignore */
    }
  }
}

export function startMediaCleanup(dir) {
  prune(dir);
  setInterval(() => prune(dir), 15 * 60 * 1000);
}

export function uploadMiddleware(dir) {
  return [
    express.raw({ type: () => true, limit: MAX_BYTES }),
    (req, res) => {
      try {
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length < 32) {
          res.status(400).json({ error: "Файл не получен." });
          return;
        }
        const display = safeName(req.headers["x-filename"]);
        const ext = extFor(display, String(req.headers["content-type"] || ""));
        const id = crypto.randomBytes(8).toString("hex");
        const file = `${id}${ext}`;
        fs.writeFileSync(path.join(dir, file), buf);
        prune(dir);
        res.json({ url: `/media/${file}`, name: display });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось сохранить файл." });
      }
    },
  ];
}

export function uploadErrorHandler(err, req, res, next) {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    res.status(413).json({ error: "Файл больше 80 МБ." });
    return;
  }
  next(err);
}
