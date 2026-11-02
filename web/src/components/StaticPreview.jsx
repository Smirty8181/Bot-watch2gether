import { useState } from "react";

const initialMessages = [
  { name: "Мила · демо", text: "Ну что, начинаем?", tone: "lavender" },
  { name: "Артём · демо", text: "Я уже в комнате", tone: "mint" },
  { name: "Вы · демо", text: "Отличный план", tone: "peach" },
];

export function StaticPreview() {
  const [screen, setScreen] = useState("lobby");
  const [code, setCode] = useState("");
  const [roomCode, setRoomCode] = useState("DEMO42");
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [notice, setNotice] = useState("");

  function enterRoom(nextCode) {
    const normalized = nextCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (normalized.length !== 6) {
      setNotice("Введите демонстрационный код из 6 символов.");
      return;
    }

    setRoomCode(normalized);
    setNotice("");
    setScreen("room");
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [...current, { name: "Вы · демо", text, tone: "peach" }]);
    setDraft("");
  }

  return (
    <main className="static-demo">
      <header className="preview-topbar">
        <a className="static-brand" href="https://github.com/Smirty8181/Bot-watch2gether" aria-label="Репозиторий Bot-watch2gether">
          together<span>.</span>
        </a>
        <div className="preview-topbar-meta">
          <span className="static-badge">ИНТЕРАКТИВНОЕ ДЕМО</span>
          <span className="static-readonly">БЕЗ ПОДКЛЮЧЕНИЯ</span>
        </div>
      </header>

      <div className="preview-content">
        <section className="preview-intro">
          <p className="static-kicker">TELEGRAM MINI APP · ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР</p>
          <h1>Смотрим вместе</h1>
          <p>Создайте комнату или войдите по коду — интерфейс работает в демо-режиме прямо в браузере.</p>
          <span className="preview-demo-note"><i /> Только пример · данные не отправляются</span>
        </section>

        {screen === "lobby" ? (
          <section className="preview-lobby" aria-label="Демонстрационное лобби">
            <div className="preview-lobby-copy">
              <span className="preview-step">01 / КОМНАТА</span>
              <h2>Соберите друзей</h2>
              <p>В настоящем приложении комната синхронизирует просмотр. Здесь вы можете посмотреть, как выглядит этот сценарий.</p>
              <button className="preview-primary" type="button" onClick={() => enterRoom("DEMO42")}>
                Создать демо-комнату <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="preview-room-card">
              <div className="preview-room-card-top">
                <span>ПРИМЕР КОМНАТЫ</span>
                <span className="preview-room-live"><i /> ДЕМО</span>
              </div>
              <div className="preview-room-art">
                <div className="preview-art-orbit preview-art-orbit-one" />
                <div className="preview-art-orbit preview-art-orbit-two" />
                <div className="preview-art-screen"><span>▶</span></div>
                <div className="preview-art-stars">✦　·　✧　·</div>
              </div>
              <div className="preview-room-card-bottom">
                <div><small>СЕГОДНЯ · ПРИМЕР</small><strong>Кино-вечер</strong></div>
                <span className="preview-avatar-stack" aria-label="Три условных участника"><i>М</i><i>А</i><i>+</i></span>
              </div>
            </div>
            <form
              className="preview-join"
              onSubmit={(event) => {
                event.preventDefault();
                enterRoom(code);
              }}
            >
              <label htmlFor="preview-room-code">Уже есть код комнаты?</label>
              <div className="preview-join-controls">
                <input
                  id="preview-room-code"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="Например, DEMO42"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <button type="submit">Войти в демо</button>
              </div>
              {notice && <p className="preview-notice" role="status">{notice}</p>}
            </form>
          </section>
        ) : (
          <section className="preview-room-view" aria-label="Пример комнаты">
            <div className="preview-room-heading">
              <button className="preview-back" type="button" onClick={() => setScreen("lobby")}>← К комнатам</button>
              <span className="preview-room-code">КОД КОМНАТЫ <b>{roomCode}</b></span>
            </div>
            <div className="preview-room-layout">
              <div className="preview-watch-card">
                <div className="preview-player">
                  <div className="preview-player-art">
                    <span className="preview-player-sun" />
                    <span className="preview-player-mountain preview-mountain-back" />
                    <span className="preview-player-mountain preview-mountain-front" />
                    <span className="preview-player-label">ДЕМО-КАДР · ВИДЕО НЕ ЗАГРУЖАЕТСЯ</span>
                    <button
                      className="preview-play"
                      type="button"
                      aria-label={playing ? "Приостановить демонстрацию" : "Запустить демонстрацию"}
                      onClick={() => setPlaying((current) => !current)}
                    >
                      {playing ? "Ⅱ" : "▶"}
                    </button>
                  </div>
                  <div className="preview-player-controls">
                    <span>{playing ? "Демонстрация запущена локально" : "Ожидает запуска · демо"}</span>
                    <span>12:34 / 1:48:00</span>
                    <div className="preview-progress"><i className={playing ? "is-playing" : ""} /></div>
                  </div>
                </div>
                <div className="preview-video-title">
                  <div><small>СЕАНС · ДЕМО-ДАННЫЕ</small><h2>Кино-вечер</h2></div>
                  <span className="preview-viewers"><i>М</i><i>А</i><i>+</i> 3 зрителя</span>
                </div>
              </div>
              <aside className="preview-chat">
                <div className="preview-chat-heading"><div><h2>Чат комнаты</h2><span>Локальный пример</span></div><b>{messages.length}</b></div>
                <div className="preview-messages" aria-live="polite">
                  {messages.map((message, index) => (
                    <p key={`${message.name}-${index}`}>
                      <b className={message.tone}>{message.name}</b>
                      <span>{message.text}</span>
                    </p>
                  ))}
                </div>
                <form className="preview-chat-form" onSubmit={sendMessage}>
                  <input
                    aria-label="Сообщение для локального демо-чата"
                    placeholder="Напишите сообщение…"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button type="submit" aria-label="Добавить сообщение в демо">↑</button>
                  <small>Сообщения видны только в этом окне</small>
                </form>
              </aside>
            </div>
          </section>
        )}

        <section className="preview-capabilities" aria-label="Ограничения демо">
          <article><span>01</span><div><b>Комнаты</b><small>Локальный переход по коду</small></div></article>
          <article><span>02</span><div><b>Воспроизведение</b><small>Только кнопка интерфейса</small></div></article>
          <article><span>03</span><div><b>Чат</b><small>Сообщения не покидают браузер</small></div></article>
        </section>
        <footer className="preview-footer">
          <span>ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР MINI APP</span>
          <p>Нет авторизации, Telegram SDK, API, сервера, WebSocket, внешних медиа или сохранения данных. Все участники и сообщения вымышлены.</p>
          <a href="https://github.com/Smirty8181/Bot-watch2gether">Исходный код проекта ↗</a>
        </footer>
      </div>
    </main>
  );
}
