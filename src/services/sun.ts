import SunCalc from "suncalc";
import { dayKey } from "../utils";
export function sun(lat: number, lon: number, zone: string) {
  const day = dayKey(Date.now(), zone);
  const noon = new Date(`${day}T12:00:00Z`);
  const times = SunCalc.getTimes(
    new Date(noon.getTime() - (lon / 15) * 3600000),
    lat,
    lon,
  );
  return { sunrise: times.sunrise.getTime(), sunset: times.sunset.getTime() };
}
