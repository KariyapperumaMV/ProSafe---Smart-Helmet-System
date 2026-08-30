export function EmptyState({ icon = "—", title, description, action }) {
  return (
    <div className="ps-empty-state">
      <div className="ps-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="ps-empty-title">{title}</p>
      {description && <p className="ps-empty-desc">{description}</p>}
      {action}
    </div>
  );
}
