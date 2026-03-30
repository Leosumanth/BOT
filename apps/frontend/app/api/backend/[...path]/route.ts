import { NextResponse } from "next/server";
import { getServerAdminApiToken, getServerBackendApiBaseUrl } from "@/lib/auth-core";
import { hasDashboardSession } from "@/lib/dashboard-session";

async function handleProxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  if (!(await hasDashboardSession())) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = `${getServerBackendApiBaseUrl().replace(/\/+$/, "")}/${path.join("/")}${requestUrl.search}`;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        authorization: `Bearer ${getServerAdminApiToken()}`,
        accept: request.headers.get("accept") ?? "application/json",
        ...(body && request.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : {})
      },
      body: body && body.length > 0 ? body : undefined,
      cache: "no-store"
    });

    const responseText = await upstreamResponse.text();
    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      headers: responseHeaders
    });
  } catch {
    return NextResponse.json(
      {
        message: "Unable to reach the backend API."
      },
      {
        status: 502
      }
    );
  }
}

export { handleProxy as GET, handleProxy as POST, handleProxy as PATCH, handleProxy as DELETE };
