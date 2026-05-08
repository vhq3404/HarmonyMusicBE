const axios = require("axios");
const pool = require("../db");
const sunoService = require("../services/suno.service");

const TERMINAL_STATUSES = [
  "SUCCESS",
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "SENSITIVE_WORD_ERROR",
  "CALLBACK_EXCEPTION",
];

const FAILED_STATUSES = [
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "SENSITIVE_WORD_ERROR",
  "CALLBACK_EXCEPTION",
];

/* ─────────────────────────────────────────────
   In-memory TTL cache for Suno poll results
───────────────────────────────────────────── */
const statusCache = new Map();
const STATUS_CACHE_TTL = 4000;

function getCached(taskId) {
  const entry = statusCache.get(taskId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { statusCache.delete(taskId); return null; }
  return entry.data;
}

function setCache(taskId, data) {
  statusCache.set(taskId, { data, expiresAt: Date.now() + STATUS_CACHE_TTL });
}

/* ─────────────────────────────────────────────
   Normalize Suno track data to consistent camelCase.

   The status/polling API returns camelCase:  audioUrl, streamAudioUrl, imageUrl
   The callback API returns snake_case:       audio_url, stream_audio_url, image_url

   Always normalise before storing so the DB and frontend
   always see the same shape regardless of which path wrote it.
───────────────────────────────────────────── */
function normalizeSunoTrack(track) {
  if (!track || typeof track !== "object") return null;
  return {
    id:             track.id || "",
    audioUrl:       track.audioUrl       || track.audio_url        || "",
    streamAudioUrl: track.streamAudioUrl || track.stream_audio_url  || "",
    imageUrl:       track.imageUrl       || track.image_url         || "",
    imageLargeUrl:  track.imageLargeUrl  || track.image_large_url   || null,
    prompt:         track.prompt         || "",
    modelName:      track.modelName      || track.model_name        || null,
    title:          track.title          || "",
    tags:           track.tags           || null,
    duration:       track.duration       || null,
    createTime:     track.createTime     || null,
  };
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

const formatRow = (row) => ({
  id:           row.id,
  taskId:       row.task_id,
  userId:       row.user_id,
  status:       row.status,
  prompt:       row.prompt,
  style:        row.style,
  title:        row.title,
  model:        row.model,
  customMode:   row.custom_mode,
  instrumental: row.instrumental,
  negativeTags: row.negative_tags,
  vocalGender:  row.vocal_gender,
  // Normalize on read so existing mixed-casing DB records are transparently fixed
  songs: Array.isArray(row.suno_data)
    ? row.suno_data.map(normalizeSunoTrack).filter(Boolean)
    : null,
  errorMessage: row.error_message,
  createdAt:    row.created_at,
  updatedAt:    row.updated_at,
});

const mapAxiosError = (err, res) => {
  const status = err.response?.status;
  if (status === 401)
    return res.status(401).json({ error: "Invalid or missing Suno API key" });
  if (status === 402 || status === 429)
    return res.status(402).json({ error: "Insufficient Suno API credits" });
  if (status === 405 || status === 430)
    return res.status(429).json({ error: "Suno API rate limit exceeded — try again shortly" });
  if (status === 413)
    return res.status(400).json({ error: "Prompt or style exceeds maximum length" });
  if (status === 400)
    return res.status(400).json({ error: err.response?.data?.msg || "Bad request to Suno API" });
  console.error("Suno API error:", err.response?.data || err.message);
  return res.status(500).json({ error: "Suno API request failed" });
};

/* ─────────────────────────────────────────────
   POST /api/ai/generate
───────────────────────────────────────────── */

const generate = async (req, res) => {
  const {
    userId,
    prompt,
    customMode = false,
    instrumental = false,
    style,
    title,
    model = "V4",
    negativeTags,
    vocalGender,
  } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  // Duplicate guard
  try {
    const { rows: active } = await pool.query(
      `SELECT task_id FROM ai_generations
       WHERE user_id = $1 AND status NOT IN (${TERMINAL_STATUSES.map((_, i) => `$${i + 2}`).join(",")})
       LIMIT 1`,
      [String(userId), ...TERMINAL_STATUSES]
    );
    if (active.length > 0) {
      return res.status(409).json({
        error: "You already have a generation in progress",
        taskId: active[0].task_id,
      });
    }
  } catch (guardErr) {
    console.error("Duplicate guard query failed:", guardErr.message);
  }

  if (!customMode && !prompt)
    return res.status(400).json({ error: "prompt is required in non-custom mode" });
  if (customMode && !instrumental && !prompt)
    return res.status(400).json({ error: "prompt is required when customMode=true and instrumental=false" });
  if (customMode && !style)
    return res.status(400).json({ error: "style is required in custom mode" });
  if (customMode && !title)
    return res.status(400).json({ error: "title is required in custom mode" });
  if (prompt && prompt.length > 5000)
    return res.status(400).json({ error: "Prompt exceeds maximum length of 5000 characters" });
  if (style && style.length > 1000)
    return res.status(400).json({ error: "Style exceeds maximum length of 1000 characters" });
  if (title && title.length > 100)
    return res.status(400).json({ error: "Title exceeds maximum length of 100 characters" });

  const callBackUrl = `${process.env.CALLBACK_BASE_URL || "http://localhost:4004"}/api/ai/callback`;

  const sunoParams = {
    customMode,
    instrumental,
    model,
    callBackUrl,
    ...(prompt && { prompt }),
    ...(customMode && style && { style }),
    ...(customMode && title && { title }),
    ...(negativeTags && { negativeTags }),
    ...(vocalGender && { vocalGender }),
  };

  try {
    const result = await sunoService.generateMusic(sunoParams);

    if (result.code !== 200) {
      return res.status(400).json({ error: result.msg || "Generation failed" });
    }

    const { taskId } = result.data;

    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental, negative_tags, vocal_gender, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')`,
      [
        taskId,
        String(userId),
        prompt || null,
        style || null,
        title || null,
        model,
        customMode,
        instrumental,
        negativeTags || null,
        vocalGender || null,
      ]
    );

    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/generate/:taskId/status
───────────────────────────────────────────── */

const getStatus = async (req, res) => {
  const { taskId } = req.params;

  if (!taskId) return res.status(400).json({ error: "taskId is required" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM ai_generations WHERE task_id = $1",
      [taskId]
    );

    if (!rows.length) return res.status(404).json({ error: "Task not found" });

    const generation = rows[0];

    if (TERMINAL_STATUSES.includes(generation.status)) {
      return res.json(formatRow(generation));
    }

    const cached = getCached(taskId);
    if (cached) return res.json(cached);

    let sunoResult;
    try {
      sunoResult = await sunoService.getGenerationStatus(taskId);
    } catch (pollErr) {
      console.warn("Suno poll error:", pollErr.message);
      return res.json(formatRow(generation));
    }

    if (sunoResult.code !== 200) {
      return res.json(formatRow(generation));
    }

    const { status, response, errorMessage: sunoError } = sunoResult.data;

    // Normalize the raw sunoData array to consistent camelCase before storing
    const rawTracks = response?.sunoData || null;
    const normalizedTracks = Array.isArray(rawTracks) && rawTracks.length
      ? rawTracks.map(normalizeSunoTrack).filter(Boolean)
      : null;

    const errorMessage = FAILED_STATUSES.includes(status)
      ? (sunoError || sunoResult.data?.msg || "Generation failed")
      : null;

    // Skip write only when absolutely nothing changed
    const statusUnchanged = status === generation.status;
    const dataUnchanged = !normalizedTracks && !generation.suno_data;
    if (statusUnchanged && dataUnchanged) {
      const formatted = formatRow(generation);
      setCache(taskId, formatted);
      return res.json(formatted);
    }

    const { rows: updated } = await pool.query(
      `UPDATE ai_generations
       SET status        = $1,
           suno_data     = $2,
           error_message = $3,
           updated_at    = NOW()
       WHERE task_id = $4
       RETURNING *`,
      [
        status,
        normalizedTracks ? JSON.stringify(normalizedTracks) : generation.suno_data,
        errorMessage,
        taskId,
      ]
    );

    const formatted = formatRow(updated[0]);
    if (!TERMINAL_STATUSES.includes(status)) setCache(taskId, formatted);
    return res.json(formatted);
  } catch (err) {
    console.error("getStatus error:", err);
    return res.status(500).json({ error: "Failed to fetch generation status" });
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/history?userId=X
───────────────────────────────────────────── */

const getHistory = async (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_generations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [String(userId)]
    );

    return res.json({ data: rows.map(formatRow) });
  } catch (err) {
    console.error("getHistory error:", err);
    return res.status(500).json({ error: "Failed to fetch generation history" });
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/callback  (Suno webhook)
───────────────────────────────────────────── */

const handleCallback = async (req, res) => {
  // Respond immediately so Suno doesn't time out (15s limit)
  res.json({ success: true });

  try {
    const payload = req.body;
    const inner = payload?.data || payload;
    const { callbackType, task_id, data: rawTracks } = inner;

    if (!task_id) return;

    let status = "PENDING";
    if (callbackType === "text")     status = "TEXT_SUCCESS";
    else if (callbackType === "first")    status = "FIRST_SUCCESS";
    else if (callbackType === "complete") status = "SUCCESS";
    else if (callbackType === "error")    status = "GENERATE_AUDIO_FAILED";

    // Normalize callback data (snake_case) to match polling data (camelCase)
    const normalizedTracks = Array.isArray(rawTracks) && rawTracks.length
      ? rawTracks.map(normalizeSunoTrack).filter(Boolean)
      : null;

    await pool.query(
      `UPDATE ai_generations
       SET status = $1, suno_data = $2, updated_at = NOW()
       WHERE task_id = $3`,
      [status, normalizedTracks ? JSON.stringify(normalizedTracks) : null, task_id]
    );

    // Invalidate cache so next poll returns fresh data
    statusCache.delete(task_id);
  } catch (err) {
    console.error("Callback processing error:", err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/download/:taskId/:songId

   Proxies the audio file through our server so the
   browser can download it with a clean filename.
   (Cross-origin <a download> is blocked by browsers.)
───────────────────────────────────────────── */

const downloadSong = async (req, res) => {
  const { taskId, songId } = req.params;

  if (!taskId || !songId) {
    return res.status(400).json({ error: "taskId and songId are required" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT suno_data, title FROM ai_generations WHERE task_id = $1 AND status = 'SUCCESS'",
      [taskId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Generation not found or not complete" });
    }

    const generation = rows[0];
    const songs = Array.isArray(generation.suno_data)
      ? generation.suno_data.map(normalizeSunoTrack).filter(Boolean)
      : [];

    const song = songs.find((s) => s.id === songId);
    if (!song) return res.status(404).json({ error: "Song not found in this generation" });

    const audioUrl = song.audioUrl;
    if (!audioUrl) return res.status(404).json({ error: "Audio URL not available" });

    // Sanitise filename: strip characters illegal in filenames
    const rawName = song.title || generation.title || "ai-track";
    const filename = `${rawName}.mp3`.replace(/[/\\?%*:|"<>]/g, "-");

    let upstream;
    try {
      upstream = await axios.get(audioUrl, {
        responseType: "stream",
        timeout: 60_000,
        headers: { "User-Agent": "HarmonyMusic/1.0" },
      });
    } catch (fetchErr) {
      console.error("Proxy fetch failed:", fetchErr.message);
      return res.status(502).json({ error: "Failed to fetch audio from provider" });
    }

    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Content-Type", upstream.headers["content-type"] || "audio/mpeg");
    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }
    res.setHeader("Cache-Control", "no-store");

    upstream.data.pipe(res);

    upstream.data.on("error", (streamErr) => {
      console.error("Audio stream error:", streamErr.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Audio stream interrupted" });
      }
    });
  } catch (err) {
    console.error("downloadSong error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Download failed" });
    }
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/credits
───────────────────────────────────────────── */

const getCredits = async (req, res) => {
  try {
    const result = await sunoService.getCredits();
    return res.json({ credits: result.data ?? 0 });
  } catch (err) {
    console.error("getCredits error:", err);
    return res.status(500).json({ error: "Failed to fetch credits" });
  }
};

module.exports = { generate, getStatus, getHistory, handleCallback, getCredits, downloadSong };
