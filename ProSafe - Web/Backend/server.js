require('dotenv').config({ path: "./config/config.env" });

const app = require('./app');
const databaseConnect = require('./config/database');

databaseConnect();

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

