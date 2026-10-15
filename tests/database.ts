import { testEnv as env } from '@tests/env'
import { SQL } from 'bun'
import { Layer } from 'effect'

import { Database } from '@/core/runtime.service'
import { migrate } from '@/database/migrator'

export const testSql = new SQL({
  ...(env.POSTGRES_HOST.startsWith('/') ? { path: env.POSTGRES_HOST } : { hostname: env.POSTGRES_HOST }),
  database: env.POSTGRES_DATABASE,
  password: env.POSTGRES_PASSWORD,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USERNAME,
})

await migrate(testSql, './migrations')

type Statement = 'DELETE' | 'INSERT' | 'SELECT' | 'UPDATE'

interface InjectedFailure {
  readonly error: Error
  skip: number
  readonly statement: Statement
}

const failures: InjectedFailure[] = []

const intercepted = new Proxy(testSql, {
  apply: (target, thisArg, args: Parameters<SQL>) => {
    const [strings] = args
    const statement = Array.isArray(strings) ? String(strings[0]).trimStart().split(/\s/u, 1)[0]?.toUpperCase() : undefined
    const failure = failures.find((candidate) => candidate.statement === statement)
    if (failure !== undefined) {
      if (failure.skip === 0) {
        failures.splice(failures.indexOf(failure), 1)
        throw failure.error
      }
      failure.skip -= 1
    }
    return Reflect.apply(target, thisArg, args)
  },
  get: (target, property) => {
    const value: unknown = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

/** Makes the next `statement` issued through `DatabaseTestLayer` throw `error`, after `skip` matching statements succeed. */
export const failNextStatement = (statement: Statement, error: Error, skip = 0) => {
  const failure: InjectedFailure = { error, skip, statement }
  failures.push(failure)
  return () => {
    const index = failures.indexOf(failure)
    if (index !== -1) {
      failures.splice(index, 1)
    }
  }
}

export const DatabaseTestLayer = Layer.succeed(Database, { sql: intercepted })
export const closeTestDatabase = () => testSql.close()
