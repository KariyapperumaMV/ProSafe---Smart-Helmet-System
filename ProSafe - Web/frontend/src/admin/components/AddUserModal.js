import { useState, useEffect } from "react";
import axios from "axios";

const AddUserModal = ({ onClose }) => {
  const [form, setForm] = useState({
    name: "",
    password: "",
    user_type: "",
    nic: "",
    phoneNo: "",
    email: "",
    helmet: ""
  });

  const [helmets, setHelmets] = useState([]);

  // ----------------------------------
  // FETCH AVAILABLE HELMETS ON LOAD
  // ----------------------------------
  useEffect(() => {
    const fetchHelmets = async () => {
      try {
        const res = await axios.get(
          "http://localhost:5000/api/helmet/available"
        );
        setHelmets(res.data.helmets || []);
      } catch (error) {
        console.error("Failed to fetch helmets", error);
      }
    };

    fetchHelmets();

    // refresh every 60 seconds
    const interval = setInterval(fetchHelmets, 60000);

    return () => clearInterval(interval);
  }, []);

  // ----------------------------------
  // HANDLE INPUT CHANGE
  // ----------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    // If ADMIN selected, clear helmet
    if (name === "user_type" && value === "ADMIN") {
      setForm({
        ...form,
        user_type: value,
        helmet: ""
      });
      return;
    }

    setForm({
      ...form,
      [name]: value
    });
  };

  // ----------------------------------
  // VALIDATION
  // ----------------------------------
  const validateForm = () => {
    if (
      !form.name ||
      !form.password ||
      !form.user_type ||
      !form.nic ||
      !form.phoneNo ||
      !form.email
    ) {
      alert("Please fill in all required fields");
      return false;
    }

    if (!/^[0-9]{12}$/.test(form.nic)) {
      alert("NIC must contain exactly 12 digits");
      return false;
    }

    if (!/^0[0-9]{9}$/.test(form.phoneNo)) {
      alert("Please enter valid phone number");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      alert("Please enter a valid email address");
      return false;
    }

    return true;
  };

  // ----------------------------------
  // ADD USER
  // ----------------------------------
  const handleAddUser = async () => {
    if (!validateForm()) return;

    try {
      await axios.post("http://localhost:5000/api/users/add", {
        name: form.name,
        password: form.password,
        user_type: form.user_type,
        nic: form.nic,
        phoneNo: form.phoneNo,
        email: form.email,
        helmet: form.user_type === "ADMIN" ? null : form.helmet || null
      });

      alert("User added successfully");
      onClose();

    } catch (error) {
      console.error(error);

      const message =
        error.response?.data?.message ||
        "Something went wrong while adding the user";

      alert(message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: "600px" }}>
        {/* Header */}
        <div className="modal-header">
          <h3>Add User</h3>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ justifyContent: "center" }}>
          <div className="modal-section" style={{ width: "420px" }}>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div className="user-avatar large" />
            </div>

            <div style={{ display: "grid", rowGap: "12px" }}>
              <div>
                <label>User name</label>
                <input
                  className="search-input"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Password</label>
                <input
                  type="password"
                  className="search-input"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Type</label>
                <select
                  className="search-input"
                  name="user_type"
                  value={form.user_type}
                  onChange={handleChange}
                >
                  <option value="">Select type</option>
                  <option value="ADMIN">Admin</option>
                  <option value="WORKER">Worker</option>
                </select>
              </div>

              <div>
                <label>NIC</label>
                <input
                  className="search-input"
                  name="nic"
                  value={form.nic}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Phone number</label>
                <input
                  className="search-input"
                  name="phoneNo"
                  value={form.phoneNo}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label>Email</label>
                <input
                  className="search-input"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>

              {/* Helmet selection */}
              <div>
                <label>Helmet</label>
                <select
                  className="search-input"
                  name="helmet"
                  value={form.helmet}
                  onChange={handleChange}
                  disabled={form.user_type === "ADMIN"}
                >
                  <option value="">Not selected</option>

                  {helmets.map((helmetId) => (
                    <option key={helmetId} value={helmetId}>
                      {helmetId}
                    </option>
                  ))}
                </select>

                {form.user_type === "ADMIN" && (
                  <small style={{ color: "#777" }}>
                    Helmet assignment is disabled for Admin users
                  </small>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="gray-btn" onClick={onClose}>
            Close
          </button>
          <button className="primary-btn" onClick={handleAddUser}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddUserModal;