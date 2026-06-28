/**
 * Text content analysis for editor warnings (invisible / control characters).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hasManyInvisibleCharacters(text: string): boolean {
  const sample = text.slice(0, 100_000);
  if (!sample.length) return false;

  let invisible = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (
      code === 0 ||
      code === 0xfffd ||
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0x200b && code <= 0x200f) ||
      code === 0xfeff ||
      code === 0x2060
    ) {
      invisible++;
    }
  }
  return invisible > 40 || invisible / sample.length > 0.02;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
