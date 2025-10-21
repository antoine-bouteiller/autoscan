import { Cron, type CronOptions } from 'croner'
import type { FastifyInstance } from 'fastify'

interface JobConfig {
  name: string
  pattern: string
  handler: (app: FastifyInstance) => Promise<void>
  options?: CronOptions
  enabled?: boolean
}

export class CronProvider {
  private jobs = new Map<string, Cron>()
  private app: FastifyInstance

  constructor(app: FastifyInstance) {
    this.app = app
  }

  /**
   * Enregistre un nouveau job cron
   */
  register(config: JobConfig): Cron | undefined {
    const { name, pattern, handler, options = {}, enabled = true } = config

    if (!enabled) {
      this.app.log.info(`⏭️  Cron job "${name}" is disabled`)
      return undefined
    }

    // Vérifier si le job existe déjà
    if (this.jobs.has(name)) {
      this.app.log.warn(`⚠️  Cron job "${name}" already exists, skipping...`)
      return this.jobs.get(name)
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
          const startTime = Date.now()
          this.app.log.info(`🚀 Starting cron job: ${name}`)

          try {
            await handler(this.app)
            const duration = Date.now() - startTime
            this.app.log.info(`✅ Cron job "${name}" completed in ${duration}ms`)
          } catch (error) {
            this.app.log.error(`❌ Cron job "${name}" failed:`)
            this.app.log.error(error)
            // Tu peux ajouter ici un système de notification (Slack, email, etc.)
          }
        }
      )

      this.jobs.set(name, job)
      this.app.log.info(`📅 Registered cron job: ${name} (${pattern})`)

      return job
    } catch (error) {
      this.app.log.error(`Failed to register cron job "${name}":`)
      this.app.log.error(error)
      return undefined
    }
  }

  /**
   * Enregistre plusieurs jobs en une fois
   */
  registerMany(configs: JobConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  /**
   * Arrête un job spécifique
   */
  stop(name: string): boolean {
    const job = this.jobs.get(name)
    if (job) {
      job.stop()
      this.app.log.info(`⏸️  Stopped cron job: ${name}`)
      return true
    }
    return false
  }

  /**
   * Démarre un job qui était arrêté
   */
  resume(name: string): boolean {
    const job = this.jobs.get(name)
    if (job) {
      job.resume()
      this.app.log.info(`▶️  Resumed cron job: ${name}`)
      return true
    }
    return false
  }

  /**
   * Exécute un job immédiatement (hors planning)
   */
  trigger(name: string): boolean {
    const job = this.jobs.get(name)
    if (job) {
      this.app.log.info(`⚡ Manually triggering cron job: ${name}`)
      job.trigger()
      return true
    }
    return false
  }

  /**
   * Liste tous les jobs enregistrés
   */
  list(): { name: string; pattern: string; running: boolean; nextRun: Date | null }[] {
    return [...this.jobs.entries()].map(([name, job]) => ({
      name,
      nextRun: job.nextRun(),
      pattern: job.getPattern() || 'unknown',
      running: job.isRunning(),
    }))
  }

  /**
   * Arrête tous les jobs
   */
  stopAll(): void {
    for (const [name, job] of this.jobs) {
      job.stop()
      this.app.log.info(`⏹️  Stopped cron job: ${name}`)
    }
    this.app.log.info('🛑 All cron jobs stopped')
  }

  /**
   * Nettoie et supprime tous les jobs
   */
  destroy(): void {
    this.stopAll()
    this.jobs.clear()
  }
}
