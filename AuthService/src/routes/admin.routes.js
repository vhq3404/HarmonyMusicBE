const router = require("express").Router();
const adminCtrl = require("../controllers/admin.controller");

router.get("/users", adminCtrl.getUsers);
router.patch("/users/:id/status", adminCtrl.updateUserStatus);

module.exports = router;
