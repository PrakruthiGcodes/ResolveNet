const dns = require('dns');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// Optional DNS override for networks whose configured resolver cannot
// resolve MongoDB SRV records. Leave unset to use the operating system DNS.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((server) => server.trim()).filter(Boolean));
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);

    // Replaces the older {complaint, type} notification index on databases
    // created before rejection notifications existed. Only this collection's
    // indexes are touched. A failure is logged, not fatal: the server still
    // runs, and only repeat rejection notifications would be affected.
    try {
      await Notification.syncIndexes();
    } catch (error) {
      console.error(`[notifications] Index sync failed: ${error.message}`);
    }
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
