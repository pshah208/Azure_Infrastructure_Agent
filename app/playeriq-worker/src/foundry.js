import { readFile } from "node:fs/promises";

export async function invokeFoundryAgent({
  credential,
  projectEndpoint,
  modelDeployment,
  agentName,
  input,
  imageFrames = [],
  fetchImpl = fetch
}) {
  const token = await credential.getToken("https://ai.azure.com/.default");
  const content = [
    {
      type: "input_text",
      text: JSON.stringify(input)
    }
  ];

  for (const frame of imageFrames) {
    const bytes = await readFile(frame.filePath);
    content.push({
      type: "input_text",
      text: `Frame ${frame.index + 1}, timestamp ${frame.timestamp}, evidence asset ${frame.blobName}.`
    });
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      detail: "low"
    });
  }

  const response = await fetchImpl(`${projectEndpoint.replace(/\/$/, "")}/openai/v1/responses`, {
    method: "POST",
    signal: AbortSignal.timeout(180000),
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelDeployment,
      input: [{ role: "user", content }],
      agent_reference: {
        name: agentName,
        type: "agent_reference"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Foundry agent '${agentName}' failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  return parseJson(extractResponseText(payload));
}

function extractResponseText(payload) {
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n");
}

function parseJson(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Foundry returned no output text.");
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(normalized);
}
