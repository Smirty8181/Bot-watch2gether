const messages = [
  { name: "sample_guest", text: "Отличный момент ✨", color: "lavender" },
  { name: "demo_friend", text: "Привет из тестовой комнаты!", color: "mint" },
  { name: "viewer_001", text: "Это сообщение вымышленное", color: "peach" },
];

export function StaticPreview() {
  return (
    <main className="static-demo">
      <header className="static-demo-head">
        <div className="static-brand">together<span>.</span></div>
        <span className="static-badge">ДЕМО · ВЫМЫШЛЕННЫЕ ДАННЫЕ</span>
        <span className="static-readonly">ТОЛЬКО ПРОСМОТР</span>
      </header>
      <section className="static-hero">
        <p className="static-kicker">STATIC PREVIEW / БЕЗ ПОДКЛЮЧЕНИЯ</p>
        <h1>Смотрим вместе</h1>
        <p>Макет комнаты совместного просмотра. Сервер, Telegram и реальные видеоплатформы отключены.</p>
      </section>
      <section className="static-room" aria-label="Пример комнаты">
        <div className="static-player">
          <div className="static-screen">
            <div className="static-screen-glow" />
            <span className="static-play" aria-hidden="true" />
            <small>ДЕМО-КАДР · ВИДЕО НЕ ЗАГРУЖАЕТСЯ</small>
          </div>
          <div className="static-video-info">
            <span><i />Пример комнаты · SAMPLE</span><b>Кино-вечер (демо)</b>
            <div className="static-progress"><i /></div>
            <small>12:34 / 1:48:00 · условное время</small>
          </div>
        </div>
        <aside className="static-chat">
          <div className="static-chat-head"><b>Чат комнаты</b><span>3 примера</span></div>
          <div className="static-messages">
            {messages.map((message) => (
              <p key={message.name}>
                <b className={message.color}>{message.name}</b>
                <span>{message.text}</span>
              </p>
            ))}
          </div>
          <div className="static-disabled">Чат недоступен в статическом демо</div>
        </aside>
      </section>
      <section className="static-details">
        <article><small>УЧАСТНИКИ · ПРИМЕР</small><b>4 зрителя</b><span>Все имена и число условные</span></article>
        <article><small>СИНХРОНИЗАЦИЯ</small><b>Отключена</b><span>Нет сервера и WebSocket</span></article>
        <article><small>ВИДЕО / ПОИСК / ЗАГРУЗКИ</small><b>Отключены</b><span>Внешние медиа не запрашиваются</span></article>
      </section>
      <footer>Без авторизации, API, сокетов, Telegram SDK, внешних медиа и действий записи. Для реальной совместной комнаты нужен локальный сервер.</footer>
    </main>
  );
}
