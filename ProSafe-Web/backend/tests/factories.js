const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { USER_ROLES } = require("../constants/roles");

let seq = 0;

async function createUser(overrides = {}) {
  seq += 1;
  const role = overrides.role || USER_ROLES.WORKER;
  const passwordHash = await bcrypt.hash(overrides.password || "Passw0rd1", 10);

  return User.create({
    userId: overrides.userId || `${role === USER_ROLES.ADMIN ? "ADM" : "W"}-${String(seq).padStart(3, "0")}`,
    name: overrides.name || `Test User ${seq}`,
    email: overrides.email || `user${seq}@example.com`,
    passwordHash,
    nic: overrides.nic || `${100000000 + seq}V`,
    phone: overrides.phone || "0771234567",
    role,
    helmetId: overrides.helmetId ?? null,
    baselineHeartRate: overrides.baselineHeartRate ?? null,
    baselineBodyTemperature: overrides.baselineBodyTemperature ?? null,
    active: overrides.active ?? true,
  });
}

function tokenFor(user) {
  return jwt.sign({ id: user.userId, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

module.exports = { createUser, tokenFor, authHeader };
