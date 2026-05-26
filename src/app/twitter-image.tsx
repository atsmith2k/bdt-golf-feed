// Twitter / X card. Same dimensions and design as the OpenGraph image —
// we delegate to the shared component but keep distinct route exports so
// Next's static analyzer can read the `runtime` literal directly.

import OpenGraphImage from './opengraph-image';

export const alt = 'BDT Golf Network — live broadcast-style scoreboard for the BDT Tour';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default function TwitterImage() {
  return OpenGraphImage();
}
