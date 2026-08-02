/**
 * Work IQ via Microsoft Graph. Modelled on Lulu IQ's lib/azure/graph.ts.
 *
 * Auth: an Entra app (app-only Graph) whose client secret lives in Key Vault
 * under `ENTRA_GRAPH_APP_SECRET_KV_SECRET`. The FDPO/Container-App MI reads the
 * KV secret; the secret value is the Entra app secret (same pattern Lulu uses).
 *
 * Data path: reads a SharePoint document library (drive) organised as one folder
 * per borrower, e.g. `.../Loan Applications/<Borrower Name>/`. Received documents
 * are the files in that folder; missing documents are the required checklist
 * minus what's present; last contact is the most recent file modification.
 *
 * Guarded by `isGraphConfigured()` — when the Graph env surface isn't fully set,
 * callers (lib/iq/work-iq.ts) fall through to the Fabric documents table or the
 * local synthetic JSON, so the app keeps working.
 */

import { ClientSecretCredential } from "@azure/identity";
import { getSecret } from "./key-vault";
import {
  ENTRA_GRAPH_TENANT_ID,
  ENTRA_GRAPH_APP_ID,
  ENTRA_GRAPH_APP_SECRET_KV_SECRET,
  GRAPH_DRIVE_ID,
  GRAPH_BORROWERS_FOLDER,
  REQUIRED_DOCUMENTS,
} from "../constants";
import type { WorkIqRecord } from "../types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

let cachedCredential: ClientSecretCredential | undefined;

export function isGraphConfigured(): boolean {
  return Boolean(
    ENTRA_GRAPH_TENANT_ID &&
      ENTRA_GRAPH_APP_ID &&
      ENTRA_GRAPH_APP_SECRET_KV_SECRET &&
      GRAPH_DRIVE_ID,
  );
}

async function getCredential(): Promise<ClientSecretCredential> {
  if (cachedCredential) return cachedCredential;
  const secret = await getSecret(ENTRA_GRAPH_APP_SECRET_KV_SECRET);
  if (!secret) throw new Error(`Graph app secret '${ENTRA_GRAPH_APP_SECRET_KV_SECRET}' not found in Key Vault`);
  cachedCredential = new ClientSecretCredential(ENTRA_GRAPH_TENANT_ID, ENTRA_GRAPH_APP_ID, secret);
  return cachedCredential;
}

async function graphGet<T>(path: string): Promise<T> {
  const token = (await (await getCredential()).getToken(GRAPH_SCOPE))?.token;
  if (!token) throw new Error("could not acquire a Microsoft Graph token");
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Graph GET ${path} -> ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

interface DriveItem {
  name: string;
  lastModifiedDateTime?: string;
  file?: unknown;
  folder?: unknown;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/**
 * Fetch a borrower's document intake from the SharePoint document library.
 * Throws on error so lib/iq/work-iq.ts can fall through to the next source.
 */
export async function getBorrowerDocuments(borrower: string): Promise<WorkIqRecord> {
  const folder = `${GRAPH_BORROWERS_FOLDER}/${borrower}`.replace(/^\/+/, "");
  const encoded = encodeURIComponent(folder);
  const listing = await graphGet<{ value: DriveItem[] }>(
    `/drives/${GRAPH_DRIVE_ID}/root:/${encoded}:/children?$select=name,lastModifiedDateTime,file,folder`,
  );

  const files = listing.value.filter((i) => i.file);
  const received = files.map((f) => baseName(f.name));
  const receivedLower = received.map((r) => r.toLowerCase());
  const missing = REQUIRED_DOCUMENTS.filter(
    (req) => !receivedLower.some((r) => r.includes(req.toLowerCase())),
  );

  const latest = files
    .map((f) => f.lastModifiedDateTime)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const lastContact = latest
    ? `Last document uploaded ${new Date(latest).toLocaleDateString()}`
    : "No recent document activity";

  return {
    full_name: borrower,
    documents_received: received,
    documents_missing: missing,
    employment_status: missing.some((m) => /w-?2|pay stub/i.test(m))
      ? "Employment verification pending"
      : "Employment documents on file",
    last_contact: lastContact,
  };
}
