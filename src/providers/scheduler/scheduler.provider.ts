import { Cron, type CronOptions } from 'croner'

import { logger } from '#config/logger'
import { logError } from '#shared/utils/error'

interface JobConfig {
  handler: () => Promise<void> | void
  name: string
  options?: CronOptions
  pattern: string
}

export class SchedulerProvider {
  private readonly jobs = new Map<string, Cron>()

  register(config: JobConfig): Cron | undefined {
    const { handler, name, options = {}, pattern } = config

    const existingJob = this.jobs.get(name)
    if (existingJob) {
      logger.warn(`job "${name}" already exists, skipping...`, 'Scheduler')
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
        handler
      )

      this.jobs.set(name, job)
      logger.info(`Registered cron job: ${name} (${pattern})`, 'Scheduler')

      return job
    } catch (error) {
      logError(error, 'Scheduler')
    }

    return undefined
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
    logger.info('All cron jobs stopped', 'Scheduler')
  }
}
