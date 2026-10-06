import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { foregroundRefresh } from "../src/services/foregroundRefresh";
import { cached } from "../src/services/cache";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup(load = vi.fn(async (_force: boolean) => {})) {
  const page = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const events = new EventTarget();
  let online = true;
  const tick = vi.fn();
  const controller = foregroundRefresh(
    load,
    tick,
    vi.fn(),
    page,
    events,
    () => online,
  );
  return {
    page,
    events,
    load,
    tick,
    controller,
    setOnline: (value: boolean) => {
      online = value;
      events.dispatchEvent(new Event(value ? "online" : "offline"));
    },
    hide: () => {
      page.visibilityState = "hidden";
      page.dispatchEvent(new Event("visibilitychange"));
    },
    show: () => {
      page.visibilityState = "visible";
      page.dispatchEvent(new Event("visibilitychange"));
    },
  };
}
it("checks on entry and each visible minute, with no hidden timer", async () => {
  const x = setup();
  await vi.advanceTimersByTimeAsync(120000);
  expect(x.load).toHaveBeenCalledTimes(3);
  expect(x.load).toHaveBeenLastCalledWith(false);
  x.hide();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(600000);
  expect(x.load).toHaveBeenCalledTimes(3);
  x.show();
  expect(x.load).toHaveBeenCalledTimes(4);
  x.controller.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("checks on visible reconnect but never on hidden reconnect", async () => {
  const x = setup();
  await vi.advanceTimersByTimeAsync(0);
  x.setOnline(false);
  await vi.advanceTimersByTimeAsync(120000);
  expect(x.load).toHaveBeenCalledTimes(1);
  x.setOnline(true);
  expect(x.load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(0);
  x.hide();
  x.setOnline(false);
  x.setOnline(true);
  expect(x.load).toHaveBeenCalledTimes(2);
  x.controller.dispose();
});
it("manual force applies only to that refresh", async () => {
  const x = setup();
  await vi.advanceTimersByTimeAsync(0);
  await x.controller.refresh();
  expect(x.load).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(x.load).toHaveBeenLastCalledWith(false);
  x.controller.dispose();
});
it("coalesces overlapping requests and drops queued work when hidden", async () => {
  let finish!: () => void;
  const load = vi.fn(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const x = setup(load);
  await vi.advanceTimersByTimeAsync(120000);
  void x.controller.refresh();
  expect(load).toHaveBeenCalledTimes(1);
  x.hide();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(1);
  x.controller.dispose();
});
it("handles page cache suspension and cleans all event listeners", async () => {
  const x = setup();
  await vi.advanceTimersByTimeAsync(0);
  x.events.dispatchEvent(new Event("pagehide"));
  expect(vi.getTimerCount()).toBe(0);
  x.events.dispatchEvent(new Event("pageshow"));
  expect(x.load).toHaveBeenCalledTimes(2);
  x.controller.dispose();
  x.show();
  x.setOnline(true);
  expect(x.load).toHaveBeenCalledTimes(2);
});
it("uses fresh cache without fetching, then refreshes at expiry", async () => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  const source = vi.fn(async () => 42);
  const x = setup(
    vi.fn(async (force: boolean) => {
      await cached("weather", 300000, source, force);
    }),
  );
  await vi.advanceTimersByTimeAsync(240000);
  expect(source).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(source).toHaveBeenCalledTimes(2);
  x.controller.dispose();
});
it("does not start expired-cache network work while hidden", async () => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  await cached("wave", 1, async () => 7);
  vi.stubGlobal("document", { visibilityState: "hidden" });
  const loader = vi.fn(async () => 8);
  const result = await cached("wave", 1, loader, true);
  expect(loader).not.toHaveBeenCalled();
  expect(result).toMatchObject({ data: 7, stale: true });
});
