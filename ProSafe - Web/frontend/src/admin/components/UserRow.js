import { useState } from "react";
import ViewUserModal from "./ViewUserModal";
import UpdateUserModal from "./UpdateUserModal";
import DeleteUserModal from "./DeleteUserModal";
import avatar from "../../pictures/user.png";

const UserRow = ({ user }) => {

  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className={`user-row glass-card ${user.status || "safe"}`}>

        <div className="user-info">

          <img
            src={avatar}
            alt="User avatar"
            className="user-avatar"
          />

          <div className="user-meta">
            <div className="user-id">
              {user.id}
            </div>

            <div className="user-name">
              {user.name}
            </div>

            <div className="user-role">
              {user.role}
            </div>
          </div>

        </div>

        <div className="user-actions">

          <button
            className="gray-btn"
            onClick={() => setViewOpen(true)}
          >
            View
          </button>

          <button
            className="gray-btn"
            onClick={() => setEditOpen(true)}
          >
            Update
          </button>

          <button
            className="gray-btn danger-btn"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </button>

        </div>

      </div>

      {viewOpen && (
        <ViewUserModal
          user={user.raw}
          onClose={() => setViewOpen(false)}
        />
      )}

      {editOpen && (
        <UpdateUserModal
          user={user.raw}
          onClose={() => setEditOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteUserModal
          userId={user.id}
          onClose={() => setDeleteOpen(false)}
          onConfirm={(id) => {
            console.log("Delete user:", id);
            setDeleteOpen(false);
          }}
        />
      )}
    </>
  );
};

export default UserRow;