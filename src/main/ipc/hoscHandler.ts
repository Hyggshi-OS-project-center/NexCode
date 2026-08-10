import { ipcMain, WebContents } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { HoscOutputPayload } from '../../shared/types';

let activeHoscProcess: ChildProcessWithoutNullStreams | null = null;

export function setupHoscIpcHandlers(): void {
  ipcMain.handle(
    'hosc:run',
    async (
      event,
      filePath: string,
      cwd?: string,
      customHoscExe?: string
    ): Promise<{ success: boolean; error?: string }> => {
      // Clean up previous process if running
      if (activeHoscProcess && !activeHoscProcess.killed) {
        activeHoscProcess.kill();
        activeHoscProcess = null;
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const workingDir = cwd || path.dirname(filePath);

      // Resolve executable path
      const exeName = process.platform === 'win32' ? 'hosc.exe' : 'hosc';
      let hoscExe = customHoscExe || 'hosc';

      // Fallback search locations if raw 'hosc' command is not in PATH
      if (customHoscExe && !fs.existsSync(customHoscExe)) {
        hoscExe = 'hosc';
      }

      const webContents: WebContents = event.sender;

      const emitOutput = (type: 'stdout' | 'stderr' | 'system', data: string) => {
        if (!webContents.isDestroyed()) {
          const payload: HoscOutputPayload = { type, data };
          webContents.send('hosc:output', payload);
        }
      };

      emitOutput('system', `▶ Spawning: ${hoscExe} run "${path.basename(filePath)}"\n`);

      try {
        const child = spawn(hoscExe, ['run', filePath], {
          cwd: workingDir,
          env: { ...process.env },
        });

        activeHoscProcess = child;

        child.stdout.on('data', (data: Buffer) => {
          emitOutput('stdout', data.toString());
        });

        child.stderr.on('data', (data: Buffer) => {
          emitOutput('stderr', data.toString());
        });

        child.on('error', (err: Error) => {
          emitOutput(
            'system',
            `✖ Failed to start hosc process: ${err.message}\nEnsure 'hosc' executable is installed in system PATH or built under workspace.\n`
          );
          if (activeHoscProcess === child) {
            activeHoscProcess = null;
          }
        });

        child.on('close', (code: number | null) => {
          if (activeHoscProcess === child) {
            activeHoscProcess = null;
          }
          if (code === 0) {
            emitOutput('system', `✔ Process exited cleanly with code 0\n`);
          } else if (code !== null) {
            emitOutput('system', `✖ Process exited with exit code ${code}\n`);
          } else {
            emitOutput('system', `ℹ Process was terminated.\n`);
          }
        });

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
  );

  ipcMain.handle('hosc:stop', async (): Promise<void> => {
    if (activeHoscProcess && !activeHoscProcess.killed) {
      activeHoscProcess.kill('SIGINT');
      setTimeout(() => {
        if (activeHoscProcess && !activeHoscProcess.killed) {
          activeHoscProcess.kill('SIGKILL');
        }
      }, 500);
    }
  });
}
