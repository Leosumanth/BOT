import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DASHBOARD_SESSION_COOKIE_NAME, verifyDashboardSessionToken } from "@/lib/auth-core";

export async function hasDashboardSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_SESSION_COOKIE_NAME)?.value;

  return token ? verifyDashboardSessionToken(token) : false;
}

export async function requireDashboardSession(): Promise<void> {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }
}
