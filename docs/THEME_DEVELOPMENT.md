# Theme Development Guide

## Overview

NexCode supports custom themes through the `.hsixet` manifest format. Themes allow you to customize the IDE's appearance with custom colors, styles, and even audio feedback.

## Theme Structure

A NexCode theme consists of two files:
1. **Manifest file** (`theme-<name>.hsixet`) - INI-like manifest with theme metadata
2. **CSS file** (`theme-<name>.css`) - CSS styles for the theme

## Creating a Theme

### Step 1: Create the CSS File

Create a CSS file with your theme styles. The CSS should target the `[data-theme="<theme-name>"]` attribute:

```css
[data-theme="my-custom-theme"] {
  --background-primary: #1e1e1e;
  --background-secondary: #252526;
  --foreground-primary: #d4d4d4;
  --accent-color: #007acc;
  --border-color: #3e3e42;
}
```

**Important**: For the default dark theme, also include `:root` and `[data-theme="dark"]`:

```css
:root, [data-theme="dark"] {
  --background-primary: #1e1e1e;
  --background-secondary: #252526;
  --foreground-primary: #d4d4d4;
}
```

### Step 2: Create the Manifest File

Create a `.hsixet` manifest file with the following required fields:

```ini
id=nexcode.theme.my-custom-theme
name=My Custom Theme
version=1.0.0
description=A beautiful custom theme for NexCode
author=Your Name
main=theme-my-custom-theme.css
theme=My Custom Theme
themeCss=theme-my-custom-theme.css
```

### Step 3: Install the Theme

Place both files in one of these directories:
- `.nexcode/extensions/`
- `.nexus/extensions/`

NexCode will automatically detect and load the theme on startup.

## Theme Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g., `nexcode.theme.<name>`) |
| `name` | Yes | Display name shown in theme selector |
| `version` | Yes | Semantic version (e.g., `1.0.0`) |
| `description` | No | Brief description of the theme |
| `author` | No | Theme author name |
| `main` | Yes | CSS file path (e.g., `theme-my-theme.css`) |
| `theme` | Yes | Theme name (used in `[data-theme="..."]`) |
| `themeCss` | Yes | CSS file path (same as `main` for themes) |
| `audio` | No | Optional audio file for theme sound effects |

## CSS Variables Reference

NexCode uses CSS custom properties (variables) for theming. Here are the main variables you can customize:

### Background Colors

```css
--background-primary: #1e1e1e;        /* Main editor background */
--background-secondary: #252526;      /* Sidebar, panels */
--background-tertiary: #2d2d30;       /* Input fields, dropdowns */
--background-hover: #2a2d2e;          /* Hover states */
--background-active: #37373d;         /* Active/selected items */
```

### Foreground Colors

```css
--foreground-primary: #d4d4d4;        /* Primary text */
--foreground-secondary: #cccccc;      /* Secondary text */
--foreground-muted: #858585;          /* Muted/disabled text */
--foreground-link: #4fc1ff;           /* Links */
```

### Accent Colors

```css
--accent-color: #007acc;              /* Primary accent (buttons, links) */
--accent-hover: #1c97ea;              /* Accent hover state */
--accent-active: #0062a3;             /* Accent active state */
```

### Border Colors

```css
--border-color: #3e3e42;              /* Standard borders */
--border-focus: #007acc;              /* Focus borders */
--border-error: #f48771;              /* Error states */
```

### Syntax Highlighting

```css
--syntax-keyword: #569cd6;            /* Keywords (if, return, etc.) */
--syntax-string: #ce9178;             /* String literals */
--syntax-number: #b5cea8;             /* Numbers */
--syntax-comment: #6a9955;            /* Comments */
--syntax-function: #dcdcaa;           /* Function names */
--syntax-variable: #9cdcfe;           /* Variables */
--syntax-operator: #d4d4d4;           /* Operators */
--syntax-class: #4ec9b0;              /* Class names */
```

### Editor Specific

```css
--editor-line-highlight: #2a2d2e;     /* Current line highlight */
--editor-selection: #264f78;          /* Selected text background */
--editor-cursor: #aeafad;             /* Cursor color */
--editor-gutter: #1e1e1e;             /* Line number gutter */
--editor-line-number: #858585;        /* Line numbers */
--editor-line-number-active: #c6c6c6; /* Active line number */
```

### UI Elements

```css
--scrollbar-thumb: #424242;           /* Scrollbar thumb */
--scrollbar-thumb-hover: #4f4f4f;     /* Scrollbar thumb hover */
--tab-active: #1e1e1e;                /* Active tab background */
--tab-inactive: #2d2d30;              /* Inactive tab background */
--tab-hover: #2a2d2e;                 /* Tab hover */
--statusbar-bg: #007acc;              /* Status bar background */
--statusbar-fg: #ffffff;              /* Status bar text */
--titlebar-bg: #323233;               /* Title bar background */
--titlebar-fg: #cccccc;               /* Title bar text */
```

## Complete Theme Example

### Example 1: Dark Theme

**theme-dark.hsixet:**
```ini
id=nexcode.theme.dark
name=Dark Theme
version=1.0.0
description=Default dark theme for NexCode
author=NexCode IDE
main=theme-dark.css
theme=dark
themeCss=theme-dark.css
```

**theme-dark.css:**
```css
:root, [data-theme="dark"] {
  --background-primary: #1e1e1e;
  --background-secondary: #252526;
  --background-tertiary: #2d2d30;
  --foreground-primary: #d4d4d4;
  --foreground-secondary: #cccccc;
  --accent-color: #007acc;
  --border-color: #3e3e42;
  --editor-selection: #264f78;
  --editor-cursor: #aeafad;
  --syntax-keyword: #569cd6;
  --syntax-string: #ce9178;
  --syntax-number: #b5cea8;
  --syntax-comment: #6a9955;
  --syntax-function: #dcdcaa;
}
```

### Example 2: Light Theme

**theme-light.hsixet:**
```ini
id=nexcode.theme.light
name=Light Theme
version=1.0.0
description=Clean light theme
author=NexCode IDE
main=theme-light.css
theme=light
themeCss=theme-light.css
```

**theme-light.css:**
```css
[data-theme="light"] {
  --background-primary: #ffffff;
  --background-secondary: #f3f3f3;
  --background-tertiary: #e8e8e8;
  --foreground-primary: #333333;
  --foreground-secondary: #555555;
  --accent-color: #0064b7;
  --border-color: #d0d0d0;
  --editor-selection: #add6ff;
  --editor-cursor: #000000;
  --syntax-keyword: #0000ff;
  --syntax-string: #a31515;
  --syntax-number: #098658;
  --syntax-comment: #008000;
  --syntax-function: #795e26;
}
```

### Example 3: Custom Theme with Audio

**theme-cyber.hsixet:**
```ini
id=nexcode.theme.cyber
name=Cyber Theme
version=1.0.0
description=Cyberpunk-themed IDE with neon colors
author=Your Name
main=theme-cyber.css
theme=Cyber Lime
themeCss=theme-cyber.css
audio=theme-cyber.ogg
```

**theme-cyber.css:**
```css
[data-theme="Cyber Lime"] {
  --background-primary: #0a0a0a;
  --background-secondary: #111111;
  --foreground-primary: #00ff00;
  --foreground-secondary: #00cc00;
  --accent-color: #39ff14;
  --border-color: #00ff00;
  --editor-selection: #003300;
  --editor-cursor: #00ff00;
  --syntax-keyword: #ff00ff;
  --syntax-string: #ffff00;
  --syntax-number: #00ffff;
  --syntax-comment: #666666;
  --syntax-function: #ff6600;
}
```

## Adding Audio to Themes

You can add audio feedback to your theme by including an `audio` field in the manifest:

```ini
audio=theme-sound.ogg
```

**Audio requirements:**
- Format: OGG Vorbis (`.ogg`)
- Recommended duration: 1-3 seconds
- Recommended sample rate: 44.1kHz
- Keep file size small (< 100KB)

The audio will play automatically when the theme is activated.

## Theme Naming Conventions

### File Naming
- Use lowercase with hyphens: `theme-dark.css`, `theme-my-theme.hsixet`
- Avoid spaces and special characters
- Keep names descriptive but concise

### Theme ID
- Use reverse domain notation: `nexcode.theme.<name>`
- Use lowercase with dots: `nexcode.theme.dark`
- Be unique to avoid conflicts

### Theme Name (display name)
- Use title case: "Dark Theme", "My Custom Theme"
- Can include spaces for readability
- Keep under 50 characters

## Building Themes

NexCode includes a build script to generate theme packages from a central CSS file:

```bash
npm run build:themes-hsixet
```

This script:
1. Reads `src/renderer/styles/themes.css`
2. Extracts individual theme blocks
3. Generates `.hsixet` manifests and `.css` files
4. Outputs to `.nexcode/extensions/`

### Manual Theme Building

You can also manually create themes without the build script:

1. Create your CSS file with theme styles
2. Create the `.hsixet` manifest
3. Copy both files to `.nexcode/extensions/`
4. Restart NexCode or use the command palette to reload themes

## Testing Themes

### Local Testing

1. Place theme files in `.nexcode/extensions/`
2. Restart NexCode
3. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Run "Preferences: Color Theme"
5. Select your theme

### Debugging

Check the developer console for theme-related messages:

```javascript
// Look for these messages
[Theme nexcode.theme.my-theme] Loaded successfully
[Theme nexcode.theme.my-theme] Error: CSS file not found
```

### Common Issues

**Theme not appearing:**
- Ensure both `.hsixet` and `.css` files are in the same directory
- Check that `id`, `name`, `version` are present in manifest
- Verify file names match between manifest and actual files

**Styles not applying:**
- Ensure CSS targets `[data-theme="Theme Name"]` correctly
- Check for CSS syntax errors
- Verify variable names use double dashes (`--variable-name`)

**Audio not playing:**
- Ensure audio file is in OGG format
- Check file path in manifest is correct
- Verify file size is reasonable (< 100KB)

## Theme Distribution

### Packaging

To distribute your theme:

1. Create a folder with your theme name
2. Include both `.hsixet` and `.css` files
3. Optionally include audio files
4. Create a ZIP archive

### Installation

Users can install your theme by:
1. Extracting the ZIP to `.nexcode/extensions/`
2. Or using the Extensions view in NexCode (if supported)

## Advanced Topics

### Multiple Themes in One Package

You can include multiple themes in a single extension by creating multiple `.hsixet` files:

```
.nexcode/extensions/
├── theme-dark.hsixet
├── theme-dark.css
├── theme-light.hsixet
├── theme-light.css
└── theme-cyber.hsixet
    └── theme-cyber.css
```

### Theme Inheritance

Create base themes and extend them:

```css
/* Base dark theme */
:root, [data-theme="dark"] {
  --background-primary: #1e1e1e;
  --accent-color: #007acc;
}

/* Extended theme */
[data-theme="dark-blue"] {
  --accent-color: #0064b7;
  /* Inherits all other dark theme variables */
}
```

### Dynamic Themes

Themes can respond to system preferences:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background-primary: #1e1e1e;
  }
}

@media (prefers-color-scheme: light) {
  :root {
    --background-primary: #ffffff;
  }
}
```

## Best Practices

1. **Test on multiple platforms**: Colors may appear differently on Windows, macOS, and Linux
2. **Ensure contrast**: Meet WCAG AA standards for text readability
3. **Consider accessibility**: Avoid color combinations that are hard to distinguish
4. **Keep it simple**: Don't override too many variables; let NexCode handle defaults
5. **Document your theme**: Include a detailed description and author information
6. **Version properly**: Use semantic versioning for updates
7. **Test with real code**: Open various file types to ensure syntax highlighting looks good
8. **Optimize file size**: Keep CSS and audio files as small as possible

## Publishing

To share your theme with the NexCode community:

1. Create a GitHub repository
2. Include README with screenshots
3. Add installation instructions
4. Submit to the NexCode extension marketplace (when available)
5. Tag releases with version numbers

## Resources

- [HSIXET_API.md](./HSIXET_API.md) - Complete .hsixet format reference
- [EXTENSION_DEVELOPMENT.md](./EXTENSION_DEVELOPMENT.md) - Full extension development guide
- [CORE_FEATURES.md](./CORE_FEATURES.md) - NexCode IDE features
- CSS Custom Properties: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- WCAG Contrast Guidelines: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum

## See Also

- [Theme Development Examples](#examples) - Example themes in this guide
- [Extension Development](./EXTENSION_DEVELOPMENT.md) - Create full extensions
- [API Documentation](./HSIXET_API.md) - .hsixet format specification