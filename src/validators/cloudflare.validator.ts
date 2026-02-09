import { type } from 'arktype'

export const ipifyResponseValidator = type({
  ip: 'string',
})

const dnsRecordValidator = type({
  content: 'string',
  id: 'string',
  name: 'string',
  ttl: 'number',
  type: 'string',
})

export const dnsRecordsResponseValidator = type({
  result: dnsRecordValidator.array(),
  success: 'boolean',
})

const zoneValidator = type({
  id: 'string',
  name: 'string',
})

export const zonesResponseValidator = type({
  result: zoneValidator.array(),
  success: 'boolean',
})

export const cloudflareErrorResponse = type({
  errors: type({
    code: 'number',
    message: 'string',
  }).array(),
  success: 'boolean',
})

export type DnsRecord = typeof dnsRecordValidator.infer
