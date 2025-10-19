import env from '@/config/env'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  dialect: 'sqlite',
  out: './migrations',
  schema: './src/db/schema.ts',
})
