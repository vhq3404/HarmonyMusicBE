const express    = require("express");
const router     = express.Router();
const { verifyToken } = require("../middleware/auth");
const commentCtrl = require("../controllers/comment.controller");

/* ── Public ─────────────────────────────────────── */
router.get("/songs/:id/comments",        commentCtrl.getCommentsBySong);
router.get("/songs/:id/comments/count",  commentCtrl.getCommentCount);

/* ── Protected ──────────────────────────────────── */
router.post("/songs/:id/comments",       verifyToken, commentCtrl.createComment);
router.delete("/comments/:id",           verifyToken, commentCtrl.deleteComment);

module.exports = router;
