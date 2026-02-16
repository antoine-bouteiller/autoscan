import { Schema } from 'effect'

export const IpifyResponse = Schema.Struct({
  ip: Schema.String,
})

export const DnsRecord = Schema.Struct({
  content: Schema.String,
  id: Schema.String,
  name: Schema.String,
  ttl: Schema.Number,
  type: Schema.String,
})
export type DnsRecord = typeof DnsRecord.Type

export const DnsRecordsResponse = Schema.Struct({
  result: Schema.Array(DnsRecord),
  success: Schema.Boolean,
})

export const ZonesResponse = Schema.Struct({
  result: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    })
  ),
  success: Schema.Boolean,
})
