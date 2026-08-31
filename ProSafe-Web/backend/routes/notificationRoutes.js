const express = require("express");
const router = express.Router();

const { list, markRead, markAllRead, stream } = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/authMiddleware");

// Every route here is scoped to req.user.id inside the controller/service —
// no role restriction beyond "authenticated," since both ADMIN and WORKER
// have their own inbox.
router.use(verifyToken);

router.get("/stream", stream);
router.get("/", list);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

module.exports = router;
