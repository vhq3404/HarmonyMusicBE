const axios = require("axios");

const BASE_URL =
  process.env.SUNO_API_BASE_URL || "https://api.sunoapi.org";

const sunoClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/**
 * Submit a music generation task to Suno.
 * @param {Object} params
 * @param {boolean} params.customMode
 * @param {boolean} params.instrumental
 * @param {string}  params.model
 * @param {string}  params.callBackUrl
 * @param {string}  [params.prompt]
 * @param {string}  [params.style]
 * @param {string}  [params.title]
 * @param {string}  [params.negativeTags]
 * @param {string}  [params.vocalGender]
 */
const generateMusic = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate", params);
  return data;
};

/**
 * Poll generation status by taskId.
 * @param {string} taskId
 */
const getGenerationStatus = async (taskId) => {
  const { data } = await sunoClient.get(
    `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`
  );
  return data;
};

/**
 * Fetch remaining API credits.
 */
const getCredits = async () => {
  const { data } = await sunoClient.get("/api/v1/generate/credit");
  return data;
};

module.exports = { generateMusic, getGenerationStatus, getCredits };
