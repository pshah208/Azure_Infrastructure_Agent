import { NextResponse, type NextRequest } from "next/server";
import { getWebIq } from "@/lib/iq/web-iq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { query, loan_amount } = (await req.json().catch(() => ({}))) as {
    query?: string;
    loan_amount?: number;
  };
  const result = await getWebIq(query ?? "current mortgage rates", Number(loan_amount ?? 0));
  return NextResponse.json({ data: result.data, meta: { detail: result.detail, live: result.live, iq: "web" } });
}
