export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Revisión trimestral Acme" → "revision-trimestral-acme" */
export function slugify(s: string, max = 60): string {
  return (
    stripAccents(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "nota"
  );
}

/** Nombre de archivo seguro (conserva acentos y mayúsculas, como en Obsidian). */
export function safeFileName(s: string, max = 80): string {
  return (
    s
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
      .trim() || "Sin título"
  );
}
