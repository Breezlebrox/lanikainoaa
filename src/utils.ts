import tzLookup from "tz-lookup";
import type { Station, TidePrediction } from "./models";
export const feet = (m: number) => m * 3.28084;
export const fahrenheit = (c: number) => (c * 9) / 5 + 32;
export const knots = (ms: number) => ms * 1.94384;
export const numeric = (v: unknown): number | null =>
  v === null ||
  v === undefined ||
  String(v).trim() === "" ||
  !Number.isFinite(Number(v))
    ? null
    : Number(v);
export function distance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const r = Math.PI / 180;
  const dlat = (b.lat - a.lat) * r,
    dlon = (b.lon - a.lon) * r;
  return (
    6371 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2,
      ),
    )
  );
}
export const nearby = (
  stations: Station[],
  point: { lat: number; lon: number },
  radius = 250,
) =>
  stations
    .map((s) => ({ ...s, distance: distance(point, s) }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
export const timezone = (lat: number, lon: number) => tzLookup(lat, lon);
export const timeLabel = (time: number, zone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
export const dayKey = (time: number, zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
export const direction = (deg: number | null) =>
  deg === null
    ? "—"
    : [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ][Math.round(deg / 22.5) % 16];
export function tideNow(samples: TidePrediction[], now = Date.now()) {
  const i = samples.findIndex((s) => s.time >= now);
  if (i <= 0) return null;
  const a = samples[i - 1],
    b = samples[i];
  if (b.time - a.time > 3600000) return null;
  return {
    height:
      a.height + ((b.height - a.height) * (now - a.time)) / (b.time - a.time),
    trend:
      Math.abs(b.height - a.height) < 0.005
        ? "Turning"
        : b.height > a.height
          ? "Rising"
          : "Falling",
  };
}

export function calendarDays(now: number, zone: string, count: number) {
  const date = new Date(dayKey(now, zone) + "T12:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
