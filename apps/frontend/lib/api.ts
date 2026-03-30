function getServerAdminApiToken(): string {
  const token =
    process.env.ADMIN_API_TOKEN?.trim() ||
    process.env.PRIVATE_KEY_ENCRYPTION_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim();
  if (!token) {
    throw new Error("ADMIN_API_TOKEN is required for server-side backend access.");
  }

  return token;
}

function getServerBackendApiBaseUrl(): string {
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

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/backend";
  }

  return getServerBackendApiBaseUrl();
}

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const isServer = typeof window === "undefined";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(isServer ? { authorization: `Bearer ${getServerAdminApiToken()}` } : {}),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : `Backend request failed with ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return payload.data as T;
}
