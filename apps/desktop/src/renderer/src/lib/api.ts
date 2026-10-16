import { useEffect, useState } from "react";
import type { AppSnapshot, LumiEvents } from "@lumi/shared";

export const lumi = window.lumi;

/** La foto del estado de Lumi, siempre al día. */
export function useSnapshot(): AppSnapshot | null {
  const [snap, setSnap] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    lumi.getSnapshot().then((s) => alive && setSnap(s));
    const off = lumi.on("snapshot", (s) => alive && setSnap(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return snap;
}

export function useEvent<K extends keyof LumiEvents>(event: K, cb: (p: LumiEvents[K]) => void): void {
  useEffect(() => lumi.on(event, cb), [event, cb]);
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
