const notificationService = require("../services/notificationService");
const notificationStream = require("../services/notificationStream");

// GET /api/notifications — always scoped to req.user.id, never a
// client-supplied recipient (#17).
exports.list = async (req, res, next) => {
  try {
    const { unread, page, limit } = req.query;
    const data = await notificationService.getNotifications(req.user.id, {
      unreadOnly: unread === "true",
      page,
      limit,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    const result = await notificationService.markRead(req.user.id, req.params.id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.status(200).json({ message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/read-all
exports.markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.user.id);
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
};

// GET /api/notifications/stream — standard `verifyToken` auth (this route
// is reached via authenticated fetch() + Authorization header from the
// frontend, never a query-string token — see useNotifications.js).
exports.stream = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Disable any intermediary buffering (e.g. behind a reverse proxy in a
    // future deployment) so events actually arrive promptly.
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const userId = req.user.id;
  notificationStream.subscribe(userId, res);

  // Keeps the connection alive through idle-timeout proxies/load balancers
  // and lets a dead connection surface via a failed write.
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    notificationStream.unsubscribe(userId, res);
  });
};
