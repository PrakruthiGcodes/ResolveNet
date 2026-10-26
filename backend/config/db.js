const dns = require('dns');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// Router/local DNS (192.168.0.1) refuses the SRV lookup Node needs for
// mongodb+srv:// (querySrv ECONNREFUSED), even though nslookup and TCP
// to 27017 both work fine. Point Node's resolver at public DNS before
// Mongoose starts the SRV lookup.
dns.setServers(['8.8.8.8', '1.1.1.1']);

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
