import { Cron, type CronOptions } from 'croner'

import { handleError, tryCatch } from '@/app/exceptions/handler'
import { logger } from '@/config/logger'

interface JobConfig {
  handler: () => Promise<void> | void
  name: string
  options?: CronOptions
  pattern: string
}

class SchedulerProvider {
  private readonly jobs = new Map<string, Cron>()

  register(config: JobConfig): Cron | undefined {
    const { handler, name, options = {}, pattern } = config

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
          await tryCatch(handler)
        }
      )

      this.jobs.set(name, job)
      logger.info(`Registered cron job: ${name} (${pattern})`)

      return job
    } catch (error) {
      handleError(error)
    }
  }

  registerMany(configs: JobConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  stopAll(): void {
    for (const [, job] of this.jobs) {
      job.stop()
    }
    logger.info('All cron jobs stopped')
  }
}

let schedulerProvider: SchedulerProvider | undefined

export const getSchedulerProvider = (): SchedulerProvider => {
  schedulerProvider ??= new SchedulerProvider()
  return schedulerProvider
}
