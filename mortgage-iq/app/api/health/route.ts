import { NextResponse } from "next/server";
import { runtimeMode } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    mode: runtimeMode(),
    revision: process.env.DEPLOY_REVISION ?? "local",
    gitSha: process.env.GIT_SHA_SHORT ?? "dev",
    region: process.env.AZURE_REGION ?? "local",
  });
}
