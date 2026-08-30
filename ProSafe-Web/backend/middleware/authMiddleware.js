const jwt = require("jsonwebtoken");
const { USER_ROLES } = require("../constants/roles");

// Populates req.user = { id, role } from a Bearer token. Every /api/users*
// and /api/helmets* route sits behind this — RBAC is enforced here and in
// requireRole, never inferred from anything the client sends in the body.
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
}

// ADMIN may target any user id; WORKER may only target their own — used by
// the sensor-history routes so the frontend calls the same /:id endpoints
// whether it's an admin viewing a worker or a worker viewing themselves,
// instead of duplicating a parallel /me/... route tree.
function requireSelfOrAdmin(paramName = "id") {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (req.user.role === USER_ROLES.ADMIN || req.user.id === req.params[paramName]) {
      return next();
    }
    return res.status(403).json({ message: "You do not have permission to view this user's data" });
  };
}

module.exports = { verifyToken, requireRole, requireSelfOrAdmin };
