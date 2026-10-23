const YT_ID = /^[\w-]{11}$/;

export function parseVideoUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const input = raw.trim();
  if (!input) return null;

  let url;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    if (YT_ID.test(input)) {
      return {
        platform: "youtube",
        id: input,
        url: `https://www.youtube.com/watch?v=${input}`,
        title: "YouTube",
      };
    }
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;

  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0]?.slice(0, 11);
    if (id && YT_ID.test(id)) {
      return {
        platform: "youtube",
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: "YouTube",
      };
    }
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const id =
      url.searchParams.get("v") ||
      (path.startsWith("/embed/") ? path.split("/")[2] : null) ||
      (path.startsWith("/shorts/") ? path.split("/")[2] : null) ||
      (path.startsWith("/live/") ? path.split("/")[2] : null);
    if (id && YT_ID.test(id.slice(0, 11))) {
      const videoId = id.slice(0, 11);
      return {
        platform: "youtube",
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: "YouTube",
      };
    }
  }

  const rutube = path.match(/\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/);
  if (host.includes("rutube.ru") && rutube) {
    return {
      platform: "rutube",
      id: rutube[1],
      url: `https://rutube.ru/video/${rutube[1]}/`,
      title: "Rutube",
    };
  }

  const vk =
    (host === "vk.com" || host === "vk.ru" || host === "vkvideo.ru") &&
    (input.match(/video(-?\d+)_(\d+)/) || path.match(/video(-?\d+)_(\d+)/));
  if (vk) {
    return {
      platform: "vk",
      id: `${vk[1]}_${vk[2]}`,
      url: `https://vk.com/video${vk[1]}_${vk[2]}`,
      title: "VK Видео",
    };
  }

  const vimeo = host.includes("vimeo.com") && path.match(/\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return {
      platform: "vimeo",
      id: vimeo[1],
      url: `https://vimeo.com/${vimeo[1]}`,
      title: "Vimeo",
    };
  }

  if (host.includes("twitch.tv")) {
    const video = path.match(/\/videos\/(\d+)/);
    if (video) {
      return {
        platform: "twitch",
        id: video[1],
        url: `https://www.twitch.tv/videos/${video[1]}`,
        title: "Twitch",
      };
    }
    const channel = path.split("/").filter(Boolean)[0];
    if (channel && !["videos", "directory", "p"].includes(channel)) {
      return {
        platform: "twitch_live",
        id: channel,
        url: `https://www.twitch.tv/${channel}`,
        title: `Twitch · ${channel}`,
      };
    }
  }

  if (host.includes("coub.com")) {
    const id = path.split("/").filter(Boolean).pop();
    if (id) {
      return {
        platform: "coub",
        id,
        url: `https://coub.com/view/${id}`,
        title: "Coub",
      };
    }
  }

  if (path.startsWith("/media/") || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(path)) {
    let title = "Видеофайл";
    const named = url.searchParams.get("n");
    if (named) title = named.slice(0, 80);
    return {
      platform: "file",
      id: url.pathname,
      url: url.href,
      title,
    };
  }

  return {
    platform: "link",
    id: url.href,
    url: url.href,
    title: host,
  };
}

export function embedFor(video, parentHost = window.location.hostname, opts = {}) {
  if (!video) return null;
  const { platform, id, url } = video;
  const t = Math.max(0, Math.floor(Number(opts.t) || 0));
  const auto = Boolean(opts.autoplay);
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1`;
    case "rutube":
      return `https://rutube.ru/play/embed/${id}?t=${t}&autoStart=${auto ? "true" : "false"}`;
    case "vk": {
      const [oid, vid] = id.split("_");
      return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&t=${t}&autoplay=${auto ? 1 : 0}`;
    }
    case "vimeo":
      return `https://player.vimeo.com/video/${id}?autoplay=${auto ? 1 : 0}#t=${t}s`;
    case "twitch": {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = t % 60;
      return `https://player.twitch.tv/?video=${id}&parent=${parentHost}&autoplay=${auto}&time=${h}h${m}m${s}s`;
    }
    case "twitch_live":
      return `https://player.twitch.tv/?channel=${id}&parent=${parentHost}&autoplay=${auto}`;
    case "coub":
      return `https://coub.com/embed/${id}`;
    case "file":
      return url;
    default:
      return url;
  }
}

export const SYNCABLE = new Set(["youtube", "file"]);

export function parseManyUrls(raw) {
  const text = String(raw || "");
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const parsed = parseVideoUrl(part);
    if (!parsed) continue;
    if (seen.has(parsed.url)) continue;
    seen.add(parsed.url);
    out.push(parsed);
  }
  return out;
}

let ytPromise;

export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    const existing = document.querySelector("script[data-yt]");
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.dataset.yt = "1";
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    if (window.YT?.Player) resolve(window.YT);
  });
  return ytPromise;
}
