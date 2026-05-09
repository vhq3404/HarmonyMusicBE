const express     = require("express");
const router      = express.Router();
const { verifyToken } = require("../middleware/auth");
const reportCtrl  = require("../controllers/report.controller");

/* Creating a report requires authentication so we know who is reporting */
router.post("/report", verifyToken, reportCtrl.createReport);

module.exports = router;
