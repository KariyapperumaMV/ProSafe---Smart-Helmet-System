// Centralized error handling so no single route has to guess an HTTP status
// for a thrown error. Logs full detail server-side; never leaks stack traces
// or internal messages to the client.
function errorHandler(err, req, res, _next) {
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ message: "Malformed JSON request body" });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
}

module.exports = errorHandler;
