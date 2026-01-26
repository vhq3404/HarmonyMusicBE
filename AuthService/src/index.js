require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.route");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

app.listen(process.env.PORT || 4000, () => {
  console.log(`Auth Service running on port ${process.env.PORT || 4000}`);
});
