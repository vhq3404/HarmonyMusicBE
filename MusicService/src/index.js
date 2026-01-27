require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const songRoutes = require("./routes/song.route");
const playRoutes = require("./routes/play.route");

const app = express();

// ====== CONNECT DB ======
connectDB();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());

// ====== ROUTES ======
app.use("/api/songs", songRoutes);
app.use("/api/plays", playRoutes); 
//app.use("/api/likes", require("./routes/like.routes"));

// ====== START SERVER ======
const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`🎵 MusicService running on port ${PORT}`);
});
