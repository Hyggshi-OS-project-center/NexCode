/**
 * Project-level run configurations: <workspace>/.nexcode/run/actions.json
 *
 * Lets a project declare one or more named "actions" (shell commands) that
 * the Run button / F5 should offer instead of (or in addition to) the
 * built-in per-extension run logic in `runCommand.ts`.
 *
 * Example file:
 * {
 *   "version": "0.1.0",
 *   "configurations": [
 *     {
 *       "name": "build c",
 *       "type": "gcc",
 *       "request": "launch",
 *       "actions": "gcc \"hello.c\" -o \"hello_nexrun\" && \"./hello_nexrun\"",
 *       "preLaunchTask": "Build c"
 *     },
 *     {
 *       "name": "run Program",
 *       "request": "launch",
 *       "actions": "./hello",
 *       "stopOnEntry": false
 *     }
 *   ]
 * }
 */
import { joinPath, basename, parentDir } from './pathUtils';
import type { RunSpec } from './runCommand';

export const RUN_ACTIONS_VERSION = '0.1.0';

export interface RunActionConfiguration {
    name: string;
    type?: string;
    request?: string;
    /** Shell command (or `&&`-chained commands) executed for this configuration. */
    actions: string;
    /** Informational label of a task to "run before" `actions`. No task runner is invoked automatically. */
    preLaunchTask?: string;
    stopOnEntry?: boolean;
}

export interface RunActionsFile {
    version: string;
    configurations: RunActionConfiguration[];
}

/** Absolute path to the project's run-actions file, given the workspace root. */
export function getRunActionsPath(workspacePath: string): string {
    return joinPath(joinPath(joinPath(workspacePath, '.nexcode'), 'run'), 'actions.json');
}

/**
 * Parse raw file content into a RunActionsFile. Returns null (rather than
 * throwing) on invalid JSON or a shape that doesn't look like a run-actions
 * file, so callers can fall back to the default extension-based run logic.
 */
export function parseRunActionsFile(raw: string): RunActionsFile | null {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;
    const rawConfigs = obj.configurations;
    if (!Array.isArray(rawConfigs)) return null;

    const configurations: RunActionConfiguration[] = [];
    for (const entry of rawConfigs) {
        if (!entry || typeof entry !== 'object') continue;
        const c = entry as Record<string, unknown>;
        if (typeof c.name !== 'string' || typeof c.actions !== 'string') continue;
        configurations.push({
            name: c.name,
            actions: c.actions,
            type: typeof c.type === 'string' ? c.type : undefined,
            request: typeof c.request === 'string' ? c.request : undefined,
            preLaunchTask: typeof c.preLaunchTask === 'string' ? c.preLaunchTask : undefined,
            stopOnEntry: typeof c.stopOnEntry === 'boolean' ? c.stopOnEntry : undefined,
        });
    }

    return {
        version: typeof obj.version === 'string' ? obj.version : RUN_ACTIONS_VERSION,
        configurations,
    };
}

export function stringifyRunActionsFile(file: RunActionsFile): string {
    return `${JSON.stringify(file, null, 4)}\n`;
}

/**
 * Build a starter actions.json, seeded with a configuration derived from the
 * currently active file's default run spec (if any) so the generated file is
 * immediately runnable rather than an empty stub.
 */
export function buildDefaultRunActionsFile(seedSpec: RunSpec | null): RunActionsFile {
    const configurations: RunActionConfiguration[] = [];
    if (seedSpec) {
        configurations.push({
            name: `run ${seedSpec.label}`,
            request: 'launch',
            actions: seedSpec.command,
        });
    }
    return { version: RUN_ACTIONS_VERSION, configurations };
}

/**
 * Variable substitution for `actions` commands, so one configuration can run
 * "whatever file is active" instead of hardcoding a path — e.g.:
 *
 *   "actions": "./framework/bin/hosc_framework run \"autofile\""
 *
 * Supported tokens (both the bare word `autofile` and the VS Code-style
 * `${...}` names resolve the same way, pick whichever reads better):
 *   autofile / ${file}                     — absolute path of the active file
 *   ${fileBasename}                        — file name with extension
 *   ${fileBasenameNoExtension}             — file name without extension
 *   ${fileDirname}                         — absolute path of the file's folder
 *   ${fileExtname}                         — extension, including the dot
 *   ${workspaceFolder}                     — absolute path of the open workspace
 *   ${fileWorkspaceFolderRelative}         — file path relative to the workspace,
 *                                            e.g. "./framework/examples/test.hosc"
 */
export interface RunVariableContext {
    /** Absolute path of the file currently active in the editor. */
    filePath: string;
    /** Absolute path of the open workspace root. */
    workspacePath: string;
}

const RUN_VARIABLE_PATTERN =
    /\$\{(file|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|workspaceFolder|fileWorkspaceFolderRelative)\}|\bautofile\b/g;

export function substituteRunVariables(command: string, ctx: RunVariableContext): string {
    if (!ctx.filePath) return command;

    const file = ctx.filePath;
    const base = basename(file);
    const dot = base.lastIndexOf('.');
    const baseNoExt = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    const dir = parentDir(file);
    const relative = toWorkspaceRelative(file, ctx.workspacePath);

    return command.replace(RUN_VARIABLE_PATTERN, (match, varName?: string) => {
        if (match === 'autofile') return file;
        switch (varName) {
            case 'file':
                return file;
            case 'fileBasename':
                return base;
            case 'fileBasenameNoExtension':
                return baseNoExt;
            case 'fileDirname':
                return dir;
            case 'fileExtname':
                return ext;
            case 'workspaceFolder':
                return ctx.workspacePath;
            case 'fileWorkspaceFolderRelative':
                return relative;
            default:
                return match;
        }
    });
}

function toWorkspaceRelative(filePath: string, workspacePath: string): string {
    if (!workspacePath) return filePath;
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const file = norm(filePath);
    const root = norm(workspacePath);
    if (!file.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return filePath;
    const rel = file.slice(root.length + 1);
    return `./${rel}`;
}