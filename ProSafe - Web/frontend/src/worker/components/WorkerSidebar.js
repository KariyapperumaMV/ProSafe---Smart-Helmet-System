import logo from "../../pictures/logo.png";
import { NavLink } from "react-router-dom";

const WorkerSidebar = () => {
  return (
    <aside className="sidebar">
      <div className="logo">
        <img src={logo} alt="BuildSafe logo" />
      </div>

      <nav>
        <NavLink to="/worker/dashboard" className="nav-item">
          Home
        </NavLink>

        <NavLink to="" className="nav-item">
          Users
        </NavLink>

        <NavLink to="" className="nav-item">
          Reports
        </NavLink>

        <NavLink to="" className="nav-item">
          Analytics
        </NavLink>
      </nav>
    </aside>
  );
};

export default WorkerSidebar;
