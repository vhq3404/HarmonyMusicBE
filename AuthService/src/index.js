require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.route");
const userRoutes = require("./routes/user.route");
const followRoutes = require("./routes/follow.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", followRoutes);

app.listen(process.env.PORT || 4000, () => {
  console.log(`Auth Service running on port ${process.env.PORT || 4000}`);
});
