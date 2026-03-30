import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: "mintbot-frontend",
    ok: true,
    timestamp: new Date().toISOString(),
    buildMarker: "dashboard-api-v2"
  });
}
