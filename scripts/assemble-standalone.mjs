// node scripts/assemble-standalone.mjs   (runs as part of `npm run build`)
//
// `next build` with output: 'standalone' writes a self-contained server to
// .next/standalone, but leaves out what it expects a CDN or a Dockerfile to
// provide. This copies those in, so the directory runs on its own:
//
//   .next/static  ->  .next/standalone/.next/static   JS, CSS and fonts
//   public        ->  .next/standalone/public         logo, icons, manifest
//   drizzle       ->  .next/standalone/drizzle        migrations applied at start
//
// The server changes into .next/standalone when it starts, so code that reads
// process.cwd()/drizzle or process.cwd()/public finds these copies.

import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!existsSync(path.join(standalone, 'server.js'))) {
  console.error('[assemble-standalone] .next/standalone/server.js is missing; run `next build` first.');
  process.exit(1);
}

const copies = [
  [path.join('.next', 'static'), path.join('.next', 'static')],
  ['public', 'public'],
  ['drizzle', 'drizzle'],
];

for (const [from, to] of copies) {
  const target = path.join(standalone, to);
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(root, from), target, { recursive: true });
}

console.log('[assemble-standalone] added .next/static, public and drizzle to .next/standalone');
