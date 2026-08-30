import { Link } from "react-router-dom";

// #11 breadcrumb: "Home / Page". `crumbs` is [{label, to?}] — the last entry
// renders as plain text (current page), everything before it links.
export function PageHeader({ title, crumbs = [], actions }) {
  return (
    <div className="ps-page-header">
      <div>
        <h1 className="ps-page-title">{title}</h1>
        <nav className="ps-breadcrumb" aria-label="Breadcrumb">
          <Link to="/dashboard">Home</Link>
          {crumbs.map((crumb, i) => (
            <span key={crumb.label}>
              <span className="ps-breadcrumb-sep" aria-hidden="true">
                /
              </span>
              {crumb.to && i !== crumbs.length - 1 ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span className="ps-breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      {actions && <div className="ps-page-actions">{actions}</div>}
    </div>
  );
}
