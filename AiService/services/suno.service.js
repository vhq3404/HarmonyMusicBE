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

const generateMusic = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate", params);
  return data;
};

const getGenerationStatus = async (taskId) => {
  const { data } = await sunoClient.get(
    `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`
  );
  return data;
};

const getCredits = async () => {
  const { data } = await sunoClient.get("/api/v1/generate/credit");
  return data;
};

const extendMusic = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/extend", params);
  return data;
};

const uploadCoverAudio = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/upload-cover", params);
  return data;
};

const uploadExtendAudio = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/upload-extend", params);
  return data;
};

const addVocals = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/add-vocals", params);
  return data;
};

const addInstrumental = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/add-instrumental", params);
  return data;
};

const generateLyrics = async (params) => {
  const { data } = await sunoClient.post("/api/v1/lyrics", params);
  return data;
};

const getLyricsStatus = async (taskId) => {
  const { data } = await sunoClient.get(
    `/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`
  );
  return data;
};

const getTimestampedLyrics = async (taskId, audioId) => {
  const { data } = await sunoClient.post("/api/v1/generate/get-timestamped-lyrics", {
    taskId,
    audioId,
  });
  return data;
};

module.exports = {
  generateMusic,
  getGenerationStatus,
  getCredits,
  extendMusic,
  uploadCoverAudio,
  uploadExtendAudio,
  addVocals,
  addInstrumental,
  generateLyrics,
  getLyricsStatus,
  getTimestampedLyrics,
};
