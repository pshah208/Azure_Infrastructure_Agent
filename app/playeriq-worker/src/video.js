import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function probeVideo(filePath, run = runCommand) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);
  const metadata = JSON.parse(output);
  const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
  const durationSeconds = Number(metadata.format?.duration || videoStream?.duration || 0);

  if (!videoStream || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("The uploaded file does not contain a readable video stream.");
  }

  return {
    durationSeconds,
    width: Number(videoStream.width || 0),
    height: Number(videoStream.height || 0),
    codec: videoStream.codec_name || "unknown",
    formatName: metadata.format?.format_name || "unknown"
  };
}

export function calculateSampleTimestamps(durationSeconds, maxFrames) {
  const frameCount = Math.max(1, Math.min(maxFrames, Math.ceil(durationSeconds / 15)));
  const interval = durationSeconds / (frameCount + 1);
  return Array.from({ length: frameCount }, (_, index) =>
    Number(Math.max(0, interval * (index + 1)).toFixed(3))
  );
}

export async function extractFrames({
  inputPath,
  outputDirectory,
  durationSeconds,
  maxFrames,
  run = runCommand
}) {
  await mkdir(outputDirectory, { recursive: true });
  const timestamps = calculateSampleTimestamps(durationSeconds, maxFrames);
  const frames = [];

  for (const [index, timestampSeconds] of timestamps.entries()) {
    const fileName = `frame-${String(index + 1).padStart(3, "0")}-${formatTimestampForFile(timestampSeconds)}.jpg`;
    const filePath = path.join(outputDirectory, fileName);
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(timestampSeconds),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(768,iw)':-2",
      "-q:v",
      "5",
      "-y",
      filePath
    ]);
    frames.push({
      index,
      fileName,
      filePath,
      timestampSeconds,
      timestamp: formatTimestamp(timestampSeconds)
    });
  }

  return frames;
}

export function formatTimestamp(totalSeconds) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimestampForFile(totalSeconds) {
  return String(Math.max(0, Math.round(totalSeconds))).padStart(6, "0");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
