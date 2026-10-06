export interface CoastalLocation {
  id: string;
  label: string;
  lat: number;
  lon: number;
  tideId?: string;
  buoyId?: string;
}
export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  referenceId?: string;
  timezoneOffset?: number;
  distance?: number;
}
export interface TidePrediction {
  time: number;
  height: number;
}
export interface TideEvent extends TidePrediction {
  kind: "High" | "Low";
}
export interface TideData {
  samples: TidePrediction[];
  events: TideEvent[];
  datum: "MLLW";
  station: Station;
}
export interface WeatherHour {
  time: number;
  temperature: number | null;
  description: string;
  wind: string;
  direction: string;
  rain: number | null;
}
export interface WeatherData {
  hours: WeatherHour[];
  timezone: string;
}
export interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: string;
}
export interface MarineObservation {
  time: number;
  waveFeet: number | null;
  period: number | null;
  direction: number | null;
  waterF: number | null;
  windKnots: number | null;
  gustKnots: number | null;
  station: Station;
}
export interface Cached<T> {
  data: T;
  fetchedAt: number;
  stale: boolean;
}
