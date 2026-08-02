import { NextResponse } from "next/server";
import { runtimeMode, FOUNDRY_MODEL_DEPLOYMENT, FOUNDRY_PROJECT_ENDPOINT } from "@/lib/constants";
import { IQ_METADATA } from "@/lib/iq";
import { AGENTS } from "@/lib/agents";

export const runtime = "nodejs";

export async function GET() {
  const mode = runtimeMode();
  return NextResponse.json({
    mode,
    model: FOUNDRY_PROJECT_ENDPOINT ? FOUNDRY_MODEL_DEPLOYMENT : "local-reasoner",
    iqs: IQ_METADATA,
    agents: AGENTS,
  });
}
