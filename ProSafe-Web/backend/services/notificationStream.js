// In-process SSE subscriber registry: Map<userId, Set<res>>. A user can have
// more than one open tab/device, hence a Set per user rather than a single
// response.
//
// Single-Node-instance only. Horizontal/multi-instance deployment would
// need every instance to know about every subscriber (Redis pub/sub or
// equivalent) since a notification generated on instance A would otherwise
// never reach a browser connected to instance B. Not needed at this
// project's current scale — documented here so it isn't forgotten if that
// changes.
const subscribers = new Map();

function subscribe(userId, res) {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId).add(res);
}

function unsubscribe(userId, res) {
  const set = subscribers.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    subscribers.delete(userId);
  }
}

// Fire-and-forget — publishing to a user with no open connection (or whose
// connection just dropped) is a normal, expected no-op, not an error.
function publish(userId, event) {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // A write failing means the connection is already dead; the res's own
      // "close" handler (registered by the controller) will unsubscribe it.
    }
  }
}

function subscriberCount(userId) {
  return subscribers.get(userId)?.size || 0;
}

module.exports = { subscribe, unsubscribe, publish, subscriberCount };
