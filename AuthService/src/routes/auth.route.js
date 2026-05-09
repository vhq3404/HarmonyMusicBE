const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/login",    authController.login);
router.post("/refresh",  authController.refresh);
router.post("/logout",   authController.logout);
router.post("/logout-all", verifyToken, authController.logoutAll);

module.exports = router;
