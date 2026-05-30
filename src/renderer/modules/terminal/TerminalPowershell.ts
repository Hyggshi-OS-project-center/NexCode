import type { ShellAdapter, TerminalShell } from '../../../shared/types';
import {
	formatPromptLabel,
	normalizeTerminalCommand,
	listPathCompletions,
	applyPathCompletion,
	parentPathHint,
} from './terminalNavigation';

/** PowerShell-specific convenience wrappers used by the terminal UI. */
export const SHELL: TerminalShell = 'powershell';

export function formatPowerShellPrompt(cwd: string | null): string {
	return formatPromptLabel(SHELL, cwd);
}

export function formatPrompt(cwd: string | null): string {
	return formatPowerShellPrompt(cwd);
}

export function normalizeCommand(line: string, cwd: string | null, home: string): string {
	return normalizeTerminalCommand(line, SHELL, cwd, home);
}

export function listCompletions(input: string, cwd: string | null, home: string) {
	return listPathCompletions(input, cwd, home);
}

export function applyCompletion(
	input: string,
	dir: string,
	match: string,
	replaceStart: number,
): string {
	return applyPathCompletion(input, dir, match, replaceStart, SHELL);
}

export function getParentPathHint(cwd: string | null): string | null {
	return parentPathHint(cwd);
}

export default {
	SHELL,
	formatPrompt,
	formatPowerShellPrompt,
	normalizeCommand,
	listCompletions,
	applyCompletion,
	getParentPathHint,
} satisfies ShellAdapter & {
	formatPowerShellPrompt: typeof formatPowerShellPrompt;
};
