/**
 * Aprendizaje con confirmación: Lumi propone hechos ("¿Guardo que Acme renueva en
 * enero?") y solo los que confirmas se guardan en 90-Lumi/memoria/.
 */
import { stripAccents, type FactProposal } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { getSettings } from "../settings";
import { getState, mutateState } from "../state";
import { emitChanged, uid } from "../util";

const norm = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function proposeFact(brain: Brain | null, text: string, topic = "General", origin: string | null = null, mode: string | null = null): FactProposal | null {
  if (!getSettings().learn) return null;
  const t = text.trim();
  if (t.length < 4) return null;
  const n = norm(t);
  const known = [...(brain?.facts().map((f) => f.text) ?? []), ...getState().pendingFacts.map((p) => p.text)];
  if (known.some((k) => norm(k) === n)) return null;
  const p: FactProposal = { id: uid(), text: t, topic: topic.trim() || "General", origin, mode, createdAt: new Date().toISOString() };
  mutateState((s) => {
    s.pendingFacts.push(p);
    s.pendingFacts = s.pendingFacts.slice(-50);
  });
  emitChanged();
  return p;
}

export async function confirmFact(brain: Brain, id: string, keep: boolean): Promise<void> {
  const p = getState().pendingFacts.find((x) => x.id === id);
  mutateState((s) => {
    s.pendingFacts = s.pendingFacts.filter((x) => x.id !== id);
  });
  if (p && keep) await brain.addFact(p.text, p.topic, p.origin, p.mode ?? null);
  emitChanged();
}
