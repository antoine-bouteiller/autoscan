import * as v from 'valibot'

export const ipifyResponseValidator = v.object({
  ip: v.string(),
})

const dnsRecordValidator = v.object({
  content: v.string(),
  id: v.string(),
  name: v.string(),
  ttl: v.number(),
  type: v.string(),
})

export const dnsRecordsResponseValidator = v.object({
  result: v.array(dnsRecordValidator),
  success: v.boolean(),
})

const zoneValidator = v.object({
  id: v.string(),
  name: v.string(),
})

export const zonesResponseValidator = v.object({
  result: v.array(zoneValidator),
  success: v.boolean(),
})

export const cloudflareErrorResponse = v.object({
  errors: v.array(
    v.object({
      code: v.number(),
      message: v.string(),
    })
  ),
  success: v.boolean(),
})

export type DnsRecord = v.InferOutput<typeof dnsRecordValidator>
