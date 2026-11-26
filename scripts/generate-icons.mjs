// scripts/generate-icons.mjs
//
// `npm run icons`: rebuild every icon and preview asset from the one source
// logo, public/bdt-logo.png. Run it after replacing the logo and commit the
// results. Uses sharp, which Next.js already installs.
//
// Outputs
//   public/bdt-logo-sm.png          the whole logo at header size (what <BdtLogo> renders)
//   public/bdt-shield.png            the shield cut out of the logo's glow (header-size uses, social card)
//   src/app/favicon.ico              16/32/48 px, for browsers that ask for /favicon.ico
//   src/app/icon.png                 192 px tab icon (Next.js emits the <link>)
//   src/app/apple-icon.png           180 px, opaque, for iOS home screens
//   public/icon-192.png, icon-512.png, icon-maskable-512.png   web manifest icons

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(root, ...p);

const SOURCE = at('public', 'bdt-logo.png');
// Where the shield sits inside the 1024x1536 source, and its corner radius.
const SHIELD = { left: 112, top: 210, width: 780, height: 1092, radius: 104 };
const NAVY = { r: 11, g: 30, b: 64, alpha: 1 }; // #0B1E40, the site background
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** The shield alone: cropped, with everything outside its rounded edge transparent. */
async function cutShield() {
  const { width, height, radius } = SHIELD;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  // Two passes: sharp applies removeAlpha after composite within one pipeline,
  // which would discard the mask.
  const opaque = await sharp(SOURCE).extract(SHIELD).removeAlpha().png().toBuffer();
  return sharp(opaque)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** The shield centred on a square canvas; `fill` is how much of the square it may occupy. */
async function square(shield, size, { background = CLEAR, fill = 1 } = {}) {
  const inner = Math.round(size * fill);
  const mark = await sharp(shield)
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const shield = await cutShield();
await mkdir(at('src', 'app'), { recursive: true });

const out = {
  'public/bdt-logo-sm.png': await sharp(SOURCE).resize({ height: 192 }).png({ compressionLevel: 9 }).toBuffer(),
  'public/bdt-shield.png': await sharp(shield).resize({ height: 560 }).png({ compressionLevel: 9 }).toBuffer(),
  'src/app/icon.png': await square(shield, 192),
  'src/app/apple-icon.png': await square(shield, 180, { background: NAVY, fill: 0.86 }),
  'public/icon-192.png': await square(shield, 192),
  'public/icon-512.png': await square(shield, 512),
  // Maskable icons are cropped to a circle or squircle: keep the mark inside the safe zone.
  'public/icon-maskable-512.png': await square(shield, 512, { background: NAVY, fill: 0.66 }),
  'src/app/favicon.ico': ico(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(shield, size) }))),
  ),
};

for (const [file, data] of Object.entries(out)) {
  await writeFile(at(...file.split('/')), data);
  console.log(`${file}  ${(data.length / 1024).toFixed(1)} KB`);
}
