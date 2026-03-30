import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const REALTIME_AUTH_AUDIENCE = "mintbot-realtime";

type RealtimeAuthPayload = {
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

function buildRealtimeSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function extractAdminToken(headers: { authorization?: string | string[] | undefined; "x-admin-token"?: string | string[] | undefined }): string | null {
  const rawAuthorization = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  const rawAdminHeader = Array.isArray(headers["x-admin-token"]) ? headers["x-admin-token"][0] : headers["x-admin-token"];

  if (rawAuthorization?.startsWith("Bearer ")) {
    return rawAuthorization.slice("Bearer ".length).trim() || null;
  }

  return rawAdminHeader?.trim() || null;
}

export function isExpectedAdminToken(expectedToken: string, providedToken: string | null): boolean {
  if (!providedToken) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expectedToken).digest("base64url");
  const providedDigest = createHash("sha256").update(providedToken).digest("base64url");

  return safeEqual(expectedDigest, providedDigest);
}

export function verifyRealtimeAuthToken(token: string, secret: string): boolean {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  const expectedSignature = buildRealtimeSignature(encodedPayload, secret);
  if (!safeEqual(expectedSignature, encodedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<RealtimeAuthPayload>;
    if (payload.aud !== REALTIME_AUTH_AUDIENCE) {
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

export function createRealtimeAuthToken(secret: string, ttlSeconds = 60): string {
  const payload: RealtimeAuthPayload = {
    aud: REALTIME_AUTH_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = buildRealtimeSignature(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}
