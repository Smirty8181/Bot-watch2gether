import { searchYoutube } from "./ytsearch.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function item({ id, title, author, thumb, url }) {
  return {
    id: String(id || "").slice(0, 80),
    title: String(title || "Видео")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .slice(0, 120),
    author: String(author || "").slice(0, 80),
    thumb: String(thumb || "")
      .replace(/\\\//g, "/")
      .slice(0, 500),
    url: String(url || "").slice(0, 500),
  };
}

async function searchRutube(query) {
  const res = await fetch(
    `https://rutube.ru/api/search/video/?query=${encodeURIComponent(query)}&limit=12`,
    {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(4000),
    }
  );
  if (!res.ok) throw new Error("rutube");
  const data = await res.json();
  const list = data.results || data.videos || [];
  return list
    .slice(0, 12)
    .map((v) => {
      const id = v.id || v.video_id;
      return item({
        id,
        title: v.title,
        author: v.author?.name || v.author || "Rutube",
        thumb: v.thumbnail_url || v.poster_url || v.thumbnail,
        url: `https://rutube.ru/video/${id}/`,
      });
    })
    .filter((v) => v.id);
}

async function searchTwitch(query) {
  const res = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify({
      query: `query ($q: String!) {
        searchFor(userQuery: $q, platform: WEB) {
          channels { items { login displayName profileImageURL(width: 70) stream { title } } }
          videos { items { id title previewThumbnailURL owner { displayName } } }
        }
      }`,
      variables: { q: query },
    }),
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error("twitch");
  const data = await res.json();
  if (data.errors) throw new Error("twitch gql");
  const pack = data.data?.searchFor || {};
  const live = (pack.channels?.items || []).slice(0, 6).map((c) =>
    item({
      id: c.login,
      title: c.stream ? `🔴 ${c.displayName}` : c.displayName,
      author: c.stream?.title || "Twitch",
      thumb: c.profileImageURL,
      url: `https://www.twitch.tv/${c.login}`,
    })
  );
  const vods = (pack.videos?.items || []).slice(0, 6).map((v) =>
    item({
      id: v.id,
      title: v.title,
      author: v.owner?.displayName || "Twitch",
      thumb: String(v.previewThumbnailURL || "")
        .replace("%{width}", "320")
        .replace("%{height}", "180")
        .replace("{width}", "320")
        .replace("{height}", "180"),
      url: `https://www.twitch.tv/videos/${v.id}`,
    })
  );
  return [...live, ...vods].filter((v) => v.id);
}

async function searchVk(query) {
  const form = new URLSearchParams({
    act: "search_video",
    al: "1",
    q: query,
    offset: "0",
  });
  const res = await fetch("https://vk.com/al_video.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
    },
    body: form.toString(),
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error("vk");
  const data = await res.json();
  const list = data.payload?.[1]?.[2]?.list;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 12).map((row) => {
    const oid = row[0];
    const vid = row[1];
    const id = `${oid}_${vid}`;
    return item({
      id,
      title: row[3] || "VK Видео",
      author: "VK",
      thumb: row[2],
      url: `https://vk.com/video${id}`,
    });
  }).filter((v) => v.id.includes("_"));
}

async function searchDuckVimeo(query) {
  const pages = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:vimeo.com ${query}`)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(`site:vimeo.com ${query}`)}`,
  ];
  const seen = new Set();
  const out = [];
  for (const page of pages) {
    if (out.length >= 12) break;
    try {
      const res = await fetch(page, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const html = await res.text();
      for (const row of html.matchAll(/vimeo\.com\/(\d{6,})/g)) {
        const id = row[1];
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(
          item({
            id,
            title: `Vimeo ${id}`,
            author: "Vimeo",
            thumb: `https://vumbnail.com/${id}.jpg`,
            url: `https://vimeo.com/${id}`,
          })
        );
        if (out.length >= 12) break;
      }
    } catch {
      /* next */
    }
  }
  return out;
}

export async function searchPlatform(platform, raw) {
  const query = String(raw || "").trim().slice(0, 80);
  if (query.length < 2) return [];
  const p = String(platform || "youtube").toLowerCase();
  try {
    if (p === "youtube") return searchYoutube(query);
    if (p === "rutube") return searchRutube(query);
    if (p === "twitch") return searchTwitch(query);
    if (p === "vk") return searchVk(query);
    if (p === "vimeo") return searchDuckVimeo(query);
  } catch {
    return [];
  }
  return [];
}
