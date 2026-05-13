import { useState } from "react";

const AdminReports = () => {
  const [userId, setUserId] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [timeRange, setTimeRange] = useState("today");

  const handleGenerateReport = () => {
    console.log("Generate report with:");
    console.log({
      userId,
      selectAll,
      timeRange
    });

    //TODO: when clicked load all available users

    alert("Generate report clicked (backend not connected yet)");
  };

  return (
    <div className="dashboard-content">
      <div
        className="card"
        style={{
          width: "360px",
          margin: "0 auto",
          background: "#e0e0e0",
          borderRadius: "20px",
          padding: "24px",
          textAlign: "center"
        }}
      >
        <h3 style={{ marginBottom: "20px" }}>Generate Report</h3>

        {/* User ID */}
        <div style={{ marginBottom: "14px", textAlign: "left" }}>
          <label>User ID</label>
          <select
            className="search-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={selectAll}
          >
            <option value="">UserID</option>
            {/* later populate dynamically */}
            <option value="USER_0001">USER_0001</option>
            <option value="USER_0002">USER_0002</option>
          </select>
        </div>

        {/* Select all users */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "14px",
            justifyContent: "center"
          }}
        >
          <label>Select all users</label>
          <input
            type="checkbox"
            checked={selectAll}
            onChange={(e) => {
              setSelectAll(e.target.checked);
              if (e.target.checked) {
                setUserId("");
              }
            }}
          />
        </div>

        {/* Time range */}
        <div style={{ marginBottom: "20px", textAlign: "left" }}>
          <label>Time</label>
          <select
            className="search-input"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="last_7_days">Last 7 days</option>
            <option value="last_30_days">Last 30 days</option>
          </select>
        </div>

        {/* Button */}
        <button
          className="primary-btn"
          style={{ width: "100%" }}
          onClick={handleGenerateReport}
        >
          Generate Report
        </button>
      </div>
    </div>
  );
};

export default AdminReports;