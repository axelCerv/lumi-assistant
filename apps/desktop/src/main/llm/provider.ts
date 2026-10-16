/** Elige el proveedor de IA según la configuración y las claves guardadas. */
import type { LLMProvider, ProviderId } from "@lumi/shared";
import { LLMError } from "@lumi/shared";
import { getSettings } from "../settings";
import { getSecret } from "../secrets";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";

/** Mensaje de «Lumi sin IA» (cuenta de menor de edad). */
export const NO_AI_FOR_MINORS =
  "Lumi sin IA: como tienes menos de 18 años, no uso ningún servicio de IA. Todo lo demás (horario, recordatorios, tarjetas, sesiones de estudio) funciona igual.";

/** Qué IA usar en un modo (si el modo la cambia). */
export interface AIOverride {
  proveedor?: ProviderId | null;
}

export function providerFor(id: ProviderId): LLMProvider {
  const s = getSettings();
  if (s.ageGroup === "menor") throw new LLMError(NO_AI_FOR_MINORS);
  const key = getSecret(id);
  if (!key) throw new LLMError(id === "claude" ? "Falta tu clave de Claude (Ajustes → Inteligencia)." : "Falta tu clave de Gemini (Ajustes → Inteligencia).");
  const models = s.ai.models[id];
  return id === "claude" ? new ClaudeProvider(key, models) : new GeminiProvider(key, models);
}

/** ¿Se puede usar IA? (no para menores, ni con la IA apagada). */
export function aiAllowed(): boolean {
  const s = getSettings();
  return s.ageGroup !== "menor" && s.ai.enabled;
}

function chosen(override?: AIOverride): ProviderId {
  return override?.proveedor ?? getSettings().ai.provider;
}

/** El proveedor activo, o null si la IA está apagada, sin clave o el usuario es menor. */
export function activeProvider(override?: AIOverride): LLMProvider | null {
  const s = getSettings();
  if (!aiAllowed()) return null;
  const id = chosen(override);
  if (id === "gemini" && !s.ai.geminiPrivacyAccepted) return null;
  try {
    return providerFor(id);
  } catch {
    return null;
  }
}

export function requireProvider(override?: AIOverride): LLMProvider {
  const s = getSettings();
  if (s.ageGroup === "menor") throw new LLMError(NO_AI_FOR_MINORS);
  if (!s.ai.enabled) throw new LLMError("La IA está apagada en Ajustes.");
  const id = chosen(override);
  if (id === "gemini" && !s.ai.geminiPrivacyAccepted) throw new LLMError("Acepta el aviso de privacidad de Gemini en Ajustes.");
  return providerFor(id);
}

/** Extrae el primer objeto JSON de un texto (por si el modelo agrega algo alrededor). */
export function parseJsonLoose<T>(text: string): T | null {
  const clean = text.replace(/```(?:json)?/g, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}
