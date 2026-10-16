/** Reglas de .lumiignore: carpetas o archivos que Lumi nunca lee. */
import { promises as fs } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

const ALWAYS = [".obsidian/**", ".trash/**", ".git/**", "**/.*.lumi-tmp", "node_modules/**"];

export class IgnoreRules {
  private matchers: ((p: string) => boolean)[] = [];

  constructor(private root: string) {
    this.set([]);
  }

  private set(patterns: string[]): void {
    const all = [...ALWAYS, ...patterns];
    this.matchers = all.map((p) => picomatch(p, { dot: true, nocase: true }));
  }

  async load(): Promise<void> {
    let text = "";
    try {
      text = await fs.readFile(path.join(this.root, ".lumiignore"), "utf8");
    } catch {
      /* sin archivo: solo las reglas básicas */
    }
    const patterns: string[] = [];
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      line = line.replace(/^\/+/, "");
      if (line.endsWith("/")) patterns.push(`${line}**`);
      else {
        patterns.push(line);
        if (!line.includes("*") && !line.endsWith(".md")) patterns.push(`${line}/**`);
      }
    }
    this.set(patterns);
  }

  isIgnored(rel: string): boolean {
    const p = rel.split(path.sep).join("/");
    return this.matchers.some((m) => m(p));
  }
}
