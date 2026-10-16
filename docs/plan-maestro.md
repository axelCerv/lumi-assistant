# Lumi — Plan maestro y contexto del proyecto

> Versión 1.5 · 14 de octubre de 2026 · Autor: Axel · v1.1 agrega la personalización del avatar (sección 14); v1.2 agrega colores de marca, color de ojos, antena para todos y cabello corto; v1.3 agrega ropa y peinados por grupo (ella, él, trabajo, para todos) y 13 colores de ropa; v1.4 agrega los modos Trabajo, Escuela y Personal con cambio manual y por horario (sección 15), las funciones por modo (sección 16) y las reglas de edad; **v1.5 refleja cómo quedaron construidos en Lumi 0.3 (atajo, datos y archivos reales; ver 15.9)**. La evidencia y el detalle de cada función están en `claude/Lumi-modos-investigacion.md`; el estado, en `docs/ESTADO.md`.
> Documento de referencia para cualquier conversación o desarrollo sobre Lumi. Si algo aquí cambia, se actualiza este archivo.
> (Copia del documento del proyecto «Lumi Assistant». El avance contra este plan está en [ESTADO.md](ESTADO.md).)

---

## 1. Visión

Lumi es un asistente de escritorio (Windows y Mac) con un avatar flotante, siempre visible y arrastrable. Al hacer clic abre un panel con pendientes, próximas reuniones y un chat. Su diferencia: **tiene el "cerebro" del usuario** — todo su contexto de vida, trabajo y estudios — guardado **en la computadora del propio usuario**, en un vault de Obsidian, y alimentado automáticamente con las reuniones que graba Granola.

Principios:

1. **Local-first:** la información del usuario vive en su disco, en Markdown legible. Si Lumi desaparece, el usuario conserva todo.
2. **Costo de infraestructura ~$0 para Axel:** sin base de datos en la nube ni servidor propio en el MVP.
3. **Multi-IA:** el usuario elige Claude o Gemini (y se pueden añadir más).
4. **Tono amable**, proactivo pero no invasivo.
5. **Una Lumi, varios modos:** Trabajo, Escuela y Personal (y los que el usuario cree). Se cambian a mano o por horario (sección 15).

Funciones base: notas rápidas → recordatorios, etiquetas por cliente/proyecto/materia, reuniones desde Gmail/Outlook, rutinas y detección de hábitos, chat con IA que conoce el contexto del usuario, un avatar que cada quien personaliza (sección 14) y modos con funciones propias (secciones 15 y 16).

---

## 2. Decisiones clave

| Tema | Decisión | Por qué |
|---|---|---|
| Base de datos | **Vault de Obsidian (Markdown) = fuente de verdad** + índice SQLite local desechable | Costo $0, datos del usuario en su disco, legibles y editables en Obsidian |
| Búsqueda/memoria | SQLite con FTS5 (texto) + sqlite-vec (vectores), reconstruible desde el vault | Rápido, offline, sin servidor |
| Embeddings | Modelo local (transformers.js, p. ej. multilingual-e5-small) | Independiente del proveedor de IA (Claude no ofrece embeddings) y gratis |
| Reuniones | Granola graba → **Lumi sincroniza las notas al vault** como `.md` | Granola es sin bot; el vault conserva todo para siempre |
| IA | Capa de proveedores con **BYOK** (el usuario pone su propia API key) de Claude o Gemini | Axel no paga tokens; el usuario elige |
| Calendario | Google Calendar / Microsoft Graph vía OAuth + enlaces iCal | Saber reuniones y clases futuras (Granola cubre el después); iCal trae Moodle y Canvas |
| App de escritorio | **Electron + TypeScript** | SDKs maduros de Anthropic, Google, MCP y SQLite en Node; ventana flotante transparente en ambos SO |
| Backend propio | Ninguno en MVP | Solo hace falta para cobrar, dar IA incluida o una versión escolar para menores (fase futura) |
| Obsidian | No necesita estar abierto: Lumi lee y escribe los archivos directamente | Menos dependencias; Obsidian es el "visor/editor" del usuario |
| **Modos** | **Un solo vault; cada modo define alcance, personalidad, panel, avisos y look** | Personas, diario y choques de horario cruzan entre escuela, trabajo y vida personal |
| **Edad** | **18+ = Lumi completo. Menores = «Lumi sin IA»** | La API de Gemini prohíbe apps que probablemente usen menores; Claude exige salvaguardas que el BYOK no garantiza |

---

## 3. Arquitectura

```
┌──────────────────────── Computadora del usuario ────────────────────────┐
│                                                                          │
│  Granola (graba reuniones)        Obsidian (ve/edita el vault)           │
│        │  MCP / API                       ▲                              │
│        ▼                                  │ archivos .md                 │
│  ┌──────────────── LUMI (Electron) ───────┴──────────────┐               │
│  │  Granola Bridge ──► Vault Writer ──► VAULT (Markdown) │               │
│  │  Calendar/iCal  ─┘        ▲              │ watcher     │               │
│  │                           │              ▼             │               │
│  │  Memory Engine ◄── Índice SQLite (FTS5 + vectores)     │               │
│  │       │            (en datos de la app, desechable)    │               │
│  │       ▼                                                │               │
│  │  Mode Resolver ──► Context Builder ──► LLM Provider ───┼──► API nube   │
│  │  (manual/horario)   (filtra por modo)  (Claude|Gemini) │   (solo los   │
│  │       ▲                                                │   fragmentos  │
│  │  UI: avatar flotante · panel · chat · recordatorios    │   necesarios) │
│  └────────────────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
```

Flujo típico: el usuario pregunta "¿qué quedé con Acme la semana pasada?" → el Mode Resolver sabe que está en modo Trabajo → Context Builder busca en el índice dentro del alcance del modo (texto + semántica + recencia + enlaces) → arma un contexto con perfil + instrucciones del modo + notas relevantes → lo envía al proveedor elegido → responde citando las notas (con enlace `obsidian://` para abrirlas).

---

## 4. El cerebro: estructura del vault

Lumi crea el vault en el onboarding (o se conecta a uno existente y solo agrega sus carpetas). Solo se crean las carpetas de los modos que el usuario activa.

```
LumiVault/
├── 00-Inbox/                 # notas rápidas sin clasificar (compartido)
├── 01-Diario/                # 2026-10-13.md (nota diaria, compartido)
├── 02-Reuniones/             # modo Trabajo
│   └── 2026/10/              # 2026-10-13-revision-acme.md (desde Granola)
├── 03-Pendientes/            # pendientes sueltos; cada uno lleva su etiqueta de modo
├── 04-Proyectos/             # modo Trabajo
├── 05-Clientes/              # modo Trabajo
├── 06-Personas/              # compartido (una nota por persona; cumple, relación)
├── 07-Rutinas/               # compartido; cada rutina puede tener `modo:`
├── 08-Conocimiento/          # compartido
├── 10-Escuela/               # modo Escuela
│   ├── Ciclo 2026-2.md       # fechas del semestre, materias, periodos de exámenes
│   ├── Materias/
│   │   └── Calculo I/
│   │       ├── Calculo I.md  # profesor, horario, salón, evaluación, faltas, plataforma
│   │       ├── Apuntes/
│   │       └── Repaso.md     # tarjetas Pregunta::Respuesta
│   └── Tramites.md           # servicio social, becas, reinscripción, titulación
├── 20-Personal/              # modo Personal
│   ├── Pagos.md              # recibos y pagos recurrentes (sin números de cuenta)
│   ├── Listas/
│   ├── Salud/                # `lumi: privado` por defecto
│   ├── Metas/
│   └── Eventos/
├── 90-Lumi/
│   ├── perfil.md             # quién es el usuario (lo edita él, Lumi propone)
│   ├── preferencias.md       # cómo quiere que Lumi se comporte
│   ├── modos/                # trabajo.md, escuela.md, personal.md: personalidad e instrucciones
│   ├── memoria/              # hechos aprendidos y confirmados, por tema
│   └── resumenes/            # resúmenes semanales/mensuales generados
├── 99-Plantillas/
└── .lumiignore               # carpetas que Lumi NUNCA lee ni envía a la IA
```

### Reglas de convivencia con el usuario
- Lumi **nunca sobrescribe** texto escrito por el usuario. Solo crea archivos nuevos, agrega secciones marcadas (`## Lumi · …`) o edita archivos con `source: lumi`.
- Todo archivo generado lleva frontmatter con `source` y `updated`.
- Una nota con `lumi: privado` en su frontmatter, o dentro de `.lumiignore`, jamás se envía a la IA.
- Los pendientes usan el formato del plugin Tasks para que funcionen igual en Obsidian, con etiqueta de modo:
  `- [ ] Enviar propuesta a [[Acme]] 📅 2026-10-15 #trabajo #cliente/acme`
  `- [ ] Ensayo de Ética, borrador ⏰ 18:00 📅 2026-10-16 #escuela/etica`

### A qué modo pertenece una nota
Se decide en este orden: 1) `modo:` en el frontmatter; 2) carpeta asignada al modo; 3) etiqueta `#trabajo`, `#escuela` o `#personal` (o subetiquetas); 4) sin modo = **compartido** (visible en todos).

### Esquemas de frontmatter

**Reunión** (`02-Reuniones/`)
```yaml
---
type: reunion
source: granola
granola_id: not_1d3tmYTlCICgjy
title: Revisión trimestral Acme
date: 2026-10-13
start: 2026-10-13T10:00:00-06:00
duration_min: 45
attendees: ["[[Ana López]]", "[[Carlos Ruiz]]"]
cliente: "[[Acme]]"
proyecto: "[[Rediseño web]]"
tags: [reunion]
lumi_procesada: true
---
# Revisión trimestral Acme
## Resumen (Granola)
## Mis notas (Granola)
## Lumi · Pendientes detectados
- [ ] … 📅 …
## Lumi · Decisiones
## Transcripción
```

**Materia** (`10-Escuela/Materias/<Materia>/<Materia>.md`)
```yaml
---
type: materia
modo: escuela
ciclo: "[[Ciclo 2026-2]]"
profesor: "[[Dra. Pérez]]"
horario: ["lun 09:00-10:30 A-204", "mie 09:00-10:30 A-204"]
evaluacion: { examenes: 50, tareas: 30, proyecto: 20 }
faltas_max: 6
plataforma: moodle            # moodle | canvas | classroom | otra
enlace: https://...
ical: https://...             # opcional: URL del calendario de la plataforma
ia_permitida: false           # si el profesor permite IA en trabajos
---
## Calificaciones
- Parcial 1 · examenes · 8.5
## Lumi · Plan de estudio
```

**Persona / Cliente / Proyecto**: `type`, `aliases`, `relacion` (persona), `cumple` (persona, opcional), `estado` (proyecto), `tags`. Las reuniones se enlazan solas por backlinks.

**Memoria** (`90-Lumi/memoria/<tema>.md`): lista de hechos con fecha, origen y modo opcional:
`- 2026-10-13 · Prefiere reuniones por la mañana · (origen: [[2026-10-13]]) · modo: trabajo`

---

## 5. Granola → Obsidian

Granola graba sin bot y genera notas mejoradas con IA + transcripción. Lumi actúa como **puente** y guarda cada reunión en `02-Reuniones/` con el esquema de arriba.

### Vías de acceso (estado a oct 2026)

| Vía | Plan Granola | Cómo | Valoración |
|---|---|---|---|
| **MCP oficial** (`https://mcp.granola.ai/mcp`) | Gratis (solo últimos 30 días) y de pago | OAuth en navegador (Dynamic Client Registration), sin API key. Herramientas: listar reuniones, obtenerlas, transcripción, carpetas, consulta | **Vía principal** — funciona para todos |
| **API pública** (`public-api.granola.ai/v1`) | Business (US$14/usuario/mes) o Enterprise | API key `grn_…` creada en Settings → Connectors → API keys. `GET /v1/notes`, `GET /v1/notes/{id}?include=transcript` | Vía preferida si el usuario paga Business: más simple y estable |
| Plugin de Obsidian "Granola Sync" (comunidad) | Cuenta Granola | El usuario lo instala; Lumi solo vigila la carpeta | Respaldo; reportado solo para macOS |
| Leer la caché local `cache-v3.json` | — | Archivo interno no documentado | **No usar**: frágil y a menudo sin notas |

### Estrategia
1. En onboarding, Lumi pide conectar Granola por OAuth (MCP). Si el usuario tiene API key de Business, puede pegarla en su lugar.
2. **Sincronización incremental** al abrir la app y cada ~15 min: trae reuniones nuevas desde la última fecha guardada; deduplica por `granola_id`.
3. Como el plan gratis solo expone ~30 días, **el vault se vuelve el historial permanente**: mientras Lumi sincronice al menos una vez al mes, nada se pierde.
4. Post-proceso con IA (opcional, configurable): extraer pendientes, decisiones, personas y cliente/proyecto; crear/enlazar notas en `06-Personas/` y `05-Clientes/`.
5. Antes de cada reunión del calendario, Lumi puede recordar: "¿Abro Granola para esta reunión?".
6. **Por modo:** las reuniones van a Trabajo por defecto. Una regla opcional manda las reuniones de equipo o asesorías de la escuela (por título, carpeta de Granola o calendario) a la materia correspondiente en `10-Escuela/`.

Toda fuente termina en el mismo contrato (archivo `.md` con frontmatter estándar), así cambiar de vía no afecta el resto de la app.

---

## 6. Capa de IA multi-proveedor

```ts
// packages/shared/llm.ts
interface LLMProvider {
  id: 'claude' | 'gemini';
  chat(req: {
    system: string;
    messages: Message[];
    tools?: ToolDef[];        // esquema JSON común
    stream?: boolean;
  }): AsyncIterable<ChatChunk>;
  countTokens?(text: string): Promise<number>;
}
```

- `ClaudeProvider` → `@anthropic-ai/sdk`. `GeminiProvider` → `@google/genai`.
- Las herramientas de Lumi (crear pendiente, buscar en vault, leer nota, agendar recordatorio, proponer recuerdo, cambiar apariencia, **cambiar modo**) se definen una vez y cada proveedor las traduce a su formato de tool/function calling. Cada modo puede sumar herramientas propias (sección 15).
- **Modelos en configuración, nunca en el código.** Dos perfiles por proveedor: `rapido` (clasificar notas, extraer pendientes) y `inteligente` (chat, resúmenes). Ejemplos actuales: Claude Haiku / Sonnet; Gemini Flash-Lite / Flash. Gemini 2.5 se apaga el 16-oct-2026: usar la familia Gemini 3.
- **Proveedor por modo (opcional):** un modo puede usar otro proveedor o perfil (p. ej. Escuela con Claude «inteligente» y Personal con Gemini Flash).
- API keys guardadas con el llavero del sistema (`safeStorage` de Electron), nunca en el vault.
- **Aviso de privacidad obligatorio en onboarding:** en el plan gratuito de la API de Gemini, Google puede usar entradas y salidas para mejorar sus modelos y pueden ser revisadas por personas. Para un "cerebro personal" se recomienda plan de pago o Claude.
- **Edad:** los términos de la API de Gemini exigen 18+ y prohíben apps que probablemente usen menores. Claude permite productos para menores solo con salvaguardas. Por eso los proveedores de IA solo se activan si el usuario confirmó ser mayor de edad (sección 15.8).

---

## 7. Memoria y contexto (cómo piensa Lumi)

1. **Indexación:** un watcher (chokidar) detecta cambios en el vault → se trocea cada nota por encabezados → FTS5 + embeddings locales → SQLite en la carpeta de datos de la app (por dispositivo; no se sincroniza). Cada fragmento guarda su modo (regla de la sección 4).
2. **Recuperación híbrida:** puntaje = texto + similitud semántica + recencia + cercanía en el grafo de enlaces (mismo cliente/persona/proyecto/materia). **Se filtra al alcance del modo activo + lo compartido**, salvo en la vista «Todo».
3. **Context Builder** (presupuesto de tokens fijo): `perfil.md` + `preferencias.md` + `90-Lumi/modos/<modo>.md` + nota diaria de hoy + agenda de próximas 48 h + pendientes vencidos/próximos del modo + top‑k fragmentos recuperados. La sección «Ahora» incluye `Modo actual: Escuela (por horario, hasta 14:00)`.
4. **Aprendizaje con confirmación:** tras conversaciones o reuniones, Lumi *propone* hechos nuevos ("¿Guardo que Acme renueva en enero?"). Solo los confirmados van a `90-Lumi/memoria/`. Evita que la memoria se llene de suposiciones. El hecho se etiqueta con el modo en que nació; los hechos sin modo son globales.
5. **Resúmenes periódicos:** semanal y mensual en `90-Lumi/resumenes/`, con una sección por modo; mantienen el contexto largo barato.
6. **Hábitos:** a partir de notas diarias y pendientes completados (con hora), Lumi detecta patrones y sugiere rutinas; el usuario las acepta en `07-Rutinas/`.

---

## 8. Modelo de costos

| Concepto | Axel | Usuario |
|---|---|---|
| Base de datos / servidor | $0 | $0 |
| IA | $0 (BYOK) | Gemini con nivel gratis en modelos Flash, o pago por uso de Claude/Gemini |
| Obsidian | — | Gratis |
| Granola | — | Basic gratis (historial limitado) o Business US$14/mes |
| Sincronizar entre dispositivos | — | Opcional y a elección: iCloud, Syncthing, Git u Obsidian Sync |
| Firma de código | Apple Developer (≈US$99/año) + certificado Windows (verificar precio) | — |
| Actualizaciones | GitHub Releases + electron-updater ($0) | — |

Los modos no agregan costo: todo es local. Opciones futuras de negocio: "Lumi Pro" con IA incluida (Axel paga tokens y cobra suscripción) y "Lumi Escolar" para escuelas o padres (IA segura para menores). Ambas requieren backend mínimo; no forman parte del MVP.

---

## 9. Stack técnico

- **Desktop:** Electron, TypeScript, Vite, React (reutilizar el mockup `Asistente flotante.html`).
- **Empaquetado:** electron-builder (.dmg / .exe con NSIS), electron-updater.
- **Vault:** `gray-matter` (frontmatter), `remark` (Markdown), `chokidar` (watcher).
- **Índice:** `better-sqlite3` + FTS5 + `sqlite-vec`; embeddings con `@huggingface/transformers`.
- **IA:** `@anthropic-ai/sdk`, `@google/genai`.
- **Granola:** `@modelcontextprotocol/sdk` (cliente MCP por Streamable HTTP + OAuth) y `fetch` para la API REST.
- **Calendario:** Google Calendar API, Microsoft Graph, enlaces iCal (Moodle, Canvas y otros).
- **Repaso espaciado:** algoritmo FSRS o SM-2 propio (sin dependencia externa pesada).
- **Validación:** `zod` para esquemas de frontmatter y configuración.
- **Programación de recordatorios y modos:** scheduler propio en el proceso principal + notificaciones nativas.

### Estructura del repositorio
```
LUMI/                              (~/Documents/PROGRAMACION/LUMI)
├── apps/desktop/
│   ├── src/main/
│   │   ├── vault/        # leer/escribir, plantillas, watcher, reglas de no-sobrescritura
│   │   ├── index/        # sqlite, fts, vectores, embeddings
│   │   ├── llm/          # provider.ts, claude.ts, gemini.ts, tools.ts
│   │   ├── granola/      # mcp-client.ts, api-client.ts, mapper.ts, sync.ts
│   │   ├── calendar/     # google.ts, microsoft.ts, ical.ts
│   │   ├── memory/       # context-builder.ts, extractor.ts, summaries.ts, habits.ts
│   │   ├── modes/        # resolver.ts, schedule.ts (sección 15)
│   │   ├── school/       # timetable.ts, study-plan.ts, srs.ts, grades.ts
│   │   ├── personal/     # recurring.ts (pagos), birthdays.ts, lists.ts
│   │   ├── scheduler/    # recordatorios y notificaciones
│   │   └── secrets/      # safeStorage
│   ├── src/preload/
│   └── src/renderer/     # avatar flotante, panel, chat, onboarding, ajustes, apariencia, modos, widgets
├── packages/shared/      # tipos, esquemas zod, interfaz LLMProvider, catálogo del avatar, modos
├── templates/vault/      # estructura y plantillas iniciales del vault (por modo)
└── docs/
```

---

## 10. Onboarding del usuario

1. Bienvenida y explicación: "tu información se queda en tu computadora". Ahí mismo, «Elige tu Lumi» (la clásica o uno de los personajes base).
2. **Edad:** «¿Tienes 18 años o más?». Si no, se configura «Lumi sin IA» y se omiten los pasos 4 y 6 (sección 15.8).
3. **¿Para qué usarás a Lumi?** Casillas: Trabajo, Escuela, Personal (mínimo una). Solo se crean las carpetas y modos elegidos. Si hay más de uno: modo por defecto y horario rápido (p. ej. «entre semana de 7 a 14 h, Escuela»).
4. Elegir o crear vault (botón para descargar Obsidian si no lo tiene).
5. Elegir IA: Claude o Gemini → pegar API key → prueba de conexión → aviso de privacidad.
6. Conectar calendario (Google u Outlook) y, si eligió Escuela, pegar el enlace iCal de Moodle o Canvas, o marcar los calendarios de Classroom.
7. Conectar Granola: botón de descarga + conexión OAuth (o API key Business) + aviso de consentimiento de grabación. Opcional si solo usa Escuela o Personal.
8. Mini entrevista para crear `perfil.md` (nombre, trabajo, clientes, proyectos, rutinas) y, si eligió Escuela, el ciclo y las materias con su horario.
9. Primer sync e indexado con barra de progreso.

---

## 11. Roadmap

Estado de cada tarea: ver `claude/Lumi-estado-implementacion.md`.

**Fase 0 — Validación técnica (1 semana)**
- [ ] OAuth del MCP de Granola desde Electron (redirect loopback) y listar reuniones
- [ ] Llamada básica a Claude y a Gemini con la misma interfaz
- [ ] Ventana flotante transparente always-on-top en Mac y Windows
- [ ] Leer/escribir un vault de prueba e indexarlo con FTS5

**Fase 1 — MVP local**
- [ ] Avatar + panel (desde el mockup)
- [ ] Onboarding: vault + proveedor de IA
- [ ] Notas rápidas → Inbox; IA las convierte en pendientes con fecha y etiquetas
- [ ] Chat con contexto (FTS + perfil + pendientes)
- [ ] Recordatorios con notificaciones nativas
- [ ] Personalización del avatar: personajes, editor, cambios por chat (sección 14)

**Fase 2 — Reuniones**
- [ ] Calendario Google/Outlook
- [ ] Granola Bridge (MCP + API) → `02-Reuniones/`
- [ ] Post-proceso: pendientes, decisiones, personas, clientes

**Fase 3 — Memoria profunda**
- [ ] Embeddings locales + búsqueda híbrida
- [ ] Propuesta y confirmación de hechos de memoria
- [ ] Resúmenes semanales/mensuales
- [ ] Detección de hábitos y rutinas

**Fase 4 — Distribución**
- [ ] Firma y notarización (Mac), firma Windows
- [ ] Auto-actualización
- [ ] Landing y documentación de usuario

**Fase 5 — Modos (sección 15)** · construida en Lumi 0.3 (detalle y lo que falta probar en `docs/ESTADO.md`)
- *5A · Núcleo*
  - [x] Esquema `Modo`, tres modos por defecto y modos personalizados
  - [x] Cambio manual: clic derecho, ícono de barra, atajo y chat (`cambiar_modo`)
  - [x] Horario semanal y precedencia
  - [x] Alcance en índice y Context Builder; vista «Todo»
  - [x] Look, panel y avisos por modo
  - [x] Pregunta de edad en onboarding
- *5B · Escuela (P1 de la sección 16)*
  - [x] Ciclo, materias y horario de clases
  - [x] Entregas por iCal (Moodle/Canvas) y Classroom vía Google Calendar
  - [x] Plan inverso, alerta de semana cargada, repaso espaciado y preguntas desde apuntes
  - [x] Sesión de estudio y modo tutor
- *5C · Personal (P1 de la sección 16)*
  - [x] Plan y cierre del día, pagos recurrentes, cumpleaños, listas, revisión semanal
- *5D · Menores*
  - [x] «Lumi sin IA» completo y probado sin ningún proveedor configurado

**Fase 6 — Opcional**
- [ ] Lumi Pro con IA incluida (backend mínimo)
- [ ] Lumi Escolar para menores (solo Claude, salvaguardas, revisión legal)
- [ ] Más proveedores (OpenAI, modelos locales con Ollama)
- [ ] Sugerencia contextual de modo (opt-in)

---

## 12. Riesgos y puntos por validar

- **Cliente MCP de Granola desde app propia:** la documentación orienta a Claude/Cursor; confirmar en Fase 0 que el registro dinámico de OAuth funciona con Lumi. Plan B: API key (Business) o plugin de Obsidian.
- **Límites del plan gratis de Granola:** fuentes externas se contradicen (historial de 30 días vs. tope de reuniones). Verificar en la página oficial antes de prometer algo al usuario.
- **Granola en Windows:** algunas fuentes lo marcan como beta; el plugin de Obsidian se reporta solo para macOS → en Windows depender de MCP/API.
- **Cambios de API/modelos:** mantener modelos y endpoints en configuración; Gemini cambia de generación con frecuencia.
- **Conflictos al editar:** escribir con archivos temporales + renombrado atómico; respetar ediciones del usuario.
- **Privacidad:** solo enviar fragmentos necesarios; respetar `.lumiignore` y `lumi: privado`; advertir del nivel gratis de Gemini.
- **Consentimiento de grabación:** el usuario es responsable de avisar a los participantes; Lumi lo recuerda en onboarding. En clases, además, el permiso del profesor y el reglamento de la escuela.
- **Menores de edad:** la preparatoria tiene muchos menores. La IA queda apagada para ellos hasta tener «Lumi Escolar». La nueva LFPDPPP (vigente desde el 21-mar-2025) no regula de forma específica a menores: validar con abogado antes de cualquier versión para ellos.
- **Integridad académica:** el modo tutor es la regla por defecto (sección 15.6).
- **Cambios de modo molestos:** transición suave, «Deshacer» de un clic y nunca cambiar a mitad de una sesión de estudio o reunión en curso.
- **Complejidad:** mostrar solo los modos elegidos; quien usa uno solo no ve nada de modos.

---

## 13. Convenciones

- Idioma de la app y del vault: español.
- Fechas ISO (`YYYY-MM-DD`), zona horaria del sistema.
- Nombres de archivo de reunión: `YYYY-MM-DD-titulo-en-kebab.md`.
- Enlaces internos siempre con `[[Nombre]]` para que funcione el grafo de Obsidian.
- Etiquetas de modo: `#trabajo`, `#escuela`, `#personal`, con subetiquetas (`#escuela/calculo`, `#cliente/acme`).

---

## 14. Personalización del avatar

Lumi es una **esferita que flota**: silueta propia, redonda, con bracitos y sombra de flotar. Cada usuario la viste a su gusto. El diseño visual completo está en el lienzo «Lumi — Personalización» (plan, personajes base, guardarropa y editor).

### Principios
- **La esfera manda:** ninguna pieza cambia el contorno redondo. Cabello y ropa son pequeños y van pegados al cuerpo.
- **Zonas:** el cabello vive arriba (y 26–76), la ropa abajo (y 132–176) y la franja de la cara queda libre, salvo los lentes.
- **Femenino y masculino son puntos de partida, no candados:** la base solo cambia pestañas y grosor de cejas. Cualquier pieza sirve en cualquier base.
- **Hermanos de Lumi:** todos los personajes comparten los ojos grandes con brillo, los cachetes redondos y la antena de la Lumi clásica. Así se ven tiernos y de la misma familia.
- **Colores de cuerpo dentro de la marca:** los colores "Lumi" salen de la paleta de la app (índigo, sol, coral, menta…). Los tonos de piel son opcionales.
- **Los estados de ánimo solo tocan la cara** (reposo, pendientes, hablando, reunión, pensando, arrastrando) y nunca rompen la ropa.
- **Diseño propio:** no se imitan personajes con marca registrada.

### Lienzo y capas
SVG en un lienzo de 200×200 con la esfera en (100,112) y radio 62. Orden de dibujo, de atrás hacia adelante:

1. Sombra de flotar
2. Detrás: capa y antena
3. Cuerpo: bracitos, esfera y brillo
4. Prenda
5. Cara según el estado
6. Vello facial
7. Cabello
8. Lentes
9. Accesorio de cabeza

### Catálogo v1.2
Las piezas de cabello, ropa y accesorios llevan un grupo: **Para ella**, **Para él**, **Trabajo** o **Para todos**. El editor las muestra separadas, con el grupo de la base elegida primero, y el modo sorpresa respeta la base. Es solo una guía visual: cualquier pieza sirve en cualquier base.

| Capa | Opciones | Colores |
|---|---|---|
| Cuerpo · colores Lumi | morada clásica, lila, rosa, rojo, coral, sol, menta, cielo, noche (tonos de la marca) | — |
| Cuerpo · tonos de piel | clara, media, morena, morena oscura | — |
| Ojos | estilo Lumi para todos: blanco grande, iris, pupila y brillo | negros, cafés, miel, verdes, azules, violeta |
| Antena | sí / no (se esconde sola con gorra, gorro, boina, casco o gorro de chef) | — |
| Base | femenina, masculina, neutral | — |
| Cabello · ella | fleco, bob, cola de caballo, coletas, trenzas, chongo, rizos | negro, castaño, rubio, pelirrojo, lila |
| Cabello · él | corto, raya de lado, picos, copete, rizado corto, rapado, mohicano | los mismos |
| Cabello · todos | sin cabello, mechón | los mismos |
| Vello facial | ninguno, barba, bigote | el del cabello |
| Ropa · ella | blusa, vestido, overol | 13 colores de ropa |
| Ropa · él | camisa, camisa y corbata, corbatín, jersey (con número) | 13 colores de ropa |
| Ropa · trabajo | bata, delantal, chaleco reflejante | 13 colores de ropa |
| Ropa · todos | sin ropa, playera, rayas, bufanda, capa | 13 colores de ropa |
| Lentes | ninguno, redondos, cuadrados, ojo de gato, de sol | negro, carey, índigo, dorado |
| Accesorio · todos | ninguno, gorra, gorro, audífonos, moño, boina | 13 colores de ropa |
| Accesorio · trabajo | casco de obra, gorro de chef (siempre blanco) | 13 colores de ropa |

Colores de ropa y accesorios, en tonos de la marca más blanco y negro: índigo, lila, cielo, verde azulado, menta, rosa, rojo, coral, naranja, mostaza, blanco, grafito y negro. La ropa blanca lleva un borde suave, y sobre ropa clara los detalles (botones, número) van oscuros.

Cada color de cuerpo define su color de cachetes y si la boca y las cejas van oscuras (cuerpos claros) o blancas (cuerpos oscuros).

Personajes base. Todos son "hermanos" de Lumi, con colores de la marca:
- **Lumi:** la clásica, morada con antena. Es la que trae la app por defecto.
- **Femeninas:** Luz (rosa, coletas, vestido, lentes redondos), Itzel (lila, cola de caballo, blusa, moño) y Maya (menta, rizos, overol, audífonos).
- **Masculinos:** Leo (cielo, picos, jersey), Diego (noche, raya de lado, camisa y corbata, lentes cuadrados) y Andrés (rojo, cabello corto, barba, chaleco reflejante y casco).

### Datos
Se guarda en `settings.avatar` dentro de `configuracion.json`, en la carpeta de datos de la app (no en el vault):

```json
{
  "base": "femenina", "cuerpo": "rosa", "ojos": "cafe", "antena": true,
  "cabello": "coletas", "cabelloColor": "castano", "vello": "ninguno",
  "prenda": "bufanda", "prendaColor": "indigo",
  "lentes": "redondos", "lentesColor": "negro",
  "accesorio": "ninguno", "accesorioColor": "mostaza",
  "reunion": null
}
```

- Se valida con zod: si un id no existe, ese campo vuelve a su valor por defecto y el resto se conserva.
- Migración: las configuraciones viejas con `accesorio: "antena"` pasan a `antena: true` sin perder nada.
- `reunion` es la ropa formal que Lumi se pone sola cuando hay una reunión por empezar. Se elige según la base (`formalFor`): blusa para ella, camisa y corbata para él, corbatín para la neutral. Con `null` está apagado.
- **Look por modo (v1.4):** cada modo puede guardar un parche de apariencia (`modo.apariencia`, sección 15.4) que se aplica sobre `settings.avatar` mientras el modo está activo. El orden es: avatar base → parche del modo → ropa de reunión.

### Dónde vive en la app
- **Onboarding:** en la bienvenida, «Elige tu Lumi» muestra los 7 personajes.
- **Ajustes → Apariencia** (o clic en la carita del inicio): editor con vista previa en vivo. Tiene los personajes, pestañas por capa (Cuerpo: colores Lumi, tonos de piel y ojos · Cabello · Ropa · Lentes · Extras: antena y accesorio). Cabello, ropa y accesorios aparecen separados en «Para ella», «Para él», «Trabajo» y «Para todos». Además tiene el botón «Sorpréndeme» y el interruptor «Ropa formal en reuniones».
- **Clic derecho en el avatar flotante:** muestra Abrir menú · **Modo ▸** · Cambiar mi look… · Platicar con Lumi · Esconder a Lumi. El ícono de la barra también tiene «Cambiar el look de Lumi…» y el submenú de modos.
- **Chat:** el usuario lo pide con palabras («ponte lentes de sol») y la IA usa `cambiar_apariencia`. El chat muestra el cambio con un botón «Deshacer».

### Contexto para la IA
- La sección «Ahora» del contexto incluye `Tu apariencia actual (Lumi): <describeAvatar>`.
- Reglas del prompt de sistema:
  - Solo cambia su look cuando el usuario lo pide.
  - Si piden algo que no existe, ofrece lo más parecido.
  - Puede mencionar su look con naturalidad, sin insistir.
- Herramienta `cambiar_apariencia`: recibe solo los campos que cambian, limitados a los enums del catálogo. La app valida con `applyAvatarPatch`, guarda y redibuja. La IA nunca escribe archivos.

### Archivos en el código
| Archivo | Qué hace |
|---|---|
| `packages/shared/src/avatar.ts` | Catálogo, esquema zod, personajes, `applyAvatarPatch`, `describeAvatar` y `avatarCatalogText` |
| `apps/desktop/src/renderer/src/components/LumiFace.tsx` | Dibuja a Lumi por capas y estados |
| `apps/desktop/src/renderer/src/panel/Appearance.tsx` | Editor de apariencia |
| `apps/desktop/src/renderer/src/panel/Onboarding.tsx` | «Elige tu Lumi» |
| `apps/desktop/src/renderer/src/avatar/main.tsx` | Avatar flotante: aplica la prenda de reunión y el clic derecho |
| `apps/desktop/src/main/llm/tools.ts` · `agent.ts` | Herramienta `cambiar_apariencia` y reglas |
| `apps/desktop/src/main/windows.ts` | Menú del clic derecho (`avatarMenu`, `showPanelView`) |
| `apps/desktop/test/avatar.test.ts` · `avatar-tool.test.ts` | Pruebas |

### Agregar una pieza nueva
1. Dibujarla en el lienzo de 200×200 respetando las zonas, con un solo color variable y sombras de negro translúcido.
2. Agregar su id, nombre y grupo (`ella`, `el`, `trabajo` o `todos`) al catálogo en `avatar.ts`. Desde ahí llega al esquema, al editor y a la herramienta de la IA.
3. Dibujarla en `LumiFace.tsx`, en la capa que le toca.
4. Probarla en los 7 personajes y a 64 px, y correr `npm test`.

### Siguientes pasos
- **Más estados de cara:** dormida de noche, festejo al completar pendientes y **concentrada** durante la sesión de estudio; gorro de dormir automático en la noche.
- **Piezas desbloqueables** con rachas de rutinas, sin bloquear nunca lo básico.
- **Paquetes de temporada:** Día de Muertos y Navidad.
- **Piezas de escuela:** mochila pequeña (pegada a la esfera), birrete para la graduación y lápiz detrás de la "oreja".

---

## 15. Modos: Trabajo, Escuela y Personal

### 15.1 Concepto
Un modo es un **"sombrero" de Lumi**: la misma Lumi, el mismo vault y la misma memoria base, pero cada modo cambia:

- **qué ve** (alcance de notas, pendientes y calendarios);
- **cómo habla** (personalidad e instrucciones);
- **qué muestra** (widgets del panel);
- **qué avisa** (notificaciones);
- **cómo se ve** (look del avatar);
- opcionalmente, **qué IA usa**.

Se eligió **un solo vault** en lugar de uno por modo porque las personas, el diario, las rutinas y los choques de horario cruzan entre escuela, trabajo y vida personal. Además, separar el alcance protege la privacidad: si el usuario comparte pantalla en clase, en modo Escuela no aparecen sus notas personales ni las de sus clientes.

### 15.2 Modos por defecto

| Modo | Personalidad | Panel | Look sugerido |
|---|---|---|---|
| 💼 **Trabajo** | Concisa y ejecutiva; prioriza clientes, reuniones y fechas | Reuniones de hoy, pendientes por cliente/proyecto, sesión de enfoque | Ropa formal (usa `reunion`) |
| 📚 **Escuela** | Tutora paciente: explica, pregunta y revisa; anima sin regañar | Próxima clase, entregas de la semana, exámenes, tarjetas para hoy, sesión de estudio | Lentes redondos y playera |
| 🏡 **Personal** | Cálida, tipo coach; cuida descanso y hábitos | Plan del día, hábitos, pagos próximos, cumpleaños, listas | El look favorito del usuario |

- **Modos personalizados:** el usuario puede crear otros (Freelance, Tesis, Gym…) copiando uno existente.
- Solo aparecen los modos elegidos en el onboarding. Con un solo modo, la interfaz de modos se oculta.

### 15.3 Cómo se cambia de modo

1. **Manual:**
   - clic derecho en el avatar → **Modo ▸**;
   - ícono de la barra;
   - atajo `Cmd/Ctrl + Opción/Alt + Mayús + 1…9` (sin Opción/Alt chocaría con las capturas de pantalla de macOS y con los símbolos de teclados en español);
   - chip de modo en el panel;
   - por chat («cambia a escuela»), con la herramienta `cambiar_modo`.

   Al cambiar a mano, Lumi pregunta cuánto tiempo: **hasta el siguiente bloque** (por defecto), 1 hora, hasta mañana o fijo.
2. **Por horario:** bloques semanales en un editor visual tipo calendario (p. ej. lun–vie 07:00–14:00 Escuela, 15:00–19:00 Trabajo, el resto Personal).
3. **Por calendario:** un calendario asignado a un modo (p. ej. el de Classroom o «Clases») activa ese modo mientras dura cada evento. El horario de clases de las materias genera bloques automáticamente.
4. **Sugerencia contextual** (fase 6, opt-in): Lumi propone el cambio y nunca lo hace sola.

**Precedencia:** fijado manual > manual temporal > evento de calendario asignado > horario semanal > modo por defecto.

**Reglas de transición:**
- El resolvedor evalúa cada minuto y al cambiar el calendario.
- Nunca cambia a mitad de una sesión de estudio, una reunión en curso o un chat activo: espera a que terminen.
- Al cambiar, la burbuja saluda con lo importante del modo («Modo Escuela 📚: Cálculo a las 9 y entrega de Química mañana») y ofrece «Deshacer».

### 15.4 Qué cambia y qué se comparte

| Cambia por modo | Se comparte entre modos |
|---|---|
| Alcance de notas, pendientes y calendarios | `perfil.md`, `preferencias.md`, API keys |
| Personalidad (`90-Lumi/modos/<id>.md`) | `06-Personas/`, `01-Diario/`, `00-Inbox/` |
| Widgets del panel | Memoria global (hechos sin modo) |
| Notificaciones y horas de silencio | Rutinas sin modo |
| Parche de look del avatar | Avatar base |
| Proveedor y perfil de IA (opcional) | Índice (un solo SQLite con la columna `modo`) |

**Avisos que sí cruzan de modo:** choques de horario (un examen a la misma hora que una reunión), pendientes vencidos marcados como urgentes y recordatorios con «avisar siempre». Aparecen como un chip pequeño («1 aviso de Trabajo»).

**Vista «Todo»:** un interruptor del panel que muestra todos los modos a la vez.

**Captura rápida:** lo que se anota cae en el modo activo (recibe su etiqueta), salvo que el texto diga otra cosa («#trabajo …»). La IA puede corregir la clasificación.

### 15.5 Datos

Configuración en `configuracion.json` (datos de la app), igual que la apariencia. Esquemas zod en `packages/shared/src/modes.ts`:

```ts
interface Mode {
  id: string;                          // 'trabajo' | 'escuela' | 'personal' | propio (minúsculas y guiones)
  nombre: string; icono: string; color: string;
  enabled: boolean;                    // usarlo o no
  alcance: { carpetas: string[]; etiquetas: string[] };
  panel: ModeWidget[];                 // tarjetas de «Hoy»: reuniones, pendientes, enfoque, clase, entregas,
                                       // repaso, estudio, dia, habitos, pagos, cumpleanos, listas
  notificaciones: { silenciarOtrosModos: boolean; horasSilencio: [string, string] | null };
  apariencia: Partial<AvatarConfig> | null;   // parche sobre settings.avatar
  ia: { proveedor: 'claude' | 'gemini' | null; perfil: 'rapido' | 'inteligente' | null };
}

interface ModesConfig {
  porDefecto: string;
  fijado: { modo: string; hasta: string | null } | null;   // cambio manual; hasta null = fijo
  lista: Mode[];                                            // vacía → los tres de siempre
  horario: { id: string; dias: number[]; inicio: string; fin: string; modo: string }[]; // dias 0=dom … 6=sáb
  calendarios: Record<string, string>;                      // nombre del calendario → modo
  clasesActivan: boolean;                                   // el horario de las materias activa Escuela
}
```

- **El modo activo no se guarda: se calcula** (`resolveMode(now, config, eventos)`, función pura) cada 20 s y cuando cambia algo.
- La personalidad y las instrucciones viven en el vault, en `90-Lumi/modos/<id>.md`, para que el usuario las lea y edite. Lumi las crea si faltan y nunca las sobrescribe.
- Otros ajustes nuevos: `ageGroup` («adulto», «menor» o null para instalaciones anteriores), `school` (aviso antes de clase, semana cargada, recordatorio de repaso, minutos de enfoque y descanso) y `personal` (cierre del día y su hora, días de anticipación de cumpleaños).
- Estado interno nuevo (`estado.json`): avance de cada tarjeta (`srs`), entregas importadas (`deadlines`), registro de estudio (`studyLog`) y avisos únicos (`alerts`).
- **A qué modo pertenece un pendiente:** su propia etiqueta (#escuela/…, #cliente/…) manda; si no tiene, el modo de su nota. Las etiquetas de los pendientes no cuentan como etiquetas de la nota. Los modos apagados cuentan como compartido.

### 15.6 IA y contexto por modo

- **Prompt de sistema** = base de Lumi + `90-Lumi/modos/<id>.md` + reglas del modo + «Modo actual: X (por horario/manual, hasta HH:MM)».
- **Herramientas extra:**
  - **Escuela:** `plan_de_estudio`, `crear_tarjetas`, `registrar_calificacion`, `iniciar_sesion_estudio`.
  - **Personal:** `registrar_pago_recurrente`, `agregar_a_lista`.
  - **Todos:** `cambiar_modo`.
- **Modo tutor (Escuela, por defecto):**
  - explica con pasos y pregunta antes de dar la respuesta completa;
  - revisa lo que el alumno escribió;
  - ayuda con esquemas e ideas;
  - no redacta trabajos finales para entregarlos como propios.

  Si la materia tiene `ia_permitida: true`, Lumi ajusta su ayuda a lo que el profesor permite.
- **Bienestar:** si el usuario expresa angustia seria, Lumi responde con calidez y sugiere hablar con alguien de confianza o una línea de ayuda local.

### 15.7 Archivos en el código

| Archivo | Qué hace |
|---|---|
| `packages/shared/src/modes.ts` | Esquemas, modos por defecto, `resolveMode`, `nextBoundary`, `manualUntil`, `describeMode`, `modeOfNote`, `modeOfTask`, `inScope`, `extractModeTag`, `modeLook` |
| `packages/shared/src/school.ts` | Horario de clases, `classOccurrences`, plan inverso, semana cargada, tarjetas y repaso espaciado (SM-2) |
| `packages/shared/src/personal.ts` | Pagos (lectura, siguiente fecha, tapar números de cuenta) y cumpleaños |
| `apps/desktop/src/main/modes/index.ts` | Modo activo: eventos (calendarios y clases), «no cambiar a mitad de algo», cambio manual y «Deshacer» |
| `apps/desktop/src/main/school/` | `index.ts` (entregas de Moodle/Canvas, plan, tarjetas, foto para la interfaz) · `study.ts` (sesión de estudio) |
| `apps/desktop/src/main/personal/index.ts` | Pagos, cumpleaños y listas para la interfaz |
| `apps/desktop/src/main/vault/brain.ts` | Modo y materia de cada pendiente; materias, ciclo, tarjetas, listas, pagos y cumpleaños |
| `apps/desktop/src/main/memory/context-builder.ts` | Filtro por modo, personalidad del modo, materias y vida personal en el contexto |
| `apps/desktop/src/main/llm/tools.ts` · `agent.ts` | `cambiar_modo`, `plan_de_estudio`, `crear_tarjetas`, `iniciar_sesion_estudio`, `registrar_pago_recurrente`, `agregar_a_lista`; reglas del modo tutor |
| `apps/desktop/src/main/scheduler/index.ts` | Burbuja de cambio de modo, clases, sesión de estudio, pagos, cumpleaños, semana cargada, repaso y cierre del día; silencio por modo |
| `apps/desktop/src/renderer/src/panel/ModeSwitcher.tsx` | Chip del modo y selector con duración; botón «Todo» |
| `apps/desktop/src/renderer/src/panel/Modes.tsx` | Ajustes → Modos: edad, modos, horario con vista de la semana, calendarios, Escuela y Personal |
| `apps/desktop/src/renderer/src/panel/School.tsx` · `Review.tsx` · `Personal.tsx` · `widgets.tsx` | Vistas y tarjetas de cada modo |
| `apps/desktop/test/modes.test.ts` · `school-personal.test.ts` · `modes-brain.test.ts` | 42 pruebas |

### 15.8 Edad y menores

- En el onboarding: «¿Tienes 18 años o más?».
- **18+:** Lumi completo.
- **Menores de 18: «Lumi sin IA».** No se configura ningún proveedor de IA. Funciona todo lo local:
  - horario, recordatorios y entregas por iCal;
  - plan inverso con plantilla (sin IA);
  - tarjetas de repaso escritas por el alumno;
  - Pomodoro y calificaciones;
  - avatar y modos.
- **Por qué:**
  - la API de Gemini exige 18+ y prohíbe apps que probablemente usen menores;
  - Anthropic permite productos para menores solo con verificación de edad, moderación, material educativo, prompt de seguridad infantil, aviso de que es una IA y cumplimiento legal, y audita a quienes lo hacen;
  - con BYOK nada de eso se puede garantizar.
- **Futuro: «Lumi Escolar»** (fase 6), solo con Claude, sin BYOK, a través de escuelas o padres, con salvaguardas y revisión legal.
- **Marketing de la v1:** universitarios, estudiantes de preparatoria mayores de 18, profesionistas y uso personal.

### 15.9 Cómo quedó construido (diferencias con lo planeado)
- **Atajo:** `Cmd/Ctrl + Opción/Alt + Mayús + 1…9` en lugar de `Cmd/Ctrl + Mayús + 1…9`.
- **Días:** 0 = domingo … 6 = sábado, como las rutinas.
- **Calendarios:** se asignan por nombre en `modes.calendarios`; no existe `alcance.calendarios`.
- **El modo activo se calcula**, no se guarda (`activo` no está en la configuración).
- **Cambio desde el menú o la bandeja:** va «hasta el siguiente bloque», y el submenú tiene «Quedarme en este modo» (fijo) y «Volver a mi horario». El selector del panel ofrece las cuatro duraciones.
- **Reuniones:** siempre avisan, aunque el modo activo silencie a los demás; se marcan con el modo al que pertenecen.
- **Instalaciones anteriores:** los tres modos activos y un aviso único para configurarlos.

---

## 16. Funciones por modo (backlog priorizado)

Detalle, evidencia y forma de construir cada una: `claude/Lumi-modos-investigacion.md`. **P1** = primera versión del modo.

**📚 Escuela**
| P1 | P2 | P3 |
|---|---|---|
| Ciclo y materias · Horario de clases con aviso 10 min antes · Entregas por iCal (Moodle/Canvas) y calendario de Classroom · Plan inverso con subtareas y primer paso de 5 min · Alerta de semana cargada · Tarjetas con repaso espaciado · Preguntas desde apuntes · Sesión de estudio (Pomodoro) · Modo tutor | Calificaciones y "qué necesito para pasar" · Contador de faltas · Equipos y reuniones de equipo con Granola · Trámites (servicio social, becas, reinscripción, titulación) | Citas APA 7 · Clases grabadas con Granola (con permiso) · API de Google Classroom |

**🏡 Personal**
| P1 | P2 | P3 |
|---|---|---|
| Plan del día y cierre del día · Pagos y recibos recurrentes · Cumpleaños · Listas · Hábitos filtrados por modo · Revisión semanal | Salud privada (citas y horarios, sin IA por defecto) · Metas · Trámites y fechas oficiales · Desconexión después de cierta hora | Viajes y eventos · Finanzas ligeras (integración con una app de finanzas) |

**💼 Trabajo**
Lo ya construido (clientes, proyectos, Granola, ropa de reunión) más: alcance por modo, sesión de enfoque y revisión semanal de Trabajo.

**Por qué estas prioridades:**
- La procrastinación es el mayor problema académico, y la recomendación es partir tareas con fechas intermedias.
- Casi la mitad de los universitarios pone la gestión del tiempo entre sus retos principales.
- La mitad siente estrés semanal.
- Casi todos estudian releyendo, cuando recordar activamente funciona mejor.

---

## Fuentes consultadas (oct 2026)
- Granola API — docs.granola.ai/introduction
- Granola MCP vs API — scalekit.com/blog/granola-mcp-vs-api
- Granola MCP y plan gratis — github.com/moona3k/granola-export
- Precios de Granola — granola.ai/blog/granola-pricing-startups-free-trial-discounts · usecarly.com/blog/granola-pricing
- Plugin Granola Sync para Obsidian — community.obsidian.md/plugins/granola-sync · dev.obsidianstats.com/plugins/granola-sync
- Precios y nivel gratis de la API de Gemini — ai.google.dev/pricing · geotoolbox.ai/blog/gemini-api-pricing
- Modelos Gemini y retiro de 2.5 — claw.aguidetocloud.com/google/gemini-api/models
- Términos adicionales de la API de Gemini (edad) — ai.google.dev/gemini-api/terms
- Anthropic: organizaciones que atienden a menores — support.claude.com/en/articles/9307344
- Procrastinación y hábitos de estudio — timeshighereducation.com/node/745373 · kahoot.com/press/2024/10/29/study-habits-snapshot-2024
- Exportar calendario de Moodle — docs.moodle.org/404/en/Calendar_export
- Nueva LFPDPPP 2025 — iapp.org · garrigues.com
