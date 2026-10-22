# Estado de Lumi (v0.3.1 · 21 de octubre de 2026)

Comparación del roadmap del [plan maestro](plan-maestro.md) contra lo que está construido y verificado.

**Leyenda:**
- ✅ Hecho y probado (pruebas automáticas o la app corriendo).
- 🟡 Hecho, pero falta probarlo con tu cuenta o tu sistema.
- ⏳ Requiere algo de tu parte.

## Fase 0 — Validación técnica
| Tarea | Estado | Notas |
|---|---|---|
| OAuth del MCP de Granola (loopback) y listar reuniones | 🟡 | Usa el registro dinámico de cliente con retorno a `127.0.0.1:47821`. Probar con tu cuenta: *Ajustes → Granola → Probar conexión* muestra las herramientas del servidor. |
| Claude y Gemini con la misma interfaz | ✅ | Probado contra servidores simulados: streaming, herramientas y firmas de pensamiento de Gemini 3. Falta una prueba con claves reales. |
| Ventana flotante transparente siempre encima | ✅ | Probado en Linux: el avatar se arrastra, la burbuja se coloca a su lado y el panel se abre y cierra. Falta verlo en Mac y Windows. |
| Leer/escribir un vault e indexarlo con FTS5 | ✅ | 36 pruebas cubren las reglas de escritura, el índice, `.lumiignore` y `lumi: privado`. |

## Fase 1 — MVP local
| Tarea | Estado |
|---|---|
| Avatar + panel (desde el mockup) | ✅ |
| Onboarding: vault + proveedor de IA (7 pasos) | ✅ |
| Notas rápidas → Inbox; la IA las convierte en pendientes con fecha y etiquetas | ✅ Sin IA funciona con el lector local. |
| Chat con contexto (FTS + perfil + pendientes) | ✅ (con IA simulada) |
| Recordatorios con notificaciones nativas | ✅ Burbuja probada; la notificación del sistema depende de los permisos de tu SO. |
| Personalización del avatar (plan §14) | ✅ 13 colores de cuerpo (9 de la marca y 4 tonos de piel), 6 colores de ojos, antena para todos, 16 peinados y 15 prendas separados en ella, él, trabajo y para todos, 8 accesorios (casco y gorro de chef incluidos), 13 colores de ropa, 7 personajes estilo Lumi, editor, «Elige tu Lumi», cambios por chat con «Deshacer», ropa formal automática en reuniones y clic derecho «Cambiar mi look». 18 pruebas. Falta verlo en tu Mac. |

## Fase 2 — Reuniones
| Tarea | Estado |
|---|---|
| Calendario Google/Outlook | 🟡 El código está listo, pero el OAuth requiere tus IDs de cliente (README). El enlace iCal funciona ya y está probado, incluidos los eventos que se repiten. |
| Granola Bridge (MCP + API) → `02-Reuniones/` | 🟡 El formato y la deduplicación están probados. La lectura de la respuesta del MCP es flexible (JSON, XML o texto); falta confirmarla con datos reales. |
| Post-proceso: pendientes, decisiones, personas, clientes | 🟡 Usa el perfil rápido con JSON; falta probarlo con una reunión real. |

## Fase 3 — Memoria profunda
| Tarea | Estado |
|---|---|
| Embeddings locales + búsqueda híbrida | ✅ sqlite-vec probado con vectores simulados. El modelo real se descarga de Hugging Face la primera vez (en este entorno no había acceso, falta verlo en tu Mac). |
| Propuesta y confirmación de hechos de memoria | ✅ |
| Resúmenes semanales y mensuales | 🟡 Los periodos y la escritura están probados; falta probarlos con IA real. |
| Detección de hábitos y rutinas | ✅ |

## Fase 4 — Distribución (preparada)
| Tarea | Estado |
|---|---|
| Empaquetado `.dmg` / `.exe` | ✅ Configurado con electron-builder; el paquete de Linux se generó y corrió sin errores. |
| Firma y notarización (Mac), firma en Windows | ⏳ Se activa sola si agregas tus certificados como *secrets* (README). |
| Auto-actualización | 🟡 electron-updater desde GitHub Releases; funciona en cuanto publiques un release. |
| Landing y documentación de usuario | ⏳ El README cubre la instalación y el uso. |

## Fase 5 — Modos (v0.3)
Todo se probó con pruebas automáticas (97 en total, 42 nuevas) y con la app corriendo en Linux: capturas de cada pantalla, cambio de modo manual y por horario, sesión de estudio, repaso y onboarding como menor de edad.

### 5A · Núcleo
| Tarea | Estado | Notas |
|---|---|---|
| Esquema `Modo`, tres modos por defecto y modos propios | ✅ | Trabajo, Escuela y Personal; «+ Nuevo modo» con nombre, ícono y color. |
| Cambio manual | ✅ | Chip de modo en el panel (hasta el siguiente bloque, una hora, hasta mañana o fijo), clic derecho → Modo, ícono de la barra, chat (`cambiar_modo`) y atajo **Cmd/Ctrl+Opción/Alt+Mayús+1…9** (ver decisiones). Falta probar el atajo y los menús nativos en tu Mac. 🟡 |
| Horario semanal y precedencia | ✅ | Fijo > manual > calendario asignado o clase > horario > por defecto. Bloques que cruzan la medianoche. Editor con vista de la semana. |
| No cambiar a mitad de algo | ✅ | Espera si hay sesión de estudio, reunión en curso o chat en los últimos 2 minutos. |
| Alcance en índice y contexto de la IA; vista «Todo» | ✅ | Pendientes, reuniones (por calendario), rutinas, memoria, búsqueda y clientes se filtran por modo. |
| Look, tarjetas de «Hoy» y avisos por modo | ✅ | Parche de look por modo; silenciar avisos de otros modos (los urgentes y las reuniones sí pasan, marcados «de Trabajo»); horas sin avisos. |
| Burbuja al cambiar de modo, con «Deshacer» | ✅ | Solo en cambios automáticos y si no hay otro aviso en pantalla. |
| Instalaciones anteriores | ✅ | Los tres modos activos y un aviso único «Ahora tengo modos». |
| Pendientes por categoría según el modo | ✅ | Trabajo: cliente/proyecto. Personal: categoría. Escuela: materia o categoría. Modos propios: categoría (se puede cambiar en Ajustes → Modos). Funciona en el editor, la nota rápida (con y sin IA) y el chat (`crear_pendiente` con `categoria` / `materia`). |

### 5B · Escuela
| Tarea | Estado | Notas |
|---|---|---|
| Ciclo, materias y horario de clases | ✅ | Notas en `10-Escuela/Materias/<Materia>/`. Horario en texto libre («lun mie 9:00-10:30 A-204»). Aviso antes de cada clase. |
| Entregas de Moodle/Canvas | 🟡 | Enlace iCal de «entregas»; se copian a `10-Escuela/Entregas.md` con la etiqueta de la materia, sin duplicar y actualizando la fecha si cambia. Falta probar con un enlace real de tu escuela. |
| Classroom | 🟡 | Vía Google Calendar asignado al modo Escuela (necesita el OAuth de Google del README). |
| Plan inverso («Partir en pasos») | ✅ | Plantilla local siempre; con IA, pasos propuestos por el modelo rápido (validados: entre hoy y la entrega, en orden). |
| Semana cargada | ✅ | Un día con 3+ entregas, o 2 y un examen, o 6+ en la semana. Un aviso al día. |
| Tarjetas con repaso espaciado | ✅ | `Pregunta::Respuesta` (plugin Spaced Repetition), SM-2 sencillo; el avance vive en los datos de la app. |
| Preguntas desde apuntes | 🟡 | Con IA, lee la carpeta de la materia (sin notas privadas). Falta probar con una clave real. |
| Sesión de estudio | ✅ | 25 + 5 por defecto; el avatar se pone «concentrada» con cuenta regresiva. |
| Modo tutor | ✅ | En `90-Lumi/modos/escuela.md` y en el prompt; respeta `ia_permitida` de cada materia. |

### 5C · Personal
| Tarea | Estado |
|---|---|
| Tu día y cierre del día («¿paso lo de hoy a mañana?») | ✅ |
| Pagos y recibos recurrentes (mensuales y anuales), aviso días antes | ✅ Tapa números de tarjeta o cuenta. |
| Cumpleaños (campo `cumple` de cada persona) | ✅ |
| Listas (súper, casa…) | ✅ No cuentan como pendientes. |
| Hábitos filtrados por modo | ✅ |
| Revisión semanal | ✅ El resumen agrega una sección por modo. |

### 5D · Menores
| Tarea | Estado |
|---|---|
| Pregunta de edad en el onboarding y en Ajustes → Modos | ✅ |
| «Lumi sin IA»: ningún proveedor se usa (ni chat, ni notas, ni Granola) y se saltan esos pasos | ✅ Probado de punta a punta. |

## v0.3.1 — Burbuja que no se traba, recordatorios diarios y clientes desde tus carpetas
| Tarea | Estado | Notas |
|---|---|---|
| La burbuja se recupera sola si su ventana se cae o se congela | ✅ | Probado tumbando la ventana a propósito: Lumi la rehace y el aviso sale con botones que responden. También se rehace al volver de la suspensión, al desbloquear y si se reinicia la GPU. |
| Si la burbuja no aparece en 5 s, se rehace | ✅ | Vigilante por aviso. |
| El tamaño de la burbuja se ajusta si cambia después de dibujarse | ✅ | Evita que los botones queden fuera de la ventana. En Windows, la parte nueva podía quedar transparente y los clics la atravesaban. |
| Arrastre: si se pierde el «soltar», Lumi deja de seguir al mouse | ✅ | |
| Notificación del sistema solo si no estás frente a la compu | ✅ | Pasa tras 2 min sin actividad o con la pantalla bloqueada. Así no tapa los botones de la burbuja. |
| Bandeja: «¿Lumi se trabó? Reiniciar sus ventanas» y «Ver registro» | ✅ | Registro en `lumi.log`, dentro de la carpeta de datos de la app. |
| Recordatorios «🔔 Cada día» hasta marcarlos como hechos | ✅ | Formato `🔔 diario` en la línea. Sin hora usa tu hora de siempre. Botones: Hecho / En 2 h / Mañana. La nota rápida entiende «todos los días», «cada día» y «hasta que lo haga». |
| Clientes y proyectos desde tus carpetas (dentro o fuera del vault) | ✅ | Los detecta solo la primera vez y te avisa. Solo lee, nunca escribe. Genera `90-Lumi/clientes-y-proyectos.md` para la IA y la búsqueda. |
| Un proyecto siempre va dentro de un cliente | ✅ | Por su carpeta, por `cliente:` en su nota o porque tú lo asignas. Si guardas un pendiente con cliente y proyecto, Lumi lo aprende. |
| Selector cliente → proyecto con búsqueda (reemplaza las etiquetas sueltas) | ✅ | Primero el cliente y luego sus proyectos. Los que más usas aparecen arriba. Funciona con teclado. Con más de 5 etiquetas, el filtro de Pendientes es un solo menú. |
| Probar en Mac y Windows reales que ya no se traba | ⏳ | Si vuelve a pasar: bandeja → «Ver registro de Lumi» y mándame lo último. |

## Decisiones tomadas al construir
- **La interfaz llama al proceso principal y nunca a la IA directo.** Las claves no salen del proceso principal y se cifran con `safeStorage`.
- **Los embeddings corren en una ventana oculta (WASM), no con onnxruntime nativo.** Así se evitan módulos nativos difíciles de empaquetar en Mac (universal) y Windows.
- **Hora de los avisos:** se usa `⏰ HH:MM` antes de `📅`. El plugin Tasks no tiene hora y así sigue reconociendo la fecha.
- **Snooze sin tocar tus notas:** se guarda en el estado interno de Lumi, no en tus notas.
- **Notas del usuario:** al agregar secciones `## Lumi · …`, el encabezado YAML se conserva byte por byte.
- **Calendario por iCal además del OAuth:** permite usar el calendario hoy mismo, sin registrar apps en Google ni en Microsoft.
- **Apariencia en la configuración, no en el vault:** es preferencia de la app y no contexto del usuario. La IA solo la cambia con la herramienta validada.
- **La versión Tauri anterior quedó en `_version-tauri/`.** Se puede borrar.
- **Atajo de modos: Cmd/Ctrl + Opción/Alt + Mayús + número.** El plan decía Cmd/Ctrl+Mayús+número, pero en Mac Cmd+Mayús+3/4/5 son las capturas de pantalla, y en Windows con teclado en español Ctrl+Alt+número escribe símbolos (@, #…).
- **Días del horario: 0 = domingo … 6 = sábado**, igual que las rutinas (el plan decía 1 = lunes … 7 = domingo).
- **El modo activo no se guarda: se calcula** cada 20 s y cuando algo cambia. Solo se guarda el cambio manual (`modes.fijado`).
- **Calendarios a modos por nombre de calendario** (`modes.calendarios`), en un solo lugar; no hay `alcance.calendarios`.
- **Las etiquetas de los pendientes no cuentan como etiquetas de la nota.** Así una lista con pendientes de varios modos sigue siendo compartida. El índice sube a la versión 4 y se reconstruye solo una vez.
- **Modos apagados = compartido.** Si apagas Escuela, sus notas se ven en los demás modos (no desaparecen).
- **Cambio de look por chat con un modo que tiene look propio:** lo que cubre el look del modo se cambia en el modo; si no, no se vería.
- **Categorías = etiqueta del modo** (`#personal/casa`, `#escuela/tramites`), igual que las materias (`#escuela/calculo-i`): no se crean notas por categoría y el plugin Tasks puede filtrarlas. En Escuela, si la etiqueta coincide con una materia es materia; si no, categoría. Una categoría nueva se agrega sola a la lista del modo (`modes.lista[].categorias`). Configuraciones guardadas antes usan las categorías por defecto.
- **Gemini y menores:** «Lumi sin IA» bloquea cualquier proveedor en el proceso principal (no solo en la interfaz).
- **Recordatorio diario = `🔔 diario` en la línea** (no `🔁 every day`): en el plugin Tasks, `🔁` crea una copia nueva al completarlo. Aquí «Hecho» lo termina para siempre. Se avisa una vez por día (la clave del aviso lleva la fecha) y no cuenta para «¿paso lo de hoy a mañana?».
- **Clientes y proyectos de tus carpetas: solo lectura.** La carpeta puede estar dentro del vault (ruta relativa) o fuera (ruta completa). Lo que tú asignas (proyecto → cliente) se guarda en la configuración (`catalog.assign`). Los proyectos nuevos que creas con Lumi llevan `cliente: "[[…]]"` en su nota.
- **Etiquetas del pendiente: `#cliente/x #proyecto/y`.** Si una línea solo trae el proyecto, Lumi muestra también su cliente. No reescribe la línea.
- **La burbuja se rehace en vez de repararse:** si su ventana se cae, no responde o no aparece a tiempo, se destruye y se crea otra, que pide el aviso actual al cargar.
