import AlertCard from "./AlertCard";

const AlertsList = () => {
  const alerts = [
    { id: 1, level: "critical", sensor: "Gas Sensor" },
    { id: 2, level: "warning", sensor: "Temperature" },
    { id: 3, level: "safe", sensor: "Heart Rate" }
  ];

  return (
    <div className="card alerts-card">
      <h3>Alerts</h3>

      <div className="alerts-list">
        {alerts.map(alert => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
};

export default AlertsList;
