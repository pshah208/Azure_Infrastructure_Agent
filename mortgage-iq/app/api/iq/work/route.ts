import { NextResponse, type NextRequest } from "next/server";
import { getWorkIq } from "@/lib/iq/work-iq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { borrower } = (await req.json().catch(() => ({}))) as { borrower?: string };
  if (!borrower) return NextResponse.json({ error: "`borrower` is required" }, { status: 400 });
  const result = await getWorkIq(borrower);
  return NextResponse.json({ data: result.data, meta: { detail: result.detail, live: result.live, iq: "work" } });
}
