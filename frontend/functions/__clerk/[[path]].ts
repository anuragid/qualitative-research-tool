// Cloudflare Pages Function that proxies Clerk Frontend API requests.
// Uses frontend-api.clerk.dev as the target (documented proxy endpoint).
// If the direct request fails (Cloudflare-to-Cloudflare conflict), falls
// back to routing through the Railway backend.

interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_BACKEND_URL: string; // e.g. https://api.methodex.ai
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  const path = Array.isArray(params.path) ? params.path.join("/") : params.path;
  const url = new URL(request.url);

  const clerkHeaders = new Headers(request.headers);
  clerkHeaders.set("Clerk-Proxy-Url", `${url.origin}/__clerk`);
  clerkHeaders.set("Clerk-Secret-Key", env.CLERK_SECRET_KEY);
  clerkHeaders.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || ""
  );
  clerkHeaders.delete("host");

  const body = request.method !== "GET" && request.method !== "HEAD" ? request.body : null;

  // Try direct to Clerk first (frontend-api.clerk.dev has valid TLS)
  try {
    const directUrl = new URL(`https://frontend-api.clerk.dev/${path}`);
    directUrl.search = url.search;

    const resp = await fetch(directUrl.toString(), {
      method: request.method,
      headers: clerkHeaders,
      body,
    });

    if (resp.ok || resp.status < 500) {
      const responseHeaders = new Headers(resp.headers);
      responseHeaders.delete("transfer-encoding");
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
    }
  } catch {
    // Direct failed — fall through to Railway proxy
  }

  // Fallback: proxy through Railway backend (not on Cloudflare)
  const backendBase = env.CLERK_BACKEND_URL || "https://api.methodex.ai";
  const fallbackUrl = new URL(`${backendBase}/__clerk_fwd/${path}`);
  fallbackUrl.search = url.search;

  const fallbackResp = await fetch(fallbackUrl.toString(), {
    method: request.method,
    headers: clerkHeaders,
    body,
  });

  const responseHeaders = new Headers(fallbackResp.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(fallbackResp.body, {
    status: fallbackResp.status,
    statusText: fallbackResp.statusText,
    headers: responseHeaders,
  });
};
