/** Atiende las llamadas de la interfaz (window.lumi.*). */
import { app, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import {
  INVOKE_METHODS,
  addDays,
  dayKey,
  enabledModes,
  modeFile,
  parseSubjectLine,
  formatClassSlot,
  startOfDay,
  type ChatMessage,
  type LumiInvoke,
  type ProfileAnswers,
  type Result,
  type TaskDraft,
} from "@lumi/shared";
import { getBrain, embedder, modesChanged, openVault, scheduleSnapshot, snapshot } from "./core";
import { activeMode, markChatActivity, rememberCategory, setMode, undoMode } from "./modes";
import { createStudyPlan, dueCards, generateCards, gradeCard } from "./school";
import { startBreak, startFocus, stopStudy } from "./school/study";
import { ensureModeStructure } from "./vault/structure";
import { getSettings, updateSettings } from "./settings";
import { setSecret, setSecretJson } from "./secrets";
import { getChat, mutateState, setChat } from "./state";
import * as win from "./windows";
import { bubbleAction, tick } from "./scheduler";
import { providerFor } from "./llm/provider";
import { runChat } from "./llm/agent";
import { localDraft, refineDraft } from "./memory/extractor";
import { confirmFact } from "./memory/facts";
import { generateSummary } from "./memory/summaries";
import { suggestRoutines } from "./memory/habits";
import { obsidianUrl } from "./memory/context-builder";
import { installStructure, looksLikeVault, FILES } from "./vault/structure";
import { connectGoogle, connectMicrosoft } from "./calendar/providers";
import { meetings, refreshCalendars } from "./calendar";
import { fetchIcs } from "./calendar/ics";
import { granolaConnect, granolaDiagnostics, granolaDisconnect, granolaUseApiKey, openGranolaApp, syncGranola } from "./granola/sync";
import { checkForUpdates, installUpdate } from "./updater";
import { errorText, uid, writeFileAtomic } from "./util";
import { stringifyNote, today } from "./vault/vault";

const ok = <T>(value?: T): Result<T> => ({ ok: true, value });
const fail = (e: unknown): Result<never> => ({ ok: false, error: errorText(e) });

function needBrain() {
  const b = getBrain();
  if (!b) throw new Error("Primero elige o crea tu vault.");
  return b;
}

const SAFE_SCHEMES = ["http:", "https:", "obsidian:", "mailto:"];

function parseRoutineLine(line: string): { title: string; days: number[]; time: string } | null {
  const t = line.trim().replace(/^[-*•]\s*/, "");
  if (!t) return null;
  const time = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|h|hrs)?/i.exec(t);
  let hh = time ? parseInt(time[1], 10) : 9;
  const mm = time?.[2] ? parseInt(time[2], 10) : 0;
  if (time?.[3]?.toLowerCase() === "pm" && hh < 12) hh += 12;
  let days = [1, 2, 3, 4, 5];
  if (/diario|todos los d[ií]as|cada d[ií]a/i.test(t)) days = [0, 1, 2, 3, 4, 5, 6];
  if (/fin(es)? de semana/i.test(t)) days = [0, 6];
  const map: [RegExp, number][] = [
    [/\blunes\b/i, 1],
    [/\bmartes\b/i, 2],
    [/\bmi[eé]rcoles\b/i, 3],
    [/\bjueves\b/i, 4],
    [/\bviernes\b/i, 5],
    [/\bs[aá]bados?\b/i, 6],
    [/\bdomingos?\b/i, 0],
  ];
  const named = map.filter(([re]) => re.test(t)).map(([, d]) => d);
  if (named.length) days = named;
  const title = t
    .replace(time?.[0] ?? "", "")
    .replace(/\b(a las|cada|los|las|diario|todos los d[ií]as|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?|fin(es)? de semana)\b/gi, "")
    .replace(/[,;·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  return { title: title[0].toUpperCase() + title.slice(1), days, time: `${String(Math.min(hh, 23)).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

const handlers: LumiInvoke = {
  async getSnapshot() {
    return snapshot();
  },

  // ---------- ventanas ----------
  async togglePanel() {
    win.togglePanel();
  },
  async showPanel() {
    win.showPanel();
  },
  async hidePanel() {
    win.hidePanel();
  },
  async setPanelPinned(p) {
    win.setPinned(p);
  },
  async avatarPress() {
    win.avatarPress();
  },
  async avatarDrag(active) {
    win.avatarDrag(active);
  },
  async setAvatarVisible(v) {
    win.setAvatarVisible(v);
  },
  async avatarMenu() {
    win.avatarMenu();
  },
  async bubbleReady(w, h) {
    win.bubbleReady(w, h);
  },
  async getBubble() {
    return win.getBubble();
  },
  async bubbleAction(action, minutes) {
    await bubbleAction(action, minutes);
  },
  async quit() {
    app.quit();
  },

  // ---------- configuración ----------
  async updateSettings(patch) {
    const before = getSettings();
    const s = updateSettings(patch);
    if (JSON.stringify(s.modes) !== JSON.stringify(before.modes)) await modesChanged();
    if (s.defaultReminderTime !== before.defaultReminderTime) getBrain()?.setDefaultReminderTime(s.defaultReminderTime);
    if (s.ai.semanticSearch !== before.ai.semanticSearch) {
      // La ventana "cerebro" carga (o no) el modelo según este ajuste
      embedder.setStatus("apagada");
      win.brainWindow()?.webContents.reload();
    }
    return snapshot();
  },
  async chooseFolder(title) {
    const r = await dialog.showOpenDialog({ title, properties: ["openDirectory", "createDirectory"], defaultPath: app.getPath("documents") });
    return r.canceled ? null : r.filePaths[0] ?? null;
  },
  async defaultVaultPath() {
    return path.join(app.getPath("documents"), "LumiVault");
  },
  async setupVault(root, mode) {
    try {
      if (mode === "existente" && !(await looksLikeVault(root))) {
        // No es un error: Lumi puede usar cualquier carpeta, pero avisa
      }
      await installStructure(root, { trabajo: "", clientes: "", proyectos: "", rutinas: "" });
      await ensureModeStructure(root, enabledModes(getSettings().modes));
      updateSettings({ vaultPath: root });
      await openVault(root);
      return ok(path.basename(root));
    } catch (e) {
      return fail(e);
    }
  },
  async setApiKey(provider, key) {
    try {
      setSecret(provider, key?.trim() || null);
      scheduleSnapshot();
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async testAI(provider) {
    try {
      const p = providerFor(provider);
      const r = await p.chat({
        system: "Responde en una frase corta y amable, en español.",
        messages: [{ role: "user", content: "Saluda a tu nuevo usuario en menos de 15 palabras." }],
        profile: "rapido",
        maxTokens: 80,
      });
      return ok(r.text.trim());
    } catch (e) {
      return fail(e);
    }
  },
  async setOpenAtLogin(open) {
    app.setLoginItemSettings({ openAtLogin: open, openAsHidden: true });
    updateSettings({ openAtLogin: open });
  },
  async openExternal(url) {
    try {
      if (SAFE_SCHEMES.includes(new URL(url).protocol)) await shell.openExternal(url);
    } catch {
      /* URL inválida */
    }
  },
  async openInObsidian(rel) {
    const b = getBrain();
    if (b) await shell.openExternal(obsidianUrl(b.vault.name, rel));
  },
  async revealVault() {
    const b = getBrain();
    if (b) await shell.openPath(b.vault.root);
  },
  async reindex() {
    // Si el modelo de búsqueda falló (p. ej. sin internet), se reintenta
    if (embedder.state === "error" && getSettings().ai.semanticSearch) win.brainWindow()?.webContents.reload();
    await getBrain()?.reindex();
  },
  async checkForUpdates() {
    try {
      return ok(await checkForUpdates());
    } catch (e) {
      return fail(e);
    }
  },
  async installUpdate() {
    installUpdate();
  },

  // ---------- calendario ----------
  async connectCalendar(provider) {
    try {
      const email = provider === "google" ? await connectGoogle() : await connectMicrosoft();
      updateSettings({ calendars: { [provider]: { connected: true, email } } });
      await refreshCalendars();
      return ok(email ?? "Conectado");
    } catch (e) {
      return fail(e);
    }
  },
  async disconnectCalendar(provider) {
    setSecretJson(provider === "google" ? "google-oauth" : "microsoft-oauth", null);
    updateSettings({ calendars: { [provider]: { connected: false, email: null } } });
    await refreshCalendars();
  },
  async addIcs(name, url, kind = "calendario") {
    try {
      await fetchIcs(url);
      const s = getSettings();
      const fallback = kind === "entregas" ? "Entregas de la escuela" : "Calendario";
      updateSettings({ calendars: { ics: [...s.calendars.ics, { id: uid(), name: name.trim() || fallback, url: url.trim(), enabled: true, kind }] } });
      await refreshCalendars();
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async removeIcs(id) {
    const s = getSettings();
    updateSettings({ calendars: { ics: s.calendars.ics.filter((x) => x.id !== id) } });
    await refreshCalendars();
  },
  async refreshCalendars() {
    await refreshCalendars();
  },

  // ---------- granola ----------
  async granolaConnect() {
    try {
      const r = ok(await granolaConnect());
      void syncGranola(getBrain()).catch(() => {});
      return r;
    } catch (e) {
      return fail(e);
    }
  },
  async granolaUseApiKey(key) {
    try {
      const r = ok(await granolaUseApiKey(key));
      void syncGranola(getBrain()).catch(() => {});
      return r;
    } catch (e) {
      return fail(e);
    }
  },
  async granolaDisconnect() {
    granolaDisconnect();
  },
  async granolaSync() {
    try {
      return ok(await syncGranola(getBrain()));
    } catch (e) {
      return fail(e);
    }
  },
  async granolaDiagnostics() {
    try {
      return ok(await granolaDiagnostics());
    } catch (e) {
      return fail(e);
    }
  },
  async openGranola() {
    openGranolaApp();
  },

  // ---------- notas y pendientes ----------
  async parseQuickNote(text) {
    return localDraft(text, getBrain());
  },
  async refineQuickNote(text) {
    return refineDraft(text, getBrain());
  },
  async saveTask(draft: TaskDraft, existingKey) {
    try {
      const b = needBrain();
      const modes = enabledModes(getSettings().modes);
      const multi = modes.length > 1;
      if (existingKey) {
        const key = await b.updateTask(existingKey, draft);
        if (draft.category) rememberCategory(draft.mode ?? b.task(key)?.mode ?? (multi ? null : modes[0]?.id), draft.category);
        return ok(key);
      }
      if (draft.original?.trim()) await b.appendInbox(draft.original.trim());
      // Lo nuevo cae en el modo activo (si hay varios), salvo que diga otra cosa
      const mode = !multi ? null : draft.mode !== undefined ? draft.mode : draft.tags.length ? null : activeMode().id;
      const key = await b.createTask({ ...draft, mode });
      if (draft.category) rememberCategory(mode ?? (multi ? null : modes[0]?.id), draft.category);
      return ok(key);
    } catch (e) {
      return fail(e);
    }
  },
  async toggleTask(key) {
    try {
      const t = await needBrain().toggleTask(key);
      if (t && !t.done) mutateState((x) => x.completions.push({ text: t.text, at: new Date().toISOString() }));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async deleteTask(key) {
    try {
      await needBrain().deleteTask(key);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async getTaskDraft(key) {
    return getBrain()?.taskDraft(key) ?? null;
  },

  // ---------- chat ----------
  async chatHistory() {
    return getChat();
  },
  async chatSend(text) {
    markChatActivity();
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text.trim(), at: new Date().toISOString() };
    const history = getChat();
    setChat([...history, userMsg]);
    const id = uid();
    let last = 0;
    try {
      const r = await runChat({
        brain: getBrain(),
        meetings: meetings(),
        history,
        userText: userMsg.content,
        mode: activeMode(),
        onDelta: (full) => {
          const now = Date.now();
          if (now - last > 60) {
            last = now;
            win.send("panel", "chat-delta", { id, text: full });
          }
        },
      });
      const msg: ChatMessage = { id, role: "assistant", content: r.content, at: new Date().toISOString(), sources: r.sources, actions: r.actions };
      setChat([...getChat(), msg]);
      markChatActivity();
      scheduleSnapshot();
      return msg;
    } catch (e) {
      const msg: ChatMessage = { id, role: "assistant", content: errorText(e), at: new Date().toISOString(), error: true };
      setChat([...getChat(), msg]);
      return msg;
    }
  },
  async chatClear() {
    setChat([]);
  },
  async undoTask(key, messageId) {
    const action = getChat()
      .find((m) => m.id === messageId)
      ?.actions?.find((a) => a.taskKey === key);
    // Un plan de estudio se deshace completo
    for (const k of action?.taskKeys?.length ? action.taskKeys : [key]) {
      try {
        await needBrain().deleteTask(k);
      } catch {
        /* ya no existe o no es de Lumi */
      }
    }
    setChat(
      getChat().map((m) =>
        m.id === messageId ? { ...m, actions: m.actions?.map((a) => (a.taskKey === key ? { ...a, state: "descartado" as const } : a)) } : m,
      ),
    );
  },
  async search(query) {
    return getBrain()?.searcher.search(query, { k: 12 }) ?? [];
  },

  // ---------- memoria ----------
  async listFacts() {
    return getBrain()?.facts() ?? [];
  },
  async confirmFact(id, keep) {
    const b = getBrain();
    if (b) await confirmFact(b, id, keep);
    setChat(
      getChat().map((m) => ({
        ...m,
        actions: m.actions?.map((a) => (a.proposalId === id ? { ...a, state: keep ? ("hecho" as const) : ("descartado" as const) } : a)),
      })),
    );
  },
  async addFact(text, topic) {
    try {
      await needBrain().addFact(text, topic || "General", `[[${today()}]]`);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async deleteFact(rel, line) {
    try {
      await needBrain().deleteFact(rel, line);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async listSummaries() {
    return getBrain()?.summaries() ?? [];
  },
  async generateSummary(kind) {
    try {
      return ok(await generateSummary(needBrain(), kind));
    } catch (e) {
      return fail(e);
    }
  },

  // ---------- rutinas ----------
  async routineSuggestions() {
    return suggestRoutines(getBrain());
  },
  async acceptSuggestion(s) {
    await needBrain().createRoutine(s);
  },
  async dismissSuggestion(key) {
    updateSettings({ dismissedSuggestions: [...getSettings().dismissedSuggestions, key] });
  },
  async saveRoutine(r) {
    try {
      await needBrain().createRoutine(r);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async setRoutineActive(rel, active) {
    try {
      await needBrain().setRoutineActive(rel, active);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async deleteRoutine(rel) {
    try {
      await needBrain().deleteRoutine(rel);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },

  // ---------- onboarding ----------
  async saveProfile(a: ProfileAnswers) {
    try {
      const b = needBrain();
      updateSettings({ userName: a.name.trim() });
      const list = (s: string) =>
        s
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean);
      const clients = list(a.clients);
      const projects = list(a.projects);
      const subjects = (a.subjects ?? "")
        .split(/\n+/)
        .map((l) => parseSubjectLine(l))
        .filter((x): x is NonNullable<typeof x> => !!x);
      const profile = await b.vault.read(FILES.perfil);
      const fresh = !profile || profile.body.replace(/^#.*$/gm, "").replace(/Este archivo es tuyo.*$/m, "").trim() === "";
      const content = [
        "# Mi perfil",
        "",
        "Este archivo es tuyo: Lumi lo lee para conocerte, pero nunca lo cambia sin preguntarte.",
        "",
        "## Quién soy",
        `${a.name.trim() ? `Me llamo ${a.name.trim()}. ` : ""}${a.work.trim()}`,
        "",
        ...(clients.length ? ["## Clientes", clients.map((c) => `- [[${c}]]`).join("\n"), ""] : []),
        ...(projects.length ? ["## Proyectos", projects.map((p) => `- [[${p}]]`).join("\n"), ""] : []),
        ...(subjects.length ? ["## Materias", subjects.map((x) => `- [[${x.name}]]${x.slots.length ? ` · ${x.slots.map(formatClassSlot).join(", ")}` : ""}`).join("\n"), ""] : []),
        "## Rutinas que quiero cuidar",
        list(a.routines).map((r) => `- ${r}`).join("\n"),
        "",
      ].join("\n");
      if (fresh) {
        await writeFileAtomic(b.vault.abs(FILES.perfil), stringifyNote({ type: "perfil", source: "usuario" }, content));
      } else {
        await b.vault.upsertLumiSection(FILES.perfil, "Entrevista inicial", content.replace(/^# Mi perfil[\s\S]*?## Quién soy/, "### Quién soy"));
      }
      await b.touch(FILES.perfil);
      for (const c of clients) await b.ensureEntity("cliente", c);
      for (const p of projects) await b.ensureEntity("proyecto", p);
      const known = b.subjects().map((x) => x.name.toLowerCase());
      for (const x of subjects) {
        if (known.includes(x.name.toLowerCase())) continue;
        await b.saveSubject({ name: x.name, teacher: "", schedule: x.slots.map(formatClassSlot), platform: "", link: "", maxAbsences: null, aiAllowed: false });
      }
      for (const line of list(a.routines)) {
        const r = parseRoutineLine(line);
        if (r) await b.createRoutine(r);
      }
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async finishOnboarding() {
    updateSettings({ onboarded: true, lastGreeting: today(), modesIntroduced: true });
    setTimeout(() => void tick(), 2000);
  },

  // ---------- modos ----------
  async setMode(id, duration) {
    setMode(id, duration);
    scheduleSnapshot();
  },
  async undoMode() {
    undoMode();
    scheduleSnapshot();
  },
  async openModeFile(id) {
    try {
      const b = needBrain();
      const mode = getSettings().modes.lista.find((m) => m.id === id);
      if (!mode) throw new Error("Ese modo no existe.");
      await ensureModeStructure(b.vault.root, [mode]);
      await b.touch(modeFile(id));
      await shell.openExternal(obsidianUrl(b.vault.name, modeFile(id)));
      return ok();
    } catch (e) {
      return fail(e);
    }
  },

  // ---------- escuela ----------
  async saveSubject(input, existingPath) {
    try {
      if (!input.name.trim()) throw new Error("Escribe el nombre de la materia.");
      return ok(await needBrain().saveSubject(input, existingPath ?? null));
    } catch (e) {
      return fail(e);
    }
  },
  async saveCycle(c) {
    try {
      await needBrain().saveCycle(c);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async createStudyPlan(input) {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due)) throw new Error("Elige la fecha de entrega.");
      const keys = await createStudyPlan(needBrain(), input);
      return ok(keys.length);
    } catch (e) {
      return fail(e);
    }
  },
  async dueCards(subject) {
    const b = getBrain();
    return b ? dueCards(b, subject ?? null) : [];
  },
  async gradeCard(id, grade) {
    gradeCard(id, grade);
    scheduleSnapshot();
  },
  async addCards(subjectPath, cards) {
    try {
      await needBrain().addCards(subjectPath, cards);
      return ok(cards.length);
    } catch (e) {
      return fail(e);
    }
  },
  async generateCards(subjectPath) {
    try {
      return ok(await generateCards(needBrain(), subjectPath));
    } catch (e) {
      return fail(e);
    }
  },
  async studyAction(action, subject) {
    const s = getSettings().school;
    if (action === "start" || action === "focus") startFocus(s.focusMin, action === "start" ? (subject ?? null) : undefined);
    else if (action === "break") startBreak(s.breakMin);
    else stopStudy();
    scheduleSnapshot();
  },

  // ---------- personal ----------
  async savePayment(p, replaceLine) {
    try {
      if (!p.name.trim()) throw new Error("Escribe qué se paga.");
      if (!(p.day >= 1 && p.day <= 31)) throw new Error("El día debe ser del 1 al 31.");
      await needBrain().savePayment(p, replaceLine ?? null);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async deletePayment(line) {
    try {
      await needBrain().deletePayment(line);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async setBirthday(name, date) {
    try {
      if (!name.trim()) throw new Error("Escribe el nombre.");
      await needBrain().setBirthday(name.trim(), date);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async createList(name) {
    try {
      if (!name.trim()) throw new Error("Ponle nombre a la lista.");
      return ok(await needBrain().createList(name));
    } catch (e) {
      return fail(e);
    }
  },
  async addListItem(rel, text) {
    try {
      await needBrain().addListItem(rel, text);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async toggleListItem(rel, line) {
    try {
      await needBrain().toggleListItem(rel, line);
      return ok();
    } catch (e) {
      return fail(e);
    }
  },
  async clearList(rel) {
    try {
      return ok(await needBrain().clearList(rel));
    } catch (e) {
      return fail(e);
    }
  },
  async moveTodayToTomorrow() {
    try {
      const b = needBrain();
      const now = new Date();
      const endToday = addDays(startOfDay(now), 1);
      const keys = b
        .tasks()
        .filter((t) => !t.done && t.due && t.remindAt && new Date(t.remindAt) < endToday)
        .map((t) => t.key);
      return ok(await b.moveDueToTomorrow(keys, dayKey(endToday)));
    } catch (e) {
      return fail(e);
    }
  },

  // ---------- cerebro ----------
  async brainResult(id, vectors, error) {
    embedder.resolve(id, vectors, error);
  },
  async brainStatus(status, detail) {
    embedder.setStatus(status, detail);
    if (status === "lista") getBrain()?.queue.kick();
    scheduleSnapshot();
  },
};

export function registerIpc(): void {
  for (const name of INVOKE_METHODS) {
    const fn = handlers[name] as (...a: unknown[]) => Promise<unknown>;
    ipcMain.handle(`lumi:${name}`, (_e, ...args) => fn(...args));
  }
}
