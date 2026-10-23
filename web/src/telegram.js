export function getTelegram() {
  return window.Telegram?.WebApp || null;
}

function readLaunchParams() {
  const out = {};
  const eat = (raw) => {
    if (!raw) return;
    const str = String(raw).replace(/^#/, "").replace(/^\?/, "");
    if (!str) return;
    const params = new URLSearchParams(str);
    for (const [key, value] of params) out[key] = value;
  };
  try {
    eat(window.location.hash);
  } catch {
    /* ignore */
  }
  try {
    eat(window.location.search);
  } catch {
    /* ignore */
  }
  try {
    eat(sessionStorage.getItem("wt-tg-hash"));
  } catch {
    /* ignore */
  }
  try {
    const stored = sessionStorage.getItem("__telegram__initParams");
    if (stored) Object.assign(out, JSON.parse(stored));
  } catch {
    /* ignore */
  }
  return out;
}

function parseUserFromInitData(raw) {
  if (!raw) return null;
  try {
    const data = new URLSearchParams(raw);
    const userRaw = data.get("user");
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function mapUser(raw) {
  if (!raw?.id) return null;
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim().slice(0, 40);
  return {
    id: String(raw.id),
    name: name || "Гость",
    username: raw.username || "",
    photo: raw.photo_url || "",
  };
}

export function parseTelegramUser() {
  const tg = getTelegram();
  const fromApi = mapUser(tg?.initDataUnsafe?.user);
  if (fromApi) return fromApi;
  const params = readLaunchParams();
  return mapUser(parseUserFromInitData(params.tgWebAppData));
}

export function isTelegramApp() {
  const tg = getTelegram();
  if (tg?.initData || tg?.initDataUnsafe?.user) return true;
  const params = readLaunchParams();
  return Boolean(params.tgWebAppData);
}

let viewportBound = false;

export function initTelegram() {
  const tg = getTelegram();
  try {
    const hash = window.location.hash || "";
    if (hash.includes("tgWebAppData")) sessionStorage.setItem("wt-tg-hash", hash);
  } catch {
    /* ignore */
  }
  try {
    tg?.ready();
    tg?.expand();
    tg?.enableClosingConfirmation?.();
    tg?.disableVerticalSwipes?.();
  } catch {
    /* older clients */
  }

  let lastStable = 0;
  let timer = 0;
  const apply = () => {
    const app = getTelegram();
    const stable = Math.round(Number(app?.viewportStableHeight) || window.innerHeight || 0);
    const live = Math.round(
      Number(app?.viewportHeight) || window.visualViewport?.height || window.innerHeight || 0
    );
    if (!lastStable || Math.abs(stable - lastStable) >= 24) {
      lastStable = stable || lastStable;
      if (lastStable) {
        document.documentElement.style.setProperty("--app-height", `${lastStable}px`);
      }
    }
    const kb = Math.max(0, (lastStable || stable) - live);
    const open = kb >= 60;
    document.documentElement.style.setProperty("--kb", `${open ? kb : 0}px`);
    document.documentElement.classList.toggle("kb", open);
  };
  apply();
  if (viewportBound) return tg;
  viewportBound = true;
  const onVp = () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 90);
  };
  tg?.onEvent?.("viewportChanged", onVp);
  window.addEventListener("resize", onVp);
  window.visualViewport?.addEventListener("resize", onVp);
  return tg;
}

export function haptic(type = "light") {
  const h = getTelegram()?.HapticFeedback;
  if (!h) return;
  try {
    if (type === "success") h.notificationOccurred("success");
    else if (type === "error") h.notificationOccurred("error");
    else h.impactOccurred(type);
  } catch {
    /* ignore */
  }
}

export function setAppFullscreen(on) {
  const tg = getTelegram();
  try {
    if (on) tg?.requestFullscreen?.();
    else tg?.exitFullscreen?.();
  } catch {
    /* older clients */
  }
}

function localGuest() {
  const key = "wt-guest";
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    saved = null;
  }
  if (saved?.id) return saved;
  const guest = {
    id: `local-${Math.random().toString(36).slice(2, 10)}`,
    name: "Гость",
    username: "",
    photo: "",
  };
  try {
    localStorage.setItem(key, JSON.stringify(guest));
  } catch {
    /* ignore */
  }
  return guest;
}

export function getUser(opts = {}) {
  const fromTg = parseTelegramUser();
  if (fromTg) return fromTg;
  if (opts.guest === false) return null;
  return localGuest();
}

export function getStartRoom() {
  const params = new URLSearchParams(window.location.search);
  const launch = readLaunchParams();
  const fromQuery = params.get("room") || params.get("startapp");
  const fromTg = getTelegram()?.initDataUnsafe?.start_param || launch.tgWebAppStartParam;
  return String(fromQuery || fromTg || "")
    .trim()
    .toUpperCase();
}

export function shareInvite(code) {
  const link = `https://t.me/sovmestniprosmotrbot?start=${code}`;
  const text = `Смотрим вместе! Комната ${code}`;
  const tg = getTelegram();
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(share);
    return;
  }
  window.open(share, "_blank");
}

export async function copyText(value) {
  const text = String(value ?? "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export function openExternal(url) {
  const tg = getTelegram();
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
