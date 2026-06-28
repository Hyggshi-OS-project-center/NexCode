# How to Build NexCode IDE (Windows .exe)

This guide explains how to compile NexCode IDE and produce a Windows executable you can run or share.

> ⚠️ **Disk space warning:** First-time build requires **~7 GB free disk space** (12 GB recommended). The installed app itself is only ~150 MB.

> 💡 **Low RAM?** If your machine has 8 GB RAM or less, close Chrome, VS Code, and other heavy apps before building. See [Build is slow / excessive disk activity](#build-is-slow--excessive-disk-activity).

---

## Requirements

- **Windows 10 or 11** (64-bit)
- **Node.js 20+** — [https://nodejs.org](https://nodejs.org)
- **npm** (included with Node.js)

Check versions:

```powershell
node -v
npm -v
```

---

## One-time setup

Open PowerShell or Command Prompt in the project folder:

```powershell
cd "Downloads\IDE"
npm install
```

---

## Build the app (compile only)

### `buildfast` — lightweight development build (recommended for iteration)

Runs only `build:main` (tsc) + `build:renderer` (vite). Everything else is skipped:

| Skipped step | Effect |
|---|---|
| `npm run icons` (sharp) | No icon generation — saves ~200–400 MB RAM |
| agent-renderer copy | No extra file copying |
| `electron-builder` | No packaging |
| NSIS packaging | No installer creation |
| asar packing | No app.asar bundling |
| artifact generation | No `.exe` output |

```powershell
npm run buildfast
```

| | RAM Peak | Output Size | Duration |
|--|----------|-------------|----------|
| `vite build` (renderer) | ~300–600 MB | ~10–15 MB | ~5–15 sec |
| `tsc` (main process) | ~200–400 MB | ~1–2 MB | ~5–10 sec |
| **Total** | **~500–700 MB** | **~15–20 MB** | **~10–25 sec** |

> `buildfast` produces no `.exe` — use `npm start` after it to run the app from source.

> 💡 Pre-compiled icons are included in the repo (`build/`).
> `npm run icons` is only needed after changing `build/icon.svg`.

### `build` — full compile

Includes icon generation and agent-renderer copy. Required before packaging.

```powershell
npm run build
```

### Build variant comparison

| Command | RAM Peak | Output Size | Notes |
|---------|----------|-------------|-------|
| `buildfast` | ~500–700 MB | ~15–20 MB | Skips `icons` — runs `build:main` + `build:renderer` only |
| `build` | ~600–800 MB | ~39 MB | Complete build |
| `pack` / `pack:portable` | ~2–2.5 GB | ~150–200 MB per artifact | Full Electron packaging |

> Use `buildfast` during development and `build` + `pack` only when preparing a release.

Run from source (for testing):

```powershell
npm start
```

---

## App icon

Icons are generated from `build/icon.svg` before each build:

```powershell
npm run icons
```

This creates `build/icon.ico` (for the `.exe`), `src/renderer/public/favicon.ico` (for the UI), and copies `src/icons/win32/*.ico` to `build/win32/` for Windows file-type icons.

**Taskbar icon:** `scripts/after-pack.cjs` embeds `build/icon.ico` into `win-unpacked/NexCode IDE.exe` during the build (before NSIS/portable wrappers). After changing `build/icon.svg`, run `npm run icons` and **rebuild** with `npm run pack` or `npm run pack:portable`.

**Dev mode (`npm start`):** The taskbar still shows the generic **Electron** logo because the process is `electron.exe`. Use a packaged build to see your custom icon in the taskbar.

---

## Windows file associations

The **NSIS installer** (`npm run pack`) registers NexCode IDE as the editor for common code file types (`.js`, `.py`, `.ts`, `.html`, etc.) using icons from `src/icons/win32/`. Association ProgIDs are unique (`NexCodeIDE.Python`, etc.) — see `scripts/file-associations.cjs` and `electron-builder.config.cjs`.

Generic text (`.txt`, `.log`, `.text`) uses **`src/icons/win32/default.ico`**. `npm run icons` normalizes all Win32 `.ico` files (transparent background, standard sizes).

**Wrong icon in Explorer (e.g. app diamond on `.py` files)?** Uninstall the old NexCode IDE build, run `npm run icons`, then `npm run pack` and reinstall so Windows picks up the new `NexCodeIDE.*` ProgIDs and `resources\python.ico`.

- Requires the setup installer (not the portable `.exe`).
- `nsis.perMachine` is enabled so associations install correctly (may prompt for administrator approval).

---

## Create the Windows .exe

### Portable .exe (recommended)

Single file, no installer — run directly:

```powershell
npm run pack:portable
```

**Output:**

```
dist\pack-<timestamp>\NexCode IDE-1.0.0-portable.exe
```

Each `npm run pack:portable` writes to a new folder under `dist\` so a running app cannot lock `app.asar` from the previous build.

Double-click that file to launch NexCode IDE. In Task Manager it appears as **NexCode IDE**, not "Electron".

> **Note:** `npm start` runs the Electron dev binary, so Task Manager may still list "Electron" until you set `process.title` (done in code) or use the packaged `.exe`. For the correct name and icon everywhere, use the portable or setup build.

### Installer + portable

Builds both a portable exe and an NSIS setup installer:

```powershell
npm run pack
```

**Output:**

| File | Description |
|------|-------------|
| `dist\pack-<timestamp>\NexCode IDE-1.0.0-portable.exe` | Portable app |
| `dist\pack-<timestamp>\NexCode IDE-1.0.0-setup.exe` | Installer |

---

## Build scripts (recommended on low-RAM machines)

Use these instead of running `npm` commands manually on machines with 8 GB RAM or less. Each script closes unnecessary processes before building.

| Script | What it builds | Minimum RAM |
|--------|---------------|-------------|
| `build-app-portable.bat` | Portable `.exe` (x64) — recommended | ~4 GB free |
| `build-app-Windows.bat` | Standard Windows package (x64) | ~4 GB free |
| `build-app-ARM.bat` | Windows ARM64 only | ~4 GB free |
| `build-app-ia32.bat` | Windows 32-bit only | ~4 GB free |
| `build-app-all-Windows.bat` | All Windows targets (x64, ARM, ia32) | **16 GB recommended** |

> ⚠️ **Avoid `build-app-all-Windows.bat`** on machines with less than 16 GB RAM — building all three architectures simultaneously can peak at 3+ GB RAM usage and will rely heavily on the Windows page file, significantly slowing the build.

---

## Quick reference

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (first time) |
| `npm run buildfast` | Fast compile — skips icons + agent copy (dev iteration) |
| `npm run build` | Full compile to `dist\` (use before packaging) |
| `npm start` | Run app from source |
| `npm run pack:portable` | Build portable `.exe` |
| `npm run pack` | Build portable + installer |
| `npm run typecheck` | Type-check without building |
| `npm run icons` | Regenerate icons from `build/icon.svg` |
| `npm run dev` | Live rebuild + hot reload (development) |

---

## Troubleshooting

### `npm install` fails

- Use Node.js 20 or newer.
- Run the terminal as a normal user (not required to be Administrator for install).

### `npm run icons` fails on `build/icon.ico`

Another program may have the file open (Explorer preview, antivirus, a running NexCode build). The icons script writes via a temp file and retries; if it still fails, close NexCode IDE and any Explorer window on `build/`, then run `npm run icons` again.

### NSIS Error: "Installer integrity check has failed"

Do **not** run `rcedit` on `*-setup.exe` or `*-portable.exe` after build — that corrupts the NSIS wrapper. Icons are applied in `scripts/after-pack.cjs` on `win-unpacked/NexCode IDE.exe` only, before the installer is created.

Rebuild the installer:

```powershell
npm run pack
```

Run the new `dist\pack-<timestamp>\NexCode IDE-1.0.0-setup.exe` (not an older build from `release\`).

### `electron-builder` — file in use / `app.asar` locked

Close **NexCode IDE** and any portable build still running, then delete the output folder and rebuild:

```powershell
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
npm run pack:portable
```

### Installer shows ~1.5 GB "space required"

`electron-builder` was previously configured with `dist/**/*` as pack files, which caused it to bundle previous `dist/pack-*/win-unpacked` folders (full Electron apps) inside `app.asar`, inflating it to over 1 GB.

The `build.files` list now only includes `dist/main`, `dist/renderer`, and `dist/shared`. After rebuilding, the installer should report a few hundred MB (Electron + Chromium + Monaco + UI), not gigabytes.

Delete old `dist\pack-*` folders to reclaim disk space, then run `npm run pack` again.

### `electron-builder` / winCodeSign / symlink errors

Signing and resource editing are disabled in `package.json` (`signAndEditExecutable: false`). Icons are applied in `scripts/after-pack.cjs` on `win-unpacked/NexCode IDE.exe` before NSIS wraps the installer.

### Taskbar still shows the Electron logo

1. You are running **`npm start`** (dev) — use the latest `dist\pack-*\NexCode IDE-*-portable.exe` instead.
2. You rebuilt before fixing icon embedding — run `npm run icons` then `npm run pack:portable` again.
3. Windows cached the old icon — unpin the app from the taskbar, rebuild, launch the new `.exe`, then pin again.

### App does not start after build

1. Run `npm run build` and confirm it finishes without errors.
2. Try `npm start` — if that works, rebuild the exe with `npm run pack:portable`.
3. Check that `dist\main\main.js` and `dist\renderer\index.html` exist.

### Change version or app name

Edit `version` and `productName` in `package.json`. Rebuild with `npm run pack:portable`; the output filename will include the new version.

### Build is slow / excessive disk activity

Low available RAM (under 4 GB free) forces `electron-builder` to swap to the Windows page file, significantly slowing the build.

**Before building:**
- Close Chrome, VS Code, and other heavy apps
- Ensure at least 3–4 GB RAM is free
- Use the `.bat` scripts instead of running `npm` commands manually — they handle this automatically

**Estimated peak RAM by phase:**

| Phase | Peak RAM |
|-------|----------|
| `npm install` | ~300–500 MB |
| `npm run icons` | ~200–400 MB |
| `tsc` (TypeScript) | ~200–400 MB |
| `vite build` (renderer) | ~300–600 MB |
| `electron-builder` (packaging) | ~1–2 GB ← heaviest |
| Single-platform build total | ~2–2.5 GB |
| All-platform build total | ~2.5–3 GB |

---

## Development mode

Live rebuild while developing:

```powershell
npm run dev
```

This watches the renderer and restarts Electron when files change.
