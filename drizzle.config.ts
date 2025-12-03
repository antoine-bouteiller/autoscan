import { defineConfig } from 'drizzle-kit'

import env from '@/config/env'

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  dialect: 'sqlite',
  out: './migrations',
  schema: './src/database/schema.ts',
})
