import { type Effect } from 'effect'

import { logger } from '@/config/logger'
import { type AppRequirements } from '@/core/runtime.service'
import { logError } from '@/shared/utils/error'

interface JobConfig {
  handler: Effect.Effect<void, unknown, AppRequirements>
  name: string
  pattern: string
}

interface ScheduledJob {
  stop: () => void
}

interface SchedulerProviderOptions {
  cron?: (pattern: string, handler: () => Promise<void>) => ScheduledJob
  runPromise: <Success, Error>(effect: Effect.Effect<Success, Error, AppRequirements>) => Promise<Success>
}

export class SchedulerProvider {
  private accepting = true
  private readonly cron: NonNullable<SchedulerProviderOptions['cron']>
  private readonly jobs = new Map<string, ScheduledJob>()
  private readonly runPromise: SchedulerProviderOptions['runPromise']

  constructor(options: SchedulerProviderOptions) {
    this.cron = options.cron ?? ((pattern, handler) => Bun.cron(pattern, handler))
    this.runPromise = options.runPromise
  }

  register(config: JobConfig): void {
    if (!this.accepting) {
      logger.warn(`scheduler is stopped, skipping job "${config.name}"`, 'Scheduler')
      return
    }
    if (this.jobs.has(config.name)) {
      logger.warn(`job "${config.name}" already exists, skipping...`, 'Scheduler')
      return
    }

    try {
      const job = this.cron(config.pattern, async () => {
        if (!this.accepting) {
          return
        }
        try {
          await this.runPromise(config.handler)
        } catch (error) {
          logError(error, 'Scheduler')
        }
      })
      this.jobs.set(config.name, job)
      logger.info(`Registered cron job: ${config.name} (${config.pattern})`, 'Scheduler')
    } catch (error) {
      logError(error, 'Scheduler')
    }
  }

  registerMany(configs: JobConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  stopAll(): void {
    this.accepting = false
    for (const job of this.jobs.values()) {
      try {
        job.stop()
      } catch (error) {
        logError(error, 'Scheduler')
      }
    }
    logger.info('All cron jobs stopped', 'Scheduler')
  }
}
