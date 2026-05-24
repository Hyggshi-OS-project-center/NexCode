/**
 * Easter egg window renderer.
 */
import momoiUrl from '@icons/Easter_Egg/momoi.png?url';

const momoi = document.getElementById('momoi') as HTMLImageElement | null;
if (momoi) {
  momoi.src = momoiUrl;
}
