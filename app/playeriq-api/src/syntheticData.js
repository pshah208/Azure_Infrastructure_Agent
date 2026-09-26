import { readFile } from "node:fs/promises";
import path from "node:path";

const syntheticFiles = [
  "players.json",
  "matches.json",
  "observations.json",
  "coach-reviews.json",
  "training-plans.json",
  "fabric-semantic-model-seed.json"
];

export async function loadSyntheticDataset(basePath) {
  const entries = await Promise.all(
    syntheticFiles.map(async (fileName) => {
      const content = await readFile(path.join(basePath, fileName), "utf8");
      return [toCamelCase(fileName.replace(/\.json$/, "")), JSON.parse(content)];
    })
  );

  return Object.fromEntries(entries);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

