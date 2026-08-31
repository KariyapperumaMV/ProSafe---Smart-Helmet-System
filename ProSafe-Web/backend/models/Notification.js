const mongoose = require("mongoose");
const { notificationRetentionDays } = require("../config/appConfig");

// A personal inbox message — distinct from Alert (the permanent safety-event
// record). One document per recipient (fan-out happens at creation time in
// notificationService, not via an array of recipients here), so every query
// is a plain { recipientUserId } match.
const NOTIFICATION_TYPES = [
  "NEW_ALERT",
  "EMERGENCY_ALERT",
  "EMERGENCY_RESET_REQUESTED",
  "EMERGENCY_RESOLVED",
  "USER_CREATED",
  // Defined for future Analytics/report generation — never instantiated yet.
  "DAILY_REPORT_READY",
  "WEEKLY_REPORT_READY",
  "MONTHLY_REPORT_READY",
];

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },

    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },

    // What this notification is about, for click-to-navigate — never a full
    // copy of that entity (no sensor snapshots, no whole Alert/User docs).
    relatedEntityType: { type: String, enum: ["ALERT", "USER", "HELMET", null], default: null },
    relatedEntityId: { type: String, default: null },

    // Small, structured extras only (e.g. { helmetId, riskState }) — kept
    // deliberately unstructured (Mixed) since each type needs different
    // fields, but callers must keep it lightweight.
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, read: 1 });
// TTL: notifications are disposable, unlike Alert — expires
// notificationRetentionDays after creation. Index option is fixed at index
// build time; changing NOTIFICATION_RETENTION_DAYS later requires
// recreating this index (documented here since it's easy to miss).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: notificationRetentionDays * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
