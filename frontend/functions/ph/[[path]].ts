// Cloudflare Pages Function: reverse proxy for PostHog.
// Bypasses content blockers by serving PostHog requests from methodex.ai/ph
// instead of us.i.posthog.com (which uBlock/Brave/Privacy Badger block by default).
//
// PostHog should be configured with api_host = "https://methodex.ai/ph" so that
// the SDK issues requests like /ph/decide/?v=3, /ph/e/, etc. — all same-origin.

const POSTHOG_HOST = "us.i.posthog.com";

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;

  const path = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  const url = new URL(request.url);

  const targetUrl = new URL(`https://${POSTHOG_HOST}/${path}`);
  targetUrl.search = url.search;

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.delete("host");
  proxyHeaders.delete("cf-connecting-ip");
  proxyHeaders.delete("cf-ipcountry");
  proxyHeaders.delete("cf-ray");
  proxyHeaders.delete("cf-visitor");
  proxyHeaders.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || ""
  );

  const body = request.method !== "GET" && request.method !== "HEAD"
    ? await request.arrayBuffer()
    : null;

  const resp = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: proxyHeaders,
    body,
  });

  const responseHeaders = new Headers(resp.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: responseHeaders,
  });
};
