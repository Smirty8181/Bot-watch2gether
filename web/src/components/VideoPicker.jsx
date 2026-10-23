import { useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "../telegram.js";
import { parseManyUrls } from "../video.js";
import { PLATFORM_LOGOS } from "./PlatformLogos.jsx";
import { IconX } from "./Icons.jsx";

const MAX_BYTES = 80 * 1024 * 1024;

const PLATFORMS = [
  { id: "youtube", label: "YouTube", hint: "Название ролика или ссылка" },
  { id: "rutube", label: "Rutube", hint: "Название ролика или ссылка" },
  { id: "vk", label: "VK", hint: "Название ролика или ссылка" },
  { id: "twitch", label: "Twitch", hint: "Канал, стрим или запись" },
  { id: "vimeo", label: "Vimeo", hint: "Название ролика или ссылка" },
  { id: "file", label: "Файл", hint: "Видео с телефона или ссылка на .mp4" },
];

const SEARCHABLE = new Set(["youtube", "rutube", "vk", "twitch", "vimeo"]);

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data);
      else reject(new Error(data.error || "Не удалось загрузить файл."));
    };
    xhr.onerror = () => reject(new Error("Сеть. Попробуй ещё раз."));
    xhr.send(file);
  });
}

export function VideoPicker({ open, onClose, onWatch, onQueue, onQueueMany, history = [], error }) {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState("youtube");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const [pickedName, setPickedName] = useState("");
  const fileRef = useRef(null);
  const many = useMemo(() => parseManyUrls(url), [url]);
  const parsed = many[0] || null;
  const meta = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const looksLikeUrl = /https?:\/\//i.test(url) || /youtu\.?be|rutube|vk\.com|twitch|vimeo/i.test(url);

  useEffect(() => {
    if (!open || !SEARCHABLE.has(platform) || looksLikeUrl || url.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return undefined;
    }
    const q = url.trim();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?p=${encodeURIComponent(platform)}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(Array.isArray(data.items) ? data.items : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 380);
    return () => clearTimeout(t);
  }, [open, platform, url, looksLikeUrl]);

  if (!open) return null;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        haptic("light");
      }
    } catch {
      haptic("error");
    }
  }

  async function watch(raw) {
    const value = raw || url;
    const list = parseManyUrls(value);
    if (!list.length) {
      setLocalErr(
        SEARCHABLE.has(platform)
          ? "Выбери ролик из списка или вставь ссылку."
          : "Не похоже на ссылку."
      );
      haptic("error");
      return;
    }
    if (list[0].platform === "youtube") {
      try {
        const res = await fetch(`/api/check-embed?url=${encodeURIComponent(list[0].url)}`);
        const data = await res.json();
        if (data && data.ok === false) {
          setLocalErr(data.error || "Это видео нельзя встроить.");
          haptic("error");
          return;
        }
      } catch {
        /* still allow */
      }
    }
    setBusy(true);
    setLocalErr("");
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setBusy(false);
      setLocalErr("Нет ответа сервера.");
    }, 12000);
    onWatch(list[0].url, (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setBusy(false);
      if (ok === false) {
        haptic("error");
        return;
      }
      if (list.length > 1) onQueueMany?.(list.slice(1).map((v) => v.url));
      setUrl("");
      setPickedName("");
      haptic("success");
      onClose();
    });
  }

  function queue(raw) {
    const value = raw || url;
    const list = parseManyUrls(value);
    if (!list.length) {
      setLocalErr(
        SEARCHABLE.has(platform)
          ? "Выбери ролик из списка или вставь ссылку."
          : "Не похоже на ссылку."
      );
      haptic("error");
      return;
    }
    const finish = (ok) => {
      setBusy(false);
      if (ok === false) {
        haptic("error");
        return;
      }
      setUrl("");
      setPickedName("");
      haptic("success");
    };
    setBusy(true);
    setLocalErr("");
    if (list.length === 1) onQueue(list[0].url, finish);
    else onQueueMany?.(list.map((v) => v.url), finish);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalErr("Файл больше 80 МБ.");
      haptic("error");
      return;
    }
    setPlatform("file");
    setLocalErr("");
    setPickedName(file.name);
    setBusy(true);
    setProgress(0);
    haptic("light");
    try {
      const data = await uploadFile(file, setProgress);
      const abs = new URL(data.url, window.location.origin);
      abs.searchParams.set("n", data.name || file.name);
      setUrl(abs.href);
      setProgress(1);
      haptic("success");
    } catch (err) {
      setLocalErr(err.message || "Не удалось загрузить файл.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  function pickPlatform(id) {
    setPlatform(id);
    haptic("light");
    if (id === "file") fileRef.current?.click();
  }

  const showErr = localErr || error;

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <h2>Выбрать видео</h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <IconX />
          </button>
        </header>
        <p className="hint">{meta.hint}</p>
        <div className="plat-grid">
          {PLATFORMS.map((p) => {
            const Logo = PLATFORM_LOGOS[p.id];
            return (
              <button
                key={p.id}
                type="button"
                className={`plat-tile ${platform === p.id ? "on" : ""}`}
                onClick={() => pickPlatform(p.id)}
                aria-label={p.label}
              >
                <Logo />
              </button>
            );
          })}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.ogg,.m4v"
          hidden
          onChange={onFile}
        />
        {platform === "file" && (
          <button className="file-btn" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Загрузка…" : pickedName ? "Другой файл" : "Выбрать с устройства"}
          </button>
        )}
        {busy && (
          <div className="upload-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {pickedName && !busy && <div className="detect">Файл: <b>{pickedName}</b></div>}
        <div className="picker-input">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              platform === "file"
                ? "или ссылка на .mp4"
                : SEARCHABLE.has(platform)
                  ? `Поиск на ${meta.label}`
                  : "Ссылка или несколько сразу"
            }
          />
          <button className="btn ghost compact" type="button" onClick={paste}>
            Буфер
          </button>
        </div>
        {SEARCHABLE.has(platform) && !looksLikeUrl && url.trim().length >= 2 && (
          <div className="yt-hits">
            {searching && <div className="detect">Ищем на {meta.label}…</div>}
            {!searching && hits.length === 0 && <div className="detect">Ничего не нашли. Попробуй другие слова.</div>}
            {hits.length > 0 && (
              <ul>
                {hits.map((v) => (
                  <li key={`${platform}-${v.id}`}>
                    {v.thumb ? <img src={v.thumb} alt="" /> : <span className="hist-ph" />}
                    <div>
                      <b>{v.title}</b>
                      <small>{v.author || meta.label}</small>
                    </div>
                    <button type="button" onClick={() => watch(v.url)}>
                      ▶
                    </button>
                    <button type="button" onClick={() => queue(v.url)}>
                      +
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {parsed && !pickedName && (
          <div className="detect">
            Понял: <b>{parsed.title}</b>
            {many.length > 1 ? ` и ещё ${many.length - 1}` : ""}
          </div>
        )}
        {showErr && <div className="err">{showErr}</div>}
        <div className="sheet-actions">
          <button className="btn primary" disabled={busy || !url.trim()} type="button" onClick={() => watch()}>
            Смотреть сейчас
          </button>
          <button className="btn ghost" disabled={busy || !url.trim()} type="button" onClick={() => queue()}>
            В очередь
          </button>
        </div>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            try {
              const urls = JSON.parse(localStorage.getItem("wt-playlist") || "[]");
              if (!urls.length) {
                setLocalErr("Нет сохранённого плейлиста.");
                return;
              }
              setBusy(true);
              onQueueMany?.(urls, (ok) => {
                setBusy(false);
                if (ok) {
                  haptic("success");
                  onClose();
                } else {
                  setLocalErr("Не удалось добавить плейлист.");
                  haptic("error");
                }
              });
            } catch {
              setLocalErr("Плейлист повреждён.");
            }
          }}
        >
          Загрузить плейлист
        </button>
        {history.length > 0 && (
          <div className="hist">
            <h3>Недавно в этой комнате</h3>
            <ul>
              {history.map((v) => (
                <li key={v.id}>
                  {v.thumb ? <img src={v.thumb} alt="" /> : <span className="hist-ph" />}
                  <div>
                    <b>{v.title}</b>
                    <small>{v.author || v.platform}</small>
                  </div>
                  <button type="button" onClick={() => watch(v.url)}>
                    ▶
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
