const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { toPublicUser } = require("../services/userService");

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
