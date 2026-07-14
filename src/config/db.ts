import env from '@/config/env'

const initDatabase = async () => {
  const { drizzle } = await import('drizzle-orm/bun-sql')
  const { migrate } = await import('drizzle-orm/bun-sql/migrator')

  const socket = env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }

  const db = drizzle({
    connection: {
      ...socket,
      database: env.POSTGRES_DATABASE,
      password: env.POSTGRES_PASSWORD,
      port: env.POSTGRES_PORT,
      username: env.POSTGRES_USERNAME,
    },
  })
  await migrate(db, { migrationsFolder: './migrations' })
  return db
}

export const db = await initDatabase()
