export const THEMES = [
  { id: "rave", name: "Зал", hint: "кино ночью", bg: "#0E0C11", accent: "#FF3D6E" },
  { id: "neon", name: "Неон", hint: "красный", bg: "#090909", accent: "#FF3B3B" },
  { id: "midnight", name: "Ночь", hint: "синий", bg: "#07111F", accent: "#4DB4E8" },
  { id: "light", name: "День", hint: "светло", bg: "#F3EFE9", accent: "#D11F5A" },
];

const KEY = "wt-theme";

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return "rave";
}

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : "rave";
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  const meta = THEMES.find((t) => t.id === theme);
  const tg = window.Telegram?.WebApp;
  try {
    tg?.setHeaderColor?.(meta.bg);
    tg?.setBackgroundColor?.(meta.bg);
  } catch {
    /* ignore */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", meta.bg);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme === "light" ? "light" : "dark");
  return theme;
}
