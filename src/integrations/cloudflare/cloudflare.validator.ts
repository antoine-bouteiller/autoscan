import { z } from 'zod'

export const ipifyResponseValidator = z.object({
  ip: z.string(),
})

const dnsRecordValidator = z.object({
  content: z.string(),
  id: z.string(),
  name: z.string(),
  ttl: z.number(),
  type: z.string(),
})

export const dnsRecordsResponseValidator = z.object({
  result: z.array(dnsRecordValidator),
  success: z.boolean(),
})

const zoneValidator = z.object({
  id: z.string(),
  name: z.string(),
})

export const zonesResponseValidator = z.object({
  result: z.array(zoneValidator),
  success: z.boolean(),
})

export const cloudflareErrorResponse = z.object({
  errors: z.array(
    z.object({
      code: z.number(),
      message: z.string(),
    })
  ),
  success: z.boolean(),
})

export type DnsRecord = z.infer<typeof dnsRecordValidator>
