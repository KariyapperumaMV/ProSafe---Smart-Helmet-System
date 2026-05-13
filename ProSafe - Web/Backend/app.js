const express = require('express');
const cors = require("cors");

//for registering
const helmetRoutes = require("./routes/helmetRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes")
const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();

// Middleware
app.use(express.json());

//log the issue
app.use((req, res, next) => {
  console.log("API HIT:", req.method, req.url);
  next();
});

app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/*Register routes*/

// Helmet routes
app.use("/api/helmet", helmetRoutes);

// Admin-user routes
app.use("/api/users", userRoutes);

// Authentication routes
app.use("/api/auth", authRoutes);

// Analytics routers
app.use("/api/analytics", analyticsRoutes);

module.exports = app;
