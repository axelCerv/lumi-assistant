/**
 * Capa de IA multi-proveedor. Cada proveedor (Claude, Gemini…) traduce este
 * formato común a su API. Las herramientas se definen una sola vez.
 */
import type { ProviderId } from "./schemas.ts";

export type Profile = "rapido" | "inteligente";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; content: string; isError?: boolean };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  /**
   * Respuesta original del proveedor (p. ej. Gemini 3 exige devolver sus
   * "thought signatures" tal cual en la siguiente vuelta).
   */
  raw?: { provider: ProviderId; data: unknown };
}

/** Esquema JSON (subset) de los parámetros de una herramienta. */
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatRequest {
  system: string;
  messages: Message[];
  tools?: ToolDef[];
  profile: Profile;
  maxTokens?: number;
  /** Pide una respuesta en JSON puro. */
  json?: boolean;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens" | "other";
  raw?: { provider: ProviderId; data: unknown };
}

export interface ChatChunk {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: ToolCall;
  response?: ChatResponse;
}

export interface LLMProvider {
  id: ProviderId;
  /** Respuesta completa (con llamadas a herramientas si las hay). */
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** Respuesta por partes, para mostrar el texto mientras se escribe. */
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}
