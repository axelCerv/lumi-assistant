---
type: guia
source: lumi
---
# Bienvenida a tu cerebro con Lumi

Este vault es la memoria de Lumi. Todo vive aquí, en archivos Markdown en tu computadora: si un día dejas de usar Lumi, lo conservas todo y lo sigues abriendo con Obsidian.

## Cómo está organizado

| Carpeta | Qué guarda |
|---|---|
| `00-Inbox` | Tus notas rápidas tal como las escribiste |
| `01-Diario` | Una nota por día |
| `02-Reuniones` | Reuniones de Granola, organizadas por año y mes |
| `03-Pendientes` | Pendientes sueltos (los demás pueden vivir en cualquier nota) |
| `04-Proyectos` | Una nota por proyecto |
| `05-Clientes` | Una nota por cliente |
| `06-Personas` | Una nota por persona |
| `07-Rutinas` | Tus rutinas y hábitos |
| `08-Conocimiento` | Ideas, referencias y notas libres |
| `10-Escuela` | Modo Escuela: tus materias, apuntes, tarjetas de repaso y entregas |
| `20-Personal` | Modo Personal: pagos, listas, metas y eventos |
| `90-Lumi` | Tu perfil, tus preferencias, cómo es Lumi en cada modo (`modos/`), la memoria y los resúmenes |
| `99-Plantillas` | Plantillas para crear notas en Obsidian |

## Reglas de Lumi

- Lumi **nunca sobrescribe lo que tú escribes**. Solo crea archivos nuevos, agrega secciones que empiezan con `## Lumi · …` o edita archivos marcados con `source: lumi`.
- Si una nota tiene `lumi: privado` en su encabezado, Lumi no la envía a la IA.
- Las carpetas que pongas en `.lumiignore` Lumi no las lee nunca.
- Los pendientes usan el formato del plugin **Tasks**: `- [ ] Enviar propuesta a [[Acme]] ⏰ 17:00 📅 2026-10-15 #cliente/acme`. `⏰` es la hora del aviso.

## Modos

Lumi tiene modos: **Trabajo 💼**, **Escuela 📚** y **Personal 🏡** (y los que tú crees). Cada modo ve sus propias notas y pendientes; lo que no tiene modo (tu diario, tus personas, tu inbox) se ve en todos.

Una nota es de un modo si:
1. tiene `modo: escuela` (o trabajo, personal…) en su encabezado;
2. vive en la carpeta del modo (`10-Escuela`, `20-Personal`, `02-Reuniones`, `05-Clientes`…);
3. o lleva la etiqueta del modo: `#trabajo`, `#escuela/calculo`, `#personal`.
