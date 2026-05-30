/**
 * About dialog renderer — populated from main via aboutAPI.
 */
import type { AboutInfo } from '../shared/types';

declare global {
  interface Window {
    aboutAPI: {
      getInfo: () => Promise<AboutInfo>;
      close: () => void;
    };
  }
}

async function init(): Promise<void> {
  const info = await window.aboutAPI.getInfo();

  document.title = `About ${info.productName}`;
  document.getElementById('about-title')!.textContent = info.productName;
  document.getElementById('about-tagline')!.textContent = info.description;
  document.getElementById('about-version')!.textContent = info.version;

  const meta = document.getElementById('about-meta')!;
  const versionLabel = info.installType ? `${info.version} (${info.installType})` : info.version;
  document.getElementById('about-version')!.textContent = versionLabel;
  const lines = [
    info.author ? `© ${info.author}` : '',
    `Electron ${info.electron}`,
    info.chromium ? `Chromium ${info.chromium}` : '',
    info.node ? `Node.js ${info.node}` : '',
    info.v8 ? `V8 ${info.v8}` : '',
    info.os ? `OS: ${info.os}` : '',
  ].filter(Boolean);
  meta.textContent = lines.join('\n');

  if (info.iconUrl) {
    const logo = document.getElementById('about-logo') as HTMLImageElement;
    logo.src = info.iconUrl;
    logo.alt = info.productName;
    logo.classList.remove('hidden');
  }

  const closeAboutWindow = (): void => {
    if (window.aboutAPI?.close) {
      try {
        window.aboutAPI.close();
        return;
      } catch {
        /* fallback to window close */
      }
    }
    window.close();
  };

  document.getElementById('about-ok')?.addEventListener('click', closeAboutWindow);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAboutWindow();
  });
}

void init();
