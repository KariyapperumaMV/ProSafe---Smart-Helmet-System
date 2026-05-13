const WorkersCard = () => {
  return (
    <div className="card workers-card">
      <div className="worker-count">19</div>

      <ul className="status-list">
        <li className="safe">Safe - XX</li>
        <li className="warning">Warning - XX</li>
        <li className="critical">Critical - XX</li>
        <li className="emergency">Emergency - XX</li>
      </ul>
    </div>
  );
};

export default WorkersCard;
