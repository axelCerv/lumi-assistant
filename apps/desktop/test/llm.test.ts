import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ClaudeProvider } from "../src/main/llm/claude";
import { GeminiProvider } from "../src/main/llm/gemini";
import { runChat } from "../src/main/llm/agent";
import { Brain } from "../src/main/vault/brain";
import { BrainEmbedder } from "../src/main/index/embeddings";
import { installStructure, FILES } from "../src/main/vault/structure";

type Req = { url: string; body: any };
const requests: Req[] = [];
let server: http.Server;
let base = "";
let root = "";
let data = "";
let brain: Brain;

const sse = (events: [string | null, unknown][]) => events.map(([ev, d]) => `${ev ? `event: ${ev}\n` : ""}data: ${JSON.stringify(d)}\n\n`).join("");

function claudeReply(body: any): string {
  const hasResult = JSON.stringify(body.messages).includes("tool_result");
  const msg = { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
  if (!hasResult) {
    return sse([
      ["message_start", { type: "message_start", message: msg }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Déjame revisar. " } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "buscar_en_vault", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"consulta": "precio Acme"}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_2", name: "crear_pendiente", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"titulo": "Llamar a Acme", "fecha": "2026-10-20", "hora": "10:00", "cliente": "Acme"}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 2 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } }],
      ["message_stop", { type: "message_stop" }],
    ]);
  }
  return sse([
    ["message_start", { type: "message_start", message: msg }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "En [[Revisión trimestral Acme]] quedaron en 12 mil." } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}

function geminiReply(body: any): string {
  const hasResult = JSON.stringify(body.contents).includes("functionResponse");
  if (!hasResult) {
    return sse([
      [null, { candidates: [{ content: { role: "model", parts: [{ text: "Busco en tus notas. " }] } }] }],
      [null, { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "buscar_en_vault", args: { consulta: "precio Acme" } }, thoughtSignature: "firma-secreta" }] }, finishReason: "STOP" }] }],
    ]);
  }
  return sse([[null, { candidates: [{ content: { role: "model", parts: [{ text: "Quedaron en 12 mil pesos." }] }, finishReason: "STOP" }] }]]);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: req.url ?? "", body });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      if (req.url?.startsWith("/v1/messages")) res.end(claudeReply(body));
      else res.end(geminiReply(body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  root = mkdtempSync(path.join(tmpdir(), "lumi-llm-"));
  data = mkdtempSync(path.join(tmpdir(), "lumi-llm-data-"));
  await installStructure(root);
  mkdirSync(path.join(root, "02-Reuniones/2026/10"), { recursive: true });
  writeFileSync(
    path.join(root, "02-Reuniones/2026/10/2026-10-06-revision-acme.md"),
    "---\ntype: reunion\ntitle: Revisión trimestral Acme\ndate: 2026-10-06\n---\n# Revisión trimestral Acme\n\nAcordamos bajar el precio del mantenimiento a 12 mil pesos.\n",
  );
  brain = new Brain(root, data, new BrainEmbedder(), () => {});
  await brain.reindex();
});

afterAll(async () => {
  server.close();
  await brain.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe("Claude: conversación con herramientas (stream)", () => {
  it("busca en el vault, crea el pendiente y responde citando la nota", async () => {
    requests.length = 0;
    const deltas: string[] = [];
    const provider = new ClaudeProvider("sk-test", { rapido: "claude-haiku-5-5", inteligente: "claude-sonnet-5-5" }, base);
    const r = await runChat({ brain, meetings: [], history: [], userText: "¿Qué quedé con Acme sobre el precio? Y recuérdame llamarles el 20.", onDelta: (t) => deltas.push(t), provider });
    expect(r.content).toContain("12 mil");
    expect(r.sources.map((s) => s.title)).toContain("Revisión trimestral Acme");
    expect(r.actions[0]).toMatchObject({ kind: "pendiente", label: "Llamar a Acme" });
    expect(readFileSync(path.join(root, FILES.pendientes), "utf8")).toContain("Tasks.\n\n- [ ] Llamar a [[Acme]] ⏰ 10:00 📅 2026-10-20 #cliente/acme");
    // segunda vuelta: lleva los resultados de las herramientas
    const second = requests[1].body;
    expect(second.model).toBe("claude-sonnet-5-5");
    expect(JSON.stringify(second.messages)).toContain("tool_result");
    expect(JSON.stringify(second.messages)).toContain("12 mil pesos");
    expect(second.system).toContain("Contexto del usuario");
    expect(second.tools.map((t: any) => t.name)).toContain("buscar_en_vault");
    expect(deltas.length).toBeGreaterThan(0);
  });
});

describe("Gemini: conversación con herramientas (stream)", () => {
  it("devuelve la firma de pensamiento y el resultado de la función", async () => {
    requests.length = 0;
    const provider = new GeminiProvider("AIza-test", { rapido: "gemini-3.5-flash-lite", inteligente: "gemini-3.8-flash" }, base);
    const r = await runChat({ brain, meetings: [], history: [], userText: "¿Qué quedé con Acme sobre el precio?", onDelta: () => {}, provider });
    expect(r.content).toContain("12 mil pesos");
    expect(requests[0].url).toContain("gemini-3.8-flash:streamGenerateContent");
    const second = requests[1].body;
    const modelTurn = second.contents.find((c: any) => c.role === "model");
    expect(JSON.stringify(modelTurn)).toContain("firma-secreta");
    expect(JSON.stringify(second.contents)).toContain("functionResponse");
    expect(second.tools[0].functionDeclarations.length).toBeGreaterThan(3);
    expect(second.systemInstruction).toBeTruthy();
  });
});

describe("respuesta en JSON (perfil rápido)", () => {
  it("Claude chat() sin stream", async () => {
    const s2 = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text: '{"titulo":"Pagar luz"}' }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      });
    });
    await new Promise<void>((r) => s2.listen(0, "127.0.0.1", () => r()));
    const p = new ClaudeProvider("k", { rapido: "a", inteligente: "b" }, `http://127.0.0.1:${(s2.address() as AddressInfo).port}`);
    const r = await p.chat({ system: "s", messages: [{ role: "user", content: "x" }], profile: "rapido", json: true });
    expect(JSON.parse(r.text).titulo).toBe("Pagar luz");
    s2.close();
  });
});
