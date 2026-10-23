import { useEffect, useState } from "react";
import { haptic } from "../telegram.js";
import { THEMES } from "../theme.js";

export function Lobby({ onCreate, onJoin, busy, error, needPassword, preset, saved, theme, onTheme }) {
  const [code, setCode] = useState(preset || "");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (preset && preset.length === 6 && !code) setCode(preset);
  }, [preset, code]);

  function onCode(e) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  }

  return (
    <div className="lobby">
      <div className="mesh" />

      <header className="lobby-hero">
        <div className="brand">together<span>.</span></div>
        <div className="scene" aria-hidden="true">
          <div className="scene-screen">
            <span className="scene-play" />
          </div>
          <div className="scene-people">
            <span className="dude cream" />
            <span className="dude pink" />
          </div>
          <div className="scene-sofa" />
        </div>
        <h1>Смотрим вместе</h1>
        <p className="lede">Одна комната — одно видео. Чат и синхрон.</p>
      </header>

      <div className="panel">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            haptic("medium");
            onCreate();
          }}
        >
          {busy ? "Подключаемся…" : "Начать вечеринку"}
        </button>

        <div className="or">или код комнаты</div>

        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) {
              haptic("medium");
              onJoin(code, password);
            }
          }}
        >
          <input
            className="code-input"
            value={code}
            onChange={onCode}
            placeholder="K7MP2Q"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn ghost" disabled={busy || code.length !== 6} type="submit">
            Войти
          </button>
        </form>
        {needPassword && (
          <input
            className="code-input"
            style={{ marginTop: 8, letterSpacing: "0.08em" }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль комнаты"
          />
        )}
        {error && <div className="err">{error}</div>}
      </div>

      {saved?.code && (
        <button
          className="btn ghost resume"
          type="button"
          disabled={busy}
          onClick={() => {
            haptic("medium");
            onJoin(saved.code, password);
          }}
        >
          Вернуться в {saved.code}
          {saved.online ? ` · ${saved.online} в зале` : ""}
          {saved.title ? ` · ${saved.title}` : ""}
        </button>
      )}

      <div className="theme-pills" role="radiogroup" aria-label="Тема">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            className={theme === t.id ? "on" : ""}
            onClick={() => {
              onTheme?.(t.id);
              haptic("light");
            }}
          >
            <i style={{ background: t.accent }} />
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
