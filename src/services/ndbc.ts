import type { MarineObservation, Station } from "../models";
import { cached, DAY } from "./cache";
import { feet, fahrenheit, knots, numeric } from "../utils";
const proxy = import.meta.env.VITE_NDBC_PROXY_URL?.replace(/\/$/, "");
async function text(path: string) {
  if (!proxy)
    throw new Error("Buoy connection is not configured. See source setup.");
  const r = await fetch(`${proxy}/${path}`, {
    signal: AbortSignal.timeout(18000),
  });
  if (!r.ok) throw new Error(`Buoy service returned ${r.status}`);
  return r.text();
}
export function parseStations(xml: string): Station[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Invalid station metadata");
  return [...doc.querySelectorAll("station")]
    .filter((s) => s.getAttribute("met") === "y")
    .flatMap((s) => {
      const lat = numeric(s.getAttribute("lat")),
        lon = numeric(s.getAttribute("lon"));
      return lat === null || lon === null
        ? []
        : [
            {
              id: s.getAttribute("id")!,
              name: s.getAttribute("name") || s.getAttribute("id")!,
              lat,
              lon,
            },
          ];
    });
}
export async function buoyStations() {
  return cached("buoy-stations", DAY, async () =>
    parseStations(await text("activestations.xml")),
  );
}
export function parseObservation(
  raw: string,
  station: Station,
): MarineObservation {
  const lines = raw.trim().split(/\r?\n/),
    header = lines
      .find((l) => l.startsWith("#YY"))
      ?.replace(/^#/, "")
      .trim()
      .split(/\s+/);
  if (!header) throw new Error("Invalid buoy header");
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const vals = line.trim().split(/\s+/);
    if (vals.length < header.length) continue;
    const field = (key: string) => {
      const value = vals[header.indexOf(key)];
      return value === "MM" ? null : numeric(value);
    };
    const year = field("YY"),
      month = field("MM"),
      day = field("DD"),
      hour = field("hh"),
      minute = field("mm");
    if (
      [year, month, day, hour, minute].some((v) => v === null) ||
      month! < 1 ||
      month! > 12 ||
      day! < 1 ||
      day! > 31 ||
      hour! > 23 ||
      minute! > 59
    )
      continue;
    const time = Date.UTC(year!, month! - 1, day!, hour!, minute!);
    const convert = (key: string, fn: (v: number) => number) => {
      const n = field(key);
      return n === null ? null : fn(n);
    };
    return {
      station,
      time,
      waveFeet: convert("WVHT", feet),
      period: field("DPD"),
      direction: field("MWD"),
      waterF: convert("WTMP", fahrenheit),
      windKnots: convert("WSPD", knots),
      gustKnots: convert("GST", knots),
    };
  }
  throw new Error("No valid buoy observations");
}
export async function marine(station: Station, force = false) {
  return cached(
    `marine:${station.id}`,
    10 * 60000,
    async () =>
      parseObservation(await text(`data/realtime2/${station.id}.txt`), station),
    force,
  );
}
