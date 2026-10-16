# Lumi · Guía rápida de instalación

Carpeta del proyecto en la Mac: `~/Documents/PROGRAMACION/LUMI`

## 1. Instalar en Windows (ya listo)
- Instalador ya generado (v0.2.0): `LUMI/instaladores/windows/Lumi-0.2.0-Instalador.exe` (120 MB).
- Pásalo a la PC (USB, Drive…) y dale doble clic.
- Si sale «Windows protegió su PC» → **Más información → Ejecutar de todas formas** (pasa porque la app no tiene un certificado de pago).
- Instala solo para tu usuario, sin permisos de administrador. Te deja elegir la carpeta y crea accesos directos en el escritorio y en el menú Inicio.
- Lumi aparece flotando. Su ícono queda en la bandeja junto al reloj. Si no lo ves: clic derecho → «Mostrar a Lumi».
- La carpeta `instaladores/_partes` sobra y se puede borrar.
- Pendiente: esta versión no trae los IDs de Google/Microsoft, así que conectar Gmail/Outlook no funciona. El calendario por enlace iCal sí funciona.

## 2. Generar un instalador nuevo de Windows
**Opción A: GitHub Actions** (la más confiable, hace Mac y Windows)
```bash
cd ~/Documents/PROGRAMACION/LUMI
mkdir -p .github/workflows && mv ci/instaladores.yml .github/workflows/
git init && git add . && git commit -m "Lumi 0.2"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/lumi.git
git push -u origin main
```
En GitHub: **Actions → Instaladores → Run workflow** y descarga `lumi-windows` desde *Artifacts*.
Con `git tag v0.2.0 && git push --tags` se crea un Release y las apps se actualizan solas.

**Opción B: desde la Mac con Wine**
```bash
brew install --cask wine-stable
cd ~/Documents/PROGRAMACION/LUMI
npm run instalador:win
```
El resultado queda en `apps/desktop/dist/Lumi-<versión>-Instalador.exe`.

**Opción C: en una PC con Windows.** Instala Node 20 o más reciente, copia la carpeta sin `node_modules` y corre `npm install`, luego `npm run instalador:win`.

## 3. Instalar en Mac
```bash
cd ~/Documents/PROGRAMACION/LUMI
npm run instalador:mac
```
Genera `apps/desktop/dist/Lumi-<versión>-arm64.dmg` y `-x64.dmg`. Abre el `.dmg` y arrastra Lumi a Aplicaciones.
- Si macOS lo bloquea: *Configuración del Sistema → Privacidad y seguridad → Abrir de todos modos*.
- Si dice que «está dañada»: `xattr -cr /Applications/Lumi.app`.

## 4. Correrla en modo desarrollo (Mac)
```bash
cd ~/Documents/PROGRAMACION/LUMI
npm install
npm run app
```

## 5. Actualizaciones remotas (auto-update)
Lumi ya incluye el actualizador (electron-updater con GitHub Releases). Al abrirse y luego cada 6 horas, busca si hay una versión nueva. Si la hay, la descarga en silencio y la instala al cerrar Lumi, o cuando el usuario elige *Ajustes → Reiniciar y actualizar*. El vault, los ajustes y las claves no se tocan.

**Preparación (una sola vez)**
1. Crea el repositorio en GitHub. El actualizador solo lee Releases de repos **públicos**. Si quieres el código privado, usa un segundo repo público solo para los instaladores (p. ej. `lumi-releases`).
2. En `apps/desktop/electron-builder.yml`, bajo `publish:`, cambia `owner: TU_USUARIO_DE_GITHUB` por tu usuario real. Haz lo mismo con `repo` si el repo se llama distinto.
3. ⚠️ El instalador v0.2.0 que ya existe apunta a `TU_USUARIO_DE_GITHUB`, así que **nunca encontrará actualizaciones**. Hay que generar un instalador nuevo con el owner correcto e instalarlo **una vez a mano** en cada PC. A partir de ahí, las siguientes versiones ya llegan solas.

**Cada vez que saques una versión nueva**
```bash
cd ~/Documents/PROGRAMACION/LUMI
npm version patch -w @lumi/desktop --no-git-tag-version   # 0.2.0 → 0.2.1 (la versión DEBE subir)
git add . && git commit -m "Lumi 0.2.1"
git tag v0.2.1                                             # la etiqueta debe coincidir con la versión
git push && git push --tags
```
- GitHub Actions genera los instaladores y crea un Release en **borrador** con el `.exe`, el `latest.yml` y el `.blockmap`.
- En GitHub ve a **Releases**, abre el borrador y elige **Publish release**. Mientras siga en borrador, nadie recibe la actualización. Así puedes revisarla antes de soltarla.
- Las PCs con Lumi la reciben en menos de 6 horas, o al instante si abren *Ajustes → Buscar actualizaciones*.

**Limitaciones**
- **Windows:** funciona sin certificado.
- **Mac:** la actualización automática exige firmar la app con un certificado de Apple Developer (US$99 al año). Sin él, en Mac hay que bajar e instalar el `.dmg` nuevo a mano.
- No borres los Releases viejos ni el `latest.yml`: el actualizador los usa para comparar versiones.

## 6. Errores conocidos y solución
| Error | Solución |
|---|---|
| `Cannot find module @rollup/rollup-darwin-arm64` | `rm -rf node_modules package-lock.json && npm install && npm run app` (el lockfile se generó en otro sistema) |
| `Error: Electron uninstall` | `node node_modules/electron/install.js` y luego `npm run app`. Si se repite, revisa que `npm config get ignore-scripts` diga `false` |
| `git push` rechaza archivos de más de 100 MB | `instaladores/` ya está en `.gitignore`. No subas los `.exe` ni los `.dmg` |
