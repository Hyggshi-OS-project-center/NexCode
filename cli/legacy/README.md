# NexCode CLI

Open NexCode IDE from a terminal.

```bash
nexcode .
nexcode src/renderer/app.ts
nex .
.clipse .
```

The launcher forwards file and folder paths to the existing Electron app argv
handler. If NexCode is already running, the app focuses the existing window and
opens the requested paths through the second-instance flow.

## Development

From this repository:

```bash
node cli/bin/nexcode.js .
```

For shell aliases while developing:

```bash
npm link
```

That exposes `nexcode`, `nex`, and `.clipse` from `package.json`.

## Installed App Resolution

The CLI checks, in order:

1. `NEXCODE_PATH`
2. this repository's Electron dev app
3. common Windows install locations for `NexCode IDE.exe`
4. `nexcode-ide` on Linux/macOS `PATH`