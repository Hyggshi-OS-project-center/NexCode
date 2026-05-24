/**
 * Detect binary / media files before opening in the text editor.
 */
import path from 'path';
import type { MediaKind } from '../../shared/types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'apng']);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'ogv', 'ogg', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv', '3gp', 'mpeg', 'mpg',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'flac', 'm4a', 'aac', 'wma', 'opus', 'oga', 'weba', 'mid', 'midi',
]);

const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  'pdf', 'zip', 'gz', 'rar', '7z', 'tar', 'exe', 'dll', 'so',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'bin', 'dat', 'db', 'sqlite', 'class', 'pyc', 'o',
]);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  apng: 'image/apng',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  wmv: 'video/x-ms-wmv',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  oga: 'audio/ogg',
  weba: 'audio/webm',
};

export function getExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

export function getMediaKind(ext: string): MediaKind {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

export function isKnownBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

export function getMediaMime(ext: string): string {
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Heuristic: null bytes or high ratio of control characters => binary */
export function isBinaryBuffer(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / sample.length > 0.3;
}
