require('dotenv').config({ path: "./config/config.env" });

const app = require('./app');
const databaseConnect = require('./config/database');
const mlService = require('./services/mlService');

// Non-fatal: the server should still start (and serve non-ML routes) even
// if the ML service isn't configured or reachable yet. Every sample is then
// stored as UNCERTAIN / ML_SERVICE_UNAVAILABLE (never SAFE) until it is.
if (!process.env.ML_SERVICE_URL) {
    console.warn("ML_SERVICE_URL is not set — every sample will be UNCERTAIN (ML_SERVICE_UNAVAILABLE) until it is configured.");
}

databaseConnect();

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    // Verify ProSafe ML V2 serves the expected model (XGBoost, EXTENDED, 38 features).
    mlService.checkHealth().then(({ ok, problems, health }) => {
        if (ok) {
            console.log(`ProSafe ML V2 OK: ${health.model_name} ${health.feature_set} (${health.feature_count} features) ${health.model_version}`);
        } else {
            console.warn(`ProSafe ML V2 NOT READY (${process.env.ML_SERVICE_URL || "no URL"}): ${problems.join("; ")} — samples will be UNCERTAIN until fixed.`);
        }
    });
});

