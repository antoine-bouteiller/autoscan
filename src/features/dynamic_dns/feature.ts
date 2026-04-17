import { defineFeature } from '#core/feature'

import { dynDns } from './services/dns.service.js'

export const dynamicDnsFeature = defineFeature({
  jobs: [{ handler: dynDns, name: 'Dynamic DNS', pattern: '0 */5 * * * *' }],
  name: 'dynamic_dns',
})
