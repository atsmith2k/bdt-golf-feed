// node scripts/start.mjs   (`npm start`)
//
// Starts the standalone server that `npm run build` assembled. It needs no
// node_modules beside the repo: everything it loads is in .next/standalone.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const server = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.next',
  'standalone',
  'server.js',
);

if (!existsSync(server)) {
  console.error('[start] .next/standalone/server.js is missing; run `npm run build` first.');
  process.exit(1);
}

// The standalone server binds to $HOSTNAME, which some hosts set to the
// machine's name. Listen on every interface, as `next start` did, unless
// BIND_HOST says otherwise. The port is $PORT (default 3000).
process.env.HOSTNAME = process.env.BIND_HOST || '0.0.0.0';

await import(pathToFileURL(server).href);
