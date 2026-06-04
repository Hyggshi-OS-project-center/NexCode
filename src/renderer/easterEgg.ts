/**
 * Easter egg window renderer.
 * Randomly displays either Momoi or various versions, Shiroko, Arisu and others.
 */

import momoiUrl from '@icons/Easter_Egg/momoi.png?url';
import shirokoUrl from '@icons/Easter_Egg/shiroko.png?url';
import shiroko1Url from '@icons/Easter_Egg/shiroko1.png?url';
import shiroko2Url from '@icons/Easter_Egg/shiroko2.jpg?url';
import arisuUrl from '@icons/Easter_Egg/Arisu.jpg?url';
import hoshino_UheeeeUrl from '@icons/Easter_Egg/Hoshino_Uheeee.png?url';
import hoshino_UheeeeAudioUrl from '@icons/Easter_Egg/hoshino-uhee.mp3?url';

interface EggCharacter {
  image: string;
  audio?: string;
}

const characters: EggCharacter[] = [
  { image: momoiUrl },
  { image: shirokoUrl },
  { image: shiroko1Url },
  { image: shiroko2Url },
  { image: arisuUrl },
  { image: hoshino_UheeeeUrl, audio: hoshino_UheeeeAudioUrl }
];

const randomIndex = Math.floor(Math.random() * characters.length);
const selected = characters[randomIndex];

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
