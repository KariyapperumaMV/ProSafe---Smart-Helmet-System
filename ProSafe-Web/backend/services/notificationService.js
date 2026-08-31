const Notification = require("../models/Notification");
const User = require("../models/User");
const { USER_ROLES } = require("../constants/roles");
const notificationStream = require("./notificationStream");

// Every creation path below is deliberately non-throwing: notification
// generation is a side-effect of real safety/business events (packet
// processing, emergency handling, user creation) and must never be able to
// fail *those* operations (#32 — "core safety processing must not fail
// because the notification subsystem temporarily fails"). Errors are always
// logged, never silently dropped.
async function safeCreate(doc) {
  try {
    const notification = await Notification.create(doc);
    notificationStream.publish(doc.recipientUserId, {
      id: String(notification._id),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
    });
    return notification;
  } catch (err) {
    console.error("Notification creation failed (non-fatal):", { type: doc.type, recipientUserId: doc.recipientUserId, error: err.message });
    return null;
  }
}

async function notifyUser(recipientUserId, { type, title, message, relatedEntityType = null, relatedEntityId = null, metadata = null }) {
  if (!recipientUserId) return null;
  return safeCreate({ recipientUserId, type, title, message, relatedEntityType, relatedEntityId, metadata });
}

// Fans out one Notification document per currently-active ADMIN — see
// models/Notification.js for why (simple per-recipient queries, no $in
// membership checks).
async function notifyAdmins({ type, title, message, relatedEntityType = null, relatedEntityId = null, metadata = null, excludeUserId = null }) {
  try {
    const filter = { role: USER_ROLES.ADMIN, active: true };
    if (excludeUserId) filter.userId = { $ne: excludeUserId };
    const admins = await User.find(filter, "userId").lean();

    await Promise.all(
      admins.map((admin) =>
        safeCreate({ recipientUserId: admin.userId, type, title, message, relatedEntityType, relatedEntityId, metadata })
      )
    );
  } catch (err) {
    console.error("notifyAdmins failed (non-fatal):", { type, error: err.message });
  }
}

async function getNotifications(userId, { unreadOnly, page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const filter = { recipientUserId: userId };
  if (unreadOnly) filter.read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientUserId: userId, read: false }),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      readAt: n.readAt,
      relatedEntityType: n.relatedEntityType,
      relatedEntityId: n.relatedEntityId,
      metadata: n.metadata,
      createdAt: n.createdAt,
    })),
    unreadCount,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
  };
}

// A worker can only ever mark their OWN notification read — the filter
// includes recipientUserId, so targeting someone else's id just matches
// zero documents rather than needing a separate authorization check.
async function markRead(userId, notificationId) {
  const notification = await Notification.findOne({ _id: notificationId, recipientUserId: userId });
  if (!notification) {
    return { ok: false, status: 404, message: "Notification not found" };
  }
  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return { ok: true, status: 200 };
}

async function markAllRead(userId) {
  await Notification.updateMany({ recipientUserId: userId, read: false }, { read: true, readAt: new Date() });
  return { ok: true, status: 200 };
}

module.exports = { notifyUser, notifyAdmins, getNotifications, markRead, markAllRead };
