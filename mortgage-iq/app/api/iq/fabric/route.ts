import { NextResponse, type NextRequest } from "next/server";
import { getFabricIq } from "@/lib/iq/fabric-iq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { borrower } = (await req.json().catch(() => ({}))) as { borrower?: string };
  if (!borrower) return NextResponse.json({ error: "`borrower` is required" }, { status: 400 });
  const result = await getFabricIq(borrower);
  return NextResponse.json({ data: result.data, meta: { detail: result.detail, live: result.live, iq: "fabric" } });
}
