const express  = require("express");
const router   = express.Router();
const { verifyToken } = require("../middleware/auth");
const { createPlay } = require("../controllers/play.controller");

router.post("/", verifyToken, createPlay);

module.exports = router;
