const User = require("../models/User");

/* ADD USER
=========================================
*/

exports.addUser = async (req, res) => {
  try {
    console.log("ADD USER API HIT");
    console.log("Request body:", req.body);

    const {
      name,
      nic,
      phoneNo,
      email,
      password,
      user_type,
      helmet
    } = req.body;

    // ---- BASIC REQUIRED FIELD CHECK ----
    if (
      !name ||
      !nic ||
      !phoneNo ||
      !email ||
      !password ||
      !user_type
    ) {
      return res.status(400).json({
        message: "All fields except helmet are required"
      });
    }

    // ---- USER TYPE VALIDATION ----
    if (!["ADMIN", "WORKER"].includes(user_type)) {
      return res.status(400).json({
        message: "User type must be Admin or Worker"
      });
    }

    // ---- NIC VALIDATION (12 digits) ----
    if (!/^[0-9]{12}$/.test(nic)) {
      return res.status(400).json({
        message: "NIC must contain exactly 12 digits"
      });
    }

    // ---- PHONE NUMBER VALIDATION (10 digits, starts with 0) ----
    if (!/^0[0-9]{9}$/.test(phoneNo)) {
      return res.status(400).json({
        message: "Phone number must be 10 digits and start with 0"
      });
    }

    // ---- EMAIL VALIDATION ----
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "Invalid email address"
      });
    }

    // ---- GENERATE USER ID ----
    const lastUser = await User.findOne()
      .sort({ userId: -1 })
      .select("userId");

    let newUserId = "USER_0001";

    if (lastUser && lastUser.userId) {
      const lastNumber = parseInt(lastUser.userId.split("_")[1], 10);
      const nextNumber = lastNumber + 1;
      newUserId = `USER_${String(nextNumber).padStart(4, "0")}`;
    }

    // ---- CREATE USER ----
    const user = await User.create({
      userId: newUserId,
      name,
      nic,
      phoneNo,
      email,
      password,
      user_type,
      helmet: helmet ? helmet : null
    });

    res.status(201).json({
      message: "User created successfully",
      user
    });

  } catch (error) {
    console.error("Add user error:", error);

    // ---- DUPLICATE KEY ERROR ----
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];

      let message = "Duplicate value found";

      if (field === "nic") {
        message = "A user with this NIC already exists";
      } else if (field === "email") {
        message = "A user with this email already exists";
      } else if (field === "userId") {
        message = "User ID already exists";
      }

      return res.status(409).json({ message });
    }

    // ---- FALLBACK ERROR ----
    res.status(500).json({
      message: "Unable to add user. Please try again."
    });
  }
};

/* GET ALL USERS
=========================================
*/
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ userId: 1 });

    if (users.length === 0) {
      console.log("User database is empty");
    }

    res.status(200).json({
      count: users.length,
      users
    });

  } catch (error) {
    console.error("Get all users error:", error);

    res.status(500).json({
      message: "Unable to fetch users"
    });
  }
};


/* UPDATE USER
=========================================
*/
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const {
      name,
      nic,
      phoneNo,
      email,
      password,
      user_type,
      helmet
    } = req.body;

    // ---- REQUIRED FIELD CHECK ----
    if (!name || !nic || !phoneNo || !email || !user_type) {
      return res.status(400).json({
        message: "All fields except password and helmet are required"
      });
    }

    // ---- USER TYPE VALIDATION ----
    if (!["ADMIN", "WORKER"].includes(user_type)) {
      return res.status(400).json({
        message: "User type must be Admin or Worker"
      });
    }

    // ---- FORMAT VALIDATIONS ----
    if (!/^[0-9]{12}$/.test(nic)) {
      return res.status(400).json({
        message: "NIC must contain exactly 12 digits"
      });
    }

    if (!/^0[0-9]{9}$/.test(phoneNo)) {
      return res.status(400).json({
        message: "Phone number must be 10 digits and start with 0"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "Invalid email address"
      });
    }

    // ---- 1. GET EXISTING USER FROM DB ----
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // ---- 2. NIC DUPLICATE CHECK (ONLY IF NIC CHANGED) ----
    if (nic !== user.nic) {
      const nicOwner = await User.findOne({ nic });

      if (nicOwner) {
        return res.status(409).json({
          message: "A user with this NIC already exists"
        });
      }
    }

    // ---- 3. EMAIL DUPLICATE CHECK (ONLY IF EMAIL CHANGED) ----
    if (email !== user.email) {
      const emailOwner = await User.findOne({ email });

      if (emailOwner) {
        return res.status(409).json({
          message: "A user with this email already exists"
        });
      }
    }

    // ---- 4. UPDATE FIELDS ----
    user.name = name;
    user.nic = nic;
    user.phoneNo = phoneNo;
    user.email = email;
    user.user_type = user_type;
    user.helmet = helmet ? helmet : null;

    // Update password only if provided
    if (password && password.trim() !== "") {
      user.password = password; // hash later
    }

    // ---- 5. SAVE UPDATED USER ----
    await user.save();

    res.status(200).json({
      message: "User updated successfully"
    });

  } catch (error) {
    console.error("Update user error:", error);

    res.status(500).json({
      message: "Unable to update user. Please try again."
    });
  }
};

/* DELETE USER
=========================================
*/
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // ---- CHECK USER EXISTS ----
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // ---- DELETE USER ----
    await User.deleteOne({ userId });

    res.status(200).json({
      message: "User deleted successfully"
    });

  } catch (error) {
    console.error("Delete user error:", error);

    res.status(500).json({
      message: "Unable to delete user. Please try again."
    });
  }
};