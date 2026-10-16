/**
 * Herramientas de Lumi para la IA. Se definen una vez (esquema JSON común) y cada
 * proveedor las traduce a su formato de "tool/function calling".
 */
import type { ChatAction, ChatSource, ManualDuration, Meeting, Settings, Tag, TaskDraft, ToolCall, ToolDef } from "@lumi/shared";
import {
  ACCESSORIES,
  BODIES,
  COLORS,
  EYE_COLORS,
  FACIALS,
  FRAMES,
  GLASSES,
  HAIR_COLORS,
  HAIRS,
  OUTFITS,
  addDays,
  applyAvatarPatch,
  dayKey,
  describeAvatar,
  enabledModes,
  modeById,
  modeCategories,
  slugify,
  startOfDay,
  whenLabel,
} from "@lumi/shared";
import { getSettings, updateSettings } from "../settings";
import type { Brain } from "../vault/brain";
import { proposeFact } from "../memory/facts";
import { rememberCategory, setMode } from "../modes";
import { createStudyPlan } from "../school";
import { startFocus } from "../school/study";
import { errorText } from "../util";

export const LUMI_TOOLS: ToolDef[] = [
  {
    name: "buscar_en_vault",
    description:
      "Busca en las notas del usuario (reuniones, clientes, proyectos, diario, memoria) por texto y significado. Úsala para responder preguntas sobre lo que el usuario ha hablado, decidido o anotado.",
    parameters: {
      type: "object",
      properties: { consulta: { type: "string", description: "Qué buscar, en lenguaje natural" } },
      required: ["consulta"],
    },
  },
  {
    name: "leer_nota",
    description: "Lee el contenido completo de una nota del vault por su ruta o nombre (por ejemplo «02-Reuniones/2026/10/2026-10-13-revision-acme.md» o «Acme»).",
    parameters: {
      type: "object",
      properties: { nota: { type: "string", description: "Ruta o nombre de la nota" } },
      required: ["nota"],
    },
  },
  {
    name: "listar_pendientes",
    description: "Lista los pendientes del usuario. Filtro opcional por periodo y por cliente, proyecto, materia o categoría.",
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoy", "atrasados", "semana", "todos"], description: "Periodo" },
        etiqueta: { type: "string", description: "Nombre de un cliente, proyecto, materia o categoría (opcional)" },
      },
    },
  },
  {
    name: "proximas_reuniones",
    description: "Lista las reuniones del calendario de los próximos 7 días.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "crear_pendiente",
    description:
      "Crea un pendiente en el vault (con aviso si tiene fecha). Úsala cuando el usuario pida anotar algo o cuando acuerden algo con fecha.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Acción corta que empieza con verbo en infinitivo" },
        fecha: { type: "string", description: "AAAA-MM-DD (opcional)" },
        hora: { type: "string", description: "HH:MM en 24 h (opcional)" },
        cliente: { type: "string", description: "Nombre del cliente (opcional; solo pendientes de trabajo)" },
        proyecto: { type: "string", description: "Nombre del proyecto (opcional; solo pendientes de trabajo)" },
        categoria: { type: "string", description: "Categoría (opcional; en modos como Personal o Escuela, p. ej. «Casa», «Compras», «Trámites»)" },
        materia: { type: "string", description: "Materia (opcional; solo pendientes de la escuela)" },
        persona: { type: "string", description: "Persona relacionada (opcional)" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "agendar_recordatorio",
    description: "Agenda un recordatorio a una fecha y hora concretas (Lumi avisará con su burbuja y una notificación).",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Qué recordar" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM en 24 h" },
      },
      required: ["titulo", "fecha", "hora"],
    },
  },
  {
    name: "proponer_recuerdo",
    description:
      "Propone guardar en la memoria de Lumi un dato durable sobre el usuario, sus clientes, proyectos, personas, preferencias u horarios. El usuario lo confirmará. No propongas datos sensibles ni cosas que ya estén en la memoria.",
    parameters: {
      type: "object",
      properties: {
        hecho: { type: "string", description: "El dato en una frase, en tercera persona" },
        tema: { type: "string", description: "Tema para agruparlo (p. ej. el nombre del cliente, «Trabajo», «Preferencias»)" },
      },
      required: ["hecho"],
    },
  },
  {
    name: "cambiar_apariencia",
    description:
      "Cambia cómo se ve Lumi (la esferita flotante): ropa, cabello, lentes, accesorios o colores. Úsala SOLO cuando el usuario lo pida. Manda únicamente los campos que cambian. Si piden algo que no está en las opciones, ofrece lo más parecido en tu respuesta en lugar de llamarla.",
    parameters: {
      type: "object",
      properties: {
        cuerpo: {
          type: "string",
          enum: BODIES.map((x) => x.id),
          description: "Color del cuerpo. «clasica» es la Lumi morada original; lila, rosa, rojo, coral, sol, menta, cielo y noche son colores de la marca; clara, media, morena y oscura son tonos de piel",
        },
        ojos: { type: "string", enum: EYE_COLORS.map((x) => x.id), description: "Color de ojos" },
        antena: { type: "boolean", description: "La antena de Lumi (los gorros la tapan)" },
        cabello: { type: "string", enum: HAIRS.map((x) => x.id) },
        cabelloColor: { type: "string", enum: HAIR_COLORS.map((x) => x.id) },
        vello: { type: "string", enum: FACIALS.map((x) => x.id), description: "Barba o bigote" },
        prenda: { type: "string", enum: OUTFITS.map((x) => x.id) },
        prendaColor: { type: "string", enum: COLORS.map((x) => x.id) },
        lentes: { type: "string", enum: GLASSES.map((x) => x.id) },
        lentesColor: { type: "string", enum: FRAMES.map((x) => x.id), description: "Color del armazón" },
        accesorio: { type: "string", enum: ACCESSORIES.map((x) => x.id), description: "Accesorio de cabeza" },
        accesorioColor: { type: "string", enum: COLORS.map((x) => x.id) },
      },
    },
  },
  {
    name: "cambiar_modo",
    description:
      "Cambia el modo de Lumi (por ejemplo Trabajo, Escuela o Personal) cuando el usuario lo pida («cambia a escuela», «modo personal hasta mañana», «regresa a tu horario»).",
    parameters: {
      type: "object",
      properties: {
        modo: { type: "string", description: "Id del modo (trabajo, escuela, personal u otro de la lista de modos). Vacío para volver al horario automático." },
        duracion: {
          type: "string",
          enum: ["siguiente_bloque", "una_hora", "hasta_manana", "fijo", "automatico"],
          description: "Cuánto dura el cambio. Por defecto, hasta el siguiente bloque del horario. «automatico» regresa al horario.",
        },
      },
    },
  },
  {
    name: "plan_de_estudio",
    description:
      "Parte una entrega o examen en pasos pequeños con fechas intermedias y los crea como pendientes del modo Escuela. El primer paso es de 5 minutos y para hoy. Úsala cuando el estudiante tenga una entrega grande, un examen o diga que no sabe por dónde empezar.",
    parameters: {
      type: "object",
      properties: {
        entrega: { type: "string", description: "Qué hay que entregar o presentar" },
        fecha: { type: "string", description: "Fecha de entrega AAAA-MM-DD" },
        materia: { type: "string", description: "Materia (opcional)" },
        pasos: {
          type: "array",
          items: { type: "string" },
          description: "Opcional: pasos propios, cada uno «AAAA-MM-DD | acción». Si no los mandas, Lumi propone los pasos.",
        },
      },
      required: ["entrega", "fecha"],
    },
  },
  {
    name: "crear_tarjetas",
    description:
      "Guarda tarjetas de repaso (pregunta y respuesta) en la materia, para que Lumi se las pregunte con repaso espaciado. Úsala cuando el estudiante quiera estudiar o te pida preguntas de un tema.",
    parameters: {
      type: "object",
      properties: {
        materia: { type: "string", description: "Nombre de la materia" },
        tarjetas: { type: "array", items: { type: "string" }, description: "Cada una «pregunta :: respuesta» (respuesta corta)" },
      },
      required: ["materia", "tarjetas"],
    },
  },
  {
    name: "iniciar_sesion_estudio",
    description: "Empieza una sesión de estudio (Pomodoro): Lumi cuenta el tiempo de enfoque y avisa cuando toca descansar.",
    parameters: {
      type: "object",
      properties: {
        minutos: { type: "number", description: "Minutos de enfoque (por defecto los de Ajustes, 25)" },
        materia: { type: "string", description: "Materia (opcional)" },
      },
    },
  },
  {
    name: "registrar_pago_recurrente",
    description:
      "Registra un pago o recibo que se repite (renta, luz, tarjeta, suscripción) para que Lumi avise unos días antes. NUNCA guardes números de tarjeta ni de cuenta.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Qué se paga (p. ej. «Renta», «Tarjeta: fecha de pago»)" },
        dia: { type: "number", description: "Día del mes (1–31)" },
        mes: { type: "number", description: "Mes (1–12) solo si es anual" },
        monto: { type: "string", description: "Monto (opcional), p. ej. «$8,500»" },
        avisar_dias_antes: { type: "number", description: "Días de anticipación (por defecto 2)" },
      },
      required: ["nombre", "dia"],
    },
  },
  {
    name: "agregar_a_lista",
    description: "Agrega cosas a una lista (súper, casa, regalos…). Si la lista no existe, la crea.",
    parameters: {
      type: "object",
      properties: {
        lista: { type: "string", description: "Nombre de la lista (p. ej. «Súper»)" },
        elementos: { type: "array", items: { type: "string" }, description: "Lo que hay que agregar" },
      },
      required: ["lista", "elementos"],
    },
  },
];

/** Herramientas de cada modo: solo se ofrecen si ese modo está activo en Ajustes. */
const MODE_TOOLS: Record<string, string[]> = {
  escuela: ["plan_de_estudio", "crear_tarjetas", "iniciar_sesion_estudio"],
  personal: ["registrar_pago_recurrente", "agregar_a_lista"],
};

export function toolsFor(s: Settings): ToolDef[] {
  const enabled = enabledModes(s.modes).map((m) => m.id);
  const hidden = new Set(Object.entries(MODE_TOOLS).flatMap(([mode, names]) => (enabled.includes(mode) ? [] : names)));
  if (enabled.length < 2) hidden.add("cambiar_modo");
  return LUMI_TOOLS.filter((t) => !hidden.has(t.name));
}

export interface ToolContext {
  brain: Brain | null;
  meetings: Meeting[];
  sources: ChatSource[];
  actions: ChatAction[];
  origin: string | null;
  /** Modo activo: los pendientes y recuerdos nuevos son de este modo. */
  mode?: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function addSource(ctx: ToolContext, path: string, title: string) {
  if (!ctx.sources.some((s) => s.path === path)) ctx.sources.push({ path, title });
}

async function createTask(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  if (!ctx.brain) return "No hay vault configurado todavía.";
  const tags: Tag[] = [];
  const cliente = str(input.cliente);
  const proyecto = str(input.proyecto);
  if (cliente) tags.push({ kind: "cliente", name: cliente });
  if (proyecto) tags.push({ kind: "proyecto", name: proyecto });
  const fecha = str(input.fecha);
  const hora = str(input.hora);
  const draft: TaskDraft = {
    title: str(input.titulo) ?? "Pendiente",
    date: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    time: hora && /^\d{1,2}:\d{2}$/.test(hora) ? hora.padStart(5, "0") : null,
    tags,
    contact: str(input.persona),
    // Con clientes o proyectos ya es de Trabajo; si no, cae en el modo activo
    mode: tags.length ? null : modeTagFor(ctx.mode),
  };
  const materia = str(input.materia);
  const subject = materia ? findSubject(ctx.brain, materia) : null;
  if (materia) {
    draft.subject = subject?.name ?? materia;
    if (!tags.length && draft.mode) draft.mode = modeTagFor("escuela");
  }
  const categoria = str(input.categoria);
  if (categoria && !materia) {
    const target = draft.mode ?? (tags.length ? null : ctx.mode ?? null);
    const m = modeById(getSettings().modes, target);
    draft.category = modeCategories(m).find((c) => slugify(c) === slugify(categoria)) ?? categoria;
    if (target) rememberCategory(target, draft.category);
  }
  const key = await ctx.brain.createTask(draft);
  const when = draft.date ? whenLabel(new Date(`${draft.date}T${draft.time ?? "09:00"}`).toISOString()) : "sin fecha";
  ctx.actions.push({ kind: "pendiente", label: draft.title, detail: when, taskKey: key, state: "hecho" });
  return `Pendiente creado: «${draft.title}» (${when}).`;
}

/** Etiqueta de modo para lo nuevo (solo si hay más de un modo activo). */
function modeTagFor(mode: string | null | undefined): string | null {
  if (!mode) return null;
  const s = getSettings();
  return s.modes && enabledModes(s.modes).length > 1 ? mode : null;
}

const DURATIONS: Record<string, ManualDuration | "automatico"> = {
  siguiente_bloque: "bloque",
  una_hora: "hora",
  hasta_manana: "hoy",
  fijo: "fijo",
  automatico: "automatico",
};

function findSubject(brain: Brain, name: string | null) {
  if (!name) return null;
  const n = slugify(name);
  return brain.subjects().find((s) => s.slug === n || s.name.toLowerCase() === name.toLowerCase() || s.slug.includes(n) || n.includes(s.slug)) ?? null;
}

export async function executeTool(ctx: ToolContext, call: ToolCall): Promise<{ content: string; isError?: boolean }> {
  try {
    const input = call.input ?? {};
    switch (call.name) {
      case "buscar_en_vault": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const hits = await ctx.brain.searcher.search(str(input.consulta) ?? "", { k: 8 });
        if (!hits.length) return { content: "Sin resultados." };
        for (const h of hits) addSource(ctx, h.path, h.title);
        return { content: hits.map((h) => `### ${h.title}${h.heading ? ` › ${h.heading}` : ""} (${h.path})\n${h.snippet}`).join("\n\n") };
      }
      case "leer_nota": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const rel = ctx.brain.resolveNote(str(input.nota) ?? "");
        if (!rel) return { content: "No encontré esa nota.", isError: true };
        const note = await ctx.brain.readForAI(rel);
        if (!note) return { content: "Esa nota es privada o está excluida; no puedo leerla.", isError: true };
        addSource(ctx, rel, note.title);
        const text = note.text.length > 14_000 ? `${note.text.slice(0, 14_000)}\n…(recortada)` : note.text;
        return { content: `# ${note.title} (${rel})\n${text}` };
      }
      case "listar_pendientes": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const now = new Date();
        const endToday = addDays(startOfDay(now), 1).getTime();
        const endWeek = addDays(startOfDay(now), 7).getTime();
        const periodo = str(input.periodo) ?? "todos";
        const etiqueta = str(input.etiqueta)?.toLowerCase();
        const list = ctx.brain
          .tasks()
          .filter((t) => !t.done && !t.private)
          .filter((t) => {
            const at = t.remindAt ? new Date(t.remindAt).getTime() : null;
            if (periodo === "hoy") return at !== null && at < endToday;
            if (periodo === "atrasados") return at !== null && at < now.getTime();
            if (periodo === "semana") return at !== null && at < endWeek;
            return true;
          })
          .filter(
            (t) =>
              !etiqueta ||
              t.tags.some((g) => g.name.toLowerCase().includes(etiqueta)) ||
              [t.category, t.subject].some((x) => x?.toLowerCase().includes(etiqueta)) ||
              t.text.toLowerCase().includes(etiqueta),
          )
          .slice(0, 60);
        return {
          content: list.length
            ? list.map((t) => `- ${t.text} — ${t.remindAt ? whenLabel(t.remindAt) : "sin fecha"}${t.tags.length ? ` [${t.tags.map((g) => g.name).join(", ")}]` : ""}`).join("\n")
            : "No hay pendientes con ese filtro.",
        };
      }
      case "proximas_reuniones": {
        const list = ctx.meetings.filter((m) => new Date(m.end) > new Date()).slice(0, 30);
        return {
          content: list.length
            ? list.map((m) => `- ${whenLabel(m.start)}: ${m.title}${m.attendees.length ? ` · ${m.attendees.slice(0, 6).join(", ")}` : ""}`).join("\n")
            : "No hay reuniones en los próximos 7 días (o el calendario no está conectado).",
        };
      }
      case "crear_pendiente":
      case "agendar_recordatorio":
        return { content: await createTask(ctx, input) };
      case "proponer_recuerdo": {
        const hecho = str(input.hecho);
        if (!hecho) return { content: "Falta el hecho.", isError: true };
        const p = proposeFact(ctx.brain, hecho, str(input.tema) ?? "General", ctx.origin, modeTagFor(ctx.mode));
        if (!p) return { content: "Ya lo sé o el aprendizaje está apagado; no hace falta guardarlo." };
        ctx.actions.push({ kind: "recuerdo", label: p.text, detail: p.topic, proposalId: p.id, state: "pendiente" });
        return { content: "Propuesta registrada; el usuario la confirmará." };
      }
      case "cambiar_apariencia": {
        const s0 = getSettings();
        const before = s0.avatar;
        // Si el modo activo tiene look propio, lo que ese look cubre se cambia ahí (si no, no se vería)
        const m = ctx.mode && s0.modes ? modeById(s0.modes, ctx.mode) : null;
        if (m?.apariencia && enabledModes(s0.modes).length > 1) {
          const covered = Object.keys(input).filter((k) => k in m.apariencia!);
          if (covered.length) {
            const patched = applyAvatarPatch(applyAvatarPatch(before, m.apariencia).next, Object.fromEntries(covered.map((k) => [k, input[k]])));
            if (patched.changed.length) {
              const own = Object.fromEntries(Object.keys(m.apariencia).map((k) => [k, patched.next[k as keyof typeof patched.next]]));
              updateSettings({ modes: { lista: s0.modes.lista.map((x) => (x.id === m.id ? { ...x, apariencia: own } : x)) } });
            }
          }
        }
        const { next, changed } = applyAvatarPatch(before, input);
        if (!changed.length) return { content: "No hubo cambios válidos; tu apariencia sigue igual: " + describeAvatar(before) };
        updateSettings({ avatar: next });
        ctx.actions.push({ kind: "apariencia", label: "Me cambié el look", detail: describeAvatar(next), lookBefore: before, state: "hecho" });
        return { content: `Listo, ahora te ves así: ${describeAvatar(next)}.` };
      }
      case "cambiar_modo": {
        const s = getSettings();
        const id = str(input.modo)?.toLowerCase() ?? null;
        const dur = DURATIONS[str(input.duracion) ?? "siguiente_bloque"] ?? "bloque";
        const mode = id ? (modeById(s.modes, id) ?? enabledModes(s.modes).find((m) => m.nombre.toLowerCase() === id) ?? null) : null;
        if (id && (!mode || !mode.enabled)) return { content: `No tengo el modo «${id}». Modos activos: ${enabledModes(s.modes).map((m) => m.nombre).join(", ")}.`, isError: true };
        const r = setMode(mode?.id ?? null, mode ? dur : "automatico");
        ctx.actions.push({ kind: "modo", label: mode ? `Cambié a modo ${mode.nombre} ${mode.icono}` : "Volví a tu horario", detail: r.text, state: "hecho" });
        return { content: `Listo. Modo actual: ${r.text}.` };
      }
      case "plan_de_estudio": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const entrega = str(input.entrega);
        const fecha = str(input.fecha);
        if (!entrega || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { content: "Falta la entrega o su fecha (AAAA-MM-DD).", isError: true };
        const today = dayKey();
        const pasos = Array.isArray(input.pasos)
          ? input.pasos
              .map((x) => /^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/.exec(String(x).trim()))
              .filter((m): m is RegExpExecArray => !!m)
              .map((m) => ({ date: m[1] < today ? today : m[1] > fecha ? fecha : m[1], title: m[2].trim() }))
          : [];
        const subject = findSubject(ctx.brain, str(input.materia));
        const keys = await createStudyPlan(ctx.brain, { title: entrega, due: fecha, subject: subject?.name ?? str(input.materia), steps: pasos.length >= 2 ? pasos : undefined });
        const tasks = keys.map((k) => ctx.brain!.task(k)).filter((t) => !!t);
        ctx.actions.push({ kind: "pendiente", label: `Plan para «${entrega}»`, detail: `${keys.length} pasos hasta el ${fecha}`, taskKeys: keys, taskKey: keys[0], state: "hecho" });
        return { content: `Plan creado (${keys.length} pasos):\n${tasks.map((t) => `- ${t!.due}: ${t!.text}`).join("\n")}` };
      }
      case "crear_tarjetas": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const subject = findSubject(ctx.brain, str(input.materia));
        if (!subject) return { content: `No encontré la materia «${str(input.materia) ?? ""}». Materias: ${ctx.brain.subjects().map((x) => x.name).join(", ") || "(ninguna; créala en Escuela)"}.`, isError: true };
        const cards = (Array.isArray(input.tarjetas) ? input.tarjetas : [])
          .map((x) => String(x).split(/\s*::\s*/))
          .filter((p) => p.length >= 2 && p[0].trim() && p.slice(1).join(" ").trim())
          .map((p) => ({ question: p[0].trim(), answer: p.slice(1).join(" ").trim() }));
        if (!cards.length) return { content: "No recibí tarjetas con el formato «pregunta :: respuesta».", isError: true };
        const rel = await ctx.brain.addCards(subject.path, cards);
        addSource(ctx, rel, `Repaso - ${subject.name}`);
        ctx.actions.push({ kind: "nota", label: `${cards.length} tarjetas para ${subject.name}`, detail: "Te las pregunto en Escuela → Repasar", path: rel, state: "hecho" });
        return { content: `Guardé ${cards.length} tarjetas en ${rel}.` };
      }
      case "iniciar_sesion_estudio": {
        const s = getSettings();
        const min = typeof input.minutos === "number" && input.minutos >= 5 && input.minutos <= 120 ? Math.round(input.minutos) : s.school.focusMin;
        const subject = ctx.brain ? findSubject(ctx.brain, str(input.materia)) : null;
        startFocus(min, subject?.name ?? str(input.materia));
        ctx.actions.push({ kind: "nota", label: `Sesión de estudio de ${min} min`, detail: subject ? subject.name : "¡A darle!", state: "hecho" });
        return { content: `Sesión de estudio iniciada: ${min} minutos de enfoque. Te aviso cuando toque descansar.` };
      }
      case "registrar_pago_recurrente": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const nombre = str(input.nombre);
        const dia = Number(input.dia);
        const mes = input.mes === undefined || input.mes === null ? null : Number(input.mes);
        if (!nombre || !(dia >= 1 && dia <= 31) || (mes !== null && !(mes >= 1 && mes <= 12))) return { content: "Falta el nombre o el día del pago.", isError: true };
        const lead = typeof input.avisar_dias_antes === "number" ? Math.max(0, Math.min(15, Math.round(input.avisar_dias_antes))) : 2;
        await ctx.brain.savePayment({ name: nombre, day: dia, month: mes, amount: str(input.monto) ?? "", lead });
        ctx.actions.push({ kind: "nota", label: `Pago: ${nombre}`, detail: mes ? `cada año el ${dia}/${mes}` : `cada mes el día ${dia}`, state: "hecho" });
        return { content: `Pago registrado: ${nombre}, ${mes ? `cada año el ${dia}/${mes}` : `el día ${dia} de cada mes`}. Te aviso ${lead} días antes.` };
      }
      case "agregar_a_lista": {
        if (!ctx.brain) return { content: "No hay vault configurado." };
        const nombre = str(input.lista) ?? "Súper";
        const items = (Array.isArray(input.elementos) ? input.elementos : []).map((x) => String(x).trim()).filter(Boolean);
        if (!items.length) return { content: "No recibí qué agregar.", isError: true };
        const existing = ctx.brain.lists().find((l) => l.name.toLowerCase() === nombre.toLowerCase());
        const rel = existing?.path ?? (await ctx.brain.createList(nombre));
        await ctx.brain.addListItem(rel, items.join("\n"));
        ctx.actions.push({ kind: "nota", label: `Lista «${existing?.name ?? nombre}»`, detail: items.join(", "), path: rel, state: "hecho" });
        return { content: `Agregué ${items.length} a la lista «${existing?.name ?? nombre}».` };
      }
      default:
        return { content: `Herramienta desconocida: ${call.name}`, isError: true };
    }
  } catch (e) {
    return { content: `Error: ${errorText(e)}`, isError: true };
  }
}
