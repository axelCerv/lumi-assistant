/** Proveedor Gemini (Google) con la clave del usuario (BYOK). */
import { GoogleGenAI, type Content, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider, Message, ToolCall } from "@lumi/shared";
import { LLMError } from "@lumi/shared";
import { uid } from "../util";

function toGemini(messages: Message[]): Content[] {
  return messages.map((m) => {
    // Gemini 3 exige devolver su respuesta original (con "thought signatures")
    if (m.role === "assistant" && m.raw?.provider === "gemini" && m.raw.data) return m.raw.data as Content;
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") return { role, parts: [{ text: m.content }] };
    const parts: Part[] = m.content.map((b) => {
      if (b.type === "text") return { text: b.text };
      if (b.type === "tool_call") return { functionCall: { id: b.id, name: b.name, args: b.input } };
      return { functionResponse: { id: b.id, name: b.name, response: b.isError ? { error: b.content } : { output: b.content } } };
    });
    return { role, parts };
  });
}

function fromParts(parts: Part[], finish?: string): ChatResponse {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const p of parts) {
    if (p.thought) continue;
    if (p.text) text += p.text;
    if (p.functionCall?.name) toolCalls.push({ id: p.functionCall.id ?? uid(), name: p.functionCall.name, input: (p.functionCall.args ?? {}) as Record<string, unknown> });
  }
  const stopReason = toolCalls.length ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end";
  return { text, toolCalls, stopReason, raw: { provider: "gemini", data: { role: "model", parts } satisfies Content } };
}

function wrapError(e: unknown): LLMError {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (status === 400 && /API key/i.test(msg)) return new LLMError("La clave de Gemini no es válida.", 400);
  if (status === 403) return new LLMError("Tu clave de Gemini no tiene permiso para este modelo.", 403);
  if (status === 404) return new LLMError("Ese modelo de Gemini no existe. Revísalo en Ajustes.", 404);
  if (status === 429) return new LLMError("Gemini está saturado o llegaste a tu límite. Intenta en un momento.", 429);
  return new LLMError(`Gemini: ${msg}`, status);
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini" as const;
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private models: { rapido: string; inteligente: string },
    baseUrl?: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
  }

  private params(req: ChatRequest): GenerateContentParameters {
    return {
      model: this.models[req.profile],
      contents: toGemini(req.messages),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: req.maxTokens ?? 1500,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
        ...(req.tools?.length
          ? {
              tools: [
                {
                  functionDeclarations: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parametersJsonSchema: t.parameters,
                  })),
                },
              ],
            }
          : {}),
      },
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      const res: GenerateContentResponse = await this.ai.models.generateContent(this.params(req));
      const cand = res.candidates?.[0];
      return fromParts(cand?.content?.parts ?? [], cand?.finishReason);
    } catch (e) {
      throw wrapError(e);
    }
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const parts: Part[] = [];
    let finish: string | undefined;
    try {
      const it = await this.ai.models.generateContentStream(this.params(req));
      for await (const chunk of it) {
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finish = cand.finishReason;
        for (const p of cand?.content?.parts ?? []) {
          parts.push(p);
          if (p.text && !p.thought) yield { type: "text", text: p.text };
        }
      }
    } catch (e) {
      throw wrapError(e);
    }
    // Junta los fragmentos de texto consecutivos sin perder las firmas
    const merged: Part[] = [];
    for (const p of parts) {
      const last = merged[merged.length - 1];
      if (last && p.text !== undefined && last.text !== undefined && !p.thought && !last.thought && !p.thoughtSignature && !last.functionCall) last.text += p.text;
      else merged.push({ ...p });
    }
    const final = fromParts(merged, finish);
    for (const tc of final.toolCalls) yield { type: "tool_call", toolCall: tc };
    yield { type: "done", response: final };
  }
}
