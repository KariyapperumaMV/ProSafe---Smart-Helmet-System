const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

// Real MongoDB semantics (unique indexes, $ne, distinct) via an in-memory
// instance — no dependency on the project's actual Atlas cluster, so tests
// never touch real data and run offline.
async function connect() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connect, closeDatabase, clearDatabase };
