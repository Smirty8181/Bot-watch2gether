import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Lobby } from "./components/Lobby.jsx";
import { Room } from "./components/Room.jsx";
import { getStartRoom, getUser, haptic, initTelegram } from "./telegram.js";
import { applyTheme, getTheme } from "./theme.js";

const LAST_ROOM = "wt-last-room";

export default function App() {
  const [user, setUser] = useState(null);
  const socketRef = useRef(null);
  const skipAuto = useRef(false);
  const lastCode = useRef("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickError, setPickError] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [room, setRoom] = useState(null);
  const [theme, setTheme] = useState(() => getTheme());
  const [saved, setSaved] = useState(() => {
    try {
      return localStorage.getItem(LAST_ROOM) || "";
    } catch {
      return "";
    }
  });
  const [peek, setPeek] = useState(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    initTelegram();
    let n = 0;
    const tick = () => {
      const next = getUser({ guest: false });
      if (next) {
        setUser(next);
        return true;
      }
      return false;
    };
    if (tick()) return undefined;
    const id = setInterval(() => {
      n += 1;
      if (tick()) {
        clearInterval(id);
      } else if (n >= 16) {
        clearInterval(id);
        setUser(getUser({ guest: true }));
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    initTelegram();
    applyTheme(theme);
    const socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      if (lastCode.current && !skipAuto.current) {
        socket.emit("join", { code: lastCode.current, user, password: sessionStorage.getItem("wt-pass") || "" }, (res) => {
          if (res?.room) {
            setRoom(res.room);
            setError("");
          } else if (res?.error) {
            setError(res.error);
            setRoom(null);
            lastCode.current = "";
          }
        });
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room", (next) => setRoom(next));
    socket.on("playback", (playback) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const next = { ...prev, playback };
        if (playback?.playing) next.countdown = null;
        return next;
      });
    });
    socket.on("chat", (msg) => {
      setRoom((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg].slice(-120) };
      });
    });
    socket.on("msgReact", (msg) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === msg.id ? { ...m, reactions: msg.reactions } : m)),
        };
      });
    });
    socket.on("float", (item) => {
      window.dispatchEvent(new CustomEvent("wt-float", { detail: item }));
    });
    return () => socket.close();
  }, [user]);

  const join = useCallback(
    (opts) => {
      const socket = socketRef.current;
      if (!socket) return;
      setBusy(true);
      setError("");
      setNeedPassword(false);
      socket.emit("join", { ...opts, user }, (res) => {
        setBusy(false);
        if (res?.error) {
          setError(res.error);
          setNeedPassword(Boolean(res.needPassword));
          haptic("error");
          return;
        }
        setRoom(res.room);
        lastCode.current = res.room.code;
        try {
          localStorage.setItem(LAST_ROOM, res.room.code);
          if (opts.password) sessionStorage.setItem("wt-pass", opts.password);
        } catch {
          /* ignore */
        }
        setSaved(res.room.code);
        haptic("success");
      });
    },
    [user]
  );

  useEffect(() => {
    const preset = getStartRoom();
    if (preset && connected && !room && !skipAuto.current && !lastCode.current) join({ code: preset });
  }, [connected, room, join]);

  useEffect(() => {
    if (!saved || room || !connected) return undefined;
    socketRef.current?.emit("peek", { code: saved }, (res) => setPeek(res?.room || null));
    return undefined;
  }, [saved, room, connected]);

  const onPlayback = useCallback((payload, onErr) => {
    socketRef.current?.emit("playback", payload, (res) => {
      if (res?.error) onErr?.(res.error);
    });
  }, []);

  const onChat = useCallback((text, reply) => {
    socketRef.current?.emit("chat", { text, reply }, (res) => {
      if (res?.error) setPickError(res.error);
    });
  }, []);

  const onReact = useCallback((msgId, emoji) => {
    socketRef.current?.emit("msgReact", { msgId, emoji });
  }, []);

  const onFloat = useCallback((text) => {
    socketRef.current?.emit("float", { text });
  }, []);

  function ackErr(res) {
    if (res?.error) {
      setPickError(res.error);
      haptic("error");
      return true;
    }
    setPickError("");
    return false;
  }

  if (!room || !user) {
    return (
      <Lobby
        busy={busy || !connected || !user}
        error={error}
        needPassword={needPassword}
        preset={getStartRoom()}
        saved={peek}
        theme={theme}
        onTheme={(id) => {
          setTheme(id);
          applyTheme(id);
        }}
        onCreate={() => join({ create: true })}
        onJoin={(code, password) => join({ code, password })}
      />
    );
  }

  return (
    <Room
      room={room}
      me={user}
      connected={connected}
      theme={theme}
      onTheme={(id) => {
        setTheme(id);
        applyTheme(id);
      }}
      pickError={pickError}
      onLeave={() => {
        skipAuto.current = true;
        lastCode.current = "";
        socketRef.current?.emit("leave");
        setRoom(null);
      }}
      onVideo={(url, done) => {
        const s = socketRef.current;
        if (!s) {
          done?.(false);
          return;
        }
        s.emit("setVideo", { url }, (res) => done?.(!ackErr(res)));
      }}
      onQueue={(url, done) => {
        const s = socketRef.current;
        if (!s) {
          done?.(false);
          return;
        }
        s.emit("queueAdd", { url }, (res) => done?.(!ackErr(res)));
      }}
      onQueueMany={(urls, done) => {
        const s = socketRef.current;
        if (!s) {
          done?.(false);
          return;
        }
        s.emit("queueAddMany", { urls }, (res) => done?.(!ackErr(res)));
      }}
      onQueuePlay={(id) =>
        socketRef.current?.emit("queuePlay", { id }, (res) => {
          if (res?.error) setPickError(res.error);
        })
      }
      onQueueRemove={(id) =>
        socketRef.current?.emit("queueRemove", { id }, (res) => {
          if (res?.error) setPickError(res.error);
        })
      }
      onEnded={() =>
        socketRef.current?.emit("playNext", {}, (res) => {
          if (res?.error) setPickError(res.error);
        })
      }
      onChat={onChat}
      onReact={onReact}
      onFloat={onFloat}
      onPassword={(password) => socketRef.current?.emit("password", { password })}
      onPlayback={onPlayback}
      onControl={(anyoneCanControl) =>
        socketRef.current?.emit("control", { anyoneCanControl })
      }
      onHost={(targetId) => socketRef.current?.emit("host", { targetId })}
    />
  );
}
