const mongoose = require("mongoose");

const SongSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    tagIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tag",
      },
    ],

    duration: {
      type: Number,
      required: true,
    },

    audioUrl: {
      type: String,
      required: true,
    },

    thumbnailUrl: {
      type: String,
      required: true,
    },

    artists: [String],

    lyrics: {
      type: String,
      default: "",
    },

    publicDate: {
      type: Date,
      required: true,
    },

    isPublic: {
      type: Boolean,
      default: true,
    },

    playCount: {
      type: Number,
      default: 0,
    },

    albumId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Song", SongSchema);
