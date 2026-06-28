/**
 * Maps file extensions to Windows association icons in src/icons/win32/*.ico
 * Used by the in-app explorer (via WIN32_BASE_TO_SVG). Installer: scripts/file-associations.cjs
 */

/** Extension → win32 icon base name (first match wins in resolver) */
export const WIN32_ICON_BY_EXT: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'react',
  ts: 'typescript',
  tsx: 'react',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  pyw: 'python',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'less',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  java: 'java',
  class: 'java',
  jar: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  go: 'go',
  kt: 'kotlin',
  kts: 'kotlin',
  lua: 'lua',
  luau: 'luau',
  hosc: 'hosc',
  rs: 'rust',
  vue: 'vue',
  sql: 'sql',
  ps1: 'powershell',
  psm1: 'powershell',
  sh: 'shell',
  bash: 'shell',
  bat: 'shell',
  cmd: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  vsix: 'xml',
  pug: 'jade',
  jade: 'jade',
  ini: 'config',
  cfg: 'config',
  conf: 'config',
  env: 'config',
  txt: 'default',
  log: 'default',
  text: 'default',
};

/** In-app explorer uses SVG only — maps win32 icon base → bundled SVG id */
export const WIN32_BASE_TO_SVG: Record<string, string> = {
  javascript: 'file-javascript',
  react: 'file-typescript',
  typescript: 'file-typescript',
  json: 'file-json',
  rust: 'file-rust',
  python: 'file-python',
  html: 'file-html',
  css: 'file-css',
  sass: 'file-css',
  less: 'file-css',
  markdown: 'file-markdown',
  java: 'file-java',
  c: 'file-c',
  cpp: 'file-cpp',
  csharp: 'file-csharp',
  php: 'file-php',
  ruby: 'file-ruby',
  go: 'file-go',
  kotlin: 'file-kotlin',
  lua: 'file-lua',
  luau: 'file_type_luau',
  /** hosc, unknown, default — use bundled win32/*.ico in explorer (no SVG) */
  unknown: 'file-text',
  vue: 'file-html',
  sql: 'file-sql',
  powershell: 'file-powershell',
  shell: 'file-powershell',
  yaml: 'file-json',
  xml: 'file-html',
  jade: 'file-html',
  config: 'file_type_config',
  bower: 'file-json',
  default: 'file-text',
};

const CONFIG_BASENAMES = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'bower.json',
  '.editorconfig',
  '.gitignore',
  'electron-builder.yml',
]);

export function resolveWin32IconBase(fileName: string, isDirectory: boolean): string | null {
  if (isDirectory) return null;

  const lower = fileName.toLowerCase();
  if (CONFIG_BASENAMES.has(lower)) return 'config';

  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  if (ext && WIN32_ICON_BY_EXT[ext]) return WIN32_ICON_BY_EXT[ext]!;

  return 'unknown';
}

export type ExplorerIconRef =
  | { kind: 'svg'; id: string }
  | { kind: 'ico'; base: string };

const GENERIC_SVG_ICON = 'file-text';

/** Explorer icon: SVG when we have a distinct asset, otherwise the matching win32 .ico */
export function resolveExplorerIcon(fileName: string, isDirectory: boolean): ExplorerIconRef {
  if (isDirectory) return { kind: 'svg', id: 'default_folder' };

  const win32Base = resolveWin32IconBase(fileName, false);
  if (!win32Base) return { kind: 'svg', id: GENERIC_SVG_ICON };

  const svgId = WIN32_BASE_TO_SVG[win32Base];
  if (svgId && svgId !== GENERIC_SVG_ICON) {
    return { kind: 'svg', id: svgId };
  }
  return { kind: 'ico', base: win32Base };
}

/** @deprecated Use resolveExplorerIcon — SVG id only (ico bases become file-text) */
export function resolveExplorerSvgIcon(fileName: string, isDirectory: boolean): string {
  const ref = resolveExplorerIcon(fileName, isDirectory);
  return ref.kind === 'svg' ? ref.id : GENERIC_SVG_ICON;
}
