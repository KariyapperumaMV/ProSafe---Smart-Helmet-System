import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GlassCard } from "../components/ui/GlassCard";
import { Field, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import logo from "../assets/prosafe-logo.png";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const redirectTo = location.state?.from?.pathname || "/dashboard";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ps-login-page">
      <GlassCard className="ps-login-card">
        <img src={logo} alt="ProSafe Smart Helmet" className="ps-login-logo" />
        <h1 className="ps-login-title">Login</h1>

        <form onSubmit={handleSubmit} noValidate>
          <Field label="Username" htmlFor="username">
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or email"
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password" error={error}>
            <div className="ps-password-field">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                error={!!error}
                required
              />
              <button
                type="button"
                className="ps-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </Field>

          <Button type="submit" variant="primary" loading={submitting} className="ps-login-submit">
            Login
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
