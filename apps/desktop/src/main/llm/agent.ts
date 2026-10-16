/** Conversación con la IA: contexto + herramientas + respuesta que se va escribiendo. */
import type { ActiveMode, ChatAction, ChatMessage, ChatResponse, ChatSource, ContentBlock, LLMProvider, Meeting, Message } from "@lumi/shared";
import { enabledModes, modeById, modeCategories, taskGrouping } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { buildContext } from "../memory/context-builder";
import { getSettings } from "../settings";
import { requireProvider } from "./provider";
import { executeTool, toolsFor, type ToolContext } from "./tools";
import { today } from "../vault/vault";

const MAX_ROUNDS = 6;

function modeRules(mode: ActiveMode | null | undefined): string {
  const s = getSettings();
  const modes = enabledModes(s.modes);
  if (modes.length < 2 || !mode) return "";
  const m = modeById(s.modes, mode.id);
  const lines = [
    `- Tienes modos (${modes.map((x) => `${x.nombre} ${x.icono}`).join(", ")}). Ahora estás en modo ${m?.nombre ?? mode.id}: sigue la sección «Cómo ser en el modo…» del contexto. Si el usuario te pide cambiar de modo, usa cambiar_modo.`,
    "- Solo ves lo del modo activo y lo compartido. Si te preguntan por algo de otro modo y no aparece, dilo y ofrece cambiar de modo; no inventes.",
  ];
  if (mode.id === "escuela") {
    lines.push(
      "- En modo Escuela eres tutora: explica con pasos y ejemplos, pregunta qué entendió antes de dar la respuesta completa, revisa lo que el estudiante escribió y ayuda con esquemas e ideas. No redactes trabajos finales para entregarlos como propios, salvo que la materia diga «IA permitida por el profesor: sí», y aun así anímalo a hacerlo con sus palabras.",
      "- Contra la procrastinación: para entregas grandes o exámenes propone un plan con plan_de_estudio (primer paso de 5 minutos hoy). Para estudiar, prefiere preguntar (tarjetas con crear_tarjetas) a solo resumir.",
    );
  }
  if (mode.id === "personal") lines.push("- En modo Personal eres cálida, como una coach: cuida su descanso y nunca le hagas sentir mal por lo pendiente.");
  if (taskGrouping(m) === "categorias") {
    const cats = modeCategories(m);
    lines.push(
      `- En este modo los pendientes no llevan cliente ni proyecto: al crearlos usa ${mode.id === "escuela" ? "«materia» o " : ""}«categoria»${cats.length ? ` (${cats.join(", ")}, o una nueva si ninguna encaja)` : ""}.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function systemPrompt(context: string, mode?: ActiveMode | null): string {
  const learn = getSettings().learn;
  return `Eres Lumi, un asistente personal de escritorio: amable, cálido y práctico. Hablas en español de México, en tono cercano, con respuestas breves y accionables (usa listas cortas solo si ayudan).

Conoces el "cerebro" del usuario: su vault de Obsidian con reuniones, clientes, proyectos, personas, diario, pendientes y memoria. Ayudas a organizar el día, recordar lo acordado y sugerir qué hacer.

Reglas:
- Usa solo la información del contexto, de la conversación y de tus herramientas. Si no sabes algo, búscalo con buscar_en_vault o dilo con honestidad. No inventes reuniones, personas, fechas ni acuerdos.
- Cuando uses información de una nota, menciona su título entre corchetes dobles, por ejemplo [[Revisión trimestral Acme]].
- Si el usuario pide anotar o recordar algo, usa crear_pendiente o agendar_recordatorio. Fechas en formato AAAA-MM-DD; hoy es ${today()}.
${learn ? "- Si el usuario comparte un dato durable que valga la pena recordar y que no esté en la memoria, usa proponer_recuerdo (máximo uno por respuesta). Nunca propongas datos sensibles (salud, contraseñas, cuentas bancarias)." : "- El aprendizaje está apagado: no uses proponer_recuerdo."}
- Tú eres una esferita que flota en la pantalla y el usuario puede vestirte. Si te pide cambiar tu apariencia (ropa, cabello, lentes, accesorios, colores), usa cambiar_apariencia. Nunca cambies tu apariencia por tu cuenta. Puedes mencionar tu look con naturalidad, sin insistir.
- Después de usar una herramienta, responde al usuario de forma natural; no menciones nombres de herramientas.
- Si el usuario expresa angustia seria, responde con calidez, sin juzgar, y sugiere hablar con alguien de confianza o con una línea de ayuda local.
${modeRules(mode)}
# Contexto del usuario
${context}`;
}

function historyToMessages(history: ChatMessage[]): Message[] {
  const out: Message[] = [];
  for (const m of history.filter((x) => !x.error).slice(-14)) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && typeof last.content === "string") last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export interface ChatResult {
  content: string;
  sources: ChatSource[];
  actions: ChatAction[];
}

export async function runChat(opts: {
  brain: Brain | null;
  meetings: Meeting[];
  history: ChatMessage[];
  userText: string;
  onDelta: (fullText: string) => void;
  provider?: LLMProvider;
  /** Modo activo (filtra el contexto y cambia el tono). */
  mode?: ActiveMode | null;
  /** Vista «Todo». */
  all?: boolean;
}): Promise<ChatResult> {
  const s = getSettings();
  const modeDef = opts.mode ? modeById(s.modes, opts.mode.id) : null;
  const provider = opts.provider ?? requireProvider({ proveedor: modeDef?.ia.proveedor });
  const ctx = await buildContext(opts.brain, opts.meetings, opts.userText, { mode: opts.mode, all: opts.all });
  const toolCtx: ToolContext = {
    brain: opts.brain,
    meetings: opts.meetings,
    sources: [...ctx.sources],
    actions: [],
    origin: `[[${today()}]]`,
    mode: opts.mode?.id ?? null,
  };
  const messages: Message[] = [...historyToMessages(opts.history), { role: "user", content: opts.userText }];
  // si el historial terminaba en "user", se juntan los turnos
  const merged: Message[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") last.content += `\n\n${m.content}`;
    else merged.push(m);
  }

  const system = systemPrompt(ctx.text, opts.mode);
  const tools = toolsFor(s);
  const profile = modeDef?.ia.perfil ?? "inteligente";
  let full = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: ChatResponse | null = null;
    let roundText = "";
    for await (const chunk of provider.stream({ system, messages: merged, tools, profile, maxTokens: 1800 })) {
      if (chunk.type === "text" && chunk.text) {
        roundText += chunk.text;
        opts.onDelta(full + roundText);
      } else if (chunk.type === "done") response = chunk.response ?? null;
    }
    if (!response) break;
    full += roundText;
    if (!response.toolCalls.length) break;

    const assistantBlocks: ContentBlock[] = [];
    if (response.text) assistantBlocks.push({ type: "text", text: response.text });
    for (const tc of response.toolCalls) assistantBlocks.push({ type: "tool_call", id: tc.id, name: tc.name, input: tc.input });
    merged.push({ role: "assistant", content: assistantBlocks, raw: response.raw });

    const results: ContentBlock[] = [];
    for (const tc of response.toolCalls) {
      const r = await executeTool(toolCtx, tc);
      results.push({ type: "tool_result", id: tc.id, name: tc.name, content: r.content, isError: r.isError });
    }
    merged.push({ role: "user", content: results });
    if (full && !full.endsWith("\n")) full += "\n\n";
  }

  // Solo se muestran como fuentes las notas que la respuesta usó o las que buscó/leyó
  const cited = toolCtx.sources.filter((s) => full.includes(s.title) || !ctx.sources.some((c) => c.path === s.path));
  return { content: full.trim() || "Listo.", sources: cited.slice(0, 8), actions: toolCtx.actions };
}
