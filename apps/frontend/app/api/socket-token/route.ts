import { NextResponse } from "next/server";
import { createRealtimeAuthToken, hasDashboardSession } from "@/lib/auth";

export async function GET(): Promise<NextResponse> {
  if (!(await hasDashboardSession())) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  return NextResponse.json({
    token: createRealtimeAuthToken()
  });
}
