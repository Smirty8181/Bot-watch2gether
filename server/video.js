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

  const vk = (host === "vk.com" || host === "vk.ru" || host === "vkvideo.ru") &&
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

  if (path.startsWith("/media/") || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(path) || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url.search)) {
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

export function embedFor(video, parentHost = "localhost", opts = {}) {
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

export const SYNCABLE = new Set(["youtube", "file", "rutube", "vk", "vimeo", "twitch", "twitch_live", "coub", "link"]);

export async function checkEmbed(video) {
  if (!video) return { ok: false, error: "Нет видео." };
  if (video.platform !== "youtube") return { ok: true, video };
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(video.url)}&format=json`;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(2500) });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        ok: false,
        error: "YouTube не даёт встроить это видео.",
        video,
      };
    }
    if (!res.ok) return { ok: true, video };
    return { ok: true, video };
  } catch {
    return { ok: true, video };
  }
}

export async function enrichVideo(video) {
  if (!video?.url) return video;
  let extra = {};
  if (video.platform === "youtube") {
    const checked = await checkEmbed(video);
    if (!checked.ok) extra.embedBlocked = true;
  }
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(video.url)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(video.url)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.title) continue;
      return {
        ...video,
        ...extra,
        title: String(data.title).slice(0, 140),
        author: String(data.author_name || "").slice(0, 80),
        thumb: String(data.thumbnail_url || "").slice(0, 500),
      };
    } catch {
      /* try next */
    }
  }
  return { ...video, ...extra };
}
