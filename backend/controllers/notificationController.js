const Notification = require('../models/Notification');

const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch notifications', error: error.message });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    // Scoped by user, not just _id - this is what prevents one user from
    // marking another user's notification as read. A mismatched id simply
    // isn't found, the same safe pattern used throughout the complaint
    // routes (see getComplaintById / updateDepartmentComplaintStatus).
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({ notification });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Notification not found' });
    }
    return res.status(500).json({ message: 'Failed to update notification', error: error.message });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.status(200).json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update notifications', error: error.message });
  }
};

module.exports = { getMyNotifications, markNotificationRead, markAllNotificationsRead };
