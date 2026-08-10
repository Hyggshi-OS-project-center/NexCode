import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('HOSC Debug extension is now active');

    // Register the debug configuration provider
    const provider = vscode.debug.registerDebugConfigurationProvider('hosc', {
        provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined): vscode.ProviderResult<vscode.DebugConfiguration[]> {
            return [
                {
                    type: 'hosc',
                    request: 'launch',
                    name: 'Debug HOSC Program',
                    program: '${workspaceFolder}/${fileBasenameNoExtension}.hosc',
                    stopOnEntry: false
                }
            ];
        },
        resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
            // If launch.json is missing or empty, provide default configuration
            if (!config.type && !config.request && !config.name) {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.languageId === 'hosc') {
                    return {
                        type: 'hosc',
                        request: 'launch',
                        name: 'Debug HOSC Program',
                        program: '${file}',
                        stopOnEntry: false
                    };
                }
            }

            // Ensure program path is set
            if (!config.program) {
                config.program = '${workspaceFolder}/${fileBasenameNoExtension}.hosc';
            }

            return config;
        }
    });

    context.subscriptions.push(provider);
}

export function deactivate() {
    console.log('HOSC Debug extension is now deactivated');
}