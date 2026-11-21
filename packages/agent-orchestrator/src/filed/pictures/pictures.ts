/**
 * Which of the pictures handed to a run its first step is shown in its session's first message, and why each other is held back
 * (`picturesShown`), pure, proved by `contracts/pictures-shown.contract.ts`; and the bounds a picture is shown within (`PICTURE_BOUNDS`).
 */
import type { PictureBounds, PicturesShownOf, PictureHeld } from '../../../contracts/pictures-shown.contract.ts';

/**
 * The bounds a first message shows pictures within, under what the model takes in one request (platform.claude.com, Vision, *Request
 * limits*): 20 pictures, the stricter count past which every picture of a request is held to smaller sides; 5 MiB a picture, raw bytes,
 * whose base64 stays under the API's 10 MB a picture; 8000 pixels a side, the API's largest.
 */
export const PICTURE_BOUNDS: PictureBounds = { count: 20, bytes: 5 * 1024 * 1024, side: 8000 };

/**
 * Which pictures of `handed` the step is shown, in the order handed, and why each other is held: all held for its harness where it shows
 * none; else each held for its format, its bytes or its sides where it does not fit, and once as many as a message shows are shown, for
 * the count.
 * @param handed The pictures handed to the run, as the filing read each one's header.
 * @param shows Whether the step's harness shows a session a picture.
 * @param bounds How many pictures a message shows, and how large one may be.
 */
export const picturesShown: PicturesShownOf = (handed, shows, bounds) => {
  const shown: string[] = [];
  const held: PictureHeld[] = [];
  for (const p of handed) {
    if (!shows) held.push({ name: p.name, reason: 'harness' });
    else if (p.type === null) held.push({ name: p.name, reason: 'format' });
    else if (p.bytes > bounds.bytes) held.push({ name: p.name, reason: 'size' });
    else if (p.width === null || p.height === null || p.width > bounds.side || p.height > bounds.side)
      held.push({ name: p.name, reason: 'sides' });
    else if (shown.length >= bounds.count) held.push({ name: p.name, reason: 'count' });
    else shown.push(p.name);
  }
  return { shown, held };
};
