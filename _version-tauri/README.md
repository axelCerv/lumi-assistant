# Lumi · tu asistente flotante

Lumi es un pequeño avatar que flota siempre encima de tus ventanas. Puedes arrastrarlo a cualquier parte de la pantalla y, al darle clic, abre un menú con tus pendientes, tus reuniones y una caja de **nota rápida**.

Cada nota se convierte en un recordatorio. Cuando llega la hora, Lumi "habla" con una burbuja de texto junto al avatar. Se conecta a **Claude** para entender tus notas, responder preguntas y aprender de ti.

Funciona en **Mac** y **Windows**. Se instala con un `.dmg` en Mac y con un `-setup.exe` en Windows.

---

## Qué hace

| | |
|---|---|
| **Avatar flotante** | Siempre visible y arrastrable. Lleva un contador de pendientes de hoy y cambia de expresión (habla, avisa de reuniones, piensa). |
| **Nota rápida → recordatorio** | Escribe, por ejemplo, «mandar correo hoy a Laura antes de comer @GrupoNorte». Lumi saca el qué, el cuándo (hoy 13:00), las etiquetas y el contacto. Antes de guardar puedes corregir cualquier campo. |
| **Etiquetas** | `@Cliente` y `#Proyecto`, por ejemplo `@Grupo_Norte`. Puedes filtrar tus pendientes por etiqueta. |
| **Burbuja de aviso** | Te muestra recordatorios, reuniones que están por empezar, rutinas y el saludo del día. Tiene botones de *Hecho*, *En 30 min* y *Unirme*. |
| **Calendario** | Lee tu calendario de Google u Outlook con su enlace iCal privado y te avisa X minutos antes de cada reunión. |
| **Pregúntale (Claude)** | Un chat que conoce tus pendientes, reuniones, rutinas y memoria. Te sugiere qué hacer y puede crear recordatorios. |
| **Memoria** | Lumi te propone guardar datos útiles («Laura prefiere correo»). Tú decides qué se guarda, y puedes verlo o borrarlo en Ajustes. |
| **Rutinas** | Tú creas tus rutinas, y Lumi detecta lo que haces seguido (3 semanas o más el mismo día) para proponértelo como rutina. |
| **Bandeja / barra de menú** | Un ícono para mostrar, esconder o salir de Lumi. En Mac no aparece en el Dock. |

Todo se guarda **solo en tu computadora**, en un archivo `lumi-datos.json` dentro de la carpeta de datos de la app (en Ajustes puedes ver dónde está). Tu clave de Claude va al llavero del sistema: Llavero de macOS o Administrador de credenciales de Windows.

---

## Instalar en Mac o Windows sin programar (recomendado)

Los instaladores se generan solos en GitHub:

1. Crea un repositorio en GitHub, que puede ser privado, y sube esta carpeta. El primer comando pone el archivo de compilación en la carpeta que GitHub espera (`.github/workflows`):
   ```bash
   mkdir -p .github/workflows && mv ci/instaladores.yml .github/workflows/
   git init && git add . && git commit -m "Lumi 0.1"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/lumi.git
   git push -u origin main
   ```
2. En GitHub ve a **Actions → Instaladores → Run workflow**.
3. La compilación tarda unos 10–15 minutos. Al terminar, abre la ejecución y descarga los instaladores desde **Artifacts**:
   - `lumi-mac` contiene `Lumi_0.1.0_universal.dmg`, que funciona en Mac Apple Silicon e Intel.
   - `lumi-windows` contiene `Lumi_0.1.0_x64-setup.exe`.

Para publicar una versión con su página de descarga, ejecuta `git tag v0.1.0 && git push --tags`. Se crea un *Release* en borrador con los dos instaladores.

### La primera vez que lo abres

La app no está firmada con un certificado de pago, así que el sistema te pide confirmación una vez:

- **Mac:** arrastra Lumi a *Aplicaciones* e intenta abrirlo. Cuando macOS lo bloquee, ve a **Configuración del Sistema → Privacidad y seguridad → «Abrir de todos modos»**.
  Si en lugar de eso dice que la app «está dañada», ejecuta esto en Terminal y vuelve a abrirla:
  `xattr -cr /Applications/Lumi.app`
  Si compilas Lumi en tu propia Mac (siguiente sección), no aparece ninguna advertencia.
- **Windows:** si aparece «Windows protegió su PC», elige **Más información → Ejecutar de todas formas**.

---

## Compilarlo en tu propia computadora

### Requisitos (una sola vez)

**Mac**
```bash
xcode-select --install                                   # herramientas de Apple
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
# Node.js 20 o más nuevo: https://nodejs.org (o: brew install node)
```

**Windows**
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): marca «Desarrollo para el escritorio con C++».
- [Rust](https://www.rust-lang.org/tools/install), con `rustup-init.exe`.
- [Node.js](https://nodejs.org) 20 o más nuevo.
- WebView2 ya viene en Windows 10 y 11.

### Comandos

```bash
npm install          # la primera vez
npm run app          # abre Lumi en modo desarrollo (se recarga al guardar cambios)
npm run instalador   # genera el instalador del sistema donde lo corres
```

El instalador queda en:
- Mac: `src-tauri/target/release/bundle/dmg/Lumi_0.1.0_aarch64.dmg`
- Windows: `src-tauri\target\release\bundle\nsis\Lumi_0.1.0_x64-setup.exe`

> La primera compilación de Rust tarda varios minutos; las siguientes son mucho más rápidas.

---

## Configurar Lumi

1. **Tu nombre:** Lumi te lo pregunta la primera vez que lo abres.
2. **Claude:** ve a Ajustes → Inteligencia y pega tu clave de API, que creas en [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Usa **Probar conexión** para confirmar que funciona. Sin clave, Lumi sigue funcionando con su lector de notas básico.
3. **Calendario:** ve a Ajustes → Correo y calendario → *Agregar calendario*.
   - **Google:** abre Google Calendar en la web → ⚙ Configuración → elige tu calendario → *Integrar el calendario* → copia la **Dirección secreta en formato iCal**.
   - **Outlook:** abre Outlook en la web → ⚙ → Calendario → *Calendarios compartidos* → **Publicar un calendario** → «Puede ver todos los detalles» → copia el enlace **ICS**.
4. **Abrir al iniciar sesión:** actívalo en Ajustes → Comportamiento.

### Cómo escribir notas

| Escribes | Lumi entiende |
|---|---|
| `llamar al contador mañana a las 5` | mañana 17:00 |
| `revisar contrato el jueves 10:30 @Despacho_Ruiz` | jueves 10:30 · cliente Despacho Ruiz |
| `subir avances #Rediseño_web hoy en la tarde` | hoy 16:00 · proyecto Rediseño web |
| `mandar factura en 30 minutos` | dentro de 30 min |
| `pagar tarjeta el 20` | día 20 a las 9:00 |
| `junta con Pedro el próximo lunes en la mañana` | lunes 9:00 · contacto Pedro |
| `comprar regalo` | sin fecha: en 1 hora (o mañana 9:00 si ya es noche) |

También entiende «antes de comer» (13:00), «al final del día» (18:00), «la próxima semana» y «15 de noviembre». Con Claude conectado, la lectura es más inteligente: por ejemplo, si en la memoria dice que Laura trabaja con Grupo Norte, la nota se etiqueta sola.

---

## Cómo está hecho

```
LUMI/
├─ src-tauri/                 ← lado nativo (Rust + Tauri 2)
│  ├─ src/lib.rs              ventanas, datos, llavero, Claude, calendarios, bandeja
│  ├─ tauri.conf.json         las 3 ventanas transparentes y el instalador
│  └─ icons/                  íconos de la app (generados de app-icon.png)
├─ src/                       ← interfaz (React + TypeScript)
│  ├─ avatar/main.tsx         avatar arrastrable + el "reloj" que decide qué avisar
│  ├─ bubble/main.tsx         burbuja de texto junto al avatar
│  ├─ panel/                  menú: Hoy/Pendientes/Reuniones, nota, chat, rutinas, ajustes
│  ├─ lib/parse.ts            lector de notas en español (sin IA)
│  ├─ lib/claude.ts           contexto, chat y lectura de notas con Claude
│  ├─ lib/calendar.ts         lectura de calendarios iCal (con eventos que se repiten)
│  └─ lib/routines.ts         detección de rutinas
├─ ci/instaladores.yml        compila los instaladores en GitHub (muévelo a .github/workflows/)
└─ Asistente flotante.html    el diseño original (mockup)
```

- **Tres ventanas:** `avatar` (96×104 px), `bubble` y `panel`. Las tres son transparentes, sin bordes y siempre encima. El lado nativo coloca la burbuja y el menú a la izquierda o a la derecha del avatar según el espacio libre, y los mueve con él cuando lo arrastras.
- **Datos:** un solo JSON. Cada ventana guarda con un número de versión, así que si dos guardan al mismo tiempo, una reintenta y ninguna pisa a la otra.
- **Avisos:** el avatar revisa cada 20 s, en este orden: saludo del día → reuniones → recordatorios vencidos → rutinas → sugerencias (una vez al día). Muestra un aviso a la vez y, si el menú está abierto, espera a que lo cierres.
- **Modelo de Claude:** se elige en Ajustes. Por defecto es `claude-sonnet-5-5`.

### Siguientes pasos posibles
- Conexión directa con la cuenta de Gmail u Outlook (OAuth) para leer correos y crear borradores.
- Dictado por voz para las notas rápidas.
- Actualizaciones automáticas (plugin *updater* de Tauri) y firma de código para quitar las advertencias de instalación.
