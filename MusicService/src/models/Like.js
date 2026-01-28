// models/Like.js
const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      required: true,
    },
  },
  { timestamps: true }
);

likeSchema.index({ userId: 1, songId: 1 }, { unique: true });

module.exports = mongoose.model("Like", likeSchema);
