const Notification = require('../models/Notification');

/**
 * Notifications are secondary to the core complaint workflow: complaint
 * creation, escalation, and resolution must all succeed regardless of
 * whether the notification for that event can be persisted. This function
 * never throws. It resolves to true when the notification now exists (just
 * created, or already created earlier, which the unique index reports as a
 * duplicate-key error) and to false when it could not be saved. Callers that
 * ignore the result keep the old behaviour.
 */
const createNotification = async ({ user, type, title, message, complaint, verificationRound, escalationLevel }) => {
  try {
    await Notification.create({ user, type, title, message, complaint, verificationRound, escalationLevel });
    return true;
  } catch (error) {
    if (error.code === 11000) {
      // Already notified for this recipient, event and round - not an error.
      return true;
    }
    console.error(`[notifications] Failed to create "${type}" notification for user ${user}:`, error.message);
    return false;
  }
};

module.exports = { createNotification };
