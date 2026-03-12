// Cloudflare Pages Function that proxies Clerk Frontend API requests
// through the Railway backend, avoiding the Cloudflare-to-Cloudflare
// conflict (Error 1000/525) that occurs when both the user's domain
// and Clerk use Cloudflare infrastructure.
//
// Flow: Browser → this function (methodex.ai/__clerk) → Railway → Clerk

interface Env {
  CLERK_BACKEND_URL: string; // e.g. https://api-production-df43.up.railway.app
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  const path = Array.isArray(params.path) ? params.path.join("/") : params.path;
  const backendBase = env.CLERK_BACKEND_URL || "https://api-production-df43.up.railway.app";
  const targetUrl = new URL(`${backendBase}/__clerk_fwd/${path}`);

  // Preserve query string
  const url = new URL(request.url);
  targetUrl.search = url.search;

  const headers = new Headers(request.headers);
  headers.set("Clerk-Proxy-Url", `${url.origin}/__clerk`);
  headers.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || ""
  );
  // Remove the host header so it doesn't conflict with the target
  headers.delete("host");

  const proxyRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
  });

  const response = await fetch(proxyRequest);

  // Forward the response, preserving Set-Cookie and other headers
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
