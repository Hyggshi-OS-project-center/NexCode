/**
 * Easter egg window renderer.
 * Randomly displays either Momoi or various versions of Shiroko.
 */

import momoiUrl from '@icons/Easter_Egg/momoi.png?url';
import shirokoUrl from '@icons/Easter_Egg/shiroko.png?url';
import shiroko1Url from '@icons/Easter_Egg/shiroko1.png?url';
import shiroko2Url from '@icons/Easter_Egg/shiroko2.jpg?url';
import arisuUrl from '@icons/Easter_Egg/Arisu.jpg?url';

const images = [
  momoiUrl, 
  shirokoUrl, 
  shiroko1Url, 
  shiroko2Url,
  arisuUrl
];

const randomIndex = Math.floor(Math.random() * images.length);

// Cast DOM elements precisely and definitively.
const img = document.getElementById('egg-img') as HTMLImageElement;

if (img) {
  img.src = images[randomIndex];
}
