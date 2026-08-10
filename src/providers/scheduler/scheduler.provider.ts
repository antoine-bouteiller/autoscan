import { type Effect } from 'effect'

import { nativeLogger } from '@/config/logger'
import { type AppRequirements } from '@/core/runtime.service'

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
      nativeLogger.warn(`scheduler is stopped, skipping job "${config.name}"`, 'Scheduler')
      return
    }
    if (this.jobs.has(config.name)) {
      nativeLogger.warn(`job "${config.name}" already exists, skipping...`, 'Scheduler')
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
          nativeLogger.error(error, 'Scheduler')
        }
      })
      this.jobs.set(config.name, job)
      nativeLogger.info(`Registered cron job: ${config.name} (${config.pattern})`, 'Scheduler')
    } catch (error) {
      nativeLogger.error(error, 'Scheduler')
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
        nativeLogger.error(error, 'Scheduler')
      }
    }
    nativeLogger.info('All cron jobs stopped', 'Scheduler')
  }
}
