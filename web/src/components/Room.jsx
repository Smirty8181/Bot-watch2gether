import { useEffect, useRef, useState } from "react";
import { Chat } from "./Chat.jsx";
import { Player } from "./Player.jsx";
import { Settings } from "./Settings.jsx";
import { VideoPicker } from "./VideoPicker.jsx";
import { Avatar } from "./Avatar.jsx";
import { IconCompress, IconExpand, IconGear, IconPlus } from "./Icons.jsx";
import { haptic, setAppFullscreen } from "../telegram.js";
import { ding, formatTime } from "../format.js";

const REACTS = ["🔥", "😂", "❤️", "👏", "👀", "💀", "😮", "🎉"];
const TABS = ["chat", "queue", "people"];

function actionLabel(playback) {
  if (!playback?.by) return "";
  const who = playback.by;
  const t = formatTime(playback.time || 0);
  if (playback.action === "play") return `${who} ▶ ${t}`;
  if (playback.action === "pause") return `${who} ❚❚ ${t}`;
  if (playback.action === "load") return `${who} включил видео`;
  if (playback.action === "seek") return `${who} → ${t}`;
  return `${who} · ${t}`;
}

export function Room({
  room,
  me,
  connected = true,
  theme,
  onTheme,
  onLeave,
  onVideo,
  onQueue,
  onQueueMany,
  onQueuePlay,
  onQueueRemove,
  onChat,
  onReact,
  onFloat,
  onPassword,
  onPlayback,
  onControl,
  onHost,
  onEnded,
  pickError,
}) {
  const [tab, setTab] = useState("chat");
  const [toast, setToast] = useState("");
  const [picker, setPicker] = useState(false);
  const [settings, setSettings] = useState(false);
  const [folded, setFolded] = useState(false);
  const [fs, setFs] = useState(false);
  const [typing, setTyping] = useState(false);
  const [floats, setFloats] = useState([]);
  const swipe = useRef(null);
  const fsUser = useRef(null);
  const toastTimer = useRef(0);
  const lastMsg = useRef("");
  const floatTimers = useRef([]);

  const canControl = room.anyoneCanControl || room.hostId === me.id;
  const online = room.members.filter((m) => m.online);
  const queue = room.queue || [];
  const history = room.history || [];
  const nowLine = actionLabel(room.playback);
  const watching = Boolean(room.video);

  useEffect(() => {
    if (!watching || folded) {
      setFs(false);
      return undefined;
    }
    const apply = () => {
      if (fsUser.current !== null) {
        setFs(Boolean(fsUser.current));
        return;
      }
      setFs(window.matchMedia("(max-width: 879px)").matches);
    };
    apply();
    const mq = window.matchMedia("(max-width: 879px)");
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [watching, folded, room.video?.id]);

  useEffect(() => {
    document.documentElement.classList.toggle("watch-fs", fs);
    if (!fs) {
      setAppFullscreen(false);
      return () => document.documentElement.classList.remove("watch-fs");
    }
    setAppFullscreen(true);
    return () => {
      setAppFullscreen(false);
      document.documentElement.classList.remove("watch-fs");
    };
  }, [fs]);

  useEffect(() => {
    function onFloatEvent(e) {
      const last = e.detail;
      if (!last?.text) return;
      const id = last.id || `${Date.now()}`;
      setFloats((xs) => [...xs.slice(-8), { id, text: last.text, left: 12 + Math.random() * 70 }]);
      const t = setTimeout(() => setFloats((xs) => xs.filter((x) => x.id !== id)), 2400);
      floatTimers.current.push(t);
    }
    window.addEventListener("wt-float", onFloatEvent);
    return () => {
      window.removeEventListener("wt-float", onFloatEvent);
      floatTimers.current.forEach(clearTimeout);
      floatTimers.current = [];
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const last = room.messages?.at(-1);
    if (!last || last.id === lastMsg.current) return;
    lastMsg.current = last.id;
    if (last.type !== "chat") return;
    if (REACTS.includes(last.text)) {
      window.dispatchEvent(new CustomEvent("wt-float", { detail: { id: last.id, text: last.text } }));
    }
    if (last.userId !== me.id && (tab !== "chat" || folded)) {
      haptic("medium");
      ding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.messages]);

  useEffect(() => {
    if (pickError) flash(pickError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickError]);

  function flash(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }

  function onDockStart(e) {
    const t = e.touches[0];
    if (!t) return;
    swipe.current = { x: t.clientX, y: t.clientY };
  }

  function onDockEnd(e) {
    const start = swipe.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const i = TABS.indexOf(tab);
      const next = dx < 0 ? TABS[Math.min(TABS.length - 1, i + 1)] : TABS[Math.max(0, i - 1)];
      if (next !== tab) {
        setTab(next);
        haptic("light");
      }
    }
  }

  return (
    <div className={`room ${folded ? "video-min" : ""} ${typing ? "kb-open" : ""} ${fs ? "fs" : ""}`}>
      <div className="mesh room-mesh" aria-hidden="true" />
      {!connected && <div className="net-banner">Нет связи — переподключаемся…</div>}
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Настройки">
          <IconGear />
        </button>
        <button
          className="code-chip"
          onClick={() => {
            setSettings(true);
            haptic("light");
          }}
        >
          {room.code}
        </button>
        <button className="avatars" onClick={() => setTab("people")} aria-label="Участники">
          {online.slice(0, 3).map((m) => (
            <Avatar key={m.id} name={m.name} photo={m.photo} color={m.color} size={28} />
          ))}
          <span className="ava count">{online.length}</span>
        </button>
        {watching && (
          <button
            className={`icon-btn fold ${fs ? "on" : ""}`}
            onClick={() => {
              if (fs) {
                fsUser.current = false;
                setFs(false);
              } else {
                fsUser.current = true;
                setFolded(false);
                setFs(true);
              }
              haptic("light");
            }}
            type="button"
            aria-label={fs ? "Обычный вид" : "На весь экран"}
          >
            {fs ? <IconCompress /> : <IconExpand />}
          </button>
        )}
        <button className="icon-btn add" onClick={() => setPicker(true)} type="button" aria-label="Выбрать видео">
          <IconPlus />
        </button>
      </header>

      <div className="stage">
        <div className="bezel">
          <Player
            video={room.video}
            playback={room.playback}
            countdown={room.countdown}
            viewers={online.length}
            canControl={canControl}
            isHost={room.hostId === me.id}
            onPlayback={(payload) => onPlayback(payload, (err) => err && flash(err))}
            onEnded={onEnded}
            onPick={() => setPicker(true)}
            onNowClick={
              folded
                ? () => {
                    setFolded(false);
                    document.activeElement?.blur?.();
                  }
                : undefined
            }
          />
          <div className="floats" aria-hidden="true">
            {floats.map((f) => (
              <span key={f.id} style={{ left: `${f.left}%` }}>
                {f.text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {nowLine && <div className={`now-line ${fs ? "fs" : ""}`}>{nowLine}</div>}

      <div className="dock">
        <div className="tabs" onTouchStart={onDockStart} onTouchEnd={onDockEnd}>
          <button
            className={tab === "chat" ? "on" : ""}
            onClick={() => {
              setTab("chat");
              haptic("light");
            }}
          >
            Чат
          </button>
          <button
            className={tab === "queue" ? "on" : ""}
            onClick={() => {
              setTab("queue");
              setTyping(false);
              haptic("light");
            }}
          >
            Очередь{queue.length ? ` · ${queue.length}` : ""}
          </button>
          <button
            className={tab === "people" ? "on" : ""}
            onClick={() => {
              setTab("people");
              setTyping(false);
              haptic("light");
            }}
          >
            Зал · {online.length}
          </button>
        </div>

        <div className={`dock-pane ${tab === "chat" ? "on" : ""}`} inert={tab !== "chat"}>
          <Chat
            messages={room.messages}
            members={room.members}
            meId={me.id}
            overlay={fs}
            onSend={onChat}
            onReact={onReact}
            onFloat={onFloat}
            onFocusChange={setTyping}
          />
        </div>

        <div className={`dock-pane ${tab === "queue" ? "on" : ""}`} inert={tab !== "queue"}>
          <div className="queue">
            {queue.length === 0 ? (
              <div className="chat-empty queue-empty">
                Очередь пуста — следующее видео включится само.
                <button className="btn primary compact" type="button" onClick={() => setPicker(true)}>
                  Добавить
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn ghost compact save-pl"
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "wt-playlist",
                        JSON.stringify(queue.map((item) => item.video.url))
                      );
                      flash("Плейлист сохранён");
                    } catch {
                      flash("Не удалось сохранить");
                    }
                  }}
                >
                  Сохранить очередь
                </button>
                <ul>
                  {queue.map((item, i) => (
                    <li key={item.id}>
                      {item.video.thumb ? <img src={item.video.thumb} alt="" /> : <span className="hist-ph" />}
                      <div>
                        <b>
                          {i + 1}. {item.video.title}
                        </b>
                        <small>{item.by}</small>
                      </div>
                      {canControl && (
                        <button type="button" onClick={() => onQueuePlay(item.id)}>
                          ▶
                        </button>
                      )}
                      {canControl && (
                        <button type="button" className="x" onClick={() => onQueueRemove(item.id)}>
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className={`dock-pane ${tab === "people" ? "on" : ""}`} inert={tab !== "people"}>
          <ul className="people">
            {room.members.map((m) => {
              const isMe = m.id === me.id;
              const isHost = m.id === room.hostId;
              const line = [
                isMe ? "это ты" : null,
                isHost ? "хост" : null,
                m.online ? "в эфире" : "отошёл",
                m.username ? `@${m.username}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={m.id}>
                  <Avatar
                    name={m.name}
                    photo={m.photo}
                    color={m.color}
                    online={m.online}
                    host={isHost}
                    size={46}
                  />
                  <div className="who">
                    <b>{m.name}</b>
                    <small>{line}</small>
                  </div>
                  {room.hostId === me.id && !isMe && m.online && (
                    <button
                      type="button"
                      className="btn ghost compact"
                      onClick={() => {
                        onHost(m.id);
                        haptic("light");
                        flash(`${m.name} теперь хост`);
                      }}
                    >
                      Хост
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <VideoPicker
        open={picker}
        onClose={() => setPicker(false)}
        onWatch={onVideo}
        onQueue={onQueue}
        onQueueMany={onQueueMany}
        history={history}
        error={pickError}
      />
      <Settings
        open={settings}
        onClose={() => setSettings(false)}
        room={room}
        me={me}
        theme={theme}
        onTheme={onTheme}
        onControl={onControl}
        onHost={onHost}
        onPassword={onPassword}
        onLeave={onLeave}
        onCopied={flash}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
