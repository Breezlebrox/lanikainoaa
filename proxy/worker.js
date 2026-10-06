// Read-only allowlist. No user state, database, cookies, or cache storage.
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const headers = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
      Vary: "Origin",
    };
    if (!origin || !allowed.includes(origin))
      return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS")
      return new Response(null, {
        headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" },
      });
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405, headers });
    const path = new URL(request.url).pathname;
    if (
      path !== "/activestations.xml" &&
      !/^\/data\/realtime2\/[a-z0-9]{5}\.txt$/.test(path)
    )
      return new Response("Not found", { status: 404, headers });
    try {
      const upstream = await fetch("https://www.ndbc.noaa.gov" + path, {
        headers: {
          "User-Agent": "CoastlinePWA (NOAA public data browser adapter)",
        },
        signal: AbortSignal.timeout(15000),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...headers,
          "Content-Type": upstream.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("NDBC temporarily unavailable", {
        status: 502,
        headers,
      });
    }
  },
};
