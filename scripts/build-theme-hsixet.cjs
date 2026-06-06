const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const themesCssPath = path.join(repoRoot, 'src', 'renderer', 'styles', 'themes.css');
const outDir = path.join(repoRoot, '.nexcode', 'extensions');

if (!fs.existsSync(themesCssPath)) {
  console.error(`Missing source themes file: ${themesCssPath}`);
  process.exit(1);
}

const content = fs.readFileSync(themesCssPath, 'utf8');

const themeBlocks = [];
const splitRegex = /(^|\n)(?:\:root,\s*\[data-theme="dark"\]|\[data-theme="([^\"]+)"\])\s*\{/g;
let match;
let lastIndex = 0;
let lastTheme = null;

while ((match = splitRegex.exec(content))) {
  if (lastTheme) {
    const blockText = content.slice(lastIndex, match.index).trim();
    if (blockText) {
      themeBlocks.push({ theme: lastTheme, body: blockText });
    }
  }

  lastIndex = match.index + match[0].length;
  lastTheme = match[2] || 'dark';
}

if (lastTheme) {
  const blockText = content.slice(lastIndex).trim();
  if (blockText) {
    themeBlocks.push({ theme: lastTheme, body: blockText });
  }
}

if (themeBlocks.length === 0) {
  console.error('No theme blocks found in themes.css');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const normalizeThemeName = (name) => name.replace(/\s+/g, '-').toLowerCase();
const titleize = (name) => name.replace(/(^|-)([a-z])/g, (_, dash, ch) => (dash ? ' ' : '') + ch.toUpperCase()).trim();

for (const { theme, body } of themeBlocks) {
  const normalized = normalizeThemeName(theme);
  const fileName = `theme-${normalized}.css`;
  const manifestName = `theme-${normalized}.hsixet`;
  const cssContent = theme === 'dark'
    ? `:root, [data-theme="dark"] {\n${body}\n}`
    : `[data-theme="${theme}"] {\n${body}\n}`;

  const manifest = [
    `id=nexcode.theme.${normalized}`,
    `name=NexCode ${titleize(normalized)} Theme`,
    `version=0.1.0`,
    `description=Generated NexCode theme manifest for ${titleize(normalized)}.`,
    `author=NexCode IDE`,
    `main=${fileName}`,
    `theme=${theme}`,
    `themeCss=${fileName}`,
  ].join('\n') + '\n';

  fs.writeFileSync(path.join(outDir, manifestName), manifest, 'utf8');
  fs.writeFileSync(path.join(outDir, fileName), cssContent, 'utf8');
  console.log(`Generated ${manifestName} and ${fileName}`);
}

console.log(`Built ${themeBlocks.length} theme package(s) into ${outDir}`);
