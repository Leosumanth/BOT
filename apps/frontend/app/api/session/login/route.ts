import { NextResponse } from "next/server";
import {
  DASHBOARD_SESSION_COOKIE_NAME,
  createDashboardSessionToken,
  getDashboardSessionCookieOptions,
  isDashboardPasswordValid
} from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  const payload = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = payload?.password?.trim() ?? "";

  if (!password || !isDashboardPasswordValid(password)) {
    return NextResponse.json(
      {
        message: "Invalid dashboard password."
      },
      {
        status: 401
      }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DASHBOARD_SESSION_COOKIE_NAME, createDashboardSessionToken(), getDashboardSessionCookieOptions());
  return response;
}
