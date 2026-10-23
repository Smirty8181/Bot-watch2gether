function collectVideos(node, out = [], seen = new Set(), state = { n: 0 }) {
  if (!node || out.length >= 12 || state.n++ > 6000) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out, seen, state);
    return out;
  }
  if (typeof node !== "object") return out;
  const vr = node.videoRenderer || node.gridVideoRenderer || node.compactVideoRenderer;
  if (vr?.videoId && !seen.has(vr.videoId)) {
    seen.add(vr.videoId);
    const title =
      vr.title?.runs?.map((r) => r.text).join("") || vr.title?.simpleText || "YouTube";
    const thumbs = vr.thumbnail?.thumbnails || [];
    const author =
      vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "";
    out.push({
      id: vr.videoId,
      title: String(title).slice(0, 120),
      author: String(author).slice(0, 80),
      thumb: String(thumbs.at(-1)?.url || "").slice(0, 500),
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
    });
  }
  for (const value of Object.values(node)) collectVideos(value, out, seen, state);
  return out;
}

async function innertube(query) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "ru,en",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240620.00.00",
          hl: "ru",
          gl: "RU",
        },
      },
      query,
    }),
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error("yt");
  const data = await res.json();
  return collectVideos(data);
}

async function invidious(query) {
  const hosts = ["https://inv.nadeko.net", "https://y.com.sb", "https://invidious.nerdvpn.de"];
  for (const host of hosts) {
    try {
      const res = await fetch(
        `${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      return data.slice(0, 12).map((v) => ({
        id: v.videoId,
        title: String(v.title || "YouTube").slice(0, 120),
        author: String(v.author || "").slice(0, 80),
        thumb: String(v.videoThumbnails?.[2]?.url || v.videoThumbnails?.[0]?.url || "").slice(0, 500),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));
    } catch {
      /* next */
    }
  }
  return [];
}

export async function searchYoutube(raw) {
  const query = String(raw || "").trim().slice(0, 80);
  if (query.length < 2) return [];
  try {
    const items = await innertube(query);
    if (items.length) return items;
  } catch {
    /* fallback */
  }
  return invidious(query);
}
