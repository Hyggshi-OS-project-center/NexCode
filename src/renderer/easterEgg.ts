/**
 * Easter egg window renderer.
 * Randomly displays either Momoi or various versions, Shiroko, Arisu and others —
 * or a project's own custom character(s) from `.nexcode/custom/easter-egg.json`,
 * see `window.easterEggAPI` (exposed by `easterEggPreload.ts`).
 */
import type { CustomEasterEggConfig } from '../shared/types';


declare global {
  interface Window {
    easterEggAPI?: {
      getCustomConfig: () => Promise<CustomEasterEggConfig | null>;
    };
  }
}

interface EggCharacter {
  image: string;
  audio?: string;
}

const builtInCharacters: EggCharacter[] = [

];

async function resolveCharacterPool(): Promise<EggCharacter[]> {
  try {
    const custom = await window.easterEggAPI?.getCustomConfig();
    if (custom && custom.characters.length > 0) {
      return custom.mode === 'extend' ? [...builtInCharacters, ...custom.characters] : custom.characters;
    }
  } catch (err) {
    console.error('Failed to load custom Easter Egg config:', err);
  }
  return builtInCharacters;
}

async function init(): Promise<void> {
  const characters = await resolveCharacterPool();
  const pool = characters.filter((c) => Boolean(c.image));
  if (pool.length === 0) return; // nothing valid to show — leave the window blank rather than a broken icon
  const selected = pool[Math.floor(Math.random() * pool.length)];

  const img = document.getElementById('egg-img') as HTMLImageElement | null;
  if (img) {
    img.src = selected.image;
  }

  if (selected.audio) {
    const audio = new Audio();
    audio.autoplay = false;
    audio.preload = 'none';
    audio.src = selected.audio;

    let played = false;
    const playAudio = () => {
      if (played) return;
      played = true;
      audio.play().catch(err => console.error("Audio playback failed:", err));
      document.removeEventListener('pointerdown', playAudio);
    };

    document.addEventListener('pointerdown', playAudio);
  }
}

void init();
