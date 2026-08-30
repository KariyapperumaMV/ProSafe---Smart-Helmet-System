import { useNavigate } from "react-router-dom";
import { UserAvatar } from "../ui/UserAvatar";
import { RoleBadge } from "../ui/StatusBadge";
import { Button } from "../ui/Button";

// Renders as a table row on desktop and collapses into a stacked card on
// mobile via CSS (#12) — same markup, no separate mobile component to keep
// in sync.
export function UserRow({ user, onDelete }) {
  const navigate = useNavigate();

  return (
    <div className="ps-user-row">
      <div className="ps-user-row-identity">
        <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={44} />
        <div>
          <div className="ps-user-row-name">{user.name}</div>
          <div className="ps-user-row-sub">
            <RoleBadge role={user.role} />
            {user.role === "WORKER" && (
              <span className="ps-user-row-helmet">{user.helmetId ? user.helmetId : "No helmet"}</span>
            )}
          </div>
        </div>
      </div>

      <div className="ps-user-row-actions">
        <Button variant="secondary" size="sm" onClick={() => navigate(`/users/${user.userId}`)}>
          View
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/users/${user.userId}/edit`)}>
          Update
        </Button>
        <Button variant="danger" size="sm" onClick={() => onDelete(user)}>
          Delete
        </Button>
      </div>
    </div>
  );
}
