/**
 * API pública de Granola (planes Business/Enterprise): clave grn_… del usuario.
 * GET /v1/notes y GET /v1/notes/{id}?include=transcript
 */
import type { GranolaMeeting } from "./mapper";

const BASE = "https://public-api.granola.ai/v1";

type Json = Record<string, unknown>;

async function get(path: string, key: string): Promise<Json> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error("La clave de Granola no es válida o no tiene acceso.");
    if (!res.ok) throw new Error(`Granola respondió ${res.status}`);
    return (await res.json()) as Json;
  }
  throw new Error("Granola está limitando las peticiones; intenta más tarde.");
}

export interface NoteRef {
  id: string;
  title: string;
  createdAt: string | null;
}

const s = (v: unknown) => (typeof v === "string" ? v : null);

export async function listNotes(key: string, createdAfter: string | null): Promise<NoteRef[]> {
  const out: NoteRef[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams();
    if (createdAfter) q.set("created_after", createdAfter);
    if (cursor) q.set("cursor", cursor);
    const json = await get(`/notes${q.size ? `?${q}` : ""}`, key);
    const notes = Array.isArray(json.notes) ? (json.notes as Json[]) : [];
    for (const n of notes) {
      const id = s(n.id);
      if (id) out.push({ id, title: s(n.title) ?? "Reunión", createdAt: s(n.created_at) ?? s(n.createdAt) });
    }
    cursor = s(json.cursor);
    if (!json.hasMore || !cursor) break;
  }
  return out;
}

function transcriptText(t: unknown): string | null {
  if (!Array.isArray(t)) return typeof t === "string" ? t : null;
  return (t as Json[])
    .map((e) => {
      const sp = (e.speaker ?? {}) as Json;
      const who = s(sp.diarization_label) ?? (sp.source === "microphone" ? "Yo" : sp.source === "speaker" ? "Otros" : s(sp.name) ?? "—");
      return `**${who}:** ${s(e.text) ?? ""}`;
    })
    .join("\n");
}

function people(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .map((p) => (typeof p === "string" ? p : s((p as Json)?.name) ?? s((p as Json)?.email) ?? ""))
    .filter(Boolean);
}

export async function getMeeting(key: string, ref: NoteRef): Promise<GranolaMeeting> {
  let json: Json;
  try {
    json = await get(`/notes/${encodeURIComponent(ref.id)}?include=transcript`, key);
  } catch (e) {
    // Transcripción demasiado grande: se trae la nota sin ella
    json = await get(`/notes/${encodeURIComponent(ref.id)}`, key).catch(() => {
      throw e;
    });
  }
  const start = s(json.start_time) ?? s(json.started_at) ?? s(json.created_at) ?? ref.createdAt;
  const end = s(json.end_time) ?? s(json.ended_at);
  const duration = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : null;
  return {
    id: ref.id,
    title: s(json.title) ?? ref.title,
    start,
    durationMin: duration && duration > 0 ? duration : null,
    attendees: people(json.attendees ?? json.participants),
    summary: s(json.summary_markdown) ?? s(json.summary) ?? "",
    notes: s(json.notes_markdown) ?? s(json.notes) ?? s(json.private_notes) ?? "",
    transcript: transcriptText(json.transcript),
  };
}
