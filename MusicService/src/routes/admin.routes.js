const router = require("express").Router();
const adminCtrl = require("../controllers/admin.controller");

router.get("/songs", adminCtrl.getAdminSongs);
router.patch("/songs/:id/status", adminCtrl.updateSongStatus);

module.exports = router;
