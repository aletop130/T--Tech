export default {
  async fetch(request: Request, env: { ORIGIN_HOST: string }): Promise<Response> {
    const url = new URL(request.url);

    // Auth routes go directly to Next.js frontend (port 3000)
    const isAuthRoute = url.pathname.startsWith('/api/auth/');
    const originPort = isAuthRoute ? ':3000' : '';

    // Build origin URL — connect via HTTP to origin
    const originUrl = `http://${env.ORIGIN_HOST}${originPort}${url.pathname}${url.search}`;

    // Forward the request to origin
    const originRequest = new Request(originUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });

    // Set Host header for the origin
    originRequest.headers.set("Host", url.hostname);
    originRequest.headers.set("X-Forwarded-Proto", "https");
    originRequest.headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
    originRequest.headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

    try {
      const response = await fetch(originUrl, {
        method: request.method,
        headers: originRequest.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "manual",
      });

      // Clone response with security headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
      newHeaders.set("X-Content-Type-Options", "nosniff");
      newHeaders.set("X-Frame-Options", "SAMEORIGIN");
      newHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response("Origin server unreachable", { status: 502 });
    }
  },
};
