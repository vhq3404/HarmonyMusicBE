"use strict";

const cloudinary = require("cloudinary").v2;
const fs         = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url) {
  if (!url) return "";

  const afterUpload = url.split("/upload/")[1];
  if (!afterUpload) {
    const filename = url.split("/").pop() || "";
    return filename.split(".")[0];
  }

  return afterUpload.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
}

function unlinkSilently(localPath) {
  if (localPath) fs.unlink(localPath, () => {});
}

async function uploadAudio(localPath, folder = "harmony-audio") {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "video",
      folder,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } finally {
    unlinkSilently(localPath);
  }
}

async function uploadImage(localPath, folder = "harmony-images") {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "image",
      folder,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } finally {
    unlinkSilently(localPath);
  }
}

async function uploadAvatar(localPath) {
  return uploadImage(localPath, "avatars");
}

async function deleteAudio(urlOrPublicId) {
  if (!urlOrPublicId) return;
  const publicId = urlOrPublicId.startsWith("http")
    ? extractPublicId(urlOrPublicId)
    : urlOrPublicId;
  await cloudinary.uploader.destroy(publicId, { resource_type: "video" }).catch(() => {});
}

async function deleteImage(urlOrPublicId) {
  if (!urlOrPublicId) return;
  const publicId = urlOrPublicId.startsWith("http")
    ? extractPublicId(urlOrPublicId)
    : urlOrPublicId;
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
}

module.exports = {
  uploadAudio,
  uploadImage,
  uploadAvatar,
  deleteAudio,
  deleteImage,
  extractPublicId,
};
