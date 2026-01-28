const mongoose = require("mongoose");

const playlistSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    isPublic: {
      type: Boolean,
      default: true,
    },

    isFavorite: {
      type: Boolean,
      default: false,
    },

    songIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Song",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Playlist", playlistSchema);
