import { useEffect, useRef, useState } from "react";
import { embedFor, loadYouTubeAPI, SYNCABLE } from "../video.js";
import { openExternal } from "../telegram.js";
import { formatTime } from "../format.js";
import { IconPause, IconPlay } from "./Icons.jsx";

function youtubeEmbedSrc(id) {
  const origin = window.location.origin;
  const q = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "1",
    fs: "1",
    iv_load_policy: "3",
    origin,
    widget_referrer: origin,
  });
  return `https://www.youtube.com/embed/${id}?${q.toString()}`;
}

function expectedTime(playback) {
  if (!playback) return 0;
  if (!playback.playing) return Number(playback.time) || 0;
  return Math.max(0, Number(playback.time || 0) + (Date.now() - (playback.updatedAt || Date.now())) / 1000);
}

function needsSeek(local, target) {
  const behind = target - local;
  const ahead = local - target;
  if (behind > 2.6) return true;
  if (ahead > 5) return true;
  return false;
}

export function Player({
  video,
  playback,
  countdown,
  viewers = 1,
  canControl,
  isHost,
  onPlayback,
  onEnded,
  onPick,
  onNowClick,
}) {
  const hostRef = useRef(null);
  const ytRef = useRef(null);
  const fileRef = useRef(null);
  const applying = useRef(false);
  const pauseTimer = useRef(0);
  const scrubbing = useRef(false);
  const countdownRef = useRef(countdown);
  const playbackRef = useRef(playback);
  countdownRef.current = countdown;
  playbackRef.current = playback;
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [ytError, setYtError] = useState(false);
  const [cdLeft, setCdLeft] = useState(0);
  const [lag, setLag] = useState(0);
  const playing = Boolean(playback?.playing);
  const waiting = Boolean(countdown);
  const iframe = Boolean(video && video.platform !== "youtube" && video.platform !== "file");
  const [embedSrc, setEmbedSrc] = useState("");
  const embedKey = video && iframe ? `${video.platform}:${video.id}` : "";

  useEffect(() => {
    if (!video || !iframe) {
      setEmbedSrc("");
      return;
    }
    setEmbedSrc(
      embedFor(video, window.location.hostname, {
        t: playbackRef.current?.time || 0,
        autoplay: Boolean(playbackRef.current?.playing),
      })
    );
  }, [embedKey, iframe, video]);

  useEffect(() => {
    if (!countdown) {
      setCdLeft(0);
      return undefined;
    }
    const start = Date.now();
    const inn = countdown.in ?? Math.max(0, (countdown.playAt || 0) - Date.now());
    const tick = () => setCdLeft(Math.max(0, inn - (Date.now() - start)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [countdown?.playAt, countdown?.in]);

  useEffect(() => {
    if (!video || (!playing && !waiting)) return undefined;
    let lock;
    let dead = false;
    async function grab() {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* unsupported / denied */
      }
    }
    grab();
    const onVis = () => {
      if (!dead && document.visibilityState === "visible") grab();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release?.().catch(() => {});
    };
  }, [playing, waiting, video?.id]);

  useEffect(() => {
    setReady(false);
    setYtError(false);
    ytRef.current = null;
    if (!video || video.platform !== "youtube") return undefined;

    let player;
    let dead = false;
    const box = hostRef.current;
    if (!box) return undefined;

    loadYouTubeAPI().then((YT) => {
      if (dead || !hostRef.current) return;
      const iframeEl = document.createElement("iframe");
      iframeEl.src = youtubeEmbedSrc(video.id);
      iframeEl.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      iframeEl.referrerPolicy = "origin";
      iframeEl.setAttribute("allowfullscreen", "1");
      iframeEl.title = video.title || "YouTube";
      iframeEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:#000";
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(iframeEl);

      player = new YT.Player(iframeEl, {
        events: {
          onReady: () => {
            if (dead) return;
            ytRef.current = player;
            setReady(true);
            setDur(player.getDuration?.() || 0);
            seekAndPlay(player, playbackRef.current, true, applying);
          },
          onError: () => {
            if (dead) return;
            setYtError(true);
          },
          onStateChange: (e) => {
            if (dead) return;
            const YTState = window.YT.PlayerState;
            if (e.data === YTState.ENDED) {
              onEnded?.();
              if (canControl && !applying.current) {
                onPlayback({ playing: false, time: player.getCurrentTime() });
              }
              return;
            }
            if (e.data === YTState.BUFFERING) {
              clearTimeout(pauseTimer.current);
              return;
            }
            if (applying.current || !canControl || countdownRef.current) return;
            if (e.data === YTState.PLAYING) {
              clearTimeout(pauseTimer.current);
              if (!playbackRef.current?.playing) {
                onPlayback({ playing: true, time: player.getCurrentTime() });
              }
              return;
            }
            if (e.data === YTState.PAUSED) {
              clearTimeout(pauseTimer.current);
              pauseTimer.current = setTimeout(() => {
                if (applying.current || countdownRef.current) return;
                if (player.getPlayerState?.() !== window.YT?.PlayerState?.PAUSED) return;
                if (playbackRef.current?.playing) {
                  onPlayback({ playing: false, time: player.getCurrentTime() });
                }
              }, 450);
            }
          },
        },
      });
    });

    return () => {
      dead = true;
      clearTimeout(pauseTimer.current);
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
    };
  }, [video?.id, video?.platform]);

  useEffect(() => {
    if (!ready || video?.platform !== "youtube") return undefined;
    const t = setTimeout(() => {
      const p = ytRef.current;
      if (!p) return;
      const duration = p.getDuration?.() || 0;
      const state = p.getPlayerState?.();
      if (duration < 1 && (state === -1 || state === 5 || state === 0)) {
        setYtError(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [ready, video?.id, video?.platform]);

  useEffect(() => {
    if (!ready || video?.platform !== "youtube" || !playback) return;
    const p = ytRef.current;
    if (!p) return;
    if (waiting) {
      applying.current = true;
      try {
        const t = countdown?.time ?? playback.time;
        p.seekTo(t, true);
        p.pauseVideo();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        applying.current = false;
      }, 800);
      return;
    }
    seekAndPlay(p, playback, false, applying);
  }, [playback?.playing, playback?.updatedAt, ready, video?.platform, video?.id, waiting, countdown?.time]);

  useEffect(() => {
    const el = fileRef.current;
    if (!el || !playback) return;
    const target = waiting ? countdown?.time ?? playback.time : expectedTime(playback);
    const seek = needsSeek(el.currentTime, target);
    const wantPause = waiting || !playback.playing;
    if (!seek && wantPause === el.paused) return;
    applying.current = true;
    if (seek) el.currentTime = target;
    if (wantPause) {
      if (!el.paused) el.pause();
    } else if (el.paused) {
      el.play().catch(() => {});
    }
    setTimeout(() => {
      applying.current = false;
    }, 700);
  }, [playback?.playing, playback?.updatedAt, video?.id, waiting, countdown?.time]);

  useEffect(() => {
    const id = setInterval(() => {
      if (scrubbing.current) return;
      const p = ytRef.current;
      const file = fileRef.current;
      let local = now;
      if (p?.getCurrentTime) {
        local = p.getCurrentTime() || 0;
        setNow((n) => (Math.abs(n - local) < 0.25 ? n : local));
        const duration = p.getDuration?.() || 0;
        if (duration) setDur((d) => (Math.abs(d - duration) < 0.5 ? d : duration));
      } else if (file) {
        local = file.currentTime || 0;
        setNow((n) => (Math.abs(n - local) < 0.25 ? n : local));
        const duration = file.duration || 0;
        if (duration) setDur((d) => (Math.abs(d - duration) < 0.5 ? d : duration));
      }
      const expected = expectedTime(playbackRef.current);
      const drift = expected - local;
      setLag(playbackRef.current?.playing && !countdownRef.current && drift > 2.5 ? drift : 0);
    }, 500);
    return () => clearInterval(id);
  }, [video?.id]);

  useEffect(() => {
    if (!isHost || video?.platform !== "youtube" || ytError) return undefined;
    const id = setInterval(() => {
      const p = ytRef.current;
      const pb = playbackRef.current;
      if (!p?.getCurrentTime || !pb?.playing || countdownRef.current) return;
      const state = p.getPlayerState?.();
      if (state !== window.YT?.PlayerState?.PLAYING) return;
      const local = p.getCurrentTime() || 0;
      if (needsSeek(local, expectedTime(pb))) {
        onPlayback({ playing: true, time: local });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [isHost, video?.platform, video?.id, onPlayback, ytError]);

  function emit(nextPlaying, time) {
    if (!canControl) return;
    onPlayback({ playing: nextPlaying, time });
  }

  function toggle() {
    const t = now;
    if (playing || waiting) {
      emit(false, t);
      ytRef.current?.pauseVideo();
      fileRef.current?.pause();
      return;
    }
    emit(true, t);
    ytRef.current?.playVideo();
    fileRef.current?.play?.().catch(() => {});
  }

  function skip(delta) {
    const t = Math.max(0, now + delta);
    emit(playing, t);
    applying.current = true;
    ytRef.current?.seekTo(t, true);
    if (fileRef.current) fileRef.current.currentTime = t;
    setTimeout(() => {
      applying.current = false;
    }, 700);
  }

  function onScrub(e) {
    scrubbing.current = true;
    setNow(Number(e.target.value));
  }

  function onScrubEnd(e) {
    const t = Number(e.currentTarget?.value ?? now);
    scrubbing.current = false;
    emit(playing, t);
    applying.current = true;
    ytRef.current?.seekTo(t, true);
    if (fileRef.current) fileRef.current.currentTime = t;
    setTimeout(() => {
      applying.current = false;
    }, 700);
  }

  function catchUp() {
    const t = expectedTime(playback);
    applying.current = true;
    ytRef.current?.seekTo(t, true);
    if (fileRef.current) fileRef.current.currentTime = t;
    if (playback?.playing) ytRef.current?.playVideo();
    if (playback?.playing) fileRef.current?.play?.().catch(() => {});
    setNow(t);
    setLag(0);
    setTimeout(() => {
      applying.current = false;
    }, 800);
  }

  const syncable = !video || SYNCABLE.has(video.platform);
  const countDownNum = Math.max(1, Math.ceil(cdLeft / 1000));

  return (
    <div className="player-wrap">
      {!video ? (
        <button className="screen empty-screen" type="button" onClick={onPick}>
          <span className="empty-logo" aria-hidden="true">
            <span className="tv-glow" />
            <span className="empty-play" />
          </span>
          <p>Пока темно</p>
          <small>Нажми — выберем, что смотреть</small>
        </button>
      ) : video.platform === "youtube" ? (
        <div className="screen">
          <div className="yt-box">
            <div ref={hostRef} className="yt-host" />
          </div>
          {(ytError || video.embedBlocked) && (
            <div className="yt-fail">
              <p>YouTube не даёт встроить это видео в Telegram</p>
              <button
                className="btn primary compact"
                type="button"
                onClick={() => openExternal(video.url || `https://youtu.be/${video.id}`)}
              >
                Открыть на YouTube
              </button>
              <button className="btn ghost compact" type="button" onClick={onPick}>
                Другое видео
              </button>
            </div>
          )}
          <ScreenHud viewers={viewers} waiting={waiting} countDownNum={countDownNum} lag={lag} onCatchUp={catchUp} />
        </div>
      ) : video.platform === "file" ? (
        <div className="screen">
          <video
            ref={fileRef}
            className="file-video"
            src={video.url}
            playsInline
            onPlay={(e) => canControl && !applying.current && !countdownRef.current && emit(true, e.target.currentTime)}
            onPause={(e) => canControl && !applying.current && !countdownRef.current && emit(false, e.target.currentTime)}
            onSeeked={(e) =>
              canControl &&
              !applying.current &&
              !countdownRef.current &&
              emit(!e.target.paused, e.target.currentTime)
            }
            onEnded={() => onEnded?.()}
          />
          <ScreenHud viewers={viewers} waiting={waiting} countDownNum={countDownNum} lag={lag} onCatchUp={catchUp} />
        </div>
      ) : (
        <div className="screen">
          <iframe
            key={embedKey}
            className="embed"
            src={embedSrc}
            referrerPolicy="origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={video.title}
          />
          <div className="embed-note">Управление — в плеере · синхрон только YouTube и файлов</div>
          <ScreenHud viewers={viewers} waiting={waiting} countDownNum={countDownNum} />
        </div>
      )}

      {video && (
        <div className="now" onClick={onNowClick} role={onNowClick ? "button" : undefined}>
          <div className="now-meta">
            <b>{video.title}</b>
            <small>
              {video.author || video.platform}
              {canControl ? " · ты управляешь" : ""}
            </small>
          </div>
        </div>
      )}

      {video && syncable && !ytError && !video.embedBlocked && (
        <div className={`transport ${canControl ? "" : "locked"}`} title={canControl ? "" : "Управляет только хост"}>
          <button type="button" className="t-play" onClick={toggle} disabled={!canControl} aria-label="play">
            {playing || waiting ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" onClick={() => skip(-10)} disabled={!canControl}>
            −10
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(dur, 1)}
            step={1}
            value={Math.min(now, dur || now)}
            onChange={onScrub}
            onPointerDown={() => {
              scrubbing.current = true;
            }}
            onPointerUp={onScrubEnd}
            onPointerCancel={onScrubEnd}
            onLostPointerCapture={onScrubEnd}
            onTouchEnd={onScrubEnd}
            disabled={!canControl}
          />
          <button type="button" onClick={() => skip(10)} disabled={!canControl}>
            +10
          </button>
          <span className="t-clock">{formatTime(now)}</span>
        </div>
      )}
    </div>
  );
}

function ScreenHud({ viewers, waiting, countDownNum, lag = 0, onCatchUp }) {
  return (
    <>
      <div className="watch-pill" aria-hidden="true">
        смотрите · {viewers}
      </div>
      {waiting && (
        <div className="count-overlay" aria-live="polite">
          <b>{countDownNum}</b>
          <small>ждём всех</small>
        </div>
      )}
      {lag > 0 && !waiting && onCatchUp && (
        <button className="catch-up" type="button" onClick={onCatchUp}>
          догнать
        </button>
      )}
    </>
  );
}

function seekAndPlay(player, playback, force, applying) {
  if (!player?.getCurrentTime || !playback) return;
  let local = 0;
  try {
    local = player.getCurrentTime() || 0;
  } catch {
    return;
  }
  const target = expectedTime(playback);
  const state = player.getPlayerState?.();
  const YTState = window.YT?.PlayerState;
  const isPlaying = state === YTState?.PLAYING;
  const buffering = state === YTState?.BUFFERING;
  const seek = force || needsSeek(local, target);
  const wantPlay = playback.playing && !buffering;
  const playChange =
    (wantPlay && (state === YTState?.PAUSED || state === YTState?.CUED || state === YTState?.UNSTARTED)) ||
    (!playback.playing && isPlaying);
  if (!seek && !playChange) return;
  applying.current = true;
  try {
    if (seek) player.seekTo(target, true);
    if (wantPlay && !isPlaying) player.playVideo();
    if (!playback.playing && isPlaying) player.pauseVideo();
  } catch {
    /* player not ready */
  }
  setTimeout(() => {
    applying.current = false;
  }, 800);
}
