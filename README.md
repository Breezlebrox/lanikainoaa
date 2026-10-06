# Coastline

A mobile-first, account-free React + TypeScript PWA for U.S. coastal tides, hourly weather, alerts, wave observations, water temperature, and sunrise/sunset. Starts at Lanikai, Oahu. No analytics, ads, shared database, or user accounts.

## Run

Node 22+:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## GitHub Pages

Remote: `git@github.com:Breezlebrox/lanikainoaa.git`.

1. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Push `main`. `.github/workflows/deploy.yml` tests, builds, uploads only `dist`, and deploys using Pages OIDC permissions.
3. Expected URL: https://breezlebrox.github.io/lanikainoaa/ (available after successful deployment).

`actions/configure-pages` supplies the base path. Vite assets, manifest start URL/scope, icons, and service-worker scope use that same path; user/org root sites and custom domains use `/`. There is no client-side route requiring a Pages 404 workaround. A local subpath build can be checked with `VITE_BASE_PATH=/lanikainoaa/ npm run build`.

Live buoy data uses the deployed [stateless NDBC adapter](proxy/README.md) at https://coastline-ndbc.mattcarlsonno.workers.dev. The Pages workflow includes this public endpoint; the Actions variable `VITE_NDBC_PROXY_URL` can override it. It contains no credential. For local development, set the same URL in `.env.local`.

## Privacy and multiple users

Each browser stores its own locations, labels, station choices, theme, and API response caches in namespaced localStorage. Service-worker app files live in that browser's Cache Storage. None are uploaded or synced. Sharing the URL does not share preferences; clearing site data removes them. Different people sharing the same browser profile share that profile's local storage. Safari installations may have separate storage from an existing Safari tab.

Government services receive coordinates needed to answer weather requests, along with normal network metadata. The optional NDBC adapter receives only public station IDs. No application database, analytics, or cloud user storage exists. Storage failures preserve the current session but cannot guarantee offline persistence.

## Data architecture

- `src/services/coops.ts`: station metadata, reference/subordinate relationship, timezone offset, 6-minute MLLW predictions, and NOAA high/low events. Dates are requested in GMT and rendered in the location's IANA timezone. Subordinate stations show event tables, never synthetic continuous curves.
- `weatherService.ts`: NWS point resolution and hourly forecast links; point mapping expires after seven days. Active alerts load independently. Hourly forecast is explicitly labeled, not represented as a current observation. Browser-controlled User-Agent is retained: browsers cannot reliably set application User-Agent; we use a simple Accept header without custom preflight headers. CO-OPS uses its supported application parameter.
- `ndbc.ts`: XML discovery and header-based realtime text parsing. Missing `MM` fields remain null. Automatic selection checks up to eight nearest active meteorological stations within 400 km and prefers a recent wave-reporting station; older cached readings are retained with a stale indicator. Manual overrides can select stations without wave sensors. Significant wave height is not breaking surf height or a separated swell component.
- `sun.ts`: local SunCalc calculations; `tz-lookup` resolves the selected location's timezone, independent of the viewing device.
- `cache.ts`: browser-only TTL cache with stale-on-error fallback. Station metadata: 30 days (tide) / one day (buoy); tide: six hours per station/UTC date with last-success fallback across dates; forecast: 30 minutes; observations: ten minutes; alerts: five minutes.

Station defaults use geography and NOAA reference relationships, not a claim of perfect shoreline representativeness. At Lanikai, Waimanalo (~7 km) is subordinate to Moku o Loe (~9 km); that reference supplies the default continuous curve. Users can choose Waimanalo's high/low predictions instead. Moku o Loe is inside Kaneohe Bay, so inspect shoreline exposure before relying on it for a specific spot. Discovery has no hard-coded station IDs.

## Offline and installation

Open once online, allow data to load, then in iPhone Safari use **Share → Add to Home Screen**. Production builds precache the application shell and keep successful API responses in localStorage. Cached data shows retrieval times; failed refreshes are explicitly marked cached. Expired forecast periods are not presented as current conditions. Offline support cannot supply never-visited data or replace an expired forecast. Updates install automatically on a subsequent open.

## Verification

Unit tests use small fixtures from real NOAA/NWS response structures. Coverage includes normalization, missing sensors, malformed buoy rows, station distance ordering, tide event extraction/direction, units, Hawaii and DST timezone display, and per-key stale cache behavior. Live October 6, 2026 checks confirmed CO-OPS metadata/predictions and NWS point/hourly endpoints return data with browser CORS; NDBC metadata/text return data without browser CORS. The local browser successfully displayed real Lanikai weather and Moku o Loe predictions. No sample production values are used.

The deployed proxy was verified against live NDBC station XML and Mokapu Point observations on October 6, 2026. A physical iPhone installation still requires device verification. Location permission and NOAA outages can produce partial data; the remaining sections stay usable. This utility is not a navigation or safety forecast.

Official references: [CO-OPS](https://api.tidesandcurrents.noaa.gov/api/prod/), [metadata](https://api.tidesandcurrents.noaa.gov/mdapi/prod/), [NWS](https://www.weather.gov/documentation/services-web-api), [NDBC](https://www.ndbc.noaa.gov/faq/rt_data_access.shtml).

## Foreground refresh

While visible, the app checks once per minute and reuses each source’s cache until its TTL expires. Returning to the app (including page-cache restoration) or regaining connectivity triggers an immediate cache-aware check. The refresh button bypasses data TTLs for that request only. Existing readings remain visible during updates. Overlapping checks are coalesced. Hiding the app removes the timer; no background polling or Background Sync is registered. Requests already in flight may finish, but subsequent network requests are blocked while hidden. Offline timer ticks update the displayed time without fetching.
