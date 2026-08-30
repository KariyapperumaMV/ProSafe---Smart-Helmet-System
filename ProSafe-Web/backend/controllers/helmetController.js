const Helmet = require("../models/Helmet");
const User = require("../models/User");

// GET /api/helmets/assignable — ADMIN only. Backs the Add/Edit User helmet
// dropdown (#8) so it never hardcodes ids. `currentHelmetId` lets the Edit
// User form include the helmet already held by the user being edited, even
// though it's technically "assigned" (to that same user).
exports.getAssignableHelmets = async (req, res, next) => {
  try {
    const { currentHelmetId } = req.query;

    const assignedIds = await User.find({ active: true, helmetId: { $ne: null } }).distinct("helmetId");
    const excluded = currentHelmetId
      ? assignedIds.filter((id) => id !== currentHelmetId)
      : assignedIds;

    const helmets = await Helmet.find({
      status: "ACTIVE",
      helmetId: { $nin: excluded },
    }).sort({ helmetId: 1 });

    res.status(200).json({ helmets });
  } catch (err) {
    next(err);
  }
};

// POST /api/helmets — ADMIN only. Minimal registration into the roster so
// the dropdown above has something to return. Full helmet management
// (Figures 17-20) is a separate future phase — no frontend page calls this
// yet.
exports.registerHelmet = async (req, res, next) => {
  try {
    const { helmetId } = req.body;
    if (!helmetId || typeof helmetId !== "string" || !helmetId.trim()) {
      return res.status(400).json({ message: "helmetId is required" });
    }

    const existing = await Helmet.findOne({ helmetId });
    if (existing) {
      return res.status(409).json({ message: "Helmet already exists" });
    }

    const helmet = await Helmet.create({ helmetId: helmetId.trim() });
    res.status(201).json({ helmet });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Helmet already exists" });
    }
    next(err);
  }
};
