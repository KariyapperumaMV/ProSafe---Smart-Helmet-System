import { StatusBadge } from "../ui/StatusBadge";
import { Button } from "../ui/Button";

// #14/#17 — same row markup on desktop and mobile; CSS (shared with the
// Users list) collapses it into a stacked card below 640px.
export function HelmetCard({ helmet, onView, onDelete }) {
  return (
    <div className="ps-user-row">
      <div className="ps-user-row-identity">
        <div className="ps-helmet-icon" aria-hidden="true">
          ⛑
        </div>
        <div>
          <div className="ps-user-row-name">{helmet.helmetId}</div>
          <div className="ps-user-row-sub">
            <StatusBadge tone={helmet.assigned ? "green" : "neutral"}>
              {helmet.assigned ? "Assigned" : "Unassigned"}
            </StatusBadge>
            {helmet.assigned && <span className="ps-user-row-helmet">{helmet.assignedTo.name}</span>}
          </div>
        </div>
      </div>

      <div className="ps-user-row-actions">
        <Button variant="secondary" size="sm" onClick={() => onView(helmet)}>
          View
        </Button>
        <Button variant="danger" size="sm" onClick={() => onDelete(helmet)}>
          Delete
        </Button>
      </div>
    </div>
  );
}
