const User = require("../models/User");

/* LOGIN
=========================================
*/
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // ---- BASIC VALIDATION ----
    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required"
      });
    }

    // ---- FIND USER ----
    const user = await User.findOne({ userId: username });

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    // ---- PASSWORD CHECK ----
    // (plain text for now – hash later)
    if (user.password !== password) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    /* ---- ADMIN ONLY ACCESS ----
    if (user.user_type !== "ADMIN") {
      return res.status(403).json({
        message: "Access denied. Admin users only."
      });
    }*/

    // ---- SUCCESS ----
    res.status(200).json({
      message: "Login successful",
      user: {
        userId: user.userId,
        name: user.name,
        user_type: user.user_type
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Server error during login"
    });
  }
};