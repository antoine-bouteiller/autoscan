import { logger } from '@/config/logger'
import { Cron, type CronOptions } from 'croner'

interface JobConfig {
  name: string
  pattern: string
  handler: () => Promise<void> | void
  options?: CronOptions
  enabled?: boolean
}

class SchedulerProvider {
  private jobs = new Map<string, Cron>()

  register(config: JobConfig): Cron | undefined {
    const { enabled = true, handler, name, options = {}, pattern } = config

    if (!enabled) {
      logger.info(`Cron job "${name}" is disabled`)
      return undefined
    }

    const existingJob = this.jobs.get(name)
    if (existingJob) {
      logger.warn(`Cron job "${name}" already exists, skipping...`)
      return existingJob
    }

    try {
      const job = new Cron(
        pattern,
        {
          name,
          timezone: 'Europe/Paris',
          ...options,
        },
        async () => {
          try {
            await handler()
          } catch (error) {
            logger.error({ error, name }, `Cron job "${name}" failed`)
          }
        }
      )

      this.jobs.set(name, job)
      logger.info(`Registered cron job: ${name} (${pattern})`)

      return job
    } catch (error) {
      logger.error({ error, name }, `Failed to register cron job: "${name}"`)
      return undefined
    }
  }

  registerMany(configs: JobConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  stopAll(): void {
    for (const [name, job] of this.jobs) {
      job.stop()
      logger.info(`Stopped cron job: ${name}`)
    }
    logger.info('All cron jobs stopped')
  }
}

let schedulerProvider: SchedulerProvider | undefined

export const getSchedulerProvider = (): SchedulerProvider => {
  if (!schedulerProvider) {
    schedulerProvider = new SchedulerProvider()
  }
  return schedulerProvider
}
