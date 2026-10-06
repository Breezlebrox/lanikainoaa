import type { Cached } from "../models";
const PREFIX = "coastline:v1:";
export function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) || "null");
  } catch {
    return null;
  }
}
export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export async function cached<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  force = false,
): Promise<Cached<T>> {
  const old = read<Cached<T>>(key);
  if (old && !force && Date.now() - old.fetchedAt < ttl)
    return { ...old, stale: false };
  try {
    const result = {
      data: await loader(),
      fetchedAt: Date.now(),
      stale: false,
    };
    write(key, result);
    return result;
  } catch (e) {
    if (old) return { ...old, stale: true };
    throw e;
  }
}
export async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(18000),
  });
  if (!r.ok) throw new Error(`Service returned ${r.status}`);
  return r.json();
}
export const HOUR = 3600000,
  DAY = 24 * HOUR;
