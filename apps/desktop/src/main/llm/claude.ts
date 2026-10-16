/** Proveedor Claude (Anthropic) con la clave del usuario (BYOK). */
import Anthropic from "@anthropic-ai/sdk";
import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider, Message, ToolCall } from "@lumi/shared";
import { LLMError } from "@lumi/shared";

type AMessage = Anthropic.Messages.MessageParam;
type ABlock = Anthropic.Messages.ContentBlockParam;

function toAnthropic(messages: Message[]): AMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const blocks: ABlock[] = m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_call") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      return { type: "tool_result", tool_use_id: b.id, content: b.content, is_error: b.isError };
    });
    return { role: m.role, content: blocks };
  });
}

function fromAnthropic(msg: Anthropic.Messages.Message): ChatResponse {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const b of msg.content) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
  }
  const stopReason =
    msg.stop_reason === "tool_use" ? "tool_use" : msg.stop_reason === "max_tokens" ? "max_tokens" : msg.stop_reason === "end_turn" ? "end" : "other";
  return { text, toolCalls, stopReason };
}

function wrapError(e: unknown): LLMError {
  if (e instanceof Anthropic.APIError) {
    const status = e.status;
    const msg =
      status === 401
        ? "La clave de Claude no es válida."
        : status === 429
          ? "Claude está saturado o llegaste a tu límite. Intenta en un momento."
          : status === 404
            ? "Ese modelo de Claude no existe o tu cuenta no tiene acceso. Revísalo en Ajustes."
            : `Claude respondió ${status ?? ""}: ${e.message}`;
    return new LLMError(msg, status);
  }
  return new LLMError(e instanceof Error ? e.message : String(e));
}

export class ClaudeProvider implements LLMProvider {
  readonly id = "claude" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private models: { rapido: string; inteligente: string },
    baseURL?: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000, ...(baseURL ? { baseURL } : {}) });
  }

  private params(req: ChatRequest): Anthropic.Messages.MessageCreateParamsNonStreaming {
    const system = req.json ? `${req.system}\n\nResponde únicamente con JSON válido, sin texto adicional ni bloques de código.` : req.system;
    return {
      model: this.models[req.profile],
      max_tokens: req.maxTokens ?? 1500,
      system,
      messages: toAnthropic(req.messages),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
            })),
          }
        : {}),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      const msg = await this.client.messages.create(this.params(req));
      return fromAnthropic(msg);
    } catch (e) {
      throw wrapError(e);
    }
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    try {
      const s = this.client.messages.stream(this.params(req));
      for await (const ev of s) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", text: ev.delta.text };
      }
      const final = fromAnthropic(await s.finalMessage());
      for (const tc of final.toolCalls) yield { type: "tool_call", toolCall: tc };
      yield { type: "done", response: final };
    } catch (e) {
      throw wrapError(e);
    }
  }
}
