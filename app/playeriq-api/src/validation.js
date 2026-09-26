const supportedExtensions = new Set([".mp4", ".mov"]);
const supportedContentTypes = new Set(["video/mp4", "video/quicktime"]);

export function validateVideoFile({ fileName, contentType, sizeBytes = 0, maxUploadBytes }) {
  const cleanName = sanitizeFileName(fileName);
  const extension = cleanName.includes(".") ? cleanName.slice(cleanName.lastIndexOf(".")).toLowerCase() : "";

  if (!supportedExtensions.has(extension)) {
    return { ok: false, error: "Only .mp4 and .mov files are supported for the MVP." };
  }

  if (contentType && !supportedContentTypes.has(contentType.toLowerCase())) {
    return { ok: false, error: "Only video/mp4 and video/quicktime content types are supported." };
  }

  if (sizeBytes > maxUploadBytes) {
    return { ok: false, error: `File exceeds the ${maxUploadBytes} byte MVP upload limit.` };
  }

  return { ok: true, fileName: cleanName, extension };
}

export function sanitizeFileName(fileName) {
  return String(fileName || "video.mp4")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

export function requireString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw Object.assign(new Error(`${fieldName} is required.`), { statusCode: 400 });
  }
  return normalized;
}

