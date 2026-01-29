const router = require("express").Router();
const ctrl = require("../controllers/adminReport.controller");

router.get("/", ctrl.getAllReports);
router.get("/songs/stats", ctrl.getSongReportStats);
router.get("/songs/:songId", ctrl.getReportsBySong);
router.patch("/songs/:songId/resolve", ctrl.resolveReportsBySong);

module.exports = router;
