# Build NexCode IDE

This guide explains how to install dependencies, run NexCode IDE from source, compile the app, and package Windows or Linux builds.

> Disk space: keep at least 7 GB free for a first full package build. Electron, Chromium, Monaco, package caches, and generated artifacts add up quickly.

> Low RAM: on machines with 8 GB RAM or less, close browsers and other heavy apps before running `npm run build` or packaging commands.

---

## Requirements

- Node.js 20 or newer
- npm
- Git
- Windows 10/11 for Windows `.exe` and NSIS installer builds
- Linux for AppImage, `.deb`, `.tar.gz`, and `.zip` Linux builds

Check versions:

```bash
node -v
npm -v
```

Install dependencies:

```bash
npm install
```

---

## Run From Source

### Normal source run

```bash
npm start
```

`npm start` runs Electron from the local source tree. In development, the main process starts or uses a Vite renderer server and loads the UI from `http://127.0.0.1:5173` when available.

Use this when you already have compiled main-process files in `dist/main`.

### Live development

```bash
npm run dev
```

This runs the renderer Vite server and Electron together:

- `npm run dev:renderer` starts Vite.
- `npm run dev:electron` waits for Vite, builds the main process, then launches Electron with `VITE_DEV_SERVER=1`.

Useful variants:

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite + Electron together |
| `npm run dev:renderer` | Start only the Vite renderer server |
| `npm run dev:electron` | Build main process and launch Electron against Vite |
| `npm run dev:vite` | Start Vite with `NODE_ENV=development` |
| `npm run debug` | Alias-style dev command using `concurrently` |
| `npm run Devtools` | Dev command intended for Electron with devtools |

---

## Compile Builds

### Fast build

```bash
npm run buildfast
```

Runs:

1. Vite renderer build with sourcemaps disabled.
2. TypeScript main-process build.

It skips icon generation and does not copy the AI Agent renderer. Use this for quick local iteration when you do not need a complete package-ready `dist`.

There is also:

```bash
npm run buildfast:Nocompile
```

That runs only the Vite renderer build.

### Full build

```bash
npm run build
```

Runs:

1. `npm run icons`
2. `npm run build:main`
3. `npm run build:renderer`
4. `npm run build:agent-renderer`

Use this before release packaging.

### Targeted build commands

| Command | Output |
|---|---|
| `npm run build:main` | Compiles `src/main` and `src/shared` to `dist/main` and `dist/shared` |
| `npm run build:renderer` | Builds Vite renderer entries to `dist/renderer`, then copies the AI Agent renderer |
| `npm run build:agent-renderer` | Copies `src/agents/src/renderer` to `dist/agents/renderer` |
| `npm run build:themes-hsixet` | Builds HSIXET theme assets |
| `npm run build:renderer-web` | Builds renderer, then runs Vite config again for web output |
| `npm run typecheck` | Type-checks main and renderer without writing build output |
| `npm run check` | Runs typecheck, main build, and renderer build |

The Vite renderer has multiple HTML entry points:

- `src/renderer/index.html`
- `src/renderer/about.html`
- `src/renderer/easterEgg.html`

These are emitted into `dist/renderer`.

---

## Icons

Regenerate icons with:

```bash
npm run icons
```

This runs:

1. `scripts/generate-icons.mjs`
2. `scripts/ensure-default-win32-icon.mjs`
3. `scripts/normalize-win32-icons.mjs`
4. `scripts/copy-win32-icons.mjs`

Generated or copied outputs include:

- `build/icon.ico`
- `build/icon.png`
- `src/renderer/public/favicon.ico`
- `build/win32/*.ico`

The packaged app also includes:

- `icon.ico`
- `insider-icon.ico`

`scripts/after-pack.cjs` embeds the app icon into the unpacked Windows executable before NSIS or portable wrappers are created.

In `npm start` or `npm run dev`, the taskbar may still show Electron-specific process behavior because the app is running through Electron's development binary. Packaged builds show the production executable name and icon.

---

## Package Windows

### Portable `.exe`

```bash
npm run pack:portable
```

Runs a full build, then packages a Windows portable executable on Windows.

Output goes to a fresh timestamped folder:

```text
dist/pack-YYYY-MM-DDTHH-MM-SS/NexCode IDE-<version>-portable.exe
```

### Fast portable `.exe`

```bash
npm run packfast:portable
```

Runs `buildfast`, then packages portable. Use this only when you know the current `dist` has everything needed. A normal release should use `npm run pack:portable`.

### NSIS installer

```bash
npm run pack
```

Runs a full build, then creates a Windows NSIS setup installer on Windows.

Output goes to:

```text
dist/pack-YYYY-MM-DDTHH-MM-SS/NexCode IDE-<version>-setup.exe
```

The installer is configured with:

- per-machine install
- selectable install directory
- `scripts/installer.nsh`
- Windows file associations from `scripts/file-associations.cjs`

---

## Package Linux

### Full Linux package set

```bash
npm run pack:linux
```

Runs a full build, then packages Linux targets configured in `package.json`:

- AppImage
- `.deb`
- `.tar.gz`
- `.zip`

Output goes to a fresh timestamped folder under `dist/pack-*`.

### Linux AppImage only

```bash
npm run pack:portable:linux
```

Runs a full build, then packages an AppImage using `scripts/pack-portable.mjs --linux`.

### Helper shell scripts

| Script | What it does |
|---|---|
| `scripts/build-app-linux.sh` | Full build + Linux package set |
| `scripts/build-app-all-linux-platform.sh` | Builds AppImage, `.deb`, and optionally `.rpm` |
| `scripts/build-app-rpm.sh` | RPM-oriented Linux packaging helper |
| `scripts/build-app-portable.sh` | Portable packaging helper |
| `scripts/build-app.sh` | Full build + platform packaging helper |

For RPM builds, `rpmbuild` is required. The all-Linux script skips RPM if `rpmbuild` is unavailable.

---

## Windows File Associations

Windows installer builds register common development file types such as `.js`, `.ts`, `.py`, `.html`, `.css`, `.md`, `.json`, `.cpp`, `.go`, `.rs`, `.lua`, `.vue`, `.yaml`, `.xml`, `.txt`, and others.

The source of truth is:

```text
scripts/file-associations.cjs
```

Each association uses a unique `NexCodeIDE.*` ProgID and an icon from `build/win32`.

Portable builds do not install file associations. Use the NSIS setup installer from `npm run pack` for associations.

---

## Output Layout

Important generated paths:

| Path | Purpose |
|---|---|
| `dist/main` | Electron main process build |
| `dist/shared` | Shared TypeScript output used by main |
| `dist/renderer` | Vite renderer output |
| `dist/agents/renderer` | AI Agent renderer files copied for packaging |
| `dist/pack-*` | Timestamped packaged artifacts |
| `dist/pack-out` | Default electron-builder output directory |
| `build` | Build resources such as app icons |

Only these app files are included in packaged builds:

- `dist/main/**/*`
- `dist/agents/**/*`
- `dist/renderer/**/*`
- `dist/shared/**/*`
- `package.json`

This avoids accidentally bundling previous package output into `app.asar`.

---

## Quick Reference

| Command | Use it for |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Run Electron from source |
| `npm run dev` | Live development with Vite + Electron |
| `npm run buildfast` | Fast compile for iteration |
| `npm run build` | Full package-ready build |
| `npm run build:main` | Compile main process only |
| `npm run build:renderer` | Build renderer + copy agent renderer |
| `npm run typecheck` | Type-check without emitting |
| `npm run check` | Typecheck + main build + renderer build |
| `npm run icons` | Regenerate app and file-type icons |
| `npm run pack:portable` | Build Windows portable exe on Windows |
| `npm run packfast:portable` | Fast portable packaging |
| `npm run pack` | Build Windows NSIS installer on Windows |
| `npm run pack:linux` | Build Linux package set |
| `npm run pack:portable:linux` | Build Linux AppImage |

---

## Troubleshooting

### `npm install` fails

- Use Node.js 20 or newer.
- Delete `node_modules` only if dependency state is corrupted, then run `npm install` again.
- On Linux, ensure build tools and system libraries required by Electron are installed.

### Vite or Electron dev server fails

Try:

```bash
npm run build:main
npm run dev
```

If port `5173` is already in use, stop the old Vite process or change the Vite server configuration in `vite.config.ts`.

### `npm start` opens an older built UI

`npm start` uses compiled files in `dist/main`. Rebuild the main process after main-process changes:

```bash
npm run build:main
npm start
```

For live renderer development, prefer:

```bash
npm run dev
```

### Build runs out of memory on an 8 GB machine

Close browsers and other heavy apps before building:

```bash
pkill chrome
```

Check available RAM:

```bash
free -h
```

If swap is not already configured, add an 8 GB swap file:

```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Then run the build with a Node memory limit:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Linux `/dev/shm` or Chromium shared-memory errors

Electron/Chromium may fail if `/dev/shm` permissions are broken. Check:

```bash
ls -ld /dev/shm
```

Expected permissions usually include `1777`. On a normal Linux install, this can be fixed with:

```bash
sudo chmod 1777 /dev/shm
```

Packaged Linux builds also pass `--no-sandbox` through the Electron builder config.

### `npm run icons` fails

Close any running NexCode build and any file manager previewing `build/icon.ico`, then run:

```bash
npm run icons
```

### Windows Explorer shows old file icons

Windows caches file association icons aggressively. Rebuild icons and reinstall the NSIS build:

```powershell
npm run icons
npm run pack
```

Then uninstall older NexCode builds if duplicate associations remain.

### NSIS installer integrity check fails

Do not run `rcedit` on the final `*-setup.exe` or `*-portable.exe`. Resource editing must happen before NSIS wraps the app. This repo handles app icon embedding in `scripts/after-pack.cjs`.

Rebuild:

```powershell
npm run pack
```

### `app.asar` or package output is locked

Close running NexCode instances. On Windows, also close Explorer windows opened inside `dist`.

You can clean stale unpacked output with:

```bash
npm run prepack:clean
```

Then package again.

### Installer reports huge required disk space

Check that old package folders are not being included. The package file list should only include `dist/main`, `dist/agents`, `dist/renderer`, `dist/shared`, and `package.json`.

Remove old timestamped package folders if you need disk space:

```bash
rm -rf dist/pack-*
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force dist\pack-* -ErrorAction SilentlyContinue
```

### App does not start after packaging

Verify a full build first:

```bash
npm run build
```

Check that these files exist:

- `dist/main/main.js`
- `dist/renderer/index.html`
- `dist/agents/renderer/index.html`

Then rebuild the package for your platform.

### Change version or product name

Edit `version` and `productName` in `package.json`, then rebuild. Artifact names use the package version automatically.
