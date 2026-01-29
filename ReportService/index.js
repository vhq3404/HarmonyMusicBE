require("dotenv").config();
const express = require("express");
const cors = require("cors");

const reportRoutes = require("./routes/report.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", reportRoutes);
app.use("/api/admin/reports", adminRoutes);

app.get("/", (req, res) => {
  res.send("ReportService running");
});

app.listen(process.env.PORT, () => {
  console.log(` ReportService running on port ${process.env.PORT}`);
});
