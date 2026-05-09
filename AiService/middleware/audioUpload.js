const multer = require("multer");
const path   = require("path");
const crypto = require("crypto");

const ALLOWED_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
];
const ALLOWED_EXTS = [".mp3", ".wav"];
const MAX_SIZE     = 100 * 1024 * 1024; // 100 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || ".mp3";
    const name = crypto.randomUUID();
    cb(null, `${name}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) || ALLOWED_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    const err = new Error("Only MP3 and WAV audio files are supported");
    err.code  = "INVALID_TYPE";
    cb(err);
  }
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });
