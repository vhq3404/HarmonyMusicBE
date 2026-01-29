require("dotenv").config();
const express = require("express");
const cors = require("cors");

const reportRoutes = require("./routes/report.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", reportRoutes);

app.get("/", (req, res) => {
  res.send("ReportService running");
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 ReportService running on port ${process.env.PORT}`);
});
