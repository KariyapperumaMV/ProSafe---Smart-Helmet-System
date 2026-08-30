import { fileUrl } from "../../api/apiClient";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function UserAvatar({ name, imageUrl, size = 40 }) {
  const src = fileUrl(imageUrl);
  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (src) {
    return <img src={src} alt={name || "User"} className="ps-avatar" style={style} />;
  }

  return (
    <div className="ps-avatar ps-avatar-fallback" style={style} aria-hidden="true">
      {initials(name)}
    </div>
  );
}
