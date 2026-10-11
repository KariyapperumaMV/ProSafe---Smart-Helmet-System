// In-process SSE subscriber registry: Map<userId, Set<res>>. A user can have
// more than one open tab/device, hence a Set per user rather than a single
// response.
//
// One stream per browser tab carries both kinds of event:
//   - notifications (publish): persisted inbox items for one recipient;
//   - live worker updates (publishWorkerUpdate): transient
//     { kind: "WORKER_UPDATE", ... } events, delivered to the worker
//     themselves and to every connected ADMIN — never to other workers.
//
// Single-Node-instance only. Horizontal/multi-instance deployment would
// need every instance to know about every subscriber (Redis pub/sub or
// equivalent) since a notification generated on instance A would otherwise
// never reach a browser connected to instance B. Not needed at this
// project's current scale — documented here so it isn't forgotten if that
// changes.
const subscribers = new Map();
const roles = new Map(); // userId -> role of the authenticated subscriber

function subscribe(userId, res, role = null) {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId).add(res);
  if (role) roles.set(userId, role);
}

function unsubscribe(userId, res) {
  const set = subscribers.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    subscribers.delete(userId);
    roles.delete(userId);
  }
}

function writeTo(set, payload) {
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // A write failing means the connection is already dead; the res's own
      // "close" handler (registered by the controller) will unsubscribe it.
    }
  }
}

// Fire-and-forget — publishing to a user with no open connection (or whose
// connection just dropped) is a normal, expected no-op, not an error.
function publish(userId, event) {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;
  writeTo(set, `data: ${JSON.stringify(event)}\n\n`);
}

// Live worker update: the worker's own connections + every ADMIN connection.
// Returns how many user streams it was written to (for tests/diagnostics).
function publishWorkerUpdate(workerId, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  let delivered = 0;
  for (const [userId, set] of subscribers) {
    if (userId === workerId || roles.get(userId) === "ADMIN") {
      writeTo(set, payload);
      delivered += 1;
    }
  }
  return delivered;
}

function subscriberCount(userId) {
  return subscribers.get(userId)?.size || 0;
}

module.exports = { subscribe, unsubscribe, publish, publishWorkerUpdate, subscriberCount };
