const express = require("express");
const router = express.Router();
const followCtrl = require("../controllers/follow.controller");

/* ===== FOLLOW ACTION ===== */
router.post("/follow", followCtrl.followUser);
router.delete("/follow", followCtrl.unfollowUser);

/* ===== CHECK ===== */
router.get("/follow/check", followCtrl.isFollowing);

/* ===== COUNT ===== */
router.get("/users/:userId/followers", followCtrl.getFollowerCount);
router.get("/users/:userId/following", followCtrl.getFollowingCount);

router.get("/users/:userId/followers/list", followCtrl.getFollowerList);
router.get("/users/:userId/following/list", followCtrl.getFollowingList);

module.exports = router;
