const express = require('express');
const path = require("path");
const cors = require("cors");

const helmetDataRoutes = require("./routes/helmetDataRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const helmetRoutes = require("./routes/helmetRoutes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Middleware
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//log the issue
app.use((req, res, next) => {
  console.log("API HIT:", req.method, req.url);
  next();
});

// Vite's dev server runs on 5173; 3000 kept for any other tooling already
// pointed at it.
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use("/api/helmet", helmetDataRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/helmets", helmetRoutes);

app.use(errorHandler);

module.exports = app;

