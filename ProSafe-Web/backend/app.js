const express = require('express');
const cors = require("cors");

const helmetDataRoutes = require("./routes/helmetDataRoutes");
const errorHandler = require("./middleware/errorHandler");

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

app.use("/api/helmet", helmetDataRoutes);

app.use(errorHandler);

module.exports = app;

