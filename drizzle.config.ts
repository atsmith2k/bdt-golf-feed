import 'dotenv/config';
import type { Config } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run drizzle-kit. See .env.example.');
}

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  // Verbose=false keeps drizzle-kit's stdout calm during CI.
  verbose: false,
  strict: true,
} satisfies Config;
