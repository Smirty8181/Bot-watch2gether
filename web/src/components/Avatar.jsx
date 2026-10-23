import { memo, useState } from "react";

function AvatarInner({ name = "?", photo, color, online, host, size = 32, className = "" }) {
  const [broken, setBroken] = useState(false);
  const show = photo && !broken;
  const letter = String(name).trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className={`ava ${host ? "is-host" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        background: show ? "#2a2433" : color || "#6b5a7a",
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
    >
      {show ? (
        <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        letter
      )}
      {online ? <i className="dot" /> : null}
    </span>
  );
}

export const Avatar = memo(AvatarInner);
