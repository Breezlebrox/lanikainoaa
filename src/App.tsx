import { useEffect, useState } from "react";
import type {
  CoastalLocation,
  Cached,
  TideData,
  WeatherData,
  MarineObservation,
  Station,
  WeatherAlert,
} from "./models";
import { read, write } from "./services/cache";
import { tideStations, tides } from "./services/coops";
import { weather, alerts } from "./services/weatherService";
import { buoyStations, marine } from "./services/ndbc";
import { sun } from "./services/sun";
import {
  nearby,
  timezone,
  timeLabel,
  dayKey,
  tideNow,
  direction,
  calendarDays,
} from "./utils";
import { TideChart } from "./TideChart";
const initial: CoastalLocation = {
  id: "lanikai",
  label: "Lanikai",
  lat: 21.393,
  lon: -157.715,
};
type Load<T> = { value?: Cached<T>; error?: string; loading: boolean };
const empty = { loading: true };
const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toFixed(digits);
function Status({ state, zone }: { state: Load<unknown>; zone: string }) {
  return (
    <p
      className={`status ${state.error || state.value?.stale ? "warning" : ""}`}
      role="status"
    >
      {state.loading
        ? "Updating…"
        : state.error ||
          `${state.value?.stale ? "Cached · offline or service unavailable · " : ""}Updated ${state.value ? timeLabel(state.value.fetchedAt, zone) : "—"}`}
    </p>
  );
}
export default function App() {
  const [locations, setLocations] = useState<CoastalLocation[]>(
    () => read<CoastalLocation[]>("locations") || [initial],
  );
  const [selected, setSelected] = useState(
    () => read<string>("selected") || "lanikai",
  );
  const location =
    locations.find((l) => l.id === selected) || locations[0] || initial;
  const [settings, setSettings] = useState(false),
    [name, setName] = useState(""),
    [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(() => read<string>("theme") || "system");
  const [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now()),
    [online, setOnline] = useState(navigator.onLine);
  const [tide, setTide] = useState<Load<TideData>>(empty),
    [wx, setWx] = useState<Load<WeatherData>>(empty),
    [ocean, setOcean] = useState<Load<MarineObservation>>(empty),
    [alertState, setAlertState] = useState<Load<WeatherAlert[]>>(empty);
  const [tideOptions, setTideOptions] = useState<Station[]>([]),
    [buoyOptions, setBuoyOptions] = useState<Station[]>([]);
  const zone = timezone(location.lat, location.lon);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write("theme", theme);
  }, [theme]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60000);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setTide(empty);
    setWx(empty);
    setOcean(empty);
    setAlertState(empty);
    setTideOptions([]);
    setBuoyOptions([]);
    const force = refresh > 0;
    const run = async <T,>(
      loader: () => Promise<Cached<T>>,
      set: (v: Load<T>) => void,
    ) => {
      try {
        const value = await loader();
        if (alive) set({ value, loading: false });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "Service unavailable",
            loading: false,
          });
      }
    };
    void run(() => weather(location.lat, location.lon, force), setWx);
    void run(() => alerts(location.lat, location.lon, force), setAlertState);
    void run(async () => {
      const all = await tideStations();
      const options = nearby(all.data, location);
      if (alive) setTideOptions(options);
      const closest = options[0];
      const preferred = options.find((s) => s.id === location.tideId);
      const related = options.find((s) => s.id === closest?.referenceId);
      const station =
        preferred || related || options.find((s) => s.type === "R") || closest;
      if (!station) throw new Error("No tide station within 250 km.");
      return tides(station, force);
    }, setTide);
    void run(async () => {
      const all = await buoyStations();
      const options = nearby(all.data, location, 400);
      if (alive) setBuoyOptions(options);
      if (location.buoyId) {
        const station = options.find((s) => s.id === location.buoyId);
        if (!station)
          throw new Error(
            "Saved buoy is not currently active nearby. Choose another source.",
          );
        return marine(station, force);
      }
      let fallback: Cached<MarineObservation> | undefined;
      for (const station of options.slice(0, 8)) {
        try {
          const result = await marine(station, force);
          if (result.data.waveFeet !== null) {
            fallback ||= result;
            if (Date.now() - result.data.time < 6 * 3600000) return result;
          }
        } catch {
          /* try next actual reporting station */
        }
      }
      if (fallback) return { ...fallback, stale: true };
      throw new Error(
        "No recent wave-reporting buoy found among the eight nearest stations within 400 km. Choose a buoy below.",
      );
    }, setOcean);
    return () => {
      alive = false;
    };
  }, [
    location.id,
    location.lat,
    location.lon,
    location.tideId,
    location.buoyId,
    refresh,
  ]);
  function save(next: CoastalLocation[]) {
    setLocations(next);
    if (!write("locations", next))
      setNotice(
        "Browser storage is full or unavailable. Changes will last only for this session.",
      );
  }
  function choose(id: string) {
    setSelected(id);
    write("selected", id);
  }
  function preference(key: "tideId" | "buoyId", value: string) {
    const updated = { ...location, [key]: value || undefined };
    save(
      locations.some((l) => l.id === location.id)
        ? locations.map((l) => (l.id === location.id ? updated : l))
        : [...locations, updated],
    );
  }
  function geolocate() {
    if (!navigator.geolocation) {
      setNotice("Geolocation is unavailable in this browser.");
      return;
    }
    setNotice("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const item = {
          id: crypto.randomUUID(),
          label: "My location",
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        };
        save([...locations, item]);
        choose(item.id);
        setNotice("Location added on this device. Give it a name in Places.");
      },
      () =>
        setNotice(
          "Location access failed. Allow location access in browser settings and try again.",
        ),
      { timeout: 15000, maximumAge: 60000 },
    );
  }
  const current = wx.value?.data.hours.find(
      (h) => h.time <= now && h.time + 3600000 > now,
    ),
    tideData = tide.value?.data,
    marineData = ocean.value?.data;
  const level = tideData ? tideNow(tideData.samples, now) : null;
  const nextHigh = tideData?.events.find(
      (e) => e.kind === "High" && e.time > now,
    ),
    nextLow = tideData?.events.find((e) => e.kind === "Low" && e.time > now);
  const sunTimes = sun(location.lat, location.lon, zone);
  const days = calendarDays(now, zone, 7);
  return (
    <main>
      <header>
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">≈</span> COASTLINE
        </a>
        <button
          className="quiet"
          onClick={() => setSettings(!settings)}
          aria-expanded={settings}
        >
          Places & settings
        </button>
      </header>
      <div className="location-row">
        <div>
          <p className="eyebrow">ALOHA, COASTSIDE</p>
          <h1>{location.label}</h1>
          <p className="date">
            {new Intl.DateTimeFormat("en-US", {
              timeZone: zone,
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(now)}
          </p>
        </div>
        <button
          className="refresh"
          aria-label="Refresh conditions"
          onClick={() => {
            setNow(Date.now());
            setRefresh((r) => r + 1);
          }}
        >
          ↻
        </button>
      </div>
      {!online && (
        <p className="banner">
          You’re offline. Saved conditions remain available; check their
          timestamps.
        </p>
      )}
      {notice && (
        <p className="banner" role="status">
          {notice}
          <button className="quiet" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </p>
      )}
      {settings && (
        <section className="settings">
          <h2>Your places</h2>
          <label>
            Saved on this device
            <select
              value={location.id}
              onChange={(e) => choose(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button onClick={geolocate}>Use my location</button>
            <button
              className="quiet"
              onClick={() => {
                save(locations.filter((l) => l.id !== location.id));
                choose("lanikai");
              }}
              disabled={!locations.some((l) => l.id === location.id)}
            >
              Delete this place
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const updated = { ...location, label: name.trim() };
              save(
                locations.some((l) => l.id === location.id)
                  ? locations.map((l) => (l.id === location.id ? updated : l))
                  : [...locations, updated],
              );
              setName("");
              setNotice("Place saved on this device.");
            }}
          >
            <label>
              Place name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={location.label}
                maxLength={60}
                required
              />
            </label>
            <button>Save name</button>
          </form>
          <label>
            Appearance
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Match device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <p className="fine">
            No account. No tracking. Places, source choices, and caches stay in
            this browser. In Safari, use Share → Add to Home Screen to install.
          </p>
        </section>
      )}
      {alertState.value?.data.map((a) => (
        <details className="alert" key={a.id}>
          <summary>{a.title}</summary>
          <p>{a.description}</p>
        </details>
      ))}
      {alertState.error && (
        <p className="status warning">
          Alerts unavailable. Check weather.gov for current alerts.
        </p>
      )}
      {alertState.value?.stale && (
        <p className="status warning">
          Alerts are cached and may no longer be current.
        </p>
      )}
      <section className={`weather ${wx.loading ? "loading" : ""}`}>
        <div>
          <p className="eyebrow">HOURLY WEATHER FORECAST</p>
          <div className="temperature">
            {fmt(current?.temperature)}
            <span>°F</span>
          </div>
          <p className="conditions">
            {current?.description || "Weather unavailable"}
          </p>
        </div>
        <div className="weather-side">
          <span className="weather-symbol" aria-hidden="true">
            {current?.description.toLowerCase().includes("rain")
              ? "☂"
              : current?.description.toLowerCase().includes("cloud")
                ? "☁"
                : "☀"}
          </span>
          <p>{current ? `${current.direction} ${current.wind}` : "Wind —"}</p>
          <p className="muted">
            Rain {current?.rain == null ? "—" : `${current.rain}%`}
          </p>
        </div>
      </section>
      <Status state={wx} zone={zone} />
      <section className="ocean-grid">
        <div>
          <p className="eyebrow">TIDE · PREDICTED</p>
          <p className="metric">
            {fmt(level?.height, 1)}
            <small> ft</small>
          </p>
          <p>
            {level
              ? `${level.trend === "Rising" ? "↗" : level.trend === "Falling" ? "↘" : "→"} ${level.trend}`
              : "Prediction unavailable"}
          </p>
        </div>
        <div>
          <p className="eyebrow">WAVES · OBSERVED</p>
          <p className="metric">
            {fmt(marineData?.waveFeet, 1)}
            <small> ft</small>
          </p>
          <p>
            {fmt(marineData?.period)} sec{" "}
            <span className="muted">
              · {direction(marineData?.direction ?? null)}
            </span>
          </p>
        </div>
        <div>
          <p className="eyebrow">WATER · OBSERVED</p>
          <p className="metric">
            {fmt(marineData?.waterF)}
            <small> °F</small>
          </p>
          <p className="muted">
            {marineData ? timeLabel(marineData.time, zone) : "Not available"}
          </p>
        </div>
      </section>
      <div className="next-tides">
        <p>
          Next high{" "}
          <strong>
            {nextHigh
              ? `${timeLabel(nextHigh.time, zone)} · ${nextHigh.height.toFixed(1)}′`
              : "—"}
          </strong>
        </p>
        <p>
          Next low{" "}
          <strong>
            {nextLow
              ? `${timeLabel(nextLow.time, zone)} · ${nextLow.height.toFixed(1)}′`
              : "—"}
          </strong>
        </p>
      </div>
      <section className="tides">
        <div className="section-title">
          <h2>The tide ahead</h2>
          <span className="pill">48 HOURS</span>
        </div>
        <p className="muted">Predicted height · feet above MLLW</p>
        {tideData ? (
          <TideChart data={tideData} zone={zone} now={now} />
        ) : (
          <div className={`empty ${tide.loading ? "loading" : ""}`}>
            {tide.loading
              ? "Loading tide predictions…"
              : "Tide curve unavailable"}
          </div>
        )}
        <Status state={tide} zone={zone} />
      </section>
      <section>
        <div className="section-title">
          <h2>Hour by hour</h2>
          <span className="muted">Forecast</span>
        </div>
        <div className="hourly">
          {wx.value &&
            !wx.value.data.hours.some((h) => h.time + 3600000 > now) && (
              <p className="empty">
                Cached forecast has expired. Reconnect to update.
              </p>
            )}
          {wx.value?.data.hours
            .filter((h) => h.time + 3600000 > now)
            .slice(0, 24)
            .map((h) => (
              <article key={h.time}>
                <p className="muted">{timeLabel(h.time, zone)}</p>
                <strong>{fmt(h.temperature)}°</strong>
                <p className="hour-description">{h.description}</p>
                <p className="rain">
                  {h.rain === null ? "—" : `${h.rain}%`} rain
                </p>
                <p className="muted">
                  {h.direction} {h.wind}
                </p>
              </article>
            )) || <p className="empty">Hourly forecast unavailable</p>}
        </div>
      </section>
      <section>
        <div className="section-title">
          <h2>Seven-day tides</h2>
          <span className="muted">MLLW · ft</span>
        </div>
        {days.map((day) => {
          const events =
            tideData?.events.filter((e) => dayKey(e.time, zone) === day) || [];
          return (
            <div className="day-row" key={day}>
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  month: "numeric",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(day + "T12:00:00Z"))}
              </strong>
              <div>
                {events.length ? (
                  events.map((e) => (
                    <p key={e.time}>
                      <span className={e.kind === "High" ? "high" : "muted"}>
                        {e.kind === "High" ? "↗ High" : "↘ Low"}
                      </span>{" "}
                      {timeLabel(e.time, zone)} <b>{e.height.toFixed(1)}′</b>
                    </p>
                  ))
                ) : (
                  <p className="muted">No predictions available</p>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <section className="sun">
        <div>
          <span className="muted">☀ Sunrise</span>
          <strong>
            {Number.isFinite(sunTimes.sunrise)
              ? timeLabel(sunTimes.sunrise, zone)
              : "—"}
          </strong>
        </div>
        <div>
          <span className="muted">◒ Sunset</span>
          <strong>
            {Number.isFinite(sunTimes.sunset)
              ? timeLabel(sunTimes.sunset, zone)
              : "—"}
          </strong>
        </div>
      </section>
      <section className="sources">
        <h2>Know your sources</h2>
        <p className="fine">
          Nearby stations describe their own waters. Shoreline exposure, reefs,
          and bays can make your spot different.
        </p>
        <label>
          Tides · NOAA CO-OPS
          <select
            value={location.tideId || ""}
            onChange={(e) => preference("tideId", e.target.value)}
          >
            <option value="">Automatic · nearby reference station</option>
            {tideOptions.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} · {s.distance?.toFixed(0)} km ·{" "}
                {s.type === "S" ? "high/low only" : "curve"}
              </option>
            ))}
          </select>
        </label>
        <p className="fine">
          {tideData
            ? `${tideData.station.name} (${tideData.station.id}) · ${tideData.station.distance?.toFixed(1)} km away · datum MLLW`
            : ""}{" "}
          {tideData?.station.referenceId
            ? `Reference: ${tideData.station.referenceId}.`
            : ""}
        </p>
        <label>
          Ocean · NOAA NDBC
          <select
            value={location.buoyId || ""}
            onChange={(e) => preference("buoyId", e.target.value)}
          >
            <option value="">Automatic · nearby wave-reporting buoy</option>
            {buoyOptions.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} · {s.distance?.toFixed(0)} km
              </option>
            ))}
          </select>
        </label>
        {marineData && (
          <p className="fine">
            {marineData.station.name} ({marineData.station.id}) ·{" "}
            {marineData.station.distance?.toFixed(1)} km · Observed{" "}
            {new Date(marineData.time).toLocaleString("en-US", {
              timeZone: zone,
            })}
            {now - marineData.time > 3 * 3600000 ? " · STALE OBSERVATION" : ""}
            <br />
            Significant wave height and dominant period; not breaking surf
            height.
            {marineData.gustKnots !== null
              ? ` Buoy gusts ${fmt(marineData.gustKnots)} kt.`
              : ""}
          </p>
        )}
        <Status state={ocean} zone={zone} />
        <p className="fine">
          Weather:{" "}
          <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">
            National Weather Service
          </a>{" "}
          · Forecast, not a live observation. All times: {zone}.
        </p>
      </section>
      <footer>
        <span>≈ COASTLINE</span>
        <p>Free public data. Your places stay yours.</p>
        <p className="fine">
          Conditions are informational, not a navigation or safety forecast.
        </p>
      </footer>
    </main>
  );
}
