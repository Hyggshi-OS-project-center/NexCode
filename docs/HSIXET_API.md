# .hsixet API Documentation

## Overview

`.hsixet` is NexCode's native extension manifest format. It uses an INI-like text format to define extension metadata, making it simpler and more readable than the JSON-based `.vsix` format used by VSCode.

## File Location

Extension manifests should be placed in:
- `.nexcode/extensions/*.hsixet`
- `.nexus/extensions/*.hsixet`

## Format Specification

### Basic Structure

```ini
id=extension.id
name=Extension Name
version=1.0.0
author=Author Name
description=Extension description
main=entry.js
theme=dark
themeCss=styles.css
audio=sound.ogg
error=Error message
activationEvents=onLanguage:javascript|onCommand:extension.run
commands=command1:Command Title|command2:Another Command
```

### Comments

Lines starting with `;` or `#` are treated as comments and ignored:

```ini
; This is a comment
# This is also a comment
id=my.extension
```

### Section Headers

Lines starting with `[` are treated as section headers and ignored (for compatibility):

```ini
[metadata]
id=my.extension
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the extension (e.g., `publisher.name`) |
| `name` | string | Display name of the extension |
| `version` | string | Semantic version (e.g., `1.0.0`) |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Extension author name |
| `description` | string | Brief description of the extension |
| `main` | string | Entry point JavaScript file (relative path) |
| `theme` | string | Theme name (e.g., `dark`, `light`, `custom-theme`) |
| `themeCss` | string | CSS file path for theme styling |
| `audio` | string | Audio file path for theme sound effects (.ogg format) |
| `error` | string | Error message to display (for debugging) |
| `activationEvents` | string[] | Events that trigger extension activation |
| `commands` | Command[] | Commands contributed by the extension |

## Field Details

### activationEvents

A pipe (`|`) or comma (`,`) separated list of activation events:

```ini
activationEvents=onLanguage:javascript|onCommand:myExtension.run|onStartupFinished
```

Common activation events:
- `onLanguage:<languageId>` - Activates when a file of the specified language is opened
- `onCommand:<commandId>` - Activates when the specified command is executed
- `onStartupFinished` - Activates after NexCode startup completes

### commands

A pipe (`|`) separated list of commands in the format `id:title`:

```ini
commands=myExtension.hello:Say Hello|myExtension.goodbye:Say Goodbye
```

Each command entry:
- `id` - Unique command identifier (required)
- `title` - Display title for the command (optional, defaults to id if omitted)

Format variations:
```ini
; With title
commands=cmd1:First Command|cmd2:Second Command

; Without title (uses id as title)
commands=cmd1|cmd2

; Mixed
commands=cmd1:First|cmd2
```

## Examples

### Basic Theme Extension

```ini
id=nexcode.theme.dark
name=NexCode Dark Theme
version=0.1.0
description=Default dark theme for NexCode IDE
author=NexCode IDE
main=theme-dark.css
theme=dark
themeCss=theme-dark.css
```

### Extension with Commands

```ini
id=my.extension
name=My Awesome Extension
version=1.0.0
author=John Doe
description=An example extension with commands
main=extension.js
activationEvents=onCommand:myExtension.hello
commands=myExtension.hello:Say Hello|myExtension.world:Say World
```

### Audio Theme Extension

```ini
id=nexcode.theme.cyber
name=NexCode Cyber Theme
version=0.1.0
description=Cyberpunk-themed IDE with sound effects
author=NexCode IDE
main=theme-cyber.css
theme=Cyber Lime
themeCss=theme-cyber.css
audio=theme-sound.ogg
```

### Complex Extension

```ini
; My Extension Manifest
# Another comment style
id=company.productivity
name=Productivity Suite
version=2.1.0
author=Company Name
description=Boost your productivity with these tools
main=dist/index.js
activationEvents=onLanguage:typescript|onLanguage:javascript|onCommand:productivity.analyze

; Commands section
commands=productivity.analyze:Analyze Code|productivity.refactor:Quick Refactor|productivity.format:Format Document
```

## Parsing Behavior

### Case Sensitivity

- Field names are case-insensitive and normalized to lowercase
- Values are case-sensitive

```ini
ID=my.extension    ; Parsed as 'id'
Name=My Extension  ; Parsed as 'name'
```

### Whitespace Handling

- Leading/trailing whitespace is trimmed from both keys and values
- Internal whitespace is preserved

```ini
id  =  my.extension   ; Parsed as id="my.extension"
name = My Extension   ; Parsed as name="My Extension"
```

### Empty Values

Empty or invalid values are treated as undefined:

```ini
id=
version=   ; Empty after trim
field=     ; Empty value
```

### Missing Required Fields

If any required field (`id`, `name`, `version`) is missing or empty, parsing will fail with an error:

```
Invalid extension manifest: missing id, version
```

## Comparison with .vsix Format

| Feature | .hsixet | .vsix |
|---------|---------|-------|
| Format | INI-like text | ZIP archive containing JSON |
| Readability | High (plain text) | Low (binary ZIP) |
| File extension | `.hsixet` | `.vsix` |
| Manifest location | Root file | `extension/package.json` inside ZIP |
| Commands format | `id:title|id2:title2` | JSON array of objects |
| NexCode native | Yes | No (VSCode format) |

## API Reference

### TypeScript Interface

```typescript
interface VsixCommandContribution {
  id: string;
  title: string;
  category?: string;
  command?: string;  // VSCode raw field alias
}

interface VsixExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string;
  theme?: string;
  themeCss?: string;
  audio?: string;
  error?: string;
  activationEvents?: string[];
  contributes?: {
    commands?: VsixCommandContribution[];
  };
  commands?: VsixCommandContribution[];
}
```

### Parsing Function

```typescript
function parseVsixManifest(
  raw: Uint8Array | string,
  source?: string
): VsixExtensionManifest
```

**Parameters:**
- `raw` - Raw bytes (Uint8Array) or plain text (string) of the manifest
- `source` - Optional source identifier for error messages

**Returns:** Parsed `VsixExtensionManifest` object

**Throws:** Error if manifest is invalid or missing required fields

### Helper Functions

```typescript
// Check if a filename is a valid extension manifest
function isVsixFile(name: string): boolean

// Constants for file extensions
const VSIX_EXTENSION = 'vsix';
const HSIXET_EXTENSION = 'hsixet';
const HSIEXT_EXTENSION = 'hsiext';
```

## Best Practices

1. **Always include required fields**: `id`, `name`, and `version` are mandatory
2. **Use semantic versioning**: Follow `MAJOR.MINOR.PATCH` format for versions
3. **Use reverse domain notation for IDs**: e.g., `com.company.extension`
4. **Keep descriptions concise**: One-line descriptions work best
5. **Use pipe separators for lists**: More readable than commas
6. **Add comments for clarity**: Use `;` or `#` for documentation
7. **Test activation events**: Ensure events trigger correctly
8. **Provide meaningful command titles**: Users see these in the command palette

## Troubleshooting

### Common Errors

**Missing required fields:**
```
Invalid extension manifest: missing id, name
```
Solution: Ensure `id`, `name`, and `version` are all present and non-empty.

**Malformed commands:**
```
commands=cmd1:Title1||cmd2:Title2
```
Solution: Avoid double pipes; use single `|` as separator.

**Invalid activation events:**
```
activationEvents=onLanguage:javascript,onCommand:run
```
Solution: Both commas and pipes work, but be consistent.

### Debugging

To debug manifest parsing, check the console for warnings:

```javascript
// In extension code
console.log('[MyExtension] Manifest:', manifest);
```

## Related Documentation

- [CORE_FEATURES.md](./CORE_FEATURES.md) - Core NexCode IDE features
- [Extension Development Guide](./EXTENSION_DEVELOPMENT.md) - How to create extensions
- [Theme Development Guide](./THEME_DEVELOPMENT.md) - How to create themes

## See Also

- `.hsiext` - Alternative extension format (binary)
- `.vsix` - VSCode extension format (ZIP-based)
- Extension API - Runtime API for extensions