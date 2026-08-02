import { NextResponse, type NextRequest } from "next/server";
import { lookupGuidelines } from "@/lib/iq/foundry-iq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  if (!query) return NextResponse.json({ error: "`query` is required" }, { status: 400 });
  const result = await lookupGuidelines(query);
  return NextResponse.json({ data: result.data, meta: { detail: result.detail, live: result.live, iq: "foundry" } });
}
