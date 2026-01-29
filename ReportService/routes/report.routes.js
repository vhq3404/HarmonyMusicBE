const express = require("express");
const router = express.Router();
const reportCtrl = require("../controllers/report.controller");

router.post("/report", reportCtrl.createReport);

module.exports = router;
