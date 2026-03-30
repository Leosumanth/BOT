import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DASHBOARD_SESSION_AUDIENCE = "mintbot-dashboard";
const REALTIME_AUTH_AUDIENCE = "mintbot-realtime";
const DASHBOARD_SESSION_TTL_SECONDS = 60 * 60 * 12;

export const DASHBOARD_SESSION_COOKIE_NAME = "mintbot_dashboard_session";

type SessionPayload = {
  aud: typeof DASHBOARD_SESSION_AUDIENCE;
  exp: number;
};

type RealtimePayload = {
  aud: typeof REALTIME_AUTH_AUDIENCE;
  exp: number;
};

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signEncodedPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function verifySignedToken(token: string, audience: string, secret: string): boolean {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  const expectedSignature = signEncodedPayload(encodedPayload, secret);
  if (!safeEqual(expectedSignature, encodedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<{ aud: string; exp: number }>;
    if (payload.aud !== audience) {
      return false;
    }

    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return false;
    }

    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function resolveRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function resolveLegacySharedSecret(): string | undefined {
  return (
    process.env.ADMIN_API_TOKEN?.trim() ||
    process.env.PRIVATE_KEY_ENCRYPTION_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim()
  );
}

function resolveDashboardPassword(): string {
  return resolveRequiredEnv("DASHBOARD_ACCESS_PASSWORD", resolveLegacySharedSecret());
}

function resolveDashboardSessionSecret(): string {
  return resolveRequiredEnv(
    "DASHBOARD_SESSION_SECRET",
    process.env.PRIVATE_KEY_ENCRYPTION_SECRET?.trim() || resolveLegacySharedSecret()
  );
}

function resolveRealtimeSecret(): string {
  return resolveRequiredEnv("REALTIME_AUTH_SECRET", resolveLegacySharedSecret());
}

export function getServerAdminApiToken(): string {
  return resolveRequiredEnv("ADMIN_API_TOKEN", resolveLegacySharedSecret());
}

export function getServerBackendApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const backendPort = process.env.BACKEND_PORT?.trim();
  if (backendPort) {
    return `http://127.0.0.1:${backendPort}/api`;
  }

  const runtimePort = process.env.PORT?.trim();
  if (runtimePort && runtimePort !== "3000") {
    return `http://127.0.0.1:${runtimePort}/api`;
  }

  return "http://127.0.0.1:4000/api";
}

export function isDashboardPasswordValid(candidate: string): boolean {
  const expectedDigest = createHash("sha256").update(resolveDashboardPassword()).digest("base64url");
  const candidateDigest = createHash("sha256").update(candidate).digest("base64url");

  return safeEqual(expectedDigest, candidateDigest);
}

export function createDashboardSessionToken(): string {
  const payload: SessionPayload = {
    aud: DASHBOARD_SESSION_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + DASHBOARD_SESSION_TTL_SECONDS
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));

  return `${encodedPayload}.${signEncodedPayload(encodedPayload, resolveDashboardSessionSecret())}`;
}

export function createRealtimeAuthToken(ttlSeconds = 60): string {
  const payload: RealtimePayload = {
    aud: REALTIME_AUTH_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));

  return `${encodedPayload}.${signEncodedPayload(encodedPayload, resolveRealtimeSecret())}`;
}

export function getDashboardSessionCookieOptions(): {
  httpOnly: true;
  maxAge: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DASHBOARD_SESSION_TTL_SECONDS
  };
}

export async function hasDashboardSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_SESSION_COOKIE_NAME)?.value;

  return token ? verifySignedToken(token, DASHBOARD_SESSION_AUDIENCE, resolveDashboardSessionSecret()) : false;
}

export async function requireDashboardSession(): Promise<void> {
  if (!(await hasDashboardSession())) {
    redirect("/login");
  }
}
