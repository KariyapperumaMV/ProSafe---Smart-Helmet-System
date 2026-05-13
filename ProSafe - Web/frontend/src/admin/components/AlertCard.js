const AlertCard = ({ alert }) => {
  return (
    <div className={`alert-card ${alert.level}`}>
      <div>
        <strong>User ID</strong>
        <p>Triggered by: {alert.sensor}</p>
      </div>

      <div className="alert-actions">
        <button>View</button>
        <button>Mark as read</button>
      </div>
    </div>
  );
};

export default AlertCard;
