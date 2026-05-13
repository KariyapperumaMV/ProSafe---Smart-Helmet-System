const WorkerHeader = () => {
  return (
    <header className="header">
      <div className="header-box">
        <input
          type="text"
          placeholder="Search"
          className="search-input"
        />

        <div className="header-right">
          <span className="bell">🔔</span>
          <div className="profile">
            <span className="profile-name">David Jones</span>
            <small>Worker Account</small>
          </div>
        </div>
      </div>
    </header>
  );
};

export default WorkerHeader;
