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

## 5. Errores conocidos y solución
| Error | Solución |
|---|---|
| `Cannot find module @rollup/rollup-darwin-arm64` | `rm -rf node_modules package-lock.json && npm install && npm run app` (el lockfile se generó en otro sistema) |
| `Error: Electron uninstall` | `node node_modules/electron/install.js` y luego `npm run app`. Si se repite, revisa que `npm config get ignore-scripts` diga `false` |
| `git push` rechaza archivos de más de 100 MB | `instaladores/` ya está en `.gitignore`. No subas los `.exe` ni los `.dmg` |
