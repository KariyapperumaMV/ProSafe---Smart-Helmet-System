import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { login as loginRequest } from "../api/authApi";

const AuthContext = createContext(null);

const TOKEN_KEY = "prosafe_token";
const USER_KEY = "prosafe_user";

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [initializing] = useState(false);

  const login = useCallback(async (username, password) => {
    const data = await loginRequest(username, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // Keeps the sidebar/header avatar in sync right after a self/admin edit
  // saves new profile fields, without forcing a re-login.
  const updateStoredUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, initializing, login, logout, updateStoredUser }),
    [user, initializing, login, logout, updateStoredUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
