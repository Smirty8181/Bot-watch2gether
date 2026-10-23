import { memo, useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "../telegram.js";
import { Avatar } from "./Avatar.jsx";

const EMOJI = ["🔥", "😂", "❤️", "👏", "👀", "💀"];
const BUBBLE_REACTS = ["🔥", "❤️", "😂"];

function clock(ts) {
  try {
    return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - then) / 86400000;
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function ChatInner({ messages, members = [], meId, overlay, onSend, onReact, onFloat, onFocusChange }) {
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(true);
  const [fresh, setFresh] = useState(0);
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(null);
  const [reply, setReply] = useState(null);
  const scroller = useRef(null);
  const input = useRef(null);
  const prevLen = useRef(0);
  const touch = useRef(null);
  const swipeMsg = useRef(null);
  const ignoreClick = useRef(false);
  const tapTimer = useRef(null);
  const blurTimer = useRef(0);
  const pinnedRef = useRef(true);

  useEffect(() => {
    return () => {
      clearTimeout(tapTimer.current);
      clearTimeout(blurTimer.current);
    };
  }, []);
  const byId = useMemo(() => {
    const map = new Map();
    for (const u of members) map.set(u.id, u);
    return map;
  }, [members]);

  function scrollBottom() {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pinnedRef.current) {
      scrollBottom();
      setFresh(0);
    } else if (messages.length > prevLen.current) {
      setFresh((n) => n + (messages.length - prevLen.current));
    }
    prevLen.current = messages.length;
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom !== pinnedRef.current) {
      pinnedRef.current = atBottom;
      setPinned(atBottom);
    }
    if (atBottom) setFresh(0);
  }

  function jump() {
    pinnedRef.current = true;
    scrollBottom();
    setPinned(true);
    setFresh(0);
  }

  function startReply(m) {
    setReply({ id: m.id, name: m.name, text: m.text });
    setPicked(null);
    haptic("medium");
    input.current?.focus();
  }

  function onMsgTouchStart(e, m, mine) {
    const t = e.touches[0];
    if (!t) return;
    swipeMsg.current = { id: m.id, mine, x: t.clientX, y: t.clientY };
  }

  function onMsgTouchEnd(e, m) {
    const s = swipeMsg.current;
    swipeMsg.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const enough = s.mine ? dx < -46 : dx > 46;
    if (!enough) return;
    ignoreClick.current = true;
    startReply(m);
  }

  function onBubbleClick(m) {
    if (ignoreClick.current) {
      ignoreClick.current = false;
      return;
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onReact(m.id, "❤️");
      haptic("medium");
      setPicked(null);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setPicked((id) => (id === m.id ? null : m.id));
    }, 280);
  }

  function submit(e) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(value, reply);
    setText("");
    setReply(null);
    haptic("light");
    pinnedRef.current = true;
    setPinned(true);
    input.current?.focus();
    requestAnimationFrame(scrollBottom);
  }

  function onTouchStart(e) {
    const t = e.touches[0];
    if (!t) return;
    touch.current = { y: t.clientY, x: t.clientX };
  }

  function onTouchEnd(e) {
    const start = touch.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - start.y;
    if (dy > 60 && Math.abs(t.clientX - start.x) < 50) {
      input.current?.blur();
      setFocused(false);
      onFocusChange?.(false);
    }
  }

  return (
    <div className={`chat ${focused ? "composing" : ""} ${overlay ? "cinema" : ""}`}>
      <div className="chat-log" ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <b>Пока тихо</b>
            {overlay ? "Пиши тут — все в комнате увидят." : "Напиши первое — или кинь реакцию снизу."}
          </div>
        )}
        {messages.map((m, i) => {
          if (m.type === "system") {
            return (
              <div className="sys" key={m.id}>
                {m.text}
              </div>
            );
          }
          const who = byId.get(m.userId);
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const showDay = !prev || (prev.ts && dayKey(prev.ts) !== dayKey(m.ts));
          const stacked = prev && prev.type === "chat" && prev.userId === m.userId && !showDay;
          const tail = !next || next.type !== "chat" || next.userId !== m.userId;
          const mine = m.userId === meId;
          const reacts = Object.entries(m.reactions || {}).filter(([, ids]) => ids?.length);
          const photo = who?.photo || m.photo;
          const color = who?.color || m.color;
          return (
            <div key={m.id}>
              {showDay && <div className="day">{dayLabel(m.ts)}</div>}
              <div className={`row ${mine ? "mine" : ""} ${stacked ? "stack" : ""} ${tail ? "tail" : ""}`}>
                {!mine && (
                  <Avatar
                    className={`chat-ava ${stacked && !tail ? "ghost" : ""}`}
                    name={who?.name || m.name}
                    photo={stacked && !tail ? "" : photo}
                    color={color}
                    size={28}
                  />
                )}
                <div
                  className="bubble-wrap"
                  onTouchStart={(e) => onMsgTouchStart(e, m, mine)}
                  onTouchEnd={(e) => onMsgTouchEnd(e, m)}
                >
                  <div
                    className={`bubble ${mine ? "mine" : ""} ${stacked ? "stack" : ""} ${tail ? "tail" : ""} ${picked === m.id ? "picked" : ""}`}
                    onClick={() => onBubbleClick(m)}
                  >
                    {!mine && !stacked && (
                      <div className="bubble-name" style={{ color }}>
                        {who?.name || m.name}
                      </div>
                    )}
                    {m.reply && (
                      <div className="quote">
                        <b>{m.reply.name}</b>
                        {m.reply.text}
                      </div>
                    )}
                    <span className="bubble-text">{m.text}</span>
                    {tail && <time>{clock(m.ts)}</time>}
                  </div>
                  {reacts.length > 0 && (
                    <div className="reacts">
                      {reacts.map(([emoji, ids]) => (
                        <button
                          key={emoji}
                          type="button"
                          className={ids.includes(meId) ? "on" : ""}
                          onClick={(e) => {
                            e.stopPropagation();
                            onReact(m.id, emoji);
                          }}
                        >
                          {emoji} {ids.length}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {picked === m.id && (
                <div className={`picker-row ${mine ? "mine" : ""}`}>
                  {BUBBLE_REACTS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onReact(m.id, e);
                        haptic("light");
                        setPicked(null);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="reply-btn"
                    onClick={() => {
                      setReply({ id: m.id, name: m.name, text: m.text });
                      setPicked(null);
                      input.current?.focus();
                    }}
                  >
                    Ответить
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!pinned && (
        <button className="jump" onClick={jump} type="button">
          {fresh > 1 ? `↓ ${fresh}` : "↓"}
        </button>
      )}
      <div className="composer">
        {reply && (
          <div className="reply-bar">
            <div>
              <b>{reply.name}</b>
              <span>{reply.text}</span>
            </div>
            <button type="button" onClick={() => setReply(null)}>
              ✕
            </button>
          </div>
        )}
        {!focused && (
          <div className="quick">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onFloat?.(e);
                  haptic("light");
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <form className="chat-form" onSubmit={submit}>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              clearTimeout(blurTimer.current);
              setFocused(true);
              onFocusChange?.(true);
              pinnedRef.current = true;
              setPinned(true);
              setTimeout(scrollBottom, 80);
            }}
            onBlur={() => {
              clearTimeout(blurTimer.current);
              blurTimer.current = setTimeout(() => {
                setFocused(false);
                onFocusChange?.(false);
              }, 180);
            }}
            placeholder={reply ? "Ответ…" : "Сообщение"}
            maxLength={500}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            inputMode="text"
          />
          <button
            type="submit"
            className="icon-send"
            aria-label="Отправить"
            disabled={!text.trim()}
            onMouseDown={(e) => e.preventDefault()}
          >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M3.4 20.6 21 12 3.4 3.4 3 10l11 2-11 2z" />
          </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export const Chat = memo(ChatInner);
