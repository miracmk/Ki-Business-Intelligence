import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema:   './db/schema.ts',
  out:      './db/migrations',
  dialect:  'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://platform:changeme@localhost:5433/ki_platform',
  },
  verbose: true,
  strict:  true,
})
