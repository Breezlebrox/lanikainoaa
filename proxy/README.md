# NDBC browser adapter

NDBC's active-stations XML and realtime text responses lack `Access-Control-Allow-Origin` (verified October 6, 2026). GitHub Pages cannot proxy requests. This optional Cloudflare Worker is the only server component: it relays two allowlisted public NOAA paths and stores nothing. It accepts no coordinates, user profiles, cookies, or saved places. No database, server cache, or application request logging is configured. The hosting provider still processes network requests.

1. Install/use the official Wrangler CLI: `npx wrangler login`.
2. From this directory: `npx wrangler deploy`.
3. Set repository **Settings → Secrets and variables → Actions → Variables**: `VITE_NDBC_PROXY_URL` to the resulting HTTPS Worker URL, without a trailing slash.
4. Rerun the Pages workflow. For local development set the same variable in `.env.local`, then restart Vite.

`ALLOWED_ORIGINS` is a comma-separated origin allowlist. Update it for a custom domain. Paths other than `/activestations.xml` and `/data/realtime2/<5-character station>.txt` are rejected; arbitrary URL forwarding is impossible. CORS is not authentication; public data remains public. No Worker credentials belong in the browser or repository. Buoy/water values remain explicitly unavailable until this is deployed.

Current deployment: https://coastline-ndbc.mattcarlsonno.workers.dev. The GitHub Pages workflow uses this public URL by default.
