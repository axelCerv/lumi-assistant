/** Ayudas de la interfaz para los modos (Trabajo, Escuela, Personal…). */
import { createContext, useContext } from "react";
import { enabledModes, inScope, modeById, modeLook, type AppSnapshot, type AvatarConfig, type Meeting, type Mode } from "@lumi/shared";

export interface ModeView {
  /** Vista «Todo»: se ve lo de todos los modos. */
  all: boolean;
  setAll: (v: boolean) => void;
}

export const ModeViewContext = createContext<ModeView>({ all: false, setAll: () => {} });

export function useModeView(): ModeView {
  return useContext(ModeViewContext);
}

export interface ModeInfo {
  /** Modos activos en Ajustes. */
  modes: Mode[];
  /** Hay más de un modo: se muestran los controles de modo. */
  multi: boolean;
  active: Mode | null;
  /** ¿Se ve este elemento? */
  visible: (itemMode: string | null | undefined) => boolean;
  /** Modo de una reunión (el de su calendario). */
  meetingMode: (m: Meeting) => string | null;
  /** ¿Este modo está activo en Ajustes? */
  has: (id: string) => boolean;
}

export function modeInfo(snap: AppSnapshot, all = false): ModeInfo {
  const cfg = snap.settings.modes;
  const modes = enabledModes(cfg);
  const multi = modes.length > 1;
  const active = modeById(cfg, snap.mode.id);
  return {
    modes,
    multi,
    active,
    visible: (m) => !multi || inScope(m, snap.mode.id, all),
    meetingMode: (m) => cfg.calendarios[m.calendar] ?? null,
    has: (id) => modes.some((m) => m.id === id),
  };
}

/** El look de Lumi ahora: base → parche del modo → ropa de reunión (si toca). */
export function currentLook(snap: AppSnapshot | null, base: AvatarConfig, meetingSoon = false): AvatarConfig {
  if (!snap) return base;
  const look = modeLook(base, snap.settings.modes, snap.mode.id);
  return meetingSoon && base.reunion ? { ...look, prenda: base.reunion } : look;
}

/** Fondo suave del color de un modo (para chips). */
export function tint(hex: string, alpha = 0.16): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(91,87,209,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** «mm:ss» que falta para una fecha. */
export function countdown(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** ¿La IA está lista? (nunca para menores). */
export function aiReady(snap: AppSnapshot): boolean {
  const ai = snap.settings.ai;
  if (snap.settings.ageGroup === "menor" || !ai.enabled) return false;
  return ai.provider === "claude" ? snap.keys.claude : snap.keys.gemini && ai.geminiPrivacyAccepted;
}
