// routes/comment.routes.js
const express = require("express");
const router = express.Router();
const commentCtrl = require("../controllers/comment.controller");

/* ===== SONG COMMENTS ===== */
router.get("/songs/:id/comments", commentCtrl.getCommentsBySong);
router.post("/songs/:id/comments", commentCtrl.createComment);
router.get("/songs/:id/comments/count", commentCtrl.getCommentCount);

/* ===== COMMENT ===== */
router.delete("/comments/:id", commentCtrl.deleteComment);

module.exports = router;
