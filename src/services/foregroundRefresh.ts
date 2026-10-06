/** Only schedules work in the foreground. Already-started requests may finish. */
export function foregroundRefresh(
  load: (force: boolean) => Promise<unknown>,
  tick: () => void,
  connectivity: (online: boolean) => void,
  page: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > = document,
  events: Pick<Window, "addEventListener" | "removeEventListener"> = window,
  isOnline: () => boolean = () => navigator.onLine,
) {
  let disposed = false,
    suspended = false,
    busy = false;
  let pending: boolean | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const visible = () =>
    !disposed && !suspended && page.visibilityState === "visible";
  const request = async (force = false) => {
    if (!visible()) return;
    tick();
    connectivity(isOnline());
    if (busy) {
      pending = pending === true || force;
      return;
    }
    busy = true;
    try {
      await load(force);
    } finally {
      busy = false;
      if (pending !== undefined) {
        const next = pending;
        pending = undefined;
        if (visible() && isOnline()) void request(next);
      }
    }
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    pending = undefined;
  };
  const resume = () => {
    stop();
    if (!visible()) return;
    void request();
    timer = setInterval(() => {
      if (!visible()) return;
      tick();
      if (isOnline()) void request();
    }, 60000);
  };
  const visibility = () => {
    suspended = page.visibilityState !== "visible";
    resume();
  };
  const hide = () => {
    suspended = true;
    stop();
  };
  const show = () => {
    suspended = false;
    resume();
  };
  const online = () => {
    connectivity(isOnline());
    if (isOnline()) void request();
  };
  page.addEventListener("visibilitychange", visibility);
  events.addEventListener("pagehide", hide);
  events.addEventListener("pageshow", show);
  events.addEventListener("online", online);
  events.addEventListener("offline", online);
  resume();
  return {
    refresh: () => request(true),
    dispose: () => {
      disposed = true;
      stop();
      page.removeEventListener("visibilitychange", visibility);
      events.removeEventListener("pagehide", hide);
      events.removeEventListener("pageshow", show);
      events.removeEventListener("online", online);
      events.removeEventListener("offline", online);
    },
  };
}
