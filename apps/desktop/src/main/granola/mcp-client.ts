/**
 * MCP oficial de Granola (https://mcp.granola.ai/mcp): OAuth en el navegador con
 * registro dinámico de cliente, sin API key. Funciona también en el plan gratis
 * (últimos ~30 días), por eso Lumi guarda todo en el vault.
 */
import { shell } from "electron";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getSecretJson, setSecretJson } from "../secrets";
import { startLoopback } from "../calendar/oauth";
import type { GranolaMeeting } from "./mapper";

const MCP_URL = new URL("https://mcp.granola.ai/mcp");
const CALLBACK_PORT = 47821;

interface Stored {
  redirect?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
}

const load = (): Stored => getSecretJson<Stored>("granola-mcp") ?? {};
const save = (patch: Partial<Stored>) => setSecretJson("granola-mcp", { ...load(), ...patch });

class LumiOAuthProvider implements OAuthClientProvider {
  constructor(
    private redirect: string,
    private onRedirect: (url: URL) => void,
  ) {}
  get redirectUrl() {
    return this.redirect;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Lumi",
      redirect_uris: [this.redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  clientInformation() {
    const s = load();
    // Si cambió el puerto de retorno, hay que registrar de nuevo a Lumi
    return s.redirect === this.redirect ? s.client : undefined;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    save({ client: info, redirect: this.redirect });
  }
  tokens() {
    return load().tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    save({ tokens });
  }
  redirectToAuthorization(url: URL) {
    this.onRedirect(url);
  }
  saveCodeVerifier(v: string) {
    save({ verifier: v });
  }
  codeVerifier() {
    const v = load().verifier;
    if (!v) throw new Error("Falta el verificador de OAuth");
    return v;
  }
}

async function open(provider: OAuthClientProvider): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider });
  const client = new Client({ name: "lumi", version: "0.2.0" });
  await client.connect(transport);
  return { client, transport };
}

/** Conexión interactiva: abre el navegador para que autorices a Lumi. */
export async function connectInteractive(): Promise<Client> {
  let loop;
  try {
    loop = await startLoopback({ host: "127.0.0.1", port: CALLBACK_PORT });
  } catch {
    loop = await startLoopback({ host: "127.0.0.1" });
  }
  const provider = new LumiOAuthProvider(loop.redirectUri, (url) => void shell.openExternal(url.toString()));
  const transport = new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider });
  const client = new Client({ name: "lumi", version: "0.2.0" });
  try {
    await client.connect(transport);
    loop.close();
    return client;
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) {
      loop.close();
      throw e;
    }
  }
  const code = await loop.waitForCode();
  await transport.finishAuth(code);
  return (await open(provider)).client;
}

/** Conexión silenciosa con los tokens guardados (para sincronizar en segundo plano). */
export async function connectSilent(): Promise<Client> {
  const s = load();
  if (!s.tokens || !s.redirect) throw new Error("Granola no está conectado.");
  const provider = new LumiOAuthProvider(s.redirect, () => {
    throw new Error("La sesión de Granola expiró; vuelve a conectar en Ajustes.");
  });
  try {
    return (await open(provider)).client;
  } catch (e) {
    if (e instanceof UnauthorizedError) throw new Error("La sesión de Granola expiró; vuelve a conectar en Ajustes.");
    throw e;
  }
}

export function forgetMcp(): void {
  setSecretJson("granola-mcp", null);
}

/* ----------------------- Herramientas del servidor ----------------------- */

type ToolInfo = { name: string; inputSchema?: { properties?: Record<string, { type?: string; enum?: unknown[]; items?: unknown }>; required?: string[] } };

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] })?.content ?? [];
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

/** Arma argumentos según el esquema que publique el servidor (puede cambiar). */
function argsFor(tool: ToolInfo | undefined, wanted: { range?: string; ids?: string[]; id?: string }): Record<string, unknown> {
  const props = tool?.inputSchema?.properties ?? {};
  const args: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(props)) {
    const enumVals = (p.enum ?? []).map(String);
    if (wanted.range && (enumVals.length || /range|period|time/i.test(name))) {
      const pick = enumVals.find((v) => /30/.test(v)) ?? enumVals.find((v) => /last|month/i.test(v)) ?? wanted.range;
      args[name] = pick;
    } else if (wanted.ids && p.type === "array") args[name] = wanted.ids;
    else if (wanted.id && p.type === "string" && /id/i.test(name)) args[name] = wanted.id;
  }
  if (wanted.ids && !Object.values(args).some(Array.isArray)) args.meeting_ids = wanted.ids;
  if (wanted.id && !Object.keys(args).length) args.meeting_id = wanted.id;
  return args;
}

export interface McpMeetingRef {
  id: string;
  title: string | null;
  date: string | null;
}

/** Extrae reuniones del texto que devuelve list_meetings (JSON, XML o Markdown). */
export function parseMeetingList(text: string): McpMeetingRef[] {
  const out = new Map<string, McpMeetingRef>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : typeof o.meeting_id === "string" ? o.meeting_id : null;
      if (id) {
        const date = [o.date, o.start, o.start_time, o.created_at, o.createdAt].find((x) => typeof x === "string") as string | undefined;
        out.set(id, { id, title: typeof o.title === "string" ? o.title : null, date: date ?? null });
      }
      Object.values(o).forEach(visit);
    }
  };
  try {
    visit(JSON.parse(text));
  } catch {
    /* no es JSON */
  }
  if (!out.size) {
    // <meeting id="…" title="…" date="…"> o líneas con ids
    for (const m of text.matchAll(/<meeting\b([^>]*)>/gi)) {
      const attr = (k: string) => new RegExp(`${k}="([^"]*)"`, "i").exec(m[1])?.[1] ?? null;
      const id = attr("id");
      if (id) out.set(id, { id, title: attr("title"), date: attr("date") ?? attr("start") });
    }
  }
  if (!out.size) {
    for (const line of text.split("\n")) {
      const id = /\b(not_[A-Za-z0-9]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(line)?.[1];
      if (!id || out.has(id)) continue;
      const date = /(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?)/.exec(line)?.[1] ?? null;
      const title = line.replace(id, "").replace(date ?? "", "").replace(/[*_#|>\-–—:()[\]]+/g, " ").replace(/\s+/g, " ").trim() || null;
      out.set(id, { id, title, date });
    }
  }
  return [...out.values()];
}

export async function mcpTools(client: Client): Promise<ToolInfo[]> {
  return (await client.listTools()).tools as ToolInfo[];
}

export async function mcpListMeetings(client: Client): Promise<McpMeetingRef[]> {
  const tools = await mcpTools(client);
  const list = tools.find((t) => t.name === "list_meetings") ?? tools.find((t) => /list.*meeting/i.test(t.name));
  if (!list) throw new Error("El servidor de Granola no ofrece list_meetings.");
  const r = await client.callTool({ name: list.name, arguments: argsFor(list, { range: "last_30_days" }) });
  return parseMeetingList(textOf(r));
}

export async function mcpGetMeeting(client: Client, ref: McpMeetingRef): Promise<GranolaMeeting> {
  const tools = await mcpTools(client);
  const getTool = tools.find((t) => t.name === "get_meetings") ?? tools.find((t) => /get.*meeting/i.test(t.name) && !/transcript/i.test(t.name));
  const trTool = tools.find((t) => t.name === "get_meeting_transcript") ?? tools.find((t) => /transcript/i.test(t.name));
  let details = "";
  if (getTool) details = textOf(await client.callTool({ name: getTool.name, arguments: argsFor(getTool, { ids: [ref.id], id: ref.id }) }));
  let transcript: string | null = null;
  if (trTool) {
    try {
      transcript = textOf(await client.callTool({ name: trTool.name, arguments: argsFor(trTool, { id: ref.id }) })) || null;
    } catch {
      transcript = null;
    }
  }
  // Intenta leer campos si vienen en JSON; si no, guarda el texto tal cual
  let title = ref.title;
  let start = ref.date;
  let attendees: string[] = [];
  let summary = details;
  let notes = "";
  try {
    const j = JSON.parse(details);
    const m = (Array.isArray(j) ? j[0] : Array.isArray(j?.meetings) ? j.meetings[0] : j) as Record<string, unknown>;
    title = (m.title as string) ?? title;
    start = (m.start as string) ?? (m.date as string) ?? (m.created_at as string) ?? start;
    attendees = Array.isArray(m.attendees) ? (m.attendees as unknown[]).map((a) => (typeof a === "string" ? a : String((a as { name?: string; email?: string }).name ?? (a as { email?: string }).email ?? ""))).filter(Boolean) : [];
    summary = String(m.summary ?? m.enhanced_notes ?? m.ai_summary ?? "");
    notes = String(m.notes ?? m.private_notes ?? m.my_notes ?? "");
  } catch {
    const t = /^#\s+(.+)$/m.exec(details)?.[1];
    if (t && !title) title = t.trim();
  }
  return {
    id: ref.id,
    title: title?.trim() || "Reunión",
    start: start && !isNaN(new Date(start).getTime()) ? new Date(start).toISOString() : null,
    durationMin: null,
    attendees,
    summary,
    notes,
    transcript,
  };
}
