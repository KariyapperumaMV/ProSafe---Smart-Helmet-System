import WeatherCard from "../components/WeatherCard";
import WorkersCard from "../components/WorkersCard";
import AlertsList from "../components/AlertsList";
import MessagesList from "../components/MessagesList";

const AdminDashboard = () => {
  return (
    <>
      <div className="dashboard-top">
        <WeatherCard />
        <WorkersCard />
      </div>

      <div className="dashboard-bottom">
        <AlertsList />
        <MessagesList />
      </div>
    </>
  );
};

export default AdminDashboard;
