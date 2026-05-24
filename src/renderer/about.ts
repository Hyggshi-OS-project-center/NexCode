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
  const lines = [info.author ? `© ${info.author}` : '', `Electron ${info.electron}`].filter(Boolean);
  meta.textContent = lines.join(' · ');

  if (info.iconUrl) {
    const logo = document.getElementById('about-logo') as HTMLImageElement;
    logo.src = info.iconUrl;
    logo.alt = info.productName;
    logo.classList.remove('hidden');
  }

  document.getElementById('about-ok')?.addEventListener('click', () => window.aboutAPI.close());
}

void init();
