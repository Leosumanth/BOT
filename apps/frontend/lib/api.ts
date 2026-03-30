export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
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
