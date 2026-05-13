const express = require("express");
const router = express.Router();

const {
    addUser, 
    getAllUsers,
    updateUser,
    deleteUser
} = require("../controllers/userController");

// Add user
router.post("/add", addUser);

// Get a specific user

// View All Users
router.get("/view", getAllUsers);

//Update User
router.put("/update/:userId", updateUser);

// Delete user
router.delete("/delete/:userId", deleteUser);

module.exports = router;
