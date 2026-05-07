require("dotenv").config();
const express = require("express");
const cors = require("cors");

const songRoutes = require("./routes/song.route");
const playRoutes = require("./routes/play.route");
const playListRoutes = require("./routes/playlist.route");
const commentRoutes = require("./routes/comment.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/songs", songRoutes);
app.use("/api/plays", playRoutes);
app.use("/api/playlists", playListRoutes);
app.use("/api", commentRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(` MusicService running on port ${PORT}`);
});
