const fs = require("fs");
const path = require("path");
const multer = require("multer");

// Local-disk storage for profile images, served statically by app.js at
// /uploads. Matches "no complex cloud storage without approval" — this is a
// dev-appropriate default, not a production file store.
const uploadDir = path.join(__dirname, "..", "uploads", "profile-images");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
  }
  cb(null, true);
}

const uploadProfileImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("profileImage");

module.exports = { uploadProfileImage };
