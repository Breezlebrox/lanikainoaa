import type { Station, TideData, TidePrediction, TideEvent } from "../models";
import { cached, DAY, json, read, write } from "./cache";
import { numeric } from "../utils";
interface RawStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  reference_id: string;
  timezonecorr: number;
}
export async function tideStations() {
  return cached("tide-stations", 30 * DAY, async () => {
    const r = await json<{ stations: RawStation[] }>(
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions",
    );
    return r.stations.map(
      (s) =>
        ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lng,
          type: s.type,
          referenceId: s.reference_id,
          timezoneOffset: s.timezonecorr,
        }) satisfies Station,
    );
  });
}
export function normalizePredictions(raw: {
  predictions?: { t: string; v: string; type?: string }[];
  error?: { message: string };
}) {
  if (raw.error) throw new Error(raw.error.message);
  if (!Array.isArray(raw.predictions))
    throw new Error("No tide predictions returned");
  return raw.predictions.flatMap((p) => {
    const height = numeric(p.v),
      time = Date.parse(p.t.replace(" ", "T") + "Z");
    return height === null || !Number.isFinite(time)
      ? []
      : [
          {
            time,
            height,
            ...(p.type === "H" || p.type === "L"
              ? { kind: p.type === "H" ? ("High" as const) : ("Low" as const) }
              : {}),
          },
        ];
  });
}
export async function tides(station: Station, force = false) {
  const now = new Date(),
    start = new Date(now.getTime() - DAY),
    end = new Date(now.getTime() + 8 * DAY);
  const date = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
  try {
    const result = await cached<TideData>(
      `tide:${station.id}:${date(now)}`,
      6 * 3600000,
      async () => {
        const get = async (interval: string) =>
          normalizePredictions(
            await json(
              `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${new URLSearchParams({ product: "predictions", application: "CoastlinePWA", begin_date: date(start), end_date: date(end), datum: "MLLW", station: station.id, time_zone: "gmt", units: "english", interval, format: "json" })}`,
            ),
          );
        const events = (await get("hilo")) as TideEvent[];
        const samples: TidePrediction[] =
          station.type === "S" ? [] : await get("6");
        return { samples, events, datum: "MLLW", station };
      },
      force,
    );
    write(`tide-latest:${station.id}`, result);
    return result;
  } catch (error) {
    const old = read<import("../models").Cached<TideData>>(
      `tide-latest:${station.id}`,
    );
    if (old) return { ...old, stale: true };
    throw error;
  }
}
