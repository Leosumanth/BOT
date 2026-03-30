function getServerApiBaseUrl(): string {
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
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    return "/api";
  }

  return getServerApiBaseUrl();
}

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Backend request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.data as T;
}
