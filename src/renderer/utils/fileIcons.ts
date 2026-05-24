/**
 * File / folder icon resolution for the explorer tree (SVG + win32 ICO).
 */
import { resolveExplorerIcon } from '../../shared/win32IconMap';
import { getIconSvg, getWin32IconUrl } from './iconRegistry';

export interface FileIconDescriptor {
  iconName: string;
  kind: 'svg' | 'ico';
}

const FOLDER_BY_NAME: Record<string, { closed: string; open?: string }> = {
  '.git': { closed: 'folder_type_git' },
  '.github': { closed: 'folder_type_github' },
  '.gitlab': { closed: 'folder_type_gitlab' },
  'node_modules': { closed: 'folder_type_package' },
  'src': { closed: 'folder_type_src' },
  'source': { closed: 'folder_type_src' },
  'sources': { closed: 'folder_type_src' },
  'lib': { closed: 'folder_type_src' },
  'dist': { closed: 'folder_type_temp' },
  'build': { closed: 'folder_type_temp' },
  'out': { closed: 'folder_type_temp' },
  'tmp': { closed: 'folder_type_temp' },
  'temp': { closed: 'folder_type_temp' },
  '.vscode': { closed: 'folder_type_vscode' },
  'images': { closed: 'folder_type_images' },
  'image': { closed: 'folder_type_images' },
  'img': { closed: 'folder_type_images' },
  'assets': { closed: 'folder_type_images' },
  'icons': { closed: 'folder_type_images' },
  'public': { closed: 'folder_type_images' },
  'static': { closed: 'folder_type_images' },
  'media': { closed: 'folder_type_video' },
  'video': { closed: 'folder_type_video' },
  'videos': { closed: 'folder_type_video' },
  'audio': { closed: 'folder_type_audio' },
  'music': { closed: 'folder_type_audio' },
  'python': { closed: 'folder_type_python', open: 'folder_type_python_opened' },
  'php': { closed: 'folder_type_php' },
  'css': { closed: 'folder_type_css' },
  'styles': { closed: 'folder_type_css' },
  'typescript': { closed: 'folder_type_typescript' },
  'json': { closed: 'folder_type_json' },
  'config': { closed: 'folder_type_config' },
  '.nexus': { closed: 'folder_type_config' },
  '.nexcode': { closed: 'folder_type_config' },
  'plugins': { closed: 'folder_type_plugin' },
  'extensions': { closed: 'folder_type_plugin' },
  'logs': { closed: 'folder_type_log', open: 'folder_type_log_opened' },
  'log': { closed: 'folder_type_log', open: 'folder_type_log_opened' },
  'windows': { closed: 'folder_type_windows' },
  'release': { closed: 'folder_type_package' },
};

/** Extensions with dedicated SVG assets (media, binaries, etc.) */
const SVG_FILE_BY_EXT: Record<string, string> = {
  pdf: 'file-pdf',
  png: 'file-image',
  jpg: 'file-image',
  jpeg: 'file-image',
  gif: 'file-image',
  webp: 'file-image',
  bmp: 'file-image',
  mp4: 'file-video',
  webm: 'file-video',
  mov: 'file-video',
  avi: 'file-video',
  mkv: 'file-video',
  mp3: 'file-audio',
  wav: 'file-audio',
  flac: 'file-audio',
  ogg: 'file-audio',
  kt: 'file-kotlin',
  kts: 'file-kotlin',
  swift: 'file-swift',
  lua: 'file-lua',
  luau: 'file_type_luau',
  r: 'file-r',
  m: 'file-objectivec',
  mm: 'file-objectivec',
  exe: 'file_type_Windows_exe',
  dll: 'file_type_Windows_exe',
  app: 'file_type_mac_app',
  blend: 'file-blender',
  swf: 'file-swf',
  license: 'file-license',
};

function resolveFolderIcon(name: string, isExpanded: boolean): string {
  const key = name.toLowerCase();
  const entry = FOLDER_BY_NAME[key];
  if (entry) {
    if (isExpanded && entry.open) return entry.open;
    return entry.closed;
  }
  return isExpanded ? 'default_folder_opened' : 'default_folder';
}

function resolveFileIcon(name: string): FileIconDescriptor {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  if (ext && SVG_FILE_BY_EXT[ext]) {
    return { iconName: SVG_FILE_BY_EXT[ext]!, kind: 'svg' };
  }

  const ref = resolveExplorerIcon(name, false);
  if (ref.kind === 'ico') {
    return { iconName: ref.base, kind: 'ico' };
  }
  return { iconName: ref.id, kind: 'svg' };
}

export function getFileIcon(
  name: string,
  isDirectory: boolean,
  isExpanded = false,
): FileIconDescriptor {
  if (isDirectory) {
    return { iconName: resolveFolderIcon(name, isExpanded), kind: 'svg' };
  }
  return resolveFileIcon(name);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** HTML for a tree row icon span */
export function renderFileIconHtml(
  name: string,
  isDirectory: boolean,
  isExpanded = false,
): string {
  const icon = getFileIcon(name, isDirectory, isExpanded);

  if (icon.kind === 'ico') {
    const url = getWin32IconUrl(icon.iconName);
    if (url) {
      return `<span class="tree-icon tree-icon-file tree-icon-ico" role="img" aria-label="${escapeAttr(icon.iconName)}" aria-hidden="true"><img src="${escapeAttr(url)}" alt="" width="16" height="16" decoding="async" /></span>`;
    }
  }

  const svg = getIconSvg(icon.iconName);
  return `<span class="tree-icon tree-icon-file" role="img" aria-label="${escapeAttr(icon.iconName)}" aria-hidden="true">${svg}</span>`;
}
