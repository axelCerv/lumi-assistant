/** Modo Personal: pagos, cumpleaños y listas para la interfaz y los avisos. */
import type { PersonalSnapshot } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { FILES } from "../vault/structure";

export function personalSnapshot(brain: Brain | null, now = new Date()): PersonalSnapshot {
  if (!brain) return { payments: [], paymentsPath: FILES.pagos, birthdays: [], lists: [] };
  return {
    payments: brain.payments(now),
    paymentsPath: FILES.pagos,
    birthdays: brain.birthdays(now).filter((b) => b.daysLeft <= 60),
    lists: brain.lists(),
  };
}
