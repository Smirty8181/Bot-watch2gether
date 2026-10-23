import { useState } from "react";
import { copyText, haptic, shareInvite } from "../telegram.js";
import { THEMES } from "../theme.js";
import { IconX } from "./Icons.jsx";

export function Settings({
  open,
  onClose,
  room,
  me,
  theme,
  onTheme,
  onControl,
  onHost,
  onPassword,
  onLeave,
  onCopied,
}) {
  const [pass, setPass] = useState("");
  if (!open) return null;
  const isHost = room.hostId === me.id;
  const host = room.members.find((m) => m.id === room.hostId);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <h2>Комната</h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Закрыть">
            <IconX />
          </button>
        </header>

        <p className="hint">Тема</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card ${theme === t.id ? "on" : ""}`}
              onClick={() => {
                onTheme(t.id);
                haptic("light");
              }}
            >
              <span className="swatch" style={{ background: t.bg, boxShadow: `inset 0 0 0 3px ${t.accent}` }} />
              <b>{t.name}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>

        <div className="setting-block">
          <div
            className="code-xl"
            onClick={async () => {
              const ok = await copyText(room.code);
              haptic(ok ? "success" : "error");
              onCopied?.(ok ? "Код скопирован" : "Не удалось скопировать");
            }}
          >
            {room.code}
            <small>нажми, чтобы скопировать</small>
          </div>
          <div className="sheet-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                shareInvite(room.code);
                haptic("medium");
              }}
            >
              Пригласить друзей
            </button>
          </div>
        </div>

        <label className={`toggle-card ${!isHost ? "dim" : ""}`}>
          <div>
            <b>Все управляют плеером</b>
            <small>Иначе play/pause только у хоста</small>
          </div>
          <input
            type="checkbox"
            checked={room.anyoneCanControl}
            disabled={!isHost}
            onChange={(e) => onControl(e.target.checked)}
          />
        </label>

        <div className="setting-block">
          <p className="hint">Хост: {host?.name || "—"}</p>
          {isHost && (
            <ul className="host-list">
              {room.members
                .filter((m) => m.id !== me.id)
                .map((m) => (
                  <li key={m.id}>
                    <span>{m.name}</span>
                    <button type="button" className="btn ghost compact" onClick={() => onHost(m.id)}>
                      Сделать хостом
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {isHost && (
          <div className="setting-block">
            <p className="hint">Пароль комнаты</p>
            <form
              className="join-row"
              onSubmit={(e) => {
                e.preventDefault();
                onPassword?.(pass);
                haptic("success");
                onCopied?.(pass ? "Пароль установлен" : "Пароль снят");
                setPass("");
              }}
            >
              <input
                className="code-input"
                style={{ letterSpacing: "0.04em" }}
                type="text"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={room.hasPassword ? "Новый пароль или пусто" : "Задать пароль"}
              />
              <button className="btn ghost" type="submit">
                Ок
              </button>
            </form>
          </div>
        )}

        {room.stats && (
          <div className="stats">
            <p className="hint">Итоги вечера</p>
            <div className="stat-row">
              <span>{room.stats.videos} видео</span>
              <span>{room.stats.messages} сообщ.</span>
              <span>{room.stats.queued} в очереди</span>
              <span>{room.stats.reactions} реакций</span>
            </div>
          </div>
        )}

        <button
          className="btn danger"
          type="button"
          onClick={() => {
            onClose();
            onLeave();
          }}
        >
          Выйти из комнаты
        </button>
      </div>
    </div>
  );
}
