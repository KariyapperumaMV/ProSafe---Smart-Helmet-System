require('dotenv').config({ path: "./config/config.env" });

const app = require('./app');
const databaseConnect = require('./config/database');

// Non-fatal: the server should still start (and serve non-ML routes) even
// if the ML service isn't configured yet — mlService.js handles the missing
// URL gracefully per-request instead of crashing here.
if (!process.env.ML_SERVICE_URL) {
    console.warn("ML_SERVICE_URL is not set — ML predictions will be skipped until it is configured.");
}

databaseConnect();

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

