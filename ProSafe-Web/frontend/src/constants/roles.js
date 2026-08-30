// Mirrors backend/constants/roles.js — kept as an enum here too so the
// frontend never compares against a raw string literal.
export const USER_ROLES = Object.freeze({
  ADMIN: "ADMIN",
  WORKER: "WORKER",
});
