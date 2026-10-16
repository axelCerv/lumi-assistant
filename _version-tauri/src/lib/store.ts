import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { normalizeAvatar } from "./avatar";
import type { LumiData, MeetingsCache, Settings, Tag } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  userName: "",
  onboarded: false,
  useAI: true,
  model: "claude-sonnet-5-5",
  learn: true,
  meetingLeadMin: 10,
  calendars: [],
  dismissedSuggestions: [],
  lastGreeting: null,
  lastSuggestionCheck: null,
  systemNotifications: true,
};

/** Completa lo que falte para que datos viejos o vacíos siempre tengan la forma correcta. */
export function normalize(raw: unknown): LumiData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LumiData>;
  return {
    version: 1,
    tasks: Array.isArray(r.tasks) ? r.tasks : [],
    routines: Array.isArray(r.routines) ? r.routines : [],
    memories: Array.isArray(r.memories) ? r.memories : [],
    chat: Array.isArray(r.chat) ? r.chat : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    avatar: normalizeAvatar(r.avatar),
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
  };
}

export async function loadData(): Promise<{ rev: number; data: LumiData }> {
  const snap = await invoke<{ rev: number; data: unknown }>("get_data");
  return { rev: snap.rev, data: normalize(snap.data) };
}

/**
 * Cambia los datos de forma segura: lee lo último, aplica `fn` y guarda.
 * Si otra ventana guardó en medio, vuelve a intentar con los datos nuevos.
 */
export async function updateData(fn: (d: LumiData) => void): Promise<LumiData> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { rev, data } = await loadData();
    fn(data);
    try {
      await invoke("save_data", { data, rev });
      return data;
    } catch (e) {
      if (String(e).includes("conflict")) continue;
      throw e;
    }
  }
  throw new Error("No pude guardar los cambios. Intenta de nuevo.");
}

/** Datos siempre al día en cualquier ventana. */
export function useLumiData(): LumiData | null {
  const [data, setData] = useState<LumiData | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadData()
        .then((s) => alive && setData(s.data))
        .catch(console.error);
    refresh();
    const un = listen("lumi://data", refresh);
    return () => {
      alive = false;
      un.then((f) => f());
    };
  }, []);
  return data;
}

export function useMeetings(): MeetingsCache {
  const [cache, setCache] = useState<MeetingsCache>({ meetings: [], status: [], updatedAt: null });
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      invoke<MeetingsCache | null>("get_meetings")
        .then((m) => alive && m && Array.isArray(m.meetings) && setCache(m))
        .catch(console.error);
    refresh();
    const un = listen("lumi://meetings", refresh);
    return () => {
      alive = false;
      un.then((f) => f());
    };
  }, []);
  return cache;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function sameTag(a: Tag, b: Tag): boolean {
  return a.kind === b.kind && a.name.toLowerCase() === b.name.toLowerCase();
}

/** Agrega etiquetas nuevas a la lista de etiquetas conocidas. */
export function rememberTags(data: LumiData, tags: Tag[]): void {
  for (const t of tags) {
    if (!data.tags.some((k) => sameTag(k, t))) data.tags.push({ name: t.name, kind: t.kind });
  }
}
