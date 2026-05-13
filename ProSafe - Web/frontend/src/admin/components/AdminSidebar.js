import logo from "../../pictures/logo.png";
import { NavLink } from "react-router-dom";

const AdminSidebar = () => {
  return (
    <aside className="sidebar">
      <div className="logo">
        <img src={logo} alt="BuildSafe logo" />
      </div>

      <nav>
        <NavLink to="/admin/dashboard" className="nav-item">
          Home
        </NavLink>

        <NavLink to="/admin/users" className="nav-item">
          Users
        </NavLink>

        <NavLink to="/admin/reports" className="nav-item">
          Reports
        </NavLink>

        <NavLink to="/admin/analytics" className="nav-item">
          Analytics
        </NavLink>
      </nav>
    </aside>
  );
};

export default AdminSidebar;
