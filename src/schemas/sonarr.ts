import { Schema } from 'effect'

const Episode = Schema.Struct({
  title: Schema.String,
})

const EpisodeFile = Schema.Struct({
  relativePath: Schema.String,
})

const SeriesPayload = Schema.Struct({
  path: Schema.String,
  title: Schema.String,
  tmdbId: Schema.Union(
    Schema.Number,
    Schema.transform(Schema.String, Schema.Number, {
      decode: Number,
      encode: String,
    })
  ),
})

const SonarrDownload = Schema.Struct({
  episodeFile: EpisodeFile,
  episodes: Schema.Array(Episode),
  eventType: Schema.Literal('Download'),
  series: SeriesPayload,
})

const SonarrEpisodeEvent = Schema.Struct({
  episodeFile: Schema.optional(EpisodeFile),
  eventType: Schema.Union(Schema.Literal('EpisodeFileDelete'), Schema.Literal('Rename')),
  series: SeriesPayload,
})

const SonarrSeriesDelete = Schema.Struct({
  eventType: Schema.Literal('SeriesDelete'),
  series: SeriesPayload,
})

const SonarrTest = Schema.Struct({
  eventType: Schema.Literal('Test'),
})

export const SonarrWebhook = Schema.Union(SonarrDownload, SonarrEpisodeEvent, SonarrSeriesDelete, SonarrTest)
export type SonarrWebhook = typeof SonarrWebhook.Type

export const Series = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
})
export type Series = typeof Series.Type
