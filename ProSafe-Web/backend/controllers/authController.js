const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { toPublicUser, isValidPassword } = require("../services/userService");

// Login page (Figure 1) labels the field "Username" — accept either the
// generated userId or the email so admins/workers don't have to remember
// which one they were given.
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await User.findOne({
      active: true,
      $or: [{ userId: username }, { email: username.toLowerCase() }],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { id: user.userId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.status(200).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/password — authenticated only (verifyToken, mounted in
// routes/authRoutes.js). Never returns passwordHash; never logs either
// password.
//
// Note on session behavior: this app's JWTs are a single stateless token
// ({id, role}, 8h expiry, no version/revocation field anywhere in the
// schema or verifyToken). Changing the password does NOT invalidate the
// currently-active token, or any other token issued before expiry — there
// is no mechanism in the current architecture to do that short of adding a
// tokenVersion field to User and checking it on every request, which is out
// of scope for this phase (approved: "do not implement tokenVersion /
// revocation now").
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const user = await User.findOne({ userId: req.user.id, active: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentMatches) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: "Password does not meet requirements" });
    }

    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      return res.status(400).json({ message: "New password must be different from your current password" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};
