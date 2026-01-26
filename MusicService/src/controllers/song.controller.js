const Song = require("../models/Song");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

exports.createSong = async (req, res) => {
  try {
    const { title, duration, artists, publicDate } = req.body;
    const { userId } = req.body;

    const audioFile = req.files.audio[0];
    const imageFile = req.files.thumbnail[0];

    // Upload audio
    const audioUpload = await cloudinary.uploader.upload(audioFile.path, {
      resource_type: "video",
    });

    // Upload image
    const imageUpload = await cloudinary.uploader.upload(imageFile.path);

    // Xóa file local
    fs.unlinkSync(audioFile.path);
    fs.unlinkSync(imageFile.path);

    const song = await Song.create({
      userId,
      title,
      duration,
      audioUrl: audioUpload.secure_url,
      thumbnailUrl: imageUpload.secure_url,
      artists: artists ? artists.split(",") : [],
      publicDate,
    });

    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSongs = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const songs = await Song.find({ isPublic: true })
      .sort({ createdAt: -1 }) // bài mới trước
      .skip(skip)
      .limit(limit)
      .select("-__v"); // bỏ field thừa

    const total = await Song.countDocuments({ isPublic: true });

    res.json({
      data: songs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};