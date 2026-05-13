import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import logo from "../pictures/logo.png";

const Login = () => {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!username || !password) {
      alert("Please enter username and password");
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/auth/login", {
        username,
        password
      });

      const { user } = res.data;

      // Redirect by role
      if (user.user_type === "ADMIN") {
        navigate("/admin/dashboard");
      } else if (user.user_type === "WORKER") {
        navigate("/worker/dashboard");
      }

    } catch (error) {
      console.error(error);

      const message =
        error.response?.data?.message ||
        "Login failed. Please try again.";

      alert(message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="BuildSafe logo" className="login-logo" />

        <input
          type="text"
          placeholder="Username"
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <div className="password-wrapper">
          <input
            type="password"
            placeholder="Password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="login-btn" onClick={handleLogin}>
          Login
        </button>
      </div>
    </div>
  );
};

export default Login;