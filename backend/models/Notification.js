const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'complaint_created',
        'department_assigned',
        'complaint_work_started',
        'complaint_escalated',
        'complaint_resolved',
        'complaint_verification_failed',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional because a future notification type might not relate to a
    // specific complaint. Every type that exists today does set this.
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
    },
    // Set only for 'complaint_verification_failed'. A complaint can be rejected
    // more than once across rework cycles, so each rejection gets its own
    // round number. See the index below.
    verificationRound: {
      type: Number,
      min: 1,
    },
    // Set only for 'complaint_escalated'. One notification per recipient for
    // each escalation level, so a later level can notify again.
    escalationLevel: {
      type: Number,
      min: 1,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// The only real query pattern: a user's own notifications, newest first.
notificationSchema.index({ user: 1, createdAt: -1 });

// Backstop against duplicates: a second attempt at the same event (a retried
// status update, an overlapping scheduler tick, or a server restart during
// escalation) fails at the database level with a duplicate-key error rather
// than creating a second notification; backend/services/notificationService.js
// treats that error as already notified.
// `user` is part of the key because one event can notify several people (a
// citizen, the department and monitors for an escalation). verificationRound
// is part of the key so each monitor rejection, which can repeat across rework
// cycles, gets its own notification. escalationLevel is part of the key so
// each escalation level notifies once per recipient. For event types that do
// not use these fields the field is absent, so the key behaves as before.
// Existing databases still hold an older index, which backend/config/db.js
// removes on startup through syncIndexes.
notificationSchema.index(
  { user: 1, complaint: 1, type: 1, verificationRound: 1, escalationLevel: 1 },
  { unique: true, partialFilterExpression: { complaint: { $exists: true } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
