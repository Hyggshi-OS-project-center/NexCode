# NexCode CLI

The NexCode agent in your terminal, plus the original "open this folder in the
IDE" launcher.

```bash
nexcode .                          # open a folder in NexCode IDE
nexcode ask "explain src/main.ts"  # one-shot question, streamed to stdout
nexcode chat                       # interactive session
```

## Why it shares code with the IDE

The CLI `require`s the compiled agent services from `dist/main/ai/` — the same
`chatWithClaude` / `chatWithGemini` / `chatWithOpenRouter` / `chatWithLocal`
functions the Electron main process calls. None of them import Electron, so
they run fine in plain Node.

That means streaming, tool calling and the workspace path sandbox behave
identically in the terminal and in the app, instead of being a second
implementation that drifts out of sync.

Because the services are TypeScript, build them once before using the AI
subcommands:

```bash
npm run build:main
```

The launcher subcommands (`nexcode .`, `nexcode open`) do not need the build.

## Install

From a checkout:

```bash
npm link
```

That exposes `nexcode` and `nex`. Or run it directly without linking:

```bash
npm run cli -- ask "what does this repo do?"
node cli/bin/nexcode.js ask "what does this repo do?"
```

## Commands

| Command | Description |
| --- | --- |
| `nexcode [path ...]` | Open paths in NexCode IDE |
| `nexcode open [path ...]` | Same, explicitly |
| `nexcode ask <prompt>` | One agent turn; the reply streams to stdout |
| `nexcode chat` | Interactive session |
| `nexcode models` | List models available to the active provider |
| `nexcode config [key value]` | Show or change provider settings |

### Options

| Flag | Description |
| --- | --- |
| `-C, --cwd <dir>` | Workspace root for the agent (default: current directory) |
| `-y, --yes` | Apply proposed file changes without asking |
| `-q, --quiet` | Suppress the banner and tool progress |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

### Interactive commands

Inside `nexcode chat`:

- `/exit` — leave
- `/clear` — reset the conversation context
- `/apply` — apply the last run's proposed changes
- `Ctrl-C` — stop the current reply (press again at an empty prompt to exit)

## Streaming

Replies are written to stdout fragment by fragment as the model produces them,
using the same Server-Sent Events transport the IDE uses
(`src/main/ai/streaming.ts`). Nothing waits for the request to finish.

Tool progress goes to **stderr** and the reply goes to **stdout**, so
redirecting still gives you clean output:

```bash
nexcode ask "write release notes for v4" > NOTES.md
```

`Ctrl-C` aborts the HTTP request for real rather than just detaching from it,
and whatever was produced up to that point is kept.

## File changes need confirmation

The agent's `write_file` and `delete_file` tools *stage* changes — in the IDE
you accept them in a diff view. The CLI shows the same list and asks before
touching the disk:

```
Proposed changes:
  create  src/util/slug.ts (14 lines)
  update  src/index.ts (61 lines)

Apply 2 change(s)? [y/N]
```

Pass `--yes` to skip the prompt. When stdin is not a terminal (a pipe, or CI)
changes are **not** applied unless `--yes` is given, so a scripted run can never
silently rewrite files.

`run_command` is different: the agent executes those immediately, as it does in
the IDE. Only point the CLI at workspaces you trust.

## Configuration

Settings are read from the IDE's own `settings.json`, so anything configured in
Settings → AI works in the CLI with no extra setup:

| Platform | Location |
| --- | --- |
| Windows | `%APPDATA%\NexCode IDE\settings.json` |
| macOS | `~/Library/Application Support/NexCode IDE/settings.json` |
| Linux | `~/.config/NexCode IDE/settings.json` |

Change values without opening the app:

```bash
nexcode config                         # show current provider and model
nexcode config aiProvider claude
nexcode config claudeModel claude-sonnet-4-20250514
```

API keys are stored but never printed back — `nexcode config` only reports
whether a key is set.

### Environment variables

Environment variables override the stored settings, which is useful in CI or
when testing a different key:

| Variable | Purpose |
| --- | --- |
| `NEXCODE_PATH` | Path to the NexCode IDE executable |
| `NEXCODE_AI_PROVIDER` | `gemini`, `openrouter`, `claude` or `local` |
| `ANTHROPIC_API_KEY` | Claude key |
| `GEMINI_API_KEY` | Gemini key |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `NEXCODE_LOCAL_BASE_URL` | Local OpenAI-compatible server, e.g. Ollama |
| `NEXCODE_USER_DATA` | Override the settings directory |
| `NO_COLOR` | Disable coloured output |

## Using a local model

No API key needed — point it at Ollama or LM Studio:

```bash
nexcode config aiProvider local
nexcode config localAiBaseUrl http://localhost:11434/v1
nexcode ask "summarise this project"
```

## Layout

```
cli/
  bin/nexcode.js      entry point and command router
  lib/support.js      settings, provider resolution, colours, module loading
  lib/agent.js        streaming turns and applying staged file changes
  lib/launcher.js     locating and starting the IDE
  src/, Makefile      older C++ launcher experiment (not used by `nexcode`)
  legacy/             the original launcher-only Node script
```

## Installed app resolution

`nexcode .` looks for the IDE in this order:

1. `NEXCODE_PATH`
2. this repository's Electron dev app
3. common Windows install locations for `NexCode IDE.exe`
4. `nexcode-ide` on the Linux/macOS `PATH`
