import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { type TestProject } from 'vite-plus/test/node'

let container: StartedPostgreSqlContainer | undefined

// Spin up a single throwaway Postgres container shared by the whole test run and expose its connection string to the workers via `inject('databaseUrl')` (consumed in tests/env.ts).
export const setup = async ({ provide }: TestProject): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start()
  provide('POSTGRES_HOST', container.getHost())
  provide('POSTGRES_PASSWORD', container.getPassword())
  provide('POSTGRES_PORT', container.getPort())
  provide('POSTGRES_USERNAME', container.getUsername())
  provide('POSTGRES_DATABASE', container.getDatabase())
}

export const teardown = async (): Promise<void> => {
  await container?.stop()
}

declare module 'vite-plus/test' {
  interface ProvidedContext {
    POSTGRES_HOST: string
    POSTGRES_PASSWORD: string
    POSTGRES_PORT: number
    POSTGRES_USERNAME: string
    POSTGRES_DATABASE: string
  }
}
