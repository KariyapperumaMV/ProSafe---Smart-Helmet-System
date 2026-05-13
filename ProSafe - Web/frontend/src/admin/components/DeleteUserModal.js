// src/admin/components/DeleteUserModal.js
import axios from "axios";

const DeleteUserModal = ({ userId, onClose, onDeleted }) => {
  const handleDelete = async () => {
    try {
      await axios.delete(
        `http://localhost:5000/api/users/delete/${userId}`
      );

      alert("User deleted successfully");

      if (onDeleted) {
        onDeleted();
      }

      onClose();

    } catch (error) {
      console.error(error);

      const message =
        error.response?.data?.message ||
        "Failed to delete user";

      alert(message);
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        style={{
          width: "420px",
          alignItems: "center",
          textAlign: "center"
        }}
      >
        {/* Icon */}
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              width: "70px",
              height: "70px",
              borderRadius: "50%",
              background: "#e74c3c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto"
            }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: "36px",
                fontWeight: "bold"
              }}
            >
              ×
            </span>
          </div>
        </div>

        <h3>Are you sure?</h3>

        <p style={{ fontSize: "14px", color: "#555", marginTop: "8px" }}>
          Do you really want to delete this record? This process cannot be undone.
        </p>

        <div className="modal-footer" style={{ marginTop: "20px" }}>
          <button className="gray-btn" onClick={onClose}>
            Close
          </button>

          <button
            className="primary-btn"
            style={{ background: "#e74c3c" }}
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteUserModal;