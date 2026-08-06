import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { Layer } from 'effect'

import env from '@/config/env'
import { Database } from '@/core/runtime.service'

const sql = new SQL({
  ...(env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }),
  database: env.POSTGRES_DATABASE,
  password: env.POSTGRES_PASSWORD,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USERNAME,
})

export const testDatabase = drizzle({ client: sql })
await migrate(testDatabase, { migrationsFolder: './migrations' })

export const DatabaseTestLayer = Layer.succeed(Database, { db: testDatabase, sql })
export const closeTestDatabase = () => sql.close()
