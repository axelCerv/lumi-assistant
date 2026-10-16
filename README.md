# Lumi · tu asistente flotante con cerebro propio

Lumi es un avatar que flota encima de tus ventanas en **Mac y Windows**. Al darle clic abre un panel con tus pendientes, tus reuniones y un chat. Su diferencia es que **tiene tu "cerebro"**: todo tu contexto de vida, trabajo y estudios vive **en tu computadora**, en un vault de Obsidian, y se alimenta solo con las reuniones que graba Granola. La IA (Claude o Gemini, con tu propia clave) lo usa para responderte, recordarte cosas y sugerirte qué hacer.

Desde la v0.3 Lumi tiene **modos: Trabajo 💼, Escuela 📚 y Personal 🏡** (y los que crees). Cambia sola según tu horario o cuando tú quieras.

> Plan completo y decisiones: [`docs/plan-maestro.md`](docs/plan-maestro.md) · Qué está hecho y qué falta validar: [`docs/ESTADO.md`](docs/ESTADO.md)

---

## Qué hace

- **Modos** (Trabajo, Escuela, Personal y los tuyos). Cada modo ve sus propias notas y pendientes; lo que no tiene modo (diario, personas, inbox) se ve en todos. Cambian:
  - **solos**, por tu horario semanal, por un calendario asignado a un modo o por el horario de tus clases;
  - **a mano**: el chip de modo en el panel, clic derecho sobre Lumi → Modo, el ícono de la barra, el atajo <kbd>Cmd/Ctrl</kbd>+<kbd>Opción/Alt</kbd>+<kbd>Mayús</kbd>+<kbd>1…9</kbd> o pidiéndolo en el chat («modo personal hasta mañana»).
  
  Lumi nunca cambia sola a mitad de una sesión de estudio, una reunión o un chat. Cada modo tiene su personalidad (`90-Lumi/modos/<modo>.md`), sus tarjetas en «Hoy», su look y, si quieres, su propia IA. La vista «Todo» muestra todo a la vez.

  Los pendientes se ordenan según el modo: en **Trabajo** por cliente y proyecto; en **Personal** por categoría (Casa, Compras, Finanzas, Salud, Familia, Trámites…); en **Escuela** por materia o categoría (Trámites, Extracurricular, Servicio social…). En Obsidian quedan como etiqueta del modo: `#personal/casa`, `#escuela/calculo-i`. En una nota rápida de Personal, `#súper` es la categoría y `@Ana` una persona. Las categorías nuevas se guardan solas en el modo, y en *Ajustes → Modos* puedes editarlas o elegir cómo se ordena cada modo.
- **Modo Escuela**: materias con horario (aviso antes de cada clase), entregas importadas de Moodle o Canvas, «Partir en pasos» (plan inverso con un primer paso de 5 minutos), aviso de semana cargada, tarjetas de repaso con repaso espaciado (y preguntas generadas de tus apuntes con IA), sesión de estudio tipo Pomodoro con el avatar y modo tutor (explica y revisa; no hace la tarea por ti).
- **Modo Personal**: tu día y cierre del día («¿paso lo de hoy a mañana?»), pagos y recibos recurrentes, cumpleaños, listas (súper, casa…) y hábitos.
- **Lumi sin IA** para menores de 18: todo lo local funciona (horario, recordatorios, entregas, tarjetas, sesiones de estudio y modos) sin usar ningún servicio de IA.
- **Avatar flotante** que puedes arrastrar a cualquier parte. Cambia de cara según lo que pasa (habla, avisa de una reunión, piensa) y muestra cuántos pendientes tienes hoy.
- **Lumi a tu gusto**: elige entre 7 personajes y cámbiale color de cuerpo (rosa, rojo, menta, cielo… o tono de piel), color de ojos, antena, cabello, ropa (para ella, para él y de trabajo: camisa, corbata, jersey, blusa, vestido, bata, delantal, chaleco…), lentes y accesorios en *Ajustes → Apariencia*, con clic derecho sobre Lumi o pidiéndoselo en el chat («ponte lentes de sol»). Si quieres, se pone ropa formal sola cuando tienes reunión.
- **Notas rápidas → pendientes**: escribes «mandar correo mañana a Laura antes de comer @GrupoNorte». Lumi guarda la nota original en `00-Inbox`, entiende el qué, el cuándo y el cliente, y crea el pendiente en `03-Pendientes` con el formato del plugin Tasks de Obsidian.
- **Burbuja de aviso** junto al avatar, más una notificación del sistema. Sirve para:
  - recordatorios,
  - reuniones por empezar (con «Unirme» y «Abrir Granola»),
  - rutinas,
  - el saludo del día,
  - resúmenes listos.
- **Pendientes de todo tu vault**: cualquier `- [ ]` con `📅` en cualquier nota aparece en Lumi, y lo puedes marcar desde ahí.
- **Chat con contexto**: conoce tu perfil, tu agenda, tus pendientes, tu memoria y busca en tus notas. Responde citando las notas, que se abren en Obsidian con un clic, y puede crearte pendientes.
- **Memoria con confirmación**: Lumi propone datos («¿Guardo que Acme renueva en enero?») y solo los que aceptas se guardan en `90-Lumi/memoria/`.
- **Búsqueda híbrida**: combina texto (SQLite FTS5) con significado (embeddings locales y gratuitos), la recencia de la nota y sus enlaces a clientes y personas.
- **Granola → Obsidian**: cada reunión grabada se guarda en `02-Reuniones/AAAA/MM/` con su resumen, tus notas y la transcripción. Si lo activas, la IA extrae pendientes, decisiones, personas y cliente o proyecto.
- **Calendario**: Google Calendar y Outlook vía OAuth, o cualquier enlace iCal privado.
- **Rutinas y hábitos**: tus rutinas viven en `07-Rutinas/`. Lumi detecta lo que haces seguido y te propone convertirlo en rutina.
- **Resúmenes** semanales (los lunes) y mensuales (el día 1), en `90-Lumi/resumenes/`.

---

## Empezar en tu Mac

Necesitas instalar dos cosas, una sola vez:

```bash
xcode-select --install            # herramientas de Apple (si ya las tienes, te avisa)
# Node.js 20 o más nuevo: descarga la versión LTS de https://nodejs.org
```

> Ya **no** necesitas Rust: esta versión usa Electron, no Tauri.

Luego, en Terminal:

```bash
cd ~/Documents/PROGRAMACION/LUMI
npm install          # 2–4 min la primera vez
npm run app          # abre Lumi en modo desarrollo
```

Lumi aparece abajo a la derecha y abre su **onboarding**, que tiene ocho pasos:

1. **Bienvenida.** Lumi te explica que tu información se queda en tu computadora.
2. **Para qué.** Tu edad (con menos de 18, Lumi sin IA) y qué modos usarás: Trabajo, Escuela, Personal. Con varios, un horario rápido («entre semana de 7 a 14, Escuela»).
3. **Vault.** Puedes crear uno nuevo (`~/Documents/LumiVault`) o usar el que ya tienes en Obsidian. Lumi solo agrega sus carpetas y nunca toca tus notas.
4. **IA.** Elige Claude o Gemini, pega tu clave y prueba la conexión. Si eliges Gemini, verás el aviso de privacidad de su plan gratis.
5. **Calendario.** Conecta Google u Outlook, o pega un enlace iCal. Si usas Escuela, también el enlace del calendario de Moodle o Canvas.
6. **Granola.** Conéctalo por OAuth, o con una API key si tienes el plan Business. Aquí también está el aviso de consentimiento de grabación.
7. **Conóceme.** Con tu nombre, tu trabajo, tus clientes, tus proyectos, tus materias y tus rutinas, Lumi crea `perfil.md` y las notas que hagan falta.
8. **Indexado.** Lumi lee tu vault y muestra el avance con una barra de progreso.

Los pasos 4 a 6 se pueden dejar «Para más tarde» y configurar después en **Ajustes**. Para menores de 18 se saltan los pasos de IA y Granola.

Si ya usabas Lumi 0.2, al abrir la 0.3 te saluda con «Ahora tengo modos». Los tres vienen activos; ajústalos en **Ajustes → Modos** (o apaga los que no uses: con uno solo, Lumi esconde todo lo de modos).

### Crear el instalador

```bash
npm run instalador:mac     # en tu Mac → apps/desktop/dist/Lumi-0.3.0-arm64.dmg y -x64.dmg
npm run instalador:win     # en una PC con Windows → apps/desktop/dist/Lumi-0.3.0-Instalador.exe
```

El `.exe` también se puede generar desde Mac o Linux si instalas Wine (`brew install --cask wine-stable` en Mac). Así se generó el instalador de la v0.2.0 que está en `instaladores/windows/`. La carpeta `instaladores/` no se sube a GitHub, porque el archivo pesa más de 100 MB.

La forma más confiable de obtener los dos instaladores sin una PC con Windows es GitHub:

```bash
mkdir -p .github/workflows && mv ci/instaladores.yml .github/workflows/
git init && git add . && git commit -m "Lumi 0.3"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/lumi.git
git push -u origin main
```

En GitHub, ve a **Actions → Instaladores → Run workflow**. Al terminar, descarga los instaladores desde **Artifacts**.

Si subes una etiqueta (`git tag v0.3.0 && git push --tags`), se crea un *Release* y las apps instaladas se actualizan solas. Antes cambia `owner` en `apps/desktop/electron-builder.yml`, o déjalo así: el flujo de GitHub lo llena por ti.

**La primera vez que lo abres sin certificado de pago:**
- **Mac:** si macOS lo bloquea, ve a *Configuración del Sistema → Privacidad y seguridad → Abrir de todos modos*. Si dice que la app «está dañada», ejecuta `xattr -cr /Applications/Lumi.app`. Si la compilas tú en tu Mac, no aparece ninguna advertencia.
- **Windows:** si aparece «Windows protegió su PC», elige *Más información → Ejecutar de todas formas*.

---

## Calendario con un clic (OAuth)

Para el botón «Conectar», Lumi necesita un ID de cliente tuyo. Se configura una sola vez y sirve para todos los usuarios de tu build. Mientras no lo tengas, usa el **enlace iCal privado** de tu calendario: funciona igual y no requiere nada.

**Google Calendar**
1. En [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto y habilita **Google Calendar API**.
2. En *Pantalla de consentimiento OAuth*, elige tipo externo, agrega el permiso `calendar.readonly` y añade tu correo como usuario de prueba.
3. En *Credenciales → Crear credenciales → ID de cliente de OAuth*, elige el tipo **App de escritorio**.
4. Copia el ID y el secreto en `apps/desktop/.env` (parte de `.env.example`):
   ```
   MAIN_VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   MAIN_VITE_GOOGLE_CLIENT_SECRET=GOCSPX-…
   ```

**Outlook / Microsoft 365**
1. En [entra.microsoft.com](https://entra.microsoft.com), ve a *Registros de aplicaciones → Nuevo registro*. Elige «Cuentas de cualquier directorio y cuentas personales».
2. En *Autenticación → Agregar plataforma → Aplicaciones móviles y de escritorio*, agrega `http://localhost`.
3. En *Permisos de API*, agrega los permisos delegados `Calendars.Read`, `User.Read` y `offline_access`.
4. Copia el *ID de la aplicación (cliente)* en `.env`:
   ```
   MAIN_VITE_MICROSOFT_CLIENT_ID=…
   ```

También puedes pegar estos valores sin recompilar, en *Ajustes → Calendario → Credenciales OAuth propias*. Para el flujo de GitHub, guárdalos como *secrets* con esos mismos nombres.

---

## Granola

- **Conectar con Granola (recomendado):** usa el servidor MCP oficial (`mcp.granola.ai`). Abre tu navegador para autorizar a Lumi y no necesita clave. En el plan gratis Granola solo expone ~30 días, por eso Lumi copia cada reunión a tu vault: mientras sincronice al menos una vez al mes, no se pierde nada.
- **API key (plan Business):** créala en Granola, en *Settings → Connectors → API keys* (empieza con `grn_`).
- Lumi sincroniza al abrir y cada 15 minutos, y nunca duplica una reunión (usa `granola_id`).
- En *Ajustes → Granola → Probar conexión* ves qué herramientas ofrece el servidor y cuántas reuniones encontró.
- Respaldo: si usas el plugin «Granola Sync» de Obsidian, cualquier nota que deje en tu vault también entra al índice de Lumi.

---

## Tu vault

```
LumiVault/
├── 00-Inbox/        notas rápidas tal como las escribiste
├── 01-Diario/       notas diarias (Lumi lee la de hoy)
├── 02-Reuniones/    AAAA/MM/AAAA-MM-DD-titulo.md (desde Granola)
├── 03-Pendientes/   Pendientes.md (los que creas con Lumi)
├── 04-Proyectos/ 05-Clientes/ 06-Personas/
├── 07-Rutinas/      una nota por rutina (dias, hora, activa)
├── 08-Conocimiento/
├── 10-Escuela/      modo Escuela: Materias/<Materia>/ (nota, apuntes, «Repaso - Materia.md»), Entregas.md, Ciclo.md
├── 20-Personal/     modo Personal: Pagos.md, Listas/, Salud/, Metas/, Eventos/
├── 90-Lumi/         perfil.md · preferencias.md · modos/ · memoria/ · resumenes/
├── 99-Plantillas/
└── .lumiignore      carpetas que Lumi nunca lee
```

**Reglas:**
- Lumi **nunca sobrescribe lo que tú escribes**. Solo hace tres cosas:
  - crear archivos nuevos;
  - agregar secciones `## Lumi · …`, conservando tu texto y tu encabezado exactamente igual;
  - editar archivos con `source: lumi`.
- Las notas con `lumi: privado` en su encabezado, y todo lo que esté en `.lumiignore`, nunca se envían a la IA.
- Los pendientes usan el formato del plugin Tasks: `- [ ] Enviar propuesta a [[Acme]] ⏰ 17:00 📅 2026-10-15 #cliente/acme`. `⏰` es la hora del aviso; si falta, Lumi avisa a las 9:00 (puedes cambiarlo en Ajustes).
- **Modo de cada cosa.** Una nota es de un modo si tiene `modo: escuela` en su encabezado, si vive en la carpeta del modo o si lleva su etiqueta (`#trabajo`, `#escuela/calculo-i`, `#personal`). Un pendiente con su propia etiqueta de modo manda sobre su nota. Lo que no tiene modo es compartido.
- **Tarjetas de repaso**: una por línea, `Pregunta::Respuesta` (formato del plugin Spaced Repetition). El avance del repaso se guarda en los datos de la app, no en tus notas.
- **Pagos**: `- Renta · día 5 · $8,500` (mensual) o `- Seguro · 15/04 · $6,200` (anual). Lumi tapa cualquier cosa que parezca número de tarjeta o de cuenta.
- **Cumpleaños**: `cumple: 03-15` en el encabezado de la persona (`06-Personas/`).
- Tus claves (IA, Granola, calendario) se guardan cifradas con el llavero del sistema, nunca en el vault.
- El índice (SQLite) vive en la carpeta de datos de la app y se puede reconstruir en cualquier momento.

---

## Desarrollo

`npm run app` recarga solas las ventanas y, desde la v0.2, también reinicia el proceso principal cuando cambia su código (`electron-vite dev --watch`). Si alguna vez un cambio no aparece, cierra Lumi desde el icono de la barra y vuelve a correr `npm run app`.

```
LUMI/
├── apps/desktop/                Electron + React + TypeScript
│   ├── src/main/
│   │   ├── vault/               vault.ts (reglas de escritura) · structure.ts · brain.ts · ignore.ts
│   │   ├── index/               db.ts (SQLite FTS5 + sqlite-vec) · indexer.ts · search.ts · embeddings.ts
│   │   ├── llm/                 claude.ts · gemini.ts · provider.ts · tools.ts · agent.ts
│   │   ├── granola/             mcp-client.ts · api-client.ts · mapper.ts · sync.ts
│   │   ├── calendar/            oauth.ts (loopback + PKCE) · providers.ts (Google/Microsoft) · ics.ts
│   │   ├── memory/              context-builder.ts · extractor.ts · facts.ts · summaries.ts · habits.ts
│   │   ├── modes/               modo activo: horario, calendarios, clases, cambios manuales y «Deshacer»
│   │   ├── school/              entregas de Moodle/Canvas, plan inverso, tarjetas, sesión de estudio
│   │   ├── personal/            pagos, cumpleaños y listas para la interfaz
│   │   ├── scheduler/           avisos, rutinas, resúmenes
│   │   ├── secrets/             safeStorage
│   │   └── windows.ts · ipc.ts · core.ts · updater.ts · index.ts
│   ├── src/preload/             puente seguro window.lumi
│   ├── src/renderer/            avatar · burbuja · panel (onboarding, chat, memoria, modos, escuela, personal…) · brain (embeddings)
│   └── test/                    97 pruebas (vault, índice, búsqueda, IA simulada, iCal, Granola, modos, escuela, personal)
├── packages/shared/             tipos, esquemas zod, interfaz LLMProvider, formato Tasks, lector de notas, modos, escuela, personal
├── templates/vault/             estructura y plantillas iniciales del vault
├── docs/                        plan maestro y estado
└── ci/instaladores.yml          compilación en GitHub (muévelo a .github/workflows)
```

```bash
npm run app          # desarrollo con recarga
npm run typecheck    # TypeScript en todo el proyecto
npm test             # pruebas
```

- **Modelos:** se configuran en Ajustes, nunca están fijos en el código. Hay dos perfiles por proveedor: *rápido* (notas, extracción) e *inteligente* (chat, resúmenes). Por defecto:
  - Claude Haiku 5.5 / Sonnet 5.5;
  - Gemini 3.5 Flash-Lite / 3.8 Flash.
- **Embeddings:** `Xenova/multilingual-e5-small` (384 dimensiones) corre en una ventana oculta con transformers.js. Se descarga una vez (~120 MB) y queda en caché. Si no está disponible, la búsqueda sigue funcionando por texto.

---

## Solución de problemas

- **«Búsqueda por significado: no disponible».** El modelo se descarga de Hugging Face la primera vez. Revisa tu internet y usa *Ajustes → Volver a indexar*.
- **Lumi no aparece.** Busca su ícono en la barra de menú (Mac) o en la bandeja junto al reloj (Windows) y elige «Mostrar a Lumi».
- **Granola expiró.** Usa *Ajustes → Granola → Desconectar* y vuelve a conectarlo.
- **Los atajos de modo no responden.** Otra app puede usar <kbd>Cmd/Ctrl</kbd>+<kbd>Opción/Alt</kbd>+<kbd>Mayús</kbd>+número; usa el chip de modo o el clic derecho. (No se usa <kbd>Cmd</kbd>+<kbd>Mayús</kbd>+número porque 3, 4 y 5 son las capturas de pantalla de macOS.)
- **Quiero empezar de cero.** Borra la carpeta de datos de la app (`~/Library/Application Support/Lumi` en Mac, `%APPDATA%\Lumi` en Windows). Tu vault no se toca.
