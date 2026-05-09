const axios      = require("axios");
const fs         = require("fs");
const pool       = require("../db");
const sunoService = require("../services/suno.service");
const cloudinary = require("../config/cloudinary");

/* ─────────────────────────────────────────────
   Status sets
───────────────────────────────────────────── */

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

const LYRICS_TERMINAL_STATUSES = [
  "SUCCESS",
  "CREATE_TASK_FAILED",
  "GENERATE_LYRICS_FAILED",
  "SENSITIVE_WORD_ERROR",
  "CALLBACK_EXCEPTION",
];

/* ─────────────────────────────────────────────
   URL validation
───────────────────────────────────────────── */

function isPublicUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const host = parsed.hostname;
  if (host === "localhost") return false;
  if (/^127\./.test(host))                     return false;
  if (/^10\./.test(host))                      return false;
  if (/^192\.168\./.test(host))                return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

/* ─────────────────────────────────────────────
   DB migrations — idempotent, safe to re-run
───────────────────────────────────────────── */

;(async () => {
  try {
    await pool.query(`
      ALTER TABLE ai_generations
        ADD COLUMN IF NOT EXISTS operation_type  VARCHAR(50)   DEFAULT 'generate',
        ADD COLUMN IF NOT EXISTS source_audio_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS continue_at     NUMERIC,
        ADD COLUMN IF NOT EXISTS upload_url      TEXT,
        ADD COLUMN IF NOT EXISTS tags            VARCHAR(1000)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_lyrics (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id       VARCHAR(255) UNIQUE NOT NULL,
        user_id       VARCHAR(255) NOT NULL,
        status        VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
        prompt        TEXT,
        lyrics_data   JSONB,
        error_message TEXT,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_lyrics_user_id ON ai_lyrics (user_id)`
    );
  } catch (e) {
    console.warn("DB migration warning (non-fatal):", e.message);
  }
})();

/* ─────────────────────────────────────────────
   In-memory TTL caches
───────────────────────────────────────────── */

const statusCache       = new Map();
const lyricsStatusCache = new Map();
const STATUS_CACHE_TTL  = 4000;
const CACHE_MAX_SIZE    = 500;

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { map.delete(key); return null; }
  return entry.data;
}

function setCache(map, key, data) {
  if (map.size >= CACHE_MAX_SIZE) {
    map.delete(map.keys().next().value);
  }
  map.set(key, { data, expiresAt: Date.now() + STATUS_CACHE_TTL });
}

/* Periodic eviction for status caches (unref so it doesn't block shutdown) */
const cacheEvictTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of statusCache)       { if (now > v.expiresAt) statusCache.delete(k); }
  for (const [k, v] of lyricsStatusCache) { if (now > v.expiresAt) lyricsStatusCache.delete(k); }
}, 60_000);
cacheEvictTimer.unref();

/* ─────────────────────────────────────────────
   Normalize Suno track data to consistent camelCase.
   Status API returns camelCase; callback API returns snake_case.
───────────────────────────────────────────── */

function normalizeSunoTrack(track) {
  if (!track || typeof track !== "object") return null;
  return {
    id:             track.id             || "",
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
   Row formatters
───────────────────────────────────────────── */

const formatRow = (row) => ({
  id:             row.id,
  taskId:         row.task_id,
  userId:         row.user_id,
  status:         row.status,
  operationType:  row.operation_type   || "generate",
  prompt:         row.prompt,
  style:          row.style,
  title:          row.title,
  model:          row.model,
  customMode:     row.custom_mode,
  instrumental:   row.instrumental,
  negativeTags:   row.negative_tags,
  vocalGender:    row.vocal_gender,
  sourceAudioId:  row.source_audio_id  || null,
  continueAt:     row.continue_at      ?? null,
  uploadUrl:      row.upload_url       || null,
  tags:           row.tags             || null,
  songs: Array.isArray(row.suno_data)
    ? row.suno_data.map(normalizeSunoTrack).filter(Boolean)
    : null,
  errorMessage:   row.error_message,
  createdAt:      row.created_at,
  updatedAt:      row.updated_at,
});

const formatLyricsRow = (row) => {
  // Extract LyricsResult[] from whatever shape is stored in lyrics_data.
  // Three possible shapes (accumulated from API evolution and legacy bugs):
  //   A) Correct:  [{text, title, status, errorMessage}, ...]
  //   B) Legacy:   [{taskId, data: [{text,...},...]}]  (old bug: stored whole response obj)
  //   C) Object:   {text, title, ...}  (single result stored as object)
  let lyrics = null;
  const raw = row.lyrics_data;
  if (Array.isArray(raw)) {
    const direct = raw.filter((x) => x && x.text != null);
    if (direct.length) {
      lyrics = direct;
    } else {
      // Shape B: items are wrapper objects; real lyrics live in item.data[]
      const rescued = raw.flatMap((item) =>
        Array.isArray(item?.data) ? item.data.filter((x) => x && x.text != null) : []
      );
      if (rescued.length) lyrics = rescued;
    }
  } else if (raw && typeof raw === "object") {
    if (raw.text != null) {
      lyrics = [raw];                               // Shape C
    } else if (Array.isArray(raw.data)) {
      const items = raw.data.filter((x) => x && x.text != null);
      if (items.length) lyrics = items;             // Shape B as single object
    }
  }
  return {
    id:           row.id,
    taskId:       row.task_id,
    userId:       row.user_id,
    status:       row.status,
    prompt:       row.prompt,
    lyrics,
    errorMessage: row.error_message,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
};

/* ─────────────────────────────────────────────
   Error mapper
───────────────────────────────────────────── */

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
   Duplicate-guard helper (checks ai_generations only)
───────────────────────────────────────────── */

async function checkDuplicateGuard(userId) {
  const { rows } = await pool.query(
    `SELECT task_id FROM ai_generations
     WHERE user_id = $1
       AND status NOT IN (${TERMINAL_STATUSES.map((_, i) => `$${i + 2}`).join(",")})
     LIMIT 1`,
    [String(userId), ...TERMINAL_STATUSES]
  );
  return rows.length > 0 ? rows[0].task_id : null;
}

const callBackUrl = () =>
  `${process.env.CALLBACK_BASE_URL || "http://localhost:4004"}/api/ai/callback`;

/* ─────────────────────────────────────────────
   POST /api/ai/generate
───────────────────────────────────────────── */

const generate = async (req, res) => {
  /* userId from JWT middleware */
  const userId = req.user.id;
  const {
    prompt,
    customMode  = false,
    instrumental = false,
    style,
    title,
    model       = "V4",
    negativeTags,
    vocalGender,
  } = req.body;

  try {
    const activeTaskId = await checkDuplicateGuard(userId);
    if (activeTaskId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeTaskId });
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
  if (prompt  && prompt.length  > 5000) return res.status(400).json({ error: "Prompt exceeds 5000 characters" });
  if (style   && style.length   > 1000) return res.status(400).json({ error: "Style exceeds 1000 characters" });
  if (title   && title.length   > 100)  return res.status(400).json({ error: "Title exceeds 100 characters" });

  const sunoParams = {
    customMode, instrumental, model,
    callBackUrl: callBackUrl(),
    ...(prompt      && { prompt }),
    ...(customMode && style  && { style }),
    ...(customMode && title  && { title }),
    ...(negativeTags && { negativeTags }),
    ...(vocalGender  && { vocalGender }),
  };

  try {
    const result = await sunoService.generateMusic(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Generation failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental,
          negative_tags, vocal_gender, status, operation_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING','generate')`,
      [taskId, String(userId), prompt || null, style || null, title || null,
       model, customMode, instrumental, negativeTags || null, vocalGender || null]
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
      "SELECT * FROM ai_generations WHERE task_id = $1", [taskId]
    );
    if (!rows.length) return res.status(404).json({ error: "Task not found" });

    const generation = rows[0];

    if (TERMINAL_STATUSES.includes(generation.status))
      return res.json(formatRow(generation));

    const cached = getCached(statusCache, taskId);
    if (cached) return res.json(cached);

    let sunoResult;
    try {
      sunoResult = await sunoService.getGenerationStatus(taskId);
    } catch (pollErr) {
      console.warn("Suno poll error:", pollErr.message);
      return res.json(formatRow(generation));
    }

    if (sunoResult.code !== 200) return res.json(formatRow(generation));

    const { status, response, errorMessage: sunoError } = sunoResult.data;
    const rawTracks       = response?.sunoData || null;
    const normalizedTracks = Array.isArray(rawTracks) && rawTracks.length
      ? rawTracks.map(normalizeSunoTrack).filter(Boolean)
      : null;
    const errorMessage = FAILED_STATUSES.includes(status)
      ? (sunoError || sunoResult.data?.msg || "Generation failed")
      : null;

    const statusUnchanged = status === generation.status;
    const dataUnchanged   = !normalizedTracks && !generation.suno_data;
    if (statusUnchanged && dataUnchanged) {
      const formatted = formatRow(generation);
      setCache(statusCache, taskId, formatted);
      return res.json(formatted);
    }

    const { rows: updated } = await pool.query(
      `UPDATE ai_generations
       SET status=$1, suno_data=$2, error_message=$3, updated_at=NOW()
       WHERE task_id=$4 RETURNING *`,
      [status, normalizedTracks ? JSON.stringify(normalizedTracks) : generation.suno_data,
       errorMessage, taskId]
    );

    const formatted = formatRow(updated[0]);
    if (!TERMINAL_STATUSES.includes(status)) setCache(statusCache, taskId, formatted);
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
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_generations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
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
  res.json({ success: true }); // respond immediately — Suno has a 15 s timeout

  try {
    const payload  = req.body;
    const inner    = payload?.data || payload;
    const { callbackType, task_id, taskId: task_id_camel, data: rawData } = inner;

    const resolvedTaskId = task_id || task_id_camel;
    if (!resolvedTaskId) return;

    // Distinguish lyrics callbacks (data items carry a `text` field) from music callbacks
    const isLyrics =
      Array.isArray(rawData) &&
      rawData.length > 0 &&
      typeof rawData[0].text !== "undefined";

    if (isLyrics) {
      const status =
        callbackType === "complete" ? "SUCCESS"
        : callbackType === "error"  ? "CALLBACK_EXCEPTION"
        : "PENDING";

      await pool.query(
        `UPDATE ai_lyrics SET status=$1, lyrics_data=$2, updated_at=NOW() WHERE task_id=$3`,
        [status, JSON.stringify(rawData), resolvedTaskId]
      );
      lyricsStatusCache.delete(resolvedTaskId);
      return;
    }

    // Music callback
    let status = "PENDING";
    if (callbackType === "text")     status = "TEXT_SUCCESS";
    else if (callbackType === "first")    status = "FIRST_SUCCESS";
    else if (callbackType === "complete") status = "SUCCESS";
    else if (callbackType === "error")    status = "GENERATE_AUDIO_FAILED";

    const normalizedTracks = Array.isArray(rawData) && rawData.length
      ? rawData.map(normalizeSunoTrack).filter(Boolean)
      : null;

    await pool.query(
      `UPDATE ai_generations SET status=$1, suno_data=$2, updated_at=NOW() WHERE task_id=$3`,
      [status, normalizedTracks ? JSON.stringify(normalizedTracks) : null, resolvedTaskId]
    );
    statusCache.delete(resolvedTaskId);
  } catch (err) {
    console.error("Callback processing error:", err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/download/:taskId/:songId
───────────────────────────────────────────── */

const downloadSong = async (req, res) => {
  const { taskId, songId } = req.params;
  if (!taskId || !songId)
    return res.status(400).json({ error: "taskId and songId are required" });

  try {
    const { rows } = await pool.query(
      "SELECT suno_data, title FROM ai_generations WHERE task_id=$1 AND status='SUCCESS'",
      [taskId]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Generation not found or not complete" });

    const generation = rows[0];
    const songs = Array.isArray(generation.suno_data)
      ? generation.suno_data.map(normalizeSunoTrack).filter(Boolean)
      : [];
    const song = songs.find((s) => s.id === songId);
    if (!song) return res.status(404).json({ error: "Song not found in this generation" });

    const audioUrl = song.audioUrl;
    if (!audioUrl) return res.status(404).json({ error: "Audio URL not available" });

    const rawName  = song.title || generation.title || "ai-track";
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
    if (upstream.headers["content-length"])
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    res.setHeader("Cache-Control", "no-store");

    upstream.data.pipe(res);
    upstream.data.on("error", (streamErr) => {
      console.error("Audio stream error:", streamErr.message);
      if (!res.headersSent) res.status(502).json({ error: "Audio stream interrupted" });
    });
  } catch (err) {
    console.error("downloadSong error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Download failed" });
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

/* ─────────────────────────────────────────────
   POST /api/ai/extend
───────────────────────────────────────────── */

const extendMusicHandler = async (req, res) => {
  const userId = req.user.id;
  const {
    audioId,
    model          = "V4",
    defaultParamFlag = false,
    prompt,
    style,
    title,
    continueAt,
  } = req.body;

  if (!audioId) return res.status(400).json({ error: "audioId is required" });

  try {
    const activeId = await checkDuplicateGuard(userId);
    if (activeId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeId });
  } catch {}

  if (defaultParamFlag) {
    if (!prompt) return res.status(400).json({ error: "prompt is required when using custom settings" });
    if (!style)  return res.status(400).json({ error: "style is required when using custom settings" });
    if (!title)  return res.status(400).json({ error: "title is required when using custom settings" });
  }

  const sunoParams = {
    audioId,
    model,
    defaultParamFlag,
    callBackUrl: callBackUrl(),
    ...(defaultParamFlag && prompt && { prompt }),
    ...(defaultParamFlag && style  && { style }),
    ...(defaultParamFlag && title  && { title }),
    ...(continueAt != null && continueAt > 0 && { continueAt: Number(continueAt) }),
  };

  try {
    const result = await sunoService.extendMusic(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Extend failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental,
          status, operation_type, source_audio_id, continue_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING','extend',$9,$10)`,
      [taskId, String(userId), prompt || null, style || null, title || null,
       model, defaultParamFlag, false, audioId, continueAt || null]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/upload-cover
───────────────────────────────────────────── */

const uploadCoverHandler = async (req, res) => {
  const userId = req.user.id;
  const {
    uploadUrl,
    model        = "V4",
    customMode   = false,
    instrumental  = false,
    style,
    title,
    prompt,
    negativeTags,
    vocalGender,
  } = req.body;

  if (!uploadUrl) return res.status(400).json({ error: "uploadUrl is required" });
  if (!isPublicUrl(uploadUrl))
    return res.status(400).json({ error: "Audio file URL must be publicly accessible (not localhost or private network)" });

  try {
    const activeId = await checkDuplicateGuard(userId);
    if (activeId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeId });
  } catch {}

  if (customMode && !style) return res.status(400).json({ error: "style is required in custom mode" });
  if (customMode && !title) return res.status(400).json({ error: "title is required in custom mode" });
  if (!instrumental && !prompt)
    return res.status(400).json({ error: "prompt (lyrics) is required when not instrumental" });

  const sunoParams = {
    uploadUrl,
    model,
    customMode,
    instrumental,
    callBackUrl: callBackUrl(),
    ...(customMode && style  && { style }),
    ...(customMode && title  && { title }),
    ...(prompt      && { prompt }),
    ...(negativeTags && { negativeTags }),
    ...(vocalGender  && { vocalGender }),
  };

  try {
    const result = await sunoService.uploadCoverAudio(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Upload cover failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental,
          negative_tags, vocal_gender, upload_url, status, operation_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING','upload_cover')`,
      [taskId, String(userId), prompt || null, style || null, title || null,
       model, customMode, instrumental, negativeTags || null, vocalGender || null, uploadUrl]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/upload-extend
───────────────────────────────────────────── */

const uploadExtendHandler = async (req, res) => {
  const userId = req.user.id;
  const {
    uploadUrl,
    model          = "V4",
    defaultParamFlag = false,
    prompt,
    style,
    title,
    continueAt,
  } = req.body;

  if (!userId)    return res.status(400).json({ error: "userId is required" });
  if (!uploadUrl) return res.status(400).json({ error: "uploadUrl is required" });
  if (!isPublicUrl(uploadUrl))
    return res.status(400).json({ error: "Audio file URL must be publicly accessible (not localhost or private network)" });

  try {
    const activeId = await checkDuplicateGuard(userId);
    if (activeId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeId });
  } catch {}

  if (defaultParamFlag) {
    if (!prompt) return res.status(400).json({ error: "prompt is required when using custom settings" });
    if (!style)  return res.status(400).json({ error: "style is required when using custom settings" });
    if (!title)  return res.status(400).json({ error: "title is required when using custom settings" });
  }

  const sunoParams = {
    uploadUrl,
    model,
    defaultParamFlag,
    callBackUrl: callBackUrl(),
    ...(defaultParamFlag && prompt && { prompt }),
    ...(defaultParamFlag && style  && { style }),
    ...(defaultParamFlag && title  && { title }),
    ...(continueAt != null && continueAt > 0 && { continueAt: Number(continueAt) }),
  };

  try {
    const result = await sunoService.uploadExtendAudio(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Upload extend failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental,
          upload_url, continue_at, status, operation_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING','upload_extend')`,
      [taskId, String(userId), prompt || null, style || null, title || null,
       model, defaultParamFlag, false, uploadUrl, continueAt || null]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/add-vocals
───────────────────────────────────────────── */

const addVocalsHandler = async (req, res) => {
  const userId = req.user.id;
  const {
    uploadUrl,
    prompt,
    title,
    style,
    negativeTags = "",
    vocalGender,
    model        = "V4_5PLUS",
  } = req.body;

  if (!userId)    return res.status(400).json({ error: "userId is required" });
  if (!uploadUrl) return res.status(400).json({ error: "uploadUrl is required" });
  if (!isPublicUrl(uploadUrl))
    return res.status(400).json({ error: "Audio file URL must be publicly accessible (not localhost or private network)" });
  if (!prompt) return res.status(400).json({ error: "prompt (lyrics) is required" });
  if (!title)  return res.status(400).json({ error: "title is required" });
  if (!style)  return res.status(400).json({ error: "style is required" });

  try {
    const activeId = await checkDuplicateGuard(userId);
    if (activeId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeId });
  } catch {}

  const sunoParams = {
    uploadUrl,
    prompt,
    title,
    style,
    negativeTags,
    model,
    callBackUrl: callBackUrl(),
    ...(vocalGender && { vocalGender }),
  };

  try {
    const result = await sunoService.addVocals(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Add vocals failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, prompt, style, title, model, custom_mode, instrumental,
          negative_tags, vocal_gender, upload_url, status, operation_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING','add_vocals')`,
      [taskId, String(userId), prompt, style, title,
       model, true, false, negativeTags || null, vocalGender || null, uploadUrl]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/add-instrumental
───────────────────────────────────────────── */

const addInstrumentalHandler = async (req, res) => {
  const userId = req.user.id;
  const {
    uploadUrl,
    title,
    tags,
    negativeTags = "",
    vocalGender,
    model        = "V4_5PLUS",
  } = req.body;

  if (!userId)    return res.status(400).json({ error: "userId is required" });
  if (!uploadUrl) return res.status(400).json({ error: "uploadUrl is required" });
  if (!isPublicUrl(uploadUrl))
    return res.status(400).json({ error: "Audio file URL must be publicly accessible (not localhost or private network)" });
  if (!title) return res.status(400).json({ error: "title is required" });
  if (!tags)  return res.status(400).json({ error: "tags (style) is required" });

  try {
    const activeId = await checkDuplicateGuard(userId);
    if (activeId)
      return res.status(409).json({ error: "You already have a generation in progress", taskId: activeId });
  } catch {}

  const sunoParams = {
    uploadUrl,
    title,
    tags,
    negativeTags,
    model,
    callBackUrl: callBackUrl(),
    ...(vocalGender && { vocalGender }),
  };

  try {
    const result = await sunoService.addInstrumental(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Add instrumental failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_generations
         (task_id, user_id, title, model, custom_mode, instrumental,
          negative_tags, vocal_gender, upload_url, tags, status, operation_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING','add_instrumental')`,
      [taskId, String(userId), title,
       model, true, true, negativeTags || null, vocalGender || null, uploadUrl, tags]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/lyrics
───────────────────────────────────────────── */

const generateLyricsHandler = async (req, res) => {
  const userId    = req.user.id;
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  if (prompt.length > 200)
    return res.status(400).json({ error: "Prompt exceeds 200 characters" });

  const sunoParams = {
    prompt,
    callBackUrl: callBackUrl(),
  };

  try {
    const result = await sunoService.generateLyrics(sunoParams);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Lyrics generation failed" });

    const { taskId } = result.data;
    await pool.query(
      `INSERT INTO ai_lyrics (task_id, user_id, prompt, status)
       VALUES ($1,$2,$3,'PENDING')`,
      [taskId, String(userId), prompt]
    );
    return res.status(201).json({ taskId, status: "PENDING" });
  } catch (err) {
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/lyrics/:taskId/status
───────────────────────────────────────────── */

const getLyricsStatusHandler = async (req, res) => {
  const { taskId } = req.params;
  if (!taskId) return res.status(400).json({ error: "taskId is required" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM ai_lyrics WHERE task_id=$1", [taskId]
    );
    if (!rows.length) return res.status(404).json({ error: "Lyrics task not found" });

    const lyrics = rows[0];

    if (LYRICS_TERMINAL_STATUSES.includes(lyrics.status))
      return res.json(formatLyricsRow(lyrics));

    const cached = getCached(lyricsStatusCache, taskId);
    if (cached) return res.json(cached);

    let sunoResult;
    try {
      sunoResult = await sunoService.getLyricsStatus(taskId);
    } catch (pollErr) {
      console.warn("Suno lyrics poll error:", pollErr.message);
      return res.json(formatLyricsRow(lyrics));
    }

    if (sunoResult.code !== 200) return res.json(formatLyricsRow(lyrics));

    // Suno record-info response shape (per docs):
    //   data.status   = PENDING | SUCCESS | GENERATE_LYRICS_FAILED | …  (our internal values)
    //   data.response = { taskId, data: [{text, title, status, errorMessage}] }
    //
    // Normalize known API variants so the DB always stores canonical status strings.
    const rawStatus  = sunoResult.data.status;
    const sunoStatus = rawStatus === "GENERATE_LYRIC_FAILED"
      ? "GENERATE_LYRICS_FAILED"
      : rawStatus;
    const responseObj = sunoResult.data.response;

    // Extract LyricsResult[] from data.response.data (primary documented path)
    let lyricsArray = null;
    if (responseObj) {
      if (Array.isArray(responseObj.data)) {
        const items = responseObj.data.filter((x) => x && x.text != null);
        if (items.length) lyricsArray = items;
      } else if (Array.isArray(responseObj)) {
        // Fallback: response is itself the array
        const items = responseObj.filter((x) => x && x.text != null);
        if (items.length) lyricsArray = items;
      } else if (responseObj.text != null) {
        // Fallback: response is a single LyricsResult object
        lyricsArray = [responseObj];
      }
    }

    const statusUnchanged = sunoStatus === lyrics.status;
    const dataUnchanged   = !lyricsArray && !lyrics.lyrics_data;
    if (statusUnchanged && dataUnchanged) {
      const formatted = formatLyricsRow(lyrics);
      if (!LYRICS_TERMINAL_STATUSES.includes(sunoStatus))
        setCache(lyricsStatusCache, taskId, formatted);
      return res.json(formatted);
    }

    const sunoErrorMsg = sunoResult.data.errorMessage || sunoResult.data.msg || null;
    const dbErrorMsg   = LYRICS_TERMINAL_STATUSES.includes(sunoStatus) && sunoStatus !== "SUCCESS"
      ? (sunoErrorMsg || null)
      : null;

    const { rows: updated } = await pool.query(
      `UPDATE ai_lyrics SET status=$1, lyrics_data=$2, error_message=$3, updated_at=NOW()
       WHERE task_id=$4 RETURNING *`,
      [sunoStatus, lyricsArray ? JSON.stringify(lyricsArray) : lyrics.lyrics_data, dbErrorMsg, taskId]
    );

    const formatted = formatLyricsRow(updated[0]);
    if (!LYRICS_TERMINAL_STATUSES.includes(sunoStatus))
      setCache(lyricsStatusCache, taskId, formatted);
    return res.json(formatted);
  } catch (err) {
    console.error("getLyricsStatus error:", err);
    return res.status(500).json({ error: "Failed to fetch lyrics status" });
  }
};

/* ─────────────────────────────────────────────
   GET /api/ai/lyrics/history?userId=X
───────────────────────────────────────────── */

const getLyricsHistory = async (req, res) => {
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ai_lyrics WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [String(userId)]
    );
    return res.json({ data: rows.map(formatLyricsRow) });
  } catch (err) {
    console.error("getLyricsHistory error:", err);
    return res.status(500).json({ error: "Failed to fetch lyrics history" });
  }
};

/* ─────────────────────────────────────────────
   POST /api/ai/timestamped-lyrics
   Proxy — no DB storage, returns Suno response directly
───────────────────────────────────────────── */

const getTimestampedLyricsHandler = async (req, res) => {
  const { taskId, audioId } = req.body;
  if (!taskId || !audioId)
    return res.status(400).json({ error: "taskId and audioId are required" });

  try {
    const result = await sunoService.getTimestampedLyrics(taskId, audioId);
    if (result.code !== 200)
      return res.status(400).json({ error: result.msg || "Failed to fetch timestamped lyrics" });
    return res.json(result.data);
  } catch (err) {
    console.error("getTimestampedLyrics error:", err);
    return mapAxiosError(err, res);
  }
};

/* ─────────────────────────────────────────────
   Audio file upload
───────────────────────────────────────────── */

const uploadAudio = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file provided" });
  const localPath = req.file.path;
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "video",
      folder:        "harmony-ai-uploads",
    });
    fs.unlink(localPath, () => {});
    return res.json({ url: result.secure_url, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    fs.unlink(localPath, () => {});
    console.error("Cloudinary upload error:", err.message);
    return res.status(500).json({ error: "Failed to upload audio to cloud storage" });
  }
};

/* ─────────────────────────────────────────────
   Exports
───────────────────────────────────────────── */

module.exports = {
  generate,
  getStatus,
  getHistory,
  handleCallback,
  getCredits,
  downloadSong,
  extendMusicHandler,
  uploadCoverHandler,
  uploadExtendHandler,
  addVocalsHandler,
  addInstrumentalHandler,
  generateLyricsHandler,
  getLyricsStatusHandler,
  getLyricsHistory,
  getTimestampedLyricsHandler,
  uploadAudio,
};
