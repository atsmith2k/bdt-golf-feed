// src/lib/env.ts
//
// Hosting dashboards store an env value exactly as pasted. A line copied out of
// a .env file (`NAME="value"`) therefore arrives with its quotes as part of the
// value, which breaks URL parsing and token comparisons. Read every variable
// through `cleanEnv` so a quoted paste behaves like an unquoted one.
//
// Pass the `process.env.NAME` expression itself (not a dynamic lookup) so
// Next.js can still inline NEXT_PUBLIC_* values. Edge-runtime safe.

export function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    trimmed.length >= 2 &&
    (quote === '"' || quote === "'") &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
