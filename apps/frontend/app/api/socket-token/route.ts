import { NextResponse } from "next/server";
import { createRealtimeAuthToken } from "@/lib/auth-core";
import { hasDashboardSession } from "@/lib/dashboard-session";

export async function GET(): Promise<NextResponse> {
  try {
    if (!(await hasDashboardSession())) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json({
      token: createRealtimeAuthToken()
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Realtime auth is not fully configured on the server: ${error.message}`
            : "Realtime auth is not fully configured on the server."
      },
      { status: 503 }
    );
  }
}
