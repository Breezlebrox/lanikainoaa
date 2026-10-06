import type { WeatherData, WeatherHour, WeatherAlert } from "../models";
import { cached, DAY, HOUR, json } from "./cache";
import { numeric } from "../utils";
export interface RawPeriod {
  startTime: string;
  temperature: number | null;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  probabilityOfPrecipitation?: { value: number | null };
}
export function normalizeHour(p: RawPeriod): WeatherHour {
  const t = numeric(p.temperature);
  return {
    time: Date.parse(p.startTime),
    temperature:
      t === null ? null : p.temperatureUnit === "C" ? (t * 9) / 5 + 32 : t,
    description: p.shortForecast,
    wind: p.windSpeed,
    direction: p.windDirection,
    rain: numeric(p.probabilityOfPrecipitation?.value),
  };
}
export async function weather(lat: number, lon: number, force = false) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return cached<WeatherData>(
    `weather:${key}`,
    HOUR / 2,
    async () => {
      const point = await cached(`point:${key}`, 7 * DAY, () =>
        json<{ properties: { forecastHourly: string; timeZone: string } }>(
          `https://api.weather.gov/points/${key}`,
        ),
      );
      const r = await json<{ properties: { periods: RawPeriod[] } }>(
        point.data.properties.forecastHourly,
      );
      return {
        hours: r.properties.periods.map(normalizeHour),
        timezone: point.data.properties.timeZone,
      };
    },
    force,
  );
}
export async function alerts(lat: number, lon: number, force = false) {
  return cached<WeatherAlert[]>(
    `alerts:${lat},${lon}`,
    5 * 60000,
    async () => {
      const r = await json<{
        features: {
          id: string;
          properties: {
            headline: string;
            description: string;
            severity: string;
          };
        }[];
      }>(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
      return r.features.map((a) => ({
        id: a.id,
        title: a.properties.headline,
        description: a.properties.description,
        severity: a.properties.severity,
      }));
    },
    force,
  );
}
