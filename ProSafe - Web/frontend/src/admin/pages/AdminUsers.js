import { useState } from "react";
import UserList from "../components/UserList";
import AddUserModal from "../components/AddUserModal";

const AdminUsers = () => {
  const [showAddUser, setShowAddUser] = useState(false);

  return (
    <div className="card users-card">

      <div className="users-header">
        <h3>Users Management</h3>

        <div className="users-toolbar">
          <input
            type="text"
            placeholder="Search user..."
            className="search-input"
          />

          <button
            className="primary-btn"
            onClick={() => setShowAddUser(true)}
          >
            + Add User
          </button>
        </div>
      </div>

      <UserList />

      {showAddUser && (
        <AddUserModal onClose={() => setShowAddUser(false)} />
      )}
    </div>
  );
};

export default AdminUsers;