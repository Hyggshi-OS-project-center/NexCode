# Extension Development Guide

## Overview

NexCode extensions allow you to extend the IDE's functionality with custom commands, language support, and integrations. Extensions use the `.hsixet` manifest format and can be written in JavaScript or TypeScript.

## Extension Structure

A NexCode extension consists of:
1. **Manifest file** (`extension.hsixet`) - INI-like manifest with extension metadata
2. **Entry point** (`extension.js` or `index.js`) - Main JavaScript file
3. **Additional files** - Any supporting files (CSS, images, etc.)

## Creating an Extension

### Step 1: Create the Manifest File

Create a `.hsixet` manifest file:

```ini
id=my.extension
name=My Awesome Extension
version=1.0.0
author=Your Name
description=An awesome extension for NexCode
main=extension.js
activationEvents=onCommand:myExtension.hello
commands=myExtension.hello:Say Hello|myExtension.goodbye:Say Goodbye
```

### Step 2: Create the Entry Point

Create the main JavaScript file referenced in the manifest:

```javascript
// extension.js
function activate(context) {
  console.log('My extension is now active!');
  
  // Register commands
  const commands = context.commands;
  
  commands.registerCommand('myExtension.hello', () => {
    console.log('Hello from my extension!');
    context.window.showInformationMessage('Hello!');
  });
  
  commands.registerCommand('myExtension.goodbye', () => {
    console.log('Goodbye!');
    context.window.showInformationMessage('Goodbye!');
  });
}

function deactivate() {
  console.log('My extension is being deactivated');
}

// Export for NexCode extension host
module.exports = {
  activate,
  deactivate
};
```

### Step 3: Install the Extension

Place both files in one of these directories:
- `.nexcode/extensions/`
- `.nexus/extensions/`

NexCode will automatically detect and load the extension on startup or when activation events trigger.

## Extension Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g., `publisher.extension-name`) |
| `name` | Yes | Display name shown in extensions list |
| `version` | Yes | Semantic version (e.g., `1.0.0`) |
| `description` | No | Brief description of the extension |
| `author` | No | Extension author name |
| `main` | Yes | Entry point JavaScript file (relative path) |
| `activationEvents` | No | Events that trigger extension activation |
| `commands` | No | Commands contributed by the extension |

## Extension API

NexCode provides a VSCode-compatible extension API. The main objects available in your extension:

### ExtensionContext

```javascript
{
  extension: {
    id: string,
    name: string,
    version: string
  },
  extensionPath: string,
  subscriptions: Disposable[],
  workspaceState: Memento,
  globalState: Memento
}
```

### Commands API

```javascript
context.commands.registerCommand(commandId, callback)
context.commands.executeCommand(commandId, ...args)
context.commands.getCommands()
```

### Window API

```javascript
context.window.activeTextEditor  // Get active editor
context.window.showInformationMessage(message)
context.window.showWarningMessage(message)
context.window.showErrorMessage(message)
context.window.setStatusBarMessage(message, timeout)
context.window.onDidChangeActiveTextEditor(listener)
```

### Workspace API

```javascript
context.workspace.workspaceFolders  // Get workspace folders
context.workspace.getConfiguration(section)  // Get settings
context.workspace.openTextDocument(uri)  // Open document
context.workspace.onDidOpenTextDocument(listener)
context.workspace.onDidSaveTextDocument(listener)
context.workspace.fs.readFile(uri)  // Read file
context.workspace.fs.writeFile(uri, content)  // Write file
```

### URI Helper

```javascript
Uri.file(path)  // Create file URI
```

### Disposable

```javascript
Disposable.from(...disposables)  // Combine disposables
disposable.dispose()  // Clean up
```

## Complete Extension Examples

### Example 1: Hello World Extension

**hello.hsixet:**
```ini
id=example.hello
name=Hello World
version=1.0.0
author=Your Name
description=A simple hello world extension
main=extension.js
activationEvents=onCommand:example.hello.sayHello
commands=example.hello.sayHello:Say Hello
```

**extension.js:**
```javascript
function activate(context) {
  console.log('Hello World extension is active!');
  
  const disposable = context.commands.registerCommand(
    'example.hello.sayHello',
    () => {
      context.window.showInformationMessage('Hello from Hello World extension!');
    }
  );
  
  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('Hello World extension is deactivating');
}

module.exports = {
  activate,
  deactivate
};
```

### Example 2: Extension with Workspace Access

**workspace-demo.hsixet:**
```ini
id=demo.workspace
name=Workspace Demo
version=1.0.0
author=Your Name
description=Demonstrates workspace file access
main=extension.js
activationEvents=onStartupFinished
commands=demo.workspace.readFile:Read File|demo.workspace.listFiles:List Files
```

**extension.js:**
```javascript
const fs = require('fs');
const path = require('path');

function activate(context) {
  console.log('Workspace Demo extension is active!');
  
  // Read file command
  const readFileCmd = context.commands.registerCommand(
    'demo.workspace.readFile',
    async () => {
      try {
        const uri = context.window.activeTextEditor?.document?.uri;
        if (!uri) {
          context.window.showWarningMessage('No file is currently open');
          return;
        }
        
        const content = await context.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(content);
        context.window.showInformationMessage(`File has ${text.length} characters`);
      } catch (error) {
        context.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );
  
  // List files command
  const listFilesCmd = context.commands.registerCommand(
    'demo.workspace.listFiles',
    async () => {
      try {
        const folders = context.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          context.window.showWarningMessage('No workspace folder open');
          return;
        }
        
        const folderPath = folders[0].uri.replace('file://', '');
        const files = fs.readdirSync(folderPath);
        context.window.showInformationMessage(`Found ${files.length} items in workspace`);
      } catch (error) {
        context.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );
  
  context.subscriptions.push(readFileCmd, listFilesCmd);
}

function deactivate() {
  console.log('Workspace Demo extension is deactivating');
}

module.exports = {
  activate,
  deactivate
};
```

### Example 3: Language-Specific Extension

**javascript-helper.hsixet:**
```ini
id=helper.javascript
name=JavaScript Helper
version=1.0.0
author=Your Name
description=Adds helpful commands for JavaScript development
main=extension.js
activationEvents=onLanguage:javascript|onLanguage:typescript
commands=helper.js.format:Format JavaScript|helper.js.analyze:Analyze Code
```

**extension.js:**
```javascript
function activate(context) {
  console.log('JavaScript Helper extension is active!');
  
  // Format command
  const formatCmd = context.commands.registerCommand(
    'helper.js.format',
    () => {
      const editor = context.window.activeTextEditor;
      if (!editor) {
        context.window.showWarningMessage('No active editor');
        return;
      }
      
      const langId = editor.document.languageId;
      if (langId !== 'javascript' && langId !== 'typescript') {
        context.window.showWarningMessage('This command only works with JavaScript/TypeScript files');
        return;
      }
      
      // Your formatting logic here
      context.window.showInformationMessage('Formatting JavaScript code...');
    }
  );
  
  // Analyze command
  const analyzeCmd = context.commands.registerCommand(
    'helper.js.analyze',
    () => {
      const editor = context.window.activeTextEditor;
      if (!editor) {
        context.window.showWarningMessage('No active editor');
        return;
      }
      
      // Your analysis logic here
      context.window.showInformationMessage('Analyzing JavaScript code...');
    }
  );
  
  context.subscriptions.push(formatCmd, analyzeCmd);
}

function deactivate() {
  console.log('JavaScript Helper extension is deactivating');
}

module.exports = {
  activate,
  deactivate
};
```

### Example 4: Extension with Settings

**settings-demo.hsixet:**
```ini
id=demo.settings
name=Settings Demo
version=1.0.0
author=Your Name
description=Demonstrates reading extension settings
main=extension.js
activationEvents=onStartupFinished
commands=demo.settings.showConfig:Show Configuration
```

**extension.js:**
```javascript
function activate(context) {
  console.log('Settings Demo extension is active!');
  
  const showConfigCmd = context.commands.registerCommand(
    'demo.settings.showConfig',
    () => {
      // Get configuration
      const config = context.workspace.getConfiguration('demo.settings');
      
      const setting1 = config.get('enabled', true);
      const setting2 = config.get('maxItems', 10);
      const setting3 = config.get('customPath', '');
      
      const message = `
Configuration:
- Enabled: ${setting1}
- Max Items: ${setting2}
- Custom Path: ${setting3 || '(not set)'}
      `.trim();
      
      context.window.showInformationMessage(message);
    }
  );
  
  context.subscriptions.push(showConfigCmd);
}

function deactivate() {
  console.log('Settings Demo extension is deactivating');
}

module.exports = {
  activate,
  deactivate
};
```

## Activation Events

Activation events determine when your extension is loaded and activated.

### Common Activation Events

| Event | Description | Example |
|-------|-------------|---------|
| `onLanguage:<id>` | Activates when a file of the specified language is opened | `onLanguage:javascript` |
| `onCommand:<id>` | Activates when the specified command is executed | `onCommand:myExtension.hello` |
| `onStartupFinished` | Activates after NexCode startup completes | `onStartupFinished` |

### Multiple Activation Events

Separate multiple events with `|` or `,`:

```ini
activationEvents=onLanguage:javascript|onLanguage:typescript|onCommand:myExtension.run
```

### When to Use Each Event

- **onLanguage**: Use when your extension provides language-specific features (syntax highlighting, linting, etc.)
- **onCommand**: Use when your extension only needs to run specific commands
- **onStartupFinished**: Use when your extension needs to run on startup (e.g., status bar items, background tasks)

## Commands

Commands are the primary way users interact with your extension.

### Registering Commands

```javascript
const disposable = context.commands.registerCommand(
  'myExtension.commandName',
  () => {
    // Command logic here
  }
);

context.subscriptions.push(disposable);
```

### Command IDs

- Use reverse domain notation: `publisher.extension.command`
- Be descriptive: `myExtension.formatDocument` not `cmd1`
- Keep them unique to avoid conflicts

### Command Titles

The title is what users see in the command palette:

```ini
commands=myExtension.hello:Say Hello World|myExtension.goodbye:Farewell
```

## State Management

### Workspace State

Persists across sessions but is specific to a workspace:

```javascript
// Get value
const value = context.workspaceState.get('myKey', defaultValue);

// Update value
await context.workspaceState.update('myKey', newValue);

// Delete value
await context.workspaceState.update('myKey', undefined);
```

### Global State

Persists across all workspaces:

```javascript
// Get value
const value = context.globalState.get('myKey', defaultValue);

// Update value
await context.globalState.update('myKey', newValue);

// Delete value
await context.globalState.update('myKey', undefined);
```

## Event Listeners

### File Events

```javascript
// Listen for file open events
const openListener = context.workspace.onDidOpenTextDocument((document) => {
  console.log('File opened:', document.fileName);
});

// Listen for file save events
const saveListener = context.workspace.onDidSaveTextDocument((document) => {
  console.log('File saved:', document.fileName);
});

context.subscriptions.push(openListener, saveListener);
```

### Editor Events

```javascript
// Listen for active editor changes
const editorListener = context.window.onDidChangeActiveTextEditor((editor) => {
  if (editor) {
    console.log('Active editor:', editor.document.fileName);
  }
});

context.subscriptions.push(editorListener);
```

## File System Access

### Reading Files

```javascript
async function readFile(context, uri) {
  try {
    const content = await context.workspace.fs.readFile(uri);
    return new TextDecoder().decode(content);
  } catch (error) {
    context.window.showErrorMessage(`Failed to read file: ${error.message}`);
    throw error;
  }
}
```

### Writing Files

```javascript
async function writeFile(context, uri, content) {
  try {
    const encoder = new TextEncoder();
    await context.workspace.fs.writeFile(uri, encoder.encode(content));
    context.window.showInformationMessage('File saved successfully');
  } catch (error) {
    context.window.showErrorMessage(`Failed to write file: ${error.message}`);
    throw error;
  }
}
```

## Error Handling

Always handle errors gracefully:

```javascript
async function safeOperation(context) {
  try {
    // Your code here
  } catch (error) {
    console.error('Extension error:', error);
    context.window.showErrorMessage(`Error: ${error.message}`);
  }
}
```

## Resource Cleanup

Use subscriptions to clean up resources:

```javascript
function activate(context) {
  // Create a timer
  const timer = setInterval(() => {
    console.log('Background task running...');
  }, 1000);
  
  // Register cleanup
  const disposable = {
    dispose: () => {
      clearInterval(timer);
      console.log('Timer cleaned up');
    }
  };
  
  context.subscriptions.push(disposable);
}

function deactivate() {
  // All subscriptions are automatically disposed
  console.log('Extension deactivated');
}
```

## Building Extensions

### Using npm

1. Initialize your project:
```bash
npm init -y
```

2. Install dependencies (if needed):
```bash
npm install some-library
```

3. Build your code (if using TypeScript):
```bash
npm run build
```

4. Copy files to extensions directory:
```bash
cp extension.js .nexcode/extensions/
cp extension.hsixet .nexcode/extensions/
```

### Using TypeScript

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**package.json:**
```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Update manifest to point to compiled output:
```ini
main=dist/extension.js
```

## Testing Extensions

### Local Testing

1. Place extension files in `.nexcode/extensions/`
2. Restart NexCode or trigger activation event
3. Open Developer Console to see logs
4. Test commands via Command Palette

### Debugging

```javascript
// Add logging
console.log('[MyExtension] Debug message:', data);

// Use debugger
debugger;  // Pauses execution in DevTools

// Check extension state
console.log('Extension context:', context);
```

### Common Issues

**Extension not loading:**
- Check that `id`, `name`, `version` are present in manifest
- Verify `main` points to correct file path
- Check Developer Console for errors
- Ensure file permissions are correct

**Commands not appearing:**
- Verify command IDs match between manifest and code
- Check that extension is activated
- Ensure commands are registered before deactivation

**Activation not working:**
- Verify activation event format is correct
- Check that event actually occurs (e.g., open a JS file for `onLanguage:javascript`)
- Look for errors in console

## Packaging Extensions

### Manual Packaging

1. Create extension folder:
```
my-extension/
├── extension.hsixet
├── extension.js
└── README.md
```

2. Create ZIP archive:
```bash
zip -r my-extension.zip my-extension/
```

### Directory Structure

```
my-extension/
├── extension.hsixet      # Manifest
├── extension.js          # Entry point
├── package.json          # npm package (optional)
├── README.md            # Documentation
├── CHANGELOG.md         # Version history
├── src/                 # Source files (if using TypeScript)
│   └── extension.ts
├── dist/                # Compiled output
│   └── extension.js
└── resources/           # Additional resources
    ├── icon.png
    └── images/
```

## Publishing Extensions

### Preparation

1. **Choose a unique ID**: Use reverse domain notation (e.g., `com.company.extension`)
2. **Version properly**: Use semantic versioning (MAJOR.MINOR.PATCH)
3. **Write documentation**: Include README with installation and usage instructions
4. **Add license**: Choose an appropriate open source license
5. **Test thoroughly**: Test on multiple platforms if possible

### Publishing to Marketplace

When the NexCode extension marketplace is available:

1. Create a marketplace listing
2. Upload your extension package
3. Add screenshots and detailed description
4. Set categories and tags
5. Submit for review

### GitHub Distribution

1. Create a public repository
2. Tag releases with version numbers
3. Include installation instructions in README
4. Provide examples and documentation

## Best Practices

1. **Keep extensions focused**: Do one thing well
2. **Handle errors gracefully**: Always use try-catch for async operations
3. **Clean up resources**: Use subscriptions for disposables
4. **Use meaningful IDs**: Follow naming conventions
5. **Document your code**: Add comments for complex logic
6. **Test thoroughly**: Test on different file types and scenarios
7. **Optimize performance**: Don't block the main thread
8. **Follow security practices**: Validate user input, avoid eval()
9. **Version properly**: Follow semantic versioning
10. **Provide good UX**: Show informative messages, not just console logs

## Security Considerations

### Input Validation

```javascript
function validateInput(input) {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  if (input.length > 1000) {
    throw new Error('Input too long');
  }
  return input.trim();
}
```

### Avoid Dangerous Operations

```javascript
// DON'T DO THIS
eval(userInput);
new Function(userInput)();

// DO THIS INSTEAD
const safeParse = JSON.parse(userInput);
```

### File System Safety

```javascript
// Validate file paths
function safePath(basePath, userPath) {
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

## Advanced Topics

### Webview API

Create custom UI with webviews:

```javascript
const panel = context.window.createWebviewPanel(
  'myWebview',
  'My Webview',
  context.window.activeTextEditor?.document?.uri,
  {
    enableScripts: true,
    retainContextWhenHidden: true
  }
);

panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <h1>Hello from Webview!</h1>
  <script>
    // Your webview code
  </script>
</body>
</html>
`;
```

### Status Bar Integration

```javascript
const statusBarItem = context.window.createStatusBarItem();
statusBarItem.text = '$(icon) My Extension';
statusBarItem.tooltip = 'My Extension is active';
statusBarItem.show();

// Update status
statusBarItem.text = '$(icon) Processing...';

// Hide status
statusBarItem.hide();
```

### Progress Indicators

```javascript
await context.window.withProgress(
  {
    location: context.window.ProgressLocation.Notification,
    title: 'Processing files...',
    cancellable: true
  },
  (progress, token) => {
    return new Promise((resolve, reject) => {
      let count = 0;
      const total = 100;
      
      const interval = setInterval(() => {
        if (token.isCancellationRequested) {
          clearInterval(interval);
          reject(new Error('Cancelled'));
          return;
        }
        
        count++;
        progress.report({
          increment: 1,
          message: `${count}/${total}`
        });
        
        if (count >= total) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }
);
```

## Debugging Extensions

### Enable Debug Logging

```javascript
function activate(context) {
  const DEBUG = true;
  
  function log(...args) {
    if (DEBUG) {
      console.log('[MyExtension]', ...args);
    }
  }
  
  log('Extension activated');
}
```

### Inspect Extension Context

```javascript
function activate(context) {
  console.log('Extension context:', {
    extension: context.extension,
    extensionPath: context.extensionPath,
    subscriptions: context.subscriptions.length
  });
}
```

### Test Commands Manually

```javascript
// In Developer Console
const commands = await window.electronAPI.executeCommand('myExtension.hello');
```

## Resources

- [HSIXET_API.md](./HSIXET_API.md) - Complete .hsixet format reference
- [THEME_DEVELOPMENT.md](./THEME_DEVELOPMENT.md) - Theme development guide
- [CORE_FEATURES.md](./CORE_FEATURES.md) - NexCode IDE features
- VSCode Extension API: https://code.visualstudio.com/api
- Extension Samples: https://github.com/microsoft/vscode-extension-samples

## See Also

- [Theme Development](./THEME_DEVELOPMENT.md) - Create custom themes
- [API Documentation](./HSIXET_API.md) - .hsixet format specification
- [Core Features](./CORE_FEATURES.md) - NexCode IDE capabilities