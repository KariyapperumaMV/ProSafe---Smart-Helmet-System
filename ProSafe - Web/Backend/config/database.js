const mongoose = require('mongoose');

const databaseConnect = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log("Database connected");
    } catch (err) {
        console.error("Database connection error:", err);
    }
};

module.exports = databaseConnect;
