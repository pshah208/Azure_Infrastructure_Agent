/** Work IQ - borrower document intake + employment from Microsoft 365 (or local JSON). */

import documents from "../../data/borrower_documents.json";
import { queryOne } from "../azure/fabric";
import { getBorrowerDocuments, isGraphConfigured } from "../azure/graph";
import { isFabricConfigured, FABRIC_DOCUMENTS_TABLE } from "../constants";
import type { IqToolResult, WorkIqRecord } from "../types";

interface DocRow {
  full_name: string;
  documents_received: string | string[];
  documents_missing: string | string[];
  employment_status: string;
  last_contact: string;
}

function split(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toRecord(row: DocRow): WorkIqRecord {
  return {
    full_name: row.full_name,
    documents_received: split(row.documents_received),
    documents_missing: split(row.documents_missing),
    employment_status: row.employment_status ?? "Unknown",
    last_contact: row.last_contact ?? "No recent contact",
  };
}

export async function getWorkIq(
  borrower: string,
): Promise<IqToolResult<WorkIqRecord | { note: string }>> {
  // 1) Microsoft Graph (real M365) when configured.
  if (isGraphConfigured()) {
    try {
      const record = await getBorrowerDocuments(borrower);
      return { data: record, detail: `Read ${borrower}'s documents from Microsoft 365 (Graph)`, live: true };
    } catch (err) {
      console.warn("[work-iq] Graph lookup failed, falling through:", err instanceof Error ? err.message : err);
    }
  }

  // 2) Fabric documents table (M365/SharePoint export stand-in).
  if (isFabricConfigured()) {
    const row = await queryOne<DocRow>(FABRIC_DOCUMENTS_TABLE, "full_name", borrower);
    if (row) {
      return { data: toRecord(row), detail: `Read ${borrower}'s M365 mail + SharePoint documents`, live: true };
    }
    return { data: { note: `No Microsoft 365 records found for '${borrower}'.` }, detail: `No M365 record for '${borrower}'`, live: true };
  }

  // 3) Local synthetic fallback.
  const match = (documents as DocRow[]).find(
    (d) => d.full_name.toLowerCase() === borrower.toLowerCase(),
  );
  if (!match) {
    return { data: { note: `No Microsoft 365 records found for '${borrower}'.` }, detail: `No local M365 record for '${borrower}'`, live: false };
  }
  return { data: toRecord(match), detail: "Local synthetic document intake", live: false };
}
