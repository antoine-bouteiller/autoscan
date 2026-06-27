import { logger } from '#/config/logger'
import { logError } from '#/shared/utils/error'

interface JobConfig {
  handler: () => Promise<void> | void
  name: string
  pattern: string
}

interface ScheduledJob {
  stop: () => void
}

export class SchedulerProvider {
  private readonly jobs = new Map<string, ScheduledJob>()

  register(config: JobConfig): void {
    const { handler, name, pattern } = config

    if (this.jobs.has(name)) {
      logger.warn(`job "${name}" already exists, skipping...`, 'Scheduler')
      return
    }

    // `Bun.cron` is only available under the Bun runtime. Tests run on Node via
    // Vitest, where scheduled jobs must not fire — register a no-op there.
    if (typeof Bun === 'undefined') {
      this.jobs.set(name, { stop: () => undefined })
      return
    }

    try {
      // In-process schedule (Bun >= 1.3.12) sharing app state, with Bun's no-overlap guarantee; errors are caught so a failing run logs and reschedules.
      const job = Bun.cron(pattern, async () => {
        try {
          await handler()
        } catch (error) {
          logError(error, 'Scheduler')
        }
      })

      this.jobs.set(name, job)
      logger.info(`Registered cron job: ${name} (${pattern})`, 'Scheduler')
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
    for (const [, job] of this.jobs) {
      job.stop()
    }
    logger.info('All cron jobs stopped', 'Scheduler')
  }
}
