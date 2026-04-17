import { container, TOKENS } from '#core/container'
import { type SchedulerProvider } from '#providers/scheduler/scheduler.provider'

import { dynDns } from './services/dns.service.js'

export const registerDynamicDns = () => {
  const scheduler = container.resolve<SchedulerProvider>(TOKENS.SCHEDULER_PROVIDER)

  scheduler.register({
    handler: dynDns,
    name: 'Dynamic DNS',
    pattern: '0 */5 * * * *',
  })
}
