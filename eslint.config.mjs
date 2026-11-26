import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  // The codebase carries eslint-disable comments for rules this config no longer enables.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'] },
];

export default config;
