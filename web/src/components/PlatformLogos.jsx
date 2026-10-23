export function LogoYouTube() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="22" height="16" x="1" y="4" rx="5" fill="#FF0000" />
      <path d="M10 8.6v6.8l6.2-3.4z" fill="#fff" />
    </svg>
  );
}

export function LogoRutube() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="22" height="16" x="1" y="4" rx="5" fill="#FF4F1F" />
      <path d="M8.2 8.2h4.1c1.9 0 3.1 1.1 3.1 2.7 0 1.2-.7 2.1-1.8 2.5L16 15.8h-2.3l-2.1-2.4H10v2.4H8.2V8.2zm1.8 1.6v2.2h1.9c.9 0 1.4-.4 1.4-1.1s-.5-1.1-1.4-1.1H10z" fill="#fff" />
    </svg>
  );
}

export function LogoVK() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="22" height="22" x="1" y="1" rx="6" fill="#0077FF" />
      <text x="12" y="16.2" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="Arial, sans-serif">
        VK
      </text>
    </svg>
  );
}

export function LogoTwitch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#9146FF" d="M5.2 3 3 6.2v12.6h4.4V21l2.2-2.2h3.3L18.4 14V3H5.2zm11.8 10-2.2 2.2h-3.3l-1.9 1.9v-1.9H6.6V4.6h10.4V13z" />
      <path fill="#fff" d="M14.8 7.2h1.6v4.4h-1.6V7.2zm-4.2 0H12.2v4.4h-1.6V7.2z" />
    </svg>
  );
}

export function LogoVimeo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="22" height="22" x="1" y="1" rx="6" fill="#1AB7EA" />
      <path
        fill="#fff"
        d="M18.2 9.3c-.1 2.3-1.6 5.4-4.6 9.2H10c-1.1-2.1-2.3-4.2-3.4-6.3-.2-.4 0-.6.4-.6.7 0 1.4.4 1.8 1.4.6 1.6 1 2.6 1.4 3.1.9-1.5 1.8-3.4 1.7-4.6-.1-1.1-.8-1.1-1.6-.6l-.5-1.2c1.3-.8 2.6-1.2 3.6-1.2 1.4 0 2.1.8 2.2 2.8z"
      />
    </svg>
  );
}

export function LogoFile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="22" height="22" x="1" y="1" rx="6" fill="#2D2A3A" />
      <rect x="6" y="6.5" width="12" height="11" rx="2.2" fill="#7CFFB2" />
      <path d="M10.4 9.6v5.2l4.4-2.6z" fill="#121018" />
    </svg>
  );
}

export const PLATFORM_LOGOS = {
  youtube: LogoYouTube,
  rutube: LogoRutube,
  vk: LogoVK,
  twitch: LogoTwitch,
  vimeo: LogoVimeo,
  file: LogoFile,
};
