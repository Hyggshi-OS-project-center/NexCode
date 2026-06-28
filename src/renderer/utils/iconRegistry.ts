/**
 * Loads explorer icons from src/icons (SVG) and src/icons/win32 (ICO).
 */
const svgModules = import.meta.glob('../../icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const icoModules = import.meta.glob('../../icons/win32/*.ico', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const SVG_ICONS = new Map<string, string>();
const WIN32_ICO_URLS = new Map<string, string>();

for (const [filePath, svg] of Object.entries(svgModules)) {
  const base = filePath.split('/').pop()?.replace(/\.svg$/i, '') ?? '';
  if (base) SVG_ICONS.set(base, svg);
}

for (const [filePath, url] of Object.entries(icoModules)) {
  const base = filePath.split('/').pop()?.replace(/\.ico$/i, '') ?? '';
  if (base) WIN32_ICO_URLS.set(base, url);
}

export function getIconSvg(iconName: string): string {
  return SVG_ICONS.get(iconName) ?? SVG_ICONS.get('file-text') ?? '';
}

export function getWin32IconUrl(iconBase: string): string | undefined {
  return WIN32_ICO_URLS.get(iconBase);
}

export function hasIcon(iconName: string): boolean {
  return SVG_ICONS.has(iconName) || WIN32_ICO_URLS.has(iconName);
}
