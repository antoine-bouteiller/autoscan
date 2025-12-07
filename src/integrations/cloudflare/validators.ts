import { type } from 'arktype'

export const ipifyResponseValidator = type({
  ip: 'string',
})

export type IpifyResponse = typeof ipifyResponseValidator.infer

export const dnsRecordValidator = type({
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

export const zoneValidator = type({
  id: 'string',
  name: 'string',
})

export const zonesResponseValidator = type({
  result: zoneValidator.array(),
  success: 'boolean',
})

export const errorValidator = type({
  errors: type({
    code: 'number',
    message: 'string',
  }).array(),
  success: 'boolean',
})

export type DnsRecord = typeof dnsRecordValidator.infer
export type DnsRecordsResponse = typeof dnsRecordsResponseValidator.infer
export type ErrorResponse = typeof errorValidator.infer
export type Zone = typeof zoneValidator.infer
export type ZonesResponse = typeof zonesResponseValidator.infer
