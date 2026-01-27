const express = require("express");
const router = express.Router();
const { createPlay } = require("../controllers/play.controller");

router.post("/", createPlay);

module.exports = router;
