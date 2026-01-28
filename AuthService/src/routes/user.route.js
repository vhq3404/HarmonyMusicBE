const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const multer = require("multer");

const upload = multer({ dest: "uploads/" });

router.get("/:id", userController.getUserById);
router.put("/:id/change-password", userController.changePassword);

router.put("/:id", upload.single("avatar"), userController.updateUser);

router.get("/", userController.getUsers);

module.exports = router;
