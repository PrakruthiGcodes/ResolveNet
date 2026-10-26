require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { startEscalationScheduler } = require('./services/escalationScheduler');

connectDB();
startEscalationScheduler();

const app = express();

// CLIENT_URL may list several comma-separated origins (e.g. Vite on 5173 and 5174).
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim());

// Vite picks the next free port (5173, 5174, 5175...) and may be opened via
// localhost or 127.0.0.1, so outside production any loopback origin is allowed.
const isLoopbackOrigin = (origin) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' && isLoopbackOrigin(origin));
      callback(null, allowed);
    },
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Complaint photos are not served statically. They go through the authenticated
// GET /api/complaints/:id/image route instead (see complaintController.js).
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
