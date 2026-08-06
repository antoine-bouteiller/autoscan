import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

export const NumberFromUnknown = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Finite, {
    decode: SchemaGetter.transformOrFail((value) =>
      Effect.try({
        catch: () => new SchemaIssue.InvalidValue({ message: 'Expected a number' }),
        try: () => Number(value),
      })
    ),
    encode: SchemaGetter.transform(Number),
  })
)

export const formatSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1()
