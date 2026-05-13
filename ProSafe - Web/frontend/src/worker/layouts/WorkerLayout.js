/*needed: , workerheader, messages, alerts,location
*/

import { Outlet } from "react-router-dom";
import WorkerSidebar from "../components/WorkerSidebar";
import WorkerHeader from "../components/WorkerHeader";

const WorkerLayout = () => {
  return (
    <div className="dashboard-container">
      <WorkerSidebar />

      <div className="dashboard-main">
        <WorkerHeader />
        <div className="dashboard-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default WorkerLayout;
